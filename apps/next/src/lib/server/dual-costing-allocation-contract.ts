export const DUAL_COSTING_ALLOCATION_ADVISORY_LOCK = 2026072711
export const COST_POOL_EPSILON = 0.001

export function getCostPoolAvailableQty(originalQty: number, allocatedQty: number, releasedQty: number) {
  return Math.max(0, originalQty - allocatedQty - releasedQty)
}

export function getCostPoolStatus(originalQty: number, allocatedQty: number, releasedQty: number) {
  if (releasedQty >= originalQty - COST_POOL_EPSILON) return 'Released'
  if (getCostPoolAvailableQty(originalQty, allocatedQty, releasedQty) <= COST_POOL_EPSILON) return 'Fully Used'
  if (allocatedQty > COST_POOL_EPSILON) return 'Partially Used'
  return 'Available'
}
