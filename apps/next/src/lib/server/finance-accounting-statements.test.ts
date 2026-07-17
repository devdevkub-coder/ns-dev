import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  assetDisposalFindMany: vi.fn(),
  bankStatementFindMany: vi.fn(),
  branchFindMany: vi.fn(),
  depreciationFindMany: vi.fn(),
  expenseFindMany: vi.fn(),
  findActiveBranchReferenceByCodeOrId: vi.fn(),
  fxFindMany: vi.fn(),
  historicalMonthlyFindMany: vi.fn(),
  listActiveAccounts: vi.fn(),
  listActiveBranches: vi.fn(),
  loanPaymentFindMany: vi.fn(),
  salesBillFindMany: vi.fn(),
  tradingAllocationFactFindMany: vi.fn(),
  tradingDealFindMany: vi.fn(),
}))

vi.mock('@/lib/server/branch-reference', () => ({
  findActiveBranchReferenceByCodeOrId: mocks.findActiveBranchReferenceByCodeOrId,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    accounts: { findMany: mocks.accountFindMany },
    asset_disposals: { findMany: mocks.assetDisposalFindMany },
    bank_statement: { findMany: mocks.bankStatementFindMany },
    branches: { findMany: mocks.branchFindMany },
    depreciations: { findMany: mocks.depreciationFindMany },
    expenses: { findMany: mocks.expenseFindMany },
    fx_gain_loss: { findMany: mocks.fxFindMany },
    historical_monthly: { findMany: mocks.historicalMonthlyFindMany },
    loan_payments: { findMany: mocks.loanPaymentFindMany },
    sales_bills: { findMany: mocks.salesBillFindMany },
    trading_allocation_facts: { findMany: mocks.tradingAllocationFactFindMany },
    trading_deals: { findMany: mocks.tradingDealFindMany },
  },
}))

vi.mock('@/lib/server/reference-master-cache', () => ({
  listActiveAccounts: mocks.listActiveAccounts,
  listActiveBranches: mocks.listActiveBranches,
}))

import { buildCashFlowStatement, buildPlStatement, FinancialStatementInputError } from './finance-accounting-statements'

const from = new Date('2026-07-01T00:00:00.000Z')
const to = new Date('2026-07-31T00:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue(null)
  mocks.branchFindMany.mockResolvedValue([{ code: 'B01', id: 1n, name: 'สำนักงานใหญ่' }])
  mocks.listActiveBranches.mockResolvedValue([{ code: 'B01', id: 1n, name: 'สำนักงานใหญ่' }])
  mocks.listActiveAccounts.mockResolvedValue([])
  mocks.accountFindMany.mockResolvedValue([])
  mocks.assetDisposalFindMany.mockResolvedValue([])
  mocks.bankStatementFindMany.mockResolvedValue([])
  mocks.salesBillFindMany.mockResolvedValue([])
  mocks.expenseFindMany.mockResolvedValue([])
  mocks.depreciationFindMany.mockResolvedValue([])
  mocks.loanPaymentFindMany.mockResolvedValue([])
  mocks.fxFindMany.mockResolvedValue([])
  mocks.historicalMonthlyFindMany.mockResolvedValue([])
  mocks.tradingAllocationFactFindMany.mockResolvedValue([])
  mocks.tradingDealFindMany.mockResolvedValue([])
})

