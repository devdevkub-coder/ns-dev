import { NextResponse } from 'next/server'
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

function isCancelled(status: string) {
  return status === 'Cancelled' || status === 'cancelled'
}

function monthKey(date: string) {
  return date.slice(0, 7) || 'ไม่ระบุ'
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
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const activeStatusFilter = statusFilter && statusFilter !== 'all' ? statusFilter : null

    const deals = await prisma.trading_deals.findMany({
      include: {
        customers: true,
        products: true,
        suppliers: true,
      },
      orderBy: [{ date: 'desc' }, { deal_no: 'desc' }],
      take: 5000,
    })

    const rows = deals.map((deal) => {
      const salesAmount = toNumber(deal.matched_sales_amount)
      const purchaseAmount = toNumber(deal.matched_purchase_amount)
      const grossProfit = salesAmount - purchaseAmount

      return {
        customerName: deal.customers?.name ?? deal.customer_id ?? '-',
        date: toDateOnly(deal.date),
        dealNo: deal.deal_no,
        grossProfit,
        grossProfitPct: salesAmount > 0 ? (grossProfit / salesAmount) * 100 : 0,
        id: deal.id,
        matchedPurchaseAmount: purchaseAmount,
        matchedQty: toNumber(deal.matched_qty),
        matchedSalesAmount: salesAmount,
        productName: deal.products?.name ?? deal.product_id ?? '-',
        purchaseBillNo: deal.purchase_bill_no ?? '',
        salesBillNo: deal.sales_bill_no ?? '',
        status: deal.status ?? 'Open',
        supplierName: deal.suppliers?.name ?? deal.supplier_id ?? '-',
      }
    })
      .filter((row) => !activeStatusFilter || row.status === activeStatusFilter)
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => {
        if (!q) return true
        return `${row.dealNo} ${row.purchaseBillNo} ${row.salesBillNo} ${row.supplierName} ${row.customerName} ${row.productName} ${row.status}`.toLowerCase().includes(q)
      })

    const activeRows = rows.filter((row) => !isCancelled(row.status))
    const statusMap = new Map<string, { count: number; grossProfit: number; matchedPurchaseAmount: number; matchedSalesAmount: number; status: string }>()
    rows.forEach((row) => {
      const current = statusMap.get(row.status) ?? { count: 0, grossProfit: 0, matchedPurchaseAmount: 0, matchedSalesAmount: 0, status: row.status }
      current.count += 1
      current.grossProfit += row.grossProfit
      current.matchedPurchaseAmount += row.matchedPurchaseAmount
      current.matchedSalesAmount += row.matchedSalesAmount
      statusMap.set(row.status, current)
    })

    const trendMap = new Map<string, { grossProfit: number; matchedPurchaseAmount: number; matchedQty: number; matchedSalesAmount: number; month: string }>()
    activeRows.forEach((row) => {
      const month = monthKey(row.date)
      addAmount(trendMap, month, { grossProfit: 0, matchedPurchaseAmount: 0, matchedQty: 0, matchedSalesAmount: 0, month }, row)
    })

    const productMap = new Map<string, { grossProfit: number; matchedPurchaseAmount: number; matchedQty: number; matchedSalesAmount: number; productName: string }>()
    activeRows.forEach((row) => {
      addAmount(productMap, row.productName, { grossProfit: 0, matchedPurchaseAmount: 0, matchedQty: 0, matchedSalesAmount: 0, productName: row.productName }, row)
    })

    const salesTotal = activeRows.reduce((sum, row) => sum + row.matchedSalesAmount, 0)
    const grossProfit = activeRows.reduce((sum, row) => sum + row.grossProfit, 0)

    return NextResponse.json({
      filters: {
        statuses: Array.from(new Set(deals.map((deal) => deal.status ?? 'Open'))).sort(),
      },
      recentDeals: rows.slice(0, 20),
      statusBreakdown: Array.from(statusMap.values()).sort((left, right) => right.count - left.count),
      summary: {
        activeDeals: activeRows.length,
        cancelledDeals: rows.filter((row) => isCancelled(row.status)).length,
        grossProfit,
        grossProfitPct: salesTotal > 0 ? (grossProfit / salesTotal) * 100 : 0,
        matchedPurchaseAmount: activeRows.reduce((sum, row) => sum + row.matchedPurchaseAmount, 0),
        matchedQty: activeRows.reduce((sum, row) => sum + row.matchedQty, 0),
        matchedSalesAmount: salesTotal,
        totalDeals: rows.length,
      },
      topProducts: Array.from(productMap.values())
        .sort((left, right) => right.grossProfit - left.grossProfit)
        .slice(0, 10),
      trend: Array.from(trendMap.values()).sort((left, right) => left.month.localeCompare(right.month)),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Trading Dashboard ไม่ได้', 500)
  }
}
