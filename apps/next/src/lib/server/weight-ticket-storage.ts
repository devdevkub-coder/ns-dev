import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { decodeStoredImageAsset, encodeStoredImageReference } from '@/lib/weight-tickets'

export const WEIGHT_TICKET_IMAGE_BUCKET_SETTING = 'WEIGHT_TICKET_IMAGE_BUCKET'
export const WEIGHT_TICKET_PDF_BUCKET_SETTING = 'WEIGHT_TICKET_PDF_BUCKET'
export const WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS = 60 * 60
export const WEIGHT_TICKET_IMAGE_STORAGE_PREFIX = 'attachments/'

export class WeightTicketImageReferenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeightTicketImageReferenceError'
  }
}

async function resolveConfiguredBucket(settingKey: string, environmentKey: string) {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: settingKey },
  })
  return setting?.value?.trim() || process.env[environmentKey]?.trim() || ''
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
    await resolveConfiguredBucket(WEIGHT_TICKET_IMAGE_BUCKET_SETTING, WEIGHT_TICKET_IMAGE_BUCKET_SETTING),
    'รูปหลักฐาน WTI/WTO',
  )
}

export async function resolveWeightTicketPdfBucket() {
  return requireWeightTicketBucket(
    await resolveConfiguredBucket(WEIGHT_TICKET_PDF_BUCKET_SETTING, WEIGHT_TICKET_PDF_BUCKET_SETTING),
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

type WeightTicketImagePreviewRecord = {
  imageNames: string[]
  lines: Array<{ imageNames: string[] }>
  vehicleImageNames: string[]
}

export async function attachWeightTicketImagePreviewUrls<T extends WeightTicketImagePreviewRecord>(record: T, bucket: string): Promise<T> {
  const adminClient = getSupabaseAdminClient()
  if (!adminClient) throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับสร้างลิงก์ preview รูปหลักฐาน')
  const supabase = adminClient

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
    const cacheKey = `${asset.bucket}:${storageKey}:${thumbnailStorageKey}`
    const cached = signedUrlByKey.get(cacheKey)
    if (cached) return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey, cached)

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(thumbnailStorageKey, WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      throw new Error(`สร้าง signed URL thumbnail รูปหลักฐาน ${asset.fileName} ไม่สำเร็จ: ${error?.message ?? 'ไม่พบ signed URL'}`)
    }
    signedUrlByKey.set(cacheKey, data.signedUrl)
    return encodeStoredImageReference(asset.fileName, undefined, storageKey, bucket, thumbnailStorageKey, data.signedUrl)
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