describe('buildPlStatement', () => {
  it('returns the canonical profit-before-tax formula with Thai-first source drilldowns', async () => {
    mocks.salesBillFindMany.mockResolvedValue([{
      branches: { code: 'B01', name: 'สำนักงานใหญ่' },
      cogs_amount: 600,
      customers: { name: 'ลูกค้าเอ' },
      date: new Date('2026-07-10T00:00:00.000Z'),
      doc_no: 'SB/26-001',
      subtotal: 1020,
      total_amount: 1070,
      total_cost: 600,
      transaction_mode: 'STOCK',
      vat_amount: 70,
    }])
    mocks.expenseFindMany.mockResolvedValue([{
      amount: 100,
      branches: { code: 'B01', name: 'สำนักงานใหญ่' },
      date: new Date('2026-07-11T00:00:00.000Z'),
      doc_no: 'EXP-001',
      expense_categories: { name: 'ค่าสำนักงาน' },
      net_amount: 93.46,
      payee: 'ผู้ขายเอ',
    }])
    mocks.depreciationFindMany.mockResolvedValue([{
      amount: 50,
      assets: { branch_id: 1n, code: 'FA-001', name: 'รถยก' },
      date: new Date('2026-07-31T00:00:00.000Z'),
    }])
    mocks.loanPaymentFindMany.mockResolvedValue([{
      date: new Date('2026-07-20T00:00:00.000Z'),
      doc_no: 'LP-001',
      interest_amount: 20,
      loans: { contract_no: 'LN-001', lender_name: 'ธนาคารเอ' },
    }])
    mocks.fxFindMany.mockResolvedValue([{
      currency: 'USD',
      date: new Date('2026-07-21T00:00:00.000Z'),
      gain_loss: -10,
      notes: 'FX-001',
      ref_type: 'receipt',
    }])

    const payload = await buildPlStatement({ from, to })

    expect(payload.summary).toMatchObject({
      cogs: 600,
      depreciation: 50,
      expenses: 100,
      fxNet: -10,
      grossProfit: 400,
      interest: 20,
      netProfitBeforeTax: 220,
      operatingProfit: 250,
      revenue: 1000,
    })
    expect(payload.sections.at(-1)).toMatchObject({
      amount: 220,
      label: 'กำไรก่อนภาษี (Profit Before Tax)',
      section: 'กำไรก่อนภาษี',
    })
    expect(payload.sections[0]?.details?.[0]).toMatchObject({
      href: '/sales/bills/SB%2F26-001',
      sourceType: 'sales_bill',
    })
    expect(payload.sections[3]?.details?.[0]).toMatchObject({ href: '/daily/expense/EXP-001', sourceType: 'expense' })
    expect(payload.sections[4]?.details?.[0]).toMatchObject({ href: '/finance-accounting/depreciation', sourceType: 'depreciation' })
    expect(payload.sections[7]?.details?.[0]).toMatchObject({ href: '/finance-accounting/loan-contracts', sourceType: 'loan_payment' })
    expect(payload.sections[8]?.details?.[0]).toMatchObject({ href: '/finance/foreign/fx-gain-loss-report', sourceType: 'fx_gain_loss' })
  })

  it.each([
    { expectedTone: 'good', gainLoss: 75 },
    { expectedTone: 'bad', gainLoss: -125 },
  ])('includes an approved asset-disposal gain/loss of $gainLoss in profit before tax', async ({ expectedTone, gainLoss }) => {
    mocks.assetDisposalFindMany.mockResolvedValue([{
      assets: { branch_id: 1n, code: 'FA-001', name: 'รถยก' },
      disposal_date: new Date('2026-07-22T00:00:00.000Z'),
      disposal_no: 'ADP-001',
      gain_loss: gainLoss,
      reason: 'จำหน่ายตามรอบ',
    }])

    const payload = await buildPlStatement({ from, to })

    expect(payload.summary.assetDisposalNet).toBe(gainLoss)
    expect(payload.summary.netProfitBeforeTax).toBe(gainLoss)
    expect(payload.sections.find((line) => line.details?.some((detail) => detail.sourceType === 'asset_disposal'))).toMatchObject({
      amount: gainLoss,
      details: [{
        amount: gainLoss,
        href: '/finance-accounting/asset-disposal',
        refNo: 'ADP-001',
        sourceType: 'asset_disposal',
      }],
      section: 'รายได้และค่าใช้จ่ายอื่น',
      tone: expectedTone,
    })
  })

  it('uses complete branch-scoped source queries and discloses unavailable branch FX', async () => {
    mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue({ code: 'B02', id: 2n, name: 'สาขา 2' })

    const payload = await buildPlStatement({ branchId: 'B02', from, to })

    const salesQuery = mocks.salesBillFindMany.mock.calls[0]?.[0]
    const expenseQuery = mocks.expenseFindMany.mock.calls[0]?.[0]
    const depreciationQuery = mocks.depreciationFindMany.mock.calls[0]?.[0]
    const loanQuery = mocks.loanPaymentFindMany.mock.calls[0]?.[0]
    const disposalQuery = mocks.assetDisposalFindMany.mock.calls[0]?.[0]
    expect(salesQuery).not.toHaveProperty('take')
    expect(expenseQuery).not.toHaveProperty('take')
    expect(depreciationQuery).not.toHaveProperty('take')
    expect(loanQuery).not.toHaveProperty('take')
    expect(disposalQuery).not.toHaveProperty('take')
    expect(salesQuery.where).toMatchObject({ branch_id: { in: [2n] }, cancelled_at: null })
    expect(expenseQuery.where).toMatchObject({
      branch_id: { in: [2n] },
      status: { in: ['approved', 'paid'], mode: 'insensitive' },
    })
    expect(depreciationQuery.where).toMatchObject({
      assets: { branch_id: { in: [2n] } },
      reversed_at: null,
      status: { equals: 'posted', mode: 'insensitive' },
    })
    expect(loanQuery.where).toMatchObject({ accounts: { branch_id: { in: [2n] } } })
    expect(disposalQuery.where).toMatchObject({
      assets: { branch_id: { in: [2n] } },
      reversed_at: null,
      status: { equals: 'approved', mode: 'insensitive' },
    })
    expect(mocks.fxFindMany).not.toHaveBeenCalled()
    expect(payload.summary.fxNet).toBe(0)
    expect(payload.sourceState.limitations).toContain('ไม่รวมกำไร/ขาดทุนอัตราแลกเปลี่ยนเมื่อจำกัดขอบเขตสาขา เพราะ fx_gain_loss ยังไม่มีมิติสาขา')
  })

  it('scopes every source and branch option to multiple allowed active branches', async () => {
    mocks.branchFindMany.mockResolvedValue([
      { code: 'B01', id: 1n, name: 'สำนักงานใหญ่' },
      { code: 'B02', id: 2n, name: 'สาขา 2' },
    ])

    const payload = await buildPlStatement({ allowedBranchCodes: ['b01', 'B02', 'B02'], from, to })

    expect(mocks.branchFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, code: { in: ['B01', 'B02'] } },
    }))
    expect(mocks.salesBillFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [1n, 2n] } })
    expect(mocks.expenseFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [1n, 2n] } })
    expect(mocks.depreciationFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ assets: { branch_id: { in: [1n, 2n] } } })
    expect(mocks.loanPaymentFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ accounts: { branch_id: { in: [1n, 2n] } } })
    expect(mocks.assetDisposalFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ assets: { branch_id: { in: [1n, 2n] } } })
    expect(mocks.fxFindMany).not.toHaveBeenCalled()
    expect(payload.branches.map((branch) => branch.code)).toEqual(['B01', 'B02'])
    expect(payload.sourceState.limitations).toContain('ไม่รวมกำไร/ขาดทุนอัตราแลกเปลี่ยนเมื่อจำกัดขอบเขตสาขา เพราะ fx_gain_loss ยังไม่มีมิติสาขา')
  })

  it('returns no source data for an empty allowed-branch scope instead of falling back to every branch', async () => {
    mocks.branchFindMany.mockResolvedValue([])

    const payload = await buildPlStatement({ allowedBranchCodes: [], from, to })

    expect(payload.branches).toEqual([])
    expect(payload.summary).toMatchObject({
      assetDisposalNet: 0,
      netProfitBeforeTax: 0,
      revenue: 0,
    })
    expect(mocks.salesBillFindMany).not.toHaveBeenCalled()
    expect(mocks.expenseFindMany).not.toHaveBeenCalled()
    expect(mocks.depreciationFindMany).not.toHaveBeenCalled()
    expect(mocks.loanPaymentFindMany).not.toHaveBeenCalled()
    expect(mocks.assetDisposalFindMany).not.toHaveBeenCalled()
    expect(mocks.fxFindMany).not.toHaveBeenCalled()
  })

  it('rejects a selected branch outside the allowed scope with 403 semantics', async () => {
    mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue({ code: 'B02', id: 2n, name: 'สาขา 2' })

    await expect(buildPlStatement({ allowedBranchCodes: ['B01'], branchId: 'B02', from, to })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.salesBillFindMany).not.toHaveBeenCalled()
  })

  it.each(['STOCK', 'TRADING'] as const)('rejects the partial %s profit filter before querying report sources', async (transactionMode) => {
    await expect(buildPlStatement({ from, to, transactionMode })).rejects.toBeInstanceOf(FinancialStatementInputError)
    expect(mocks.salesBillFindMany).not.toHaveBeenCalled()
  })

  it('rejects an unknown branch instead of silently returning every branch', async () => {
    await expect(buildPlStatement({ branchId: 'UNKNOWN', from, to })).rejects.toBeInstanceOf(FinancialStatementInputError)
    expect(mocks.salesBillFindMany).not.toHaveBeenCalled()
  })

  it('rejects an inverted period before querying report sources', async () => {
    await expect(buildPlStatement({ from: to, to: from })).rejects.toThrow('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด')
    expect(mocks.salesBillFindMany).not.toHaveBeenCalled()
  })
})

