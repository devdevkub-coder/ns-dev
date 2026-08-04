import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildFinanceCashPosition: vi.fn(),
  expenseFindMany: vi.fn(),
  findActiveBranchReferenceByCodeOrId: vi.fn(),
  listActiveBranches: vi.fn(),
  purchaseFindMany: vi.fn(),
  salesFindMany: vi.fn(),
  stockFindMany: vi.fn(),
  tradingFindMany: vi.fn(),
}))

vi.mock('@/lib/server/branch-reference', () => ({
  findActiveBranchReferenceByCodeOrId: mocks.findActiveBranchReferenceByCodeOrId,
}))

vi.mock('@/lib/server/finance-accounting-cash-position', () => ({
  buildFinanceCashPosition: mocks.buildFinanceCashPosition,
}))

vi.mock('@/lib/server/reference-master-cache', () => ({
  listActiveBranches: mocks.listActiveBranches,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
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
  mocks.buildFinanceCashPosition.mockResolvedValue({ accountBalances: [] })
  mocks.listActiveBranches.mockResolvedValue([{ code: 'B01', id: 1n }, { code: 'B02', id: 2n }])
  mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue(null)
  for (const mock of [
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

    expect(mocks.buildFinanceCashPosition).toHaveBeenCalledWith({ asOf: expect.any(Date), branchIds: [1n, 2n] })
    for (const mock of [mocks.salesFindMany, mocks.purchaseFindMany, mocks.stockFindMany, mocks.expenseFindMany]) {
      expect(mock.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [1n, 2n] } })
    }
    expect(mocks.tradingFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ purchase_bills: { branch_id: { in: [1n, 2n] } } })
  })

  it('keeps an unresolved explicit branch fail-closed', async () => {
    await buildCashOthersSummary('2026-07-17', 'MISSING', null)

    expect(mocks.buildFinanceCashPosition).toHaveBeenCalledWith({ asOf: expect.any(Date), branchIds: [] })
    expect(mocks.salesFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [] } })
    expect(mocks.tradingFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ purchase_bills: { branch_id: { in: [] } } })
  })
})
