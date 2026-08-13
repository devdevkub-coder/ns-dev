import { describe, expect, it } from 'vitest'
import { sortProfitCostRanking } from './profit-cost-ranking'

describe('profit-cost ranking order', () => {
  const rows = [
    { gp: 8, revenue: 96, stockValue: 9 },
    { gp: 71, revenue: 894, stockValue: 96 },
    { gp: 902, revenue: 581, stockValue: 92 },
  ]

  it('sorts each ranking metric from highest to lowest', () => {
    expect(sortProfitCostRanking(rows, 'revenue').map((row) => row.revenue)).toEqual([894, 581, 96])
    expect(sortProfitCostRanking(rows, 'gp').map((row) => row.gp)).toEqual([902, 71, 8])
    expect(sortProfitCostRanking(rows, 'stockValue').map((row) => row.stockValue)).toEqual([96, 92, 9])
  })

  it('does not mutate the API response array', () => {
    const result = sortProfitCostRanking(rows, 'revenue')
    expect(result).not.toBe(rows)
    expect(rows.map((row) => row.revenue)).toEqual([96, 894, 581])
  })
})
