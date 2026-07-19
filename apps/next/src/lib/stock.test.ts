import { describe, expect, it } from 'vitest'

import { isVisibleStockBalanceTotal } from './stock'

describe('stock balance matrix visibility', () => {
  const emptyBalance = { awaitingBillQty: 0, onHoldQty: 0, qty: 0, value: 0 }

  it('hides a product when multiple source rows aggregate to zero', () => {
    expect(isVisibleStockBalanceTotal([
      { ...emptyBalance, qty: 10, value: 100 },
      { ...emptyBalance, qty: -10, value: -100 },
    ])).toBe(false)
  })

  it('keeps a standalone negative product visible', () => {
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, qty: -20 }])).toBe(true)
  })

  it('keeps positive stock that is fully on hold visible', () => {
    expect(isVisibleStockBalanceTotal([
      { awaitingBillQty: 0, onHoldQty: 25, qty: 25, value: 2_500 },
    ])).toBe(true)
  })

  it('keeps zero-quantity products with value or pending work visible', () => {
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, value: 20 }])).toBe(true)
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, awaitingBillQty: 20 }])).toBe(true)
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, onHoldQty: 20 }])).toBe(true)
  })

  it('does not use ready quantity to decide visibility', () => {
    const readyOnlyBalance = { ...emptyBalance, readyQty: 20 }
    expect(isVisibleStockBalanceTotal([readyOnlyBalance])).toBe(false)
  })
})
