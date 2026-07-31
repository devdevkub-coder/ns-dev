import { describe, expect, it } from 'vitest'
import {
  derivePoSellFulfillmentStatus,
  isInactivePoSellStatus,
  PO_SELL_STATUS,
  requirePoSellStatus,
} from './po-sell-status'

describe('PO Sell status contract', () => {
  it('derives the header status from the remaining quantity', () => {
    const base = { currentStatus: PO_SELL_STATUS.OPEN, docNo: 'POS2607-0001', totalQty: 100 }

    expect(derivePoSellFulfillmentStatus({ ...base, remainingQty: 100 })).toBe(PO_SELL_STATUS.OPEN)
    expect(derivePoSellFulfillmentStatus({ ...base, remainingQty: 40 })).toBe(PO_SELL_STATUS.PARTIALLY_FULFILLED)
    expect(derivePoSellFulfillmentStatus({ ...base, remainingQty: 0 })).toBe(PO_SELL_STATUS.COMPLETED)
  })

  it('preserves manual terminal states when a sales bill is reversed', () => {
    expect(derivePoSellFulfillmentStatus({
      currentStatus: PO_SELL_STATUS.CANCELLED,
      docNo: 'POS2607-0001',
      remainingQty: 100,
      totalQty: 100,
    })).toBe(PO_SELL_STATUS.CANCELLED)
    expect(isInactivePoSellStatus(PO_SELL_STATUS.SHORT_CLOSED, 'POS2607-0001')).toBe(true)
  })

  it('rejects missing and legacy values instead of defaulting them', () => {
    expect(() => requirePoSellStatus('Partial', 'POS2607-0001')).toThrow('POS2607-0001')
    expect(() => requirePoSellStatus(null, 'POS2607-0001')).toThrow('POS2607-0001')
  })
})
