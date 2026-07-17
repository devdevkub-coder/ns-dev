import type { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, listActiveBranches, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

const CANCELLED_STATUSES = ['cancelled', 'void', 'ยกเลิก']
const PL_EXCLUDED_STATUSES = ['cancelled', 'canceled', 'void', 'voided', 'reversed', 'ยกเลิก']

export type PeriodFilter = {
  allowedBranchCodes?: string[] | null
  branchId?: string
  costBasis?: 'COMPARE' | 'DEAL' | 'WAC'
  from: Date
  to: Date
  transactionMode?: 'ALL' | 'STOCK' | 'TRADING'
}

export type AsOfFilter = {
  asOf: Date
  branchId?: string
}

type DetailRow = {
  amount: number
  date: string
  description: string
  href?: string
  refNo: string
  sourceType?: string
}

type StatementLine = {
  amount: number
  details?: DetailRow[]
  label: string
  level?: number
  section: string
  tone?: 'default' | 'good' | 'bad' | 'muted' | 'total'
}

type BranchRow = {
  code: string
  id: string
  name: string
}

type SourceState = {
  basis: string
  limitations: string[]
  writeActionsEnabled: false
}

type SalesBillRow = Prisma.sales_billsGetPayload<{
  include: { branches: { select: { code: true; name: true } }; customers: { select: { name: true } } }
}>

type PurchaseBillRow = Prisma.purchase_billsGetPayload<{
  include: { branches: { select: { code: true; name: true } }; suppliers: { select: { name: true } } }
}>

type ExpenseRow = Prisma.expensesGetPayload<{
  include: { branches: { select: { code: true; name: true } }; expense_categories: { select: { name: true } } }
}>

type AssetDisposalRow = Prisma.asset_disposalsGetPayload<{
  include: { assets: { select: { branch_id: true; code: true; name: true } } }
}>

type BankRow = Prisma.bank_statementGetPayload<{
  include: { accounts: { select: { account_no: true; bank_name: true; name: true; type: true } } }
}>

type AssetRow = Prisma.assetsGetPayload<{
  include: { depreciations: true }
}>

type LoanRow = Prisma.loansGetPayload<{
  include: { loan_payments: true; loan_schedules: true }
}>

const CASHFLOW_CATEGORIES = {
  EXCLUDE_INTERNAL: { dir: '-', label: 'โอนภายใน (Internal Transfer) — ไม่นับใน CF', section: 'Excluded' },
  FIN_IN_CAPITAL: { dir: 'IN', label: 'เพิ่มทุน', section: 'Financing' },
  FIN_IN_DIRECTOR_LOAN: { dir: 'IN', label: 'รับเงินกู้กรรมการ', section: 'Financing' },
  FIN_IN_LOAN: { dir: 'IN', label: 'รับเงินกู้', section: 'Financing' },
  FIN_OUT_DIRECTOR_LOAN: { dir: 'OUT', label: 'คืนเงินกู้กรรมการ', section: 'Financing' },
  FIN_OUT_DIVIDEND: { dir: 'OUT', label: 'จ่ายเงินปันผล', section: 'Financing' },
  FIN_OUT_LEASE_PRIN: { dir: 'OUT', label: 'จ่ายเงินต้น Leasing', section: 'Financing' },
  FIN_OUT_LOAN_PRIN: { dir: 'OUT', label: 'จ่ายเงินต้นเงินกู้', section: 'Financing' },
  INV_IN_ASSET_SALE: { dir: 'IN', label: 'รับจากการขายทรัพย์สิน', section: 'Investing' },
  INV_IN_DEPOSIT_REFUND: { dir: 'IN', label: 'รับเงินมัดจำคืน', section: 'Investing' },
  INV_OUT_ASSET_PURCHASE: { dir: 'OUT', label: 'ซื้อทรัพย์สิน', section: 'Investing' },
  INV_OUT_DEPOSIT: { dir: 'OUT', label: 'จ่ายเงินมัดจำ', section: 'Investing' },
  OP_IN_CUST_RECEIPT: { dir: 'IN', label: 'รับเงินจากลูกค้า', section: 'Operating' },
  OP_IN_OTHER: { dir: 'IN', label: 'รายรับการดำเนินงานอื่น', section: 'Operating' },
  OP_OUT_EXPENSE: { dir: 'OUT', label: 'จ่ายค่าใช้จ่าย', section: 'Operating' },
  OP_OUT_INTEREST: { dir: 'OUT', label: 'จ่ายดอกเบี้ย', section: 'Operating' },
  OP_OUT_SALARY: { dir: 'OUT', label: 'จ่ายเงินเดือน / ค่าแรง', section: 'Operating' },
  OP_OUT_SUPPLIER: { dir: 'OUT', label: 'จ่ายผู้ขาย / Supplier', section: 'Operating' },
  OP_OUT_TAX: { dir: 'OUT', label: 'จ่ายภาษี', section: 'Operating' },
} as const

type CashFlowCategoryKey = keyof typeof CASHFLOW_CATEGORIES
type CashFlowGroupKey = 'EX' | 'FIN_IN' | 'FIN_OUT' | 'INV_IN' | 'INV_OUT' | 'OP_IN' | 'OP_OUT'
type CashFlowDetailRow = DetailRow & { cfCat: CashFlowCategoryKey; label: string }

function dateOnly(date: Date) {
  return toDateOnly(date)
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function notCancelledWhere() {
  return { NOT: { status: { in: CANCELLED_STATUSES } } }
}

function plActiveNullableStatusWhere() {
  return {
    OR: [
      { status: null },
      { NOT: { status: { in: PL_EXCLUDED_STATUSES, mode: 'insensitive' as const } } },
    ],
  }
}

export class FinancialStatementInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'FinancialStatementInputError'
  }
}

function assertValidPeriodFilter(filter: PeriodFilter) {
  if (Number.isNaN(filter.from.getTime()) || Number.isNaN(filter.to.getTime())) {
    throw new FinancialStatementInputError('ช่วงวันที่ไม่ถูกต้อง')
  }
  if (filter.from > filter.to) {
    throw new FinancialStatementInputError('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด')
  }
  if (filter.transactionMode && filter.transactionMode !== 'ALL') {
    throw new FinancialStatementInputError('งบกำไรขาดทุนรองรับเฉพาะข้อมูลรวมทุกประเภทรายการ (ALL)')
  }
}

function sourceState(extra: string[] = []): SourceState {
  return {
    basis: 'Management/source from operational transactions. Not a statutory GL statement.',
    limitations: [
      'ยังไม่มี GL journal, COA mapping, closing period และ retained earnings roll-forward ที่ยืนยันแล้ว',
      'ตัวเลขคำนวณจาก sales/purchase/expense/bank/stock/asset/loan/equity operational tables',
      ...extra,
    ],
    writeActionsEnabled: false,
  }
}

