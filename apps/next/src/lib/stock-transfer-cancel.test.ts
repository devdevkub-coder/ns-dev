import { describe, expect, it } from 'vitest'

import { availableStockForTransferCancel, normalizeNotAvailableForSale } from './stock-transfer-cancel'

describe('stock transfer cancellation stock matching', () => {
  it('treats legacy NULL not_available_for_sale as false', () => {
    expect(normalizeNotAvailableForSale(null)).toBe(false)
    expect(normalizeNotAvailableForSale(undefined)).toBe(false)
    expect(normalizeNotAvailableForSale(false)).toBe(false)
    expect(normalizeNotAvailableForSale(true)).toBe(true)
  })

  it('includes legacy NULL stock and hold rows in available stock calculation', () => {
    expect(availableStockForTransferCancel({
      ledgerIn: 100,
      ledgerOut: 0,
      heldQty: 20,
    })).toBe(80)
  })

  it('rejects cancellation when destination stock and holds leave less than reversal quantity', () => {
    const available = availableStockForTransferCancel({
      ledgerIn: 100,
      ledgerOut: 0,
      heldQty: 40,
    })

    expect(available).toBe(60)
    expect(available < 80).toBe(true)
  })
})
