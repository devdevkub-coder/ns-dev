import type { Prisma } from '../../../generated/prisma/client'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'

type JsonItem = Prisma.JsonObject

export type ProfitCostFilter = {
  branchId?: string
  customerId?: string
  dateFrom: string
  dateTo: string
  metalGroups?: string[]
  purchaseChannelId?: string
  salesChannelId?: string
  supplierId?: string
}

type ProductRef = {
  code: string
  id: string
  metalGroup: string
  name: string
  targetMarginPct: number
  unit: string
}

type ProductAgg = {
  buyAmount: number
  buyBills: Set<string>
  buyQty: number
  code: string
  cogs: number
  gp: number
  id: string
  metalGroup: string
  name: string
  revenue: number
  sellBills: Set<string>
  sellQty: number
  stockQty: number
  stockValue: number
  targetMarginPct: number
  unit: string
}

function startOfDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`)
}

function endOfDay(date: string) {
  return new Date(`${date}T23:59:59.999Z`)
}

export function defaultProfitCostRange(date = new Date()) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  return { from: toDateOnly(first), to: toDateOnly(date) }
}

function activeStatus(status?: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber()
  }
  return 0
}

function isJsonItem(value: unknown): value is JsonItem {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.netWeight ?? item.weight ?? item.qty ?? item.quantity)
}

function itemAmount(item: JsonItem) {
  const amount = jsonNumber(item.netAmount ?? item.amount ?? item.totalAmount ?? item.total ?? item.lineTotal)
  if (amount) return amount
  return itemQty(item) * jsonNumber(item.price ?? item.unitPrice)
}

function itemCost(item: JsonItem) {
  const cost = jsonNumber(item.totalCost ?? item.total_cost ?? item.cogs ?? item.costAmount)
  if (cost) return cost
  return itemQty(item) * jsonNumber(item.unitCost ?? item.cost)
}

function itemLookupKeys(item: JsonItem) {
  return [
    item.productId,
    item.product_id,
    item.id,
    item.productCode,
    item.code,
    item.productName,
    item.displayName,
    item.name,
  ].map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean)
}

function productLookupKeys(product: ProductRef) {
  return [product.id, product.code, product.name].map((value) => value.trim().toLowerCase()).filter(Boolean)
}

function fallbackName(item: JsonItem) {
  return String(item.productName ?? item.displayName ?? item.name ?? item.productCode ?? item.code ?? item.productId ?? item.product_id ?? 'ไม่ระบุสินค้า')
}

function createProductAgg(product?: ProductRef, name = 'ไม่ระบุสินค้า'): ProductAgg {
  return {
    buyAmount: 0,
    buyBills: new Set<string>(),
    buyQty: 0,
    code: product?.code ?? '',
    cogs: 0,
    gp: 0,
    id: product?.id ?? name,
    metalGroup: product?.metalGroup ?? '',
    name: product?.name ?? name,
    revenue: 0,
    sellBills: new Set<string>(),
    sellQty: 0,
    stockQty: 0,
    stockValue: 0,
    targetMarginPct: product?.targetMarginPct ?? 8,
    unit: product?.unit ?? 'kg',
  }
}

function dayKey(date: Date) {
  return toDateOnly(date)
}

export async function buildProfitCostAnalysis(filter: ProfitCostFilter) {
  const fromDate = startOfDay(filter.dateFrom)
  const toDate = endOfDay(filter.dateTo)
  const selectedMetalGroups = new Set((filter.metalGroups ?? []).map((group) => group.trim()).filter(Boolean))

  const [products, purchaseBills, salesBills, stockRows, branches, purchaseChannels, salesChannels, suppliers, customers] = await Promise.all([
    prisma.products.findMany({
      orderBy: [{ metal_group: 'asc' }, { code: 'asc' }, { name: 'asc' }],
      select: { code: true, id: true, metal_group: true, name: true, target_margin_pct: true, unit: true },
      where: {
        active: { not: false },
        ...(selectedMetalGroups.size ? { metal_group: { in: Array.from(selectedMetalGroups) } } : {}),
      },
    }),
    prisma.purchase_bills.findMany({
      include: { branches: true, purchase_bill_items: { orderBy: { line_no: 'asc' } }, purchase_channels: true, suppliers: true },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 15000,
      where: {
        date: { gte: fromDate, lte: toDate },
        ...(filter.branchId ? { branch_id: filter.branchId } : {}),
        ...(filter.purchaseChannelId ? { channel_id: filter.purchaseChannelId } : {}),
        ...(filter.supplierId ? { supplier_id: filter.supplierId } : {}),
      },
    }),
    prisma.sales_bills.findMany({
      include: { branches: true, customers: true, sales_channels: true },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 15000,
      where: {
        date: { gte: fromDate, lte: toDate },
        ...(filter.branchId ? { branch_id: filter.branchId } : {}),
        ...(filter.customerId ? { customer_id: filter.customerId } : {}),
        ...(filter.salesChannelId ? { channel_id: filter.salesChannelId } : {}),
      },
    }),
    prisma.stock_ledger.findMany({
      include: { products: true },
      orderBy: [{ date: 'desc' }],
      take: 50000,
      where: {
        date: { lte: toDate },
        ...(filter.branchId ? { branch_id: filter.branchId } : {}),
      },
    }),
    prisma.branches.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, id: true, name: true } }),
    prisma.purchase_channels.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, id: true, name: true } }),
    prisma.sales_channels.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, id: true, name: true } }),
    prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.customers.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, credit_term: true, id: true, name: true } }),
  ])

  const productRefs: ProductRef[] = products.map((product) => ({
    code: product.code,
    id: product.id,
    metalGroup: product.metal_group ?? '',
    name: product.name,
    targetMarginPct: toNumber(product.target_margin_pct),
    unit: product.unit ?? 'kg',
  }))
  const productsByKey = new Map<string, ProductRef>()
  productRefs.forEach((product) => productLookupKeys(product).forEach((key) => productsByKey.set(key, product)))

  const productAggs = new Map<string, ProductAgg>()
  const ensureProductRow = (item: JsonItem) => {
    const product = itemLookupKeys(item).map((key) => productsByKey.get(key)).find(Boolean)
    if (selectedMetalGroups.size && (!product || !selectedMetalGroups.has(product.metalGroup))) return null
    const key = product?.id ?? fallbackName(item)
    if (!productAggs.has(key)) productAggs.set(key, createProductAgg(product, fallbackName(item)))
    return productAggs.get(key) ?? null
  }

  const activePurchases = purchaseBills.filter((bill) => activeStatus(bill.status))
  const activeSales = salesBills.filter((bill) => activeStatus(bill.status))
  const supplierAggs = new Map<string, { amount: number; bills: Set<string>; name: string; paid: number; payable: number; qty: number }>()
  const customerAggs = new Map<string, { amount: number; bills: Set<string>; cogs: number; gp: number; name: string; receivable: number; received: number; qty: number }>()
  const channelAggs = new Map<string, { amount: number; bills: Set<string>; gp: number; group: string; name: string; qty: number }>()
  const trendAggs = new Map<string, { buyAmount: number; buyQty: number; cogs: number; gp: number; revenue: number; sellQty: number }>()

  activePurchases.forEach((bill) => {
    const supplierKey = bill.supplier_id ?? bill.suppliers?.name ?? 'ไม่ระบุ Supplier'
    const supplier = supplierAggs.get(supplierKey) ?? { amount: 0, bills: new Set<string>(), name: bill.suppliers?.name ?? supplierKey, paid: 0, payable: 0, qty: 0 }
    const channelKey = bill.channel_id ? `purchase:${bill.channel_id}` : `purchase:${bill.purchase_channels?.name ?? 'ไม่ระบุช่องทางซื้อ'}`
    const channel = channelAggs.get(channelKey) ?? { amount: 0, bills: new Set<string>(), gp: 0, group: 'Purchase', name: bill.purchase_channels?.name ?? 'ไม่ระบุช่องทางซื้อ', qty: 0 }
    const day = trendAggs.get(dayKey(bill.date)) ?? { buyAmount: 0, buyQty: 0, cogs: 0, gp: 0, revenue: 0, sellQty: 0 }

    let billQty = 0
    purchaseBillItemRows(bill).filter(isJsonItem).forEach((item) => {
      const row = ensureProductRow(item)
      const qty = itemQty(item)
      const amount = itemAmount(item)
      billQty += qty
      if (!row) return
      row.buyQty += qty
      row.buyAmount += amount
      row.buyBills.add(bill.id)
    })

    supplier.amount += toNumber(bill.total_amount)
    supplier.paid += toNumber(bill.paid_amount)
    supplier.payable += toNumber(bill.payable_balance)
    supplier.qty += billQty
    supplier.bills.add(bill.id)
    supplierAggs.set(supplierKey, supplier)

    channel.amount += toNumber(bill.total_amount)
    channel.qty += billQty
    channel.bills.add(bill.id)
    channelAggs.set(channelKey, channel)

    day.buyAmount += toNumber(bill.total_amount)
    day.buyQty += billQty
    trendAggs.set(dayKey(bill.date), day)
  })

  activeSales.forEach((bill) => {
    const customerKey = bill.customer_id ?? bill.customers?.name ?? 'ไม่ระบุ Customer'
    const customer = customerAggs.get(customerKey) ?? { amount: 0, bills: new Set<string>(), cogs: 0, gp: 0, name: bill.customers?.name ?? customerKey, receivable: 0, received: 0, qty: 0 }
    const channelKey = bill.channel_id ? `sales:${bill.channel_id}` : `sales:${bill.sales_channels?.name ?? 'ไม่ระบุช่องทางขาย'}`
    const channel = channelAggs.get(channelKey) ?? { amount: 0, bills: new Set<string>(), gp: 0, group: 'Sales', name: bill.sales_channels?.name ?? 'ไม่ระบุช่องทางขาย', qty: 0 }
    const day = trendAggs.get(dayKey(bill.date)) ?? { buyAmount: 0, buyQty: 0, cogs: 0, gp: 0, revenue: 0, sellQty: 0 }
    const billCogs = toNumber(bill.cogs_amount || bill.total_cost)
    const billGp = toNumber(bill.gross_profit) || toNumber(bill.total_amount) - billCogs

    let itemRevenueTotal = 0
    let billQty = 0
    if (Array.isArray(bill.items)) {
      bill.items.filter(isJsonItem).forEach((item) => {
        const row = ensureProductRow(item)
        const qty = itemQty(item)
        const revenue = itemAmount(item)
        itemRevenueTotal += revenue
        billQty += qty
        if (!row) return
        const proportionalCogs = itemCost(item) || (toNumber(bill.total_amount) > 0 ? billCogs * (revenue / toNumber(bill.total_amount)) : 0)
        const gp = jsonNumber(item.profit ?? item.grossProfit) || revenue - proportionalCogs
        row.sellQty += qty
        row.revenue += revenue
        row.cogs += proportionalCogs
        row.gp += gp
        row.sellBills.add(bill.id)
      })
    }

    customer.amount += toNumber(bill.total_amount)
    customer.cogs += billCogs
    customer.gp += billGp
    customer.received += toNumber(bill.received_amount || bill.paid_amount)
    customer.receivable += toNumber(bill.receivable_balance)
    customer.qty += billQty
    customer.bills.add(bill.id)
    customerAggs.set(customerKey, customer)

    channel.amount += toNumber(bill.total_amount)
    channel.gp += billGp
    channel.qty += billQty
    channel.bills.add(bill.id)
    channelAggs.set(channelKey, channel)

    day.revenue += toNumber(bill.total_amount)
    day.cogs += billCogs
    day.gp += billGp
    day.sellQty += billQty || itemRevenueTotal
    trendAggs.set(dayKey(bill.date), day)
  })

  stockRows.forEach((stock) => {
    if (!stock.product_id) return
    const product = productsByKey.get(stock.product_id.trim().toLowerCase())
    if (selectedMetalGroups.size && (!product || !selectedMetalGroups.has(product.metalGroup))) return
    if (!product) return
    if (!productAggs.has(product.id)) productAggs.set(product.id, createProductAgg(product))
    const row = productAggs.get(product.id)!
    row.stockQty += toNumber(stock.qty_in) - toNumber(stock.qty_out)
    row.stockValue += toNumber(stock.value_in) - toNumber(stock.value_out)
  })

  const productRows = Array.from(productAggs.values())
    .map((row) => ({
      avgBuy: row.buyQty > 0 ? row.buyAmount / row.buyQty : 0,
      avgSell: row.sellQty > 0 ? row.revenue / row.sellQty : 0,
      buyAmount: row.buyAmount,
      buyBillCount: row.buyBills.size,
      buyQty: row.buyQty,
      code: row.code,
      cogs: row.cogs,
      gp: row.gp,
      gpPct: row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0,
      id: row.id,
      metalGroup: row.metalGroup,
      name: row.name,
      profitPerKg: row.sellQty > 0 ? row.gp / row.sellQty : 0,
      revenue: row.revenue,
      sellBillCount: row.sellBills.size,
      sellQty: row.sellQty,
      stockQty: row.stockQty,
      stockValue: row.stockValue,
      targetMarginPct: row.targetMarginPct,
      unit: row.unit,
    }))
    .filter((row) => row.buyQty > 0 || row.sellQty > 0 || row.stockQty !== 0 || row.stockValue !== 0)
    .sort((left, right) => right.gp - left.gp)

  const summary = {
    ap: activePurchases.reduce((sum, bill) => sum + toNumber(bill.payable_balance), 0),
    ar: activeSales.reduce((sum, bill) => sum + toNumber(bill.receivable_balance), 0),
    avgBuy: 0,
    avgSell: 0,
    cogs: activeSales.reduce((sum, bill) => sum + toNumber(bill.cogs_amount || bill.total_cost), 0),
    customerCount: customerAggs.size,
    gp: activeSales.reduce((sum, bill) => sum + (toNumber(bill.gross_profit) || toNumber(bill.total_amount) - toNumber(bill.cogs_amount || bill.total_cost)), 0),
    productCount: productRows.length,
    purchaseAmount: activePurchases.reduce((sum, bill) => sum + toNumber(bill.total_amount), 0),
    purchaseBills: activePurchases.length,
    purchaseQty: productRows.reduce((sum, row) => sum + row.buyQty, 0),
    revenue: activeSales.reduce((sum, bill) => sum + toNumber(bill.total_amount), 0),
    salesBills: activeSales.length,
    salesQty: productRows.reduce((sum, row) => sum + row.sellQty, 0),
    stockQty: productRows.reduce((sum, row) => sum + row.stockQty, 0),
    stockValue: productRows.reduce((sum, row) => sum + row.stockValue, 0),
    supplierCount: supplierAggs.size,
  }
  summary.avgBuy = summary.purchaseQty > 0 ? summary.purchaseAmount / summary.purchaseQty : 0
  summary.avgSell = summary.salesQty > 0 ? summary.revenue / summary.salesQty : 0

  const gpPct = summary.revenue > 0 ? (summary.gp / summary.revenue) * 100 : 0
  const profitPerKg = summary.salesQty > 0 ? summary.gp / summary.salesQty : 0

  const alerts = [
    ...productRows.filter((row) => row.revenue > 0 && row.gp < 0).slice(0, 6).map((row) => ({ amount: row.gp, label: row.name, severity: 'high', type: 'GP ติดลบ' })),
    ...productRows.filter((row) => row.revenue > 0 && row.gpPct > 0 && row.gpPct < row.targetMarginPct).slice(0, 6).map((row) => ({ amount: row.gpPct, label: row.name, severity: 'medium', type: 'GP ต่ำกว่าเป้า' })),
    ...productRows.filter((row) => row.stockQty > 0 && row.sellQty === 0 && row.buyQty > 0).slice(0, 6).map((row) => ({ amount: row.stockValue, label: row.name, severity: 'low', type: 'ซื้อแล้วยังไม่ขาย' })),
  ].slice(0, 12)

  return {
    alerts,
    filters: {
      branches: branches.map((row) => ({ active: row.active ?? true, id: row.id, name: row.name })),
      customers: customers.map((row) => ({ active: row.active ?? true, code: row.code ?? '', creditTerm: row.credit_term ?? 0, id: row.id, name: row.name })),
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      metalGroups: Array.from(new Set(products.map((product) => product.metal_group).filter(Boolean) as string[])).sort(),
      purchaseChannels: purchaseChannels.map((row) => ({ active: row.active ?? true, id: row.id, name: row.name })),
      salesChannels: salesChannels.map((row) => ({ active: row.active ?? true, id: row.id, name: row.name })),
      selectedMetalGroups: Array.from(selectedMetalGroups),
      suppliers: suppliers.map((row) => ({ active: row.active ?? true, code: row.code ?? '', id: row.id, name: row.name })),
    },
    rows: {
      channels: Array.from(channelAggs.values()).map((row) => ({ amount: row.amount, billCount: row.bills.size, gp: row.gp, group: row.group, name: row.name, qty: row.qty, gpPct: row.amount > 0 ? (row.gp / row.amount) * 100 : 0 })).sort((left, right) => right.amount - left.amount),
      customers: Array.from(customerAggs.values()).map((row) => ({ amount: row.amount, billCount: row.bills.size, cogs: row.cogs, gp: row.gp, gpPct: row.amount > 0 ? (row.gp / row.amount) * 100 : 0, name: row.name, receivable: row.receivable, received: row.received, qty: row.qty })).sort((left, right) => right.gp - left.gp),
      products: productRows,
      suppliers: Array.from(supplierAggs.values()).map((row) => ({ amount: row.amount, billCount: row.bills.size, name: row.name, paid: row.paid, payable: row.payable, qty: row.qty })).sort((left, right) => right.amount - left.amount),
      trend: Array.from(trendAggs.entries()).map(([date, row]) => ({ date, ...row })).sort((left, right) => left.date.localeCompare(right.date)),
    },
    sourceState: {
      basis: 'Profit & Cost read/report baseline from purchase bills, sales bills, item JSON, stock ledger, and party/channel masters.',
      limitations: [
        'COGS/GP uses bill-level COGS with item-level proportional fallback where item cost is missing.',
        'Export, drill-down write actions, posting, allocation, and planning changes remain disabled in this baseline.',
        'Use a dedicated cost/profit permission in a later auth batch before final UAT exposure.',
      ],
      writeActionsEnabled: false,
    },
    summary: {
      ...summary,
      gpPct,
      profitPerKg,
    },
    top: {
      byGp: productRows.slice(0, 8),
      byRevenue: [...productRows].sort((left, right) => right.revenue - left.revenue).slice(0, 8),
      byStockValue: [...productRows].sort((left, right) => right.stockValue - left.stockValue).slice(0, 8),
    },
  }
}
