import { describe, expect, it } from 'vitest'

import { buildDualCostingMatchIdMap } from './dual-costing-match-id'

describe('buildDualCostingMatchIdMap', () => {
  it('reserves persisted match ids before assigning ids to legacy rows in the same month', () => {
    const matchIds = buildDualCostingMatchIdMap([
      {
        created_at: new Date('2026-07-01T00:00:00.000Z'),
        deal_no: 'LEGACY-1',
        id: 1n,
      },
      {
        created_at: new Date('2026-07-02T00:00:00.000Z'),
        deal_no: 'ML2607-0001',
        id: 2n,
      },
    ])

    expect(matchIds.get('1')).toBe('ML2607-0002')
    expect(matchIds.get('2')).toBe('ML2607-0001')
  })
})
