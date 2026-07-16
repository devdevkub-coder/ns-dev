import { prisma } from '@/lib/server/prisma'
import { toNumber } from '@/lib/server/daily'

function sanitizeRate(value: number | null, fallback: number) {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) return fallback
  return value
}

export async function activeVatRatePercent(effectiveDate: Date) {
  const row = await prisma.vat_settings.findFirst({
    orderBy: [{ is_default: 'desc' }, { effective_from: 'desc' }, { updated_at: 'desc' }, { id: 'asc' }],
    select: { rate_percent: true },
    where: {
      active: true,
      effective_from: { lte: effectiveDate },
      OR: [
        { effective_to: null },
        { effective_to: { gte: effectiveDate } },
      ],
    },
  })

  return sanitizeRate(toNumber(row?.rate_percent), 7)
}

export async function requiredActiveVatRatePercent(effectiveDate: Date) {
  const row = await prisma.vat_settings.findFirst({
    orderBy: [{ is_default: 'desc' }, { effective_from: 'desc' }, { updated_at: 'desc' }, { id: 'asc' }],
    select: { rate_percent: true },
    where: {
      active: true,
      effective_from: { lte: effectiveDate },
      OR: [
        { effective_to: null },
        { effective_to: { gte: effectiveDate } },
      ],
    },
  })
  const rate = toNumber(row?.rate_percent)
  if (!row || !Number.isFinite(rate) || rate <= 0 || rate > 100) {
    throw new Error('ไม่พบอัตรา VAT ที่เปิดใช้งานสำหรับวันที่เอกสาร')
  }
  return rate
}

export async function activeWhtRatePercent(effectiveDate: Date) {
  const row = await prisma.wht_settings.findFirst({
    orderBy: [{ is_default: 'desc' }, { effective_from: 'desc' }, { updated_at: 'desc' }, { id: 'asc' }],
    select: { rate_percent: true },
    where: {
      active: true,
      effective_from: { lte: effectiveDate },
      OR: [
        { effective_to: null },
        { effective_to: { gte: effectiveDate } },
      ],
    },
  })

  return sanitizeRate(toNumber(row?.rate_percent), 3)
}
