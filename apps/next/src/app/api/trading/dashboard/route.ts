import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type Option = {
  code?: string
  id: string
  name: string
}

type NumericLike = number | { toNumber: () => number } | null | undefined
type JsonObject = Record<string, unknown>
type ProductReference = { code: string; id: bigint; name: string; unit: string | null }

type TradingAllocationFactRow = Prisma.trading_allocation_factsGetPayload<{
  include: {
    customers: { select: { code: true; name: true } }
    products: { select: { code: true; name: true; unit: true } }
    purchase_bills: { select: { doc_no: true } }
    sales_bills: { select: { doc_no: true } }
    suppliers: { select: { code: true; name: true } }
  }
}>

function activeBillStatus(status?: string | null) {
  return !['cancelled', 'canceled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function activeCommitmentStatus(status?: string | null) {
  return !['cancelled', 'canceled', 'closed', 'completed', 'fully matched', 'received', 'void', 'voided', 'reversed'].includes((status ?? '').toLowerCase())
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return toDateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
}

function parseDateParam(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function parseBigIntParam(value: string | null) {
  if (!value || value === 'all') return null
  if (!/^\d+$/.test(value)) return null
  return BigInt(value)
}

function optionId(id: bigint | number | string) {
  return String(id)
}

function amountFromBill(bill: { subtotal?: NumericLike; total_amount?: NumericLike }) {
  return toNumber(bill.subtotal) || toNumber(bill.total_amount)
}

function remainingAmountFromCommitment(row: { cut_amount?: NumericLike; remaining_amount?: NumericLike; total_amount?: NumericLike }) {
  const explicitRemaining = toNumber(row.remaining_amount)
  if (explicitRemaining > 0) return explicitRemaining
  return Math.max(0, toNumber(row.total_amount) - toNumber(row.cut_amount))
}

function gpPct(gp: number, sales: number) {
  return sales > 0 ? (gp / sales) * 100 : 0
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonRows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : []
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
  return 0
}

function jsonString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function salesLineQty(item: JsonObject) {
  return jsonNumber(item.netWeight ?? item.net_weight ?? item.weight ?? item.qty ?? item.quantity)
}

function salesLineAmount(item: JsonObject) {
  const amount = jsonNumber(item.netAmount ?? item.net_amount ?? item.amount ?? item.totalAmount ?? item.total ?? item.lineTotal)
  if (amount) return amount
  return salesLineQty(item) * jsonNumber(item.price ?? item.unitPrice ?? item.unit_price)
}

function salesLineProductId(item: JsonObject) {
  const raw = jsonString(item.productId, item.product_id, item.productID)
  return /^\d+$/.test(raw) ? raw : ''
}

function salesLineProductCode(item: JsonObject) {
  return jsonString(item.productCode, item.product_code, item.code)
}

function lineUnitPrice(item: JsonObject) {
  return jsonNumber(item.unitPrice ?? item.unit_price ?? item.price)
}

function lineRemainingQty(item: JsonObject) {
  return jsonNumber(item.remainingQty ?? item.remaining_qty ?? item.qty ?? item.quantity)
}

function lineTotalAmount(item: JsonObject) {
  const amount = jsonNumber(item.remainingAmount ?? item.remaining_amount ?? item.totalAmount ?? item.totalRevenue ?? item.total ?? item.amount)
  if (amount) return amount
  return lineRemainingQty(item) * lineUnitPrice(item)
}

function resolveProductFromLine(
  item: JsonObject,
  fallbackProduct: ProductReference | null,
  productById: Map<string, ProductReference>,
  productByCode: Map<string, ProductReference>,
) {
  const rawId = salesLineProductId(item)
  const rawCode = salesLineProductCode(item) || jsonString(item.productId, item.product_id)
  return (rawId ? productById.get(rawId) : undefined) ?? (rawCode ? productByCode.get(rawCode) : undefined) ?? fallbackProduct
}

function daysFromDocument(date: Date, now = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.max(0, Math.floor((end - start) / 86_400_000))
}

function agingBucket(days: number) {
  if (days <= 7) return '0-7'
  if (days <= 14) return '8-14'
  if (days <= 30) return '15-30'
  return '31+'
}

function emptyAgingBuckets() {
  return {
    '0-7': { amount: 0, count: 0 },
    '8-14': { amount: 0, count: 0 },
    '15-30': { amount: 0, count: 0 },
    '31+': { amount: 0, count: 0 },
  }
}

function addAging(buckets: ReturnType<typeof emptyAgingBuckets>, date: Date, amount: number) {
  if (amount <= 0.01) return
  const bucket = buckets[agingBucket(daysFromDocument(date))]
  bucket.amount += amount
  bucket.count += 1
}

function factProductName(row: TradingAllocationFactRow) {
  const code = row.products?.code ? requireBusinessCode(row.products.code, `สินค้า ${row.product_id ?? ''}`) : row.product_code_snapshot
  const name = row.products?.name ?? row.product_name_snapshot ?? 'ไม่ระบุสินค้า'
  return code ? `${code} - ${name}` : name
}

function factSupplierName(row: TradingAllocationFactRow) {
  return row.suppliers?.name ?? row.supplier_name_snapshot ?? '-'
}

function factCustomerName(row: TradingAllocationFactRow) {
  return row.customers?.name ?? row.customer_name_snapshot ?? '-'
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const from = url.searchParams.get('from') || firstDayOfCurrentMonth()
    const to = url.searchParams.get('to') || toDateOnly(new Date())
    const supplierId = parseBigIntParam(url.searchParams.get('supplierId'))
    const customerId = parseBigIntParam(url.searchParams.get('customerId'))
    const productId = parseBigIntParam(url.searchParams.get('productId'))
    const billNo = url.searchParams.get('billNo')?.trim() || ''
    const fromDate = parseDateParam(from)
    const toDate = parseDateParam(to)

    const allocationWhere: Prisma.trading_allocation_factsWhereInput = {
      date: { gte: fromDate, lte: toDate },
      status: 'active',
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      ...(productId ? { product_id: productId } : {}),
      ...(billNo
        ? {
            OR: [
              { allocation_no: { contains: billNo, mode: 'insensitive' } },
              { source_doc_no: { contains: billNo, mode: 'insensitive' } },
              { sales_doc_no: { contains: billNo, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const purchaseWhere: Prisma.purchase_billsWhereInput = {
      transaction_mode: 'TRADING',
      date: { gte: fromDate, lte: toDate },
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(billNo ? { doc_no: { contains: billNo, mode: 'insensitive' } } : {}),
    }

    const salesWhere: Prisma.sales_billsWhereInput = {
      transaction_mode: 'TRADING',
      date: { gte: fromDate, lte: toDate },
      ...(customerId ? { customer_id: customerId } : {}),
      ...(billNo ? { doc_no: { contains: billNo, mode: 'insensitive' } } : {}),
    }

    const poBuyWhere: Prisma.po_buysWhereInput = {
      date: { gte: fromDate, lte: toDate },
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(billNo ? { doc_no: { contains: billNo, mode: 'insensitive' } } : {}),
    }

    const poSellWhere: Prisma.po_sellsWhereInput = {
      date: { gte: fromDate, lte: toDate },
      ...(customerId ? { customer_id: customerId } : {}),
      ...(billNo ? { doc_no: { contains: billNo, mode: 'insensitive' } } : {}),
    }

    const costPoolWhere: Prisma.stock_cost_pool_entriesWhereInput = {
      date: { gte: fromDate, lte: toDate },
      status: { in: ['Available', 'Partially Used'] },
      ...(productId ? { product_id: productId } : {}),
      ...(billNo ? { source_ref_no: { contains: billNo, mode: 'insensitive' } } : {}),
    }

    const tradingCostSourceWhere: Prisma.trading_cost_sourcesWhereInput = {
      date: { gte: fromDate, lte: toDate },
      status: 'active',
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...(productId ? { product_id: productId } : {}),
      ...(billNo ? { source_no: { contains: billNo, mode: 'insensitive' } } : {}),
    }

    const [allocationFacts, purchaseBills, salesBills, suppliers, customers, products, poBuys, poSells, costPoolEntries, tradingCostSources] = await Promise.all([
      prisma.trading_allocation_facts.findMany({
        include: {
          customers: { select: { code: true, name: true } },
          products: { select: { code: true, name: true, unit: true } },
          purchase_bills: { select: { doc_no: true } },
          sales_bills: { select: { doc_no: true } },
          suppliers: { select: { code: true, name: true } },
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 20000,
        where: allocationWhere,
      }),
      prisma.purchase_bills.findMany({
        include: { suppliers: { select: { code: true, name: true } } },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: purchaseWhere,
      }),
      prisma.sales_bills.findMany({
        include: { customers: { select: { code: true, name: true } } },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: salesWhere,
      }),
      prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], select: { code: true, id: true, name: true }, where: { active: true } }),
      prisma.customers.findMany({ orderBy: [{ name: 'asc' }], select: { code: true, id: true, name: true }, where: { active: true } }),
      prisma.products.findMany({ orderBy: [{ code: 'asc' }], select: { code: true, id: true, name: true, unit: true }, where: { active: true } }),
      prisma.po_buys.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        select: { cut_amount: true, date: true, doc_no: true, id: true, items: true, product_id: true, qty: true, remaining_amount: true, remaining_qty: true, status: true, suppliers: { select: { name: true } }, supplier_id: true, total_amount: true, unit_price: true },
        take: 10000,
        where: poBuyWhere,
      }),
      prisma.po_sells.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        select: { customers: { select: { name: true } }, customer_id: true, cut_amount: true, date: true, doc_no: true, id: true, items: true, product_id: true, qty: true, remaining_amount: true, remaining_qty: true, status: true, total_amount: true, unit_price: true },
        take: 10000,
        where: poSellWhere,
      }),
      prisma.stock_cost_pool_entries.findMany({
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        select: { allocated_qty: true, date: true, id: true, original_qty: true, product_id: true, released_qty: true, source_ref_no: true, status: true, unit_cost: true },
        take: 10000,
        where: costPoolWhere,
      }),
      prisma.trading_cost_sources.findMany({
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        select: { date: true, id: true, product_id: true, qty: true, source_no: true, supplier_name_snapshot: true, suppliers: { select: { name: true } }, total_amount: true, unit_cost: true },
        take: 10000,
        where: tradingCostSourceWhere,
      }),
    ])

    const activePurchases = purchaseBills.filter((bill) => activeBillStatus(bill.status))
    const activeSales = salesBills.filter((bill) => activeBillStatus(bill.status))

    const productById = new Map(products.map((product) => [optionId(product.id), product]))
    const productByCode = new Map(products.map((product) => [product.code, product]))
    const purchaseMatchedByBill = new Map<string, number>()
    const salesMatchedByBill = new Map<string, { cogs: number; sales: number }>()
    const productRowsByKey = new Map<string, { cost: number; gp: number; gpPct: number; productId: string; productName: string; qty: number; sales: number; unallocated: number; unit: string }>()

    allocationFacts.forEach((fact) => {
      const sourceDocNo = fact.source_doc_no ?? fact.purchase_bills?.doc_no ?? ''
      const salesDocNo = fact.sales_doc_no ?? fact.sales_bills?.doc_no ?? ''
      const matchedCogs = toNumber(fact.matched_cogs)
      const salesAmount = toNumber(fact.sales_amount)
      const qty = toNumber(fact.qty)

      if (sourceDocNo) purchaseMatchedByBill.set(sourceDocNo, (purchaseMatchedByBill.get(sourceDocNo) ?? 0) + matchedCogs)
      if (salesDocNo) {
        const current = salesMatchedByBill.get(salesDocNo) ?? { cogs: 0, sales: 0 }
        current.cogs += matchedCogs
        current.sales += salesAmount
        salesMatchedByBill.set(salesDocNo, current)
      }

      const productKey = fact.product_id ? optionId(fact.product_id) : fact.product_code_snapshot ?? fact.product_name_snapshot ?? 'unknown'
      const current = productRowsByKey.get(productKey) ?? {
        cost: 0,
        gp: 0,
        gpPct: 0,
        productId: productKey,
        productName: factProductName(fact),
        qty: 0,
        sales: 0,
        unallocated: 0,
        unit: fact.products?.unit ?? '',
      }
      current.cost += matchedCogs
      if (supplierId) {
        current.qty += qty
        current.sales += salesAmount
      }
      current.gp = current.sales - current.cost
      current.gpPct = gpPct(current.gp, current.sales)
      productRowsByKey.set(productKey, current)
    })

    if (!supplierId) {
      activeSales.forEach((bill) => {
        jsonRows(bill.items).forEach((item) => {
          const itemProductId = salesLineProductId(item)
          const itemProductCode = salesLineProductCode(item)
          const product = (itemProductId ? productById.get(itemProductId) : undefined) ?? (itemProductCode ? productByCode.get(itemProductCode) : undefined)
          const resolvedProductId = product ? optionId(product.id) : itemProductId
          if (productId && resolvedProductId && resolvedProductId !== optionId(productId)) return
          if (productId && !resolvedProductId) return

          const productKey = resolvedProductId || itemProductCode || jsonString(item.productName, item.product_name, item.name) || 'unknown'
          const productName = product
            ? `${requireBusinessCode(product.code, `สินค้า ${product.id}`)} - ${product.name}`
            : jsonString(item.productName, item.product_name, item.name, itemProductCode, 'ไม่ระบุสินค้า')
          const current = productRowsByKey.get(productKey) ?? {
            cost: 0,
            gp: 0,
            gpPct: 0,
            productId: productKey,
            productName,
            qty: 0,
            sales: 0,
            unallocated: 0,
            unit: product?.unit ?? '',
          }
          current.qty += salesLineQty(item)
          current.sales += salesLineAmount(item)
          current.gp = current.sales - current.cost
          current.gpPct = gpPct(current.gp, current.sales)
          current.unallocated = Math.max(0, current.sales - current.cost)
          productRowsByKey.set(productKey, current)
        })
      })
    }

    const manualAllocatedBySourceId = new Map<string, { amount: number; qty: number }>()
    allocationFacts.forEach((fact) => {
      if (!fact.trading_cost_source_id) return
      const key = optionId(fact.trading_cost_source_id)
      const current = manualAllocatedBySourceId.get(key) ?? { amount: 0, qty: 0 }
      current.amount += toNumber(fact.matched_cogs)
      current.qty += toNumber(fact.qty)
      manualAllocatedBySourceId.set(key, current)
    })

    const purchaseRows = activePurchases.map((bill) => {
      const totalAmount = amountFromBill(bill)
      const matchedAmount = purchaseMatchedByBill.get(bill.doc_no) ?? 0
      return {
        allocationStatus: matchedAmount <= 0.01 ? 'pending' : matchedAmount + 0.01 >= totalAmount ? 'matched' : 'partial',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: optionId(bill.id),
        matchedAmount,
        partyName: bill.suppliers?.name ?? '-',
        remainingAmount: Math.max(0, totalAmount - matchedAmount),
        sourceUrl: `/purchase/bills/${encodeURIComponent(bill.doc_no)}`,
        totalAmount,
      }
    })

    const manualCostSourceRows = tradingCostSources.map((source) => {
      const matched = manualAllocatedBySourceId.get(optionId(source.id)) ?? { amount: 0, qty: 0 }
      const totalAmount = toNumber(source.total_amount)
      return {
        allocationStatus: matched.amount <= 0.01 ? 'pending' : matched.amount + 0.01 >= totalAmount ? 'matched' : 'partial',
        date: toDateOnly(source.date),
        docNo: source.source_no,
        id: `SRC:${optionId(source.id)}`,
        matchedAmount: matched.amount,
        partyName: source.supplier_name_snapshot ?? source.suppliers?.name ?? 'Manual Trading Source',
        remainingAmount: Math.max(0, totalAmount - matched.amount),
        sourceUrl: `/trading/dashboard?billNo=${encodeURIComponent(source.source_no)}`,
        totalAmount,
      }
    })

    const salesRows = activeSales.map((bill) => {
      const totalAmount = amountFromBill(bill)
      const matched = salesMatchedByBill.get(bill.doc_no) ?? { cogs: 0, sales: 0 }
      const gp = matched.sales - matched.cogs
      return {
        allocationStatus: matched.cogs <= 0.01 ? 'pending' : matched.sales + 0.01 >= totalAmount ? 'matched' : 'partial',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        gp,
        gpPct: gpPct(gp, matched.sales),
        id: optionId(bill.id),
        matchedCogs: matched.cogs,
        matchedSalesAmount: matched.sales,
        partyName: bill.customers?.name ?? '-',
        pendingAmount: Math.max(0, totalAmount - matched.sales),
        sourceUrl: `/sales/bills/${encodeURIComponent(bill.doc_no)}`,
        totalAmount,
      }
    })

    const productRows = Array.from(productRowsByKey.values()).sort((left, right) => right.sales - left.sales)
    const readinessByProduct = new Map<string, {
      costPoolQty: number
      costPoolValue: number
      netQty: number
      netValue: number
      poBuyAmount: number
      poBuyQty: number
      poSellAmount: number
      poSellQty: number
      productId: string
      productName: string
      status: string
      unit: string
    }>()
    const selectedProductId = productId ? optionId(productId) : ''

    function readinessProduct(product: ProductReference | null, fallbackName: string) {
      if (!product) {
        return {
          id: fallbackName || 'unknown',
          name: fallbackName || 'ไม่ระบุสินค้า',
          unit: '',
        }
      }
      return {
        id: optionId(product.id),
        name: `${requireBusinessCode(product.code, `สินค้า ${product.id}`)} - ${product.name}`,
        unit: product.unit ?? '',
      }
    }

    function addReadiness(product: ProductReference | null, fallbackName: string, values: { costPoolQty?: number; costPoolValue?: number; poBuyAmount?: number; poBuyQty?: number; poSellAmount?: number; poSellQty?: number }) {
      const resolved = readinessProduct(product, fallbackName)
      if (selectedProductId && resolved.id !== selectedProductId) return
      const current = readinessByProduct.get(resolved.id) ?? {
        costPoolQty: 0,
        costPoolValue: 0,
        netQty: 0,
        netValue: 0,
        poBuyAmount: 0,
        poBuyQty: 0,
        poSellAmount: 0,
        poSellQty: 0,
        productId: resolved.id,
        productName: resolved.name,
        status: 'ready',
        unit: resolved.unit,
      }
      current.costPoolQty += values.costPoolQty ?? 0
      current.costPoolValue += values.costPoolValue ?? 0
      current.poBuyAmount += values.poBuyAmount ?? 0
      current.poBuyQty += values.poBuyQty ?? 0
      current.poSellAmount += values.poSellAmount ?? 0
      current.poSellQty += values.poSellQty ?? 0
      current.netQty = current.costPoolQty + current.poBuyQty - current.poSellQty
      current.netValue = current.costPoolValue + current.poBuyAmount - current.poSellAmount
      current.status = current.netValue < -0.01 || current.netQty < -0.0001 ? 'short' : current.poSellAmount > 0.01 ? 'ready' : 'idle'
      readinessByProduct.set(resolved.id, current)
    }

    const activePoBuys = poBuys.filter((po) => activeCommitmentStatus(po.status))
    const activePoSells = poSells.filter((po) => activeCommitmentStatus(po.status))
    const pendingBuyAging = emptyAgingBuckets()
    const pendingSellAging = emptyAgingBuckets()

    activePoBuys.forEach((po) => {
      const fallbackProduct = po.product_id ? productById.get(optionId(po.product_id)) ?? null : null
      const itemRows = jsonRows(po.items)
      const rows = itemRows.length ? itemRows : [{ productId: fallbackProduct?.code ?? '', productName: fallbackProduct?.name ?? '', qty: po.qty, remainingQty: po.remaining_qty, unitPrice: po.unit_price }]
      rows.forEach((item) => {
        const product = resolveProductFromLine(item, fallbackProduct, productById, productByCode)
        const qty = lineRemainingQty(item)
        const amount = lineTotalAmount(item) || qty * toNumber(po.unit_price) || toNumber(po.remaining_amount)
        if (qty <= 0.0001 && amount <= 0.01) return
        addReadiness(product, jsonString(item.productName, item.product_name, po.doc_no), { poBuyAmount: amount, poBuyQty: qty })
      })
      addAging(pendingBuyAging, po.date, remainingAmountFromCommitment(po))
    })

    activePoSells.forEach((po) => {
      const fallbackProduct = po.product_id ? productById.get(optionId(po.product_id)) ?? null : null
      const itemRows = jsonRows(po.items)
      const rows = itemRows.length ? itemRows : [{ productId: fallbackProduct?.code ?? '', productName: fallbackProduct?.name ?? '', qty: po.qty, remainingQty: po.remaining_qty, unitPrice: po.unit_price }]
      rows.forEach((item) => {
        const product = resolveProductFromLine(item, fallbackProduct, productById, productByCode)
        const qty = lineRemainingQty(item)
        const amount = lineTotalAmount(item) || qty * toNumber(po.unit_price) || toNumber(po.remaining_amount)
        if (qty <= 0.0001 && amount <= 0.01) return
        addReadiness(product, jsonString(item.productName, item.product_name, po.doc_no), { poSellAmount: amount, poSellQty: qty })
      })
      addAging(pendingSellAging, po.date, remainingAmountFromCommitment(po))
    })

    costPoolEntries.forEach((entry) => {
      const product = productById.get(optionId(entry.product_id)) ?? null
      const availableQty = Math.max(0, toNumber(entry.original_qty) - toNumber(entry.allocated_qty) - toNumber(entry.released_qty))
      const availableValue = availableQty * toNumber(entry.unit_cost)
      if (availableQty <= 0.0001 && availableValue <= 0.01) return
      addReadiness(product, entry.source_ref_no ?? `Cost Pool ${entry.id}`, { costPoolQty: availableQty, costPoolValue: availableValue })
    })

    tradingCostSources.forEach((source) => {
      if (!source.product_id) return
      const product = productById.get(optionId(source.product_id)) ?? null
      const matched = manualAllocatedBySourceId.get(optionId(source.id)) ?? { amount: 0, qty: 0 }
      const availableQty = Math.max(0, toNumber(source.qty) - matched.qty)
      const availableValue = Math.max(0, toNumber(source.total_amount) - matched.amount) || availableQty * toNumber(source.unit_cost)
      if (availableQty <= 0.0001 && availableValue <= 0.01) return
      addReadiness(product, source.source_no, { costPoolQty: availableQty, costPoolValue: availableValue })
    })

    const readinessRows = Array.from(readinessByProduct.values()).sort((left, right) => {
      if (left.status !== right.status) return left.status === 'short' ? -1 : 1
      return Math.abs(right.netValue) - Math.abs(left.netValue)
    })
    const allPurchaseRows = [...purchaseRows, ...manualCostSourceRows].sort((left, right) => right.date.localeCompare(left.date))
    const tradingPurchase = allPurchaseRows.reduce((sum, row) => sum + row.totalAmount, 0)
    const tradingSales = salesRows.reduce((sum, row) => sum + row.totalAmount, 0)
    const matchedCOGS = productRows.reduce((sum, row) => sum + row.cost, 0)
    const matchedSalesAmount = productRows.reduce((sum, row) => sum + row.sales, 0)
    const tradingGP = tradingSales - matchedCOGS
    const pendingBuyAmount = allPurchaseRows.reduce((sum, row) => sum + row.remainingAmount, 0)
    const pendingSellAmount = salesRows.reduce((sum, row) => sum + row.pendingAmount, 0)

    const supplierOptions: Option[] = suppliers.map((supplier) => ({
      code: supplier.code ? requireBusinessCode(supplier.code, `Supplier ${supplier.id}`) : undefined,
      id: optionId(supplier.id),
      name: supplier.name,
    }))
    const customerOptions: Option[] = customers.map((customer) => ({
      code: customer.code ? requireBusinessCode(customer.code, `Customer ${customer.id}`) : undefined,
      id: optionId(customer.id),
      name: customer.name,
    }))
    const productOptions: Option[] = products.map((product) => ({
      code: requireBusinessCode(product.code, `สินค้า ${product.id}`),
      id: optionId(product.id),
      name: product.name,
    }))

    return NextResponse.json({
      filters: {
        from,
        to,
      },
      options: {
        customers: customerOptions,
        products: productOptions,
        suppliers: supplierOptions,
      },
      productRows,
      purchaseRows: allPurchaseRows,
      salesRows,
      summary: {
        allocationFactCount: allocationFacts.length,
        matchedCOGS,
        matchedSalesAmount,
        pendingBuyAmount,
        pendingPurchaseBills: allPurchaseRows.filter((row) => row.remainingAmount > 0.01).length,
        pendingSellAmount,
        pendingSalesBills: salesRows.filter((row) => row.pendingAmount > 0.01).length,
        productCount: productRows.length,
        poBuyExposureAmount: activePoBuys.reduce((sum, po) => sum + remainingAmountFromCommitment(po), 0),
        poSellExposureAmount: activePoSells.reduce((sum, po) => sum + remainingAmountFromCommitment(po), 0),
        readinessShortCount: readinessRows.filter((row) => row.status === 'short').length,
        readyCostPoolValue: readinessRows.reduce((sum, row) => sum + row.costPoolValue, 0),
        tradingGP,
        tradingGPPct: gpPct(tradingGP, tradingSales),
        tradingPurchase,
        tradingSales,
        unallocatedSalesAmount: Math.max(0, tradingSales - matchedSalesAmount),
      },
      aging: {
        pendingBuy: pendingBuyAging,
        pendingSell: pendingSellAging,
      },
      readinessRows,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Trading Dashboard ไม่ได้', 500)
  }
}
