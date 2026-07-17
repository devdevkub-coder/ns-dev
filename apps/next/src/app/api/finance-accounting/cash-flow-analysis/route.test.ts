import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendSheet: vi.fn(),
  applyLayout: vi.fn(),
  bookNew: vi.fn(() => ({})),
  buildCashFlowAnalysis: vi.fn(),
  getFinanceBranchCodeIntersection: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  jsonToSheet: vi.fn(() => ({})),
  requirePermission: vi.fn(),
  write: vi.fn(async () => Buffer.from('xlsx')),
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
  buildCashFlowAnalysis: mocks.buildCashFlowAnalysis,
  CashFlowValidationError: class CashFlowValidationError extends Error {
    readonly status = 400
  },
}))
vi.mock('@/lib/server/xlsx', () => ({
  applyWorksheetTableLayout: mocks.applyLayout,
  XLSX: {
    utils: {
      book_append_sheet: mocks.appendSheet,
      book_new: mocks.bookNew,
      json_to_sheet: mocks.jsonToSheet,
    },
    write: mocks.write,
  },
}))

import { GET } from './route'

const payload = {
  charts: {
    projection: [
      { expectedIn: 10, expectedOut: 5, label: '7 วัน', projected: 105 },
      { expectedIn: 20, expectedOut: 10, label: '30 วัน', projected: 110 },
    ],
  },
  detailRows: [{ href: '/finance/ar', label: 'PBT', value: 50 }],
  fcdBalances: [{ currency: 'USD', value: 20 }],
  filters: { branchId: 'B01', from: '2026-07-01', to: '2026-07-17' },
  projectionBasis: 'bill-date basis',
  sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
  summary: { netProfitBeforeTax: 50, operatingCashFlow: 40 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({})
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [requested] : ['B01', 'B02'])
  mocks.buildCashFlowAnalysis.mockResolvedValue(payload)
})

describe('cash-flow-analysis query validation', () => {
  it('passes strict date-only filters to the builder', async () => {
    const response = await GET(new Request('http://localhost/api/finance-accounting/cash-flow-analysis?from=2026-07-01&to=2026-07-17&branchId=B01'))

    expect(response.status).toBe(200)
    expect(mocks.buildCashFlowAnalysis).toHaveBeenCalledWith({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: 'B01',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-17T00:00:00.000Z'),
    })
  })

  it.each([
    'from=2026-02-30&to=2026-03-01',
    'from=&to=2026-07-17',
    'from=2026-07-01T00%3A00%3A00Z&to=2026-07-17',
    'from=2026-07-18&to=2026-07-17',
  ])('returns 400 without querying for invalid dates: %s', async (query) => {
    const response = await GET(new Request(`http://localhost/api/finance-accounting/cash-flow-analysis?${query}`))

    expect(response.status).toBe(400)
    expect(mocks.buildCashFlowAnalysis).not.toHaveBeenCalled()
  })

  it('treats an explicit ALL branch as every authorized branch', async () => {
    await GET(new Request('http://localhost/api/finance-accounting/cash-flow-analysis?from=2026-07-01&to=2026-07-17&branchId=ALL'))

    expect(mocks.buildCashFlowAnalysis).toHaveBeenCalledWith({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: undefined,
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-17T00:00:00.000Z'),
    })
  })

  it('passes every allowed branch when a scoped user leaves the branch filter empty', async () => {
    mocks.getFinanceBranchCodeIntersection.mockReturnValue(['B01', 'B02'])

    await GET(new Request('http://localhost/api/finance-accounting/cash-flow-analysis?from=2026-07-01&to=2026-07-17'))

    expect(mocks.buildCashFlowAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: undefined,
    }))
  })

  it('returns 403 before loading data when the requested branch is outside scope', async () => {
    mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [] : ['B01', 'B02'])

    const response = await GET(new Request('http://localhost/api/finance-accounting/cash-flow-analysis?from=2026-07-01&to=2026-07-17&branchId=B99'))

    expect(response.status).toBe(403)
    expect(mocks.buildCashFlowAnalysis).not.toHaveBeenCalled()
  })
})

describe('cash-flow-analysis XLSX', () => {
  it('exports the same filtered payload as a workbook', async () => {
    const response = await GET(new Request('http://localhost/api/finance-accounting/cash-flow-analysis?from=2026-07-01&to=2026-07-17&branchId=B01&format=xlsx'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(response.headers.get('content-disposition')).toContain('cash-flow-analysis_B01_2026-07-01_2026-07-17.xlsx')
    expect(mocks.buildCashFlowAnalysis).toHaveBeenCalledWith({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: 'B01',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-17T00:00:00.000Z'),
    })
    expect(mocks.appendSheet).toHaveBeenCalledTimes(3)
    expect(mocks.write).toHaveBeenCalledTimes(1)
  })
})
