import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type DealRow = {
  customerName: string
  date: string
  dealNo: string
  grossProfit: number
  grossProfitPct: number
  id: string
  matchedPurchaseAmount: number
  matchedQty: number
  matchedSalesAmount: number
  productName: string
  purchaseBillNo: string
  salesBillNo: string
  status: string
  supplierName: string
}

type BillSummaryRow = {
  date: string
  docNo: string
  id: string
  matchedAmount: number
  partyName: string
  remainingAmount: number
  totalAmount: number
}

type ProductRow = {
  cost: number
  gp: number
  gpPct: number
  productId: string
  productName: string
  qty: number
  sales: number
}

type JsonItem = Prisma.JsonObject
type ProductRef = { code: string; id: bigint; name: string }

function isCancelled(status: string) {
  return status === 'Cancelled' || status === 'cancelled'
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
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
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

function itemProductCode(item: JsonItem, productById: Map<bigint, ProductRef>) {
  const direct = item.productCode ?? item.code ?? item.productId ?? item.product_id
  if (typeof direct === 'string' && direct.trim()) {
    const trimmed = direct.trim()
    if (/^\d+$/.test(trimmed)) {
      const product = productById.get(BigInt(trimmed))
      return product ? requireBusinessCode(product.code, `สินค้า ${product.id}`) : ''
    }
    return trimmed
  }
  if (typeof direct === 'number' || typeof direct === 'bigint') {
    const product = productById.get(BigInt(direct))
    return product ? requireBusinessCode(product.code, `สินค้า ${product.id}`) : ''
  }
  return ''
}

function itemProductName(item: JsonItem, productById: Map<bigint, ProductRef>) {
  const direct = item.productName ?? item.displayName ?? item.name
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const code = itemProductCode(item, productById)
  if (!code) return 'ไม่ระบุสินค้า'
  for (const product of productById.values()) {
    if (product.code === code) return product.name
  }
  return 'ไม่ระบุสินค้า'
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return toDateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
}

function addAmount<T extends { grossProfit: number; matchedPurchaseAmount: number; matchedQty: number; matchedSalesAmount: number }>(
  map: Map<string, T>,
  key: string,
  seed: T,
  row: DealRow,
) {
  const current = map.get(key) ?? seed
  current.grossProfit += row.grossProfit
  current.matchedPurchaseAmount += row.matchedPurchaseAmount
  current.matchedQty += row.matchedQty
  current.matchedSalesAmount += row.matchedSalesAmount
  map.set(key, current)
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const statusFilter = url.searchParams.get('status')
    const from = url.searchParams.get('from') || firstDayOfCurrentMonth()
    const to = url.searchParams.get('to') || toDateOnly(new Date())
    const activeStatusFilter = statusFilter && statusFilter !== 'all' ? statusFilter : null

    const [purchaseBills, salesBills, deals, products] = await Promise.all([
      prisma.purchase_bills.findMany({
        include: { suppliers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { transaction_mode: 'TRADING' },
      }),
      prisma.sales_bills.findMany({
        include: { customers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { transaction_mode: 'TRADING' },
      }),
      prisma.trading_deals.findMany({
        include: {
          customers: true,
          products: true,
          suppliers: true,
        },
        orderBy: [{ date: 'desc' }, { deal_no: 'desc' }],
        take: 5000,
      }),
      prisma.products.findMany({ select: { code: true, id: true, name: true } }),
    ])
    const productById = new Map(products.map((product) => [product.id, { ...product, code: requireBusinessCode(product.code, `สินค้า ${product.id}`) }]))

    const rows = deals.map((deal) => {
      const salesAmount = toNumber(deal.matched_sales_amount)
      const purchaseAmount = toNumber(deal.matched_purchase_amount)
      const grossProfit = salesAmount - purchaseAmount

      return {
        customerName: deal.customers?.name ?? '-',
        date: toDateOnly(deal.date),
        dealNo: deal.deal_no,
        grossProfit,
        grossProfitPct: salesAmount > 0 ? (grossProfit / salesAmount) * 100 : 0,
        id: deal.deal_no,
        matchedPurchaseAmount: purchaseAmount,
        matchedQty: toNumber(deal.matched_qty),
        matchedSalesAmount: salesAmount,
        productName: deal.products?.name ?? '-',
        purchaseBillNo: deal.purchase_bill_no ?? '',
        salesBillNo: deal.sales_bill_no ?? '',
        status: deal.status ?? 'Open',
        supplierName: deal.suppliers?.name ?? '-',
      }
    })
      .filter((row) => !activeStatusFilter || row.status === activeStatusFilter)
      .filter((row) => row.date >= from)
      .filter((row) => row.date <= to)
      .filter((row) => {
        if (!q) return true
        return `${row.dealNo} ${row.purchaseBillNo} ${row.salesBillNo} ${row.supplierName} ${row.customerName} ${row.productName} ${row.status}`.toLowerCase().includes(q)
      })

    const activeRows = rows.filter((row) => !isCancelled(row.status))
    const activeDeals = deals.filter((deal) => !isCancelled(deal.status ?? ''))
    const matchedPurchaseCostByBill = new Map<bigint, number>()
    const matchedSalesCostByBill = new Map<bigint, number>()
    activeDeals.forEach((deal) => {
      if (deal.purchase_bill_id) matchedPurchaseCostByBill.set(deal.purchase_bill_id, (matchedPurchaseCostByBill.get(deal.purchase_bill_id) ?? 0) + toNumber(deal.matched_purchase_amount))
      if (deal.sales_bill_id) matchedSalesCostByBill.set(deal.sales_bill_id, (matchedSalesCostByBill.get(deal.sales_bill_id) ?? 0) + toNumber(deal.matched_purchase_amount))
    })

    const purchaseRows: BillSummaryRow[] = purchaseBills
      .filter((bill) => activeStatus(bill.status))
      .map((bill) => {
        const total = toNumber(bill.subtotal) || toNumber(bill.total_amount)
        const matchedAmount = matchedPurchaseCostByBill.get(bill.id) ?? 0
        return {
          date: toDateOnly(bill.date),
          docNo: bill.doc_no,
          id: bill.doc_no,
          matchedAmount,
          partyName: bill.suppliers?.name ?? '-',
          remainingAmount: Math.max(0, total - matchedAmount),
          totalAmount: total,
        }
      })
      .filter((row) => row.date >= from)
      .filter((row) => row.date <= to)
      .filter((row) => !q || `${row.docNo} ${row.partyName}`.toLowerCase().includes(q))

    const salesRows: BillSummaryRow[] = salesBills
      .filter((bill) => activeStatus(bill.status))
      .map((bill) => {
        const total = toNumber(bill.subtotal) || toNumber(bill.total_amount)
        const matchedAmount = matchedSalesCostByBill.get(bill.id) ?? 0
        return {
          date: toDateOnly(bill.date),
          docNo: bill.doc_no,
          id: bill.doc_no,
          matchedAmount,
          partyName: bill.customers?.name ?? '-',
          remainingAmount: Math.max(0, total - matchedAmount),
          totalAmount: total,
        }
      })
      .filter((row) => row.date >= from)
      .filter((row) => row.date <= to)
      .filter((row) => !q || `${row.docNo} ${row.partyName}`.toLowerCase().includes(q))

    const statusMap = new Map<string, { count: number; grossProfit: number; matchedPurchaseAmount: number; matchedSalesAmount: number; status: string }>()
    rows.forEach((row) => {
      const current = statusMap.get(row.status) ?? { count: 0, grossProfit: 0, matchedPurchaseAmount: 0, matchedSalesAmount: 0, status: row.status }
      current.count += 1
      current.grossProfit += row.grossProfit
      current.matchedPurchaseAmount += row.matchedPurchaseAmount
      current.matchedSalesAmount += row.matchedSalesAmount
      statusMap.set(row.status, current)
    })

    const trendMap = new Map<string, { date: string; purchase: number; sales: number }>()
    purchaseRows.forEach((row) => {
      const current = trendMap.get(row.date) ?? { date: row.date, purchase: 0, sales: 0 }
      current.purchase += row.totalAmount
      trendMap.set(row.date, current)
    })
    salesRows.forEach((row) => {
      const current = trendMap.get(row.date) ?? { date: row.date, purchase: 0, sales: 0 }
      current.sales += row.totalAmount
      trendMap.set(row.date, current)
    })

    const productMap = new Map<string, { grossProfit: number; matchedPurchaseAmount: number; matchedQty: number; matchedSalesAmount: number; productName: string }>()
    activeRows.forEach((row) => {
      addAmount(productMap, row.productName, { grossProfit: 0, matchedPurchaseAmount: 0, matchedQty: 0, matchedSalesAmount: 0, productName: row.productName }, row)
    })

    const productRowsByKey = new Map<string, ProductRow>()
    salesBills
      .filter((bill) => activeStatus(bill.status))
      .filter((bill) => {
        const date = toDateOnly(bill.date)
        return date >= from && date <= to
      })
      .filter((bill) => !q || `${bill.doc_no} ${bill.customers?.name ?? ''}`.toLowerCase().includes(q))
      .forEach((bill) => {
        const billTotal = toNumber(bill.subtotal) || toNumber(bill.total_amount)
        const billMatchedCost = matchedSalesCostByBill.get(bill.id) ?? 0
        const items = Array.isArray(bill.items) ? bill.items.filter(isJsonItem) : []
        if (!items.length) return
        items.forEach((item) => {
          const sales = itemAmount(item)
          const qty = itemQty(item)
          const share = billTotal > 0 ? sales / billTotal : 0
          const key = itemProductCode(item, productById)
          if (!key) return
          const current = productRowsByKey.get(key) ?? { cost: 0, gp: 0, gpPct: 0, productId: key, productName: itemProductName(item, productById), qty: 0, sales: 0 }
          current.qty += qty
          current.sales += sales
          current.cost += billMatchedCost * share
          current.gp = current.sales - current.cost
          current.gpPct = current.sales > 0 ? (current.gp / current.sales) * 100 : 0
          productRowsByKey.set(key, current)
        })
      })

    const salesTotal = salesRows.reduce((sum, row) => sum + row.totalAmount, 0)
    const purchaseTotal = purchaseRows.reduce((sum, row) => sum + row.totalAmount, 0)
    const matchedCOGS = salesRows.reduce((sum, row) => sum + row.matchedAmount, 0)
    const grossProfit = salesTotal - matchedCOGS
    const unmatchedSalesAmount = salesRows.reduce((sum, row) => sum + row.remainingAmount, 0)
    const unmatchedPurchasesAmount = purchaseRows.reduce((sum, row) => sum + row.remainingAmount, 0)

    return NextResponse.json({
      filters: {
        statuses: Array.from(new Set(deals.map((deal) => deal.status ?? 'Open'))).sort(),
      },
      purchases: purchaseRows,
      recentDeals: rows.slice(0, 20),
      sales: salesRows,
      statusBreakdown: Array.from(statusMap.values()).sort((left, right) => right.count - left.count),
      summary: {
        activeDeals: activeRows.length,
        cancelledDeals: rows.filter((row) => isCancelled(row.status)).length,
        completedDeals: activeRows.filter((row) => row.status === 'Completed').length,
        grossProfit,
        grossProfitPct: salesTotal > 0 ? (grossProfit / salesTotal) * 100 : 0,
        matchedCOGS,
        matchedPurchaseAmount: purchaseTotal,
        matchedQty: activeRows.reduce((sum, row) => sum + row.matchedQty, 0),
        matchedSalesAmount: salesTotal,
        tradingAP: purchaseBills.filter((bill) => activeStatus(bill.status)).reduce((sum, bill) => sum + toNumber(bill.payable_balance), 0),
        tradingAR: salesBills.filter((bill) => activeStatus(bill.status)).reduce((sum, bill) => sum + toNumber(bill.receivable_balance), 0),
        totalDeals: rows.length,
        unmatchedPurchasesAmount,
        unmatchedPurchaseBills: purchaseRows.filter((row) => row.remainingAmount > 0.01).length,
        unmatchedSalesAmount,
        unmatchedSalesBills: salesRows.filter((row) => row.remainingAmount > 0.01).length,
      },
      productList: Array.from(productRowsByKey.values()).sort((left, right) => right.sales - left.sales),
      topProducts: Array.from(productMap.values())
        .sort((left, right) => right.grossProfit - left.grossProfit)
        .slice(0, 10),
      trend: Array.from(trendMap.values()).sort((left, right) => left.date.localeCompare(right.date)),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Trading Dashboard ไม่ได้', 500)
  }
}
