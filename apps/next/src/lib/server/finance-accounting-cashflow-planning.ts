import { requireBusinessCode } from '@/lib/business-code'
import type { Prisma } from '../../../generated/prisma/client'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toBangkokDateOnly, toBangkokEndOfDay, toDateOnly, toNumber } from '@/lib/server/daily'
import { buildFinanceCashPosition } from '@/lib/server/finance-accounting-cash-position'
import { buildPlStatement } from '@/lib/server/finance-accounting-statements'
import { buildTaxVatWht } from '@/lib/server/finance-accounting-tax'
import { prisma } from '@/lib/server/prisma'
import { listActiveBranches } from '@/lib/server/reference-master-cache'

const CANCELLED_STATUSES = ['cancelled', 'canceled', 'void', 'voided', 'reversed', 'ยกเลิก']
const DAY_MS = 86_400_000
const PAID_EXPENSE_STATUSES = ['paid', 'Paid', 'จ่ายแล้ว']
const PROJECTION_BASIS = 'เงินรับอิงวันครบกำหนดหรือเครดิตเทอมของบิลขาย ส่วนเงินจ่ายอิงวันที่บิลซื้อจนกว่าจะมีข้อมูลวันครบกำหนดหรือเครดิตเทอมที่ยืนยันแล้ว'

export class CashFlowValidationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export type AnalysisFilter = {
  allowedBranchCodes?: string[] | null
  branchId?: string
  from: Date
  to: Date
}

export type ForecastFilter = {
  allowedBranchCodes?: string[] | null
  branchId?: string
  horizon: number
  startDate: Date
}

type SalesBill = Prisma.sales_billsGetPayload<{
  include: { customers: { select: { credit_term: true; name: true } } }
}>

type PurchaseBill = Prisma.purchase_billsGetPayload<{
  include: { suppliers: { select: { name: true } } }
}>

type Expense = Prisma.expensesGetPayload<{
  include: { expense_categories: { select: { name: true } } }
}>

type LoanSchedule = Prisma.loan_schedulesGetPayload<{
  include: { loans: { select: { contract_no: true; lender_name: true } } }
}>

type ForecastEvent = {
  amount: number
  date: string
  inOut: 'IN' | 'OUT'
  label: string
  overdue?: boolean
  refNo: string
  type: 'AP' | 'AR' | 'EXPENSE' | 'LOAN' | 'TAX'
}

function dateOnly(date: Date) {
  return toDateOnly(date)
}

function endOfDay(date: Date) {
  return toBangkokEndOfDay(date)
}

