import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_WEIGHT_TICKET_IMAGE_BYTES = 10 * 1024 * 1024

const IMAGE_TYPES = new Map([
  ['image/jpeg', { extension: 'jpg', signature: isJpeg }],
  ['image/jpg', { extension: 'jpg', signature: isJpeg }],
  ['image/png', { extension: 'png', signature: isPng }],
  ['image/webp', { extension: 'webp', signature: isWebp }],
])
const KNOWN_MOCK_IMAGE_BYTES = Buffer.from('mock image data', 'utf8')

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function isPng(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}

function isWebp(bytes) {
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
}

function parseDataUrl(value, source, fileName, maxBytes) {
  const match = value.match(/^data:([^;,]+);base64,(.*)$/i)
  if (!match) return { kind: 'invalid', reason: 'invalidDataUrl', source }

  const mimeType = match[1].toLowerCase()
  const imageType = IMAGE_TYPES.get(mimeType)
  if (!imageType) return { kind: 'invalid', reason: 'unsupportedMimeType', source }

  const base64 = match[2]
  const unpadded = base64.replace(/=+$/, '')
  const padding = base64.length - unpadded.length
  if (
    !base64
    || padding > 2
    || unpadded.includes('=')
    || !/^[A-Za-z0-9+/]+$/.test(unpadded)
    || base64.length % 4 === 1
  ) {
    return { kind: 'invalid', reason: 'invalidBase64', source }
  }

  const estimatedBytes = Math.floor(base64.length * 3 / 4) - padding
  if (estimatedBytes <= 0) return { kind: 'invalid', reason: 'emptyImage', source }
  if (estimatedBytes > maxBytes) return { kind: 'invalid', reason: 'tooLarge', source }

  const bytes = Buffer.from(base64, 'base64')
  if (bytes.toString('base64').replace(/=+$/, '') !== unpadded) {
    return { kind: 'invalid', reason: 'invalidBase64', source }
  }
  if (!imageType.signature(bytes)) {
    return { kind: 'invalid', reason: 'signatureMismatch', source }
  }

  const normalizedFileName = typeof fileName === 'string' ? fileName.trim() : null
  if (normalizedFileName && (normalizedFileName.length > 255 || /[\u0000-\u001f\u007f]/.test(normalizedFileName))) {
    return { kind: 'invalid', reason: 'invalidFileName', source }
  }

  return {
    bytes,
    extension: imageType.extension,
    fileName: normalizedFileName || null,
    kind: 'dataUrl',
    mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    source,
  }
}

export function parseWeightTicketImageReference(rawValue, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_WEIGHT_TICKET_IMAGE_BYTES
  if (typeof rawValue !== 'string') return { kind: 'invalid', reason: 'notString', source: 'unknown' }
  const value = rawValue.trim()
  if (!value) return { kind: 'empty' }

  if (/^data:/i.test(value)) return parseDataUrl(value, 'raw', null, maxBytes)

  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { kind: 'invalid', reason: 'invalidJsonReference', source: 'json' }
      }
      if (
        typeof parsed.storageKey === 'string'
        && parsed.storageKey.trim()
        && typeof parsed.dataUrl === 'string'
      ) {
        return { kind: 'invalid', reason: 'hybridReference', source: 'json' }
      }
      if (typeof parsed.storageKey === 'string' && parsed.storageKey.trim()) {
        return { kind: 'storageKey', storageKey: parsed.storageKey.trim() }
      }
      if (typeof parsed.dataUrl === 'string') {
        return parseDataUrl(parsed.dataUrl.trim(), 'json', parsed.fileName, maxBytes)
      }
      if (typeof parsed.url === 'string' && /^https?:\/\//i.test(parsed.url.trim())) {
        return { kind: 'publicUrl' }
      }
      return { kind: 'invalid', reason: 'invalidJsonReference', source: 'json' }
    } catch {
      return { kind: 'invalid', reason: 'invalidJson', source: 'json' }
    }
  }

  const pipeIndex = value.indexOf('|')
  if (pipeIndex > 0) {
    const fileName = value.slice(0, pipeIndex)
    const target = value.slice(pipeIndex + 1).trim()
    if (/^data:/i.test(target)) return parseDataUrl(target, 'pipe', fileName, maxBytes)
    if (/^https?:\/\//i.test(target)) return { kind: 'legacyUrl' }
    return { kind: 'invalid', reason: 'invalidPipeReference', source: 'pipe' }
  }

  if (/^https?:\/\//i.test(value)) return { kind: 'publicUrl' }
  return { kind: 'filenameOnly' }
}

export function isKnownWeightTicketImageMockReference(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim().startsWith('{')) return false
  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object' || typeof parsed.dataUrl !== 'string') return false
    const match = parsed.dataUrl.trim().match(/^data:image\/png;base64,(.+)$/i)
    if (!match || !/^[A-Za-z0-9+/]+={0,2}$/.test(match[1])) return false
    const bytes = Buffer.from(match[1], 'base64')
    return bytes.equals(KNOWN_MOCK_IMAGE_BYTES)
      && bytes.toString('base64').replace(/=+$/, '') === match[1].replace(/=+$/, '')
  } catch {
    return false
  }
}

function safeSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'unknown'
}

export function buildWeightTicketImageStorageKey({ bytes, documentNo, extension, imageIndex, owner }) {
  const digest = createHash('sha256').update(bytes).digest('hex')
  const documentToken = createHash('sha256').update(String(documentNo)).digest('hex').slice(0, 16)
  const position = String(imageIndex + 1).padStart(3, '0')
  return `attachments/migrated/${documentToken}/${safeSegment(owner)}/${position}-${digest}.${extension}`
}

export function encodeStoredWeightTicketImageReference(fileName, storageKey, url, bucket) {
  return JSON.stringify({ bucket, fileName, storageKey, url })
}

function databaseProjectRef(databaseUrl) {
  const parsed = new URL(databaseUrl)
  const userMatch = decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9]+)$/i)
  const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
  return userMatch?.[1] || hostMatch?.[1] || null
}

export function identifySupabaseProjectRef(supabaseUrl, databaseUrl) {
  const host = new URL(supabaseUrl).hostname
  const urlMatch = host.match(/^([a-z0-9]+)\.supabase\.co$/i)
  const storageRef = urlMatch?.[1] || null
  const dbRef = databaseProjectRef(databaseUrl)
  if (!storageRef || !dbRef) throw new Error('Unable to identify Supabase project ref from environment URLs')
  if (storageRef !== dbRef) throw new Error('Database and Supabase project refs do not match')
  return storageRef
}

export function sanitizedOwnerToken(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

export async function writeRollbackManifest(filePath, manifest, options = {}) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const content = JSON.stringify(manifest, null, 2)
  if (options.initial) {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    return
  }
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  await rename(temporaryPath, filePath)
}
