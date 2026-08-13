export type ProfitCostRankingKey = 'gp' | 'revenue' | 'stockValue'

export function sortProfitCostRanking<T extends Record<ProfitCostRankingKey, number>>(
  rows: T[],
  key: ProfitCostRankingKey,
) {
  return [...rows].sort((left, right) => right[key] - left[key])
}
