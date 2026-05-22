import { toDateOnly, toNumber } from '@/lib/server/daily'
import { buildFinancialDashboard } from '@/lib/server/finance-accounting-dashboard'
import { loadProductionMetrics, summarizeProductionMetrics } from '@/lib/server/production-reports'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemQty, purchaseBillItemRows } from '@/lib/server/purchase-bill-items'

export type MainDashboardFilter = {
  branchId?: string
  customerId?: string
  date: Date
  dateFrom?: string
  dateTo?: string
  group?: string
  productId?: string
  supplierId?: string
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

function daysBetween(from: Date, to: Date) {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000)
}

function agingBucket(daysOverdue: number) {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return 'over90'
}

function defaultRange(date: Date) {
  return { from: dateOnly(monthStart(date)), to: dateOnly(date) }
}

function monthIndex(value: string) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7))
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

function itemRows(items: unknown) {
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const productId = String(row.productId ?? row.product_id ?? '')
    const qtyValue = row.netWeight ?? row.weight ?? row.qty ?? row.quantity
    const qty = typeof qtyValue === 'number' ? qtyValue : typeof qtyValue === 'string' ? Number(qtyValue || 0) : 0
    const priceValue = row.price ?? row.unitPrice ?? row.unit_price
    const amountValue = row.amount ?? row.total ?? row.totalAmount
    const price = typeof priceValue === 'number' ? priceValue : typeof priceValue === 'string' ? Number(priceValue || 0) : 0
    const amount = typeof amountValue === 'number' ? amountValue : typeof amountValue === 'string' ? Number(amountValue || 0) : qty * price
    return [{ amount, productId, qty }]
  })
}

function billHasProductOrGroup(items: unknown, productById: Map<string, { metal_group: string | null }>, productId?: string, group?: string) {
  if (!productId && !group) return true
  return itemRows(items).some((item) => {
    if (productId && item.productId !== productId) return false
    if (group && (productById.get(item.productId)?.metal_group ?? 'อื่นๆ') !== group) return false
    return true
  })
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
    } else if (type.includes('fcd') || type.includes('foreign') || type.includes('ต่างประเทศ')) {
      acc.fcd += balance
    } else if (type.includes('cash') || type.includes('เงินสด')) {
      acc.cash += balance
    } else {
      acc.bank += balance
    }
    return acc
  }, { bank: 0, cash: 0, fcd: 0, odLimit: 0, odUsed: 0 })
}

