import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import {
  buildWeightTicketImageStorageKey,
  encodeStoredWeightTicketImageReference,
  identifySupabaseProjectRef,
  isKnownWeightTicketImageMockReference,
  parseWeightTicketImageReference,
  sanitizedOwnerToken,
  writeRollbackManifest,
} from './weight-ticket-image-assets.mjs'

const { Pool } = pg
const APPLY = process.argv.includes('--apply')
const REMOVE_INVALID_MOCKS = process.argv.includes('--remove-invalid-mocks')
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

async function resolveBucket(pool) {
  const setting = await pool.query(`
    select nullif(trim(value), '') as value
    from public.system_settings
    where key = 'WEIGHT_TICKET_IMAGE_BUCKET'
    limit 1
  `)
  if (setting.rows[0]?.value) return { name: setting.rows[0].value, source: 'system_settings' }
  if (process.env.WEIGHT_TICKET_IMAGE_BUCKET?.trim()) {
    return { name: process.env.WEIGHT_TICKET_IMAGE_BUCKET.trim(), source: 'environment' }
  }
  throw new Error('Missing configured weight-ticket bucket')
}

function collect(rows, ownerType, report, invalidMocks) {
  const candidates = []
  for (const row of rows) {
    const references = ownerType === 'vehicle' ? row.vehicle_image_names : row.image_names
    for (const [imageIndex, rawValue] of (references ?? []).entries()) {
      report.references.total += 1
      report.references[ownerType] += 1
      const parsed = parseWeightTicketImageReference(rawValue)
      if (parsed.kind === 'dataUrl') {
        report.references.dataUrl += 1
        report.references[`${parsed.source}DataUrl`] += 1
        candidates.push({ imageIndex, ownerType, parsed, rawValue, row })
      } else if (parsed.kind === 'invalid') {
        report.references.invalid += 1
        const knownInvalidMock = isKnownWeightTicketImageMockReference(rawValue)
        if (knownInvalidMock) {
          report.references.knownInvalidMock += 1
          invalidMocks.push({ imageIndex, ownerType, rawValue, row })
        }
        if (!knownInvalidMock && report.errors.length < 25) {
          report.errors.push({
            code: parsed.reason,
            owner: sanitizedOwnerToken(`${ownerType}:${row.id}:${imageIndex}`),
          })
        }
      } else {
        report.references[parsed.kind] += 1
      }
    }
  }
  return candidates
}

async function candidateValues(candidate, bucket, supabase) {
  const owner = candidate.ownerType === 'vehicle'
    ? 'vehicle'
    : `line-${String(candidate.row.line_no).padStart(3, '0')}`
  const storageKey = buildWeightTicketImageStorageKey({
    bytes: candidate.parsed.bytes,
    documentNo: candidate.row.doc_no,
    extension: candidate.parsed.extension,
    imageIndex: candidate.imageIndex,
    owner,
  })
  const fileName = candidate.parsed.fileName
    || `${owner}-${String(candidate.imageIndex + 1).padStart(3, '0')}.${candidate.parsed.extension}`
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storageKey, 60 * 60 * 24 * 365)
  if (error || !data?.signedUrl) throw Object.assign(new Error('Unable to create signed image URL'), { code: 'signedUrlFailed' })
  const replacement = encodeStoredWeightTicketImageReference(fileName, storageKey, data.signedUrl, bucket)
  return { fileName, replacement, storageKey, url: data.signedUrl }
}