function startOfDay(date: Date) {
  return new Date(`${toBangkokDateOnly(date)}T00:00:00.000+07:00`)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function activeNullableStatusWhere() {
  return {
    OR: [
      { status: null },
      { status: { notIn: CANCELLED_STATUSES, mode: 'insensitive' as const } },
    ],
  }
}

function activeRequiredStatusWhere() {
  return { status: { notIn: CANCELLED_STATUSES, mode: 'insensitive' as const } }
}

function sourceState(options?: { loanSchedulesExcluded?: boolean }) {
  return {
    basis: 'วิเคราะห์จากเอกสารรับ–จ่ายและรายการดำเนินงาน ใช้เพื่อการวางแผนและบริหาร ไม่ใช่งบกระแสเงินสดตามบัญชี',
    limitations: [
      'รายงานนี้ยังไม่อ้างอิงผังบัญชีและรอบปิดบัญชี จึงใช้เพื่อการวางแผนและบริหารเท่านั้น',
      'ประมาณการรับเงินอิงวันครบกำหนดหรือเครดิตเทอมของบิลขาย ส่วนประมาณการจ่ายอิงวันที่บิลซื้อ เพราะยังไม่มีข้อมูลวันครบกำหนดหรือเครดิตเทอมที่ยืนยันแล้ว',
      'กำหนดชำระภาษีเป็นค่าประมาณจากรายการภาษีในระบบ ไม่ใช่สถานะการยื่นจริง',
      'ยอดบัญชีเงินตราต่างประเทศ (FCD) แสดงแยกตามสกุลและยังไม่รวมในยอดหรือประมาณการเงินบาท',
      'กระแสเงินสดจากการดำเนินงานคำนวณจากยอดรับและยอดจ่ายจริง โดยนับแต่ละรายการและค่าธรรมเนียมเพียงครั้งเดียว',
      'ลิงก์ในรายละเอียดใช้เปิดรายงานที่เกี่ยวข้อง ไม่ได้หมายความว่ารายงานปลายทางเป็นแหล่งคำนวณ',
      'ลิงก์จะแสดงเฉพาะเมื่อรายงานปลายทางรักษาช่วงวันที่และขอบเขตสาขาได้ครบ',
      ...(options?.loanSchedulesExcluded
        ? ['ไม่รวมตารางผ่อนชำระเงินกู้ในผลแบบจำกัดสาขา เพราะข้อมูลดังกล่าวยังไม่ผูกกับสาขาหรือบัญชีโดยตรง']
        : []),
    ],
    writeActionsEnabled: false,
  }
}

type BranchRef = { code: string; id: bigint; name: string }

type BranchScope = {
  branchCodes: string[] | null
  branchIds: bigint[] | null
  branches: Array<{ code: string; id: string; name: string }>
  selectedBranchCode?: string
}

function branchIdsWhere(branchIds: bigint[] | null) {
  return branchIds === null ? {} : { branch_id: { in: branchIds } }
}

async function loadBranchRefs(allowedBranchCodes: string[] | null): Promise<BranchRef[]> {
  const branches = allowedBranchCodes === null
    ? await listActiveBranches()
    : await prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { code: true, id: true, name: true },
        where: { active: true, code: { in: allowedBranchCodes } },
      })
  return branches.map((branch) => ({
    code: requireBusinessCode(branch.code, `สาขา ${branch.id}`),
    id: branch.id,
    name: branch.name,
  }))
}

function outwardBranches(branches: BranchRef[]) {
  return branches.map((branch) => {
    const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
    return { code, id: code, name: branch.name }
  })
}

