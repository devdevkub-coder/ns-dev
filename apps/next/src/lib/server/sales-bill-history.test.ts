import { describe, expect, it } from 'vitest'
import {
  isSalesBillActiveStatus,
  isSalesBillCancelledStatus,
  requireSalesBillStatus,
  salesBillStatusText,
  SALES_BILL_STATUS,
} from './sales-bill-history'

describe('sales bill status contract', () => {
  it('accepts canonical statuses and derives active state from them', () => {
    expect(requireSalesBillStatus(SALES_BILL_STATUS.UNRECEIVED, 'SB2607-0001')).toBe(SALES_BILL_STATUS.UNRECEIVED)
    expect(isSalesBillActiveStatus(SALES_BILL_STATUS.RECEIVED, 'SB2607-0001')).toBe(true)
    expect(isSalesBillCancelledStatus(SALES_BILL_STATUS.CANCELLED, 'SB2607-0001')).toBe(true)
    expect(salesBillStatusText(SALES_BILL_STATUS.PARTIAL)).toBe('รับเงินบางส่วน')
  })

  it('rejects missing and legacy statuses instead of treating them as active', () => {
    expect(() => requireSalesBillStatus('open', 'SB2607-0001')).toThrow('SB2607-0001')
    expect(() => isSalesBillActiveStatus(null, 'SB2607-0001')).toThrow('SB2607-0001')
  })
})
