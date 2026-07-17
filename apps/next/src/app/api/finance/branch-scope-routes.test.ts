import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  branchFindMany: vi.fn(),
  customerFindMany: vi.fn(),
  findActiveBranchReferenceByCodeOrId: vi.fn(),
  findActiveCustomerReferenceByCodeOrId: vi.fn(),
  findActiveSupplierReferenceByCodeOrId: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  listActiveBranches: vi.fn(),
  listActiveBranchesByCodes: vi.fn(),
  listActiveCustomerBranchOptions: vi.fn(),
  listActiveCustomerBranchOptionsByBranchCodes: vi.fn(),
  listActiveSupplierBranchOptions: vi.fn(),
  listActiveSupplierBranchOptionsByBranchCodes: vi.fn(),
  purchaseBillFindMany: vi.fn(),
  requirePermission: vi.fn(),
  salesBillFindMany: vi.fn(),
  salesChannelFindFirst: vi.fn(),
  salesChannelFindMany: vi.fn(),
  supplierFindMany: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))

vi.mock('@/lib/server/branch-reference', () => ({
  findActiveBranchReferenceByCodeOrId: mocks.findActiveBranchReferenceByCodeOrId,
}))

vi.mock('@/lib/server/customer-reference', () => ({
  findActiveCustomerReferenceByCodeOrId: mocks.findActiveCustomerReferenceByCodeOrId,
}))

vi.mock('@/lib/server/supplier-reference', () => ({
  findActiveSupplierReferenceByCodeOrId: mocks.findActiveSupplierReferenceByCodeOrId,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    branches: { findMany: mocks.branchFindMany },
    customers: { findMany: mocks.customerFindMany },
    purchase_bills: { findMany: mocks.purchaseBillFindMany },
    sales_bills: { findMany: mocks.salesBillFindMany },
    sales_channels: { findFirst: mocks.salesChannelFindFirst, findMany: mocks.salesChannelFindMany },
    suppliers: { findMany: mocks.supplierFindMany },
  },
}))

vi.mock('@/lib/server/reference-master-cache', () => ({
  listActiveBranches: mocks.listActiveBranches,
  listActiveBranchesByCodes: mocks.listActiveBranchesByCodes,
  listActiveCustomerBranchOptions: mocks.listActiveCustomerBranchOptions,
  listActiveCustomerBranchOptionsByBranchCodes: mocks.listActiveCustomerBranchOptionsByBranchCodes,
  listActiveSupplierBranchOptions: mocks.listActiveSupplierBranchOptions,
  listActiveSupplierBranchOptionsByBranchCodes: mocks.listActiveSupplierBranchOptionsByBranchCodes,
}))

vi.mock('@/lib/server/xlsx', () => ({
  applyWorksheetTableLayout: vi.fn(),
  XLSX: {
    utils: { book_append_sheet: vi.fn(), book_new: vi.fn(), json_to_sheet: vi.fn() },
    write: vi.fn(),
  },
}))

import { GET as getAp } from './ap/route'
import { GET as getAr } from './ar/route'

