import { describe, expect, it } from 'vitest'
import { allocateCarryingAmounts, fcdReceiptBankStatementInflow, fcdReceiptBankStatementReversal } from './fcd-receipt-posting'

describe('allocateCarryingAmounts', () => {
  it('keeps the rounded account split carrying amount reconciled to the receipt total', () => {
    const result = allocateCarryingAmounts([
      { accountCode: 'FCD-1', nativeAmount: '33.33' },
      { accountCode: 'FCD-2', nativeAmount: '66.67' },
    ], '35.123')

    expect(result.map((split) => split.carryingThbAmount.toFixed(2))).toEqual(['1170.65', '2341.65'])
    expect(result.reduce((sum, split) => sum.plus(split.carryingThbAmount), result[0]!.carryingThbAmount.minus(result[0]!.carryingThbAmount)).toFixed(2)).toBe('3512.30')
  })
})

describe('FCD Bank Statement compatibility', () => {
  it('mirrors the converted THB amount into the existing Bank Statement fields', () => {
    const result = fcdReceiptBankStatementInflow('100.00', '3500.00')
    expect(result.amount_in.toFixed(2)).toBe('3500.00')
    expect(result.book_amount_in.toFixed(2)).toBe('3500.00')
    expect(result.native_amount_in.toFixed(2)).toBe('100.00')
  })

  it('reverses the same persisted THB amount without converting the native amount again', () => {
    const result = fcdReceiptBankStatementReversal('100.00', '3500.00')
    expect(result.amount_out.toFixed(2)).toBe('3500.00')
    expect(result.book_amount_out.toFixed(2)).toBe('3500.00')
    expect(result.native_amount_out.toFixed(2)).toBe('100.00')
  })
})
