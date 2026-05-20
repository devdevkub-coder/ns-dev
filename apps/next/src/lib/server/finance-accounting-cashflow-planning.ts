import type { Prisma } from '../../../generated/prisma/client'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { buildTaxVatWht } from '@/lib/server/finance-accounting-tax'
import { prisma } from '@/lib/server/prisma'

const CANCELLED_STATUSES = ['cancelled', 'void', 'ยกเลิก']
const DAY_MS = 86_400_000

export type AnalysisFilter = {
  branchId?: string
  from: Date
  to: Date
}

export type ForecastFilter = {
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

type BankRow = Prisma.bank_statementGetPayload<{
  include: { accounts: { select: { branch_id: true } } }
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
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function notCancelledWhere() {
  return { NOT: { status: { in: CANCELLED_STATUSES } } }
}

function branchWhere(branchId?: string) {
  return branchId ? { branch_id: branchId } : {}
}

function sourceState() {
  return {
    basis: 'Cash flow planning/read baseline from operational transactions. Not a statutory cash flow statement.',
    limitations: [
      'ยังไม่มี GL/COA/closing-period design จึงเป็น forecast/management baseline เท่านั้น',
      'AR/AP forecast ใช้ due_date หรือ credit term fallback จาก operational bills',
      'Tax due เป็น estimate จาก transaction-derived Tax/VAT/WHT baseline ไม่ใช่ filing state',
    ],
    writeActionsEnabled: false,
  }
}

async function listBranches() {
  const branches = await prisma.branches.findMany({
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    select: { code: true, id: true, name: true },
    where: { active: true },
  })
  return branches.map((branch) => ({ code: branch.code ?? '', id: branch.id, name: branch.name }))
}

async function cashAsOf(asOf: Date, branchId?: string) {
  const [accounts, bankRows] = await Promise.all([
    prisma.accounts.findMany({
      select: { id: true, od_limit: true, opening_balance: true },
      where: { active: true, ...branchWhere(branchId) },
    }),
    prisma.bank_statement.findMany({
      include: { accounts: { select: { branch_id: true } } },
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { date: { lte: endOfDay(asOf) }, ...(branchId ? { accounts: { branch_id: branchId } } : {}) },
    }),
  ])
  const balances = new Map<string, number>()
  accounts.forEach((account) => balances.set(account.id, toNumber(account.opening_balance)))
  bankRows.forEach((row: BankRow) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    balances.set(row.account_id, row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance))
  })
  return {
    balance: Array.from(balances.values()).reduce((sum, value) => sum + value, 0),
    odLimit: accounts.reduce((sum, account) => sum + toNumber(account.od_limit), 0),
    odUsed: Math.abs(Math.min(0, Array.from(balances.values()).reduce((sum, value) => sum + value, 0))),
  }
}

function dueDateFromBill(date: Date, explicit: Date | null | undefined, creditTerm?: number | null) {
  if (explicit) return explicit
  return addDays(date, creditTerm ?? 0)
}

function daysBetween(left: Date, right: Date) {
  return Math.floor((left.getTime() - right.getTime()) / DAY_MS)
}

