export const PURCHASE_BILL_STATUS = {
  CANCELLED: 'cancelled',
  CANCELLED_SUPPLIER_SWAP: 'cancelled_supplier_swap',
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
} as const

export type PurchaseBillStatus = typeof PURCHASE_BILL_STATUS[keyof typeof PURCHASE_BILL_STATUS]

const PURCHASE_BILL_STATUS_VALUES = new Set<string>(Object.values(PURCHASE_BILL_STATUS))

export const PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS = PURCHASE_BILL_STATUS.CANCELLED_SUPPLIER_SWAP

export const PURCHASE_BILL_CANCELLED_STATUSES = [
  PURCHASE_BILL_STATUS.CANCELLED,
  PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS,
] as const

export type PurchaseBillCancelledStatus = typeof PURCHASE_BILL_CANCELLED_STATUSES[number]

export function requirePurchaseBillStatus(status: string | null | undefined, docNo: string): PurchaseBillStatus {
  if (!status || !PURCHASE_BILL_STATUS_VALUES.has(status)) {
    throw new Error(`Purchase Bill ${docNo} มีสถานะไม่ถูกต้อง`)
  }
  return status as PurchaseBillStatus
}

export function isPurchaseBillCancelledStatus(status: string | null | undefined, docNo: string) {
  const canonicalStatus = requirePurchaseBillStatus(status, docNo)
  return PURCHASE_BILL_CANCELLED_STATUSES.includes(canonicalStatus as PurchaseBillCancelledStatus)
}

export function isPurchaseBillActiveStatus(status: string | null | undefined, docNo: string) {
  return !isPurchaseBillCancelledStatus(status, docNo)
}

export function purchaseBillStatusText(status: string | null | undefined) {
  const normalized = requirePurchaseBillStatus(status, 'status')
  const labels: Record<PurchaseBillStatus, string> = {
    [PURCHASE_BILL_STATUS.UNPAID]: 'ยังไม่ชำระเงิน',
    [PURCHASE_BILL_STATUS.PARTIAL]: 'ชำระเงินบางส่วน',
    [PURCHASE_BILL_STATUS.PAID]: 'เสร็จสิ้น',
    [PURCHASE_BILL_STATUS.CANCELLED]: 'ยกเลิก',
    [PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS]: 'ยกเลิก/เปลี่ยนผู้ขาย',
  }
  return labels[normalized]
}
