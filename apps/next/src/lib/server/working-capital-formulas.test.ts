import { describe, expect, it } from 'vitest'
import { calculateWorkingCapitalDays } from './working-capital-formulas'

describe('calculateWorkingCapitalDays', () => {
  it('uses average inventory and the canonical COGS denominator', () => {
    const result = calculateWorkingCapitalDays({ ap: 500, ar: 1_000, beginningInventory: 8_000, cogs: 36_500, endingInventory: 12_000, periodDays: 365, purchases: 36_500, revenue: 73_000 })
    expect(result.averageInventory).toBe(10_000)
    expect(result.arDays).toBeCloseTo(5)
    expect(result.invDays).toBeCloseTo(100)
    expect(result.apDays).toBeCloseTo(5)
    expect(result.ccc).toBeCloseTo(100)
  })

  it('does not produce an infinite value when COGS is zero', () => {
    const result = calculateWorkingCapitalDays({ ap: 0, ar: 0, beginningInventory: 100_000, cogs: 0, endingInventory: 100_000, periodDays: 90, purchases: 0, revenue: 0 })
    expect(result.invDays).toBe(0)
    expect(result.ccc).toBe(0)
    expect(Number.isFinite(result.ccc)).toBe(true)
  })
})
