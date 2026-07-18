import { toDateOnly, toNumber } from '@/lib/server/daily'
import type { OwnerDailyPayload } from '@/lib/server/dashboard-report-contracts'
import type { MainDashboardFilter } from '@/lib/server/main-dashboards'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { loadProductionTotalWipQty } from '@/lib/server/production-reports'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
function endOfDay(date: Date) { const value = new Date(date); value.setHours(23, 59, 59, 999); return value }
function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1) }
function addDays(date: Date, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value }
function daysBetween(from: Date, to: Date) { return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) }
function activeStatus(status?: string | null) { return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase()) }
function money(value: string | null) { return value == null ? 0 : Number(value) }

async function runBounded<const T extends readonly (() => Promise<unknown>)[]>(tasks: T, concurrency = 4): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results = new Array<unknown>(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const index = next
      next += 1
      results[index] = await tasks[index]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> }
}

async function cashBalance(asOf: Date) {
  const [accounts, rows] = await Promise.all([
    listActiveAccounts(),
    prisma.bank_statement.findMany({
      select: { account_id: true, amount_in: true, amount_out: true, balance: true, date: true },
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { date: { lte: endOfDay(asOf) } },
    }),
  ])
  const balances = new Map<bigint, number>()
  accounts.forEach((account: AccountReferenceRecord) => balances.set(account.id, money(account.openingBalance)))
  rows.forEach((row) => {
    if (row.account_id == null) return
    const previous = balances.get(row.account_id) ?? 0
    balances.set(row.account_id, row.balance == null ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance))
  })
  return accounts.reduce((result, account) => {
    const balance = balances.get(account.id) ?? 0
    const description = [account.type, account.name, account.bankName, account.bank].filter(Boolean).join(' ').toLowerCase()
    if (description.includes('od')) result.odUsed += Math.max(0, -balance)
    else if (description.includes('cash') || description.includes('เงินสด')) result.cash += balance
    else if (description.includes('fcd') || description.includes('foreign') || description.includes('ต่างประเทศ')) result.fcd += balance
    else result.bank += balance
    return result
  }, { bank: 0, cash: 0, fcd: 0, odUsed: 0 })
}

