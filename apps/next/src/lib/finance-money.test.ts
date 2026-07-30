import { describe, expect, it } from 'vitest'
import { FINANCE_MONEY_POLICY, roundFinanceCalculationAmount, roundFinanceFxRate } from '@/lib/finance-money'

describe('finance money policy', () => {
  it('uses two decimal places for financial calculation and display', () => {
    expect(FINANCE_MONEY_POLICY).toMatchObject({
      calculationScale: 2,
      displayScale: 2,
      fxRateScale: 3,
    })
  })

  it('rounds calculation amounts once at the two-decimal boundary', () => {
    expect(roundFinanceCalculationAmount(100.1236)).toBe(100.12)
  })

  it('rounds FX rates at the three-decimal boundary', () => {
    expect(roundFinanceFxRate(35.1236)).toBe(35.124)
  })
})
