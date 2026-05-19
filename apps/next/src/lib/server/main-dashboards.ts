import { toDateOnly, toNumber } from '@/lib/server/daily'
import { buildFinancialDashboard } from '@/lib/server/finance-accounting-dashboard'
import { loadProductionMetrics, summarizeProductionMetrics } from '@/lib/server/production-reports'
import { prisma } from '@/lib/server/prisma'

export type MainDashboardFilter = {
  date: Date
  dateFrom?: string
  dateTo?: string
}

function dateOnly(date: Date) {
  return toDateOnly(date)
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function defaultRange(date: Date) {
  return { from: dateOnly(monthStart(date)), to: dateOnly(date) }
}

function activeStatus(status?: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function itemsQty(items: unknown) {
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum
    const row = item as Record<string, unknown>
    const value = row.qty ?? row.quantity ?? row.weight ?? row.netWeight
    if (typeof value === 'number') return sum + value
    if (typeof value === 'string') return sum + Number(value || 0)
    if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return sum + value.toNumber()
    return sum
  }, 0)
}

async function cashBalances(asOf: Date) {
  const [accounts, bankRows] = await Promise.all([
    prisma.accounts.findMany({ where: { active: true } }),
    prisma.bank_statement.findMany({
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { date: { lte: endOfDay(asOf) } },
    }),
  ])
  const balances = new Map<string, number>()
  accounts.forEach((account) => balances.set(account.id, toNumber(account.opening_balance)))
  bankRows.forEach((row) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    balances.set(row.account_id, row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance))
  })
  return accounts.reduce((acc, account) => {
    const balance = balances.get(account.id) ?? 0
    const type = [account.type, account.name, account.bank_name, account.bank].filter(Boolean).join(' ').toLowerCase()
    if (type.includes('od')) {
      acc.odUsed += Math.max(0, -balance)
      acc.odLimit += toNumber(account.od_limit)
    } else if (type.includes('cash') || type.includes('เงินสด')) {
      acc.cash += balance
    } else {
      acc.bank += balance
    }
    return acc
  }, { bank: 0, cash: 0, odLimit: 0, odUsed: 0 })
}

