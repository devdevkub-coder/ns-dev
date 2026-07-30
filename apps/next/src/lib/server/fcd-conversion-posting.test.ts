import { describe, expect, it } from 'vitest'
import { calculateFcdConversionAmounts } from './fcd-conversion-posting'

describe('calculateFcdConversionAmounts', () => {
  it('uses the weighted carrying rate for carrying THB and actual THB for realized FX', () => {
    const result = calculateFcdConversionAmounts({
      actualThbReceived: '3520.00',
      nativeAmount: '100.00',
      weightedCarryingRate: '35.123',
    })

    expect(result.carryingThbOut.toFixed(2)).toBe('3512.30')
    expect(result.realizedFxDifference.toFixed(2)).toBe('7.70')
  })

  it('rejects an invalid carrying rate instead of deriving a rate from another source', () => {
    expect(() => calculateFcdConversionAmounts({
      actualThbReceived: '3520.00',
      nativeAmount: '100.00',
      weightedCarryingRate: '0',
    })).toThrow('อัตราแลกเปลี่ยนต้องมากกว่า 0')
  })
})
