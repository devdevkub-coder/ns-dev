import { describe, expect, it } from 'vitest'
import { resolveFcdRateSnapshot } from '@/lib/server/fcd-rate-snapshot'

describe('resolveFcdRateSnapshot', () => {
  const requested = {
    fromCurrency: 'USD',
    rateDate: '2026-07-30',
    rateType: 'BOT Rate',
    toCurrency: 'THB',
  }

  it('uses only an exact date/currency/type rate', () => {
    const result = resolveFcdRateSnapshot(requested, [
      { id: 1n, rate: '35.123', rateDate: '2026-07-30', rateType: 'BOT Rate', fromCurrency: 'USD', toCurrency: 'THB', source: 'BOT' },
      { id: 2n, rate: '34.999', rateDate: '2026-07-29', rateType: 'BOT Rate', fromCurrency: 'USD', toCurrency: 'THB', source: 'BOT' },
    ])

    expect(result).toMatchObject({ kind: 'suggested', rate: '35.123', rateId: 1n })
  })

  it('requires manual entry when no exact rate exists instead of falling back to a prior date', () => {
    const result = resolveFcdRateSnapshot(requested, [
      { id: 2n, rate: '34.999', rateDate: '2026-07-29', rateType: 'BOT Rate', fromCurrency: 'USD', toCurrency: 'THB', source: 'BOT' },
    ])

    expect(result).toEqual({ kind: 'manual_required' })
  })
})
