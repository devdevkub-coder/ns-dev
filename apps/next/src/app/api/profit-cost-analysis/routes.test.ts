import { describe, expect, it } from 'vitest'
import {
  parseProfitCostFilter,
  serializeProfitCostAppliedFilter,
} from '@/lib/server/profit-cost-report-contract'

describe('profit-cost-analysis route contract', () => {
  it('serializes applied internal IDs as strings for JSON filter echo', () => {
    const filter = parseProfitCostFilter(new URLSearchParams({
      branchId: '12',
      from: '2026-07-01',
      productId: '56',
      to: '2026-07-31',
    }))

    expect(serializeProfitCostAppliedFilter(filter)).toEqual({
      branchId: '12',
      from: '2026-07-01',
      productId: '56',
      to: '2026-07-31',
    })
    expect(() => JSON.stringify(serializeProfitCostAppliedFilter(filter))).not.toThrow()
  })
})
