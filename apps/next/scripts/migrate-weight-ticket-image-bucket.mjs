import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import {
  encodeStoredWeightTicketImageReference,
  identifySupabaseProjectRef,
  parseWeightTicketImageReference,
  sanitizedOwnerToken,
  writeRollbackManifest,
} from './weight-ticket-image-assets.mjs'

const { Pool } = pg
const APPLY = process.argv.includes('--apply')
const manifestArgument = process.argv.find((value) => value.startsWith('--manifest='))?.slice('--manifest='.length)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)\S+/gi, '<redacted-url>')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '<redacted-token>')
}

function resolveManifestPath() {
  if (!manifestArgument) {
    if (APPLY) throw new Error('--apply requires --manifest=<absolute path outside the repository>')
    return null
  }
  if (!path.isAbsolute(manifestArgument)) throw new Error('Rollback manifest path must be absolute')
  const resolved = path.resolve(manifestArgument)
  const relative = path.relative(repoRoot, resolved)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Rollback manifest path must be outside the repository')
  }
  return resolved
}

async function resolveBucket(pool, settingKey, environmentKey) {
  const setting = await pool.query(`
    select nullif(trim(value), '') as value
    from public.system_settings
    where key = $1
    limit 1
  `, [settingKey])
  if (setting.rows[0]?.value) return { name: setting.rows[0].value, source: 'system_settings' }
  if (process.env[environmentKey]?.trim()) return { name: process.env[environmentKey].trim(), source: 'environment' }
  throw new Error(`Missing configured bucket: ${settingKey}`)
}

function referenceBucket(rawValue, sourceBucket) {
  if (typeof rawValue !== 'string' || !rawValue.trim().startsWith('{')) return sourceBucket
  try {
    const parsed = JSON.parse(rawValue)
    return typeof parsed?.bucket === 'string' && parsed.bucket.trim() ? parsed.bucket.trim() : sourceBucket
  } catch {
    return sourceBucket
  }
}

function collect(rows, ownerType, sourceBucket, targetBucket) {
  const candidates = []
  const skipped = []
  for (const row of rows) {
    const references = ownerType === 'vehicle' ? row.vehicle_image_names : row.image_names
    for (const [imageIndex, rawValue] of (references ?? []).entries()) {
      const parsed = parseWeightTicketImageReference(rawValue)
      if (parsed.kind !== 'storageKey') {
        if (parsed.kind !== 'empty') skipped.push({ code: parsed.kind, owner: sanitizedOwnerToken(`${ownerType}:${row.id}:${imageIndex}`) })
        continue
      }
      const currentBucket = referenceBucket(rawValue, sourceBucket)
      if (currentBucket === targetBucket) continue
      if (currentBucket !== sourceBucket) {
        skipped.push({ code: 'unexpectedBucket', owner: sanitizedOwnerToken(`${ownerType}:${row.id}:${imageIndex}`) })
        continue
      }
      candidates.push({ imageIndex, ownerType, parsed, rawValue, row, sourceBucket: currentBucket })
    }
  }
  return { candidates, skipped }
}