function sumDetails(rows: DetailRow[]) {
  return rows.reduce((sum, row) => sum + row.amount, 0)
}

function moneyLine(section: string, label: string, amount: number, details?: DetailRow[], tone?: StatementLine['tone'], level = 0): StatementLine {
  return { amount, details, label, level, section, tone }
}

function branchRow(branch: { code?: string | null; id: string | bigint; name: string }): BranchRow {
  const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
  return { code, id: code, name: branch.name }
}

function cachedMoney(value: string | null) {
  return value == null ? 0 : Number(value)
}

function bankRef(row: BankRow) {
  return row.ref_no || row.ref_type || `${row.accounts?.account_no ?? row.accounts?.name ?? 'BANK'}-${dateOnly(row.date)}`
}

function isInternalTransfer(row: BankRow) {
  const text = [row.ref_type, row.cash_flow_category, row.description, row.desc, row.note].filter(Boolean).join(' ').toLowerCase()
  return text.includes('transfer') || text.includes('internal') || text.includes('โอนระหว่าง')
}

function normalizeCashFlowCategory(row: BankRow): CashFlowCategoryKey {
  const explicit = row.cash_flow_category?.trim().toUpperCase()
  if (explicit && explicit in CASHFLOW_CATEGORIES) return explicit as CashFlowCategoryKey

  const refType = row.ref_type?.trim().toUpperCase() ?? ''
  if (refType === 'PMT') return 'OP_OUT_SUPPLIER'
  if (refType === 'RCP') return 'OP_IN_CUST_RECEIPT'
  if (refType === 'EXP') return 'OP_OUT_EXPENSE'
  if (refType === 'TRF') return 'EXCLUDE_INTERNAL'
  if (refType === 'LOAN-PAY') return 'FIN_OUT_LOAN_PRIN'
  if (refType === 'LOAN-IN') return 'FIN_IN_LOAN'

  const inflow = toNumber(row.amount_in)
  const outflow = toNumber(row.amount_out)
  const signedAmount = inflow - outflow
  const text = [row.cash_flow_category, row.ref_type, row.description, row.desc, row.note].filter(Boolean).join(' ').toLowerCase()

  if (isInternalTransfer(row)) return 'EXCLUDE_INTERNAL'
  if (text.includes('interest') || text.includes('ดอกเบี้ย')) return 'OP_OUT_INTEREST'
  if (text.includes('salary') || text.includes('wage') || text.includes('เงินเดือน') || text.includes('ค่าแรง')) return 'OP_OUT_SALARY'
  if (text.includes('tax') || text.includes('vat') || text.includes('wht') || text.includes('ภาษี')) return 'OP_OUT_TAX'
  if (text.includes('dividend') || text.includes('ปันผล')) return 'FIN_OUT_DIVIDEND'
  if (text.includes('director') || text.includes('กรรมการ')) return signedAmount >= 0 ? 'FIN_IN_DIRECTOR_LOAN' : 'FIN_OUT_DIRECTOR_LOAN'
  if (text.includes('lease') || text.includes('leasing')) return signedAmount >= 0 ? 'FIN_IN_LOAN' : 'FIN_OUT_LEASE_PRIN'
  if (text.includes('loan') || text.includes('capital') || text.includes('equity') || text.includes('finance')) return signedAmount >= 0 ? 'FIN_IN_LOAN' : 'FIN_OUT_LOAN_PRIN'
  if (text.includes('deposit refund') || text.includes('คืนมัดจำ')) return 'INV_IN_DEPOSIT_REFUND'
  if (text.includes('deposit') || text.includes('มัดจำ')) return signedAmount >= 0 ? 'INV_IN_DEPOSIT_REFUND' : 'INV_OUT_DEPOSIT'
  if (text.includes('asset sale') || text.includes('ขายทรัพย์สิน')) return 'INV_IN_ASSET_SALE'
  if (text.includes('asset') || text.includes('fixed') || text.includes('ลงทุน') || text.includes('ทรัพย์สิน')) return signedAmount >= 0 ? 'INV_IN_ASSET_SALE' : 'INV_OUT_ASSET_PURCHASE'
  return signedAmount >= 0 ? 'OP_IN_OTHER' : 'OP_OUT_EXPENSE'
}

function cashFlowGroupKey(category: CashFlowCategoryKey): CashFlowGroupKey {
  const config = CASHFLOW_CATEGORIES[category]
  if (config.section === 'Excluded') return 'EX'
  if (config.section === 'Operating') return config.dir === 'IN' ? 'OP_IN' : 'OP_OUT'
  if (config.section === 'Investing') return config.dir === 'IN' ? 'INV_IN' : 'INV_OUT'
  return config.dir === 'IN' ? 'FIN_IN' : 'FIN_OUT'
}

function sumCashFlowDetails(rows: CashFlowDetailRow[]) {
  return rows.reduce((sum, row) => sum + row.amount, 0)
}

function summarizeCashFlowDetails(rows: CashFlowDetailRow[]) {
  const net = sumCashFlowDetails(rows)
  return {
    inflow: rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0),
    net,
    outflow: Math.abs(rows.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0)),
    rows: rows.map(({ amount, date, description, refNo }) => ({ amount, date, description, refNo })),
  }
}

function historicalMonthOverlaps(row: Prisma.historical_monthlyGetPayload<Record<string, never>>, from: Date, to: Date) {
  const year = row.year ?? 0
  const month = row.month ?? 0
  if (!year || !month) return false
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return start <= to && end >= from
}

function sumHistoricalCashFlow(rows: Prisma.historical_monthlyGetPayload<Record<string, never>>[], categoryId: string, from: Date, to: Date) {
  return rows
    .filter((row) => row.metric_type === 'cashflow' && row.category_id === categoryId && historicalMonthOverlaps(row, from, to))
    .reduce((sum, row) => sum + toNumber(row.amount), 0)
}

function computeCashBalance(accounts: Array<{ id: bigint; opening_balance: Prisma.Decimal | number | null }>, rows: BankRow[]) {
  const balances = new Map<bigint, number>()
  accounts.forEach((account) => balances.set(account.id, toNumber(account.opening_balance)))
  rows.forEach((row) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    const next = row.balance === null || row.balance === undefined
      ? previous + toNumber(row.amount_in) - toNumber(row.amount_out)
      : toNumber(row.balance)
    balances.set(row.account_id, next)
  })
  return Array.from(balances.values()).reduce((sum, value) => sum + value, 0)
}

async function loadActiveBranchRefs(allowedBranchCodes: string[] | null = null) {
  if (allowedBranchCodes === null) return listActiveBranches()
  const branches = await prisma.branches.findMany({
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    select: { code: true, id: true, name: true },
    where: { active: true, ...(allowedBranchCodes !== null ? { code: { in: allowedBranchCodes } } : {}) },
  })
  return branches
}

async function listBranches() {
  return (await loadActiveBranchRefs()).map(branchRow)
}

