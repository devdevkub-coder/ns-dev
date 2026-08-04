import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  buildStockFinance: vi.fn(),
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
  buildStockFinance: mocks.buildStockFinance,
}))

import { GET } from './route'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => (requested ? [requested] : ['B01', 'B02']))
  mocks.buildStockFinance.mockResolvedValue({ ok: true })
})

describe('GET /api/finance-accounting/stock-finance', () => {
  it('passes all authorized branches for the combined view', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance?asOf=2026-07-17'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.buildStockFinance).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: undefined,
    }))
  })

  it('passes the selected branch when it is inside the authorized scope', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance?asOf=2026-07-17&branchId=b02'))

    expect(response.status).toBe(200)
    expect(mocks.buildStockFinance).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: 'B02',
    }))
  })

  it('rejects a branch outside the authorized scope', async () => {
    mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => (requested ? [] : ['B01', 'B02']))

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance?asOf=2026-07-17&branchId=B03'))

    expect(response.status).toBe(403)
    expect(mocks.buildStockFinance).not.toHaveBeenCalled()
  })

  it('rejects an invalid as-of date instead of using today', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance?asOf=invalid-date'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'ณ วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
    expect(mocks.buildStockFinance).not.toHaveBeenCalled()
  })

  it('requires an as-of date instead of using today', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'ณ วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD' })
    expect(mocks.buildStockFinance).not.toHaveBeenCalled()
  })

  it('returns builder input errors with the original status', async () => {
    mocks.buildStockFinance.mockRejectedValue(new FinancialStatementInputError('ไม่พบสาขาที่ใช้งาน: MISSING'))

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/stock-finance?asOf=2026-07-17&branchId=MISSING'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'ไม่พบสาขาที่ใช้งาน: MISSING' })
  })
})
