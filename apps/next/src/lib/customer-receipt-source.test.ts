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

  it('accepts a foreign receipt rate with three decimal places', () => {
    const result = customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      receiptCurrencyCode: 'USD',
      customerTransferredNativeAmount: 100,
      receivedNativeAmount: 100,
      fxRate: 35.125,
      fxRateType: 'TT Selling',
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 3512.5 }],
      customerAdvanceLines: [],
    })

    expect(result.fxRate).toBe(35.125)
  })

  it('rejects a foreign receipt rate with more than three decimal places', () => {
    expect(() => customerReceiptFormSchema.parse({
      ...baseReceipt,
      sourceType: 'SB',
      receiptCurrencyCode: 'USD',
      customerTransferredNativeAmount: 100,
      receivedNativeAmount: 100,
      fxRate: 35.1234,
      fxRateType: 'TT Selling',
      salesBillLines: [{ salesBillDocNo: 'SB2607-0001', receiptAmount: 3512.34 }],
      customerAdvanceLines: [],
    })).toThrow('อัตราแลกเปลี่ยนต้องมีทศนิยมไม่เกิน 3 ตำแหน่ง')
  })
})