function normalizeAllowedBranchCodes(codes: string[] | null | undefined) {
  return codes === undefined || codes === null
    ? null
    : [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))]
}

async function resolveStatementBranchScope(filter: PeriodFilter) {
  const allowedBranchCodes = normalizeAllowedBranchCodes(filter.allowedBranchCodes)
  const requestedBranchId = filter.branchId?.trim().toUpperCase() === 'ALL' ? undefined : filter.branchId?.trim()
  const selectedBranch = requestedBranchId ? await findActiveBranchReferenceByCodeOrId(requestedBranchId) : null
  if (requestedBranchId && !selectedBranch) {
    throw new FinancialStatementInputError('ไม่พบสาขาที่เปิดใช้งานตามตัวกรองที่ระบุ')
  }
  if (selectedBranch && allowedBranchCodes !== null && !allowedBranchCodes.includes(selectedBranch.code.toUpperCase())) {
    throw new FinancialStatementInputError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403)
  }
  const visibleBranchRefs = await loadActiveBranchRefs(allowedBranchCodes)
  const branchIds = selectedBranch
    ? [selectedBranch.id]
    : allowedBranchCodes === null
      ? null
      : visibleBranchRefs.map((branch) => branch.id)
  return {
    branchIds,
    branches: visibleBranchRefs.map(branchRow),
    constrained: branchIds !== null,
    selectedBranchCode: selectedBranch?.code,
  }
}

function directBranchWhere(branchIds: bigint[] | null) {
  return branchIds === null ? {} : { branch_id: { in: branchIds } }
}

function relatedBranchWhere(relation: 'accounts' | 'assets', branchIds: bigint[] | null) {
  return branchIds === null ? {} : { [relation]: { branch_id: { in: branchIds } } }
}