export async function buildMainDashboards(filter: MainDashboardFilter) {
  const selectedDate = filter.date
  const fallback = defaultRange(selectedDate)
  const from = filter.dateFrom || fallback.from
  const to = filter.dateTo || fallback.to
  const todayStart = startOfDay(selectedDate)
  const todayEnd = endOfDay(selectedDate)

  const [purchases, sales, expenses, payments, receipts, stockRows, deals, finance, productionRows, cash, bankToday, bankRange, loanSchedules, stockIssues, products, salespersons, branches, suppliers, customers, historicalRows] = await Promise.all([
    prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' } }, suppliers: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: filter.branchId || undefined, supplier_id: filter.supplierId || undefined, date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.sales_bills.findMany({ include: { customers: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: filter.branchId || undefined, customer_id: filter.customerId || undefined, date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.expenses.findMany({ include: { expense_categories: true }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 3000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.payments.findMany({ orderBy: [{ date: 'desc' }], take: 3000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.receipts.findMany({ orderBy: [{ date: 'desc' }], take: 3000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.stock_ledger.findMany({ include: { branches: true, products: true }, orderBy: [{ date: 'desc' }], take: 20000 }),
    prisma.trading_deals.findMany({ orderBy: [{ date: 'desc' }], take: 3000 }),
    buildFinancialDashboard({ asOf: selectedDate }),
    loadProductionMetrics({ dateFrom: from, dateTo: to }),
    cashBalances(selectedDate),
    prisma.bank_statement.findMany({ include: { accounts: true }, orderBy: [{ date: 'desc' }], where: { date: { gte: todayStart, lte: todayEnd } } }),
    prisma.bank_statement.findMany({ include: { accounts: true }, orderBy: [{ date: 'asc' }], take: 10000, where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } }),
    prisma.loan_schedules.findMany({ include: { loans: true }, orderBy: [{ due_date: 'asc' }], take: 1000, where: { due_date: { lte: todayEnd }, payment_status: { notIn: ['Paid', 'paid', 'PAID', 'cancelled', 'Cancelled'] } } }),
    prisma.stock_issues.findMany({ include: { customers: true }, orderBy: [{ date: 'desc' }], take: 1000, where: { status: { in: ['pending', 'Pending', 'draft', 'Draft', 'open', 'Open'] } } }),
    prisma.products.findMany({ where: { active: { not: false } } }),
    prisma.salespersons.findMany({ where: { active: { not: false } } }),
    prisma.branches.findMany({ orderBy: [{ name: 'asc' }], where: { active: { not: false } } }),
    prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], select: { id: true, name: true }, where: { active: { not: false } } }),
    prisma.customers.findMany({ orderBy: [{ name: 'asc' }], select: { id: true, name: true }, where: { active: { not: false } } }),
    prisma.historical_monthly.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }], take: 5000 }),
  ])

  const productById = new Map(products.map((row) => [row.id, row]))
  const activePurchases = purchases.filter((row) => activeStatus(row.status) && billHasProductOrGroup(purchaseBillItemRows(row), productById, filter.productId, filter.group))
  const activeSales = sales.filter((row) => activeStatus(row.status) && billHasProductOrGroup(row.items, productById, filter.productId, filter.group))
  const todayPurchases = activePurchases.filter((row) => row.date >= todayStart && row.date <= todayEnd)
  const todaySales = activeSales.filter((row) => row.date >= todayStart && row.date <= todayEnd)
  const todayExpenses = expenses.filter((row) => row.date >= todayStart && row.date <= todayEnd && activeStatus(row.status))
  const todayBankCashIn = bankToday.reduce((sum, row) => sum + toNumber(row.amount_in), 0)
  const todayBankCashOut = bankToday.reduce((sum, row) => sum + toNumber(row.amount_out), 0)
  const bankByTypeMap = new Map<string, { cashIn: number; cashOut: number; label: string }>()
  const typeLabel = (value?: string | null) => value === 'PMT' ? 'จ่ายเงิน Supplier' : value === 'RCP' ? 'รับเงินลูกค้า' : value === 'EXP' ? 'ค่าใช้จ่าย' : value === 'TRF' ? 'โอนระหว่างบัญชี' : value || 'อื่นๆ'
  for (const row of bankToday) {
    const key = row.ref_type ?? row.type ?? 'OTHER'
    const current = bankByTypeMap.get(key) ?? { cashIn: 0, cashOut: 0, label: typeLabel(key) }
    current.cashIn += toNumber(row.amount_in)
    current.cashOut += toNumber(row.amount_out)
    bankByTypeMap.set(key, current)
  }
  const bankByAccountMap = new Map<string, { cashIn: number; cashOut: number; name: string; type: string }>()
  for (const row of bankToday) {
    const key = row.account_id ?? 'unknown'
    const current = bankByAccountMap.get(key) ?? { cashIn: 0, cashOut: 0, name: row.accounts?.name ?? row.account_id ?? '-', type: row.accounts?.type ?? '-' }
    current.cashIn += toNumber(row.amount_in)
    current.cashOut += toNumber(row.amount_out)
    bankByAccountMap.set(key, current)
  }
  const fromMonth = monthIndex(from.slice(0, 7))
  const toMonth = monthIndex(to.slice(0, 7))
  const scopedHistoricalRows = historicalRows.filter((row) => {
    if (!row.year || !row.month) return false
    const current = row.year * 12 + row.month
    return current >= fromMonth && current <= toMonth
  })
  const historicalRevenue = scopedHistoricalRows.filter((row) => row.metric_type === 'pnl' && row.category_id === 'revenue').reduce((sum, row) => sum + toNumber(row.amount), 0)
  const historicalCogs = scopedHistoricalRows.filter((row) => row.metric_type === 'pnl' && row.category_id === 'cogs').reduce((sum, row) => sum + toNumber(row.amount), 0)
  const historicalExpenses = scopedHistoricalRows.filter((row) => row.metric_type === 'expense').reduce((sum, row) => sum + toNumber(row.amount), 0)
  const livePurchaseAmount = activePurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const liveSalesAmount = activeSales.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const liveCogs = activeSales.reduce((sum, row) => sum + toNumber(row.cogs_amount || row.total_cost), 0)
  const purchaseAmount = livePurchaseAmount + historicalCogs
  const salesAmount = liveSalesAmount + historicalRevenue
  const cogs = liveCogs + historicalCogs
  const grossProfit = (activeSales.reduce((sum, row) => sum + toNumber(row.gross_profit), 0) || liveSalesAmount - liveCogs) + historicalRevenue - historicalCogs
  const expenseAmount = expenses.filter((row) => activeStatus(row.status)).reduce((sum, row) => sum + toNumber(row.amount), 0) + historicalExpenses
  const stockQty = stockRows.reduce((sum, row) => sum + toNumber(row.qty_in) - toNumber(row.qty_out), 0)
  const stockValue = stockRows.reduce((sum, row) => sum + toNumber(row.value_in) - toNumber(row.value_out), 0)
  const production = summarizeProductionMetrics(productionRows)
  const tradingPending = deals.filter((deal) => !['Matched', 'Closed', 'Cancelled', 'cancelled'].includes(deal.status ?? '')).length
  const cashIn = receipts.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0)
  const cashOut = payments.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0) + expenseAmount
  const salespersonById = new Map(salespersons.map((row) => [row.id, row]))
  const groupMap = new Map<string, { buyAmt: number; buyQty: number; group: string; products: Map<string, { buyAmt: number; buyQty: number; productCode: string; productId: string; productName: string; sellAmt: number; sellQty: number }>; sellAmt: number; sellQty: number }>()
  const ensureGroup = (group: string) => {
    const current = groupMap.get(group) ?? { buyAmt: 0, buyQty: 0, group, products: new Map(), sellAmt: 0, sellQty: 0 }
    groupMap.set(group, current)
    return current
  }
  const ensureProduct = (group: ReturnType<typeof ensureGroup>, productId: string) => {
    const product = productById.get(productId)
    const current = group.products.get(productId) ?? { buyAmt: 0, buyQty: 0, productCode: product?.code ?? '', productId, productName: product?.name ?? '-', sellAmt: 0, sellQty: 0 }
    group.products.set(productId, current)
    return current
  }
  for (const bill of todayPurchases) {
    for (const item of itemRows(purchaseBillItemRows(bill))) {
      const product = productById.get(item.productId)
      const group = ensureGroup(product?.metal_group ?? 'อื่นๆ')
      const row = ensureProduct(group, item.productId || 'unknown')
      group.buyAmt += item.amount
      group.buyQty += item.qty
      row.buyAmt += item.amount
      row.buyQty += item.qty
    }
  }
  for (const bill of todaySales) {
    for (const item of itemRows(bill.items)) {
      const product = productById.get(item.productId)
      const group = ensureGroup(product?.metal_group ?? 'อื่นๆ')
      const row = ensureProduct(group, item.productId || 'unknown')
      group.sellAmt += item.amount
      group.sellQty += item.qty
      row.sellAmt += item.amount
      row.sellQty += item.qty
    }
  }
  const topSuppliers = new Map<string, { amount: number; bills: number; id: string; name: string; qty: number }>()
  for (const bill of activePurchases) {
    const key = bill.supplier_id ?? 'unknown'
    const current = topSuppliers.get(key) ?? { amount: 0, bills: 0, id: key, name: bill.suppliers?.name ?? bill.supplier_id ?? '-', qty: 0 }
    current.amount += toNumber(bill.total_amount)
    current.qty += purchaseBillItemQty(bill)
    current.bills += 1
    topSuppliers.set(key, current)
  }
  const topCustomers = new Map<string, { amount: number; bills: number; gp: number; id: string; name: string; qty: number }>()
  for (const bill of activeSales) {
    const key = bill.customer_id ?? 'unknown'
    const current = topCustomers.get(key) ?? { amount: 0, bills: 0, gp: 0, id: key, name: bill.customers?.name ?? bill.customer_id ?? '-', qty: 0 }
    current.amount += toNumber(bill.total_amount)
    current.gp += toNumber(bill.gross_profit)
    current.qty += itemsQty(bill.items)
    current.bills += 1
    topCustomers.set(key, current)
  }
  const productIn = new Map<string, { amount: number; code: string; group: string; id: string; name: string; qty: number }>()
  const productOut = new Map<string, { amount: number; code: string; group: string; id: string; name: string; qty: number }>()
  for (const bill of activePurchases) for (const item of itemRows(purchaseBillItemRows(bill))) {
    const product = productById.get(item.productId)
    const current = productIn.get(item.productId) ?? { amount: 0, code: product?.code ?? '', group: product?.metal_group ?? 'อื่นๆ', id: item.productId, name: product?.name ?? '-', qty: 0 }
    current.amount += item.amount
    current.qty += item.qty
    productIn.set(item.productId, current)
  }
  for (const bill of activeSales) for (const item of itemRows(bill.items)) {
    const product = productById.get(item.productId)
    const current = productOut.get(item.productId) ?? { amount: 0, code: product?.code ?? '', group: product?.metal_group ?? 'อื่นๆ', id: item.productId, name: product?.name ?? '-', qty: 0 }
    current.amount += item.amount
    current.qty += item.qty
    productOut.set(item.productId, current)
  }
  const bySalesperson = new Map<string, { amount: number; bills: number; id: string; name: string; qty: number; suppliers: Set<string> }>()
  for (const bill of activePurchases) {
    const key = bill.sales_id ?? '__no_sales__'
    const current = bySalesperson.get(key) ?? { amount: 0, bills: 0, id: key, name: salespersonById.get(key)?.name ?? (key === '__no_sales__' ? '(ไม่ระบุเซล)' : key), qty: 0, suppliers: new Set() }
    if (bill.supplier_id) current.suppliers.add(bill.supplier_id)
    current.amount += toNumber(bill.total_amount)
    current.qty += purchaseBillItemQty(bill)
    current.bills += 1
    bySalesperson.set(key, current)
  }
  const dailyTrendMap = new Map<string, { label: string; purchase: number; sales: number }>()
  for (const row of bankRange) dailyTrendMap.set(dateOnly(row.date), { label: dateOnly(row.date), purchase: 0, sales: 0 })
  for (const bill of activePurchases) {
    const label = dateOnly(bill.date)
    const current = dailyTrendMap.get(label) ?? { label, purchase: 0, sales: 0 }
    current.purchase += toNumber(bill.total_amount)
    dailyTrendMap.set(label, current)
  }
  for (const bill of activeSales) {
    const label = dateOnly(bill.date)
    const current = dailyTrendMap.get(label) ?? { label, purchase: 0, sales: 0 }
    current.sales += toNumber(bill.total_amount)
    dailyTrendMap.set(label, current)
  }
  const expenseCategoryMap = new Map<string, { amount: number; count: number; name: string }>()
  for (const row of todayExpenses) {
    const key = row.expense_categories?.name ?? row.category_id ?? 'ไม่ระบุ'
    const current = expenseCategoryMap.get(key) ?? { amount: 0, count: 0, name: key }
    current.amount += toNumber(row.amount)
    current.count += 1
    expenseCategoryMap.set(key, current)
  }
  const loanToday = loanSchedules.map((row) => ({
    amount: Math.max(0, toNumber(row.total_due_amount) - toNumber(row.paid_amount)),
    contractNo: row.loans?.contract_no ?? row.loan_id ?? '-',
    due: dateOnly(row.due_date),
    id: row.id,
    installmentNo: row.installment_no ?? 0,
  })).filter((row) => row.amount > 0)
  const pendingIssues = stockIssues.filter((issue) => ['pending', 'draft', 'open'].includes((issue.status ?? '').toLowerCase()))
  const pendingIssueQty = pendingIssues.reduce((sum, issue) => sum + itemsQty(issue.items), 0)
  const fgRows = stockRows.filter((row) => (row.output_category ?? row.products?.item_status ?? '').toUpperCase() === 'FG')
  const fgQty = fgRows.reduce((sum, row) => sum + toNumber(row.qty_in) - toNumber(row.qty_out), 0)
  const fgValue = fgRows.reduce((sum, row) => sum + toNumber(row.value_in) - toNumber(row.value_out), 0)
  const emptyAging = () => ({ '1-30': 0, '31-60': 0, '61-90': 0, current: 0, over90: 0 })
  const arAgingBuckets = emptyAging()
  const apAgingBuckets = emptyAging()
  activeSales.forEach((row) => {
    const amount = toNumber(row.receivable_balance)
    if (amount <= 0) return
    const dueDate = addDays(row.date, row.credit_term ?? 0)
    arAgingBuckets[agingBucket(daysBetween(dueDate, selectedDate))] += amount
  })
  activePurchases.forEach((row) => {
    const amount = toNumber(row.payable_balance)
    if (amount <= 0) return
    const dueDate = addDays(row.date, 0)
    apAgingBuckets[agingBucket(daysBetween(dueDate, selectedDate))] += amount
  })
  const stockByBranchMap = new Map<string, { name: string; qty: number; value: number }>()
  const stockByGroupMap = new Map<string, { group: string; qty: number; value: number }>()
  stockRows.forEach((row) => {
    const qty = toNumber(row.qty_in) - toNumber(row.qty_out)
    const value = toNumber(row.value_in) - toNumber(row.value_out)
    if (Math.abs(qty) < 0.001 && Math.abs(value) < 0.001) return
    const branchKey = row.branch_id ?? 'unknown'
    const branch = stockByBranchMap.get(branchKey) ?? { name: row.branches?.name ?? row.branch_id ?? '-', qty: 0, value: 0 }
    branch.qty += qty
    branch.value += value
    stockByBranchMap.set(branchKey, branch)
    const groupKey = row.products?.metal_group ?? 'อื่นๆ'
    const group = stockByGroupMap.get(groupKey) ?? { group: groupKey, qty: 0, value: 0 }
    group.qty += qty
    group.value += value
    stockByGroupMap.set(groupKey, group)
  })
  const monthlyTrendMap = new Map<string, { expense: number; gp: number; label: string; purchase: number; sales: number }>()
  const ensureMonth = (date: Date) => {
    const label = dateOnly(date).slice(0, 7)
    const current = monthlyTrendMap.get(label) ?? { expense: 0, gp: 0, label, purchase: 0, sales: 0 }
    monthlyTrendMap.set(label, current)
    return current
  }
  activePurchases.forEach((row) => { ensureMonth(row.date).purchase += toNumber(row.total_amount) })
  activeSales.forEach((row) => {
    const month = ensureMonth(row.date)
    month.sales += toNumber(row.total_amount)
    month.gp += toNumber(row.gross_profit) || toNumber(row.total_amount) - toNumber(row.cogs_amount || row.total_cost)
  })
  expenses.filter((row) => activeStatus(row.status)).forEach((row) => { ensureMonth(row.date).expense += toNumber(row.amount) })
  scopedHistoricalRows.forEach((row) => {
    if (!row.year || !row.month) return
    const date = new Date(row.year, row.month - 1, 1)
    const month = ensureMonth(date)
    const amount = toNumber(row.amount)
    if (row.metric_type === 'pnl' && row.category_id === 'revenue') month.sales += amount
    if (row.metric_type === 'pnl' && row.category_id === 'cogs') {
      month.purchase += amount
      month.gp -= amount
    }
    if (row.metric_type === 'expense') month.expense += amount
  })
  const arDueRows = activeSales.map((row) => {
    const dueDate = addDays(row.date, row.credit_term ?? 0)
    return { amount: toNumber(row.receivable_balance), daysOverdue: Math.max(0, daysBetween(dueDate, selectedDate)), docNo: row.doc_no, due: dateOnly(dueDate), id: row.id, name: row.customers?.name ?? row.customer_id ?? '-' }
  }).filter((row) => row.amount > 0 && row.due <= dateOnly(selectedDate)).sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
  const apDueRows = activePurchases.map((row) => {
    const dueDate = row.date
    return { amount: toNumber(row.payable_balance), docNo: row.doc_no, due: dateOnly(dueDate), id: row.id, name: row.suppliers?.name ?? row.supplier_id ?? '-' }
  }).filter((row) => row.amount > 0 && row.due <= dateOnly(selectedDate)).sort((a, b) => b.amount - a.amount)
  const tradingPurchases = activePurchases.filter((row) => row.transaction_mode === 'TRADING' && toNumber(row.paid_amount) > 0)
  const tradingPaidTotal = tradingPurchases.reduce((sum, row) => sum + toNumber(row.paid_amount), 0)

  return {
    filterOptions: {
      branches: branches.map((row) => ({ id: row.id, name: row.name })),
      customers: customers.map((row) => ({ id: row.id, name: row.name })),
      groups: Array.from(new Set(products.map((row) => row.metal_group ?? 'อื่นๆ'))).sort(),
      products: products.map((row) => ({ code: row.code, id: row.id, name: row.name })),
      suppliers: suppliers.map((row) => ({ id: row.id, name: row.name })),
    },
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
      agingBuckets: { ap: apAgingBuckets, ar: arAgingBuckets },
      cashComposition: [
        { label: '💵 เงินสด', value: cash.cash },
        { label: '🏦 ธนาคาร', value: cash.bank },
        { label: '💱 FCD', value: cash.fcd },
        { label: '📥 AR', value: finance.summary.ar },
        { label: '📤 AP', value: -finance.summary.ap },
        { label: '⚠ OD Used', value: cash.odUsed },
        { label: '💎 Net Cash', value: cash.cash + cash.bank + cash.fcd + finance.summary.ar - finance.summary.ap - cash.odUsed },
      ].filter((row) => row.value !== 0),
      kpi: {
        ar: finance.summary.ar,
        ap: finance.summary.ap,
        cashBalance: cash.cash + cash.bank + cash.fcd,
        expenses: expenseAmount + cogs,
        grossProfit,
        netProfit: salesAmount - cogs - expenseAmount,
        revenue: salesAmount,
      },
      historical: {
        cogs: historicalCogs,
        expenses: historicalExpenses,
        revenue: historicalRevenue,
        rows: scopedHistoricalRows.length,
      },
      monthlyTrend: Array.from(monthlyTrendMap.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-6),
      sections: {
        cash: { ...cash, netCash: cash.cash + cash.bank + cash.fcd + finance.summary.ar - finance.summary.ap - cash.odUsed },
        purchase: { amount: purchaseAmount, count: activePurchases.length, qty: activePurchases.reduce((sum, row) => sum + purchaseBillItemQty(row), 0), today: todayPurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0) },
        sales: { amount: salesAmount, count: activeSales.length, gp: grossProfit, qty: activeSales.reduce((sum, row) => sum + itemsQty(row.items), 0), today: todaySales.reduce((sum, row) => sum + toNumber(row.total_amount), 0) },
        stock: { qty: stockQty, value: stockValue },
      },
      stockByBranch: Array.from(stockByBranchMap.values()).filter((row) => row.qty !== 0 || row.value !== 0).sort((a, b) => b.value - a.value),
      stockByGroup: Array.from(stockByGroupMap.values()).filter((row) => row.qty !== 0 || row.value !== 0).sort((a, b) => b.value - a.value),
      trend: [
        { label: 'ซื้อ', value: purchaseAmount },
        { label: 'ขาย', value: salesAmount },
        { label: 'ค่าใช้จ่าย', value: expenseAmount },
        { label: 'GP', value: grossProfit },
      ],
    },
    dailyReport: {
      analytics: {
        bySalesperson: Array.from(bySalesperson.values()).map((row) => ({ ...row, suppliers: row.suppliers.size })).sort((a, b) => b.amount - a.amount).slice(0, 10),
        dailyTrend: Array.from(dailyTrendMap.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-30),
        groupSummary: Array.from(groupMap.values()).map((row) => ({ amount: row.buyAmt + row.sellAmt, group: row.group, qty: row.buyQty + row.sellQty })).sort((a, b) => b.amount - a.amount),
        rangeKpi: {
          cogs,
          expenseAmount,
          gp: grossProfit,
          gpPct: salesAmount > 0 ? grossProfit / salesAmount * 100 : 0,
          netProfit: salesAmount - cogs - expenseAmount,
          purchaseAmount,
          purchaseCount: activePurchases.length,
          purchaseQty: activePurchases.reduce((sum, row) => sum + purchaseBillItemQty(row), 0),
          salesAmount,
          salesCount: activeSales.length,
          salesQty: activeSales.reduce((sum, row) => sum + itemsQty(row.items), 0),
        },
        topCustomers: Array.from(topCustomers.values()).map((row) => ({ ...row, gpPct: row.amount > 0 ? row.gp / row.amount * 100 : 0 })).sort((a, b) => b.amount - a.amount).slice(0, 10),
        topProductsIn: Array.from(productIn.values()).sort((a, b) => b.amount - a.amount).slice(0, 5),
        topProductsOut: Array.from(productOut.values()).sort((a, b) => b.amount - a.amount).slice(0, 5),
        topSuppliers: Array.from(topSuppliers.values()).sort((a, b) => b.amount - a.amount).slice(0, 10),
      },
      cashMovement: {
        accounts: Array.from(bankByAccountMap.values()).sort((a, b) => (b.cashIn + b.cashOut) - (a.cashIn + a.cashOut)),
        byType: Array.from(bankByTypeMap.values()).filter((row) => row.cashIn > 0 || row.cashOut > 0),
        cashIn: todayBankCashIn || cashIn,
        cashOut: todayBankCashOut || cashOut,
        net: (todayBankCashIn || cashIn) - (todayBankCashOut || cashOut),
      },
      expenseByCategory: Array.from(expenseCategoryMap.values()).sort((a, b) => b.amount - a.amount),
      expenseRows: todayExpenses.slice(0, 12).map((row) => ({ amount: toNumber(row.amount), category: row.expense_categories?.name ?? row.category_id ?? '-', docNo: row.doc_no, payee: row.payee ?? '-' })),
      groupBreakdown: Array.from(groupMap.values()).map((row) => ({
        buyAmt: row.buyAmt,
        buyQty: row.buyQty,
        group: row.group,
        products: Array.from(row.products.values()).sort((a, b) => (b.buyAmt + b.sellAmt) - (a.buyAmt + a.sellAmt)),
        sellAmt: row.sellAmt,
        sellQty: row.sellQty,
      })).sort((a, b) => (b.buyAmt + b.sellAmt) - (a.buyAmt + a.sellAmt)),
      purchaseBills: todayPurchases.slice(0, 12).map((row) => ({ amount: toNumber(row.total_amount), docNo: row.doc_no, name: row.suppliers?.name ?? row.supplier_id ?? '-', qty: purchaseBillItemQty(row) })),
      salesBills: todaySales.slice(0, 12).map((row) => ({ amount: toNumber(row.total_amount), docNo: row.doc_no, name: row.customers?.name ?? row.customer_id ?? '-', qty: itemsQty(row.items) })),
      summary: {
        expenseAmount: todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0),
        purchaseAmount: todayPurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0),
        purchaseQty: todayPurchases.reduce((sum, row) => sum + purchaseBillItemQty(row), 0),
        salesAmount: todaySales.reduce((sum, row) => sum + toNumber(row.total_amount), 0),
        salesQty: todaySales.reduce((sum, row) => sum + itemsQty(row.items), 0),
      },
    },
    ownerDaily: {
      actualActivity: { cashIn: todayBankCashIn || cashIn, cashOut: todayBankCashOut || cashOut, expenseOut: todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0), fgQty, fgValue, paymentOut: bankToday.filter((row) => row.ref_type === 'PMT').reduce((sum, row) => sum + toNumber(row.amount_out), 0), net: (todayBankCashIn || cashIn) - (todayBankCashOut || cashOut) },
      cashPlan: { available: cash.cash + cash.bank, expectedIn: arDueRows.reduce((sum, row) => sum + row.amount, 0), expectedOut: apDueRows.reduce((sum, row) => sum + row.amount, 0) + loanToday.reduce((sum, row) => sum + row.amount, 0) + todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0), gap: cash.cash + cash.bank + arDueRows.reduce((sum, row) => sum + row.amount, 0) - apDueRows.reduce((sum, row) => sum + row.amount, 0) - loanToday.reduce((sum, row) => sum + row.amount, 0) - todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0) },
      due: {
        ap: apDueRows.slice(0, 10),
        ar: arDueRows.slice(0, 10),
      },
      expensesToday: todayExpenses.slice(0, 10).map((row) => ({ amount: toNumber(row.amount), docNo: row.doc_no, id: row.id, payee: row.payee ?? '-', title: row.expense_categories?.name ?? row.category_id ?? '-' })),
      loanToday: loanToday.slice(0, 10),
      pending: {
        fgQty,
        fgValue,
        pendingIssueCost: pendingIssues.reduce((sum, row) => sum + toNumber(row.total_cost), 0),
        pendingIssueCount: pendingIssues.length,
        pendingIssueEst: pendingIssues.reduce((sum, row) => sum + toNumber(row.total_est_amount), 0),
        pendingIssueQty,
        pendingPurchaseCount: purchases.filter((row) => ['draft', 'pending'].includes((row.status ?? '').toLowerCase())).length,
        pendingSalesCount: sales.filter((row) => ['draft', 'pending'].includes((row.status ?? '').toLowerCase())).length,
        productionWip: production.wipQty,
        tradingMatchedTotal: 0,
        tradingPaidTotal,
        tradingPending,
        tradingPendingValue: tradingPaidTotal,
      },
    },
    production: { summary: production },
  }
}
