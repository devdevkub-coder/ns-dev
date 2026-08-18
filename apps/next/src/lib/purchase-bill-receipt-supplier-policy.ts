export type PurchaseBillReceiptSupplierMatchPolicy =
  | { mode: 'required' }
  | { mode: 'allow-linked-ticket-ids'; ticketIds: ReadonlySet<bigint> }

export function isPurchaseBillReceiptSupplierAllowed(input: {
  policy: PurchaseBillReceiptSupplierMatchPolicy
  resolvedSupplierId: bigint
  ticketId: bigint
  ticketSupplierId: bigint | null
}) {
  if (input.ticketSupplierId === input.resolvedSupplierId) return true
  if (input.policy.mode === 'required') return false
  return input.policy.ticketIds.has(input.ticketId)
}
