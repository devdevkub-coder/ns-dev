import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  applyWorksheetTableLayout: vi.fn(),
  bookAppendSheet: vi.fn(),
  bookNew: vi.fn(() => ({})),
  buildPlStatement: vi.fn(),
  getFinanceBranchCodeIntersection: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  jsonToSheet: vi.fn(() => ({})),
  requirePermission: vi.fn(),
  write: vi.fn(() => Buffer.from('xlsx')),
}))

vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn(() => Response.json({ error: 'server error' }, { status: 500 })),
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
  buildPlStatement: mocks.buildPlStatement,
  FinancialStatementInputError: class FinancialStatementInputError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message)
    }
  },
}))

vi.mock('@/lib/server/xlsx', () => ({
  applyWorksheetTableLayout: mocks.applyWorksheetTableLayout,
  XLSX: {
    utils: {
      book_append_sheet: mocks.bookAppendSheet,
      book_new: mocks.bookNew,
      json_to_sheet: mocks.jsonToSheet,
    },
    write: mocks.write,
  },
}))

import { GET } from './route'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'

const payload = {
  branches: [],
  filters: { branchId: 'B02', from: '2026-07-01', to: '2026-07-31', transactionMode: 'ALL' },
  sections: [
    {
      amount: 100,
      details: [{ amount: 100, date: '2026-07-10', description: 'ลูกค้าเอ', href: '/sales/bills/SB-001', refNo: 'SB-001', sourceType: 'sales_bill' }],
      label: 'รายได้จากการขาย (Revenue)',
      section: 'รายได้',
    },
  ],
  sourceState: { basis: 'management', limitations: [], writeActionsEnabled: false },
  split: { stock: { cogs: 0, revenue: 100 }, trading: { cogs: 0, revenue: 0 } },
  summary: { assetDisposalNet: 0, cogs: 0, depreciation: 0, expenses: 0, fxNet: 0, grossProfit: 100, interest: 0, netProfitBeforeTax: 100, operatingProfit: 100, revenue: 100 },
}

beforeEach(() => {
  vi.clearAllMocks()
  const context = { isAdmin: false }
  mocks.getCurrentAuthContext.mockResolvedValue(context)
  mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [requested] : ['B01', 'B02'])
  mocks.buildPlStatement.mockResolvedValue(payload)
  mocks.bookNew.mockReturnValue({})
  mocks.jsonToSheet.mockReturnValue({})
  mocks.write.mockResolvedValue(Buffer.from('xlsx'))
})

describe('GET /api/finance-accounting/pl-statement', () => {
  it('rejects malformed and inverted date ranges without querying the report', async () => {
    const malformed = await GET(new NextRequest('http://localhost/api/finance-accounting/pl-statement?from=2026-02-30&to=2026-03-01'))
    const inverted = await GET(new NextRequest('http://localhost/api/finance-accounting/pl-statement?from=2026-03-02&to=2026-03-01'))
    const empty = await GET(new NextRequest('http://localhost/api/finance-accounting/pl-statement?from=&to=2026-03-01'))

    expect(malformed.status).toBe(400)
    expect(inverted.status).toBe(400)
    expect(empty.status).toBe(400)
    expect(mocks.buildPlStatement).not.toHaveBeenCalled()
  })

  it('exports XLSX from the exact same validated report filters and includes source details', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/pl-statement?from=2026-07-01&to=2026-07-31&branchId=B02&format=xlsx'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(mocks.buildPlStatement).toHaveBeenCalledWith({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: 'B02',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T00:00:00.000Z'),
      transactionMode: 'ALL',
    })
    expect(mocks.jsonToSheet).toHaveBeenCalledTimes(2)
    const detailSheetRows = (mocks.jsonToSheet.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>)[1]?.[0]
    expect(detailSheetRows).toEqual([
      expect.objectContaining({
        href: '/sales/bills/SB-001',
        sourceType: 'sales_bill',
      }),
    ])
    expect(mocks.write).toHaveBeenCalledOnce()
  })

  it.each(['STOCK', 'TRADING'])('rejects the misleading partial %s profit filter', async (transactionMode) => {
    const response = await GET(new NextRequest(`http://localhost/api/finance-accounting/pl-statement?transactionMode=${transactionMode}`))

    expect(response.status).toBe(400)
    expect(mocks.buildPlStatement).not.toHaveBeenCalled()
  })

  it('passes every authorized branch to the report when no branch is selected', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/pl-statement'))

    expect(response.status).toBe(200)
    expect(mocks.buildPlStatement).toHaveBeenCalledWith(expect.objectContaining({
      allowedBranchCodes: ['B01', 'B02'],
      branchId: undefined,
      transactionMode: 'ALL',
    }))
  })

  it.each(['ALL', 'all'])('normalizes branchId=%s to the authorized all-branch scope', async (branchId) => {
    await GET(new NextRequest(`http://localhost/api/finance-accounting/pl-statement?branchId=${branchId}`))

    expect(mocks.getFinanceBranchCodeIntersection).not.toHaveBeenCalledWith(expect.anything(), branchId)
    expect(mocks.buildPlStatement).toHaveBeenCalledWith(expect.objectContaining({ branchId: undefined }))
  })

  it('returns 403 before building the report for a forbidden requested branch', async () => {
    mocks.getFinanceBranchCodeIntersection.mockImplementation((_context, requested?: string) => requested ? [] : ['B01'])

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/pl-statement?branchId=B02'))

    expect(response.status).toBe(403)
    expect(mocks.buildPlStatement).not.toHaveBeenCalled()
  })

  it('returns a client error when the requested branch does not exist', async () => {
    mocks.buildPlStatement.mockRejectedValue(new FinancialStatementInputError('ไม่พบสาขาที่เปิดใช้งานตามตัวกรองที่ระบุ'))

    const response = await GET(new NextRequest('http://localhost/api/finance-accounting/pl-statement?branchId=UNKNOWN'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      error: 'ไม่พบสาขาที่เปิดใช้งานตามตัวกรองที่ระบุ',
    })
  })
})
