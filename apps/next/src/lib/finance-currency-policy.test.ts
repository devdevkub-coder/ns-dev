import { describe, expect, it } from 'vitest'
import { requireSingleFinanceCurrencyPolicy, type FinanceCurrencyPolicy } from '@/lib/finance-currency-policy'

const policy: FinanceCurrencyPolicy = {
  functionalCurrencyCode: 'THB',
}

describe('finance currency policy contract', () => {
  it('accepts exactly one complete policy', () => {
    expect(requireSingleFinanceCurrencyPolicy([policy])).toEqual(policy)
  })

  it('fails closed when no policy is configured', () => {
    expect(() => requireSingleFinanceCurrencyPolicy([])).toThrow('ยังไม่ได้ตั้งค่า policy สกุลเงินการเงิน')
  })

  it('fails closed when more than one policy row exists', () => {
    expect(() => requireSingleFinanceCurrencyPolicy([policy, policy])).toThrow('พบ policy สกุลเงินการเงินมากกว่าหนึ่งรายการ')
  })

  it('rejects a policy with an invalid runtime contract', () => {
    expect(() => requireSingleFinanceCurrencyPolicy([{
      ...policy,
      functionalCurrencyCode: '   ',
    }])).toThrow('functional currency ของ policy ไม่ถูกต้อง')
  })
})
