import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

type JsonItem = Record<string, unknown>
type ProductRef = { code: string; id: bigint; metal_group: string | null; name: string }

export type WaitingAllocationRow = {
  allocatedQty: number
  allocationStatus: 'partially_allocated' | 'pending_allocation'
  branchName: string
  customerName: string
  date: string
  docNo: string
  id: string
  itemId: string
  metalGroup: string
  productId: string
  productName: string
  qty: number
  remainingQty: number
  revenuePending: number
  salesBillId: string
  unitPrice: number
}

export type CostAllocationLedgerRow = {
  allocatedAt: string
  allocatedBy: string
  allocatedQty: number
  allocatedRevenue: number
  costPerKg: number
  costPoolNo: string
  date: string
  gpPct: number
  grossProfit: number
  id: string
  matchId: string
  productCategory: string
  productId: string
  productName: string
  saleDocNo: string
  saleQty: number
  sourceNo: string
  status: 'approved' | 'reversed'
  targetType: 'PO_SELL' | 'SPOT_SELL'
  totalCost: number
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return toNumber(value as { toNumber: () => number })
  }
  return 0
}

function jsonString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function isJsonItem(value: unknown): value is JsonItem {
  return typeof value === 'object' && value !== null
}

function itemProductCode(item: JsonItem, productById: Map<string, ProductRef>) {
  const direct = jsonString(item.productCode, item.code, item.productId)
  if (direct) {
    if (/^\d+$/.test(direct)) return productById.get(direct)?.code ?? ''
    return direct
  }
  const rawInternal = item.product_id ?? item.id
  if (typeof rawInternal === 'number' || typeof rawInternal === 'bigint') {
    return productById.get(String(rawInternal))?.code ?? ''
  }
  return ''
}

function itemProductName(item: JsonItem, productById: Map<string, ProductRef>) {
  const direct = jsonString(item.productName, item.displayName, item.name)
  if (direct) return direct
  const code = itemProductCode(item, productById)
  if (!code) return '-'
  for (const product of productById.values()) {
    if (product.code === code) return product.name
  }
  return '-'
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.qty ?? item.quantity ?? item.weight ?? item.netWeight ?? item.net_weight)
}

function itemAmount(item: JsonItem) {
  return jsonNumber(item.netAmount ?? item.totalAmount ?? item.amount ?? item.lineTotal ?? item.total)
}

function itemUnitPrice(item: JsonItem) {
  const qty = itemQty(item)
  return jsonNumber(item.unitPrice ?? item.price ?? item.unit_price) || (qty > 0 ? itemAmount(item) / qty : 0)
}