const routes = [
  {
    agingBill: {
      branches: { code: 'B01', id: 1n, name: 'สำนักงานใหญ่' },
      credit_term: 0,
      customers: { code: 'C01', credit_term: 0, id: 1n, market_scope: 'ในประเทศ', name: 'ลูกค้า' },
      date: new Date('2026-07-15T00:00:00.000Z'),
      doc_no: 'AR-001',
      due_date: new Date('2026-07-16T00:00:00.000Z'),
      id: 1n,
      receivable_balance: 100,
      received_amount: 0,
      sales_channels: null,
      status: 'open',
      total_amount: 100,
    },
    billFindMany: mocks.salesBillFindMany,
    get: getAr,
    name: 'AR',
    partyOptions: mocks.listActiveCustomerBranchOptions,
    partyOptionsByBranchCodes: mocks.listActiveCustomerBranchOptionsByBranchCodes,
    partyFindMany: mocks.customerFindMany,
    partyRelation: 'customer_branches',
    url: 'http://localhost/api/finance/ar',
  },
  {
    agingBill: {
      branches: { code: 'B01', id: 1n, name: 'สำนักงานใหญ่' },
      date: new Date('2026-07-16T00:00:00.000Z'),
      doc_no: 'AP-001',
      id: 1n,
      paid_amount: 0,
      payable_balance: 100,
      status: 'open',
      suppliers: { code: 'S01', id: 1n, name: 'ผู้ขาย' },
      total_amount: 100,
    },
    billFindMany: mocks.purchaseBillFindMany,
    get: getAp,
    name: 'AP',
    partyOptions: mocks.listActiveSupplierBranchOptions,
    partyOptionsByBranchCodes: mocks.listActiveSupplierBranchOptionsByBranchCodes,
    partyFindMany: mocks.supplierFindMany,
    partyRelation: 'supplier_branches',
    url: 'http://localhost/api/finance/ap',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue({
    appUser: { branchIds: ['B01'] },
    isAdmin: false,
    roles: [{ branchScope: 'custom' }],
  })
  mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue(null)
  mocks.findActiveCustomerReferenceByCodeOrId.mockResolvedValue(null)
  mocks.findActiveSupplierReferenceByCodeOrId.mockResolvedValue(null)
  mocks.salesChannelFindFirst.mockResolvedValue(null)
  mocks.salesBillFindMany.mockResolvedValue([])
  mocks.purchaseBillFindMany.mockResolvedValue([])
  mocks.customerFindMany.mockResolvedValue([])
  mocks.supplierFindMany.mockResolvedValue([])
  mocks.salesChannelFindMany.mockResolvedValue([])
  mocks.branchFindMany.mockResolvedValue([{ active: true, code: 'B01', id: 1n, name: 'สำนักงานใหญ่' }])
  mocks.listActiveBranches.mockResolvedValue([{ code: 'B01', id: 1n, name: 'สำนักงานใหญ่' }])
  mocks.listActiveBranchesByCodes.mockResolvedValue([{ code: 'B01', id: 1n, name: 'สำนักงานใหญ่' }])
  mocks.listActiveCustomerBranchOptions.mockResolvedValue([])
  mocks.listActiveCustomerBranchOptionsByBranchCodes.mockResolvedValue([])
  mocks.listActiveSupplierBranchOptions.mockResolvedValue([])
  mocks.listActiveSupplierBranchOptionsByBranchCodes.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe.each(routes)('$name finance destination branch scope', ({ agingBill, billFindMany, get, partyOptions, partyOptionsByBranchCodes, url }) => {
  it('uses the Bangkok business date for aging before 07:00 local time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T17:30:00.000Z'))
    billFindMany.mockResolvedValue([agingBill])

    const response = await get(new Request(`${url}?page=2&pageSize=1`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.byBucket).toContainEqual({ bills: 1, bucket: '1-30', total: 100 })
    expect(body.summary.overdue).toBe(100)
  })

  it('fail-closes an all-branch request to the effective allowed codes', async () => {
    const response = await get(new Request(url))

    expect(response.status).toBe(200)
    expect(billFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branches: { is: { code: { in: ['B01'] } } },
      }),
    }))
    expect(mocks.listActiveBranchesByCodes).toHaveBeenCalledWith(['B01'])
    expect(partyOptionsByBranchCodes).toHaveBeenCalledWith(['B01'])
  })

  it('returns 403 before loading data for an existing branch outside the effective scope', async () => {
    mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue({ code: 'B02', id: 2n, name: 'สาขา 2' })

    const response = await get(new Request(`${url}?branchId=B02`))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN' })
    expect(billFindMany).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown or inactive explicit branch instead of dropping the filter', async () => {
    const response = await get(new Request(`${url}?branchId=MISSING`))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' })
    expect(billFindMany).not.toHaveBeenCalled()
  })

  it('keeps a branchScope=all role unrestricted', async () => {
    mocks.getCurrentAuthContext.mockResolvedValue({
      appUser: { branchIds: [] },
      isAdmin: false,
      roles: [{ branchScope: 'all' }],
    })

    const response = await get(new Request(url))

    expect(response.status).toBe(200)
    expect(billFindMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('branches')
    expect(mocks.listActiveBranches).toHaveBeenCalledTimes(1)
    expect(partyOptions).toHaveBeenCalledTimes(1)
  })

  it('keeps an empty mapped scope as an empty query instead of treating it as all branches', async () => {
    mocks.getCurrentAuthContext.mockResolvedValue({
      appUser: { branchIds: [] },
      isAdmin: false,
      roles: [{ branchScope: 'custom' }],
    })

    const response = await get(new Request(url))

    expect(response.status).toBe(200)
    expect(billFindMany.mock.calls[0]?.[0]?.where).toMatchObject({
      branches: { is: { code: { in: [] } } },
    })
    expect(mocks.listActiveBranchesByCodes).not.toHaveBeenCalled()
    expect(partyOptionsByBranchCodes).not.toHaveBeenCalled()
  })
})
