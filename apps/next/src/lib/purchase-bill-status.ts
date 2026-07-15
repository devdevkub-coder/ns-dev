export const PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS = 'cancelled_supplier_swap' as const

export const PURCHASE_BILL_CANCELLED_STATUSES = [
  'cancelled',
  PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS,
] as const

export type PurchaseBillCancelledStatus = typeof PURCHASE_BILL_CANCELLED_STATUSES[number]

export function isPurchaseBillCancelledStatus(status: string | null | undefined) {
  return PURCHASE_BILL_CANCELLED_STATUSES.includes(String(status ?? '').toLowerCase() as PurchaseBillCancelledStatus)
}

export function purchaseBillStatusText(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  const labels: Record<string, string> = {
    cancelled: 'ยกเลิก',
    [PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS]: 'ยกเลิก/เปลี่ยนผู้ขาย',
  }
  return labels[normalized] ?? (status || '-')
}
