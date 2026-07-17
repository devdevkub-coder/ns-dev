import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  bankFindMany: vi.fn(),
  branchFindMany: vi.fn(),
  buildFinanceCashPosition: vi.fn(),
  buildPlStatement: vi.fn(),
  buildTaxVatWht: vi.fn(),
  customerReceiptFindMany: vi.fn(),
  expenseFindMany: vi.fn(),
  findBranch: vi.fn(),
  loanPaymentAggregate: vi.fn(),
  loanPaymentFindMany: vi.fn(),
  loanScheduleFindMany: vi.fn(),
  paymentFindMany: vi.fn(),
  purchaseFindMany: vi.fn(),
  salesFindMany: vi.fn(),
  stockAggregate: vi.fn(),
  stockFindMany: vi.fn(),
}))

vi.mock('@/lib/business-code', () => ({ requireBusinessCode: (code: string) => code }))
vi.mock('@/lib/server/branch-reference', () => ({ findActiveBranchReferenceByCodeOrId: mocks.findBranch }))
vi.mock('@/lib/server/finance-accounting-cash-position', () => ({ buildFinanceCashPosition: mocks.buildFinanceCashPosition }))
vi.mock('@/lib/server/finance-accounting-statements', () => ({ buildPlStatement: mocks.buildPlStatement }))
vi.mock('@/lib/server/finance-accounting-tax', () => ({ buildTaxVatWht: mocks.buildTaxVatWht }))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    accounts: { findMany: mocks.accountFindMany },
    bank_statement: { findMany: mocks.bankFindMany },
    branches: { findMany: mocks.branchFindMany },
    customer_receipts: { findMany: mocks.customerReceiptFindMany },
    expenses: { findMany: mocks.expenseFindMany },
    loan_payments: { aggregate: mocks.loanPaymentAggregate, findMany: mocks.loanPaymentFindMany },
    loan_schedules: { findMany: mocks.loanScheduleFindMany },
    payments: { findMany: mocks.paymentFindMany },
    purchase_bills: { findMany: mocks.purchaseFindMany },
    sales_bills: { findMany: mocks.salesFindMany },
    stock_ledger: { aggregate: mocks.stockAggregate, findMany: mocks.stockFindMany },
  },
}))

import { buildCashFlowAnalysis, buildCashFlowForecastCalendar } from './finance-accounting-cashflow-planning'