async function loadPlInputs(filter: PeriodFilter) {
  const dateWhere = { gte: filter.from, lte: filter.to }
  const scope = await resolveStatementBranchScope(filter)
  if (scope.branchIds?.length === 0) {
    return {
      assetDisposals: [] as AssetDisposalRow[],
      depreciations: [] as Array<Prisma.depreciationsGetPayload<{ include: { assets: { select: { branch_id: true; code: true; name: true } } } }>>,
      expenses: [] as ExpenseRow[],
      fxRows: [] as Array<Prisma.fx_gain_lossGetPayload<object>>,
      historicalMonthly: [] as Prisma.historical_monthlyGetPayload<Record<string, never>>[],
      loanPayments: [] as Array<Prisma.loan_paymentsGetPayload<{ include: { loans: { select: { contract_no: true; lender_name: true } } } }>>,
      salesBills: [] as SalesBillRow[],
      scope,
    }
  }
  const branchWhere = directBranchWhere(scope.branchIds)
  const [salesBills, expenses, depreciations, loanPayments, fxRows, assetDisposals, historicalMonthly] = await Promise.all([
    prisma.sales_bills.findMany({
      include: { branches: { select: { code: true, name: true } }, customers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      where: { ...plActiveNullableStatusWhere(), ...branchWhere, cancelled_at: null, date: dateWhere },
    }),
    prisma.expenses.findMany({
      include: { branches: { select: { code: true, name: true } }, expense_categories: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      where: { ...branchWhere, date: dateWhere, status: { in: ['approved', 'paid'], mode: 'insensitive' } },
    }),
    prisma.depreciations.findMany({
      include: { assets: { select: { branch_id: true, code: true, name: true } } },
      orderBy: [{ date: 'asc' }],
      where: {
        date: dateWhere,
        reversed_at: null,
        status: { equals: 'posted', mode: 'insensitive' },
        ...relatedBranchWhere('assets', scope.branchIds),
      },
    }),
    prisma.loan_payments.findMany({
      include: { loans: { select: { contract_no: true, lender_name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      where: {
        ...plActiveNullableStatusWhere(),
        date: dateWhere,
        ...relatedBranchWhere('accounts', scope.branchIds),
      },
    }),
    scope.constrained
      ? Promise.resolve([])
      : prisma.fx_gain_loss.findMany({
          orderBy: [{ date: 'asc' }],
          where: { date: dateWhere },
        }),
    prisma.asset_disposals.findMany({
      include: { assets: { select: { branch_id: true, code: true, name: true } } },
      orderBy: [{ disposal_date: 'asc' }, { disposal_no: 'asc' }],
      where: {
        disposal_date: dateWhere,
        reversed_at: null,
        status: { equals: 'approved', mode: 'insensitive' },
        ...relatedBranchWhere('assets', scope.branchIds),
      },
    }),
    scope.constrained
      ? Promise.resolve([])
      : prisma.historical_monthly.findMany({
          orderBy: [{ year: 'asc' }, { month: 'asc' }, { id: 'asc' }],
          take: 2000,
        }),
  ])
  return { assetDisposals, depreciations, expenses, fxRows, historicalMonthly, loanPayments, salesBills, scope }
}

function billRevenueAmount(bill: SalesBillRow) {
  return toNumber(bill.total_amount) - toNumber(bill.vat_amount)
}

function billWacCostAmount(bill: SalesBillRow) {
  return toNumber(bill.cogs_amount) || toNumber(bill.total_cost)
}

function ratioPart(total: number, ratio: number) {
  if (!(total > 0) || !(ratio > 0)) return 0
  return total * Math.min(1, Math.max(0, ratio))
}

function groupHistoricalBaseline(rows: Prisma.historical_monthlyGetPayload<Record<string, never>>[]) {
  const baselineRows = rows.filter((row) => (row.year ?? 0) === 2026 && (row.month ?? 0) >= 1 && (row.month ?? 0) <= 4)
  if (!baselineRows.length) return { hasData: false as const }

  const sumMetric = (metricType: string, categoryId?: string) => baselineRows
    .filter((row) => row.metric_type === metricType && (categoryId ? row.category_id === categoryId : true))
    .reduce((sum, row) => sum + toNumber(row.amount), 0)

  const revenue = sumMetric('pnl', 'revenue')
  const cogs = sumMetric('pnl', 'cogs')
  const opexMetric = sumMetric('pnl', 'opex')
  const expenseFallback = baselineRows
    .filter((row) => row.metric_type === 'expense')
    .reduce((sum, row) => sum + toNumber(row.amount), 0)
  const opex = opexMetric || expenseFallback
  const interest = sumMetric('pnl', 'interest')
  const otherIncome = sumMetric('pnl', 'other_inc')
  const tax = sumMetric('pnl', 'tax')
  const netProfit = revenue - cogs - opex - interest + otherIncome - tax
  const hasData = revenue + cogs + opex + interest + otherIncome + tax > 0

  return {
    cogs,
    hasData,
    interest,
    netProfit,
    opex,
    otherIncome,
    revenue,
    tax,
  }
}

export async function buildPlStatement(filter: PeriodFilter) {
  assertValidPeriodFilter(filter)
  const { assetDisposals, depreciations, expenses, fxRows, historicalMonthly, loanPayments, salesBills, scope } = await loadPlInputs(filter)
  type DepreciationRow = (typeof depreciations)[number]
  type LoanPaymentRow = (typeof loanPayments)[number]
  type FxGainLossRow = (typeof fxRows)[number]

  const costBasis = filter.costBasis ?? 'WAC'
  const billIdMap = new Map<string, SalesBillRow>()
  const billDocNoMap = new Map<string, SalesBillRow>()
  salesBills.forEach((bill) => {
    billIdMap.set(String(bill.id), bill)
    billDocNoMap.set(bill.doc_no, bill)
  })

  const activeAllocationFacts = await prisma.trading_allocation_facts.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take: 20000,
    where: {
      status: 'active',
      OR: [
        { sales_bill_id: { in: salesBills.map((bill) => bill.id) } },
        { sales_doc_no: { in: salesBills.map((bill) => bill.doc_no) } },
      ],
    },
  })
  const coveredDealIds = new Set<bigint>()
  const factByBill = new Map<string, { cost: number; qty: number }>()
  activeAllocationFacts.forEach((fact) => {
    const bill = (fact.sales_bill_id ? billIdMap.get(String(fact.sales_bill_id)) : undefined) ?? (fact.sales_doc_no ? billDocNoMap.get(fact.sales_doc_no) : undefined)
    if (!bill) return
    const key = String(bill.id)
    const current = factByBill.get(key) ?? { cost: 0, qty: 0 }
    current.cost += toNumber(fact.matched_cogs)
    current.qty += toNumber(fact.qty)
    factByBill.set(key, current)
    if (fact.trading_deal_id) coveredDealIds.add(fact.trading_deal_id)
  })
  const fallbackDeals = await prisma.trading_deals.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take: 20000,
    where: {
      NOT: { status: { in: CANCELLED_STATUSES } },
      OR: [
        { sales_bill_id: { in: salesBills.map((bill) => bill.id) } },
        { sales_bill_no: { in: salesBills.map((bill) => bill.doc_no) } },
      ],
    },
  })
  fallbackDeals.forEach((deal) => {
    if (coveredDealIds.has(deal.id)) return
    const bill = (deal.sales_bill_id ? billIdMap.get(String(deal.sales_bill_id)) : undefined) ?? (deal.sales_bill_no ? billDocNoMap.get(deal.sales_bill_no) : undefined)
    if (!bill) return
    const key = String(bill.id)
    const current = factByBill.get(key) ?? { cost: 0, qty: 0 }
    current.cost += toNumber(deal.matched_purchase_amount)
    current.qty += toNumber(deal.matched_qty)
    factByBill.set(key, current)
  })

  const billCostMap = new Map<string, { deal: number; mappedRatio: number; replaced: boolean; wac: number }>()
  salesBills.forEach((bill) => {
    const wac = billWacCostAmount(bill)
    const items = Array.isArray(bill.items) ? bill.items : []
    const totalQty = items.reduce<number>((sum, item) => {
      if (!item || typeof item !== 'object') return sum
      const raw = item as Record<string, unknown>
      return sum + toNumber(raw.qty as number | null | undefined) + toNumber(raw.netWeight as number | null | undefined) + toNumber(raw.net_weight as number | null | undefined)
    }, 0)
    const matched = factByBill.get(String(bill.id)) ?? { cost: 0, qty: 0 }
    const mappedRatio = totalQty > 0 ? Math.min(1, matched.qty / totalQty) : 0
    const dealCost = matched.cost > 0
      ? matched.cost + Math.max(0, wac - ratioPart(wac, mappedRatio))
      : wac
    billCostMap.set(String(bill.id), {
      deal: dealCost,
      mappedRatio,
      replaced: matched.cost > 0 && Math.abs(dealCost - wac) > 0.01,
      wac,
    })
  })

  const salesDetails = salesBills.map((bill: SalesBillRow) => ({
    amount: billRevenueAmount(bill),
    date: dateOnly(bill.date),
    description: bill.customers?.name ?? bill.branches?.name ?? '-',
    href: `/sales/bills/${encodeURIComponent(bill.doc_no)}`,
    refNo: bill.doc_no,
    sourceType: 'sales_bill',
  }))
  const cogsDetails = salesBills.map((bill: SalesBillRow) => ({
    amount: costBasis === 'DEAL'
      ? billCostMap.get(String(bill.id))?.deal ?? billWacCostAmount(bill)
      : billWacCostAmount(bill),
    date: dateOnly(bill.date),
    description: `${bill.transaction_mode ?? 'STOCK'} · ${bill.customers?.name ?? '-'}${costBasis === 'DEAL' && (billCostMap.get(String(bill.id))?.replaced ?? false) ? ' · Deal Cost' : ''}`,
    href: `/sales/bills/${encodeURIComponent(bill.doc_no)}`,
    refNo: bill.doc_no,
    sourceType: 'sales_bill',
  })).filter((row) => row.amount > 0)
  const expenseDetails = expenses.map((expense: ExpenseRow) => ({
    amount: toNumber(expense.amount),
    date: dateOnly(expense.date),
    description: expense.expense_categories?.name ?? expense.payee ?? '-',
    href: `/daily/expense/${encodeURIComponent(expense.doc_no)}`,
    refNo: expense.doc_no,
    sourceType: 'expense',
  }))
  const depreciationDetails = depreciations.map((dep: DepreciationRow) => ({
    amount: toNumber(dep.amount),
    date: dateOnly(dep.date),
    description: dep.assets?.name ?? '-',
    href: '/finance-accounting/depreciation',
    refNo: dep.assets?.code ?? `DEP-${dateOnly(dep.date)}`,
    sourceType: 'depreciation',
  }))
  const interestDetails = loanPayments.map((payment: LoanPaymentRow) => ({
    amount: toNumber(payment.interest_amount),
    date: dateOnly(payment.date),
    description: payment.loans?.lender_name ?? '-',
    href: '/finance-accounting/loan-contracts',
    refNo: payment.doc_no || payment.loans?.contract_no || '-',
    sourceType: 'loan_payment',
  })).filter((row) => row.amount > 0)
  const fxDetails = fxRows.map((row: FxGainLossRow) => ({
    amount: toNumber(row.gain_loss),
    date: dateOnly(row.date),
    description: [row.currency, row.ref_type].filter(Boolean).join(' · ') || '-',
    href: '/finance/foreign/fx-gain-loss-report',
    refNo: row.notes || `FX-${dateOnly(row.date)}`,
    sourceType: 'fx_gain_loss',
  })).filter((row: DetailRow) => row.amount !== 0)
  const assetDisposalDetails = assetDisposals.map((row: AssetDisposalRow) => ({
    amount: toNumber(row.gain_loss),
    date: dateOnly(row.disposal_date),
    description: row.assets?.name ?? row.reason ?? '-',
    href: '/finance-accounting/asset-disposal',
    refNo: row.disposal_no,
    sourceType: 'asset_disposal',
  }))

  const revenue = sumDetails(salesDetails)
  const cogsWac = salesBills.reduce((sum, bill) => sum + billWacCostAmount(bill), 0)
  const cogsDeal = salesBills.reduce((sum, bill) => sum + (billCostMap.get(String(bill.id))?.deal ?? billWacCostAmount(bill)), 0)
  const cogs = costBasis === 'DEAL' ? cogsDeal : cogsWac
  const expensesTotal = sumDetails(expenseDetails)
  const depreciation = sumDetails(depreciationDetails)
  const interest = sumDetails(interestDetails)
  const fxNet = sumDetails(fxDetails)
  const assetDisposalNet = sumDetails(assetDisposalDetails)
  const grossProfit = revenue - cogs
  const operatingExpenses = expensesTotal + depreciation
  const operatingProfit = grossProfit - operatingExpenses
  const netProfitBeforeTax = operatingProfit - interest + fxNet + assetDisposalNet
  const stockBills = salesBills.filter((bill) => bill.transaction_mode !== 'TRADING')
  const tradingBills = salesBills.filter((bill) => bill.transaction_mode === 'TRADING')
  const stockRevenue = stockBills.reduce((sum, bill) => sum + billRevenueAmount(bill), 0)
  const tradingRevenue = tradingBills.reduce((sum, bill) => sum + billRevenueAmount(bill), 0)
  const stockCogsWac = stockBills.reduce((sum, bill) => sum + billWacCostAmount(bill), 0)
  const stockCogsDeal = stockBills.reduce((sum, bill) => sum + (billCostMap.get(String(bill.id))?.deal ?? billWacCostAmount(bill)), 0)
  const tradingCogsWac = tradingBills.reduce((sum, bill) => sum + billWacCostAmount(bill), 0)
  const tradingCogsDeal = tradingBills.reduce((sum, bill) => sum + (billCostMap.get(String(bill.id))?.deal ?? billWacCostAmount(bill)), 0)
  const grossProfitWac = revenue - cogsWac
  const grossProfitDeal = revenue - cogsDeal
  const netProfitBeforeTaxWac = grossProfitWac - operatingExpenses - interest + fxNet + assetDisposalNet
  const netProfitBeforeTaxDeal = grossProfitDeal - operatingExpenses - interest + fxNet + assetDisposalNet
  const dualReplacedCount = Array.from(billCostMap.values()).filter((row) => row.replaced).length
  const historicalBaseline = groupHistoricalBaseline(historicalMonthly)

  return {
    branches: scope.branches,
    filters: {
      branchId: scope.selectedBranchCode ?? 'ALL',
      costBasis,
      from: dateOnly(filter.from),
      to: dateOnly(filter.to),
      transactionMode: 'ALL',
    },
    sections: [
      moneyLine('รายได้', 'รายได้จากการขาย (Revenue)', revenue, salesDetails, 'good'),
      moneyLine('ต้นทุนขาย', costBasis === 'DEAL' ? 'ต้นทุนขายตามดีล (COGS - Deal Cost)' : 'ต้นทุนขาย WAC (COGS)', -cogs, cogsDetails, 'bad'),
      moneyLine('กำไรขั้นต้น', 'กำไรขั้นต้น (Gross Profit)', grossProfit, undefined, 'total'),
      moneyLine('ค่าใช้จ่ายดำเนินงาน', 'ค่าใช้จ่ายดำเนินงาน (Operating Expenses)', -expensesTotal, expenseDetails, 'bad'),
      moneyLine('ค่าใช้จ่ายดำเนินงาน', 'ค่าเสื่อมราคา (Depreciation Expense)', -depreciation, depreciationDetails, 'bad', 1),
      moneyLine('ค่าใช้จ่ายดำเนินงาน', 'รวมค่าใช้จ่ายดำเนินงาน', -operatingExpenses, undefined, 'total'),
      moneyLine('กำไรจากการดำเนินงาน', 'กำไรจากการดำเนินงาน (Operating Profit)', operatingProfit, undefined, 'total'),
      moneyLine('ต้นทุนทางการเงิน', 'ดอกเบี้ยจ่าย (Interest Expense)', -interest, interestDetails, 'bad'),
      moneyLine('ต้นทุนทางการเงิน', 'กำไร/(ขาดทุน) อัตราแลกเปลี่ยนที่รับรู้แล้ว', fxNet, fxDetails, fxNet >= 0 ? 'good' : 'bad'),
      moneyLine('รายได้และค่าใช้จ่ายอื่น', 'กำไร/(ขาดทุน) จากการจำหน่ายทรัพย์สิน', assetDisposalNet, assetDisposalDetails, assetDisposalNet >= 0 ? 'good' : 'bad'),
      moneyLine('กำไรก่อนภาษี', 'กำไรก่อนภาษี (Profit Before Tax)', netProfitBeforeTax, undefined, 'total'),
    ],
    sourceState: sourceState([
      'รายได้ใช้ total_amount - vat_amount เพื่อสะท้อนยอดหลังส่วนลดหัวบิลและไม่รวม VAT',
      'Interest ใช้ loan payments cash-basis ในช่วงวันที่',
      ...(costBasis === 'DEAL' || costBasis === 'COMPARE'
        ? ['Deal Cost ใช้ matched cost จาก trading_allocation_facts/trading_deals สำหรับส่วนที่ allocate แล้ว และให้ unmatched portion คงอยู่บน WAC เดิม']
        : []),
      'ค่าใช้จ่ายใช้ expenses.amount และนับเฉพาะรายการสถานะ approved/paid ตามเกณฑ์ actual/accrual ของรายงานบริหาร',
      'ค่าเสื่อมราคานับเฉพาะรายการ posted ที่ยังไม่ถูก reverse',
      'กำไร/ขาดทุนจากจำหน่ายทรัพย์สินนับเฉพาะรายการ approved ที่ยังไม่ถูก reverse ตาม disposal_date',
      'Stock/Trading split เป็นข้อมูลประกอบเฉพาะรายได้และต้นทุนขายจากชุดข้อมูลเต็ม ไม่ใช่ตัวกรองกำไรก่อนภาษี',
      ...(scope.constrained ? ['ไม่รวมกำไร/ขาดทุนอัตราแลกเปลี่ยนเมื่อจำกัดขอบเขตสาขา เพราะ fx_gain_loss ยังไม่มีมิติสาขา'] : []),
      ...(scope.constrained ? ['ไม่แสดง Historical Baseline เมื่อจำกัดขอบเขตสาขา เพราะ historical_monthly ยังไม่มีมิติสาขา'] : []),
    ]),
    split: {
      stock: { cogs: costBasis === 'DEAL' ? stockCogsDeal : stockCogsWac, dealCogs: stockCogsDeal, revenue: stockRevenue, wacCogs: stockCogsWac },
      trading: { cogs: costBasis === 'DEAL' ? tradingCogsDeal : tradingCogsWac, dealCogs: tradingCogsDeal, revenue: tradingRevenue, wacCogs: tradingCogsWac },
    },
    summary: {
      assetDisposalNet,
      cogs,
      cogsDeal,
      cogsDiff: cogsDeal - cogsWac,
      cogsWac,
      depreciation,
      dualReplacedCount,
      expenses: expensesTotal,
      fxNet,
      grossProfit,
      grossProfitDeal,
      grossProfitDiff: grossProfitDeal - grossProfitWac,
      grossProfitWac,
      interest,
      netProfitBeforeTax,
      netProfitBeforeTaxDeal,
      netProfitBeforeTaxDiff: netProfitBeforeTaxDeal - netProfitBeforeTaxWac,
      netProfitBeforeTaxWac,
      operatingProfit,
      revenue,
    },
    historicalBaseline,
  }
}

async function loadBalanceSheetInputs(filter: AsOfFilter) {
  const asOf = endOfDay(filter.asOf)
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const branchWhere = branch?.id != null ? { branch_id: branch.id } : {}
  const accounts = (await listActiveAccounts()).filter((account: AccountReferenceRecord) => branch?.id == null || account.branchId === branch.id)
  return Promise.all([
    Promise.resolve(accounts),
    prisma.bank_statement.findMany({
      include: { accounts: { select: { account_no: true, bank_name: true, name: true, type: true } } },
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { date: { lte: asOf }, ...(branch?.id != null ? { accounts: { branch_id: branch.id } } : {}) },
    }),
    prisma.sales_bills.findMany({
      include: { branches: { select: { code: true, name: true } }, customers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere, date: { lte: asOf } },
    }),
    prisma.purchase_bills.findMany({
      include: { branches: { select: { code: true, name: true } }, suppliers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere, date: { lte: asOf } },
    }),
    prisma.stock_ledger.findMany({
      orderBy: [{ date: 'asc' }, { ref_no: 'asc' }],
      take: 30000,
      where: { ...branchWhere, date: { lte: asOf } },
    }),
    prisma.assets.findMany({
      include: { depreciations: { where: { date: { lte: asOf } } } },
      orderBy: [{ code: 'asc' }],
      take: 10000,
      where: { ...(branch?.id != null ? { branch_id: branch.id } : {}) },
    }),
    prisma.loans.findMany({
      include: { loan_payments: { where: { date: { lte: asOf } } }, loan_schedules: true },
      orderBy: [{ contract_no: 'asc' }],
      take: 10000,
    }),
    prisma.equity.findFirst({ orderBy: { updated_at: 'desc' } }),
    listBranches(),
  ])
}

export async function buildBalanceSheet(filter: AsOfFilter) {
  const [accountsRaw, bankRowsRaw, salesBillsRaw, purchaseBillsRaw, stockRows, assetsRaw, loans, equity, branches] = await loadBalanceSheetInputs(filter)
  const accounts = accountsRaw as AccountReferenceRecord[]
  const bankRows = bankRowsRaw as BankRow[]
  const salesBills = salesBillsRaw as SalesBillRow[]
  const purchaseBills = purchaseBillsRaw as PurchaseBillRow[]
  const assets = assetsRaw as AssetRow[]
  const balances = new Map<bigint, number>()
  accounts.forEach((account: AccountReferenceRecord) => balances.set(account.id, cachedMoney(account.openingBalance)))
  bankRows.forEach((row: BankRow) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    const next = row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance)
    balances.set(row.account_id, next)
  })
  const cashDetails = accounts.map((account: AccountReferenceRecord) => ({
    amount: balances.get(account.id) ?? 0,
    date: dateOnly(filter.asOf),
    description: [account.bankName ?? account.bank, account.name, account.accountNo].filter(Boolean).join(' · '),
    refNo: account.accountNo || account.name,
  }))
  const cash = sumDetails(cashDetails)
  const arDetails = salesBills.map((bill: SalesBillRow) => ({
    amount: Math.max(0, toNumber(bill.receivable_balance) || (toNumber(bill.total_amount) - toNumber(bill.received_amount))),
    date: dateOnly(bill.date),
    description: bill.customers?.name ?? '-',
    refNo: bill.doc_no,
  })).filter((row) => row.amount > 0)
  const apDetails = purchaseBills.map((bill: PurchaseBillRow) => ({
    amount: Math.max(0, toNumber(bill.payable_balance) || (toNumber(bill.total_amount) - toNumber(bill.paid_amount))),
    date: dateOnly(bill.date),
    description: bill.suppliers?.name ?? '-',
    refNo: bill.doc_no,
  })).filter((row) => row.amount > 0)
  type StockLedgerRow = (typeof stockRows)[number]
  const inventoryDetails = stockRows.map((row: StockLedgerRow) => ({
    amount: toNumber(row.value_in) - toNumber(row.value_out),
    date: dateOnly(row.date),
    description: row.movement_type,
    refNo: row.ref_no || row.ref_type || `STOCK-${dateOnly(row.date)}`,
  })).filter((row: DetailRow) => row.amount !== 0)
  const fixedAssetDetails = assets.map((asset: AssetRow) => {
    const cost = toNumber(asset.net_asset_cost) || (toNumber(asset.original_cost) - toNumber(asset.vat_amount))
    const accumDep = asset.depreciations.reduce((sum: number, dep: AssetRow['depreciations'][number]) => sum + toNumber(dep.amount), 0)
    return {
      amount: Math.max(toNumber(asset.salvage_value), cost - accumDep),
      date: asset.purchase_date ? dateOnly(asset.purchase_date) : dateOnly(filter.asOf),
      description: asset.name,
      refNo: asset.code,
    }
  }).filter((row: DetailRow) => row.amount > 0)
  const fixedCost = assets.reduce((sum, asset) => sum + (toNumber(asset.net_asset_cost) || (toNumber(asset.original_cost) - toNumber(asset.vat_amount))), 0)
  const accumulatedDep = assets.reduce((sum: number, asset: AssetRow) => sum + asset.depreciations.reduce((depSum: number, dep: AssetRow['depreciations'][number]) => depSum + toNumber(dep.amount), 0), 0)
  const loanDetails = loans.map((loan: LoanRow) => {
    const paidPrincipal = loan.loan_payments.reduce((sum: number, payment: LoanRow['loan_payments'][number]) => sum + toNumber(payment.principal_amount), 0)
    return {
      amount: Math.max(0, toNumber(loan.principal_amount) - paidPrincipal),
      date: loan.start_date ? dateOnly(loan.start_date) : dateOnly(filter.asOf),
      description: loan.lender_name ?? loan.loan_type,
      refNo: loan.contract_no,
    }
  }).filter((row: DetailRow) => row.amount > 0)
  const currentLimit = addMonths(filter.asOf, 12)
  const currentLoan = loans.reduce((sum: number, loan: LoanRow) => sum + loan.loan_schedules.filter((schedule: LoanRow['loan_schedules'][number]) => schedule.due_date <= currentLimit && schedule.payment_status !== 'Paid').reduce((scheduleSum: number, schedule: LoanRow['loan_schedules'][number]) => scheduleSum + Math.max(0, toNumber(schedule.principal_amount) - toNumber(schedule.paid_amount)), 0), 0)
  const totalLoan = sumDetails(loanDetails)
  const longTermLoan = Math.max(0, totalLoan - currentLoan)
  const ar = sumDetails(arDetails)
  const ap = sumDetails(apDetails)
  const inventory = sumDetails(inventoryDetails)
  const fixedAssetNet = sumDetails(fixedAssetDetails)
  const paidUpCapital = toNumber(equity?.paid_up_capital)
  const retainedEarnings = toNumber(equity?.retained_earnings)
  const ownerAdjustment = toNumber(equity?.owner_equity_adjustment)
  const currentYearPl = 0
  const totalAssets = cash + ar + inventory + fixedAssetNet
  const totalLiabilities = ap + currentLoan + longTermLoan
  const totalEquity = paidUpCapital + retainedEarnings + ownerAdjustment + currentYearPl
  const liabilitiesAndEquity = totalLiabilities + totalEquity

  return {
    branches,
    filters: { asOf: dateOnly(filter.asOf), branchId: filter.branchId ?? 'ALL' },
    sections: {
      assets: [
        moneyLine('currentAssets', 'Cash and Bank', cash, cashDetails, 'good'),
        moneyLine('currentAssets', 'Accounts Receivable', ar, arDetails, 'default'),
        moneyLine('currentAssets', 'Inventory (WAC ledger value)', inventory, inventoryDetails, 'default'),
        moneyLine('nonCurrentAssets', 'Fixed Assets at Cost', fixedCost, fixedAssetDetails, 'default'),
        moneyLine('nonCurrentAssets', 'Accumulated Depreciation', -accumulatedDep, undefined, 'bad', 1),
        moneyLine('nonCurrentAssets', 'Net Fixed Assets', fixedAssetNet, fixedAssetDetails, 'total'),
      ],
      equity: [
        moneyLine('equity', 'Paid-up Capital', paidUpCapital, undefined, 'default'),
        moneyLine('equity', 'Retained Earnings', retainedEarnings, undefined, 'default'),
        moneyLine('equity', 'Owner Adjustment', ownerAdjustment, undefined, ownerAdjustment >= 0 ? 'good' : 'bad'),
        moneyLine('equity', 'Current Year P&L', currentYearPl, undefined, 'muted'),
      ],
      liabilities: [
        moneyLine('currentLiabilities', 'Accounts Payable', ap, apDetails, 'bad'),
        moneyLine('currentLiabilities', 'Current Portion of Loan', currentLoan, loanDetails, 'bad'),
        moneyLine('nonCurrentLiabilities', 'Long-term Loan / Leasing', longTermLoan, loanDetails, 'bad'),
      ],
    },
    sourceState: sourceState(['Current Year P&L is not rolled into retained earnings until GL/closing-period design is confirmed']),
    summary: {
      ar,
      ap,
      cash,
      currentLoan,
      fixedAssetNet,
      inventory,
      liabilitiesAndEquity,
      longTermLoan,
      totalAssets,
      totalEquity,
      totalLiabilities,
    },
    balanceCheck: {
      balanced: Math.abs(totalAssets - liabilitiesAndEquity) < 0.01,
      difference: totalAssets - liabilitiesAndEquity,
    },
    ratios: {
      currentRatio: totalLiabilities > 0 ? (cash + ar + inventory) / (ap + currentLoan || 1) : 0,
      debtToEquity: totalEquity > 0 ? totalLiabilities / totalEquity : 0,
      workingCapital: cash + ar + inventory - ap - currentLoan,
    },
  }
}

