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
