import { describe, expect, it } from 'vitest'
import { calculateCustomerReceiptCashRequired, calculateCustomerReceiptSettlement } from './customer-receipt-settlement'

describe('customer receipt settlement calculation', () => {
  it('derives the foreign receipt cash target from outstanding AR after discount and withholding tax', () => {
    expect(calculateCustomerReceiptCashRequired(9_619.30, 1, 0)).toBe(9_618.30)
    expect(calculateCustomerReceiptCashRequired(9_619.30, 100, 100)).toBe(9_419.30)
  })

  it('closes the selected AR and records the excess receipt value as FX gain', () => {
    const cashRequired = calculateCustomerReceiptCashRequired(9_619.30, 1, 0)
    const result = calculateCustomerReceiptSettlement([
      { discountAmount: 1, receiptAmount: cashRequired, withholdingTaxAmount: 0 },
    ], 33_388)

    expect(result.cashRequiredAmount).toBe(9_618.30)
    expect(result.arSettledAmount).toBe(9_619.30)
    expect(result.settlementFxGain).toBe(23_769.70)
  })

  it('classifies receipt value above the cash required for AR as settlement FX gain', () => {
    const result = calculateCustomerReceiptSettlement([
      { discountAmount: 0, receiptAmount: 9_619.30, withholdingTaxAmount: 0 },
    ], 33_388)

    expect(result.cashRequiredAmount).toBe(9_619.30)
    expect(result.cashAppliedAmount).toBe(9_619.30)
    expect(result.arSettledAmount).toBe(9_619.30)
    expect(result.settlementFxGain).toBe(23_768.70)
  })

  it('deducts discount and withholding tax before comparing cash required with settlement', () => {
    const result = calculateCustomerReceiptSettlement([
      { discountAmount: 100, receiptAmount: 9_419.30, withholdingTaxAmount: 100 },
    ], 33_388)

    expect(result.cashRequiredAmount).toBe(9_419.30)
    expect(result.discountAmount).toBe(100)
    expect(result.withholdingTaxAmount).toBe(100)
    expect(result.arSettledAmount).toBe(9_619.30)
    expect(result.settlementFxGain).toBe(23_968.70)
  })

  it('caps cash applied for a partial receipt without turning the shortfall into FX loss', () => {
    const result = calculateCustomerReceiptSettlement([
      { discountAmount: 100, receiptAmount: 9_519.30, withholdingTaxAmount: 0 },
    ], 5_000)

    expect(result.cashRequiredAmount).toBe(9_519.30)
    expect(result.cashAppliedAmount).toBe(5_000)
    expect(result.arSettledAmount).toBe(5_100)
    expect(result.settlementFxGain).toBe(0)
    expect(result.lines[0]?.receiptAmount).toBe(5_000)
  })

  it('reconciles proportional multi-bill allocation at two decimals', () => {
    const result = calculateCustomerReceiptSettlement([
      { discountAmount: 0, receiptAmount: 60, withholdingTaxAmount: 0 },
      { discountAmount: 0, receiptAmount: 40, withholdingTaxAmount: 0 },
    ], 33.33)

    expect(result.lines.map((line) => line.receiptAmount)).toEqual([20, 13.33])
    expect(result.cashAppliedAmount).toBe(33.33)
    expect(result.settlementFxGain).toBe(0)
  })
})
