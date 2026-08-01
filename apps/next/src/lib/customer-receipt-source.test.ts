import { describe, expect, it } from 'vitest'
import { customerReceiptFormSchema } from './daily'

const baseReceipt = {
  branchId: 'BR-001',
  date: '2026-07-18',
  customerId: 'CUS-001',
  accountId: 'ACC-001',
  amount: 1000,
  withholdingTax: 0,
  discount: 0,
  fee: 0,
  method: 'โอนเงิน',
  notes: '',
  splits: [{ method: 'โอนเงิน', accountId: 'ACC-001', amount: 1000 }],
}

describe('customer receipt source contract', () => {
  it('accepts an SB receipt with sales bill lines only', () => {
    const result = customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 1000 }],
      customerAdvanceLines: [],
    })

    expect(result.sourceType).toBe('SB')
    expect(result.salesBillLines).toHaveLength(1)
    expect(result.customerAdvanceLines).toHaveLength(0)
  })

  it('keeps a functional-currency receipt on the legacy THB path without FX inputs', () => {
    const result = customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 1000 }],
      customerAdvanceLines: [],
      receiptCurrencyCode: 'THB',
    })

    expect(result.receiptCurrencyCode).toBe('THB')
    expect(result.customerTransferredNativeAmount).toBeUndefined()
    expect(result.fxRate).toBeUndefined()
  })

  it('accepts a CADV receipt with customer advance lines only', () => {
    const result = customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'CADV',
      customerAdvanceLines: [{ customerAdvanceDocNo: 'CADV2607-0001', receiptAmount: 1000 }],
      salesBillLines: [],
    })

    expect(result.sourceType).toBe('CADV')
    expect(result.customerAdvanceLines).toHaveLength(1)
    expect(result.salesBillLines).toHaveLength(0)
  })

  it('rejects mixed source lines instead of silently selecting one source', () => {
    expect(() => customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 1000 }],
      customerAdvanceLines: [{ customerAdvanceDocNo: 'CADV2607-0001', receiptAmount: 1000 }],
    })).toThrow()
  })

  it('rejects CADV without CADV lines', () => {
    expect(() => customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'CADV',
      salesBillLines: [],
      customerAdvanceLines: [],
    })).toThrow()
  })

  it('accepts a foreign receipt rate with two decimal places', () => {
    const result = customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      receiptCurrencyCode: 'USD',
      customerTransferredNativeAmount: 100,
      fxRate: 35.12,
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 3512 }],
      customerAdvanceLines: [],
    })

    expect(result.fxRate).toBe(35.12)
  })

  it('rejects a foreign receipt rate with more than two decimal places', () => {
    expect(() => customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      receiptCurrencyCode: 'USD',
      customerTransferredNativeAmount: 100,
      fxRate: 35.123,
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 3512.3 }],
      customerAdvanceLines: [],
    })).toThrow('อัตราแลกเปลี่ยนต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง')
  })

  it('does not expose the retired second native amount or FX override reason', () => {
    const result = customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      receiptCurrencyCode: 'USD',
      customerTransferredNativeAmount: 100,
      receivedNativeAmount: 99,
      fxRate: 35.12,
      fxRateOverrideReason: 'ไม่ควรรับ field นี้',
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 3512.3 }],
      customerAdvanceLines: [],
    })

    expect(result).not.toHaveProperty('receivedNativeAmount')
    expect(result).not.toHaveProperty('fxRateOverrideReason')
    expect(result).not.toHaveProperty('fxRateType')
  })
})
