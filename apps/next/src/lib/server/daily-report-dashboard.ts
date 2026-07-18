import { toDateOnly, toNumber } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import type { DailyReportPayload } from '@/lib/server/dashboard-report-contracts'
import type { MainDashboardFilter } from '@/lib/server/main-dashboards'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemQty, purchaseBillItemRows } from '@/lib/server/purchase-bill-items'
import { listActiveSalespersons, listProductReferences } from '@/lib/server/reference-master-cache'
import { salesBillLineFactsByBillId, salesBillLineFactTotals, type SalesBillLineFactRow } from '@/lib/server/sales-bill-line-facts'

function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
function endOfDay(date: Date) { const value = new Date(date); value.setHours(23, 59, 59, 999); return value }
function activeStatus(status?: string | null) { return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase()) }
function itemRows(items: unknown) {
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const productId = String(row.productId ?? row.product_id ?? '')
    const qtyValue = row.netWeight ?? row.weight ?? row.qty ?? row.quantity
    const qty = typeof qtyValue === 'number' ? qtyValue : Number(qtyValue || 0)
    const priceValue = row.price ?? row.unitPrice ?? row.unit_price
    const amountValue = row.amount ?? row.total ?? row.totalAmount
    const price = typeof priceValue === 'number' ? priceValue : Number(priceValue || 0)
    const amount = typeof amountValue === 'number' ? amountValue : Number(amountValue || 0) || qty * price
    return [{ amount, productId, qty }]
  })
}
function salesLineRows(lines: SalesBillLineFactRow[] | undefined) { return (lines ?? []).map((line) => ({ amount: line.lineAmount, productId: line.productId == null ? '' : String(line.productId), qty: line.qty })) }

async function runBounded<const T extends readonly (() => Promise<unknown>)[]>(tasks: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results = new Array<unknown>(tasks.length)
  let next = 0
  const worker = async () => { while (next < tasks.length) { const index = next; next += 1; results[index] = await tasks[index]() } }
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, () => worker()))
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> }
}

