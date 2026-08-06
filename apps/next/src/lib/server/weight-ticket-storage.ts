import { prisma } from '@/lib/server/prisma'

export const WEIGHT_TICKET_IMAGE_BUCKET_SETTING = 'WEIGHT_TICKET_IMAGE_BUCKET'
export const WEIGHT_TICKET_PDF_BUCKET_SETTING = 'WEIGHT_TICKET_PDF_BUCKET'

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