const from = new Date('2026-07-01T00:00:00.000Z')
const to = new Date('2026-07-17T00:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findBranch.mockResolvedValue({ code: 'B01', id: 7n, name: 'Bangkok' })
  mocks.branchFindMany.mockResolvedValue([{ code: 'B01', id: 7n, name: 'Bangkok' }])
  mocks.buildFinanceCashPosition.mockResolvedValue({
    balance: 1_000,
    bankBalance: 1_000,
    cashAndBank: 1_000,
    cashBalance: 0,
    fcdBalances: [{ currency: 'USD', value: 50 }],
    odAvailable: 400,
    odLimit: 500,
    odUsed: 100,
  })
  mocks.buildPlStatement.mockResolvedValue({
    summary: {
      cogs: 200,
      depreciation: 10,
      expenses: 100,
      fxNet: 7,
      interest: 5,
      netProfitBeforeTax: 777,
      revenue: 1_000,
    },
  })
  mocks.salesFindMany.mockImplementation(async (args: { include?: unknown }) => args.include ? [
    {
      cogs_amount: 0,
      credit_term: 0,
      customers: { credit_term: 0, name: 'Customer A' },
      date: new Date('2026-07-01T00:00:00.000Z'),
      doc_no: 'SB-1',
      due_date: new Date('2026-07-18T00:00:00.000Z'),
      receivable_balance: 100,
      received_amount: 0,
      subtotal: 100,
      total_amount: 100,
      total_cost: 0,
      vat_amount: 0,
    },
    {
      cogs_amount: 0,
      credit_term: 0,
      customers: { credit_term: 0, name: 'Customer B' },
      date: new Date('2026-07-02T00:00:00.000Z'),
      doc_no: 'SB-2',
      due_date: new Date('2026-07-28T00:00:00.000Z'),
      receivable_balance: 60,
      received_amount: 0,
      subtotal: 60,
      total_amount: 60,
      total_cost: 0,
      vat_amount: 0,
    },
    {
      cogs_amount: 0,
      credit_term: 0,
      customers: { credit_term: 0, name: 'Customer C' },
      date: new Date('2026-07-03T00:00:00.000Z'),
      doc_no: 'SB-3',
      due_date: new Date('2026-08-20T00:00:00.000Z'),
      receivable_balance: 900,
      received_amount: 0,
      subtotal: 900,
      total_amount: 900,
      total_cost: 0,
      vat_amount: 0,
    },
  ] : [])
  mocks.purchaseFindMany.mockImplementation(async (args: { include?: unknown }) => args.include ? [{
    date: new Date('2026-07-16T00:00:00.000Z'),
    doc_no: 'PB-1',
    paid_amount: 0,
    payable_balance: 200,
    subtotal: 200,
    suppliers: { name: 'Supplier A' },
    total_amount: 200,
    vat_amount: 0,
  }] : [{ subtotal: 250, total_amount: 214, vat_amount: 14 }])
  mocks.expenseFindMany.mockImplementation(async (args: { where?: { paid_at?: unknown } }) => args.where?.paid_at
    ? [{ amount: 50, net_amount: 50 }]
    : [{
        amount: 50,
        date: new Date('2026-06-01T00:00:00.000Z'),
        doc_no: 'EXP-1',
        due_date: new Date('2026-07-20T00:00:00.000Z'),
        expense_categories: { name: 'Utilities' },
        net_amount: 50,
        paid_at: null,
        paid_status: 'pending',
        status: 'active',
      }])
  mocks.loanPaymentAggregate.mockResolvedValue({ _sum: { interest_amount: 5 } })
  mocks.loanPaymentFindMany.mockResolvedValue([{ interest_amount: 999 }])
  mocks.loanScheduleFindMany.mockResolvedValue([{
    due_date: new Date('2026-07-21T00:00:00.000Z'),
    installment_no: 1,
    loans: { contract_no: 'LN-1', lender_name: 'Bank' },
    paid_amount: 0,
    total_due_amount: 80,
  }])
  mocks.stockAggregate.mockResolvedValue({ _sum: { value_in: 500, value_out: 100 } })
  mocks.stockFindMany.mockResolvedValue([])
  mocks.accountFindMany.mockResolvedValue([])
  mocks.bankFindMany.mockResolvedValue([])
  mocks.buildTaxVatWht.mockResolvedValue({
    taxCalendar: [{ periodLabel: '2026-07', vatDue: '2026-07-22', vatPayable: 40, wC: 0, whtDue: '2026-07-07' }],
  })
  mocks.customerReceiptFindMany.mockResolvedValue([{ net_cash_in: 300 }])
  mocks.paymentFindMany.mockResolvedValue([
    { net_amount: 105, payment_approvals: { source_type: 'purchase_bill' } },
    { net_amount: 50, payment_approvals: { source_type: 'expense' } },
  ])
})