export async function buildDailyReportDashboard(filter: MainDashboardFilter): Promise<DailyReportPayload> {
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const customer = filter.customerId ? await findActiveCustomerReferenceByCodeOrId(filter.customerId) : null
  const supplier = filter.supplierId ? await findActiveSupplierReferenceByCodeOrId(filter.supplierId) : null
  const selectedDate = filter.date
  const dateLabel = toDateOnly(selectedDate)
  const from = filter.dateFrom || dateLabel
  const to = filter.dateTo || dateLabel
  const rangeStart = new Date(`${from}T00:00:00.000Z`)
  const rangeEnd = new Date(`${to}T23:59:59.999Z`)
  const todayStart = startOfDay(selectedDate)
  const todayEnd = endOfDay(selectedDate)
  const [purchases, sales, expenses, bankRows, payments, receipts, products, salespersons] = await runBounded([
    () => prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: { select: { code: true, name: true } } }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: branch?.id, supplier_id: supplier?.id, date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.sales_bills.findMany({ include: { customers: { select: { code: true, name: true } } }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: branch?.id, customer_id: customer?.id || undefined, date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.expenses.findMany({ include: { expense_categories: { select: { name: true } } }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 3000, where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.bank_statement.findMany({ include: { accounts: { select: { name: true, type: true } } }, orderBy: [{ date: 'asc' }], take: 10000, where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.payments.findMany({ select: { amount: true, net_amount: true }, orderBy: [{ date: 'desc' }], take: 3000, where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.receipts.findMany({ select: { amount: true, net_amount: true }, orderBy: [{ date: 'desc' }], take: 3000, where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    async () => (await listProductReferences()).filter((row) => row.active).map((row) => ({ code: row.code, id: row.id, metal_group: row.metalGroup, name: row.name })),
    () => listActiveSalespersons(),
  ])
  const productById = new Map(products.map((row) => [String(row.id), row]))
  const activePurchases = purchases.filter((row) => activeStatus(row.status))
  const activeSales = sales.filter((row) => activeStatus(row.status))
  const linesByBill = await salesBillLineFactsByBillId(activeSales.map((row) => row.id))
  const todayPurchases = activePurchases.filter((row) => row.date >= todayStart && row.date <= todayEnd)
  const todaySales = activeSales.filter((row) => row.date >= todayStart && row.date <= todayEnd)
  const todayExpenses = expenses.filter((row) => row.date >= todayStart && row.date <= todayEnd && activeStatus(row.status))
  const todayBank = bankRows.filter((row) => row.date >= todayStart && row.date <= todayEnd)
  const salesAmount = activeSales.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const purchaseAmount = activePurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const cogs = activeSales.reduce((sum, row) => sum + toNumber(row.cogs_amount || row.total_cost), 0)
  const expenseAmount = expenses.filter((row) => activeStatus(row.status)).reduce((sum, row) => sum + toNumber(row.amount), 0)
  const grossProfit = activeSales.reduce((sum, row) => sum + (toNumber(row.gross_profit) || toNumber(row.total_amount) - toNumber(row.cogs_amount || row.total_cost)), 0)
  const productIn = new Map<string, { amount: number; code: string; group: string; id: string; name: string; qty: number }>()
  const productOut = new Map<string, { amount: number; code: string; group: string; id: string; name: string; qty: number }>()
  for (const bill of activePurchases) for (const item of itemRows(purchaseBillItemRows(bill))) { const product = productById.get(item.productId); const current = productIn.get(item.productId) ?? { amount: 0, code: product?.code ?? '', group: product?.metal_group ?? 'อื่นๆ', id: product?.code ?? '', name: product?.name ?? '-', qty: 0 }; current.amount += item.amount; current.qty += item.qty; productIn.set(item.productId, current) }
  for (const bill of activeSales) for (const item of salesLineRows(linesByBill.get(bill.id))) { const product = productById.get(item.productId); const current = productOut.get(item.productId) ?? { amount: 0, code: product?.code ?? '', group: product?.metal_group ?? 'อื่นๆ', id: product?.code ?? '', name: product?.name ?? '-', qty: 0 }; current.amount += item.amount; current.qty += item.qty; productOut.set(item.productId, current) }
  const topSuppliers = new Map<string, { amount: number; bills: number; id: string; name: string; qty: number }>()
  for (const bill of activePurchases) { const key = bill.suppliers?.code ?? bill.suppliers?.name ?? ''; const current = topSuppliers.get(key) ?? { amount: 0, bills: 0, id: bill.suppliers?.code ?? '', name: bill.suppliers?.name ?? '-', qty: 0 }; current.amount += toNumber(bill.total_amount); current.qty += purchaseBillItemQty(bill); current.bills += 1; topSuppliers.set(key, current) }
  const topCustomers = new Map<string, { amount: number; bills: number; gp: number; id: string; name: string; qty: number }>()
  for (const bill of activeSales) { const key = bill.customers?.code ?? bill.customers?.name ?? ''; const current = topCustomers.get(key) ?? { amount: 0, bills: 0, gp: 0, id: bill.customers?.code ?? '', name: bill.customers?.name ?? '-', qty: 0 }; current.amount += toNumber(bill.total_amount); current.gp += toNumber(bill.gross_profit); current.qty += salesBillLineFactTotals(linesByBill.get(bill.id)).qty; current.bills += 1; topCustomers.set(key, current) }
  const salespersonById = new Map(salespersons.map((row) => [row.id, row]))
  const bySalesperson = new Map<string, { amount: number; bills: number; id: string; name: string; qty: number; suppliers: Set<string> }>()
  for (const bill of activePurchases) { const person = bill.sales_id == null ? null : salespersonById.get(bill.sales_id); const key = person?.code ?? '__no_sales__'; const current = bySalesperson.get(key) ?? { amount: 0, bills: 0, id: person?.code ?? '', name: person?.name ?? '(ไม่ระบุเซล)', qty: 0, suppliers: new Set<string>() }; if (bill.suppliers?.code) current.suppliers.add(bill.suppliers.code); current.amount += toNumber(bill.total_amount); current.qty += purchaseBillItemQty(bill); current.bills += 1; bySalesperson.set(key, current) }
  const groupMap = new Map<string, { buyAmt: number; buyQty: number; group: string; products: Map<string, { buyAmt: number; buyQty: number; productCode: string; productId: string; productName: string; sellAmt: number; sellQty: number }>; sellAmt: number; sellQty: number }>()
  const getGroup = (group: string) => { const value = groupMap.get(group) ?? { buyAmt: 0, buyQty: 0, group, products: new Map(), sellAmt: 0, sellQty: 0 }; groupMap.set(group, value); return value }
  for (const bill of todayPurchases) for (const item of itemRows(purchaseBillItemRows(bill))) { const product = productById.get(item.productId); const group = getGroup(product?.metal_group ?? 'อื่นๆ'); const row = group.products.get(item.productId) ?? { buyAmt: 0, buyQty: 0, productCode: product?.code ?? '', productId: product?.code ?? '', productName: product?.name ?? '-', sellAmt: 0, sellQty: 0 }; group.products.set(item.productId, row); group.buyAmt += item.amount; group.buyQty += item.qty; row.buyAmt += item.amount; row.buyQty += item.qty }
  for (const bill of todaySales) for (const item of salesLineRows(linesByBill.get(bill.id))) { const product = productById.get(item.productId); const group = getGroup(product?.metal_group ?? 'อื่นๆ'); const row = group.products.get(item.productId) ?? { buyAmt: 0, buyQty: 0, productCode: product?.code ?? '', productId: product?.code ?? '', productName: product?.name ?? '-', sellAmt: 0, sellQty: 0 }; group.products.set(item.productId, row); group.sellAmt += item.amount; group.sellQty += item.qty; row.sellAmt += item.amount; row.sellQty += item.qty }
  const dailyTrend = new Map<string, { label: string; purchase: number; sales: number }>()
  for (const row of bankRows) dailyTrend.set(toDateOnly(row.date), { label: toDateOnly(row.date), purchase: 0, sales: 0 })
  for (const bill of activePurchases) { const label = toDateOnly(bill.date); const row = dailyTrend.get(label) ?? { label, purchase: 0, sales: 0 }; row.purchase += toNumber(bill.total_amount); dailyTrend.set(label, row) }
  for (const bill of activeSales) { const label = toDateOnly(bill.date); const row = dailyTrend.get(label) ?? { label, purchase: 0, sales: 0 }; row.sales += toNumber(bill.total_amount); dailyTrend.set(label, row) }
  const expenseByCategory = new Map<string, { amount: number; count: number; name: string }>()
  for (const row of todayExpenses) { const key = row.expense_categories?.name ?? 'ไม่ระบุ'; const current = expenseByCategory.get(key) ?? { amount: 0, count: 0, name: key }; current.amount += toNumber(row.amount); current.count += 1; expenseByCategory.set(key, current) }
  const cashIn = todayBank.reduce((sum, row) => sum + toNumber(row.amount_in), 0) || receipts.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0)
  const cashOut = todayBank.reduce((sum, row) => sum + toNumber(row.amount_out), 0) || payments.reduce((sum, row) => sum + toNumber(row.net_amount || row.amount), 0) + todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0)
  const bankByType = new Map<string, { cashIn: number; cashOut: number; label: string }>()
  const bankByAccount = new Map<string, { cashIn: number; cashOut: number; name: string; type: string }>()
  const typeLabel = (value?: string | null) => value === 'PMT' ? 'จ่ายเงิน Supplier' : value === 'RCP' ? 'รับเงินลูกค้า' : value === 'EXP' ? 'ค่าใช้จ่าย' : value === 'TRF' ? 'โอนระหว่างบัญชี' : value || 'อื่นๆ'
  for (const row of todayBank) { const typeKey = row.ref_type ?? row.type ?? 'OTHER'; const type = bankByType.get(typeKey) ?? { cashIn: 0, cashOut: 0, label: typeLabel(typeKey) }; type.cashIn += toNumber(row.amount_in); type.cashOut += toNumber(row.amount_out); bankByType.set(typeKey, type); const accountKey = row.account_id == null ? 'unknown' : String(row.account_id); const account = bankByAccount.get(accountKey) ?? { cashIn: 0, cashOut: 0, name: row.accounts?.name ?? '-', type: row.accounts?.type ?? '-' }; account.cashIn += toNumber(row.amount_in); account.cashOut += toNumber(row.amount_out); bankByAccount.set(accountKey, account) }
  const groupBreakdown = Array.from(groupMap.values()).map((row) => ({ buyAmt: row.buyAmt, buyQty: row.buyQty, group: row.group, products: Array.from(row.products.values()).sort((a, b) => b.buyAmt + b.sellAmt - a.buyAmt - a.sellAmt), sellAmt: row.sellAmt, sellQty: row.sellQty })).sort((a, b) => b.buyAmt + b.sellAmt - a.buyAmt - a.sellAmt)
  return {
    filters: { date: dateLabel, from, to },
    sourceState: { limitations: ['No write, approval, posting, planning save, anomaly fix, or legacy localStorage action is enabled.', 'Daily report figures are management reports, not statutory accounting reports.'], writeActionsEnabled: false },
    dailyReport: {
      analytics: { bySalesperson: Array.from(bySalesperson.values()).map((row) => ({ ...row, suppliers: row.suppliers.size })).sort((a, b) => b.amount - a.amount).slice(0, 10), dailyTrend: Array.from(dailyTrend.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-30), groupSummary: groupBreakdown.map((row) => ({ amount: row.buyAmt + row.sellAmt, group: row.group, qty: row.buyQty + row.sellQty })), rangeKpi: { cogs, expenseAmount, gp: grossProfit, gpPct: salesAmount > 0 ? grossProfit / salesAmount * 100 : 0, netProfit: salesAmount - cogs - expenseAmount, purchaseAmount, purchaseCount: activePurchases.length, purchaseQty: activePurchases.reduce((sum, row) => sum + purchaseBillItemQty(row), 0), salesAmount, salesCount: activeSales.length, salesQty: activeSales.reduce((sum, row) => sum + salesBillLineFactTotals(linesByBill.get(row.id)).qty, 0) }, topCustomers: Array.from(topCustomers.values()).map((row) => ({ ...row, gpPct: row.amount > 0 ? row.gp / row.amount * 100 : 0 })).sort((a, b) => b.amount - a.amount).slice(0, 10), topProductsIn: Array.from(productIn.values()).sort((a, b) => b.amount - a.amount).slice(0, 5), topProductsOut: Array.from(productOut.values()).sort((a, b) => b.amount - a.amount).slice(0, 5), topSuppliers: Array.from(topSuppliers.values()).sort((a, b) => b.amount - a.amount).slice(0, 10) },
      cashMovement: { accounts: Array.from(bankByAccount.values()).sort((a, b) => b.cashIn + b.cashOut - a.cashIn - a.cashOut), byType: Array.from(bankByType.values()).filter((row) => row.cashIn > 0 || row.cashOut > 0), cashIn, cashOut, net: cashIn - cashOut },
      expenseByCategory: Array.from(expenseByCategory.values()).sort((a, b) => b.amount - a.amount), expenseRows: todayExpenses.slice(0, 12).map((row) => ({ amount: toNumber(row.amount), category: row.expense_categories?.name ?? '-', docNo: row.doc_no, payee: row.payee ?? '-' })), groupBreakdown, purchaseBills: todayPurchases.slice(0, 12).map((row) => ({ amount: toNumber(row.total_amount), docNo: row.doc_no, name: row.suppliers?.name ?? '-', qty: purchaseBillItemQty(row) })), salesBills: todaySales.slice(0, 12).map((row) => ({ amount: toNumber(row.total_amount), docNo: row.doc_no, name: row.customers?.name ?? '-', qty: salesBillLineFactTotals(linesByBill.get(row.id)).qty })), summary: { expenseAmount: todayExpenses.reduce((sum, row) => sum + toNumber(row.amount), 0), purchaseAmount: todayPurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0), purchaseQty: todayPurchases.reduce((sum, row) => sum + purchaseBillItemQty(row), 0), salesAmount: todaySales.reduce((sum, row) => sum + toNumber(row.total_amount), 0), salesQty: todaySales.reduce((sum, row) => sum + salesBillLineFactTotals(linesByBill.get(row.id)).qty, 0) },
    },
  }
}
