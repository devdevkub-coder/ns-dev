import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  bankFindMany: vi.fn(),
  branchFindMany: vi.fn(),
  expenseFindMany: vi.fn(),
  findActiveBranchReferenceByCodeOrId: vi.fn(),
  purchaseFindMany: vi.fn(),
  salesFindMany: vi.fn(),
  stockFindMany: vi.fn(),
  tradingFindMany: vi.fn(),
}))

vi.mock('@/lib/server/branch-reference', () => ({
  findActiveBranchReferenceByCodeOrId: mocks.findActiveBranchReferenceByCodeOrId,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    accounts: { findMany: mocks.accountFindMany },
    bank_statement: { findMany: mocks.bankFindMany },
    branches: { findMany: mocks.branchFindMany },
    expenses: { findMany: mocks.expenseFindMany },
    purchase_bills: { findMany: mocks.purchaseFindMany },
    sales_bills: { findMany: mocks.salesFindMany },
    stock_ledger: { findMany: mocks.stockFindMany },
    trading_deals: { findMany: mocks.tradingFindMany },
  },
}))

import { buildCashOthersSummary } from './cash-others-anomaly'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.branchFindMany.mockResolvedValue([{ id: 1n }, { id: 2n }])
  mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue(null)
  for (const mock of [
    mocks.accountFindMany,
    mocks.bankFindMany,
    mocks.expenseFindMany,
    mocks.purchaseFindMany,
    mocks.salesFindMany,
    mocks.stockFindMany,
    mocks.tradingFindMany,
  ]) mock.mockResolvedValue([])
})

describe('buildCashOthersSummary branch scope', () => {
  it('applies every allowed active branch to all source queries', async () => {
    await buildCashOthersSummary('2026-07-17', undefined, ['b01', 'B02', 'B02'])

    expect(mocks.branchFindMany).toHaveBeenCalledWith({
      select: { id: true },
      where: { active: true, code: { in: ['B01', 'B02'] } },
    })
    expect(mocks.accountFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [1n, 2n] } })
    expect(mocks.bankFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ accounts: { branch_id: { in: [1n, 2n] } } })
    for (const mock of [mocks.salesFindMany, mocks.purchaseFindMany, mocks.stockFindMany, mocks.expenseFindMany]) {
      expect(mock.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [1n, 2n] } })
    }
    expect(mocks.tradingFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ purchase_bills: { branch_id: { in: [1n, 2n] } } })
  })

  it('keeps an unresolved explicit branch fail-closed', async () => {
    await buildCashOthersSummary('2026-07-17', 'MISSING', null)

    expect(mocks.accountFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [] } })
    expect(mocks.salesFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [] } })
    expect(mocks.tradingFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ purchase_bills: { branch_id: { in: [] } } })
  })
})
