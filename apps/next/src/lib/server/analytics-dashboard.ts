import { toDateOnly, toNumber } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import type { AnalyticsDashboardPayload } from '@/lib/server/dashboard-report-contracts'
import type { MainDashboardFilter } from '@/lib/server/main-dashboards'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemQty, purchaseBillItemRows } from '@/lib/server/purchase-bill-items'
import { listActiveSalespersons, listProductReferences } from '@/lib/server/reference-master-cache'
import { salesBillLineFactsByBillId, salesBillLineFactTotals, type SalesBillLineFactRow } from '@/lib/server/sales-bill-line-facts'

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

export async function buildAnalyticsDashboard(filter: MainDashboardFilter): Promise<AnalyticsDashboardPayload> {
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const customer = filter.customerId ? await findActiveCustomerReferenceByCodeOrId(filter.customerId) : null
  const supplier = filter.supplierId ? await findActiveSupplierReferenceByCodeOrId(filter.supplierId) : null
  const dateLabel = toDateOnly(filter.date)
  const from = filter.dateFrom || dateLabel
  const to = filter.dateTo || dateLabel
  const rangeStart = new Date(`${from}T00:00:00.000Z`)
  const rangeEnd = new Date(`${to}T23:59:59.999Z`)
  const [purchases, sales, expenses, bankRows, products, salespersons] = await runBounded([
    () => prisma.purchase_bills.findMany({ include: { purchase_bill_items: { where: { item_status: 'active' } }, suppliers: { select: { code: true, name: true } } }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: branch?.id, supplier_id: supplier?.id, date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.sales_bills.findMany({ include: { customers: { select: { code: true, name: true } } }, orderBy: [{ date: 'desc' }, { doc_no: 'desc' }], take: 5000, where: { branch_id: branch?.id, customer_id: customer?.id || undefined, date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.expenses.findMany({ select: { amount: true, status: true }, take: 3000, where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    () => prisma.bank_statement.findMany({ select: { date: true }, orderBy: [{ date: 'asc' }], take: 10000, where: { date: { gte: rangeStart, lte: rangeEnd } } }),
    async () => (await listProductReferences()).filter((row) => row.active).map((row) => ({ code: row.code, id: row.id, metal_group: row.metalGroup, name: row.name })),
    () => listActiveSalespersons(),
  ])
  const activePurchases = purchases.filter((row) => activeStatus(row.status))
  const activeSales = sales.filter((row) => activeStatus(row.status))
  const linesByBill = await salesBillLineFactsByBillId(activeSales.map((row) => row.id))
  const productById = new Map(products.map((row) => [String(row.id), row]))
  const purchaseAmount = activePurchases.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
  const salesAmount = activeSales.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
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
  const groupSummary = new Map<string, { amount: number; group: string; qty: number }>()
  for (const bill of activePurchases) for (const item of itemRows(purchaseBillItemRows(bill))) { const group = productById.get(item.productId)?.metal_group ?? 'อื่นๆ'; const current = groupSummary.get(group) ?? { amount: 0, group, qty: 0 }; current.amount += item.amount; current.qty += item.qty; groupSummary.set(group, current) }
  for (const bill of activeSales) for (const item of salesLineRows(linesByBill.get(bill.id))) { const group = productById.get(item.productId)?.metal_group ?? 'อื่นๆ'; const current = groupSummary.get(group) ?? { amount: 0, group, qty: 0 }; current.amount += item.amount; current.qty += item.qty; groupSummary.set(group, current) }
  const dailyTrend = new Map<string, { label: string; purchase: number; sales: number }>()
  for (const row of bankRows) dailyTrend.set(toDateOnly(row.date), { label: toDateOnly(row.date), purchase: 0, sales: 0 })
  for (const bill of activePurchases) { const label = toDateOnly(bill.date); const current = dailyTrend.get(label) ?? { label, purchase: 0, sales: 0 }; current.purchase += toNumber(bill.total_amount); dailyTrend.set(label, current) }
  for (const bill of activeSales) { const label = toDateOnly(bill.date); const current = dailyTrend.get(label) ?? { label, purchase: 0, sales: 0 }; current.sales += toNumber(bill.total_amount); dailyTrend.set(label, current) }
  return {
    filters: { date: dateLabel, from, to },
    sourceState: { limitations: ['No write, approval, posting, planning save, anomaly fix, or legacy localStorage action is enabled.', 'Analytics figures are management reports, not statutory accounting reports.'], writeActionsEnabled: false },
    analytics: { bySalesperson: Array.from(bySalesperson.values()).map((row) => ({ ...row, suppliers: row.suppliers.size })).sort((a, b) => b.amount - a.amount).slice(0, 10), dailyTrend: Array.from(dailyTrend.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-30), groupSummary: Array.from(groupSummary.values()).sort((a, b) => b.amount - a.amount), rangeKpi: { cogs, expenseAmount, gp: grossProfit, gpPct: salesAmount > 0 ? grossProfit / salesAmount * 100 : 0, netProfit: salesAmount - cogs - expenseAmount, purchaseAmount, purchaseCount: activePurchases.length, purchaseQty: activePurchases.reduce((sum, row) => sum + purchaseBillItemQty(row), 0), salesAmount, salesCount: activeSales.length, salesQty: activeSales.reduce((sum, row) => sum + salesBillLineFactTotals(linesByBill.get(row.id)).qty, 0) }, topCustomers: Array.from(topCustomers.values()).map((row) => ({ ...row, gpPct: row.amount > 0 ? row.gp / row.amount * 100 : 0 })).sort((a, b) => b.amount - a.amount).slice(0, 10), topProductsIn: Array.from(productIn.values()).sort((a, b) => b.amount - a.amount).slice(0, 5), topProductsOut: Array.from(productOut.values()).sort((a, b) => b.amount - a.amount).slice(0, 5), topSuppliers: Array.from(topSuppliers.values()).sort((a, b) => b.amount - a.amount).slice(0, 10) },
  }
}
