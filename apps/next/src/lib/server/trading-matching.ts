type TradingMatchingAllocationFact = {
  sales_bill_id: bigint | null
  cost_pool_entry_id: bigint | null
}

/**
 * Trading Matching is the read surface for allocations created by a Trading
 * Sales Bill. Cost Pool allocations belong to Cost Allocator/Allocation Ledger
 * even when their target later references a Sales Bill.
 */
export function isTradingMatchingAllocationFact(fact: TradingMatchingAllocationFact) {
  return fact.sales_bill_id != null && fact.cost_pool_entry_id == null
}