function isCancelled(status?: string | null) {
  return ['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function isDualCostingGroup(group?: string | null) {
  const normalized = (group ?? '').toLowerCase()
  return ['ทองแดง', 'ทองเหลือง', 'copper', 'brass'].some((key) => normalized.includes(key))
}

function pct(grossProfit: number, revenue: number) {
  return revenue > 0 ? (grossProfit / revenue) * 100 : 0
}

export async function buildDualCostingManagement() {
  const [salesBills, tradingDeals, products] = await Promise.all([
    prisma.sales_bills.findMany({
      include: { branches: true, customers: true },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 10000,
      where: { NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
    }),
    prisma.trading_deals.findMany({
      include: { customers: true, products: true, purchase_bills: true, sales_bills: true, suppliers: true },
      orderBy: [{ date: 'desc' }, { deal_no: 'desc' }],
      take: 10000,
    }),
    prisma.products.findMany({ select: { code: true, id: true, metal_group: true, name: true } }),
  ])

  const productById = new Map(products.map((product) => [String(product.id), { ...product, code: product.code }]))
  const productByCode = new Map(Array.from(productById.values()).map((product) => [product.code, product]))
  const matchedBySaleProduct = new Map<string, { cost: number; qty: number; revenue: number }>()
  tradingDeals.filter((deal) => !isCancelled(deal.status)).forEach((deal) => {
    if (!deal.sales_bill_id || !deal.product_id) return
    const key = `${deal.sales_bill_id}|${deal.product_id}`
    const current = matchedBySaleProduct.get(key) ?? { cost: 0, qty: 0, revenue: 0 }
    current.cost += toNumber(deal.matched_purchase_amount)
    current.qty += toNumber(deal.matched_qty)
    current.revenue += toNumber(deal.matched_sales_amount)
    matchedBySaleProduct.set(key, current)
  })

  const waitingRows: WaitingAllocationRow[] = []
  salesBills.forEach((bill) => {
    if (isCancelled(bill.status) || bill.transaction_mode === 'TRADING') return
    if (!Array.isArray(bill.items)) return

    const items = (bill.items as unknown[]).filter(isJsonItem)
    items.forEach((item, index) => {
      const productId = itemProductCode(item, productById)
      if (!productId) return

      const product = productByCode.get(productId)
      if (!isDualCostingGroup(product?.metal_group)) return

      const qty = itemQty(item)
      if (qty <= 0) return

      const unitPrice = itemUnitPrice(item)
      const matched = matchedBySaleProduct.get(`${bill.id}|${productId}`) ?? { cost: 0, qty: 0, revenue: 0 }
      const allocatedQty = Math.min(qty, matched.qty)
      const remainingQty = Math.max(0, qty - allocatedQty)
      if (remainingQty <= 0.001) return

      waitingRows.push({
        allocatedQty,
        allocationStatus: allocatedQty > 0 ? 'partially_allocated' : 'pending_allocation',
        branchName: bill.branches?.name ?? '-',
        customerName: bill.customers?.name ?? '-',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: `${bill.doc_no}-${productId}-${index}`,
        itemId: jsonString(item.id, item.lineId, `${index}`),
        metalGroup: product?.metal_group ?? '-',
        productId,
        productName: product ? `${product.code} - ${product.name}` : itemProductName(item, productById),
        qty,
        remainingQty,
        revenuePending: remainingQty * unitPrice,
        salesBillId: bill.doc_no,
        unitPrice,
      })
    })
  })

  const ledgerRows: CostAllocationLedgerRow[] = tradingDeals.map((deal) => {
    const qty = toNumber(deal.matched_qty)
    const totalCost = toNumber(deal.matched_purchase_amount)
    const allocatedRevenue = toNumber(deal.matched_sales_amount)
    const grossProfit = allocatedRevenue - totalCost
    const targetType = deal.sales_bills?.po_sell_id ? 'PO_SELL' : 'SPOT_SELL'
    const product = deal.products ?? (deal.product_id != null ? productById.get(String(deal.product_id)) : null)
    return {
      allocatedAt: deal.created_at?.toISOString() ?? toDateOnly(deal.date),
      allocatedBy: deal.created_by ?? '-',
      allocatedQty: qty,
      allocatedRevenue,
      costPerKg: qty > 0 ? totalCost / qty : 0,
      costPoolNo: deal.purchase_bill_no ?? deal.purchase_bills?.doc_no ?? '-',
      date: toDateOnly(deal.date),
      gpPct: pct(grossProfit, allocatedRevenue),
      grossProfit,
      id: deal.deal_no,
      matchId: deal.deal_no,
      productCategory: product?.metal_group ?? '-',
      productId: product?.code ?? '',
      productName: product ? `${product.code} - ${product.name}` : '-',
      saleDocNo: deal.sales_bill_no ?? deal.sales_bills?.doc_no ?? deal.customers?.name ?? '-',
      saleQty: qty,
      sourceNo: deal.purchase_bill_no ?? deal.purchase_bills?.doc_no ?? deal.suppliers?.name ?? '-',
      status: isCancelled(deal.status) ? 'reversed' : 'approved',
      targetType,
      totalCost,
    }
  })

  const activeLedgerRows = ledgerRows.filter((row) => row.status === 'approved')
  const byCategory = new Map<string, { allocatedQty: number; cost: number; gp: number; pendingQty: number; pendingRevenue: number; revenue: number; rows: number }>()
  const ensureCategory = (category: string) => {
    const key = category || '-'
    const current = byCategory.get(key) ?? { allocatedQty: 0, cost: 0, gp: 0, pendingQty: 0, pendingRevenue: 0, revenue: 0, rows: 0 }
    byCategory.set(key, current)
    return current
  }
  activeLedgerRows.forEach((row) => {
    const current = ensureCategory(row.productCategory)
    current.allocatedQty += row.allocatedQty
    current.cost += row.totalCost
    current.gp += row.grossProfit
    current.revenue += row.allocatedRevenue
    current.rows += 1
  })
  waitingRows.forEach((row) => {
    const current = ensureCategory(row.metalGroup)
    current.pendingQty += row.remainingQty
    current.pendingRevenue += row.revenuePending
  })

  const poRows = activeLedgerRows.filter((row) => row.targetType === 'PO_SELL')
  const spotRows = activeLedgerRows.filter((row) => row.targetType === 'SPOT_SELL')
  const sumRows = (rows: CostAllocationLedgerRow[]) => {
    const revenue = rows.reduce((sum, row) => sum + row.allocatedRevenue, 0)
    const cost = rows.reduce((sum, row) => sum + row.totalCost, 0)
    const gp = revenue - cost
    const qty = rows.reduce((sum, row) => sum + row.allocatedQty, 0)
    return { cost, count: rows.length, gp, gpPct: pct(gp, revenue), qty, revenue }
  }

  return {
    ledgerRows,
    report: {
      byCategory: Array.from(byCategory.entries()).map(([category, values]) => ({ category, ...values, gpPct: pct(values.gp, values.revenue) })),
      po: sumRows(poRows),
      spotAllocated: sumRows(spotRows),
      total: sumRows(activeLedgerRows),
      waiting: {
        count: waitingRows.length,
        qty: waitingRows.reduce((sum, row) => sum + row.remainingQty, 0),
        revenue: waitingRows.reduce((sum, row) => sum + row.revenuePending, 0),
      },
    },
    waitingRows,
  }
}
