import { fcdFxRate } from '@/lib/server/fcd-money'
import type { Prisma } from '../../../generated/prisma/client'

export type FcdRateRequest = {
  fromCurrency: string
  rateDate: string
  rateType: string
  toCurrency: string
}

export type FcdRateCandidate = FcdRateRequest & {
  id: bigint
  rate: string
  source: string | null
}

export type FcdRateSnapshot =
  | { kind: 'manual_required' }
  | { kind: 'suggested'; rate: string; rateId: bigint; source: string | null }

function normalized(value: string) {
  return value.trim().toUpperCase()
}

export function resolveFcdRateSnapshot(request: FcdRateRequest, candidates: FcdRateCandidate[]): FcdRateSnapshot {
  const match = candidates.find((candidate) => (
    candidate.rateDate === request.rateDate
    && normalized(candidate.fromCurrency) === normalized(request.fromCurrency)
    && normalized(candidate.toCurrency) === normalized(request.toCurrency)
    && candidate.rateType.trim() === request.rateType.trim()
  ))
  if (!match) return { kind: 'manual_required' }

  return {
    kind: 'suggested',
    rate: fcdFxRate(match.rate).toFixed(3),
    rateId: match.id,
    source: match.source,
  }
}

type FcdRateLookupClient = Pick<Prisma.TransactionClient, 'fx_rates'>

function rateDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('วันที่อัตราแลกเปลี่ยนไม่ถูกต้อง')
  }
  return parsed
}

function required(value: string, label: string) {
  const result = value.trim()
  if (!result) throw new Error(`ต้องระบุ${label}`)
  return result
}

/**
 * Looks up only the exact approved rate record. A missing record deliberately
 * becomes manual_required; callers must never substitute a prior/latest rate.
 */
export async function findFcdRateSnapshot(
  client: FcdRateLookupClient,
  request: FcdRateRequest,
): Promise<FcdRateSnapshot> {
  const fromCurrency = normalized(required(request.fromCurrency, 'สกุลเงินต้นทาง'))
  const toCurrency = normalized(required(request.toCurrency, 'สกุลเงินปลายทาง'))
  const rateType = required(request.rateType, 'ประเภทอัตราแลกเปลี่ยน')
  const match = await client.fx_rates.findFirst({
    select: { id: true, rate: true, source: true },
    where: {
      active: true,
      from_currency: fromCurrency,
      rate_date: rateDate(request.rateDate),
      rate_type: rateType,
      to_currency: toCurrency,
    },
  })

  if (!match) return { kind: 'manual_required' }
  return {
    kind: 'suggested',
    rate: fcdFxRate(match.rate).toFixed(3),
    rateId: match.id,
    source: match.source,
  }
}
