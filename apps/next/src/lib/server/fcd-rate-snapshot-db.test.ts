import { describe, expect, it, vi } from 'vitest'
import { findFcdRateSnapshot } from './fcd-rate-snapshot'

describe('findFcdRateSnapshot', () => {
  it('queries the exact active currency pair, date and rate type', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7n, rate: '35.123', source: 'BOT' })
    const result = await findFcdRateSnapshot({ fx_rates: { findFirst } } as never, {
      fromCurrency: ' usd ', rateDate: '2026-07-30', rateType: 'BOT Rate', toCurrency: 'thb',
    })

    expect(result).toEqual({ kind: 'suggested', rate: '35.123', rateId: 7n, source: 'BOT' })
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ active: true, from_currency: 'USD', rate_type: 'BOT Rate', to_currency: 'THB' }),
    }))
  })

  it('requires manual entry when the exact rate does not exist', async () => {
    const result = await findFcdRateSnapshot({ fx_rates: { findFirst: vi.fn().mockResolvedValue(null) } } as never, {
      fromCurrency: 'USD', rateDate: '2026-07-30', rateType: 'BOT Rate', toCurrency: 'THB',
    })
    expect(result).toEqual({ kind: 'manual_required' })
  })
})
