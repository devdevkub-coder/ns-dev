import { Prisma } from '../../../generated/prisma/client'

export const CUSTOMER_RECEIPT_SETTLEMENT_DIFFERENCE_REASON = {
  AR_SETTLEMENT_FX: 'fx_settlement',
} as const

/**
 * A settlement difference is not a free-text client classification. For an SB
 * receipt it is deterministically FX from the receipt-rate snapshot; CADV has
 * no AR settlement and must reconcile exactly. Bank fee and discount have
 * their own persisted fields, while overpayment requires its own document.
 */
export function settlementDifferenceReasonForReceipt(sourceType: 'SB' | 'CADV', settlementDifference: Prisma.Decimal) {
  if (sourceType === 'CADV') {
    if (!settlementDifference.eq(0)) {
      throw new Error('ยอดตัด CADV ต้องเท่ากับยอด settlement (THB) และห้ามสร้างส่วนต่างอัตโนมัติ')
    }
    return null
  }
  if (settlementDifference.lt(0)) {
    throw new Error('มูลค่าเงินที่รับตามอัตราแลกเปลี่ยนต่ำกว่ายอดรับ THB ต้องบันทึกเป็นการรับบางส่วน ไม่ใช่ขาดทุน FX')
  }
  return settlementDifference.eq(0) ? null : CUSTOMER_RECEIPT_SETTLEMENT_DIFFERENCE_REASON.AR_SETTLEMENT_FX
}
