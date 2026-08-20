import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  factFindMany: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getDualCostingBranch: vi.fn(),
  poolFindFirst: vi.fn(),
  transaction: vi.fn(),
  productFindFirst: vi.fn(),
  salesBillFindFirst: vi.fn(),
  tradingDealCount: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: vi.fn(),
}))
vi.mock('@/lib/server/dual-costing-branch', () => ({ getDualCostingBranch: mocks.getDualCostingBranch }))
vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/server/reference-master-cache', () => ({ listProductReferences: vi.fn() }))
vi.mock('../cost-pool/handler', () => ({ getCostPoolRowsData: vi.fn() }))

import { POST } from './route'

const target = {
  customer_id: 22n,
  customers: { name: 'Customer' },
  doc_no: 'SB-001',
  id: 41n,
  sales_bill_lines: [{ line_no: 1, unit_price: 200 }],
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    candidates: [{ costPoolId: 'POOL-001', qtyToUse: 1, sourceNo: 'PB-001', sourceType: 'PO_Buy', unitCost: 100 }],
    poSellId: 'SB-001:1',
    productId: 'CU-01',
    sourceType: 'spot-sell',
    ...overrides,
  }
}

async function post(payload: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/dual-costing/cost-allocator', {
    method: 'POST',
    body: JSON.stringify(payload),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ appUser: { email: 'tester@example.com' }, authUser: { email: 'tester@example.com' } })
  mocks.getDualCostingBranch.mockResolvedValue({ id: 10n, name: 'Main' })
  mocks.productFindFirst.mockResolvedValue({ code: 'CU-01', id: 1n, name: 'Copper' })
  mocks.salesBillFindFirst.mockResolvedValue(target)
  mocks.factFindMany.mockResolvedValue([{ allocation_no: 'ALLOC-001' }])
  mocks.tradingDealCount.mockResolvedValue(0)

  const tx = {
    products: { findFirst: mocks.productFindFirst },
    sales_bills: { findFirst: mocks.salesBillFindFirst },
    trading_allocation_facts: { findMany: mocks.factFindMany },
    trading_deals: { count: mocks.tradingDealCount },
    stock_cost_pool_entries: { findFirst: mocks.poolFindFirst },
  }
  mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx))
})

describe('POST /api/dual-costing/cost-allocator data integrity', () => {
  it('returns a structured conflict when the sales line already has an active allocation', async () => {
    const response = await post(body())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'DEAL_MARGIN_DATA_INTEGRITY',
      details: { allocationNos: ['ALLOC-001'], salesDocNo: 'SB-001', salesLineNo: 1 },
      error: 'พบ Allocation ซ้ำใน Sales Bill SB-001, Sales Line 1',
    })
  })

  it('rejects multiple allocations targeting one sales line before writing', async () => {
    mocks.factFindMany.mockResolvedValue([])

    const response = await post(body({
      candidates: [
        { costPoolId: 'POOL-001', qtyToUse: 1, sourceNo: 'PB-001', sourceType: 'PO_Buy', unitCost: 100 },
        { costPoolId: 'POOL-002', qtyToUse: 1, sourceNo: 'PB-002', sourceType: 'PO_Buy', unitCost: 100 },
      ],
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'DEAL_MARGIN_DATA_INTEGRITY',
      error: 'ไม่สามารถจัดสรรหลาย Allocation ให้ Sales Bill SB-001, Sales Line 1 ได้',
    })
  })
})
