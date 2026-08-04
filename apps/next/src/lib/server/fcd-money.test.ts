import { describe, expect, it } from 'vitest'
import {
  calculateFcdWeightedCarryingRate,
  calculateSettlementBookAmount,
  fcdFxRate,
  fcdMoneyAmount,
  requireFcdInputMoneyAmount,
} from '@/lib/server/fcd-money'

describe('FCD money contract', () => {
  it('keeps native and book amounts at two decimals without floating-point rounding', () => {
    expect(fcdMoneyAmount('100.005').toFixed(2)).toBe('100.01')
    expect(() => requireFcdInputMoneyAmount('100.001')).toThrow('ยอดเงินใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง')
  })

  it('allows FX rates up to three decimals', () => {
    expect(fcdFxRate('35.123').toFixed(3)).toBe('35.123')
    expect(() => fcdFxRate('35.1234')).toThrow('อัตราแลกเปลี่ยนใช้ทศนิยมได้ไม่เกิน 3 ตำแหน่ง')
  })

  it('calculates settlement THB once from native amount and the receipt rate', () => {
    expect(calculateSettlementBookAmount('100.00', '35.123').toFixed(2)).toBe('3512.30')
  })

  it('uses a moving weighted carrying rate per account and currency pool', () => {
    expect(calculateFcdWeightedCarryingRate({ carryingThb: '3500.00', nativeAmount: '100.00' }, { carryingThb: '3700.00', nativeAmount: '100.00' }).toFixed(3)).toBe('36.000')
  })
})
