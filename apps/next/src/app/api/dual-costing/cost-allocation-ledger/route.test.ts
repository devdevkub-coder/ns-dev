import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildDualCostingManagement: vi.fn(),
  canAccessBranchId: vi.fn(),
  getAllowedBranchIds: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getDualCostingBranch: vi.fn(),
  jsonToSheet: vi.fn(() => ({})),
  requirePermission: vi.fn(),
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
vi.mock('@/lib/server/dual-costing-management', () => ({ buildDualCostingManagement: mocks.buildDualCostingManagement }))
vi.mock('@/lib/server/xlsx', () => ({
  applyWorksheetTableLayout: vi.fn(),
  XLSX: {
    utils: {
      book_append_sheet: vi.fn(),
      book_new: vi.fn(() => ({})),
      json_to_sheet: mocks.jsonToSheet,
    },
    write: vi.fn(() => Buffer.from('xlsx')),
  },
}))

import { GET } from './route'

const actor = { appUser: { email: 'allocator@example.com' }, authUser: { email: 'allocator@example.com' } }

function ledgerRow(overrides: Record<string, unknown> = {}) {
  return {
    allocatedAt: '2026-07-27T00:00:00.000Z',
    allocatedBy: 'allocator@example.com',
    allocatedQty: 3,
    allocatedRevenue: 600,
    canReverse: false,
    costPerKg: 100,
    costPoolLotNo: 'LOT-1',
    costPoolNo: 'POOL-1',
    date: '2026-07-27',
    dealId: '1',
    gpPct: 50,
    grossProfit: 300,
    id: 'fact-1',
    matchId: 'ML2607-0001',
    productCategory: 'ทองแดง',
    productId: 'CU-01',
    productName: 'ทองแดง',
    saleDocNo: 'PI2607-0001',
    saleQty: 3,
    sourceNo: 'PB2607-0001',
    status: 'approved',
    targetLineNo: null,
    targetSourceType: 'production',
    targetType: 'PRODUCTION',
    totalCost: 300,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.canAccessBranchId.mockReturnValue(true)
  mocks.getAllowedBranchIds.mockResolvedValue(null)
  mocks.getCurrentAuthContext.mockResolvedValue(actor)
  mocks.getDualCostingBranch.mockResolvedValue({ id: 10n })
})

describe('GET /api/dual-costing/cost-allocation-ledger', () => {
  it('returns every represented target type, including production, and disables caching', async () => {
    mocks.buildDualCostingManagement.mockResolvedValue({
      ledgerRows: [ledgerRow(), ledgerRow({ id: 'fact-2', targetSourceType: 'spot-sell', targetType: 'SPOT_SELL' })],
    })

    const response = await GET(new Request('http://localhost/api/dual-costing/cost-allocation-ledger'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      filters: { targetTypes: ['PRODUCTION', 'SPOT_SELL'] },
      summary: { active: 2, rows: 2 },
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('keeps the audit workbook private and uncached', async () => {
    mocks.buildDualCostingManagement.mockResolvedValue({ ledgerRows: [ledgerRow()] })

    const response = await GET(new Request('http://localhost/api/dual-costing/cost-allocation-ledger?format=xlsx'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Content-Disposition')).toContain('cost_allocation_ledger.xlsx')
  })

  it('keeps every lot from the matched allocation in JSON and Excel results', async () => {
    mocks.buildDualCostingManagement.mockResolvedValue({
      ledgerRows: [
        ledgerRow({
          costPoolLotNo: 'LOT-1',
          costPoolNo: 'POOL-1',
          id: 'fact-1',
          matchId: 'ML2607-0001',
          sourceNo: 'PB2607-0001',
        }),
        ledgerRow({
          costPoolLotNo: 'LOT-2',
          costPoolNo: 'POOL-2',
          id: 'fact-2',
          matchId: 'ML2607-0001',
          sourceNo: 'PB2607-0002',
        }),
        ledgerRow({
          costPoolLotNo: 'LOT-3',
          costPoolNo: 'POOL-3',
          id: 'fact-3',
          matchId: 'ML2607-0002',
          sourceNo: 'PB2607-0003',
        }),
      ],
    })

    const response = await GET(new Request(
      'http://localhost/api/dual-costing/cost-allocation-ledger?q=PB2607-0001',
    ))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.rows.map((row: { id: string }) => row.id)).toEqual(['fact-1', 'fact-2'])
    expect(payload.summary.rows).toBe(2)

    const exportResponse = await GET(new Request(
      'http://localhost/api/dual-costing/cost-allocation-ledger?q=PB2607-0001&format=xlsx',
    ))

    expect(exportResponse.status).toBe(200)
    expect(mocks.jsonToSheet).toHaveBeenLastCalledWith([
      expect.objectContaining({ CostPool: 'POOL-1', MatchId: 'ML2607-0001' }),
      expect.objectContaining({ CostPool: 'POOL-2', MatchId: 'ML2607-0001' }),
    ])
  })

  it('rejects a request outside the active Dual Costing branch before querying facts', async () => {
    mocks.canAccessBranchId.mockReturnValue(false)

    const response = await GET(new Request('http://localhost/api/dual-costing/cost-allocation-ledger'))

    expect(response.status).toBe(403)
    expect(mocks.buildDualCostingManagement).not.toHaveBeenCalled()
  })
})