describe('buildCashFlowAnalysis', () => {
  it('uses Bangkok business-day bounds for purchase bill timestamps', async () => {
    await buildCashFlowAnalysis({ branchId: 'B01', from, to })

    const periodQuery = mocks.purchaseFindMany.mock.calls.find(([args]) => args.select)
    expect(periodQuery?.[0].where.date).toEqual({
      gte: new Date('2026-06-30T17:00:00.000Z'),
      lte: new Date('2026-07-17T16:59:59.999Z'),
    })
  })

  it('uses canonical net cash and counts each PMT cash movement once', async () => {
    mocks.customerReceiptFindMany.mockResolvedValue([{ net_cash_in: 240 }])
    mocks.paymentFindMany.mockResolvedValue([
      { net_amount: 103, payment_approvals: { source_type: 'purchase_bill' } },
      { net_amount: 52, payment_approvals: { source_type: 'expense' } },
      { net_amount: 25, payment_approvals: { source_type: 'advance_payment' } },
    ])

    const result = await buildCashFlowAnalysis({ branchId: 'B01', from, to })

    expect(mocks.customerReceiptFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { net_cash_in: true },
      where: expect.objectContaining({ status: 'active' }),
    }))
    expect(result.summary).toMatchObject({
      expensePaidOut: 52,
      operatingCashFlow: 55,
      otherPaymentsOut: 25,
      paymentRate: 51.5,
      receiptsIn: 240,
      supplierPaymentsOut: 103,
    })
  })

  it('uses canonical PBT, canonical cash documents, scoped interest, and the full conservative projection', async () => {
    const result = await buildCashFlowAnalysis({ branchId: 'B01', from, to })

    expect(mocks.buildPlStatement).toHaveBeenCalledWith({ branchId: 'B01', from, to, transactionMode: 'ALL' })
    expect(mocks.customerReceiptFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ date: expect.objectContaining({ gte: from }) }),
    }))
    expect(mocks.paymentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ date: expect.objectContaining({ gte: from }) }),
    }))
    expect(mocks.loanPaymentAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ accounts: { branch_id: { in: [7n] } } }),
    }))
    expect(mocks.loanScheduleFindMany).not.toHaveBeenCalled()
    expect(result.summary).toMatchObject({
      cashIn7: 100,
      cashIn30: 160,
      cashOut7: 290,
      expensePaidOut: 50,
      netProfitBeforeTax: 777,
      paymentRate: 52.5,
      projected7: 810,
      purchases: 200,
    })
    expect(result.summary).not.toHaveProperty('netProfit')
    expect(result.fcdBalances).toEqual([{ currency: 'USD', value: 50 }])
    expect(result.projectionBasis).toContain('วันที่บิลซื้อ')
    expect(result.sourceState.limitations.join(' ')).toContain('ไม่รวมตารางผ่อนชำระเงินกู้')
    expect(result.detailRows.find((row) => row.label === 'Cash Collection Rate')?.href).toContain('branchId=B01')
    expect(result.detailRows.filter((row) => row.label.includes('OD')).every((row) => row.href === '')).toBe(true)
    expect(mocks.salesFindMany.mock.calls.every(([args]) => args.where.cancelled_at === null)).toBe(true)
    expect(mocks.purchaseFindMany.mock.calls.every(([args]) => args.where.cancelled_at === null)).toBe(true)
    expect(mocks.salesFindMany.mock.calls[0]?.[0].where.OR).toEqual(expect.arrayContaining([
      { status: null },
      { status: expect.objectContaining({ mode: 'insensitive', notIn: expect.arrayContaining(['cancelled', 'canceled', 'voided', 'reversed']) }) },
    ]))
  })

  it('describes the report basis in business language without exposing implementation identifiers', async () => {
    const result = await buildCashFlowAnalysis({ branchId: 'B01', from, to })
    const copy = [result.sourceState.basis, result.projectionBasis, ...result.sourceState.limitations].join(' ')

    expect(copy).toContain('ใช้เพื่อการวางแผนและบริหาร')
    expect(copy).toContain('วันที่บิลซื้อ')
    expect(copy).not.toMatch(/bank_statement|customer_receipts|due_date|loan_schedules|net_cash_in|net_amount|payment_approval/i)
  })

  it('includes loan schedules when no branch is selected', async () => {
    mocks.findBranch.mockResolvedValue(null)
    const result = await buildCashFlowAnalysis({ from, to })

    expect(mocks.loanScheduleFindMany).toHaveBeenCalledTimes(1)
    expect(result.summary.cashOut7).toBe(370)
    expect(result.sourceState.limitations.join(' ')).not.toContain('ไม่รวมตารางผ่อนชำระเงินกู้')
    expect(mocks.loanScheduleFindMany.mock.calls[0]?.[0].where.OR).toEqual(expect.arrayContaining([
      { payment_status: null },
      { payment_status: expect.objectContaining({ mode: 'insensitive', notIn: expect.arrayContaining(['paid']) }) },
    ]))
  })

  it('does not offer drilldowns that cannot preserve a constrained multi-branch scope', async () => {
    const result = await buildCashFlowAnalysis({ allowedBranchCodes: ['B01'], from, to })

    for (const label of ['Operating Cash Flow จริง', 'Burn Rate (เงินออก/วัน เฉลี่ย)', 'Cash Collection Rate', 'Supplier Payment Rate', 'OD Used / Limit', 'วันที่ OD จะเต็มวงเงิน']) {
      expect(result.detailRows.find((row) => row.label === label)?.href).toBe('')
    }
    expect(result.detailRows.find((row) => row.label.includes('Profit Before Tax'))?.href).toContain('/finance-accounting/pl-statement')
  })

  it('rejects an unknown branch instead of silently returning all branches', async () => {
    mocks.findBranch.mockResolvedValue(null)
    await expect(buildCashFlowAnalysis({ branchId: 'BAD', from, to })).rejects.toMatchObject({ status: 400 })
  })

  it('aggregates only the allowed branches without leaking global tax or loan schedules', async () => {
    mocks.branchFindMany.mockResolvedValue([
      { code: 'B01', id: 7n, name: 'Bangkok' },
      { code: 'B02', id: 8n, name: 'Rayong' },
    ])
    mocks.buildPlStatement.mockImplementation(async ({ branchId }: { branchId?: string }) => ({
      summary: {
        cogs: branchId === 'B02' ? 20 : 10,
        depreciation: 0,
        expenses: branchId === 'B02' ? 4 : 2,
        fxNet: 0,
        interest: 0,
        netProfitBeforeTax: branchId === 'B02' ? 200 : 100,
        revenue: branchId === 'B02' ? 400 : 200,
      },
    }))

    const result = await buildCashFlowAnalysis({ allowedBranchCodes: ['B01', 'B02'], from, to })

    expect(mocks.buildPlStatement).toHaveBeenCalledTimes(2)
    expect(mocks.buildPlStatement).toHaveBeenCalledWith({ branchId: 'B01', from, to, transactionMode: 'ALL' })
    expect(mocks.buildPlStatement).toHaveBeenCalledWith({ branchId: 'B02', from, to, transactionMode: 'ALL' })
    expect(mocks.buildFinanceCashPosition).toHaveBeenCalledWith({ asOf: to, branchIds: [7n, 8n] })
    expect(mocks.buildTaxVatWht).toHaveBeenCalledTimes(2)
    expect(mocks.buildTaxVatWht).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'B01' }))
    expect(mocks.buildTaxVatWht).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'B02' }))
    expect(mocks.loanScheduleFindMany).not.toHaveBeenCalled()
    expect(mocks.purchaseFindMany.mock.calls.every(([args]) => args.where.branch_id.in.join(',') === '7,8')).toBe(true)
    expect(result.branches.map((branch) => branch.code)).toEqual(['B01', 'B02'])
    expect(result.summary.netProfitBeforeTax).toBe(300)
  })

  it('rejects a requested branch outside the supplied allowed scope', async () => {
    await expect(buildCashFlowAnalysis({ allowedBranchCodes: ['B02'], branchId: 'B01', from, to })).rejects.toMatchObject({ status: 403 })
  })

  it('does not send silent row caps to cash-flow source queries', async () => {
    await buildCashFlowAnalysis({ branchId: 'B01', from, to })
    const calls = [
      ...mocks.salesFindMany.mock.calls,
      ...mocks.purchaseFindMany.mock.calls,
      ...mocks.expenseFindMany.mock.calls,
      ...mocks.customerReceiptFindMany.mock.calls,
      ...mocks.paymentFindMany.mock.calls,
      ...mocks.loanScheduleFindMany.mock.calls,
    ]
    expect(calls.some(([args]) => Object.hasOwn(args, 'take'))).toBe(false)
  })
})

