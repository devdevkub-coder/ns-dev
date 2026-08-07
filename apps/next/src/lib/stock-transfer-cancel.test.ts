import { describe, expect, it } from 'vitest'

import {
  availableStockForTransfer,
  availableStockForTransferCancel,
  normalizeNotAvailableForSale,
  normalizeStockTransferCancelReason,
} from './stock-transfer-cancel'

describe('stock transfer cancellation reason', () => {
  it('trims and keeps a valid reason', () => {
    expect(normalizeStockTransferCancelReason('  สินค้าผิดรายการ  ')).toBe('สินค้าผิดรายการ')
  })

  it('rejects an empty or non-string reason', () => {
    expect(() => normalizeStockTransferCancelReason('   ')).toThrow('กรุณาระบุเหตุผลการยกเลิก')
    expect(() => normalizeStockTransferCancelReason(undefined)).toThrow('กรุณาระบุเหตุผลการยกเลิก')
  })

  it('rejects a reason longer than 500 characters', () => {
    expect(() => normalizeStockTransferCancelReason('ก'.repeat(501))).toThrow('ไม่เกิน 500 ตัวอักษร')
  })
})

describe('stock transfer cancellation stock matching', () => {
  it('excludes pending-in stock from transferable quantity', () => {
    expect(availableStockForTransfer({ qty: 206.23, onHoldQty: 0 })).toBe(206.23)
    expect(availableStockForTransfer({ qty: 206.23, onHoldQty: 6.23 })).toBe(200)
    expect(availableStockForTransfer({ qty: 206.23, onHoldQty: 211.23 })).toBe(0)
  })

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
