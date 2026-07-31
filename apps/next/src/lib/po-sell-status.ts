export const PO_SELL_STATUS = {
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  OPEN: 'Open',
  PARTIALLY_FULFILLED: 'Partially Fulfilled',
  SHORT_CLOSED: 'Short Closed',
} as const

export type PoSellStatus = typeof PO_SELL_STATUS[keyof typeof PO_SELL_STATUS]

const VALUES = new Set<string>(Object.values(PO_SELL_STATUS))
const EPSILON = 0.001

export function requirePoSellStatus(status: string | null | undefined, docNo: string): PoSellStatus {
  if (!status || !VALUES.has(status)) throw new Error(`PO Sell ${docNo} มีสถานะไม่ถูกต้อง`)
  return status as PoSellStatus
}

export function isInactivePoSellStatus(status: string | null | undefined, docNo: string) {
  const canonical = requirePoSellStatus(status, docNo)
  return canonical === PO_SELL_STATUS.CANCELLED || canonical === PO_SELL_STATUS.COMPLETED || canonical === PO_SELL_STATUS.SHORT_CLOSED
}

export function isActivePoSellStatus(status: string | null | undefined, docNo: string) {
  const canonical = requirePoSellStatus(status, docNo)
  return canonical === PO_SELL_STATUS.OPEN || canonical === PO_SELL_STATUS.PARTIALLY_FULFILLED
}

export function poSellStatusText(status: string | null | undefined) {
  const canonical = requirePoSellStatus(status, 'status')
  const labels: Record<PoSellStatus, string> = {
    [PO_SELL_STATUS.OPEN]: 'เปิดอยู่',
    [PO_SELL_STATUS.PARTIALLY_FULFILLED]: 'ออกบิลบางส่วน',
    [PO_SELL_STATUS.COMPLETED]: 'ออกบิลแล้ว',
    [PO_SELL_STATUS.SHORT_CLOSED]: 'ปิดส่งไม่ครบ',
    [PO_SELL_STATUS.CANCELLED]: 'ยกเลิก',
  }
  return labels[canonical]
}

export function derivePoSellFulfillmentStatus(input: { currentStatus: string | null | undefined; docNo: string; remainingQty: number; totalQty: number }): PoSellStatus {
  const currentStatus = requirePoSellStatus(input.currentStatus, input.docNo)
  if (currentStatus === PO_SELL_STATUS.CANCELLED || currentStatus === PO_SELL_STATUS.SHORT_CLOSED) return currentStatus
  if (input.totalQty < 0 || input.remainingQty < -EPSILON || input.remainingQty > input.totalQty + EPSILON) throw new Error(`PO Sell ${input.docNo} มียอดคงเหลือไม่ถูกต้อง`)
  if (input.remainingQty <= EPSILON) return PO_SELL_STATUS.COMPLETED
  if (input.remainingQty >= input.totalQty - EPSILON) return PO_SELL_STATUS.OPEN
  return PO_SELL_STATUS.PARTIALLY_FULFILLED
}