describe('buildCashFlowForecastCalendar', () => {
  it('projects a purchase bill on its Bangkok business date', async () => {
    mocks.purchaseFindMany.mockImplementation(async (args: { include?: unknown }) => args.include ? [{
      date: new Date('2026-06-30T18:00:00.000Z'),
      doc_no: 'PB-BKK',
      paid_amount: 0,
      payable_balance: 200,
      subtotal: 200,
      suppliers: { name: 'Supplier Bangkok' },
      total_amount: 200,
      vat_amount: 0,
    }] : [])

    const result = await buildCashFlowForecastCalendar({ branchId: 'B01', horizon: 7, startDate: new Date('2026-06-30T00:00:00.000Z') })
    const event = result.events.find((row) => row.refNo === 'PB-BKK')

    expect(event).toMatchObject({ date: '2026-07-01', type: 'AP' })
    expect(result.insights.topAP[0]?.dueDate).toBe('2026-07-01')
  })

  it('uses the same branch-safe projection sources as the analysis', async () => {
    const result = await buildCashFlowForecastCalendar({ branchId: 'B01', horizon: 7, startDate: to })

    expect(result.summary).toMatchObject({ startCash: 1_000, totalIn: 100, totalOut: 290 })
    expect(result.events.map((event) => event.type)).toEqual(expect.arrayContaining(['AR', 'AP', 'EXPENSE', 'TAX']))
    expect(result.events.map((event) => event.type)).not.toContain('LOAN')
    expect(result.projectionBasis).toContain('วันที่บิลซื้อ')
  })
})
