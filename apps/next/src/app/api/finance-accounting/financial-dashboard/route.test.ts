import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
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

vi.mock('@/lib/server/finance-accounting-branch-scope', () => ({
  getFinanceBranchCodeIntersection: mocks.getFinanceBranchCodeIntersection,
}))

vi.mock('@/lib/server/finance-accounting-dashboard', () => ({
  buildFinancialDashboard: mocks.buildFinancialDashboard,
}))

import { GET } from './route'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [requested] : ['B01'])
  mocks.buildFinancialDashboard.mockResolvedValue({ ok: true })
})

describe('GET /api/finance-accounting/financial-dashboard branch scope', () => {
  it('passes the effective authorized branch scope to an ALL request', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/financial-dashboard?asOf=2026-07-17'))

    expect(response.status).toBe(200)
    expect(mocks.buildFinancialDashboard).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01'],
      branchId: undefined,
    }))
  })

  it('rejects a branch outside the effective authorized scope', async () => {
    mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [] : ['B01'])

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/financial-dashboard?asOf=2026-07-17&branchId=B02'))

    expect(response.status).toBe(403)
    expect(mocks.buildFinancialDashboard).not.toHaveBeenCalled()
  })

  it('returns a bad request when the selected branch does not exist', async () => {
    mocks.buildFinancialDashboard.mockRejectedValue(new FinancialStatementInputError('ไม่พบสาขาที่ใช้งาน: MISSING'))

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/financial-dashboard?asOf=2026-07-17&branchId=MISSING'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'ไม่พบสาขาที่ใช้งาน: MISSING' })
  })
})