export async function buildCashFlowStatement(filter: PeriodFilter) {
  assertValidPeriodFilter(filter)
  const fromStart = new Date(filter.from)
  const toEnd = endOfDay(filter.to)
  const scope = await resolveStatementBranchScope(filter)
  const accountWhere = relatedBranchWhere('accounts', scope.branchIds)
  const beginningDate = new Date(filter.from)
  beginningDate.setDate(beginningDate.getDate() - 1)
  const beginningEnd = endOfDay(beginningDate)
  const [accountsRaw, beforeRowsRaw, periodRowsRaw, loanPaymentsRaw, historicalMonthly] = await Promise.all([
    prisma.accounts.findMany({ include: { branches: { select: { code: true, name: true } } }, where: { active: true, ...directBranchWhere(scope.branchIds) } }),
    prisma.bank_statement.findMany({
      include: { accounts: { select: { account_no: true, bank_name: true, name: true, type: true } } },
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { ...accountWhere, date: { lte: beginningEnd } },
    }),
    prisma.bank_statement.findMany({
      include: { accounts: { select: { account_no: true, bank_name: true, name: true, type: true } } },
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { ...accountWhere, date: { gte: fromStart, lte: toEnd } },
    }),
    prisma.loan_payments.findMany({
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 10000,
      where: { ...notCancelledWhere(), ...accountWhere, date: { gte: fromStart, lte: toEnd } },
    }),
    scope.constrained
      ? Promise.resolve([])
      : prisma.historical_monthly.findMany({
          orderBy: [{ year: 'asc' }, { month: 'asc' }, { id: 'asc' }],
          take: 2000,
        }),
  ])
  const accounts = accountsRaw
  const beforeRows = beforeRowsRaw as BankRow[]
  const periodRows = periodRowsRaw as BankRow[]
  type PeriodLoanPayment = (typeof loanPaymentsRaw)[number]
  const openingCash = computeCashBalance(accounts, beforeRows)
  const endingCash = computeCashBalance(accounts, [...beforeRows, ...periodRows])
  const groups: Record<CashFlowGroupKey, CashFlowDetailRow[]> = {
    EX: [],
    FIN_IN: [],
    FIN_OUT: [],
    INV_IN: [],
    INV_OUT: [],
    OP_IN: [],
    OP_OUT: [],
  }

  periodRows.forEach((row: BankRow) => {
    const inflow = toNumber(row.amount_in)
    const outflow = toNumber(row.amount_out)
    const amount = inflow - outflow
    const cfCat = normalizeCashFlowCategory(row)
    const groupKey = cashFlowGroupKey(cfCat)
    const detail: CashFlowDetailRow = {
      amount,
      cfCat,
      date: dateOnly(row.date),
      description: row.description || row.desc || row.accounts?.name || CASHFLOW_CATEGORIES[cfCat].label,
      label: CASHFLOW_CATEGORIES[cfCat].label,
      refNo: bankRef(row),
    }
    groups[groupKey].push(detail)
  })

  ;(loanPaymentsRaw as PeriodLoanPayment[]).forEach((payment) => {
    const interestAmount = toNumber(payment.interest_amount)
    if (interestAmount <= 0) return
    groups.OP_OUT.push({
      amount: -interestAmount,
      cfCat: 'OP_OUT_INTEREST',
      date: dateOnly(payment.date),
      description: `Interest on ${payment.loan_id ?? payment.doc_no ?? '-'}`,
      label: CASHFLOW_CATEGORIES.OP_OUT_INTEREST.label,
      refNo: payment.doc_no || String(payment.id),
    })
    groups.FIN_OUT.push({
      amount: interestAmount,
      cfCat: 'FIN_OUT_LOAN_PRIN',
      date: dateOnly(payment.date),
      description: '(reclass to interest)',
      label: '(reclass)',
      refNo: payment.doc_no || String(payment.id),
    })
  })

  const histDate = dateOnly(filter.from)
  const histOpIn = sumHistoricalCashFlow(historicalMonthly, 'cf_op_in', filter.from, filter.to)
  const histOpOut = sumHistoricalCashFlow(historicalMonthly, 'cf_op_out', filter.from, filter.to)
  const histInv = sumHistoricalCashFlow(historicalMonthly, 'cf_inv', filter.from, filter.to)
  const histFinIn = sumHistoricalCashFlow(historicalMonthly, 'cf_fin_in', filter.from, filter.to)
  const histFinOut = sumHistoricalCashFlow(historicalMonthly, 'cf_fin_out', filter.from, filter.to)

  if (histOpIn > 0) {
    groups.OP_IN.push({
      amount: histOpIn,
      cfCat: 'OP_IN_OTHER',
      date: histDate,
      description: '(Pre Go-Live)',
      label: 'Historical Operating Inflow',
      refNo: 'HISTORICAL',
    })
  }
  if (histOpOut > 0) {
    groups.OP_OUT.push({
      amount: -histOpOut,
      cfCat: 'OP_OUT_EXPENSE',
      date: histDate,
      description: '(Pre Go-Live)',
      label: 'Historical Operating Outflow',
      refNo: 'HISTORICAL',
    })
  }
  if (histInv !== 0) {
    groups[histInv >= 0 ? 'INV_IN' : 'INV_OUT'].push({
      amount: histInv,
      cfCat: histInv >= 0 ? 'INV_IN_DEPOSIT_REFUND' : 'INV_OUT_ASSET_PURCHASE',
      date: histDate,
      description: '(Pre Go-Live)',
      label: 'Historical Investing',
      refNo: 'HISTORICAL',
    })
  }
  if (histFinIn > 0) {
    groups.FIN_IN.push({
      amount: histFinIn,
      cfCat: 'FIN_IN_LOAN',
      date: histDate,
      description: '(Pre Go-Live)',
      label: 'Historical Financing Inflow',
      refNo: 'HISTORICAL',
    })
  }
  if (histFinOut > 0) {
    groups.FIN_OUT.push({
      amount: -histFinOut,
      cfCat: 'FIN_OUT_LOAN_PRIN',
      date: histDate,
      description: '(Pre Go-Live)',
      label: 'Historical Financing Outflow',
      refNo: 'HISTORICAL',
    })
  }

  const internalTransfers = periodRows.filter((row: BankRow) => isInternalTransfer(row)).reduce((sum, row) => sum + Math.abs(toNumber(row.amount_in) - toNumber(row.amount_out)), 0)
  const operatingIn = summarizeCashFlowDetails(groups.OP_IN)
  const operatingOut = summarizeCashFlowDetails(groups.OP_OUT)
  const investingIn = summarizeCashFlowDetails(groups.INV_IN)
  const investingOut = summarizeCashFlowDetails(groups.INV_OUT)
  const financingIn = summarizeCashFlowDetails(groups.FIN_IN)
  const financingOut = summarizeCashFlowDetails(groups.FIN_OUT)
  const operating = {
    inflow: operatingIn.inflow,
    net: operatingIn.net + operatingOut.net,
    outflow: operatingOut.outflow,
    rows: [...operatingIn.rows, ...operatingOut.rows],
  }
  const investing = {
    inflow: investingIn.inflow,
    net: investingIn.net + investingOut.net,
    outflow: investingOut.outflow,
    rows: [...investingIn.rows, ...investingOut.rows],
  }
  const financing = {
    inflow: financingIn.inflow,
    net: financingIn.net + financingOut.net,
    outflow: financingOut.outflow,
    rows: [...financingIn.rows, ...financingOut.rows],
  }
  const netChange = operating.net + investing.net + financing.net

  return {
    activities: { financing, investing, operating },
    branches: scope.branches,
    filters: { branchId: scope.selectedBranchCode ?? 'ALL', from: dateOnly(filter.from), method: 'direct', to: dateOnly(filter.to) },
    rows: [
      moneyLine('operating', 'Operating Activities - Cash In', operating.inflow, operatingIn.rows, 'good'),
      moneyLine('operating', 'Operating Activities - Cash Out', -operating.outflow, operatingOut.rows, 'bad'),
      moneyLine('operating', 'Net Cash from Operating Activities', operating.net, undefined, 'total'),
      moneyLine('investing', 'Investing Activities - Cash In', investing.inflow, investingIn.rows, 'good'),
      moneyLine('investing', 'Investing Activities - Cash Out', -investing.outflow, investingOut.rows, 'bad'),
      moneyLine('investing', 'Net Cash from Investing Activities', investing.net, undefined, 'total'),
      moneyLine('financing', 'Financing Activities - Cash In', financing.inflow, financingIn.rows, 'good'),
      moneyLine('financing', 'Financing Activities - Cash Out', -financing.outflow, financingOut.rows, 'bad'),
      moneyLine('financing', 'Net Cash from Financing Activities', financing.net, undefined, 'total'),
      moneyLine('summary', 'Net Increase/(Decrease) in Cash', netChange, undefined, 'total'),
      moneyLine('summary', 'Beginning Cash Balance', openingCash, undefined, 'muted'),
      moneyLine('summary', 'Ending Cash Balance', endingCash, undefined, 'total'),
    ],
    sourceState: sourceState([
      'Direct method from bank_statement using legacy-style cash flow category mapping',
      'Loan payments reclass interest from financing to operating to match legacy cash flow statement',
      'Internal transfers are excluded from activity totals',
      'Historical monthly cashflow rows are merged company-level when the selected date range overlaps those months',
    ]),
    summary: {
      endingCash,
      financing: financing.net,
      internalTransfers,
      investing: investing.net,
      netChange,
      operating: operating.net,
      openingCash,
      totalInflow: operating.inflow + investing.inflow + financing.inflow,
      totalOutflow: operating.outflow + investing.outflow + financing.outflow,
    },
  }
}
