import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status = 500) => Response.json({ error: message }, { status })),
  authContextErrorResponse: vi.fn(() => Response.json({ error: 'unauthorized' }, { status: 401 })),
  getAllowedBranchIds: vi.fn(),
  getBranchCodeIntersection: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  loadProductionMetrics: vi.fn(),
  loadProductionReportFilterOptions: vi.fn(),
  requirePermission: vi.fn(),
  summarizeProductionMetrics: vi.fn(),
  summarizeProductionOutputProducts: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: mocks.apiErrorResponse }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: mocks.authContextErrorResponse,
  getBranchCodeIntersection: mocks.getBranchCodeIntersection,
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/branch-scope', () => ({ getAllowedBranchIds: mocks.getAllowedBranchIds }))
vi.mock('@/lib/server/production-reports', () => ({
  loadProductionMetrics: mocks.loadProductionMetrics,
  loadProductionReportFilterOptions: mocks.loadProductionReportFilterOptions,
  summarizeProductionMetrics: mocks.summarizeProductionMetrics,
  summarizeProductionOutputProducts: mocks.summarizeProductionOutputProducts,
}))
vi.mock('@/lib/server/xlsx', () => ({
  XLSX: { utils: { book_append_sheet: vi.fn(), book_new: vi.fn(), json_to_sheet: vi.fn() }, write: vi.fn() },
  applyWorksheetTableLayout: vi.fn(),
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({ appUser: { branchIds: ['B01'] } })
  mocks.getAllowedBranchIds.mockResolvedValue([1n])
  mocks.getBranchCodeIntersection.mockReturnValue(['B01'])
  mocks.loadProductionMetrics.mockResolvedValue([])
  mocks.loadProductionReportFilterOptions.mockResolvedValue({
    branches: [{ id: 'B01', name: 'สาขาหลัก' }],
    machines: [{ id: '17', name: 'เครื่องตัด' }],
  })
  mocks.summarizeProductionMetrics.mockReturnValue({ count: 0 })
  mocks.summarizeProductionOutputProducts.mockReturnValue([])
})

describe('GET /api/production/report', () => {
  it('passes every report filter with the authenticated branch scope and returns scoped filter options', async () => {
    const response = await GET(new Request('http://localhost/api/production/report?branchId=B01&machineId=17&status=Completed&dateFrom=2026-07-01&dateTo=2026-07-31'))

    expect(response.status).toBe(200)
    expect(mocks.loadProductionMetrics).toHaveBeenCalledWith({
      allowedBranchIds: [1n],
      branchId: 'B01',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      machineId: '17',
      status: 'Completed',
    })
    expect(mocks.loadProductionReportFilterOptions).toHaveBeenCalledWith(['B01'])
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(response.json()).resolves.toMatchObject({
      filters: {
        branches: [{ id: 'B01', name: 'สาขาหลัก' }],
        machines: [{ id: '17', name: 'เครื่องตัด' }],
      },
    })
  })
})
