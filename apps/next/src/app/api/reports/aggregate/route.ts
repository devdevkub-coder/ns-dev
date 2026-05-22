import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'

export const runtime = 'nodejs'

type JsonRow = Record<string, unknown>

type PurchaseBillRow = {
  date: Date
  id: string
  purchase_bill_items?: Array<Record<string, unknown>>
  status: string | null
  supplier_id: string | null
  suppliers: { name: string } | null
  total_amount: unknown
}

type SalesBillRow = {
  channel_id: string | null
  customers: { name: string } | null
  customer_id: string | null
  date: Date
  id: string
  items: unknown
  cogs_amount: unknown
  gross_profit: unknown
  sales_channels: { name: string } | null
  status: string | null
  total_amount: unknown
  total_cost: unknown
}

type AggregateRow = {
  amount: number
  count: number
  name: string
  weight: number
}

type PurchaseProductRow = AggregateRow & {
  avgPrice: number
}

type SalesChannelRow = AggregateRow & {
  cost: number
  marginPct: number
  profit: number
}

type SalesCustomerRow = {
  amount: number
  count: number
  name: string
  profit: number
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function jsonRows(items: unknown): JsonRow[] {
  if (!Array.isArray(items)) return []
  return items.filter((item): item is JsonRow => typeof item === 'object' && item !== null)
}

function dateRange(fromDate: string | null, toDate: string | null) {
  const where: { gte?: Date; lte?: Date } = {}
  if (fromDate) {
    const from = new Date(fromDate)
    if (!Number.isNaN(from.getTime())) where.gte = from
  }
  if (toDate) {
    const to = new Date(toDate)
    if (!Number.isNaN(to.getTime())) where.lte = to
  }
  return Object.keys(where).length ? where : undefined
}

function activeStatus(status: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function addAggregate(map: Map<string, AggregateRow>, name: string, amount: number, weight: number) {
  const row = map.get(name) ?? { amount: 0, count: 0, name, weight: 0 }
  row.amount += amount
  row.count += 1
  row.weight += weight
  map.set(name, row)
}

function sortByAmount<T extends { amount: number; name: string }>(rows: T[]) {
  return rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'th'))
}

function purchaseItemProductId(item: JsonRow) {
  const value = item.productId ?? item.product_id ?? item.productID
  return typeof value === 'string' ? value : ''
}

function itemProductName(item: JsonRow, productById: Map<string, string>) {
  const direct = item.productName ?? item.product_name ?? item.name
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const productId = purchaseItemProductId(item)
  return productId ? productById.get(productId) ?? productId : 'ไม่ระบุสินค้า'
}

function itemWeight(item: JsonRow) {
  return jsonNumber(item.netWeight ?? item.net_weight ?? item.weight ?? item.qty ?? item.quantity)
}

function purchaseItemAmount(item: JsonRow) {
  const amount = jsonNumber(item.netAmount ?? item.net_amount ?? item.amount ?? item.totalAmount ?? item.total)
  if (amount) return amount
  return itemWeight(item) * jsonNumber(item.price ?? item.unitPrice ?? item.unit_price)
}

function purchaseRows(bill: PurchaseBillRow) {
  return purchaseBillItemRows(bill)
}

function billWeight(bill: { items: unknown }) {
  return jsonRows(bill.items).reduce((sum, item) => sum + itemWeight(item), 0)
}

function purchaseBillWeight(bill: PurchaseBillRow) {
  return purchaseRows(bill).reduce((sum, item) => sum + itemWeight(item), 0)
}

