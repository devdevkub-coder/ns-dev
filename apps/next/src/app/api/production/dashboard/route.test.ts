import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status = 500) => Response.json({ error: message }, { status })),
  authContextErrorResponse: vi.fn(() => Response.json({ error: 'unauthorized' }, { status: 401 })),
  getAllowedBranchIds: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  loadProductionDashboard: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: mocks.apiErrorResponse }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: mocks.authContextErrorResponse,
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/branch-scope', () => ({ getAllowedBranchIds: mocks.getAllowedBranchIds }))
vi.mock('@/lib/server/production-dashboard', () => ({ loadProductionDashboard: mocks.loadProductionDashboard }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ appUser: { branchIds: ['B01'] } })
  mocks.getAllowedBranchIds.mockResolvedValue([1n])
  mocks.loadProductionDashboard.mockResolvedValue({ daily: [], machineUtil: [], monthly: [], rows: [], summary: {}, byStatus: [], topProducts: [] })
})

describe('GET /api/production/dashboard', () => {
  it('passes authenticated branch scope to the Dashboard service', async () => {
    const response = await GET(new Request('http://localhost/api/production/dashboard?dateFrom=2026-07-01&dateTo=2026-07-23'))

    expect(response.status).toBe(200)
    expect(mocks.loadProductionDashboard).toHaveBeenCalledWith({
      allowedBranchIds: [1n],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-23',
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