async function resolveBranchScope(input: { allowedBranchCodes?: string[] | null; branchId?: string }): Promise<BranchScope> {
  const allowedCodes = input.allowedBranchCodes === undefined || input.allowedBranchCodes === null
    ? null
    : [...new Set(input.allowedBranchCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  const selected = input.branchId ? await findActiveBranchReferenceByCodeOrId(input.branchId) : null
  if (input.branchId && !selected) throw new CashFlowValidationError(`ไม่พบสาขาที่ใช้งาน: ${input.branchId}`)
  if (selected && allowedCodes !== null && !allowedCodes.includes(selected.code.toUpperCase())) {
    throw new CashFlowValidationError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403)
  }
  const visibleBranches = await loadBranchRefs(allowedCodes)
  const queryBranches = selected ? [selected] : allowedCodes === null ? null : visibleBranches
  return {
    branchCodes: queryBranches?.map((branch) => branch.code) ?? null,
    branchIds: queryBranches?.map((branch) => branch.id) ?? null,
    branches: outwardBranches(visibleBranches),
    selectedBranchCode: selected?.code,
  }
}

async function cashAsOf(asOf: Date, branchIds: bigint[] | null) {
  return buildFinanceCashPosition({ asOf, branchIds })
}

function dueDateFromBill(date: Date, explicit: Date | null | undefined, creditTerm?: number | null) {
  if (explicit) return explicit
  return addDays(date, creditTerm ?? 0)
}

function daysBetween(left: Date, right: Date) {
  return Math.floor((left.getTime() - right.getTime()) / DAY_MS)
}

async function loadBillsAsOf(asOf: Date, branchIds: bigint[] | null) {
  return Promise.all([
    prisma.sales_bills.findMany({
      include: { customers: { select: { credit_term: true, name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      where: { ...activeNullableStatusWhere(), ...branchIdsWhere(branchIds), cancelled_at: null, date: { lte: endOfDay(asOf) } },
    }),
    prisma.purchase_bills.findMany({
      include: { suppliers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      where: { ...activeNullableStatusWhere(), ...branchIdsWhere(branchIds), cancelled_at: null, date: { lte: endOfDay(asOf) } },
    }),
  ])
}

function arRows(salesBills: SalesBill[], asOf: Date) {
  return salesBills.map((bill) => {
    const balance = Math.max(0, toNumber(bill.receivable_balance) || (toNumber(bill.total_amount) - toNumber(bill.received_amount)))
    const dueDate = dueDateFromBill(bill.date, bill.due_date, bill.credit_term ?? bill.customers?.credit_term)
    return {
      customerName: bill.customers?.name ?? '-',
      daysOverdue: Math.max(0, daysBetween(asOf, dueDate)),
      docNo: bill.doc_no,
      dueDate,
      id: bill.doc_no,
      receivableBalance: balance,
    }
  }).filter((row) => row.receivableBalance > 0.01)
}

function apRows(purchaseBills: PurchaseBill[], asOf: Date) {
  return purchaseBills.map((bill) => {
    const balance = Math.max(0, toNumber(bill.payable_balance) || (toNumber(bill.total_amount) - toNumber(bill.paid_amount)))
    const dueDate = new Date(`${toBangkokDateOnly(bill.date)}T00:00:00.000Z`)
    return {
      docNo: bill.doc_no,
      dueDate,
      daysToDue: Math.ceil((dueDate.getTime() - asOf.getTime()) / DAY_MS),
      id: bill.doc_no,
      payableBalance: balance,
      supplierName: bill.suppliers?.name ?? '-',
    }
  }).filter((row) => row.payableBalance > 0.01)
}

async function buildScopedPl(filter: AnalysisFilter, branchCodes: string[] | null) {
  const reports = branchCodes === null
    ? [await buildPlStatement({ from: filter.from, to: filter.to, transactionMode: 'ALL' })]
    : await Promise.all(branchCodes.map((branchId) => buildPlStatement({ branchId, from: filter.from, to: filter.to, transactionMode: 'ALL' })))
  const summary = reports.reduce((total, report) => {
    for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += report.summary[key]
    return total
  }, {
    cogs: 0,
    depreciation: 0,
    expenses: 0,
    fxNet: 0,
    grossProfit: 0,
    interest: 0,
    netProfitBeforeTax: 0,
    operatingProfit: 0,
    revenue: 0,
  })
  return { summary }
}

async function loadPeriod(filter: AnalysisFilter, scope: BranchScope) {
  const dateWhere = { gte: filter.from, lte: endOfDay(filter.to) }
  const purchaseBillDateWhere = { ...dateWhere, gte: startOfDay(filter.from) }
  const branch = branchIdsWhere(scope.branchIds)
  return Promise.all([
    prisma.purchase_bills.findMany({
      select: { subtotal: true, total_amount: true, vat_amount: true },
      where: { ...activeNullableStatusWhere(), ...branch, cancelled_at: null, date: purchaseBillDateWhere },
    }),
    prisma.customer_receipts.findMany({
      select: { net_cash_in: true },
      where: { ...branch, cancelled_at: null, date: dateWhere, status: 'active' },
    }),
    prisma.payments.findMany({
      select: { net_amount: true, payment_approvals: { select: { source_type: true } } },
      where: { ...activeNullableStatusWhere(), ...branch, date: dateWhere },
    }),
    prisma.loan_payments.aggregate({
      _sum: { interest_amount: true },
      where: {
        ...activeNullableStatusWhere(),
        date: dateWhere,
        ...(scope.branchIds !== null ? { accounts: { branch_id: { in: scope.branchIds } } } : {}),
      },
    }),
    prisma.stock_ledger.aggregate({ _sum: { value_in: true, value_out: true }, where: { ...branch, date: { lte: dateWhere.lte } } }),
    buildScopedPl(filter, scope.branchCodes),
  ])
}

function sumEvents(events: ForecastEvent[], inOut: ForecastEvent['inOut'], cutoff: Date) {
  const cutoffKey = dateOnly(cutoff)
  return events.filter((event) => event.inOut === inOut && event.date <= cutoffKey).reduce((sum, event) => sum + event.amount, 0)
}

function sourceHref(path: string, filter: AnalysisFilter, branchCode?: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ from: dateOnly(filter.from), to: dateOnly(filter.to), ...extra })
  if (branchCode) params.set('branchId', branchCode)
  return `${path}?${params.toString()}`
}

export async function buildCashFlowAnalysis(filter: AnalysisFilter) {
  const scope = await resolveBranchScope(filter)
  const branchCode = scope.selectedBranchCode
  const [periodRows, projection, billsAsOf] = await Promise.all([
    loadPeriod(filter, scope),
    buildProjectionSource({ branchId: branchCode, horizon: 30, startDate: filter.to }, scope),
    loadBillsAsOf(filter.to, scope.branchIds),
  ])
  const [purchases, customerReceipts, payments, loanInterest, stock, pl] = periodRows
  const [salesAsOf, purchasesAsOf] = billsAsOf
  const ar = arRows(salesAsOf, filter.to)
  const ap = apRows(purchasesAsOf, filter.to)
  const cash = projection.cash
  const revenue = pl.summary.revenue
  const purchasesTotal = purchases.reduce((sum, bill) => sum + toNumber(bill.total_amount) - toNumber(bill.vat_amount), 0)
  const receiptsIn = customerReceipts.reduce((sum, receipt) => sum + toNumber(receipt.net_cash_in), 0)
  const paymentCashOut = payments.map((payment) => ({
    amount: toNumber(payment.net_amount),
    sourceType: payment.payment_approvals?.source_type ?? 'other',
  }))
  const supplierPaymentsOut = paymentCashOut
    .filter((payment) => payment.sourceType === 'purchase_bill')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const expensePaidOut = paymentCashOut
    .filter((payment) => payment.sourceType === 'expense')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const otherPaymentsOut = paymentCashOut
    .filter((payment) => payment.sourceType !== 'purchase_bill' && payment.sourceType !== 'expense')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const totalPaymentsOut = supplierPaymentsOut + expensePaidOut + otherPaymentsOut
  const interestPaidOut = toNumber(loanInterest._sum.interest_amount)
  const operatingCashFlow = receiptsIn - totalPaymentsOut - interestPaidOut
  const stockNow = toNumber(stock._sum.value_in) - toNumber(stock._sum.value_out)
  const arNow = ar.reduce((sum, row) => sum + row.receivableBalance, 0)
  const apNow = ap.reduce((sum, row) => sum + row.payableBalance, 0)
  const cashIn7 = sumEvents(projection.events, 'IN', addDays(filter.to, 7))
  const cashIn30 = sumEvents(projection.events, 'IN', addDays(filter.to, 30))
  const cashOut7 = sumEvents(projection.events, 'OUT', addDays(filter.to, 7))
  const cashOut30 = sumEvents(projection.events, 'OUT', addDays(filter.to, 30))
  const projected7 = cash.balance + cashIn7 - cashOut7
  const projected30 = cash.balance + cashIn30 - cashOut30
  const periodDays = Math.max(1, daysBetween(filter.to, filter.from) + 1)
  const burnRate = Math.max(0, (totalPaymentsOut + interestPaidOut) / periodDays)
  const daysToODMaxed = burnRate > 0 ? (cash.balance + cash.odAvailable) / burnRate : 999
  const collectionRate = revenue > 0 ? receiptsIn / revenue * 100 : 0
  const paymentRate = purchasesTotal > 0 ? supplierPaymentsOut / purchasesTotal * 100 : 0
  const netProfitBeforeTax = pl.summary.netProfitBeforeTax
  const diff = netProfitBeforeTax - operatingCashFlow
  const hasPositiveCashBase = cash.balance > 0
  const stockRatio = hasPositiveCashBase ? stockNow / cash.balance * 100 : null
  const arRatio = hasPositiveCashBase ? arNow / cash.balance * 100 : null
  const forecast7Href = sourceHref('/finance-accounting/cf-forecast-calendar', filter, branchCode, { horizon: '7', startDate: dateOnly(filter.to) })
  const forecast30Href = sourceHref('/finance-accounting/cf-forecast-calendar', filter, branchCode, { horizon: '30', startDate: dateOnly(filter.to) })
  const destinationScopeRepresentable = scope.branchIds === null || Boolean(branchCode)
  const relatedReportHref = (path: string) => destinationScopeRepresentable ? sourceHref(path, filter, branchCode) : ''
  const bankHref = scope.branchIds === null ? sourceHref('/finance/bank', filter) : ''

  return {
    branches: scope.branches,
    charts: {
      profitVsCash: [
        { amount: netProfitBeforeTax, label: 'Profit Before Tax (Accrual)', tone: 'emerald' },
        { amount: operatingCashFlow, label: 'Operating Cash Flow', tone: 'blue' },
      ],
      projection: [
        { expectedIn: 0, expectedOut: 0, label: 'ปัจจุบัน', projected: cash.balance },
        { expectedIn: cashIn7, expectedOut: cashOut7, label: '7 วัน', projected: projected7 },
        { expectedIn: cashIn30, expectedOut: cashOut30, label: '30 วัน', projected: projected30 },
      ],
      trap: { ar: arNow, cash: cash.balance, stock: stockNow },
    },
    detailRows: [
      { href: sourceHref('/finance-accounting/pl-statement', filter, branchCode), label: 'Profit Before Tax ในงบ (Accrual)', tone: 'good', value: netProfitBeforeTax },
      { href: relatedReportHref('/finance-accounting/cash-flow-statement'), label: 'Operating Cash Flow จริง', tone: 'good', value: operatingCashFlow },
      { href: sourceHref('/finance-accounting/pl-statement', filter, branchCode), label: 'ส่วนต่าง (PBT - OCF)', tone: 'warn', value: diff },
      { href: relatedReportHref('/finance/ar'), label: 'Cash Collection Rate', suffix: '%', value: collectionRate },
      { href: relatedReportHref('/finance/ap'), label: 'Supplier Payment Rate', suffix: '%', value: paymentRate },
      { href: forecast7Href, label: 'Projected Cash 7 วัน', tone: projected7 >= 0 ? 'good' : 'bad', value: projected7 },
      { href: forecast30Href, label: 'Projected Cash 30 วัน', tone: projected30 >= 0 ? 'good' : 'bad', value: projected30 },
      { href: relatedReportHref('/finance-accounting/cash-flow-statement'), label: 'Burn Rate (เงินออก/วัน เฉลี่ย)', value: burnRate },
      { href: bankHref, label: 'OD Used / Limit', value: cash.odUsed },
      { href: bankHref, label: 'วันที่ OD จะเต็มวงเงิน', suffix: ' วัน', tone: daysToODMaxed < 30 ? 'bad' : 'good', value: Math.round(daysToODMaxed) },
    ],
    fcdBalances: cash.fcdBalances,
    filters: { branchId: branchCode ?? 'ALL', from: dateOnly(filter.from), to: dateOnly(filter.to) },
    insights: [
      {
        body: `PBT: ${netProfitBeforeTax} · OCF: ${operatingCashFlow} · ส่วนต่าง: ${diff}`,
        explain: netProfitBeforeTax > operatingCashFlow + 10000 ? 'กำไรก่อนภาษีสูงกว่าเงินสด แสดงว่ากำไรไปอยู่ใน Stock หรือ AR ค้าง' : 'กำไรก่อนภาษีกับเงินสดสอดคล้อง',
        title: '📊 กำไรก่อนภาษีกับเงินสดไปคนละทางไหม?',
        type: Math.abs(diff) > Math.abs(netProfitBeforeTax) * 0.3 && netProfitBeforeTax > 0 ? 'warn' : 'ok',
      },
      {
        body: hasPositiveCashBase ? `Stock: ${stockNow} (${stockRatio?.toFixed(0)}% ของ Cash) · AR: ${arNow} (${arRatio?.toFixed(0)}%)` : `Stock: ${stockNow} · AR: ${arNow} · ไม่มีฐานเงินสดบวกสำหรับคำนวณสัดส่วน`,
        explain: !hasPositiveCashBase ? 'ยังประเมินสัดส่วนเงินจมไม่ได้ เพราะยอดเงินสดและธนาคารไม่เป็นบวก' : stockRatio != null && arRatio != null && stockRatio > arRatio * 1.5 ? 'Stock จมมากกว่า AR ต้องเร่งขายหรือปรับซื้อ' : 'โครงสร้างเงินจมยังไม่เอียงผิดปกติ',
        title: '🏪 เงินจมที่ไหน Stock หรือ AR?',
        type: !hasPositiveCashBase || (stockRatio != null && stockRatio > 200) || (arRatio != null && arRatio > 200) ? 'warn' : 'ok',
      },
      {
        body: `Receipts ${receiptsIn} / Sales ${revenue} = ${collectionRate.toFixed(1)}%`,
        explain: collectionRate >= 80 ? 'เก็บเงินได้ไวมาก' : collectionRate >= 50 ? 'พอใช้ได้ แต่ยังต้องตาม AR' : 'ลูกค้าค้างจ่ายเยอะ',
        title: '💰 เงินเข้าจากลูกค้าเทียบกับยอดขาย',
        type: collectionRate < 70 ? 'warn' : 'ok',
      },
      {
        body: `Payments ${supplierPaymentsOut} / Purchases ${purchasesTotal} = ${paymentRate.toFixed(1)}%`,
        explain: paymentRate < 70 ? 'มีเครดิต Supplier ช่วยรักษา cashflow' : 'จ่ายเร็วเมื่อเทียบกับยอดซื้อใหม่',
        title: '🏭 จ่าย Supplier เทียบกับยอดซื้อ',
        type: 'ok',
      },
      {
        body: `Projected 7d: ${projected7} · 30d: ${projected30}`,
        explain: projected7 < 0 ? `ต้องระดมเงินใน 7 วัน ${Math.abs(projected7)}` : 'เงินสดพอในช่วงสั้น',
        title: '🆘 ต้องกู้เงินเพิ่มไหมใน 7/30 วัน?',
        type: projected7 < 0 ? 'danger' : projected30 < 0 ? 'warn' : 'ok',
      },
      {
        body: `อีก ${Math.round(daysToODMaxed)} วัน · Burn rate ${burnRate}/วัน`,
        explain: daysToODMaxed < 30 ? 'OD จะเต็มภายใน 1 เดือน ต้องเร่งหาเงินทุน' : 'ยังไม่เข้าเขตเสี่ยง OD เต็ม',
        title: '⛽ OD จะเต็มวงเงินเมื่อไหร่?',
        type: daysToODMaxed < 30 ? 'danger' : daysToODMaxed < 90 ? 'warn' : 'ok',
      },
    ],
    projectionBasis: PROJECTION_BASIS,
    sourceState: sourceState({ loanSchedulesExcluded: projection.loanSchedulesExcluded }),
    summary: {
      apNow,
      arNow,
      burnRate,
      cashIn7,
      cashIn30,
      cashNow: cash.balance,
      cashOut7,
      cashOut30,
      cogs: pl.summary.cogs,
      collectionRate,
      daysToODMaxed,
      depreciation: pl.summary.depreciation,
      expensePaidOut,
      expenses: pl.summary.expenses,
      fxNet: pl.summary.fxNet,
      interestExpense: pl.summary.interest,
      interestPaidOut,
      netProfitBeforeTax,
      odLimit: cash.odLimit,
      odUsed: cash.odUsed,
      operatingCashFlow,
      otherPaymentsOut,
      paymentRate,
      projected7,
      projected30,
      purchases: purchasesTotal,
      receiptsIn,
      revenue,
      stockNow,
      supplierPaymentsOut,
    },
  }
}

async function loadForecastInputs(filter: ForecastFilter, scope: BranchScope) {
  const end = addDays(filter.startDate, filter.horizon)
  const branch = branchIdsWhere(scope.branchIds)
  return Promise.all([
    loadBillsAsOf(end, scope.branchIds),
    prisma.expenses.findMany({
      include: { expense_categories: { select: { name: true } } },
      orderBy: [{ due_date: 'asc' }, { date: 'asc' }],
      where: {
        ...activeRequiredStatusWhere(),
        ...branch,
        OR: [{ paid_status: null }, { paid_status: { notIn: PAID_EXPENSE_STATUSES, mode: 'insensitive' } }],
        paid_at: null,
        date: { lte: endOfDay(end) },
      },
    }),
    scope.branchIds !== null
      ? Promise.resolve([] as LoanSchedule[])
      : prisma.loan_schedules.findMany({
          include: { loans: { select: { contract_no: true, lender_name: true } } },
          orderBy: [{ due_date: 'asc' }, { installment_no: 'asc' }],
          where: {
            due_date: { lte: endOfDay(end) },
            OR: [
              { payment_status: null },
              { payment_status: { notIn: ['paid', 'จ่ายแล้ว'], mode: 'insensitive' } },
            ],
          },
        }),
    cashAsOf(filter.startDate, scope.branchIds),
  ])
}

function eventDate(date: Date, start: Date) {
  return date < start ? start : date
}

async function buildProjectionSource(filter: ForecastFilter, scope: BranchScope) {
  const [[salesBills, purchaseBills], expenses, loanSchedules, cash] = await loadForecastInputs(filter, scope)
  const end = addDays(filter.startDate, filter.horizon)
  const ar = arRows(salesBills, filter.startDate)
  const ap = apRows(purchaseBills, filter.startDate)
  const events: ForecastEvent[] = [
    ...ar.filter((row) => row.dueDate <= end).map((row) => ({
      amount: row.receivableBalance,
      date: dateOnly(eventDate(row.dueDate, filter.startDate)),
      inOut: 'IN' as const,
      label: row.customerName,
      overdue: row.dueDate < filter.startDate,
      refNo: row.docNo,
      type: 'AR' as const,
    })),
    ...ap.filter((row) => row.dueDate <= end).map((row) => ({
      amount: row.payableBalance,
      date: dateOnly(eventDate(row.dueDate, filter.startDate)),
      inOut: 'OUT' as const,
      label: row.supplierName,
      overdue: row.dueDate < filter.startDate,
      refNo: row.docNo,
      type: 'AP' as const,
    })),
    ...expenses.filter((expense: Expense) => (expense.due_date ?? expense.date) <= end).map((expense: Expense) => ({
      amount: toNumber(expense.net_amount) || toNumber(expense.amount),
      date: dateOnly(eventDate(expense.due_date ?? expense.date, filter.startDate)),
      inOut: 'OUT' as const,
      label: expense.payee ?? expense.expense_categories?.name ?? '-',
      overdue: (expense.due_date ?? expense.date) < filter.startDate,
      refNo: expense.doc_no,
      type: 'EXPENSE' as const,
    })),
    ...loanSchedules.map((schedule: LoanSchedule) => ({
      amount: Math.max(0, toNumber(schedule.total_due_amount) - toNumber(schedule.paid_amount)),
      date: dateOnly(eventDate(schedule.due_date, filter.startDate)),
      inOut: 'OUT' as const,
      label: schedule.loans?.lender_name ?? 'Loan',
      overdue: schedule.due_date < filter.startDate,
      refNo: schedule.loans?.contract_no ?? `LN-${schedule.installment_no ?? ''}`,
      type: 'LOAN' as const,
    })).filter((event: ForecastEvent) => event.amount > 0),
  ]

  const taxSources = scope.branchCodes === null
    ? [{ branchCode: null, payload: await buildTaxVatWht({ month: end.getMonth() + 1, year: end.getFullYear() }) }]
    : await Promise.all(scope.branchCodes.map(async (branchCode) => ({
        branchCode,
        payload: await buildTaxVatWht({ branchId: branchCode, month: end.getMonth() + 1, year: end.getFullYear() }),
      })))
  for (const { branchCode, payload } of taxSources) {
    for (const period of payload.taxCalendar) {
      const scopeLabel = branchCode ? ` · ${branchCode}` : ''
      const scopeRef = branchCode ? `-${branchCode}` : ''
      const vatDue = new Date(period.vatDue)
      if (vatDue >= filter.startDate && vatDue <= end && period.vatPayable > 0) {
        events.push({ amount: period.vatPayable, date: dateOnly(vatDue), inOut: 'OUT', label: `VAT Payable estimate${scopeLabel}`, refNo: `VAT-${period.periodLabel}${scopeRef}`, type: 'TAX' })
      }
      const whtDue = new Date(period.whtDue)
      if (whtDue >= filter.startDate && whtDue <= end && period.wC > 0) {
        events.push({ amount: period.wC, date: dateOnly(whtDue), inOut: 'OUT', label: `WHT Payable estimate${scopeLabel}`, refNo: `WHT-${period.periodLabel}${scopeRef}`, type: 'TAX' })
      }
    }
  }

  return { ap, ar, cash, events, loanSchedulesExcluded: scope.branchIds !== null }
}

export async function buildCashFlowForecastCalendar(filter: ForecastFilter) {
  const scope = await resolveBranchScope({ allowedBranchCodes: filter.allowedBranchCodes, branchId: filter.branchId })
  const { ap, ar, cash, events, loanSchedulesExcluded } = await buildProjectionSource({ ...filter, branchId: scope.selectedBranchCode }, scope)

  const dailyProjection = []
  let runningBal = cash.balance
  for (let index = 0; index <= filter.horizon; index += 1) {
    const date = addDays(filter.startDate, index)
    const key = dateOnly(date)
    const dayEvents = events.filter((event) => event.date === key)
    const dayIn = dayEvents.filter((event) => event.inOut === 'IN').reduce((sum, event) => sum + event.amount, 0)
    const dayOut = dayEvents.filter((event) => event.inOut === 'OUT').reduce((sum, event) => sum + event.amount, 0)
    const opening = runningBal
    const closing = opening + dayIn - dayOut
    runningBal = closing
    dailyProjection.push({
      closing,
      date: key,
      dayIdx: index,
      dayIn,
      dayOfMonth: date.getDate(),
      dayOfWeek: date.getDay(),
      dayOut,
      events: dayEvents,
      isToday: index === 0,
      opening,
    })
  }
  const totalIn = dailyProjection.reduce((sum, day) => sum + day.dayIn, 0)
  const totalOut = dailyProjection.reduce((sum, day) => sum + day.dayOut, 0)
  const lowestBal = Math.min(...dailyProjection.map((day) => day.closing))
  const negDay = dailyProjection.find((day) => day.closing < 0)

  return {
    branches: scope.branches,
    dailyProjection,
    events: events.sort((left, right) => left.date.localeCompare(right.date) || left.refNo.localeCompare(right.refNo)),
    filters: { branchId: scope.selectedBranchCode ?? 'ALL', horizon: filter.horizon, startDate: dateOnly(filter.startDate) },
    insights: {
      topAP: ap.sort((left, right) => right.payableBalance - left.payableBalance).slice(0, 10).map((row) => ({ ...row, dueDate: dateOnly(row.dueDate) })),
      topAR: ar.filter((row) => row.daysOverdue > 0).sort((left, right) => right.receivableBalance - left.receivableBalance).slice(0, 10).map((row) => ({ ...row, dueDate: dateOnly(row.dueDate) })),
    },
    projectionBasis: PROJECTION_BASIS,
    sourceState: sourceState({ loanSchedulesExcluded }),
    summary: {
      endCash: dailyProjection.at(-1)?.closing ?? cash.balance,
      lowestBal,
      negCount: dailyProjection.filter((day) => day.closing < 0).length,
      negDay: negDay ? { closing: negDay.closing, date: negDay.date } : null,
      startCash: cash.balance,
      totalIn,
      totalOut,
    },
  }
}
