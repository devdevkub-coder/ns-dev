import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  canAccessBranchId: vi.fn(),
  factFindMany: vi.fn(),
  factUpdateMany: vi.fn(),
  getAllowedBranchIds: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getDualCostingBranch: vi.fn(),
  poolFindMany: vi.fn(),
  poolUpdate: vi.fn(),
  productionOrderFindFirst: vi.fn(),
  requirePermission: vi.fn(),
  transaction: vi.fn(),
  tradingDealFindMany: vi.fn(),
  tradingDealFindUnique: vi.fn(),
  tradingDealUpdate: vi.fn(),
  txExecuteRaw: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))

vi.mock('@/lib/server/branch-scope', () => ({
  canAccessBranchId: mocks.canAccessBranchId,
  getAllowedBranchIds: mocks.getAllowedBranchIds,
}))

vi.mock('@/lib/server/dual-costing-branch', () => ({ getDualCostingBranch: mocks.getDualCostingBranch }))

vi.mock('@/lib/server/prisma', () => ({
  prisma: { $transaction: mocks.transaction },
}))

import { POST } from './route'

const matchId = 'ML2607-0001'
const actor = { appUser: { email: 'allocator@example.com' }, authUser: { email: 'allocator@example.com' } }

function activeDeal(id: bigint) {
  return {
    created_at: new Date('2026-07-27T00:00:00.000Z'),
    date: new Date('2026-07-27T00:00:00.000Z'),
    deal_no: matchId,
    id,
    notes: `deal-${id.toString()}`,
    sales_bill_no: 'SB2607-0001',
    status: 'Matched',
  }
}

function activeFact(id: bigint, dealId: bigint, poolId: bigint, qty: number) {
  return {
    cost_pool_entry_id: poolId,
    id,
    notes: `fact-${id.toString()}`,
    qty,
    status: 'active',
    trading_deal_id: dealId,
  }
}

function pool(id: bigint, allocatedQty: number) {
  return {
    allocated_qty: allocatedQty,
    branch_id: 10n,
    id,
    notes: `pool-${id.toString()}`,
    original_qty: 10,
    pool_key: `SCP-${id.toString()}`,
    released_qty: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(actor)
  mocks.getDualCostingBranch.mockResolvedValue({ id: 10n, name: 'สมุทรสาคร' })
  mocks.getAllowedBranchIds.mockResolvedValue(null)
  mocks.canAccessBranchId.mockReturnValue(true)
  mocks.productionOrderFindFirst.mockResolvedValue(null)
  mocks.txExecuteRaw.mockResolvedValue(1)
  mocks.factUpdateMany.mockResolvedValue({ count: 1 })
  mocks.poolUpdate.mockResolvedValue({})
  mocks.tradingDealUpdate.mockResolvedValue({})

  const tx = {
    $executeRaw: mocks.txExecuteRaw,
    production_orders: { findFirst: mocks.productionOrderFindFirst },
    stock_cost_pool_entries: { findMany: mocks.poolFindMany, update: mocks.poolUpdate },
    trading_allocation_facts: { findMany: mocks.factFindMany, updateMany: mocks.factUpdateMany },
    trading_deals: { findMany: mocks.tradingDealFindMany, findUnique: mocks.tradingDealFindUnique, update: mocks.tradingDealUpdate },
  }
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
})

describe('POST /api/dual-costing/cost-allocation-ledger/reverse', () => {
  it('requires the dedicated reverse permission before mutating financial facts', async () => {
    await POST(new Request('http://localhost/api/dual-costing/cost-allocation-ledger/reverse', {
      body: JSON.stringify({ dealId: '1' }),
      method: 'POST',
    }))

    expect(mocks.requirePermission).toHaveBeenCalledWith(actor, 'finance.dual_costing.reverse')
  })

  it('reverses every lot in one stored match while preserving the original deal amounts', async () => {
    const firstDeal = activeDeal(1n)
    const secondDeal = activeDeal(2n)
    mocks.tradingDealFindUnique.mockResolvedValue(firstDeal)
    mocks.tradingDealFindMany.mockResolvedValue([firstDeal, secondDeal])
    mocks.factFindMany.mockResolvedValue([
      activeFact(11n, 1n, 101n, 3),
      activeFact(12n, 2n, 102n, 4),
    ])
    mocks.poolFindMany.mockResolvedValue([pool(101n, 3), pool(102n, 4)])

    const response = await POST(new Request('http://localhost/api/dual-costing/cost-allocation-ledger/reverse', {
      body: JSON.stringify({ dealId: '1', reason: 'ทดสอบย้อนกลับ' }),
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      result: { alreadyReversed: false, matchId, releasedQty: 7, reversedFactCount: 2 },
      success: true,
    })
    expect(mocks.poolUpdate).toHaveBeenCalledTimes(2)
    expect(mocks.poolUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ allocated_qty: 0, status: 'Available' }),
      where: { id: 101n },
    }))
    expect(mocks.poolUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ allocated_qty: 0, status: 'Available' }),
      where: { id: 102n },
    }))
    expect(mocks.factUpdateMany).toHaveBeenCalledTimes(2)
    expect(mocks.factUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ notes: expect.stringContaining('fact-11'), status: 'reversed' }),
      where: { id: 11n, status: 'active' },
    }))
    expect(mocks.tradingDealUpdate).toHaveBeenCalledTimes(2)
    expect(mocks.tradingDealUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cancelled_reason: 'ทดสอบย้อนกลับ', status: 'Cancelled' }),
      where: { id: 1n },
    }))
  })

  it('is idempotent after a whole match is already reversed', async () => {
    const reversedDeal = { ...activeDeal(1n), status: 'Cancelled' }
    mocks.tradingDealFindUnique.mockResolvedValue(reversedDeal)
    mocks.tradingDealFindMany.mockResolvedValue([reversedDeal])
    mocks.factFindMany.mockResolvedValue([{ ...activeFact(11n, 1n, 101n, 3), status: 'reversed' }])

    const response = await POST(new Request('http://localhost/api/dual-costing/cost-allocation-ledger/reverse', {
      body: JSON.stringify({ dealId: '1' }),
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ result: { alreadyReversed: true }, success: true })
    expect(mocks.poolUpdate).not.toHaveBeenCalled()
    expect(mocks.factUpdateMany).not.toHaveBeenCalled()
  })

  it('blocks a historical row with no proven Cost Pool lot instead of guessing', async () => {
    const firstDeal = activeDeal(1n)
    mocks.tradingDealFindUnique.mockResolvedValue(firstDeal)
    mocks.tradingDealFindMany.mockResolvedValue([firstDeal])
    mocks.factFindMany.mockResolvedValue([{ ...activeFact(11n, 1n, 101n, 3), cost_pool_entry_id: null }])

    const response = await POST(new Request('http://localhost/api/dual-costing/cost-allocation-ledger/reverse', {
      body: JSON.stringify({ dealId: '1' }),
      method: 'POST',
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'รายการเดิมยังระบุรายการ Cost Pool ไม่ชัดเจน จึงไม่สามารถย้อนกลับโดยเดารายการได้' })
    expect(mocks.poolUpdate).not.toHaveBeenCalled()
    expect(mocks.factUpdateMany).not.toHaveBeenCalled()
  })

  it('rejects a user outside the Dual Costing branch before opening a transaction', async () => {
    mocks.canAccessBranchId.mockReturnValue(false)

    const response = await POST(new Request('http://localhost/api/dual-costing/cost-allocation-ledger/reverse', {
      body: JSON.stringify({ dealId: '1' }),
      method: 'POST',
    }))

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
