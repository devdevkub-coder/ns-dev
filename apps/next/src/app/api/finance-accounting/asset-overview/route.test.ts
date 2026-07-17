import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildCashOthersSummary: vi.fn(),
  buildFinancialDashboard: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getFinanceBranchCodeIntersection: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: (_caught: unknown, message: string, status = 500) => Response.json({ error: message }, { status }),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))

vi.mock('@/lib/server/cash-others-anomaly', () => ({
  buildCashOthersSummary: mocks.buildCashOthersSummary,
}))

vi.mock('@/lib/server/finance-accounting-branch-scope', () => ({
  getFinanceBranchCodeIntersection: mocks.getFinanceBranchCodeIntersection,
}))

vi.mock('@/lib/server/finance-accounting-dashboard', () => ({
  buildFinancialDashboard: mocks.buildFinancialDashboard,
}))

vi.mock('@/lib/server/finance-accounting-statements', () => ({
  FinancialStatementInputError: class FinancialStatementInputError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message)
    }
  },
}))

import { GET } from './route'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'

const cashPayload = {
  charts: { assetComp: [], debtComp: [] },
  sourceState: { limitations: [], writeActionsEnabled: false },
  summary: {},
}

const financialPayload = {
  assetComp: [],
  branches: [],
  filters: { asOf: '2026-07-17', branchId: 'ALL' },
  summary: { ap: 0, ar: 0, equity: 0, inv: 0, totalAssets: 0, totalLiab: 0, totalLoan: 0, totalNBV: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [requested] : ['B01'])
  mocks.buildCashOthersSummary.mockResolvedValue(cashPayload)
  mocks.buildFinancialDashboard.mockResolvedValue(financialPayload)
})

describe('GET /api/finance-accounting/asset-overview branch scope', () => {
  it('passes the effective authorized scope to both dashboard sources', async () => {
    const response = await GET(new Request('http://localhost/api/finance-accounting/asset-overview?asOf=2026-07-17'))

    expect(response.status).toBe(200)
    expect(mocks.buildCashOthersSummary).toHaveBeenCalledWith('2026-07-17', undefined, ['B01'])
    expect(mocks.buildFinancialDashboard).toHaveBeenCalledWith({
      allowedBranchCodes: ['B01'],
      asOf: new Date('2026-07-17T00:00:00.000Z'),
      branchId: undefined,
    })
  })

  it('rejects a branch outside the effective authorized scope before loading either source', async () => {
    mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [] : ['B01'])

    const response = await GET(new Request('http://localhost/api/finance-accounting/asset-overview?branchId=B02'))

    expect(response.status).toBe(403)
    expect(mocks.buildCashOthersSummary).not.toHaveBeenCalled()
    expect(mocks.buildFinancialDashboard).not.toHaveBeenCalled()
  })

  it('returns a client error for an unknown explicit branch without exposing global data', async () => {
    mocks.getFinanceBranchCodeIntersection.mockReturnValue(null)
    mocks.buildFinancialDashboard.mockRejectedValue(new FinancialStatementInputError('unknown active branch'))

    const response = await GET(new Request('http://localhost/api/finance-accounting/asset-overview?branchId=MISSING'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'unknown active branch' })
    expect(mocks.buildCashOthersSummary).toHaveBeenCalledWith(null, 'MISSING', null)
    expect(mocks.buildFinancialDashboard).toHaveBeenCalledWith(expect.objectContaining({ allowedBranchCodes: null, branchId: 'MISSING' }))
  })
})
