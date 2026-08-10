import { createHash } from 'node:crypto'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const { Pool } = pg
const APPLY = process.argv.includes('--apply')
const THUMBNAIL_MAX_DIMENSION = 480
const THUMBNAIL_QUALITY = 0.78

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

function configuredBucket(pool) {
  return pool.query(`
    select nullif(trim(value), '') as value
    from public.system_settings
    where key = 'WEIGHT_TICKET_IMAGE_BUCKET'
    limit 1
  `).then((result) => {
    const value = result.rows[0]?.value || process.env.WEIGHT_TICKET_IMAGE_BUCKET?.trim()
    if (!value) throw new Error('Missing configured weight-ticket image bucket')
    return value
  })
}

function decodeReference(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object' || typeof parsed.fileName !== 'string' || typeof parsed.bucket !== 'string' || typeof parsed.storageKey !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function thumbnailKey(bytes) {
  const digest = createHash('sha256').update(bytes).digest('hex')
  return `attachments/thumbnails/${digest}.webp`
}

async function makeThumbnail(bytes) {
  const image = await loadImage(bytes)
  const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = createCanvas(width, height)
  canvas.getContext('2d').drawImage(image, 0, 0, width, height)
  return canvas.toBuffer('image/webp', THUMBNAIL_QUALITY)
}

async function updateReference(pool, target, index, current, replacement) {
  const column = target === 'vehicle' ? 'vehicle_image_names' : 'image_names'
  const table = target === 'vehicle' ? 'public.weight_tickets' : 'public.weight_ticket_lines'
  const result = await pool.query(`
    update ${table}
    set ${column}[$2] = $3
    where id = $1 and ${column}[$2] = $4
    returning id
  `, [target === 'vehicle' ? current.ticketId : current.lineId, index + 1, replacement, current.rawValue])
  return result.rowCount === 1
}

async function main() {
  const pool = new Pool({ connectionString: requiredEnv('DATABASE_URL') })
  try {
    const bucket = await configuredBucket(pool)
    const supabase = createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const [tickets, lines] = await Promise.all([
      pool.query('select id, vehicle_image_names from public.weight_tickets order by id asc'),
      pool.query('select id, weight_ticket_id, image_names from public.weight_ticket_lines order by id asc'),
    ])
    const candidates = []
    for (const ticket of tickets.rows) {
      for (const [index, rawValue] of (ticket.vehicle_image_names ?? []).entries()) {
        const parsed = decodeReference(rawValue)
        if (parsed && parsed.bucket === bucket && !parsed.thumbnailStorageKey) candidates.push({ index, parsed, rawValue, target: 'vehicle', ticketId: ticket.id })
      }
    }
    for (const line of lines.rows) {
      for (const [index, rawValue] of (line.image_names ?? []).entries()) {
        const parsed = decodeReference(rawValue)
        if (parsed && parsed.bucket === bucket && !parsed.thumbnailStorageKey) candidates.push({ index, parsed, rawValue, target: 'line', lineId: line.id, ticketId: line.weight_ticket_id })
      }
    }

    const report = { apply: APPLY, bucket, candidates: candidates.length, created: 0, updated: 0, errors: [] }
    for (const candidate of candidates) {
      try {
        const { data, error } = await supabase.storage.from(bucket).download(candidate.parsed.storageKey)
        if (error || !data) throw new Error(`download failed: ${error?.message ?? 'object not found'}`)
        const bytes = Buffer.from(await data.arrayBuffer())
        const thumbBytes = await makeThumbnail(bytes)
        const key = thumbnailKey(bytes)
        if (APPLY) {
          const { error: uploadError } = await supabase.storage.from(bucket).upload(key, thumbBytes, {
            cacheControl: '31536000',
            contentType: 'image/webp',
            upsert: false,
          })
          if (uploadError && !/already exists/i.test(uploadError.message)) throw new Error(`thumbnail upload failed: ${uploadError.message}`)
          const replacement = JSON.stringify({ bucket, fileName: candidate.parsed.fileName, storageKey: candidate.parsed.storageKey, thumbnailStorageKey: key })
          if (!await updateReference(pool, candidate.target, candidate.index, candidate, replacement)) throw new Error('reference changed before update')
          report.updated += 1
        }
        report.created += 1
      } catch (error) {
        if (report.errors.length < 20) report.errors.push({ target: candidate.target, error: error instanceof Error ? error.message : String(error) })
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