async function loadBillsAsOf(asOf: Date, branchId?: string) {
  return Promise.all([
    prisma.sales_bills.findMany({
      include: { customers: { select: { credit_term: true, name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere(branchId), date: { lte: endOfDay(asOf) } },
    }),
    prisma.purchase_bills.findMany({
      include: { suppliers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...branchWhere(branchId), date: { lte: endOfDay(asOf) } },
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
      id: bill.id,
      receivableBalance: balance,
    }
  }).filter((row) => row.receivableBalance > 0.01)
}

function apRows(purchaseBills: PurchaseBill[], asOf: Date) {
  return purchaseBills.map((bill) => {
    const balance = Math.max(0, toNumber(bill.payable_balance) || (toNumber(bill.total_amount) - toNumber(bill.paid_amount)))
    const dueDate = dueDateFromBill(bill.date, undefined, 0)
    return {
      docNo: bill.doc_no,
      dueDate,
      daysToDue: Math.ceil((dueDate.getTime() - asOf.getTime()) / DAY_MS),
      id: bill.id,
      payableBalance: balance,
      supplierName: bill.suppliers?.name ?? '-',
    }
  }).filter((row) => row.payableBalance > 0.01)
}

async function loadPeriod(filter: AnalysisFilter) {
  const from = filter.from
  const to = endOfDay(filter.to)
  const branch = branchWhere(filter.branchId)
  return Promise.all([
    prisma.sales_bills.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.purchase_bills.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.expenses.findMany({
      include: { expense_categories: { select: { name: true } } },
      take: 20000,
      where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } },
    }),
    prisma.receipts.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.payments.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.loan_payments.findMany({ take: 10000, where: { ...notCancelledWhere(), date: { gte: from, lte: to } } }),
    prisma.stock_ledger.findMany({ take: 30000, where: { ...branch, date: { lte: to } } }),
    listBranches(),
  ])
}

export async function buildCashFlowAnalysis(filter: AnalysisFilter) {
  const [sales, purchases, expenses, receipts, payments, loanPayments, stockRows, branches] = await loadPeriod(filter)
  const [salesAsOf, purchasesAsOf] = await loadBillsAsOf(filter.to, filter.branchId)
  const cash = await cashAsOf(filter.to, filter.branchId)
  const revenue = sales.reduce((sum, bill) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const purchasesTotal = purchases.reduce((sum, bill) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const cogs = sales.reduce((sum, bill) => sum + (toNumber(bill.cogs_amount) || toNumber(bill.total_cost)), 0)
  const expensesTotal = expenses.reduce((sum, expense) => sum + (toNumber(expense.net_amount) || toNumber(expense.amount)), 0)
  const interestExpense = loanPayments.reduce((sum, payment) => sum + toNumber(payment.interest_amount), 0)
  const netProfit = revenue - cogs - expensesTotal - interestExpense
  const receiptsIn = receipts.reduce((sum, receipt) => sum + toNumber(receipt.amount), 0)
  const supplierPaymentsOut = payments.reduce((sum, payment) => sum + toNumber(payment.amount) + toNumber(payment.fee) + toNumber(payment.bank_fee), 0)
  const expensePaidOut = expenses.filter((expense: Expense) => ['paid', 'Paid', 'จ่ายแล้ว'].includes(expense.paid_status ?? '')).reduce((sum, expense) => sum + (toNumber(expense.net_amount) || toNumber(expense.amount)), 0)
  const operatingCashFlow = receiptsIn - supplierPaymentsOut - expensePaidOut - interestExpense
  const ar = arRows(salesAsOf, filter.to)
  const ap = apRows(purchasesAsOf, filter.to)
  const stockNow = stockRows.reduce((sum, row) => sum + toNumber(row.value_in) - toNumber(row.value_out), 0)
  const arNow = ar.reduce((sum, row) => sum + row.receivableBalance, 0)
  const apNow = ap.reduce((sum, row) => sum + row.payableBalance, 0)
  const in7Limit = addDays(filter.to, 7)
  const in30Limit = addDays(filter.to, 30)
  const cashIn7 = ar.filter((row) => row.dueDate <= in7Limit).reduce((sum, row) => sum + row.receivableBalance, 0)
  const cashIn30 = ar.filter((row) => row.dueDate <= in30Limit).reduce((sum, row) => sum + row.receivableBalance, 0)
  const cashOut7 = ap.filter((row) => row.dueDate <= in7Limit).reduce((sum, row) => sum + row.payableBalance, 0)
  const cashOut30 = ap.filter((row) => row.dueDate <= in30Limit).reduce((sum, row) => sum + row.payableBalance, 0)
  const projected7 = cash.balance + cashIn7 - cashOut7
  const projected30 = cash.balance + cashIn30 - cashOut30
  const periodDays = Math.max(1, daysBetween(filter.to, filter.from) + 1)
  const burnRate = Math.max(0, (supplierPaymentsOut + expensePaidOut + interestExpense) / periodDays)
  const daysToODMaxed = burnRate > 0 ? (cash.balance + cash.odLimit - cash.odUsed) / burnRate : 999
  const collectionRate = revenue > 0 ? receiptsIn / revenue * 100 : 0
  const paymentRate = purchasesTotal > 0 ? supplierPaymentsOut / purchasesTotal * 100 : 0
  const diff = netProfit - operatingCashFlow
  const stockRatio = cash.balance > 0 ? stockNow / cash.balance * 100 : 0
  const arRatio = cash.balance > 0 ? arNow / cash.balance * 100 : 0

  return {
    branches,
    charts: {
      profitVsCash: [
        { amount: netProfit, label: 'Net Profit (Accrual)', tone: 'emerald' },
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
      { label: 'Net Profit ในงบ (Accrual)', tone: 'good', value: netProfit },
      { label: 'Operating Cash Flow จริง', tone: 'good', value: operatingCashFlow },
      { label: 'ส่วนต่าง (NP - OCF)', tone: 'warn', value: diff },
      { label: 'Cash Collection Rate', suffix: '%', value: collectionRate },
      { label: 'Supplier Payment Rate', suffix: '%', value: paymentRate },
      { label: 'Projected Cash 7 วัน', tone: projected7 >= 0 ? 'good' : 'bad', value: projected7 },
      { label: 'Projected Cash 30 วัน', tone: projected30 >= 0 ? 'good' : 'bad', value: projected30 },
      { label: 'Burn Rate (เงินออก/วัน เฉลี่ย)', value: burnRate },
      { label: 'OD Used / Limit', value: cash.odUsed },
      { label: 'วันที่ OD จะเต็มวงเงิน', suffix: ' วัน', tone: daysToODMaxed < 30 ? 'bad' : 'good', value: Math.round(daysToODMaxed) },
    ],
    filters: { branchId: filter.branchId ?? 'ALL', from: dateOnly(filter.from), to: dateOnly(filter.to) },
    insights: [
      {
        body: `Net Profit: ${netProfit} · OCF: ${operatingCashFlow} · ส่วนต่าง: ${diff}`,
        explain: netProfit > operatingCashFlow + 10000 ? 'กำไรในงบสูงกว่าเงินสด แสดงว่ากำไรไปอยู่ใน Stock หรือ AR ค้าง' : 'กำไรกับเงินสดสอดคล้อง',
        title: '📊 กำไรกับเงินสดไปคนละทางไหม?',
        type: Math.abs(diff) > Math.abs(netProfit) * 0.3 && netProfit > 0 ? 'warn' : 'ok',
      },
      {
        body: `Stock: ${stockNow} (${stockRatio.toFixed(0)}% ของ Cash) · AR: ${arNow} (${arRatio.toFixed(0)}%)`,
        explain: stockRatio > arRatio * 1.5 ? 'Stock จมมากกว่า AR ต้องเร่งขายหรือปรับซื้อ' : 'โครงสร้างเงินจมยังไม่เอียงผิดปกติ',
        title: '🏪 เงินจมที่ไหน Stock หรือ AR?',
        type: stockRatio > 200 || arRatio > 200 ? 'warn' : 'ok',
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
    sourceState: sourceState(),
    summary: {
      apNow,
      arNow,
      burnRate,
      cashIn7,
      cashIn30,
      cashNow: cash.balance,
      cashOut7,
      cashOut30,
      cogs,
      collectionRate,
      daysToODMaxed,
      expensePaidOut,
      expenses: expensesTotal,
      interestExpense,
      netProfit,
      odLimit: cash.odLimit,
      odUsed: cash.odUsed,
      operatingCashFlow,
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

async function loadForecastInputs(filter: ForecastFilter) {
  const end = addDays(filter.startDate, filter.horizon)
  const branch = branchWhere(filter.branchId)
  return Promise.all([
    loadBillsAsOf(end, filter.branchId),
    prisma.expenses.findMany({
      include: { expense_categories: { select: { name: true } } },
      orderBy: [{ due_date: 'asc' }, { date: 'asc' }],
      take: 10000,
      where: { ...notCancelledWhere(), ...branch, OR: [{ paid_status: { not: 'paid' } }, { paid_status: null }], date: { lte: endOfDay(end) } },
    }),
    prisma.loan_schedules.findMany({
      include: { loans: { select: { contract_no: true, lender_name: true } } },
      orderBy: [{ due_date: 'asc' }, { installment_no: 'asc' }],
      take: 10000,
      where: { due_date: { lte: endOfDay(end) }, payment_status: { not: 'Paid' } },
    }),
    cashAsOf(filter.startDate, filter.branchId),
    listBranches(),
  ])
}

function eventDate(date: Date, start: Date) {
  return date < start ? start : date
}

export async function buildCashFlowForecastCalendar(filter: ForecastFilter) {
  const [[salesBills, purchaseBills], expenses, loanSchedules, cash, branches] = await loadForecastInputs(filter)
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
    })).filter((event) => event.amount > 0),
  ]

  const currentTax = await buildTaxVatWht({ branchId: filter.branchId, month: filter.startDate.getMonth() + 1, year: filter.startDate.getFullYear() })
  const taxDue = new Date(currentTax.taxCalendar.at(-1)?.vatDue ?? filter.startDate)
  if (taxDue >= filter.startDate && taxDue <= end && currentTax.summary.vatPayable > 0) {
    events.push({ amount: currentTax.summary.vatPayable, date: dateOnly(taxDue), inOut: 'OUT', label: 'VAT Payable estimate', refNo: currentTax.filters.year + currentTax.filters.month, type: 'TAX' })
  }

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
    branches,
    dailyProjection,
    events: events.sort((left, right) => left.date.localeCompare(right.date) || left.refNo.localeCompare(right.refNo)),
    filters: { branchId: filter.branchId ?? 'ALL', horizon: filter.horizon, startDate: dateOnly(filter.startDate) },
    insights: {
      topAP: ap.sort((left, right) => right.payableBalance - left.payableBalance).slice(0, 10).map((row) => ({ ...row, dueDate: dateOnly(row.dueDate) })),
      topAR: ar.filter((row) => row.daysOverdue > 0).sort((left, right) => right.receivableBalance - left.receivableBalance).slice(0, 10).map((row) => ({ ...row, dueDate: dateOnly(row.dueDate) })),
    },
    sourceState: sourceState(),
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
