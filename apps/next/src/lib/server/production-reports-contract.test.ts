import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }))

import { productionWhere } from './production-reports'

describe('production report query contract', () => {
  it('restricts report rows to the caller branch scope', () => {
    expect(productionWhere({ allowedBranchIds: [11n, 12n] })).toMatchObject({
      branch_id: { in: [11n, 12n] },
      NOT: { status: 'Cancelled' },
    })
  })

  it('allows an explicit Cancelled status filter', () => {
    expect(productionWhere({ allowedBranchIds: [11n], status: 'Cancelled' })).toMatchObject({
      branch_id: { in: [11n] },
      status: 'Cancelled',
    })
    expect(productionWhere({ allowedBranchIds: [11n], status: 'Cancelled' })).not.toHaveProperty('NOT')
  })

  it('returns no rows when a requested branch is outside the allowed scope', () => {
    expect(productionWhere({ allowedBranchIds: [11n], branchId: 'B02' }, 12n)).toMatchObject({ branch_id: { in: [] } })
  })
})
