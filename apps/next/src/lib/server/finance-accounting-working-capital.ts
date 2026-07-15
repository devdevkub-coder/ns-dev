import type { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'

const CANCELLED_STATUSES = ['cancelled', 'void', 'ยกเลิก']
const DAY_MS = 86_400_000

export type PeriodDaysFilter = {
  asOf: Date
  branchId?: string
  periodDays: number
}

export type ProfitLeakFilter = {
  branchId?: string
  from: Date
  targetMargin: number
  to: Date
}

type JsonRecord = Record<string, unknown>

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

function daysBetween(left: Date, right: Date) {
  return Math.max(1, Math.floor((left.getTime() - right.getTime()) / DAY_MS) + 1)
}

function notCancelledWhere() {
  return { NOT: { status: { in: CANCELLED_STATUSES } } }
}

function branchWhere(branchId?: bigint | null) {
  return branchId ? { branch_id: branchId } : {}
}

function sourceState(extra: string[] = []) {
  return {
    basis: 'Working-capital/profit-leak source from operational transactions. Not a GL close or statutory report.',
    limitations: [
      'Inventory value uses stock_ledger movement value as WAC-style operational source.',
      'Profit leak flags use sales/purchase item JSON where available and header totals as fallback.',
      'No financing, reclass, stock adjustment, production loss posting, payment, receipt, or GL write is enabled.',
      ...extra,
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
  return branches.map((branch) => {
    const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
    return { code, id: code, name: branch.name }
  })
}

async function cashAsOf(asOf: Date, branchId?: bigint | null) {
  const [accounts, bankRows] = await Promise.all([
    prisma.accounts.findMany({ select: { id: true, opening_balance: true }, where: { active: true, ...branchWhere(branchId) } }),
    prisma.bank_statement.findMany({
      orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 30000,
      where: { date: { lte: endOfDay(asOf) }, ...(branchId ? { accounts: { branch_id: branchId } } : {}) },
    }),
  ])
  const balances = new Map<bigint, number>()
  accounts.forEach((account) => balances.set(account.id, toNumber(account.opening_balance)))
  bankRows.forEach((row) => {
    if (!row.account_id) return
    const previous = balances.get(row.account_id) ?? 0
    balances.set(row.account_id, row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance))
  })
  return Array.from(balances.values()).reduce((sum, value) => sum + value, 0)
}

function jsonRows(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function jsonNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '')) : 0
    if (Number.isFinite(numeric) && numeric !== 0) return numeric
  }
  return 0
}

function jsonString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

async function stockSnapshot(asOf: Date, branchId?: bigint | null) {
  const rows = await prisma.stock_ledger.findMany({
    include: { products: { select: { code: true, metal_group: true, name: true, std_price: true } } },
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    take: 50000,
    where: { ...branchWhere(branchId), date: { lte: endOfDay(asOf) } },
  })
  const byProduct = new Map<string, { ageDays: number; code: string; daysSinceSale: number; id: string; metalGroup: string; name: string; qty: number; status: string; stdPrice: number; value: number }>()
  let paidValue = 0
  let unpaidValue = 0
  rows.forEach((row) => {
    const productId = row.product_id == null ? 'UNKNOWN' : String(row.product_id)
    const current = byProduct.get(productId) ?? {
      ageDays: 0,
      code: row.products?.code ?? '',
      daysSinceSale: 9999,
      id: row.products?.code ?? '',
      metalGroup: row.products?.metal_group ?? '-',
      name: row.products?.name ?? '-',
      qty: 0,
      status: row.output_category ?? 'OTHER',
      stdPrice: toNumber(row.products?.std_price),
      value: 0,
    }
    current.qty += toNumber(row.qty_in) - toNumber(row.qty_out)
    const netValue = toNumber(row.value_in) - toNumber(row.value_out)
    current.value += netValue
    if (row.paid) paidValue += netValue
    else unpaidValue += netValue
    if (toNumber(row.qty_in) > 0) current.ageDays = Math.max(current.ageDays, Math.max(0, Math.floor((asOf.getTime() - row.date.getTime()) / DAY_MS)))
    if (toNumber(row.qty_out) > 0) current.daysSinceSale = Math.min(current.daysSinceSale, Math.max(0, Math.floor((asOf.getTime() - row.date.getTime()) / DAY_MS)))
    byProduct.set(productId, current)
  })
  const products = Array.from(byProduct.values()).filter((row) => Math.abs(row.qty) > 0.001 || Math.abs(row.value) > 0.01)
  return {
    paidValue: Math.max(0, paidValue),
    products,
    totalQty: products.reduce((sum, row) => sum + row.qty, 0),
    totalValue: products.reduce((sum, row) => sum + row.value, 0),
    unpaidValue: Math.max(0, unpaidValue),
  }
}

