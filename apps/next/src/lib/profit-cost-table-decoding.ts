export type ProfitCostTableTab = 'alerts' | 'channels' | 'customers' | 'products' | 'suppliers' | 'trend'

/**
 * Product and alert endpoints do not return dimension-row fields. Keep their
 * payloads away from the dimension decoder so a valid product response cannot
 * fail on a missing field such as `amount`.
 */
export function shouldDecodeDimensionRows(tab: ProfitCostTableTab) {
  return tab !== 'products' && tab !== 'alerts'
}
