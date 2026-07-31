import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  buildStockFinanceHistory: vi.fn(),
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

vi.mock('@/lib/server/finance-accounting-branch-scope', () => ({
  getFinanceBranchCodeIntersection: mocks.getFinanceBranchCodeIntersection,
}))

vi.mock('@/lib/server/finance-accounting-working-capital', () => ({
  buildStockFinanceHistory: mocks.buildStockFinanceHistory,
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => (requested ? [requested] : ['B01', 'B02']))
  mocks.buildStockFinanceHistory.mockResolvedValue({ points: [] })
})

describe('GET /api/finance-accounting/stock-finance/history', () => {
  it('passes all authorized branches for the combined history view', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance/history?from=2026-05-01&to=2026-07-31'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.buildStockFinanceHistory).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: undefined,
    }))
  })

  it('passes a selected branch when it is authorized', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance/history?from=2026-05-01&to=2026-07-31&branchId=b02'))

    expect(response.status).toBe(200)
    expect(mocks.buildStockFinanceHistory).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: 'B02',
    }))
  })

  it('rejects a branch outside the authorized scope', async () => {
    mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => (requested ? [] : ['B01', 'B02']))

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance/history?from=2026-05-01&to=2026-07-31&branchId=B03'))

    expect(response.status).toBe(403)
    expect(mocks.buildStockFinanceHistory).not.toHaveBeenCalled()
  })

  it('rejects invalid date input', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance/history?from=2026-05-01&to=bad-date'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'วันที่สิ้นสุด ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
    expect(mocks.buildStockFinanceHistory).not.toHaveBeenCalled()
  })

  it('rejects an inverted date range', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance/history?from=2026-07-31&to=2026-05-01'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด' })
    expect(mocks.buildStockFinanceHistory).not.toHaveBeenCalled()
  })
})
