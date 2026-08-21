// Repair script: for every WTI/WTO image reference that lacks thumbnailStorageKey,
// download the original, generate a thumbnail matching the current pipeline
// (webp quality 90, max dimension 960), upload it, create the asset ledger row,
// and update the stored reference to include thumbnailStorageKey.
//
// Usage: node scripts/repair-weight-ticket-image-thumbnails.mjs [--apply --expected-project-ref=<ref>]
// Default is dry-run (reports what would change, changes nothing).

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const sharp = require('sharp')

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { identifySupabaseProjectRef } from './weight-ticket-image-assets.mjs'
const envCandidates = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
]
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    // An explicit operator environment must win over a local file. This is
    // especially important for --apply because this script mutates DB/Storage.
    loadEnv({ path: envPath, override: false })
    break
  }
}
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const { Pool } = pg
const APPLY = process.argv.includes('--apply')
const BUCKET_SETTING_KEY = 'WEIGHT_TICKET_IMAGE_BUCKET'
const THUMBNAIL_MAX_DIMENSION = 960
const THUMBNAIL_WEBP_QUALITY = 90
const WEBP_EFFORT = 5

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

function expectedProjectRef() {
  const argument = process.argv.find((value) => value.startsWith('--expected-project-ref='))
  return argument?.slice('--expected-project-ref='.length).trim() || null
}

function assertApplyTarget(projectRef) {
  if (!APPLY) return
  const expected = expectedProjectRef()
  if (!expected || !/^[a-z0-9]+$/i.test(expected)) {
    throw new Error('--apply requires --expected-project-ref=<Supabase project ref>')
  }
  if (expected !== projectRef) {
    throw new Error(`refusing --apply: expected project ${expected}, resolved project ${projectRef}`)
  }
}

