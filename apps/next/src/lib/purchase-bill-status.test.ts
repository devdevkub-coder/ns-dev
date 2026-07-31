import { describe, expect, it } from 'vitest'
import {
  isPurchaseBillActiveStatus,
  isPurchaseBillCancelledStatus,
  PURCHASE_BILL_STATUS,
  purchaseBillStatusText,
  requirePurchaseBillStatus,
} from './purchase-bill-status'

describe('purchase bill status contract', () => {
  it('accepts canonical statuses and presents their labels', () => {
    expect(requirePurchaseBillStatus(PURCHASE_BILL_STATUS.UNPAID, 'PB2607-0001')).toBe(PURCHASE_BILL_STATUS.UNPAID)
    expect(isPurchaseBillCancelledStatus(PURCHASE_BILL_STATUS.CANCELLED, 'PB2607-0001')).toBe(true)
    expect(isPurchaseBillCancelledStatus(PURCHASE_BILL_STATUS.CANCELLED_SUPPLIER_SWAP, 'PB2607-0001')).toBe(true)
    expect(isPurchaseBillActiveStatus(PURCHASE_BILL_STATUS.UNPAID, 'PB2607-0001')).toBe(true)
    expect(purchaseBillStatusText(PURCHASE_BILL_STATUS.PARTIAL)).toBe('ชำระเงินบางส่วน')
  })

  it('rejects missing and legacy statuses instead of defaulting them', () => {
    expect(() => requirePurchaseBillStatus('open', 'PB2607-0001')).toThrow('PB2607-0001')
    expect(() => isPurchaseBillCancelledStatus(null, 'PB2607-0001')).toThrow('PB2607-0001')
    expect(() => isPurchaseBillActiveStatus('open', 'PB2607-0001')).toThrow('PB2607-0001')
  })
})