function contentTypeFor(fileName) {
  const extension = fileName.toLowerCase().split('.').pop()
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

async function copyObject(supabase, candidate, targetBucket) {
  const source = supabase.storage.from(candidate.sourceBucket)
  const target = supabase.storage.from(targetBucket)
  const downloaded = await source.download(candidate.parsed.storageKey)
  if (downloaded.error || !downloaded.data) {
    throw Object.assign(new Error(`Source image download failed: ${downloaded.error?.message ?? 'missing object'}`), { code: 'sourceDownloadFailed' })
  }
  const bytes = Buffer.from(await downloaded.data.arrayBuffer())
  const uploaded = await target.upload(candidate.parsed.storageKey, bytes, {
    cacheControl: '31536000',
    contentType: contentTypeFor(candidate.parsed.storageKey),
    upsert: false,
  })
  if (uploaded.error) {
    const existing = await target.download(candidate.parsed.storageKey)
    if (existing.error || !existing.data) {
      throw Object.assign(new Error(`Target image upload failed: ${uploaded.error.message}`), { code: 'targetUploadFailed' })
    }
    const existingBytes = Buffer.from(await existing.data.arrayBuffer())
    if (!existingBytes.equals(bytes)) {
      throw Object.assign(new Error('Existing target object does not match source'), { code: 'targetObjectMismatch' })
    }
  }
  const fileName = candidate.parsed.fileName || path.basename(candidate.parsed.storageKey)
  return {
    fileName,
    replacement: encodeStoredWeightTicketImageReference(fileName, candidate.parsed.storageKey, undefined, targetBucket),
    storageKey: candidate.parsed.storageKey,
  }
}

async function compareAndSwap(pool, candidate, replacement) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const position = candidate.imageIndex + 1
    const result = candidate.ownerType === 'vehicle'
      ? await client.query(`
          update public.weight_tickets
          set vehicle_image_names[$2] = $3
          where id = $1 and vehicle_image_names[$2] = $4
          returning id
        `, [candidate.row.id, position, replacement, candidate.rawValue])
      : await client.query(`
          update public.weight_ticket_lines
          set image_names[$2] = $3
          where id = $1 and image_names[$2] = $4
          returning id
        `, [candidate.row.id, position, replacement, candidate.rawValue])
    if (result.rowCount !== 1) {
      await client.query('rollback')
      return false
    }
    await client.query('commit')
    return true
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  const manifestPath = resolveManifestPath()
  const databaseUrl = requiredEnv('DATABASE_URL')
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const projectRef = identifySupabaseProjectRef(supabaseUrl, databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    const sourceBucket = await resolveBucket(pool, 'WEIGHT_TICKET_PDF_BUCKET', 'WEIGHT_TICKET_PDF_BUCKET')
    const targetBucket = await resolveBucket(pool, 'WEIGHT_TICKET_IMAGE_BUCKET', 'WEIGHT_TICKET_IMAGE_BUCKET')
    if (sourceBucket.name === targetBucket.name) throw new Error('Source and target image buckets must be different')

    const [sourceConfig, targetConfig, ticketResult, lineResult] = await Promise.all([
      pool.query(`select public from storage.buckets where id = $1`, [sourceBucket.name]),
      pool.query(`select public from storage.buckets where id = $1`, [targetBucket.name]),
      pool.query(`select id, doc_no, vehicle_image_names from public.weight_tickets order by id asc`),
      pool.query(`
        select line.id, line.line_no, line.image_names, ticket.doc_no
        from public.weight_ticket_lines line
        join public.weight_tickets ticket on ticket.id = line.weight_ticket_id
        order by line.id asc
      `),
    ])
    const collected = [
      collect(ticketResult.rows, 'vehicle', sourceBucket.name, targetBucket.name),
      collect(lineResult.rows, 'line', sourceBucket.name, targetBucket.name),
    ]
    const candidates = collected.flatMap((value) => value.candidates)
    const skipped = collected.flatMap((value) => value.skipped)
    const report = {
      mode: APPLY ? 'apply' : 'dry-run',
      projectRef,
      sourceBucket: { name: sourceBucket.name, public: sourceConfig.rows[0]?.public ?? null, source: sourceBucket.source },
      targetBucket: { name: targetBucket.name, public: targetConfig.rows[0]?.public ?? null, source: targetBucket.source },
      rows: { lines: lineResult.rows.length, tickets: ticketResult.rows.length },
      planned: candidates.length,
      skipped,
      results: { casConflicts: 0, failed: 0, migrated: 0, orphanedCopies: 0 },
      errors: [],
      rollbackManifestWritten: false,
    }

    if (!sourceConfig.rows[0] || !sourceConfig.rows[0].public) report.errors.push({ code: 'sourceBucketMustBePublic' })
    if (!targetConfig.rows[0] || targetConfig.rows[0].public) report.errors.push({ code: 'targetBucketMustBePrivate' })
    if (!APPLY && report.errors.length > 0) process.exitCode = 2

    if (APPLY) {
      if (report.errors.length > 0) throw new Error('Storage bucket privacy preflight failed')
      const supabase = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const manifest = {
        createdAt: new Date().toISOString(),
        projectRef,
        sourceBucket: sourceBucket.name,
        targetBucket: targetBucket.name,
        entries: candidates.map((candidate) => ({
          imageIndex: candidate.imageIndex,
          ownerType: candidate.ownerType,
          originalValue: candidate.rawValue,
          rowId: candidate.row.id,
          sourceBucket: candidate.sourceBucket,
          status: 'planned',
          storageKey: candidate.parsed.storageKey,
        })),
      }
      await writeRollbackManifest(manifestPath, manifest, { initial: true })
      report.rollbackManifestWritten = true

      for (const [index, candidate] of candidates.entries()) {
        let copied = false
        try {
          const values = await copyObject(supabase, candidate, targetBucket.name)
          copied = true
          const swapped = await compareAndSwap(pool, candidate, values.replacement)
          if (!swapped) {
            report.results.casConflicts += 1
            if (copied) report.results.orphanedCopies += 1
            manifest.entries[index].status = 'casConflict'
          } else {
            report.results.migrated += 1
            manifest.entries[index].replacement = values.replacement
            manifest.entries[index].status = 'migrated'
          }
        } catch (error) {
          report.results.failed += 1
          if (copied) report.results.orphanedCopies += 1
          const code = typeof error?.code === 'string' ? error.code : 'migrationFailed'
          report.errors.push({ code, owner: sanitizedOwnerToken(`${candidate.ownerType}:${candidate.row.id}:${candidate.imageIndex}`) })
          manifest.entries[index].status = code
        }
        await writeRollbackManifest(manifestPath, manifest)
      }
      if (report.results.failed || report.results.casConflicts) process.exitCode = 2
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: safeError(error) }))
  process.exitCode = 1
})