function decodeReference(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.fileName !== 'string' || typeof parsed.bucket !== 'string' || typeof parsed.storageKey !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function printKeyFor(storageKey) {
  const base = storageKey.replace(/\.[^./]+$/, '')
  return base + '.print.jpg'
}

// Matches the attachments route: attachments/pending/YYYY-MM-DD/{uuid}.ext
// thumbnail key = original key with extension replaced by .thumb.webp
function thumbnailKeyFor(storageKey) {
  const base = storageKey.replace(/\.[^./]+$/, '')
  return `${base}.thumb.webp`
}

async function main() {
  const databaseUrl = requiredEnv('DATABASE_URL')
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const projectRef = identifySupabaseProjectRef(supabaseUrl, databaseUrl)
  assertApplyTarget(projectRef)
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    max: 1,
    idleTimeoutMillis: 10000,
  })
  const supabase = createClient(
    supabaseUrl,
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  try {
    const bucketResult = await pool.query(
      `select nullif(trim(value), '') as value from public.system_settings where key = $1 limit 1`,
      [BUCKET_SETTING_KEY],
    )
    const bucket = bucketResult.rows[0]?.value
    if (!bucket) throw new Error(`Missing configured ${BUCKET_SETTING_KEY}`)

    // Collect every legacy reference across tickets and lines.
    const tickets = await pool.query(
      `select id, doc_no, created_by, vehicle_image_names from public.weight_tickets order by id asc`,
    )
    const lines = await pool.query(
      `select l.id, l.weight_ticket_id, wt.doc_no, wt.created_by, l.image_names
       from public.weight_ticket_lines l
       join public.weight_tickets wt on wt.id = l.weight_ticket_id
       order by l.id asc`,
    )

    const candidates = [] // { table, rowId, docNo, createdBy, index, parsed, rawValue }
    for (const ticket of tickets.rows) {
      for (const [index, rawValue] of (ticket.vehicle_image_names ?? []).entries()) {
        const parsed = decodeReference(rawValue)
        if (parsed && parsed.bucket === bucket && !parsed.thumbnailStorageKey) {
          candidates.push({
            column: 'vehicle_image_names',
            createdBy: ticket.created_by,
            docNo: ticket.doc_no,
            index,
            parsed,
            rawValue,
            rowId: ticket.id,
            table: 'weight_tickets',
          })
        }
      }
    }
    for (const line of lines.rows) {
      for (const [index, rawValue] of (line.image_names ?? []).entries()) {
        const parsed = decodeReference(rawValue)
        if (parsed && parsed.bucket === bucket && !parsed.thumbnailStorageKey) {
          candidates.push({
            column: 'image_names',
            createdBy: line.created_by,
            docNo: line.doc_no,
            index,
            parsed,
            rawValue,
            rowId: line.id,
            table: 'weight_ticket_lines',
          })
        }
      }
    }

    console.log(JSON.stringify({
      apply: APPLY,
      bucket,
      projectRef,
      legacyReferences: candidates.length,
    }, null, 2))

    const uniqueKeys = [...new Set(candidates.map((c) => c.parsed.storageKey))]
    const ledger = await pool.query(
      `select original_storage_key, thumbnail_status from public.weight_ticket_image_assets where bucket = $1 and original_storage_key = any($2)`,
      [bucket, uniqueKeys],
    )
    const ledgerByKey = new Map(ledger.rows.map((r) => [r.original_storage_key, r.thumbnail_status]))

    const report = { apply: APPLY, created: 0, updatedReferences: 0, alreadyReady: 0, errors: [] }

    // Process each unique original once; apply reference updates per row afterward.
    for (const candidate of candidates) {
      try {
        const { storageKey } = candidate.parsed
        const thumbnailKey = thumbnailKeyFor(storageKey)
        const existingStatus = ledgerByKey.get(storageKey)

        if (existingStatus === 'ready') {
          report.alreadyReady += 1
        } else {
          // Download + generate thumbnail (only when missing or not ready).
          const { data, error } = await supabase.storage.from(bucket).download(storageKey)
          if (error || !data) throw new Error(`download failed: ${error?.message ?? 'object not found'}`)
          const bytes = Buffer.from(await data.arrayBuffer())
          const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
          const width = metadata.width
          const height = metadata.height
          const sourcePixels = width && height ? width * height : 0
          if (!width || !height || !Number.isSafeInteger(sourcePixels) || sourcePixels > 40_000_000) {
            throw new Error(`source too large (${sourcePixels} px)`)
          }
          const thumb = await sharp(bytes, { failOn: 'error' })
            .rotate()
            .resize({
              fit: 'inside',
              height: THUMBNAIL_MAX_DIMENSION,
              kernel: 'lanczos3',
              withoutEnlargement: true,
              width: THUMBNAIL_MAX_DIMENSION,
            })
            .webp({ effort: WEBP_EFFORT, quality: THUMBNAIL_WEBP_QUALITY, smartSubsample: true })
            .toBuffer({ resolveWithObject: true })

          if (APPLY) {
            const { error: uploadError } = await supabase.storage.from(bucket).upload(thumbnailKey, thumb.data, {
              cacheControl: '31536000',
              contentType: 'image/webp',
              upsert: false,
            })
            if (uploadError && !/already exists/i.test(uploadError.message)) {
              throw new Error(`thumbnail upload failed: ${uploadError.message}`)
            }
            await pool.query(
              `insert into public.weight_ticket_image_assets (
                 bucket, original_storage_key, thumbnail_storage_key, print_storage_key, file_name, mime_type,
                 byte_size, thumbnail_status, attempt_count, source_width, source_height,
                 thumbnail_width, thumbnail_height, uploaded_by, created_at, updated_at
               ) values ($1, $2, $3, $4, $5, $6, $7, 'ready', 0, $8, $9, $10, $11, $12, now(), now())
               on conflict (bucket, original_storage_key) do update set
                 thumbnail_storage_key = excluded.thumbnail_storage_key,
                 thumbnail_status = 'ready',
                 thumbnail_width = excluded.thumbnail_width,
                 thumbnail_height = excluded.thumbnail_height,
                 updated_at = now()`,
              [
                bucket,
                storageKey,
                thumbnailKey,
                printKeyFor(storageKey),
                candidate.parsed.fileName,
                metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : 'image/webp',
                BigInt(bytes.length),
                width,
                height,
                thumb.info.width,
                thumb.info.height,
                candidate.createdBy ?? null,
              ],
            )
          }
          report.created += 1
          ledgerByKey.set(storageKey, 'ready')
        }

        // Update the stored reference to include thumbnailStorageKey.
        const replacement = JSON.stringify({
          bucket,
          fileName: candidate.parsed.fileName,
          storageKey,
          thumbnailStorageKey: thumbnailKey,
        })
        if (APPLY) {
          const columnExpr = candidate.column === 'vehicle_image_names' ? 'vehicle_image_names' : 'image_names'
          const result = await pool.query(
            `update public.${candidate.table}
             set ${columnExpr}[$2] = $3
             where id = $1 and ${columnExpr}[$2] = $4
             returning id`,
            [candidate.rowId, candidate.index + 1, replacement, candidate.rawValue],
          )
          if (result.rowCount !== 1) throw new Error('reference changed before update')
        }
        report.updatedReferences += 1
      } catch (error) {
        if (report.errors.length < 25) {
          report.errors.push({
            docNo: candidate.docNo,
            error: error instanceof Error ? error.message : String(error),
            storageKey: candidate.parsed.storageKey,
          })
        }
      }
    }

    console.log(JSON.stringify(report, null, 2))
    if (report.errors.length > 0) process.exitCode = 2
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 1
})
