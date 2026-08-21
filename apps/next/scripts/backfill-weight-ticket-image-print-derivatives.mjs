// Backfill the purpose-specific WTI/WTO print derivative for existing assets.
// Dry-run is the default. Pass --apply together with
// --expected-project-ref=<ref> to download originals, generate the bounded
// derivative, upload it, and mark the ledger row ready.
//
// The original object is read-only in this script. The print object is an
// immutable derivative at the ledger-provided print_storage_key.

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const sharp = require('sharp')

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { identifySupabaseProjectRef } from './weight-ticket-image-assets.mjs'

const envCandidates = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
]
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    // An explicit environment supplied by the operator must win over a local
    // file. This prevents an --apply run from silently switching targets just
    // because .env.local exists in the working copy.
    loadEnv({ path: envPath, override: false })
    break
  }
}

const { Pool } = pg
const APPLY = process.argv.includes('--apply')
const SETTING_KEYS = [
  'WEIGHT_TICKET_IMAGE_BUCKET',
  'WEIGHT_TICKET_PRINT_MAX_DIMENSION',
  'WEIGHT_TICKET_PRINT_JPEG_QUALITY',
  'WEIGHT_TICKET_THUMBNAIL_MAX_SOURCE_PIXELS',
  'WEIGHT_TICKET_THUMBNAIL_LOCK_TIMEOUT_SECONDS',
]
const IMMUTABLE_CACHE_SECONDS = 31536000

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error('Missing required env: ' + name)
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

function integerSetting(settings, key, minimum, maximum) {
  const raw = settings.get(key)?.trim()
  if (!raw || !/^\d+$/.test(raw)) throw new Error('Invalid system setting: ' + key)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error('System setting ' + key + ' must be between ' + minimum + ' and ' + maximum)
  }
  return value
}

function assertImageStorageKey(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value.startsWith('/')
    || value.includes('\\')
    || !value.startsWith('attachments/')
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))
  ) {
    throw new Error('invalid image storage key')
  }
  return value
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function validatePrintDimensions(width, height, maxDimension) {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > maxDimension
    || height > maxDimension
    || width > 400
    || height > 400
  ) {
    throw new Error('generated print derivative exceeds the 400x400 pixel bound')
  }
  return { width, height }
}

