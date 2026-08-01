import { describe, expect, it } from 'vitest'
import { calculateFcdRevaluationAmounts } from './fcd-revaluation-posting'

describe('calculateFcdRevaluationAmounts', () => {
  it('changes carrying THB without changing the native balance', () => {
    const result = calculateFcdRevaluationAmounts({
      carryingThbBefore: '362000.00',
      closingFxRate: '36.500',
      nativeBalance: '10000.00',
    })

    expect(result.revaluedThbAmount.toFixed(2)).toBe('365000.00')
    expect(result.unrealizedFxDifference.toFixed(2)).toBe('3000.00')
  })
})