describe('buildCashFlowStatement branch scope', () => {
  it('scopes account, bank activity, and branch options to every allowed active branch', async () => {
    mocks.branchFindMany.mockResolvedValue([
      { code: 'B01', id: 1n, name: 'สำนักงานใหญ่' },
      { code: 'B02', id: 2n, name: 'สาขา 2' },
    ])

    const payload = await buildCashFlowStatement({ allowedBranchCodes: ['b01', 'B02', 'B02'], from, to })

    expect(mocks.branchFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, code: { in: ['B01', 'B02'] } },
    }))
    expect(mocks.accountFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, branch_id: { in: [1n, 2n] } },
    }))
    expect(mocks.bankStatementFindMany).toHaveBeenCalledTimes(2)
    for (const [query] of mocks.bankStatementFindMany.mock.calls) {
      expect(query.where).toMatchObject({ accounts: { branch_id: { in: [1n, 2n] } } })
    }
    expect(payload.branches.map((branch) => branch.code)).toEqual(['B01', 'B02'])
  })

  it('keeps an empty allowed scope as branch_id in [] for every source query', async () => {
    mocks.branchFindMany.mockResolvedValue([])

    const payload = await buildCashFlowStatement({ allowedBranchCodes: [], from, to })

    expect(mocks.accountFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ branch_id: { in: [] } })
    for (const [query] of mocks.bankStatementFindMany.mock.calls) {
      expect(query.where).toMatchObject({ accounts: { branch_id: { in: [] } } })
    }
    expect(payload.branches).toEqual([])
  })

  it('rejects an unknown explicit branch before querying cash sources', async () => {
    await expect(buildCashFlowStatement({ branchId: 'MISSING', from, to })).rejects.toBeInstanceOf(FinancialStatementInputError)
    expect(mocks.accountFindMany).not.toHaveBeenCalled()
    expect(mocks.bankStatementFindMany).not.toHaveBeenCalled()
  })

  it('rejects an existing explicit branch outside the allowed scope with 403 semantics', async () => {
    mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue({ code: 'B02', id: 2n, name: 'สาขา 2' })

    await expect(buildCashFlowStatement({ allowedBranchCodes: ['B01'], branchId: 'B02', from, to })).rejects.toMatchObject({ status: 403 })
    expect(mocks.accountFindMany).not.toHaveBeenCalled()
    expect(mocks.bankStatementFindMany).not.toHaveBeenCalled()
  })

  it('keeps an unrestricted all-branch request free of branch predicates', async () => {
    await buildCashFlowStatement({ from, to })

    expect(mocks.accountFindMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('branch_id')
    for (const [query] of mocks.bankStatementFindMany.mock.calls) {
      expect(query.where).not.toHaveProperty('accounts')
    }
    expect(mocks.listActiveBranches).toHaveBeenCalledTimes(1)
  })
})
