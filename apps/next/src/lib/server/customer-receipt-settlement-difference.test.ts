import { Prisma } from '../../../generated/prisma/client'
import { describe, expect, it } from 'vitest'
import { settlementDifferenceReasonForReceipt } from './customer-receipt-settlement-difference'

describe('foreign customer receipt settlement difference classification', () => {
  it('classifies only a non-zero SB difference as AR settlement FX', () => {
    expect(settlementDifferenceReasonForReceipt('SB', new Prisma.Decimal('0.00'))).toBeNull()
    expect(settlementDifferenceReasonForReceipt('SB', new Prisma.Decimal('100.00'))).toBe('fx_settlement')
    expect(() => settlementDifferenceReasonForReceipt('SB', new Prisma.Decimal('-0.01'))).toThrow('ต้องบันทึกเป็นการรับบางส่วน')
  })

  it('keeps CADV separate from AR settlement FX', () => {
    expect(settlementDifferenceReasonForReceipt('CADV', new Prisma.Decimal('0.00'))).toBeNull()
    expect(() => settlementDifferenceReasonForReceipt('CADV', new Prisma.Decimal('0.01'))).toThrow('ยอดตัด CADV ต้องเท่ากับยอด settlement')
  })
})
