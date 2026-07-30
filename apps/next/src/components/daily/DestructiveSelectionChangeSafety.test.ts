import { describe, expect, it } from 'vitest'

import { receiptSourceChangeWillDiscardData } from './MoneyMovementPageClient'
import { hasManualAllocationData } from '../stock/StockOperationPageClient'

describe('destructive selection change safety', () => {
  it('allows an untouched receipt form to switch source type but protects populated receipt data', () => {
    expect(receiptSourceChangeWillDiscardData({
      customerAdvanceLines: [],
      salesBillLines: [{ discountAmount: 0, id: null, receiptAmount: 0, salesBillDocNo: '', withholdingTaxAmount: 0 }],
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    })).toBe(false)
    expect(receiptSourceChangeWillDiscardData({
      customerAdvanceLines: [],
      salesBillLines: [{ discountAmount: 0, id: null, receiptAmount: 350, salesBillDocNo: 'SB-001', withholdingTaxAmount: 0 }],
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    })).toBe(true)
    expect(receiptSourceChangeWillDiscardData({
      customerAdvanceLines: [{ customerAdvanceDocNo: 'CADV-001', id: null, receiptAmount: 200 }],
      salesBillLines: [],
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    })).toBe(true)
    expect(receiptSourceChangeWillDiscardData({
      customerAdvanceLines: [],
      salesBillLines: [],
      splits: [{ accountId: 'BANK-001', amount: 0, id: null, method: 'transfer' }],
    })).toBe(true)
  })

  it('protects every existing manual cost-pool allocation', () => {
    expect(hasManualAllocationData([])).toBe(false)
    expect(hasManualAllocationData([{ poolEntryId: 'POOL-001', qty: 0 }])).toBe(true)
    expect(hasManualAllocationData([{ poolEntryId: 'POOL-001', qty: 25 }])).toBe(true)
  })
})