async function uploadOrVerify(supabase, bucket, candidate, storageKey) {
  const storage = supabase.storage.from(bucket)
  const { error } = await storage.upload(storageKey, candidate.parsed.bytes, {
    cacheControl: '31536000',
    contentType: candidate.parsed.mimeType,
    upsert: false,
  })
  if (!error) return 'uploaded'

  const existing = await storage.download(storageKey)
  if (existing.error || !existing.data) throw Object.assign(new Error('Storage upload failed'), { code: 'uploadFailed' })
  const existingBytes = Buffer.from(await existing.data.arrayBuffer())
  if (!existingBytes.equals(candidate.parsed.bytes)) {
    throw Object.assign(new Error('Existing immutable object does not match'), { code: 'existingObjectMismatch' })
  }
  return 'reused'
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

async function removeKnownInvalidMock(pool, candidate) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const position = candidate.imageIndex + 1
    const result = candidate.ownerType === 'vehicle'
      ? await client.query(`
          with target as (
            select source.id,
              coalesce(
                array_agg(image.value order by image.ordinality)
                  filter (where image.ordinality <> $2),
                '{}'::text[]
              ) as names
            from public.weight_tickets source
            cross join lateral unnest(source.vehicle_image_names) with ordinality as image(value, ordinality)
            where source.id = $1 and source.vehicle_image_names[$2] = $3
            group by source.id
          )
          update public.weight_tickets ticket
          set vehicle_image_names = target.names,
              vehicle_image_count = cardinality(target.names),
              image_count = cardinality(target.names) + coalesce((
                select sum(line.image_count)
                from public.weight_ticket_lines line
                where line.weight_ticket_id = ticket.id
              ), 0)::integer
          from target
          where ticket.id = target.id
          returning ticket.id
        `, [candidate.row.id, position, candidate.rawValue])
      : await client.query(`
          with target as (
            select source.id,
              source.weight_ticket_id,
              coalesce(
                array_agg(image.value order by image.ordinality)
                  filter (where image.ordinality <> $2),
                '{}'::text[]
              ) as names
            from public.weight_ticket_lines source
            cross join lateral unnest(source.image_names) with ordinality as image(value, ordinality)
            where source.id = $1 and source.image_names[$2] = $3
            group by source.id, source.weight_ticket_id
          )
          update public.weight_ticket_lines line
          set image_names = target.names,
              image_count = cardinality(target.names)
          from target
          where line.id = target.id
          returning line.weight_ticket_id
        `, [candidate.row.id, position, candidate.rawValue])

    if (result.rowCount !== 1) {
      await client.query('rollback')
      return false
    }
    if (candidate.ownerType === 'line') {
      await client.query(`
        update public.weight_tickets ticket
        set image_count = cardinality(ticket.vehicle_image_names) + coalesce((
          select sum(line.image_count)
          from public.weight_ticket_lines line
          where line.weight_ticket_id = ticket.id
        ), 0)::integer
        where ticket.id = $1
      `, [result.rows[0].weight_ticket_id])
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
  if (REMOVE_INVALID_MOCKS && !APPLY) {
    throw new Error('--remove-invalid-mocks requires --apply and an external rollback manifest')
  }
  const databaseUrl = requiredEnv('DATABASE_URL')
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const projectRef = identifySupabaseProjectRef(supabaseUrl, databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    const bucket = await resolveBucket(pool)
    const [bucketResult, ticketResult, lineResult] = await Promise.all([
      pool.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [bucket.name]),
      pool.query(`select id, doc_no, vehicle_image_names from public.weight_tickets order by id asc`),
      pool.query(`
        select line.id, line.line_no, line.image_names, ticket.doc_no
        from public.weight_ticket_lines line
        join public.weight_tickets ticket on ticket.id = line.weight_ticket_id
        order by line.id asc
      `),
    ])
    const config = bucketResult.rows[0]
    const report = {
      mode: APPLY ? 'apply' : 'dry-run',
      projectRef,
      bucket: {
        allowedMimeTypes: config?.allowed_mime_types ?? null,
        configured: Boolean(config),
        fileSizeLimit: config?.file_size_limit ?? null,
        name: bucket.name,
        public: config?.public ?? null,
        source: bucket.source,
      },
      rows: { lines: lineResult.rows.length, tickets: ticketResult.rows.length },
      references: {
        dataUrl: 0,
        empty: 0,
        filenameOnly: 0,
        invalid: 0,
        jsonDataUrl: 0,
        knownInvalidMock: 0,
        legacyUrl: 0,
        pipeDataUrl: 0,
        publicUrl: 0,
        rawDataUrl: 0,
        storageKey: 0,
        total: 0,
        vehicle: 0,
        line: 0,
      },
      results: {
        casConflicts: 0,
        failed: 0,
        migrated: 0,
        mockRemovalCasConflicts: 0,
        orphanedUploads: 0,
        planned: 0,
        plannedMockRemovals: 0,
        removedInvalidMocks: 0,
        reused: 0,
        uploaded: 0,
      },
      errors: [],
      rollbackManifestWritten: false,
    }
    const invalidMocks = []
    const candidates = [
      ...collect(ticketResult.rows, 'vehicle', report, invalidMocks),
      ...collect(lineResult.rows, 'line', report, invalidMocks),
    ]
    report.results.planned = candidates.length
    report.results.plannedMockRemovals = invalidMocks.length

    if (!config) report.errors.push({ code: 'bucketNotConfigured' })
    if (!APPLY && report.references.invalid) process.exitCode = 2

    if (APPLY) {
      if (!config || config.public) throw new Error('Configured weight-ticket image bucket must exist and be private before --apply')
      const unsupportedInvalidCount = report.references.invalid - report.references.knownInvalidMock
      if (unsupportedInvalidCount > 0) throw new Error('Unsupported invalid image references must be resolved before --apply')
      if (invalidMocks.length > 0 && !REMOVE_INVALID_MOCKS) {
        throw new Error('Known invalid mock references require explicit --remove-invalid-mocks')
      }
      const supabase = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const plans = []
      for (const candidate of candidates) {
        plans.push({
          candidate,
          values: await candidateValues(candidate, bucket.name, supabase),
        })
      }
      const manifest = {
        createdAt: new Date().toISOString(),
        projectRef,
        bucket: bucket.name,
        entries: [
          ...plans.map(({ candidate, values }) => ({
            action: 'migrate',
            imageIndex: candidate.imageIndex,
            ownerType: candidate.ownerType,
            originalValue: candidate.rawValue,
            replacement: values.replacement,
            rowId: candidate.row.id,
            status: 'planned',
            storageKey: values.storageKey,
          })),
          ...invalidMocks.map((candidate) => ({
            action: 'removeKnownInvalidMock',
            imageIndex: candidate.imageIndex,
            ownerType: candidate.ownerType,
            originalValue: candidate.rawValue,
            rowId: candidate.row.id,
            status: 'planned',
          })),
        ],
      }
      await writeRollbackManifest(manifestPath, manifest, { initial: true })
      report.rollbackManifestWritten = true

      for (const [candidateIndex, { candidate, values }] of plans.entries()) {
        let uploadResult = null
        try {
          uploadResult = await uploadOrVerify(supabase, bucket.name, candidate, values.storageKey)
          report.results[uploadResult] += 1
          const swapped = await compareAndSwap(pool, candidate, values.replacement)
          if (!swapped) {
            report.results.casConflicts += 1
            if (uploadResult === 'uploaded') report.results.orphanedUploads += 1
            manifest.entries[candidateIndex].status = 'casConflict'
          } else {
            report.results.migrated += 1
            manifest.entries[candidateIndex].status = 'migrated'
          }
        } catch (error) {
          report.results.failed += 1
          if (uploadResult === 'uploaded') report.results.orphanedUploads += 1
          const code = typeof error?.code === 'string' ? error.code : 'migrationFailed'
          report.errors.push({ code, owner: sanitizedOwnerToken(`${candidate.ownerType}:${candidate.row.id}:${candidate.imageIndex}`) })
          manifest.entries[candidateIndex].status = code
        }
        await writeRollbackManifest(manifestPath, manifest)
      }

      const removalPlans = invalidMocks
        .map((candidate, index) => ({ candidate, manifestIndex: plans.length + index }))
        .sort((left, right) => {
          const leftOwner = `${left.candidate.ownerType}:${left.candidate.row.id}`
          const rightOwner = `${right.candidate.ownerType}:${right.candidate.row.id}`
          return leftOwner === rightOwner
            ? right.candidate.imageIndex - left.candidate.imageIndex
            : leftOwner.localeCompare(rightOwner)
        })
      for (const { candidate, manifestIndex } of removalPlans) {
        try {
          const removed = await removeKnownInvalidMock(pool, candidate)
          if (removed) {
            report.results.removedInvalidMocks += 1
            manifest.entries[manifestIndex].status = 'removed'
          } else {
            report.results.mockRemovalCasConflicts += 1
            manifest.entries[manifestIndex].status = 'casConflict'
          }
        } catch (error) {
          report.results.failed += 1
          const code = typeof error?.code === 'string' ? error.code : 'mockRemovalFailed'
          report.errors.push({ code, owner: sanitizedOwnerToken(`${candidate.ownerType}:${candidate.row.id}:${candidate.imageIndex}`) })
          manifest.entries[manifestIndex].status = code
        }
        await writeRollbackManifest(manifestPath, manifest)
      }
      if (report.results.failed || report.results.casConflicts || report.results.mockRemovalCasConflicts) process.exitCode = 2
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