function collectProductIds(purchases: PurchaseBillRow[], sales: SalesBillRow[]) {
  const ids = new Set<string>()
  purchases.forEach((bill) => {
    purchaseRows(bill).forEach((item) => {
      const productId = purchaseItemProductId(item)
      if (productId) ids.add(productId)
    })
  })
  sales.forEach((bill) => {
    jsonRows(bill.items).forEach((item) => {
      const productId = purchaseItemProductId(item)
      if (productId) ids.add(productId)
    })
  })
  return [...ids]
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')

    const params = request.nextUrl.searchParams
    const range = dateRange(params.get('fromDate'), params.get('toDate'))

    const [purchases, sales] = await Promise.all([
      prisma.purchase_bills.findMany({
        include: { purchase_bill_items: { orderBy: { line_no: 'asc' } }, suppliers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: range ? { date: range } : undefined,
      }),
      prisma.sales_bills.findMany({
        include: { customers: true, sales_channels: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: range ? { date: range } : undefined,
      }),
    ])

    const activePurchases = purchases.filter((bill) => activeStatus(bill.status))
    const activeSales = sales.filter((bill) => activeStatus(bill.status))
    const productIds = collectProductIds(activePurchases, activeSales)
    const productRows = productIds.length ? await prisma.products.findMany({ select: { id: true, name: true }, where: { id: { in: productIds } } }) : []
    const productById = new Map(productRows.map((product) => [product.id, product.name]))

    const purchaseChannel = new Map<string, AggregateRow>()
    const purchaseSupplier = new Map<string, AggregateRow>()
    const purchaseProduct = new Map<string, PurchaseProductRow>()

    activePurchases.forEach((bill) => {
      const amount = jsonNumber(bill.total_amount)
      const weight = purchaseBillWeight(bill)
      addAggregate(purchaseChannel, 'บิลรับซื้อ', amount, weight)
      addAggregate(purchaseSupplier, bill.suppliers?.name ?? bill.supplier_id ?? 'ไม่ระบุ Supplier', amount, weight)

      purchaseRows(bill).forEach((item) => {
        const name = itemProductName(item, productById)
        const itemAmount = purchaseItemAmount(item)
        const itemWeightValue = itemWeight(item)
        const row = purchaseProduct.get(name) ?? { amount: 0, avgPrice: 0, count: 0, name, weight: 0 }
        row.amount += itemAmount
        row.count += 1
        row.weight += itemWeightValue
        row.avgPrice = row.weight ? row.amount / row.weight : 0
        purchaseProduct.set(name, row)
      })
    })

    const salesChannel = new Map<string, SalesChannelRow>()
    const salesCustomer = new Map<string, SalesCustomerRow>()

    activeSales.forEach((bill) => {
      const amount = jsonNumber(bill.total_amount)
      const cost = jsonNumber(bill.total_cost ?? bill.cogs_amount)
      const profit = jsonNumber(bill.gross_profit) || amount - cost
      const weight = billWeight(bill)
      const channelName = bill.sales_channels?.name ?? bill.channel_id ?? 'ไม่ระบุช่องทาง'
      const customerName = bill.customers?.name ?? bill.customer_id ?? 'ไม่ระบุ Customer'

      const channel = salesChannel.get(channelName) ?? { amount: 0, cost: 0, count: 0, marginPct: 0, name: channelName, profit: 0, weight: 0 }
      channel.amount += amount
      channel.cost += cost
      channel.count += 1
      channel.profit += profit
      channel.weight += weight
      channel.marginPct = channel.amount ? (channel.profit / channel.amount) * 100 : 0
      salesChannel.set(channelName, channel)

      const customer = salesCustomer.get(customerName) ?? { amount: 0, count: 0, name: customerName, profit: 0 }
      customer.amount += amount
      customer.count += 1
      customer.profit += profit
      salesCustomer.set(customerName, customer)
    })

    return NextResponse.json({
      generatedAt: toDateOnly(new Date()),
      purchaseChannel: sortByAmount([...purchaseChannel.values()]),
      purchaseProduct: sortByAmount([...purchaseProduct.values()]),
      purchaseSupplier: sortByAmount([...purchaseSupplier.values()]),
      salesChannel: sortByAmount([...salesChannel.values()]),
      salesCustomer: sortByAmount([...salesCustomer.values()]),
      scope: {
        fromDate: range?.gte ? toDateOnly(range.gte) : '',
        purchaseBillCount: activePurchases.length,
        salesBillCount: activeSales.length,
        toDate: range?.lte ? toDateOnly(range.lte) : '',
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายงานสรุปไม่ได้', 500)
  }
}
