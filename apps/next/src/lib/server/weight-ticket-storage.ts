import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { decodeStoredImageAsset, encodeStoredImageReference } from '@/lib/weight-tickets'
import type { Prisma } from '../../../generated/prisma/client'

export const WEIGHT_TICKET_IMAGE_BUCKET_SETTING = 'WEIGHT_TICKET_IMAGE_BUCKET'
export const WEIGHT_TICKET_PDF_BUCKET_SETTING = 'WEIGHT_TICKET_PDF_BUCKET'
export const WEIGHT_TICKET_IMAGE_STORAGE_PREFIX = 'attachments/'
export const WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS = 31536000
export const WEIGHT_TICKET_THUMBNAIL_WEBP_EFFORT = 5

const imageProcessingSettingKeys = [
  'WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES',
  'WEIGHT_TICKET_IMAGE_UPLOAD_CONCURRENCY',
  'WEIGHT_TICKET_THUMBNAIL_MAX_DIMENSION',
  'WEIGHT_TICKET_THUMBNAIL_WEBP_QUALITY',
  'WEIGHT_TICKET_THUMBNAIL_MAX_SOURCE_PIXELS',
  'WEIGHT_TICKET_THUMBNAIL_MAX_ATTEMPTS',
  'WEIGHT_TICKET_THUMBNAIL_RETRY_DELAY_SECONDS',
  'WEIGHT_TICKET_THUMBNAIL_LOCK_TIMEOUT_SECONDS',
  'WEIGHT_TICKET_THUMBNAIL_PREVIEW_POLL_SECONDS',
  'WEIGHT_TICKET_THUMBNAIL_DRAIN_BATCH_SIZE',
  'WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS',
  'WEIGHT_TICKET_IMAGE_ORPHAN_RETENTION_SECONDS',
] as const

type ImageProcessingSettingKey = typeof imageProcessingSettingKeys[number]

function requireIntegerSetting(
  settings: Map<string, string | null>,
  key: ImageProcessingSettingKey,
  minimum: number,
  maximum: number,
) {
  const rawValue = settings.get(key)?.trim()
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`การตั้งค่า ${key} ต้องเป็นจำนวนเต็ม`)
  }
  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`การตั้งค่า ${key} ต้องอยู่ระหว่าง ${minimum} ถึง ${maximum}`)
  }
  return value
}

async function loadWeightTicketImageProcessingSettings() {
  const rows = await prisma.system_settings.findMany({
    select: { key: true, value: true },
    where: { key: { in: [...imageProcessingSettingKeys] } },
  })
  return new Map(rows.map((row) => [row.key, row.value]))
}

export async function resolveWeightTicketImageUploadConfig() {
  const settings = await loadWeightTicketImageProcessingSettings()
  return {
    maxUploadBytes: requireIntegerSetting(settings, 'WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES', 1, 50 * 1024 * 1024),
    uploadConcurrency: requireIntegerSetting(settings, 'WEIGHT_TICKET_IMAGE_UPLOAD_CONCURRENCY', 1, 10),
  }
}

export async function resolveWeightTicketImageProcessingConfig() {
  const settings = await loadWeightTicketImageProcessingSettings()
  return {
    lockTimeoutSeconds: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_LOCK_TIMEOUT_SECONDS', 30, 3600),
    maxAttempts: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_MAX_ATTEMPTS', 1, 10),
    drainBatchSize: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_DRAIN_BATCH_SIZE', 1, 100),
    maxDimension: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_MAX_DIMENSION', 320, 2048),
    maxSourcePixels: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_MAX_SOURCE_PIXELS', 1_000_000, 100_000_000),
    previewPollSeconds: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_PREVIEW_POLL_SECONDS', 1, 30),
    retryDelaySeconds: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_RETRY_DELAY_SECONDS', 1, 3600),
    previewTtlSeconds: requireIntegerSetting(settings, 'WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS', 60, 3600),
    orphanRetentionSeconds: requireIntegerSetting(settings, 'WEIGHT_TICKET_IMAGE_ORPHAN_RETENTION_SECONDS', 60, 31 * 24 * 60 * 60),
    webpQuality: requireIntegerSetting(settings, 'WEIGHT_TICKET_THUMBNAIL_WEBP_QUALITY', 1, 100),
  }
}