export async function buildMainDashboards(filter: MainDashboardFilter) {
  const selectedDate = filter.date
  const fallback = defaultRange(selectedDate)
  const from = filter.dateFrom || fallback.from
  const to = filter.dateTo || fallback.to
  const todayStart = startOfDay(selectedDate)
  const todayEnd = endOfDay(selectedDate)

  const [purchases, sales, expenses, payments, receipts, stockRows, deals, finance, productionRows, cash] = await Promise.all([
    prisma.purchase_bills.findMany({ include: { suppliers: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.sales_bills.findMany({ include: { customers: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.expenses.findMany({ include: { expense_categories: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 3000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.payments.findMany({ orderBy: [{ date: 'desc' }], take: 3000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.receipts.findMany({ orderBy: [{ date: 'desc' }], take: 3000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.stock_ledger.findMany({ include: { branches: true, products: true }, orderBy: [{ date: 'desc' }], take: 20000 }),
    prisma.trading_deals.findMany({ orderBy: [{ date: 'desc' }], take: 3000 }),
    buildFinancialDashboard({ asOf: selectedDate }),
    loadProductionMetrics({ dateFrom: from, dateTo: to }),
    cashBalances(selectedDate),
  ])

  const activePurchases = purchases.filter((row) => activeStatus(row.status))
  const activeSales = sales.filter((row) => activeStatus(row.status))
  const todayPurchases = activePurchases.filter((row) => row.date >= todayStart && row.date <= todayEnd)
  const todaySales = activeSales.filter((row) => row.date >= todayStart && row.date <= todayEnd)
  const todayExpenses = expenses.filter((row) => row.date >= todayStart && row.date <= todayEnd && activeStatus(row.status))
  const purchaseAmount = activePurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const salesAmount = activeSales.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const cogs = activeSales.reduce((sum, row) => sum + toNumber(row.cogs_amount || row.total_cost), 0)
  const grossProfit = activeSales.reduce((sum, row) => sum + toNumber(row.gross_profit), 0) || salesAmount - cogs
  const expenseAmount = expenses.filter((row) => activeStatus(row.status)).reduce((sum, row) => sum + toNumber(row.amount), 0)
  const stockQty = stockRows.reduce((sum, row) => sum + toNumber(row.qty_in) - toNumber(row.qty_out), 0)
  const stockValue = stockRows.reduce((sum, row) => sum + toNumber(row.value_in) - toNumber(row.value_out), 0)
  const production = summarizeProductionMetrics(productionRows)
  const tradingPending = deals.filter((deal) => !['Matched', 'Closed', 'Cancelled', 'cancelled'].includes(deal.status ?? '')).length
  const cashIn = receipts.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0)
  const cashOut = payments.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0) + expenseAmount

  return {
    filters: { date: dateOnly(selectedDate), from, to },
    sourceState: {
      basis: 'Main dashboard read/report baseline from operational tables and existing module helpers.',
      limitations: ['No write, approval, posting, planning save, anomaly fix, or legacy localStorage action is enabled.', 'Dashboard figures are management KPIs, not statutory accounting reports.'],
      writeActionsEnabled: false,
    },
    dashboard: {
      aging: [
        { label: 'AR', value: finance.summary.ar },
        { label: 'AP', value: finance.summary.ap },
      ],
      kpi: {
        ar: finance.summary.ar,
        ap: finance.summary.ap,
        cashBalance: cash.cash + cash.bank,
        expenses: expenseAmount + cogs,
        grossProfit,
        netProfit: salesAmount - cogs - expenseAmount,
        revenue: salesAmount,
      },
      sections: {
        cash: { ...cash, netCash: cash.cash + cash.bank - cash.odUsed },
        purchase: { amount: purchaseAmount, count: activePurchases.length, qty: activePurchases.reduce((sum, row) => sum + itemsQty(row.items), 0), today: todayPurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0) },
        sales: { amount: salesAmount, count: activeSales.length, gp: grossProfit, qty: activeSales.reduce((sum, row) => sum + itemsQty(row.items), 0), today: todaySales.reduce((sum, row) => sum + toNumber(row.total_amount), 0) },
        stock: { qty: stockQty, value: stockValue },
      },
      trend: [
        { label: 'ซื้อ', value: purchaseAmount },
        { label: 'ขาย', value: salesAmount },
        { label: 'ค่าใช้จ่าย', value: expenseAmount },
        { label: 'GP', value: grossProfit },
      ],
    },
    dailyReport: {
      cashMovement: { cashIn, cashOut, net: cashIn - cashOut },
      expenseRows: todayExpenses.slice(0, 12).map((row) => ({ amount: toNumber(row.amount), category: row.expense_categories?.name ?? row.category_id ?? '-', docNo: row.doc_no, payee: row.payee ?? '-' })),
      groupBreakdown: [],
      purchaseBills: todayPurchases.slice(0, 12).map((row) => ({ amount: toNumber(row.total_amount), docNo: row.doc_no, name: row.suppliers?.name ?? row.supplier_id ?? '-', qty: itemsQty(row.items) })),
      salesBills: todaySales.slice(0, 12).map((row) => ({ amount: toNumber(row.total_amount), docNo: row.doc_no, name: row.customers?.name ?? row.customer_id ?? '-', qty: itemsQty(row.items) })),
      summary: {
        expenseAmount: todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0),
        purchaseAmount: todayPurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0),
        purchaseQty: todayPurchases.reduce((sum, row) => sum + itemsQty(row.items), 0),
        salesAmount: todaySales.reduce((sum, row) => sum + toNumber(row.total_amount), 0),
        salesQty: todaySales.reduce((sum, row) => sum + itemsQty(row.items), 0),
      },
    },
    ownerDaily: {
      actualActivity: { cashIn, cashOut, net: cashIn - cashOut },
      cashPlan: { available: cash.cash + cash.bank, expectedIn: finance.summary.cashIn7, expectedOut: finance.summary.cashNeed7, gap: cash.cash + cash.bank + finance.summary.cashIn7 - finance.summary.cashNeed7 },
      due: {
        ap: activePurchases.filter((row) => toNumber(row.payable_balance) > 0).slice(0, 10).map((row) => ({ amount: toNumber(row.payable_balance), docNo: row.doc_no, name: row.suppliers?.name ?? row.supplier_id ?? '-' })),
        ar: activeSales.filter((row) => toNumber(row.receivable_balance) > 0).slice(0, 10).map((row) => ({ amount: toNumber(row.receivable_balance), docNo: row.doc_no, name: row.customers?.name ?? row.customer_id ?? '-' })),
      },
      pending: { pendingIssueCount: 0, productionWip: production.wipQty, tradingPending },
    },
    production: { summary: production },
  }
}
