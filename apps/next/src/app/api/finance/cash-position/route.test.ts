import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SALES_BILL_STATUS } from '@/lib/server/sales-bill-history'

const mocks = vi.hoisted(() => ({
  buildFinanceCashPosition: vi.fn(),
  getAllowedBranchIds: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  listActiveBranches: vi.fn(),
  purchaseBillFindMany: vi.fn(),
  requirePermission: vi.fn(),
  salesBillFindMany: vi.fn(),
}))

vi.mock('@/lib/server/api-error', () => ({ apiErrorResponse: vi.fn((_error: unknown, message: string, status: number) => Response.json({ error: message }, { status })) }))
vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class AuthContextError extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  requirePermission: mocks.requirePermission,
}))
vi.mock('@/lib/server/branch-scope', () => ({ getAllowedBranchIds: mocks.getAllowedBranchIds }))
vi.mock('@/lib/server/finance-accounting-cash-position', () => ({ buildFinanceCashPosition: mocks.buildFinanceCashPosition }))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    purchase_bills: { findMany: mocks.purchaseBillFindMany },
    sales_bills: { findMany: mocks.salesBillFindMany },
  },
}))
vi.mock('@/lib/server/reference-master-cache', () => ({ listActiveBranches: mocks.listActiveBranches }))
vi.mock('@/lib/server/xlsx', () => ({ XLSX: {}, applyWorksheetTableLayout: vi.fn() }))

import { GET } from './route'

const context = { appUser: { email: 'tester@example.com' }, authUser: { email: 'tester@example.com' } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(context)
  mocks.getAllowedBranchIds.mockResolvedValue([7n])
  mocks.listActiveBranches.mockResolvedValue([{ id: 7n, name: 'Branch 1' }])
  mocks.buildFinanceCashPosition.mockResolvedValue({
    accountBalances: [
      { accountGroup: 'bank', accountNo: '001', balance: 20, bankName: 'Bank A', branchName: 'Branch 1', code: 'ACC-THB', currency: 'THB', id: '1', isFcd: false, name: 'THB Bank', odLimit: 0, supportedCurrencies: ['THB'] },
      { accountGroup: 'bank', accountNo: '002', balance: 999, bankName: 'Bank A', branchName: 'Branch 1', code: 'ACC-FCD', currency: 'THB', id: '2', isFcd: true, name: 'FCD USD', odLimit: 0, supportedCurrencies: ['THB', 'USD'] },
    ],
    cashAndBank: 1_019,
  })
  mocks.salesBillFindMany.mockResolvedValue([
    { credit_term: 0, customers: { credit_term: 0, name: 'Customer A' }, date: new Date('2026-07-30T00:00:00.000Z'), doc_no: 'SB-1', due_date: null, receivable_balance: 500, status: SALES_BILL_STATUS.UNRECEIVED },
  ])
  mocks.purchaseBillFindMany.mockResolvedValue([
    { date: new Date('2026-07-30T00:00:00.000Z'), doc_no: 'PB-1', payable_balance: 250, status: 'open', suppliers: { name: 'Supplier A' } },
  ])
})

describe('Cash Position FCD reconciliation', () => {
  it('uses the THB Bank Statement projection once and AR/AP bill balances at the same as-of date', async () => {
    const response = await GET(new Request('http://localhost/api/finance/cash-position?asOf=2026-07-30'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      summary: { accountBalance: 1_019, netAfterAp: 769, netExposure: 250 },
      exposure: { ap: { total: 250 }, ar: { total: 500 } },
    })
    expect(mocks.buildFinanceCashPosition).toHaveBeenCalledWith({ accountGroups: undefined, asOf: new Date('2026-07-30T00:00:00.000Z'), branchIds: [7n] })
    expect(mocks.salesBillFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { NOT: { status: 'cancelled' }, branch_id: { in: [7n] } } }))
    expect(mocks.purchaseBillFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { branch_id: { in: [7n] }, status: { notIn: ['cancelled', 'cancelled_supplier_swap'] } } }))
  })
})