export class WeightTicketImageReferenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeightTicketImageReferenceError'
  }
}

async function resolveConfiguredBucket(settingKey: string) {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: settingKey },
  })
  return setting?.value?.trim() || ''
}

export function requireWeightTicketBucket(value: string, label: string) {
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า Storage Bucket สำหรับ${label}`)
  return value
}

export function assertWeightTicketImageStorageKey(value: string) {
  const storageKey = value.trim()
  const segments = storageKey.split('/')
  if (
    !storageKey
    || storageKey.length > 512
    || storageKey.startsWith('/')
    || storageKey.includes('\\')
    || !storageKey.startsWith(WEIGHT_TICKET_IMAGE_STORAGE_PREFIX)
    || segments.some((segment) => (
      !segment
      || segment === '.'
      || segment === '..'
      || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
    ))
  ) {
    throw new WeightTicketImageReferenceError('storage key ของรูปหลักฐานไม่อยู่ในพื้นที่ที่อนุญาต')
  }
  return storageKey
}

export async function resolveWeightTicketImageBucket() {
  return requireWeightTicketBucket(
    await resolveConfiguredBucket(WEIGHT_TICKET_IMAGE_BUCKET_SETTING),
    'รูปหลักฐาน WTI/WTO',
  )
}

export async function resolveWeightTicketPdfBucket() {
  return requireWeightTicketBucket(
    await resolveConfiguredBucket(WEIGHT_TICKET_PDF_BUCKET_SETTING),
    'PDF WTI/WTO',
  )
}

function assertCanonicalImageReference(rawValue: string, bucket: string) {
  const asset = decodeStoredImageAsset(rawValue)
  if (!asset.storageKey || !asset.bucket) {
    throw new WeightTicketImageReferenceError('พบรูปหลักฐานรูปแบบเก่า กรุณาย้ายรูปเข้า private image bucket ก่อนบันทึกหรือส่ง LINE')
  }
  if (!asset.thumbnailStorageKey) {
    throw new WeightTicketImageReferenceError(`รูปหลักฐาน ${asset.fileName} ยังไม่มี thumbnail กรุณารัน backfill ก่อนบันทึก`)
  }
  if (asset.bucket !== bucket) {
    throw new WeightTicketImageReferenceError('รูปหลักฐานอ้างอิง bucket ไม่ตรงกับ private image bucket ที่ตั้งค่าไว้')
  }
  const storageKey = assertWeightTicketImageStorageKey(asset.storageKey)
  const thumbnailStorageKey = assertWeightTicketImageStorageKey(asset.thumbnailStorageKey)

  if (rawValue.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawValue) as { dataUrl?: unknown; url?: unknown }
      if ('dataUrl' in parsed || (typeof parsed.url === 'string' && !/^https?:\/\//i.test(parsed.url))) {
        throw new WeightTicketImageReferenceError('ไม่อนุญาตให้เก็บ data URL หรือ URL ที่ไม่ใช่ signed URL เป็นหลักฐาน')
      }
    } catch (error) {
      if (error instanceof WeightTicketImageReferenceError) throw error
      throw new WeightTicketImageReferenceError('ข้อมูลอ้างอิงรูปหลักฐานไม่ถูกต้อง')
    }
  }

  return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey)
}

export function normalizeWeightTicketImageReferences<T extends {
  lines: Array<{ imageNames: string[] }>
  vehicleImageNames: string[]
}>(values: T, bucket: string): T {
  return {
    ...values,
    lines: values.lines.map((line) => ({
      ...line,
      imageNames: line.imageNames.map((rawValue) => assertCanonicalImageReference(rawValue, bucket)),
    })),
    vehicleImageNames: values.vehicleImageNames.map((rawValue) => assertCanonicalImageReference(rawValue, bucket)),
  }
}

type WeightTicketImageReferenceRecord = {
  lines: Array<{ imageNames: string[] }>
  vehicleImageNames: string[]
}

export function weightTicketImageStorageKeys(record: WeightTicketImageReferenceRecord) {
  return Array.from(new Set([
    ...record.vehicleImageNames,
    ...record.lines.flatMap((line) => line.imageNames),
  ].map((rawValue) => {
    const storageKey = decodeStoredImageAsset(rawValue).storageKey
    if (!storageKey) throw new WeightTicketImageReferenceError('รูปหลักฐานไม่มี storage key')
    return assertWeightTicketImageStorageKey(storageKey)
  })))
}

export async function assertWeightTicketImageAssetOwnership(input: {
  authUserId: string
  bucket: string
  record: WeightTicketImageReferenceRecord
  ticketId?: bigint
}) {
  const storageKeys = weightTicketImageStorageKeys(input.record)
  if (storageKeys.length === 0) return storageKeys
  const assets = await prisma.weight_ticket_image_assets.findMany({
    select: {
      attached_ticket_id: true,
      original_storage_key: true,
      uploaded_by: true,
    },
    where: {
      bucket: input.bucket,
      original_storage_key: { in: storageKeys },
    },
  })
  const assetByKey = new Map(assets.map((asset) => [asset.original_storage_key, asset]))
  for (const storageKey of storageKeys) {
    const asset = assetByKey.get(storageKey)
    if (!asset) throw new WeightTicketImageReferenceError(`ไม่พบทะเบียนรูปหลักฐาน ${storageKey}`)
    const belongsToCurrentTicket = input.ticketId != null && asset.attached_ticket_id === input.ticketId
    const isOwnedPendingUpload = asset.attached_ticket_id == null && asset.uploaded_by === input.authUserId
    if (!belongsToCurrentTicket && !isOwnedPendingUpload) {
      throw new WeightTicketImageReferenceError('ไม่มีสิทธิ์นำรูปหลักฐานจากเอกสารอื่นมาบันทึก')
    }
  }
  return storageKeys
}

export async function attachWeightTicketImageAssets(
  tx: Prisma.TransactionClient,
  input: { authUserId: string; bucket: string; storageKeys: string[]; ticketId: bigint },
) {
  if (input.storageKeys.length === 0) return
  const alreadyAttached = await tx.weight_ticket_image_assets.count({
    where: {
      attached_ticket_id: input.ticketId,
      bucket: input.bucket,
      original_storage_key: { in: input.storageKeys },
    },
  })
  const newlyAttached = await tx.weight_ticket_image_assets.updateMany({
    data: {
      attached_at: new Date(),
      attached_ticket_id: input.ticketId,
      updated_at: new Date(),
    },
    where: {
      bucket: input.bucket,
      original_storage_key: { in: input.storageKeys },
      attached_ticket_id: null,
      locked_by: null,
      uploaded_by: input.authUserId,
    },
  })
  if (alreadyAttached + newlyAttached.count !== input.storageKeys.length) {
    throw new WeightTicketImageReferenceError('ผูกรูปหลักฐานกับใบรับ-ส่งของไม่ครบ')
  }
}

type WeightTicketImagePreviewRecord = {
  imageNames: string[]
  lines: Array<{ imageNames: string[] }>
  vehicleImageNames: string[]
}

export async function attachWeightTicketImagePreviewUrls<T extends WeightTicketImagePreviewRecord>(record: T, bucket: string): Promise<T> {
  const adminClient = getSupabaseAdminClient()
  if (!adminClient) throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับสร้างลิงก์ preview รูปหลักฐาน')
  const supabase = adminClient
  const processingConfig = await resolveWeightTicketImageProcessingConfig()

  const rawValues = [
    ...record.imageNames,
    ...record.vehicleImageNames,
    ...record.lines.flatMap((line) => line.imageNames),
  ]
  const storageKeys = Array.from(new Set(rawValues.map((rawValue) => {
    const asset = decodeStoredImageAsset(rawValue)
    if (!asset.bucket || !asset.storageKey || asset.bucket !== bucket) {
      throw new WeightTicketImageReferenceError(`รูปหลักฐาน ${asset.fileName} ไม่มี bucket หรือ storage key ที่ถูกต้อง`)
    }
    return assertWeightTicketImageStorageKey(asset.storageKey)
  })))
  const assetRows = storageKeys.length > 0
    ? await prisma.weight_ticket_image_assets.findMany({
        select: {
          original_storage_key: true,
          thumbnail_status: true,
          thumbnail_storage_key: true,
        },
        where: {
          bucket,
          original_storage_key: { in: storageKeys },
        },
      })
    : []
  const assetByStorageKey = new Map(assetRows.map((asset) => [asset.original_storage_key, asset]))

  const signedUrlByKey = new Map<string, string>()
  async function resolve(rawValue: string): Promise<string> {
    const asset = decodeStoredImageAsset(rawValue)
    if (!asset.bucket || !asset.storageKey || asset.bucket !== bucket) {
      throw new WeightTicketImageReferenceError(`รูปหลักฐาน ${asset.fileName} ไม่มี bucket หรือ storage key ที่ถูกต้อง`)
    }
    if (!asset.thumbnailStorageKey) {
      throw new WeightTicketImageReferenceError(`รูปหลักฐาน ${asset.fileName} ยังไม่มี thumbnail กรุณารัน backfill ก่อนเปิดใช้งาน preview`)
    }
    let storageKey: string
    let thumbnailStorageKey: string
    try {
      storageKey = assertWeightTicketImageStorageKey(asset.storageKey)
      thumbnailStorageKey = assertWeightTicketImageStorageKey(asset.thumbnailStorageKey)
    } catch {
      throw new WeightTicketImageReferenceError(`storage key ของรูปหลักฐาน ${asset.fileName} ไม่ถูกต้อง`)
    }
    const processingAsset = assetByStorageKey.get(storageKey)
    if (!processingAsset) {
      console.error('[weight_ticket_image_preview] missing asset ledger row', { bucket, storageKey })
      return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey, undefined, 'failed')
    }
    if (processingAsset.thumbnail_storage_key !== thumbnailStorageKey) {
      throw new WeightTicketImageReferenceError(`thumbnail storage key ของรูปหลักฐาน ${asset.fileName} ไม่ตรงกับทะเบียนรูป`)
    }
    const thumbnailStatus = processingAsset.thumbnail_status as 'failed' | 'processing' | 'queued' | 'ready'
    if (thumbnailStatus !== 'ready') {
      return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey, undefined, thumbnailStatus)
    }
    const cacheKey = `${asset.bucket}:${storageKey}:${thumbnailStorageKey}`
    const cached = signedUrlByKey.get(cacheKey)
    if (cached) return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey, cached, 'ready')

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(thumbnailStorageKey, processingConfig.previewTtlSeconds)
    if (error || !data?.signedUrl) {
      console.error('[weight_ticket_image_preview] signed thumbnail URL failed', {
        bucket,
        error: error?.message ?? 'ไม่พบ signed URL',
        storageKey,
      })
      return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey, undefined, 'failed')
    }
    signedUrlByKey.set(cacheKey, data.signedUrl)
    return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey, data.signedUrl, 'ready')
  }

  const [imageNames, vehicleImageNames, lines] = await Promise.all([
    Promise.all(record.imageNames.map(resolve)),
    Promise.all(record.vehicleImageNames.map(resolve)),
    Promise.all(record.lines.map(async (line) => ({
      ...line,
      imageNames: await Promise.all(line.imageNames.map(resolve)),
    }))),
  ])

  return { ...record, imageNames, lines, vehicleImageNames }
}
