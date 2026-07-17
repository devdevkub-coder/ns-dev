import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  buildCashFlowForecastCalendar: vi.fn(),
  getFinanceBranchCodeIntersection: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: (_caught: unknown, message: string, status: number) => Response.json({ error: message }, { status }),
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

vi.mock('@/lib/server/finance-accounting-cashflow-planning', () => ({
  buildCashFlowForecastCalendar: mocks.buildCashFlowForecastCalendar,
  CashFlowValidationError: class CashFlowValidationError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message)
    }
  },
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [requested] : ['B01', 'B02'])
  mocks.buildCashFlowForecastCalendar.mockResolvedValue({ ok: true })
})

describe('GET /api/finance-accounting/cf-forecast-calendar branch scope', () => {
  it('rejects an invalid calendar date instead of silently using today', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cf-forecast-calendar?startDate=2026-02-30&horizon=30'))

    expect(response.status).toBe(400)
    expect(mocks.buildCashFlowForecastCalendar).not.toHaveBeenCalled()
  })

  it('rejects an unsupported horizon instead of silently using 30 days', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cf-forecast-calendar?startDate=2026-07-17&horizon=8'))

    expect(response.status).toBe(400)
    expect(mocks.buildCashFlowForecastCalendar).not.toHaveBeenCalled()
  })

  it('passes the full allowed scope when all visible branches are requested', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cf-forecast-calendar?startDate=2026-07-17&horizon=30'))

    expect(response.status).toBe(200)
    expect(mocks.buildCashFlowForecastCalendar).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: undefined,
      horizon: 30,
    }))
  })

  it('rejects a requested branch outside the user scope before building the forecast', async () => {
    mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [] : ['B01'])

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/cf-forecast-calendar?branchId=B02'))

    expect(response.status).toBe(403)
    expect(mocks.buildCashFlowForecastCalendar).not.toHaveBeenCalled()
  })
})
