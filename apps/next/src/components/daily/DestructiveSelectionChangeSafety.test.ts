import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  customerAdvanceLineReplacementWillDiscardData,
  receiptDateChangeWillDiscardData,
  receiptForeignSettlementWillDiscardData,
  receiptLineReplacementWillDiscardData,
  receiptSourceChangeWillDiscardData,
} from './MoneyMovementPageClient'
import { hasManualAllocationData } from '../stock/StockOperationPageClient'

describe('destructive selection change safety', () => {
  it('allows an untouched receipt form to switch source type but protects populated receipt data', () => {
    const receiptWithRetainedCustomer = {
      customerAdvanceLines: [],
      customerId: 'CUSTOMER-001',
      salesBillLines: [{ discountAmount: 0, id: null, receiptAmount: 0, salesBillDocNo: '', withholdingTaxAmount: 0 }],
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    }

    expect(receiptSourceChangeWillDiscardData({
      customerAdvanceLines: [],
      salesBillLines: [{ discountAmount: 0, id: null, receiptAmount: 0, salesBillDocNo: '', withholdingTaxAmount: 0 }],
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    })).toBe(false)
    expect(receiptSourceChangeWillDiscardData({
      customerAdvanceLines: [],
      receiptCurrencyCode: 'THB',
      salesBillLines: [{ discountAmount: 0, id: null, receiptAmount: 0, salesBillDocNo: '', withholdingTaxAmount: 0 }],
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    }, 'THB')).toBe(false)
    expect(receiptSourceChangeWillDiscardData(receiptWithRetainedCustomer)).toBe(false)
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
    expect(receiptSourceChangeWillDiscardData({
      customerAdvanceLines: [],
      fxRate: 34.5,
      receiptCurrencyCode: 'USD',
      receivedNativeAmount: 100,
      salesBillLines: [],
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    }, 'THB')).toBe(true)
  })

  it('protects every existing manual cost-pool allocation', () => {
    expect(hasManualAllocationData([])).toBe(false)
    expect(hasManualAllocationData([{ poolEntryId: 'POOL-001', qty: 0 }])).toBe(true)
    expect(hasManualAllocationData([{ poolEntryId: 'POOL-001', qty: 25 }])).toBe(true)
  })

  it('only confirms receipt selector changes when they discard entered values', () => {
    expect(receiptForeignSettlementWillDiscardData({
      accountId: '',
      customerTransferredNativeAmount: undefined,
      fee: 0,
      fxRate: undefined,
      fxRateOverrideReason: null,
      fxRateType: undefined,
      receivedNativeAmount: undefined,
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    })).toBe(false)
    expect(receiptForeignSettlementWillDiscardData({
      accountId: 'FCD-001',
      customerTransferredNativeAmount: 100,
      fee: 0,
      fxRate: 34.5,
      fxRateOverrideReason: null,
      fxRateType: 'TT',
      receivedNativeAmount: 100,
      splits: [{ accountId: 'FCD-001', amount: 100, id: null, method: 'transfer' }],
    })).toBe(true)
    expect(receiptForeignSettlementWillDiscardData({
      fxRateType: 'TT',
      splits: [{ accountId: '', amount: 0, id: null, method: '' }],
    }, { includeFxRateType: false })).toBe(false)
    expect(receiptDateChangeWillDiscardData({ fxRate: undefined, fxRateOverrideReason: null })).toBe(false)
    expect(receiptDateChangeWillDiscardData({ fxRate: 34.5, fxRateOverrideReason: null })).toBe(true)
    expect(receiptLineReplacementWillDiscardData(
      { discountAmount: 0, id: null, receiptAmount: 100, salesBillDocNo: 'SB-001', withholdingTaxAmount: 0 },
      'SB-001',
    )).toBe(false)
    expect(receiptLineReplacementWillDiscardData(
      { discountAmount: 0, id: null, receiptAmount: 100, salesBillDocNo: 'SB-001', withholdingTaxAmount: 0 },
      'SB-002',
    )).toBe(true)
    expect(customerAdvanceLineReplacementWillDiscardData(
      { customerAdvanceDocNo: 'CADV-001', id: null, receiptAmount: 100 },
      'CADV-001',
    )).toBe(false)
    expect(customerAdvanceLineReplacementWillDiscardData(
      { customerAdvanceDocNo: 'CADV-001', id: null, receiptAmount: 100 },
      'CADV-002',
    )).toBe(true)
  })

  it('defers destructive receipt selector changes to the confirmation callback', () => {
    const source = readFileSync(new URL('./MoneyMovementPageClient.tsx', import.meta.url), 'utf8')
    const handlers = [
      ['changeReceiptCurrency', 'applyCurrency'],
      ['changeReceiptDate', 'applyDate'],
      ['changeReceiptBranch', 'applyBranch'],
      ['changeReceiptCustomer', 'applyCustomer'],
      ['selectReceiptLineBill', 'applyBill'],
      ['selectCustomerAdvanceLine', 'applyAdvance'],
    ] as const

    for (const [handler, apply] of handlers) {
      const start = source.indexOf(`function ${handler}`)
      const nextHandler = source.indexOf('\n  function ', start + 1)
      const handlerSource = source.slice(start, nextHandler === -1 ? undefined : nextHandler)

      expect(start, handler).toBeGreaterThanOrEqual(0)
      expect(handlerSource, handler).toContain(`const ${apply} = () => {`)
      expect(handlerSource, handler).toContain('requestConfirmation({')
      expect(handlerSource, handler).toContain(`onConfirm: ${apply}`)
    }

    for (const [handler, lines, field] of [
      ['selectReceiptLineBill', 'receiptLines', 'salesBillDocNo'],
      ['selectCustomerAdvanceLine', 'customerAdvanceReceiptLines', 'customerAdvanceDocNo'],
    ] as const) {
      const start = source.indexOf(`function ${handler}`)
      const nextHandler = source.indexOf('\n  function ', start + 1)
      const handlerSource = source.slice(start, nextHandler === -1 ? undefined : nextHandler)

      expect(handlerSource, handler).toContain(`if (${lines}[index]?.${field} === docNo) return`)
    }
  })
})
