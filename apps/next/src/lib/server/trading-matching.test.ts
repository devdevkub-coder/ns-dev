import { describe, expect, it } from 'vitest'
import { isTradingMatchingAllocationFact } from './trading-matching'

describe('isTradingMatchingAllocationFact', () => {
  it('accepts an allocation fact created by the Trading Sales Bill flow', () => {
    expect(isTradingMatchingAllocationFact({ sales_bill_id: 10n, cost_pool_entry_id: null })).toBe(true)
  })

  it('excludes facts allocated from Cost Pool', () => {
    expect(isTradingMatchingAllocationFact({ sales_bill_id: 10n, cost_pool_entry_id: 20n })).toBe(false)
  })

  it('excludes Cost Pool allocations without a Sales Bill target', () => {
    expect(isTradingMatchingAllocationFact({ sales_bill_id: null, cost_pool_entry_id: 20n })).toBe(false)
  })
})
