import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { decodeStoredImageAsset, encodeStoredImageReference } from '@/lib/weight-tickets'

export const WEIGHT_TICKET_IMAGE_BUCKET_SETTING = 'WEIGHT_TICKET_IMAGE_BUCKET'
export const WEIGHT_TICKET_PDF_BUCKET_SETTING = 'WEIGHT_TICKET_PDF_BUCKET'
export const WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS = 60 * 60

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
  if (asset.bucket !== bucket) {
    throw new WeightTicketImageReferenceError('รูปหลักฐานอ้างอิง bucket ไม่ตรงกับ private image bucket ที่ตั้งค่าไว้')
  }

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

  return encodeStoredImageReference(asset.fileName, undefined, asset.storageKey, bucket)
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
  async function resolve(rawValue: string): Promise<string | null> {
    const asset = decodeStoredImageAsset(rawValue)
    if (!asset.bucket || !asset.storageKey || asset.bucket !== bucket) return null
    const cacheKey = `${asset.bucket}:${asset.storageKey}`
    const cached = signedUrlByKey.get(cacheKey)
    if (cached) return encodeStoredImageReference(asset.fileName, cached, asset.storageKey, bucket)

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(asset.storageKey, WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      throw new Error(`สร้าง signed URL รูปหลักฐาน ${asset.fileName} ไม่สำเร็จ: ${error?.message ?? 'ไม่พบ signed URL'}`)
    }
    signedUrlByKey.set(cacheKey, data.signedUrl)
    return encodeStoredImageReference(asset.fileName, data.signedUrl, asset.storageKey, bucket)
  }

  const [imageNames, vehicleImageNames, lines] = await Promise.all([
    Promise.all(record.imageNames.map(resolve)).then((values) => values.filter((value): value is string => value !== null)),
    Promise.all(record.vehicleImageNames.map(resolve)).then((values) => values.filter((value): value is string => value !== null)),
    Promise.all(record.lines.map(async (line) => ({
      ...line,
      imageNames: (await Promise.all(line.imageNames.map(resolve))).filter((value): value is string => value !== null),
    }))),
  ])

  return { ...record, imageNames, lines, vehicleImageNames }
}