async function readExistingPrintDimensions(supabase, bucket, storageKey, expectedBytes, maxDimension) {
  const { data, error } = await supabase.storage.from(bucket).download(storageKey)
  if (error || !data) throw new Error('existing print derivative could not be verified: ' + (error?.message ?? 'object not found'))
  const existingBytes = Buffer.from(await data.arrayBuffer())
  if (!existingBytes.equals(expectedBytes)) {
    throw new Error('existing print derivative does not match the derivative generated from the current original')
  }
  const metadata = await sharp(existingBytes, { failOn: 'error' }).metadata()
  if (metadata.format !== 'jpeg') throw new Error('existing print derivative is not JPEG')
  return validatePrintDimensions(metadata.width, metadata.height, maxDimension)
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
    const settingsResult = await pool.query(
      'select key, value from public.system_settings where key = any($1::text[])',
      [SETTING_KEYS],
    )
    const settings = new Map(settingsResult.rows.map((row) => [row.key, row.value]))
    const bucket = settings.get('WEIGHT_TICKET_IMAGE_BUCKET')?.trim()
    if (!bucket) throw new Error('Missing configured WEIGHT_TICKET_IMAGE_BUCKET')
    const maxDimension = integerSetting(settings, 'WEIGHT_TICKET_PRINT_MAX_DIMENSION', 1, 400)
    const quality = integerSetting(settings, 'WEIGHT_TICKET_PRINT_JPEG_QUALITY', 1, 100)
    const maxSourcePixels = integerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_MAX_SOURCE_PIXELS', 1_000_000, 300_000_000)
    const lockTimeoutSeconds = integerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_LOCK_TIMEOUT_SECONDS', 30, 3600)

    const assets = await pool.query(
      'select id, bucket, original_storage_key, print_storage_key, file_name, ' +
      'print_status, print_attempt_count, print_locked_at, print_locked_by from public.weight_ticket_image_assets ' +
      "where print_status <> 'ready' order by id asc",
    )
    const report = {
      apply: APPLY,
      bucket,
      projectRef,
      maxDimension,
      quality,
      lockTimeoutSeconds,
      selected: assets.rows.length,
      ready: 0,
      generated: 0,
      verified: 0,
      skipped: 0,
      skippedClaim: 0,
      nonReadyRemaining: 0,
      errors: [],
    }

    for (const asset of assets.rows) {
      let claimed = false
      const lockToken = `backfill-${process.pid}-${asset.id}-${Date.now()}`
      try {
        if (asset.bucket !== bucket) throw new Error('asset bucket does not match configured image bucket')
        const originalKey = assertImageStorageKey(asset.original_storage_key)
        const printKey = assertImageStorageKey(asset.print_storage_key)
        if (printKey === originalKey) throw new Error('print derivative key must differ from original key')
        if (!APPLY) {
          report.skipped += 1
          continue
        }

        const claim = await pool.query(
          'update public.weight_ticket_image_assets ' +
          "set print_status = 'processing', print_locked_at = now(), print_locked_by = $2, " +
          'print_attempt_count = print_attempt_count + 1, print_last_error = null, updated_at = now() ' +
          "where id = $1 and print_status <> 'ready' and (" +
          'print_locked_by is null or ' +
          "(print_locked_at is not null and print_locked_at < now() - ($3 * interval '1 second')))",
          [asset.id, lockToken, lockTimeoutSeconds],
        )
        if (claim.rowCount !== 1) {
          report.skippedClaim += 1
          continue
        }
        claimed = true

        const { data: originalBlob, error: downloadError } = await supabase.storage
          .from(bucket)
          .download(originalKey)
        if (downloadError || !originalBlob) {
          throw new Error('original download failed: ' + (downloadError?.message ?? 'object not found'))
        }

        const originalBytes = Buffer.from(await originalBlob.arrayBuffer())
        const metadata = await sharp(originalBytes, { failOn: 'error' }).metadata()
        const width = metadata.width
        const height = metadata.height
        const sourcePixels = width && height ? width * height : 0
        if (!width || !height || !Number.isSafeInteger(sourcePixels) || sourcePixels > maxSourcePixels) {
          throw new Error('source image exceeds configured pixel limit (' + sourcePixels + ' px)')
        }

        const printImage = await sharp(originalBytes, { failOn: 'error' })
          .rotate()
          .resize({
            fit: 'inside',
            height: maxDimension,
            kernel: 'lanczos3',
            withoutEnlargement: true,
            width: maxDimension,
          })
          .jpeg({ mozjpeg: true, quality })
          .toBuffer({ resolveWithObject: true })
        let printDimensions = validatePrintDimensions(printImage.info.width, printImage.info.height, maxDimension)

        let verifiedExisting = false
        const { error: uploadError } = await supabase.storage.from(bucket).upload(printKey, printImage.data, {
          cacheControl: String(IMMUTABLE_CACHE_SECONDS),
          contentType: 'image/jpeg',
          upsert: false,
        })
        if (uploadError) {
          if (!/already exists/i.test(uploadError.message)) {
            throw new Error('print derivative upload failed: ' + uploadError.message)
          }
          printDimensions = await readExistingPrintDimensions(supabase, bucket, printKey, printImage.data, maxDimension)
          verifiedExisting = true
        }

        const markedReady = await pool.query(
          'update public.weight_ticket_image_assets ' +
          "set print_status = 'ready', print_height = $2, print_last_error = null, " +
          'print_locked_at = null, print_locked_by = null, print_next_retry_at = now(), ' +
          'print_width = $3, source_height = $4, source_width = $5, updated_at = now() ' +
          'where id = $1 and print_locked_by = $6',
          [asset.id, printDimensions.height, printDimensions.width, height, width, lockToken],
        )
        if (markedReady.rowCount !== 1) {
          report.skippedClaim += 1
          continue
        }
        if (verifiedExisting) report.verified += 1
        else report.generated += 1
      } catch (error) {
        if (claimed) {
          try {
            await pool.query(
              'update public.weight_ticket_image_assets ' +
              "set print_status = 'queued', print_last_error = $2, print_locked_at = null, " +
              'print_locked_by = null, print_next_retry_at = now(), updated_at = now() ' +
              'where id = $1 and print_locked_by = $3',
              [asset.id, safeError(error).slice(0, 1000), lockToken],
            )
          } catch (releaseError) {
            if (report.errors.length < 25) {
              report.errors.push({
                id: String(asset.id),
                fileName: asset.file_name,
                error: 'lease release failed: ' + safeError(releaseError),
              })
            }
          }
        }
        if (report.errors.length < 25) {
          report.errors.push({
            id: String(asset.id),
            fileName: asset.file_name,
            error: safeError(error),
          })
        }
      }
    }

    const finalState = await pool.query(
      "select " +
      "count(*) filter (where print_status = 'ready')::integer as ready, " +
      "count(*) filter (where print_status <> 'ready')::integer as non_ready_remaining " +
      'from public.weight_ticket_image_assets',
    )
    report.ready = Number(finalState.rows[0]?.ready ?? 0)
    report.nonReadyRemaining = Number(finalState.rows[0]?.non_ready_remaining ?? 0)
    console.log(JSON.stringify(report, null, 2))
    if (APPLY && (report.errors.length > 0 || report.nonReadyRemaining > 0)) process.exitCode = 2
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: safeError(error) }))
  process.exitCode = 1
})
