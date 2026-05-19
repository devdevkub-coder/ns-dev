import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

function isCancelled(status: string | null | undefined) {
  return status === 'Cancelled' || status === 'cancelled'
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Trading Matching')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
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

    const [purchaseBills, salesBills, deals] = await Promise.all([
      prisma.purchase_bills.findMany({
        include: { suppliers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { NOT: { status: 'cancelled' }, transaction_mode: 'TRADING' },
      }),
      prisma.sales_bills.findMany({
        include: { customers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { NOT: { status: 'cancelled' }, transaction_mode: 'TRADING' },
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
    ])

    const activeDeals = deals.filter((deal) => !isCancelled(deal.status))
    const matchedPurchaseMap = new Map<string, number>()
    const matchedSalesMap = new Map<string, number>()
    activeDeals.forEach((deal) => {
      if (deal.purchase_bill_id) matchedPurchaseMap.set(deal.purchase_bill_id, (matchedPurchaseMap.get(deal.purchase_bill_id) ?? 0) + toNumber(deal.matched_purchase_amount))
      if (deal.sales_bill_id) matchedSalesMap.set(deal.sales_bill_id, (matchedSalesMap.get(deal.sales_bill_id) ?? 0) + toNumber(deal.matched_sales_amount))
    })

    const purchaseRows = purchaseBills.map((bill) => {
      const total = toNumber(bill.subtotal) || toNumber(bill.total_amount)
      const matchedAmount = matchedPurchaseMap.get(bill.id) ?? 0
      return {
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.id,
        matchedAmount,
        remainingAmount: Math.max(0, total - matchedAmount),
        supplierName: bill.suppliers?.name ?? bill.supplier_id ?? '-',
        totalAmount: total,
      }
    })

    const salesRows = salesBills.map((bill) => {
      const total = toNumber(bill.subtotal) || toNumber(bill.total_amount)
      const matchedAmount = matchedSalesMap.get(bill.id) ?? 0
      return {
        customerName: bill.customers?.name ?? bill.customer_id ?? '-',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.id,
        matchedAmount,
        remainingAmount: Math.max(0, total - matchedAmount),
        totalAmount: total,
      }
    })

    const dealRows = deals.map((deal) => {
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
        status: deal.status ?? '',
        supplierName: deal.suppliers?.name ?? deal.supplier_id ?? '-',
      }
    })
      .filter((deal) => !activeStatusFilter || deal.status === activeStatusFilter)
      .filter((deal) => !from || deal.date >= from)
      .filter((deal) => !to || deal.date <= to)
      .filter((deal) => {
        if (!q) return true
        return `${deal.dealNo} ${deal.purchaseBillNo} ${deal.salesBillNo} ${deal.supplierName} ${deal.customerName} ${deal.productName} ${deal.status}`.toLowerCase().includes(q)
      })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(dealRows.map((deal) => ({
        Cost: deal.matchedPurchaseAmount,
        Customer: deal.customerName,
        Date: deal.date,
        DealNo: deal.dealNo,
        GP: deal.grossProfit,
        GPPct: deal.grossProfitPct,
        Product: deal.productName,
        PurchaseBillNo: deal.purchaseBillNo,
        Qty: deal.matchedQty,
        Sales: deal.matchedSalesAmount,
        SalesBillNo: deal.salesBillNo,
        Status: deal.status,
        Supplier: deal.supplierName,
      }))), 'trading_matching.xlsx')
    }

    return NextResponse.json({
      deals: dealRows,
      filters: {
        statuses: Array.from(new Set(deals.map((deal) => deal.status ?? 'Open'))).sort(),
      },
      purchases: purchaseRows,
      sales: salesRows,
      summary: {
        activeDeals: activeDeals.length,
        grossProfit: dealRows.filter((deal) => !isCancelled(deal.status)).reduce((sum, deal) => sum + deal.grossProfit, 0),
        purchaseRemaining: purchaseRows.reduce((sum, row) => sum + row.remainingAmount, 0),
        purchaseTotal: purchaseRows.reduce((sum, row) => sum + row.totalAmount, 0),
        salesRemaining: salesRows.reduce((sum, row) => sum + row.remainingAmount, 0),
        salesTotal: salesRows.reduce((sum, row) => sum + row.totalAmount, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Trading Matching ไม่ได้', 500)
  }
}
