const MAX_STOCK_TRANSFER_CANCEL_REASON_LENGTH = 500

export function normalizeStockTransferCancelReason(value: unknown) {
  if (typeof value !== 'string') throw new Error('กรุณาระบุเหตุผลการยกเลิก')
  const reason = value.trim()
  if (!reason) throw new Error('กรุณาระบุเหตุผลการยกเลิก')
  if (reason.length > MAX_STOCK_TRANSFER_CANCEL_REASON_LENGTH) {
    throw new Error(`เหตุผลการยกเลิกต้องไม่เกิน ${MAX_STOCK_TRANSFER_CANCEL_REASON_LENGTH} ตัวอักษร`)
  }
  return reason
}

export function normalizeNotAvailableForSale(value: boolean | null | undefined) {
  return value === true
}

export function availableStockForTransferCancel(input: {
  ledgerIn: number
  ledgerOut: number
  heldQty: number
}) {
  return input.ledgerIn - input.ledgerOut - input.heldQty
}
