import { describe, expect, it } from 'vitest'

import {
  isBlankCustomerAdvanceReceiptLine,
  isBlankPaymentLine,
  isBlankPaymentSplit,
  isBlankReceiptLine,
  isBlankReceiptSplit,
} from './MoneyMovementPageClient'
import { isBlankExpenseLine } from './DailyExpensePageClient'
import { isBlankApprovalSplit } from './PaymentApprovalPageClient'
import { isBlankStockTransferItem } from './StockTransferPageClient'

describe('money movement local-row removal safety', () => {
  it('distinguishes blank seeded rows from populated finance rows', () => {
    expect(isBlankCustomerAdvanceReceiptLine({
      customerAdvanceDocNo: '',
      receiptAmount: 0,
    })).toBe(true)
    expect(isBlankCustomerAdvanceReceiptLine({
      customerAdvanceDocNo: 'CADV-001',
      receiptAmount: 0,
    })).toBe(false)

    expect(isBlankReceiptLine({
      discountAmount: 0,
      receiptAmount: 0,
      salesBillDocNo: '',
      withholdingTaxAmount: 0,
    })).toBe(true)
    expect(isBlankReceiptLine({
      discountAmount: 0,
      receiptAmount: 500,
      salesBillDocNo: '',
      withholdingTaxAmount: 0,
    })).toBe(false)

    expect(isBlankPaymentLine({
      amount: 0,
      approvalId: null,
      billId: '',
      billText: '',
      discount: 0,
      fee: 0,
      supplierId: '',
      withholdingTax: 0,
    })).toBe(true)
    expect(isBlankPaymentLine({
      amount: 0,
      approvalId: null,
      billId: '',
      billText: 'PB-001',
      discount: 0,
      fee: 0,
      supplierId: '',
      withholdingTax: 0,
    })).toBe(false)

    expect(isBlankPaymentSplit({ accountId: '', amount: 0 })).toBe(true)
    expect(isBlankPaymentSplit({ accountId: 'BANK-001', amount: 0 })).toBe(false)

    expect(isBlankReceiptSplit({ accountId: '', amount: 0, method: '' })).toBe(true)
    expect(isBlankReceiptSplit({ accountId: '', amount: 0, method: 'transfer' })).toBe(false)
  })
})

describe('daily expense local-row removal safety', () => {
  it('treats only an untouched seeded expense line as blank', () => {
    const blankLine = {
      amount: 0,
      categoryId: null,
      categoryName: '',
      description: null,
      hasVat: false,
      vatAmount: 0,
      vatPct: 0,
      whtAmount: 0,
      whtPct: 0,
    }

    expect(isBlankExpenseLine(blankLine)).toBe(true)
    expect(isBlankExpenseLine({ ...blankLine, description: 'ค่าขนส่ง' })).toBe(false)
    expect(isBlankExpenseLine({ ...blankLine, categoryId: 'EXP-001' })).toBe(false)
    expect(isBlankExpenseLine({ ...blankLine, amount: 1250 })).toBe(false)
    expect(isBlankExpenseLine({ ...blankLine, hasVat: true })).toBe(false)
  })
})

describe('payment approval local-row removal safety', () => {
  it('keeps the default zero split blank but detects destination, amount, or draft edits', () => {
    const blankSplit = {
      amount: 0,
      destinationId: 'BANK-DEFAULT',
    }

    expect(isBlankApprovalSplit(blankSplit, undefined, 'BANK-DEFAULT')).toBe(true)
    expect(isBlankApprovalSplit(blankSplit, '0.00', 'BANK-DEFAULT')).toBe(true)
    expect(isBlankApprovalSplit({ ...blankSplit, amount: 100 }, undefined, 'BANK-DEFAULT')).toBe(false)
    expect(isBlankApprovalSplit({ ...blankSplit, destinationId: 'BANK-OTHER' }, undefined, 'BANK-DEFAULT')).toBe(false)
    expect(isBlankApprovalSplit(blankSplit, '1', 'BANK-DEFAULT')).toBe(false)
  })
})

describe('stock transfer local-row removal safety', () => {
  it('treats only a product-less zero-quantity item as blank', () => {
    expect(isBlankStockTransferItem({ productId: '', qty: 0 })).toBe(true)
    expect(isBlankStockTransferItem({ productId: 'PRODUCT-001', qty: 0 })).toBe(false)
    expect(isBlankStockTransferItem({ productId: '', qty: 25 })).toBe(false)
  })
})
