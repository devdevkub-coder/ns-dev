import { describe, expect, it } from 'vitest'
import { functionalBankStatementMovement, reverseFunctionalBankStatementInflow } from './bank-statement-booking'

describe('functionalBankStatementMovement', () => {
  it('writes the same persisted native and book facts for a functional-currency receipt', () => {
    const result = functionalBankStatementMovement({
      amountIn: '1250.50',
      amountOut: '0',
      functionalCurrencyCode: 'thb',
      idempotencyKey: 'rcp:RCP0101-0001:split:1',
      sourceEventKey: 'customer-receipt:RCP0101-0001:split:1',
      sourceEventType: 'customer_receipt',
    })

    expect(result.movement_currency_code).toBe('THB')
    expect(result.amount_in.toFixed(2)).toBe('1250.50')
    expect(result.amount_out.toFixed(2)).toBe('0.00')
    expect(result.native_amount_in.toFixed(2)).toBe('1250.50')
    expect(result.book_amount_in.toFixed(2)).toBe('1250.50')
  })

  it('reverses from the persisted native and book facts without recalculating a rate', () => {
    const result = reverseFunctionalBankStatementInflow({
      bookAmountIn: '3500',
      bookFxRate: null,
      idempotencyKey: 'rcp:RCP0101-0001:cancel:split:1',
      movementCurrencyCode: 'THB',
      nativeAmountIn: '3500',
      sourceEventKey: 'customer-receipt:RCP0101-0001:cancel:split:1',
      sourceEventType: 'customer_receipt_reversal',
    })

    expect(result.amount_out.toFixed(2)).toBe('3500.00')
    expect(result.native_amount_out.toFixed(2)).toBe('3500.00')
    expect(result.book_amount_out.toFixed(2)).toBe('3500.00')
    expect(result.movement_currency_code).toBe('THB')
  })

  it('rejects a two-sided or over-precision movement', () => {
    expect(() => functionalBankStatementMovement({
      amountIn: '1',
      amountOut: '1',
      functionalCurrencyCode: 'THB',
      idempotencyKey: 'invalid-1',
      sourceEventKey: 'invalid-1',
      sourceEventType: 'test',
    })).toThrow('ต้องมีเงินเข้า หรือ เงินออกเพียงด้านเดียว')

    expect(() => functionalBankStatementMovement({
      amountIn: '1.001',
      amountOut: '0',
      functionalCurrencyCode: 'THB',
      idempotencyKey: 'invalid-2',
      sourceEventKey: 'invalid-2',
      sourceEventType: 'test',
    })).toThrow('ยอดเงินใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง')
  })
})