async function workingInputs(filter: PeriodDaysFilter) {
  const branchRef = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const from = addDays(filter.asOf, -filter.periodDays + 1)
  const to = endOfDay(filter.asOf)
  const branch = branchWhere(branchRef?.id ?? null)
  return Promise.all([
    prisma.sales_bills.findMany({ include: { customers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.purchase_bills.findMany({ include: { suppliers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.sales_bills.findMany({ include: { customers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { lte: to } } }),
    prisma.purchase_bills.findMany({ include: { suppliers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { lte: to } } }),
    prisma.loan_schedules.findMany({ take: 10000, where: { due_date: { gte: filter.asOf, lte: addDays(filter.asOf, 365) }, payment_status: { not: 'Paid' } } }),
    stockSnapshot(filter.asOf, branchRef?.id ?? null),
    cashAsOf(filter.asOf, branchRef?.id ?? null),
    listBranches(),
  ])
}

export async function buildWorkingCapital(filter: PeriodDaysFilter) {
  const [sales, purchases, salesAsOf, purchasesAsOf, schedules, stock, cash, branches] = await workingInputs(filter)
  const revenue = sales.reduce((sum, bill) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const cogs = sales.reduce((sum, bill) => sum + (toNumber(bill.cogs_amount) || toNumber(bill.total_cost)), 0)
  const purchaseTotal = purchases.reduce((sum, bill) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const ar = salesAsOf.reduce((sum, bill) => sum + Math.max(0, toNumber(bill.receivable_balance) || toNumber(bill.total_amount) - toNumber(bill.received_amount)), 0)
  const ap = purchasesAsOf.reduce((sum, bill) => sum + Math.max(0, toNumber(bill.payable_balance) || toNumber(bill.total_amount) - toNumber(bill.paid_amount)), 0)
  const currentLoan = schedules.reduce((sum, row) => sum + Math.max(0, toNumber(row.principal_amount) - toNumber(row.paid_amount)), 0)
  const dailyRevenue = revenue / Math.max(1, filter.periodDays)
  const dailyCogs = cogs / Math.max(1, filter.periodDays)
  const dailyPurchases = purchaseTotal / Math.max(1, filter.periodDays)
  const arDays = dailyRevenue > 0 ? ar / dailyRevenue : 0
  const invDays = dailyCogs > 0 ? stock.totalValue / dailyCogs : 0
  const apDays = dailyPurchases > 0 ? ap / dailyPurchases : 0
  const ccc = arDays + invDays - apDays
  const currentAssets = cash + ar + stock.totalValue
  const currentLiab = ap + currentLoan
  const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0
  const quickRatio = currentLiab > 0 ? (cash + ar) / currentLiab : 0
  const stockTurnover = stock.totalValue > 0 ? cogs / stock.totalValue : 0
  const annualizedTurnover = stockTurnover * (365 / Math.max(1, filter.periodDays))

  return {
    branches,
    calculationRows: [
      { label: `Revenue (${filter.periodDays} วัน)`, value: revenue },
      { label: `COGS (${filter.periodDays} วัน)`, value: cogs },
      { label: `Purchases (${filter.periodDays} วัน)`, value: purchaseTotal },
      { label: 'AR คงเหลือ', tone: 'blue', value: ar },
      { label: 'AP คงเหลือ', tone: 'emerald', value: ap },
      { label: 'Inventory (WAC)', tone: 'amber', value: stock.totalValue },
      { label: 'Cash & Bank', value: cash },
      { label: 'Current Loan (12m)', value: currentLoan },
      { label: 'Current Assets', tone: 'purple', value: currentAssets },
      { label: 'Current Liabilities', tone: 'purple', value: currentLiab },
    ],
    filters: { asOf: dateOnly(filter.asOf), branchId: filter.branchId ?? 'ALL', from: dateOnly(addDays(filter.asOf, -filter.periodDays + 1)), periodDays: filter.periodDays },
    sourceState: sourceState(),
    summary: { annualizedTurnover, ap, apDays, ar, arDays, cash, ccc, cogs, currentAssets, currentLiab, currentLoan, currentRatio, inv: stock.totalValue, invDays, purchases: purchaseTotal, quickRatio, revenue, stockTurnover },
  }
}

export async function buildStockFinance(filter: PeriodDaysFilter) {
  const branchRef = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const stock = await stockSnapshot(filter.asOf, branchRef?.id ?? null)
  const branches = await listBranches()
  const totalValue = Math.max(0, stock.totalValue)
  const byStatus = stock.products.reduce<Record<string, number>>((acc, row) => {
    const key = ['RM', 'WIP', 'FG'].includes(row.status) ? row.status : 'OTHER'
    acc[key] = (acc[key] ?? 0) + row.value
    return acc
  }, { FG: 0, OTHER: 0, RM: 0, WIP: 0 })
  const aging = [
    { count: 0, key: '0-30', value: 0 },
    { count: 0, key: '31-60', value: 0 },
    { count: 0, key: '61-90', value: 0 },
    { count: 0, key: '90+', value: 0 },
  ]
  stock.products.forEach((row) => {
    const bucket = row.ageDays <= 30 ? aging[0] : row.ageDays <= 60 ? aging[1] : row.ageDays <= 90 ? aging[2] : aging[3]
    bucket.count += 1
    bucket.value += row.value
  })
  const productRows = stock.products.map((row) => ({
    ...row,
    marginPotential: (row.stdPrice - (row.qty > 0 ? row.value / row.qty : 0)) * row.qty,
    wac: row.qty > 0 ? row.value / row.qty : 0,
  }))
  const productsByValue = [...productRows].sort((left, right) => right.value - left.value)
  return {
    aging,
    branches,
    byStatus,
    filters: { asOf: dateOnly(filter.asOf), branchId: filter.branchId ?? 'ALL' },
    products: productsByValue,
    slowMoving: productsByValue.filter((row) => row.daysSinceSale > 60).slice(0, 15),
    sourceState: sourceState(['Paid/unpaid stock is approximated from current positive stock value until bill-level settlement linkage is finalized.']),
    summary: {
      itemCount: productRows.length,
      marginPotential: productRows.reduce((sum, row) => sum + row.marginPotential, 0),
      paidValue: stock.paidValue,
      totalQty: stock.totalQty,
      totalValue,
      unpaidValue: stock.unpaidValue,
    },
    topProducts: productsByValue.slice(0, 10),
  }
}

async function profitInputs(filter: ProfitLeakFilter) {
  const branchRef = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const branch = branchWhere(branchRef?.id ?? null)
  const date = { gte: filter.from, lte: endOfDay(filter.to) }
  return Promise.all([
    prisma.sales_bills.findMany({ include: { customers: { select: { code: true, name: true } } }, orderBy: [{ date: 'asc' }, { doc_no: 'asc' }], take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: { select: { code: true, name: true } } }, orderBy: [{ date: 'asc' }, { doc_no: 'asc' }], take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.expenses.findMany({ include: { expense_categories: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { doc_no: 'asc' }], take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.loan_payments.findMany({ take: 10000, where: { ...notCancelledWhere(), date } }),
    prisma.stock_ledger.findMany({ take: 30000, where: { ...branch, date, movement_type: { contains: 'LOSS', mode: 'insensitive' } } }),
    prisma.production_outputs.findMany({ take: 10000, where: { date, output_type: { in: ['Loss', 'Waste', 'LOSS', 'WASTE'] } } }),
    prisma.fx_gain_loss.findMany({ take: 10000, where: { date } }),
    prisma.payments.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.receipts.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    listBranches(),
  ])
}

export async function buildProfitLeak(filter: ProfitLeakFilter) {
  const [sales, purchases, expenses, loanPayments, stockLossRows, productionLossRows, fxRows, payments, receipts, branches] = await profitInputs(filter)
  const negMarginItems = sales.flatMap((bill) => jsonRows(bill.items).map((item, index) => {
    const qty = jsonNumber(item.netWeight, item.weight, item.qty)
    const price = jsonNumber(item.price, item.unitPrice, item.unit_price)
    const cost = jsonNumber(item.unitCost, item.unit_cost, item.cost)
    const profit = jsonNumber(item.profit, (price - cost) * qty)
    return {
      customer: bill.customers?.name ?? '-',
      date: dateOnly(bill.date),
      docNo: bill.doc_no,
      id: `${bill.doc_no}-${index + 1}`,
      loss: Math.max(0, -profit || (cost > price ? (cost - price) * qty : 0)),
      price,
      productName: jsonString(item.productName, item.name) || '-',
      qty,
      unitCost: cost,
    }
  })).filter((row) => row.loss > 0)
  const lowMarginBills = sales.map((bill) => {
    const revenue = toNumber(bill.total_amount)
    const cost = toNumber(bill.cogs_amount) || toNumber(bill.total_cost)
    const gp = revenue - cost
    const gpPct = revenue > 0 ? gp / revenue * 100 : 0
    return { customer: bill.customers?.name ?? '-', docNo: bill.doc_no, gpPct, id: bill.doc_no, revenue, shortfall: Math.max(0, filter.targetMargin / 100 * revenue - gp) }
  }).filter((row) => row.revenue > 0 && row.gpPct < filter.targetMargin).sort((left, right) => right.shortfall - left.shortfall).slice(0, 15)
  const expenseByCategory = new Map<string, { amount: number; date: string; docNo: string; id: string; payee: string }[]>()
  expenses.forEach((expense) => {
    const key = expense.expense_categories?.name ?? 'OTHER'
    const rows = expenseByCategory.get(key) ?? []
    rows.push({ amount: toNumber(expense.net_amount) || toNumber(expense.amount), date: dateOnly(expense.date), docNo: expense.doc_no, id: expense.doc_no, payee: expense.payee ?? '-' })
    expenseByCategory.set(key, rows)
  })
  const outliers = Array.from(expenseByCategory.entries()).flatMap(([category, rows]) => {
    if (rows.length < 3) return []
    const mean = rows.reduce((sum, row) => sum + row.amount, 0) / rows.length
    const std = Math.sqrt(rows.reduce((sum, row) => sum + (row.amount - mean) ** 2, 0) / rows.length)
    const threshold = mean + 1.5 * std
    return rows.filter((row) => row.amount > threshold).map((row) => ({ ...row, category, mean, over: row.amount - mean, threshold }))
  }).sort((left, right) => right.over - left.over)
  const interestExpense = loanPayments.reduce((sum, row) => sum + toNumber(row.interest_amount), 0)
  const stockLoss = stockLossRows.reduce((sum, row) => sum + toNumber(row.value_out), 0)
  const productionLoss = productionLossRows.reduce((sum, row) => sum + toNumber(row.total_cost), 0)
  const fxLoss = fxRows.reduce((sum, row) => sum + Math.min(0, toNumber(row.gain_loss)), 0)
  const bankFee = payments.reduce((sum, row) => sum + toNumber(row.bank_fee) + toNumber(row.fee), 0) + receipts.reduce((sum, row) => sum + toNumber(row.bank_fee), 0)
  const customerMargins = new Map<string, { cost: number; name: string; revenue: number }>()
  sales.forEach((bill) => {
    const key = bill.customers?.code ? requireBusinessCode(bill.customers.code, `ลูกค้าบิลขาย ${bill.id}`) : 'UNKNOWN'
    const current = customerMargins.get(key) ?? { cost: 0, name: bill.customers?.name ?? '-', revenue: 0 }
    current.revenue += toNumber(bill.total_amount)
    current.cost += toNumber(bill.cogs_amount) || toNumber(bill.total_cost)
    customerMargins.set(key, current)
  })
  const lowCustomers = Array.from(customerMargins.entries()).map(([id, row]) => ({ id, gpPct: row.revenue > 0 ? (row.revenue - row.cost) / row.revenue * 100 : 0, name: row.name, revenue: row.revenue }))
    .filter((row) => row.revenue > 0 && row.gpPct < filter.targetMargin).sort((left, right) => left.gpPct - right.gpPct).slice(0, 10)
  const supplierCost = new Map<string, { productName: string; qty: number; supplierName: string; value: number }>()
  purchases.forEach((bill) => purchaseBillItemRows(bill).forEach((item) => {
    const productId = jsonString(item.productCode, item.code, item.productName, item.name) || 'UNKNOWN'
    const supplierCode = bill.suppliers?.code ? requireBusinessCode(bill.suppliers.code, `ผู้ขายบิลซื้อ ${bill.id}`) : 'UNKNOWN'
    const key = `${supplierCode}|${productId}`
    const current = supplierCost.get(key) ?? { productName: jsonString(item.productName, item.name) || '-', qty: 0, supplierName: bill.suppliers?.name ?? '-', value: 0 }
    current.qty += jsonNumber(item.netWeight, item.weight, item.qty)
    current.value += jsonNumber(item.netAmount, item.amount, item.total)
    supplierCost.set(key, current)
  }))
  const productAvg = new Map<string, { qty: number; value: number }>()
  supplierCost.forEach((row, key) => {
    const productId = key.split('|')[1]
    const current = productAvg.get(productId) ?? { qty: 0, value: 0 }
    current.qty += row.qty
    current.value += row.value
    productAvg.set(productId, current)
  })
  const highSuppliers = Array.from(supplierCost.entries()).map(([key, row]) => {
    const avg = productAvg.get(key.split('|')[1])
    const myAvg = row.qty > 0 ? row.value / row.qty : 0
    const allAvg = avg && avg.qty > 0 ? avg.value / avg.qty : 0
    return { id: key, premium: myAvg - allAvg, premiumPct: allAvg > 0 ? (myAvg - allAvg) / allAvg * 100 : 0, productName: row.productName, qty: row.qty, supplierName: row.supplierName }
  }).filter((row) => row.premium > 0 && row.qty > 0).sort((left, right) => right.premium * right.qty - left.premium * left.qty).slice(0, 10)
  const negTotal = negMarginItems.reduce((sum, row) => sum + row.loss, 0)
  const totalLeak = negTotal + interestExpense + stockLoss + productionLoss + Math.abs(fxLoss) + bankFee
  return {
    branches,
    filters: { branchId: filter.branchId ?? 'ALL', from: dateOnly(filter.from), targetMargin: filter.targetMargin, to: dateOnly(filter.to) },
    highSuppliers,
    leakSegments: [
      { label: 'ขายต่ำกว่าทุน', value: negTotal },
      { label: 'ดอกเบี้ย', value: interestExpense },
      { label: 'ขาดทุนสต็อก', value: stockLoss },
      { label: 'ขาดทุนการผลิต', value: productionLoss },
      { label: 'ขาดทุนอัตราแลกเปลี่ยน', value: Math.abs(fxLoss) },
      { label: 'ค่าธรรมเนียมธนาคาร', value: bankFee },
    ].filter((row) => row.value > 0),
    lowCustomers,
    lowMarginBills,
    negMarginItems,
    outliers,
    sourceState: sourceState(),
    summary: { bankFee, fxLoss, interestExpense, negTotal, outlierCount: outliers.length, productionLoss, stockLoss, totalLeak },
  }
}
