import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import {
  identifySupabaseProjectRef,
  isKnownWeightTicketImageMockReference,
  parseWeightTicketImageReference,
  sanitizedOwnerToken,
} from './weight-ticket-image-assets.mjs'

const { Pool } = pg

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

async function listObjectsRecursively(supabase, bucket, prefix = '') {
  const objects = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Storage list failed: ${error.message}`)
    if (!data?.length) break

    for (const entry of data) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) objects.push(objectPath)
      else objects.push(...await listObjectsRecursively(supabase, bucket, objectPath))
    }
    if (data.length < pageSize) break
    offset += pageSize
  }
  return objects
}

async function main() {
  const databaseUrl = requiredEnv('DATABASE_URL')
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const projectRef = identifySupabaseProjectRef(supabaseUrl, databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    const bucket = await resolveBucket(pool)
    const supabase = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const [bucketResult, ticketResult, lineResult, objects] = await Promise.all([
      pool.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [bucket.name]),
      pool.query(`select id, vehicle_image_names from public.weight_tickets order by id asc`),
      pool.query(`select id, image_names from public.weight_ticket_lines order by id asc`),
      listObjectsRecursively(supabase, bucket.name),
    ])

    const objectSet = new Set(objects)
    const referencedStorageKeys = new Set()
    const report = {
      projectRef,
      bucket: {
        allowedMimeTypes: bucketResult.rows[0]?.allowed_mime_types ?? null,
        configured: Boolean(bucketResult.rows[0]),
        fileSizeLimit: bucketResult.rows[0]?.file_size_limit ?? null,
        name: bucket.name,
        public: bucketResult.rows[0]?.public ?? null,
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
        line: 0,
        pipeDataUrl: 0,
        publicUrl: 0,
        rawDataUrl: 0,
        storageKey: 0,
        total: 0,
        vehicle: 0,
      },
      storage: {
        migratedOrphanCount: 0,
        missingStorageKeyCount: 0,
        objectCount: objects.length,
      },
      errorSamples: [],
    }

    const addReference = (rawValue, owner) => {
      report.references.total += 1
      const parsed = parseWeightTicketImageReference(rawValue)
      if (parsed.kind === 'dataUrl') {
        report.references.dataUrl += 1
        report.references[`${parsed.source}DataUrl`] += 1
      } else if (parsed.kind === 'storageKey') {
        report.references.storageKey += 1
        referencedStorageKeys.add(parsed.storageKey)
        if (!objectSet.has(parsed.storageKey)) report.storage.missingStorageKeyCount += 1
      } else if (parsed.kind === 'invalid') {
        report.references.invalid += 1
        const knownInvalidMock = isKnownWeightTicketImageMockReference(rawValue)
        if (knownInvalidMock) report.references.knownInvalidMock += 1
        if (report.errorSamples.length < 25) {
          report.errorSamples.push({ code: knownInvalidMock ? 'knownInvalidMock' : parsed.reason, owner: sanitizedOwnerToken(owner) })
        }
      } else {
        report.references[parsed.kind] += 1
      }
    }

    for (const row of ticketResult.rows) {
      for (const [index, image] of (row.vehicle_image_names ?? []).entries()) {
        report.references.vehicle += 1
        addReference(image, `ticket:${row.id}:vehicle:${index}`)
      }
    }
    for (const row of lineResult.rows) {
      for (const [index, image] of (row.image_names ?? []).entries()) {
        report.references.line += 1
        addReference(image, `line:${row.id}:${index}`)
      }
    }

    report.storage.migratedOrphanCount = objects.filter((key) =>
      key.startsWith('attachments/migrated/') && !referencedStorageKeys.has(key)).length

    console.log(JSON.stringify(report, null, 2))
    if (
      !report.bucket.configured
      || report.bucket.public !== false
      || report.references.dataUrl
      || report.references.invalid
      || report.storage.missingStorageKeyCount
      || report.storage.migratedOrphanCount
    ) process.exitCode = 2
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: safeError(error) }))
  process.exitCode = 1
})
