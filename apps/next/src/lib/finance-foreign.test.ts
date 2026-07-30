import { describe, expect, it } from 'vitest'
import { fxRateFormSchema } from '@/lib/finance-foreign'

const validFxRate = {
  fromCurrency: 'USD',
  rate: 35.123,
  rateDate: '2026-07-30',
  toCurrency: 'THB',
}

describe('fxRateFormSchema', () => {
  it('accepts an FX rate with up to three decimal places', () => {
    expect(fxRateFormSchema.safeParse(validFxRate).success).toBe(true)
  })

  it('rejects an FX rate with more than three decimal places', () => {
    const result = fxRateFormSchema.safeParse({ ...validFxRate, rate: 35.1234 })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === 'Rate ใช้ทศนิยมได้ไม่เกิน 3 ตำแหน่ง')).toBe(true)
    }
  })
})
