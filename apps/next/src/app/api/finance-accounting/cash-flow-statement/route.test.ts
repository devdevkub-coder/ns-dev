import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  buildCashFlowStatement: vi.fn(),
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

vi.mock('@/lib/server/finance-accounting-statements', () => ({
  buildCashFlowStatement: mocks.buildCashFlowStatement,
  FinancialStatementInputError: class FinancialStatementInputError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message)
    }
  },
}))

import { GET } from './route'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [requested] : ['B01', 'B02'])
  mocks.buildCashFlowStatement.mockResolvedValue({ ok: true })
})

describe('GET /api/finance-accounting/cash-flow-statement branch scope', () => {
  it('passes the effective authorized scope when no branch is selected', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cash-flow-statement?from=2026-07-01&to=2026-07-31'))

    expect(response.status).toBe(200)
    expect(mocks.buildCashFlowStatement).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: undefined,
    }))
  })

  it('returns 403 when the builder resolves an explicit branch outside the effective scope', async () => {
    mocks.getFinanceBranchCodeIntersection.mockReturnValue(['B01'])
    mocks.buildCashFlowStatement.mockRejectedValue(new FinancialStatementInputError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403))

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cash-flow-statement?branchId=B02'))

    expect(response.status).toBe(403)
    expect(mocks.buildCashFlowStatement).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01'],
      branchId: 'B02',
    }))
  })

  it('returns a client error when an explicit branch is unknown or inactive', async () => {
    mocks.buildCashFlowStatement.mockRejectedValue(new FinancialStatementInputError('ไม่พบสาขาที่เปิดใช้งานตามตัวกรองที่ระบุ'))

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cash-flow-statement?branchId=MISSING'))

    expect(response.status).toBe(400)
    expect(mocks.buildCashFlowStatement).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'MISSING' }))
  })

  it('normalizes ALL and preserves an unrestricted all-branch role', async () => {
    mocks.getFinanceBranchCodeIntersection.mockReturnValue(null)

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cash-flow-statement?branchId=all'))

    expect(response.status).toBe(200)
    expect(mocks.buildCashFlowStatement).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: null,
      branchId: undefined,
    }))
  })

  it('passes an empty mapped scope through instead of treating it as unrestricted', async () => {
    mocks.getFinanceBranchCodeIntersection.mockReturnValue([])

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cash-flow-statement'))

    expect(response.status).toBe(200)
    expect(mocks.buildCashFlowStatement).toHaveBeenCalledWith(expect.objectContaining({ allowedBranchCodes: [] }))
  })
})
