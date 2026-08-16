import { describe, expect, it } from 'vitest'
import { isMoneyBalanced, roundMoney, sumClassifiedAssets } from './finance-accounting-asset-classification'

describe('working capital asset classification', () => {
  it('rounds only the final money value and uses one tolerance', () => {
    expect(roundMoney(100.005)).toBe(100.01)
    expect(roundMoney(100.004 + 0.004)).toBe(100.01)
    expect(isMoneyBalanced(100.004, 100)).toBe(true)
    expect(isMoneyBalanced(100.015, 100)).toBe(false)
  })

  it('keeps current, non-current, and unclassified totals separate', () => {
    const totals = sumClassifiedAssets([
      { amount: 100.004, source: 'cash_bank' },
      { amount: 0.004, source: 'accounts_receivable' },
      { amount: 20, source: 'fixed_asset' },
      { amount: 5, source: 'unknown' },
    ])

    expect(totals.current).toBeCloseTo(100.008, 6)
    expect(totals.non_current).toBe(20)
    expect(totals.unclassified).toBe(5)
  })
})