export async function buildOwnerDailyDashboard(filter: MainDashboardFilter): Promise<OwnerDailyPayload> {
  const selectedDate = filter.date
  const from = filter.dateFrom || toDateOnly(monthStart(selectedDate))
  const to = filter.dateTo || toDateOnly(selectedDate)
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const todayStart = startOfDay(selectedDate)
  const todayEnd = endOfDay(selectedDate)
  const rangeStart = new Date(`${from}T00:00:00.000Z`)
  const rangeEnd = new Date(`${to}T23:59:59.999Z`)

  const [purchases, sales, expenses, payments, receipts, stockRows, deals, bankToday, loanSchedules, currentCash, productionWip] = await runBounded([
    () => prisma.purchase_bills.findMany({ select: { date: true, doc_no: true, paid_amount: true, payable_balance: true, status: true, transaction_mode: true, suppliers: { select: { name: true } } }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: branch?.id, date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.sales_bills.findMany({ select: { credit_term: true, customers: { select: { name: true } }, date: true, doc_no: true, receivable_balance: true, status: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: branch?.id, date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.expenses.findMany({ select: { amount: true, date: true, doc_no: true, expense_categories: { select: { name: true } }, payee: true, status: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 3000, where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.payments.findMany({ select: { amount: true, net_amount: true }, where: { date: { gte: rangeStart, lte: rangeEnd } }, take: 3000, orderBy: [{ date: 'desc' }] }),
    () => prisma.receipts.findMany({ select: { amount: true, net_amount: true }, where: { date: { gte: rangeStart, lte: rangeEnd } }, take: 3000, orderBy: [{ date: 'desc' }] }),
    () => prisma.stock_ledger.findMany({ select: { output_category: true, qty_in: true, qty_out: true, value_in: true, value_out: true }, take: 20000, orderBy: [{ date: 'desc' }] }),
    () => prisma.trading_deals.findMany({ select: { status: true }, take: 3000, orderBy: [{ date: 'desc' }] }),
    () => prisma.bank_statement.findMany({ include: { accounts: { select: { name: true, type: true } } }, orderBy: [{ date: 'desc' }], where: { date: { gte: todayStart, lte: todayEnd } } }),
    () => prisma.loan_schedules.findMany({ include: { loans: { select: { contract_no: true } } }, orderBy: [{ due_date: 'asc' }], take: 1000, where: { due_date: { lte: todayEnd }, payment_status: { notIn: ['Paid', 'paid', 'PAID', 'cancelled', 'Cancelled'] } } }),
    () => cashBalance(selectedDate),
    () => loadProductionTotalWipQty(),
  ])

  const activePurchases = purchases.filter((row) => activeStatus(row.status))
  const activeSales = sales.filter((row) => activeStatus(row.status))
  const todayExpenses = expenses.filter((row) => row.date >= todayStart && row.date <= todayEnd && activeStatus(row.status))
  const todayBankCashIn = bankToday.reduce((sum, row) => sum + toNumber(row.amount_in), 0)
  const todayBankCashOut = bankToday.reduce((sum, row) => sum + toNumber(row.amount_out), 0)
  const expenseAmount = expenses.filter((row) => activeStatus(row.status)).reduce((sum, row) => sum + toNumber(row.amount), 0)
  const cashIn = receipts.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0)
  const cashOut = payments.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0) + expenseAmount
  const arDueRows = activeSales.map((row) => { const dueDate = addDays(row.date, row.credit_term ?? 0); return { amount: toNumber(row.receivable_balance), daysOverdue: Math.max(0, daysBetween(dueDate, selectedDate)), docNo: row.doc_no, due: toDateOnly(dueDate), id: row.doc_no, name: row.customers?.name ?? '-' } }).filter((row) => row.amount > 0 && row.due <= toDateOnly(selectedDate)).sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
  const apDueRows = activePurchases.map((row) => ({ amount: toNumber(row.payable_balance), docNo: row.doc_no, due: toDateOnly(row.date), id: row.doc_no, name: row.suppliers?.name ?? '-' })).filter((row) => row.amount > 0 && row.due <= toDateOnly(selectedDate)).sort((a, b) => b.amount - a.amount)
  const loanToday = loanSchedules.map((row) => ({ amount: Math.max(0, toNumber(row.total_due_amount) - toNumber(row.paid_amount)), contractNo: row.loans?.contract_no ?? '-', due: toDateOnly(row.due_date), id: row.loans?.contract_no ? `${row.loans.contract_no}-${row.installment_no ?? 0}` : '', installmentNo: row.installment_no ?? 0 })).filter((row) => row.amount > 0)
  const fgRows = stockRows.filter((row) => (row.output_category ?? '').toUpperCase() === 'FG')
  const fgQty = fgRows.reduce((sum, row) => sum + toNumber(row.qty_in) - toNumber(row.qty_out), 0)
  const fgValue = fgRows.reduce((sum, row) => sum + toNumber(row.value_in) - toNumber(row.value_out), 0)
  const tradingPurchases = activePurchases.filter((row) => row.transaction_mode === 'TRADING' && toNumber(row.paid_amount) > 0)
  const tradingPaidTotal = tradingPurchases.reduce((sum, row) => sum + toNumber(row.paid_amount), 0)
  const tradingPending = deals.filter((deal) => !['Matched', 'Closed', 'Cancelled', 'cancelled'].includes(deal.status ?? '')).length
  const actualCashIn = todayBankCashIn || cashIn
  const actualCashOut = todayBankCashOut || cashOut
  const expectedIn = arDueRows.reduce((sum, row) => sum + row.amount, 0)
  const expectedOut = apDueRows.reduce((sum, row) => sum + row.amount, 0) + loanToday.reduce((sum, row) => sum + row.amount, 0) + todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0)

  return {
    filters: { date: toDateOnly(selectedDate), from, to },
    sourceState: { limitations: ['No write, approval, posting, planning save, anomaly fix, or legacy localStorage action is enabled.', 'Owner Daily figures are management controls, not statutory accounting reports.'], writeActionsEnabled: false },
    ownerDaily: {
      actualActivity: { cashIn: actualCashIn, cashOut: actualCashOut, expenseOut: todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0), fgQty, fgValue, net: actualCashIn - actualCashOut, paymentOut: bankToday.filter((row) => row.ref_type === 'PMT').reduce((sum, row) => sum + toNumber(row.amount_out), 0) },
      cashPlan: { available: currentCash.cash + currentCash.bank, expectedIn, expectedOut, gap: currentCash.cash + currentCash.bank + expectedIn - expectedOut },
      due: { ap: apDueRows.slice(0, 10), ar: arDueRows.slice(0, 10) },
      expensesToday: todayExpenses.slice(0, 10).map((row) => ({ amount: toNumber(row.amount), docNo: row.doc_no, id: row.doc_no, payee: row.payee ?? '-', title: row.expense_categories?.name ?? '-' })),
      loanToday: loanToday.slice(0, 10),
      pending: { fgQty, fgValue, pendingPurchaseCount: purchases.filter((row) => ['draft', 'pending'].includes((row.status ?? '').toLowerCase())).length, pendingSalesCount: sales.filter((row) => ['draft', 'pending'].includes((row.status ?? '').toLowerCase())).length, productionWip, tradingMatchedTotal: 0, tradingPaidTotal, tradingPending, tradingPendingValue: tradingPaidTotal },
    },
  }
}
