import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

function isCancelled(status: string | null | undefined) {
  return status === 'Cancelled' || status === 'cancelled' || status === 'reversed'
}

function addAmount<TKey>(map: Map<TKey, number>, key: TKey | null | undefined, amount: number) {
  if (key == null) return
  map.set(key, (map.get(key) ?? 0) + amount)
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

    const [purchaseBills, salesBills, allocationFacts] = await Promise.all([
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
      prisma.trading_allocation_facts.findMany({
        include: {
          customers: true,
          products: true,
          purchase_bills: true,
          sales_bills: true,
          suppliers: true,
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 5000,
        where: { status: 'active' },
      }),
    ])

    const matchedPurchaseMap = new Map<bigint, number>()
    const matchedPurchaseDocMap = new Map<string, number>()
    const matchedSalesMap = new Map<bigint, number>()
    const matchedSalesDocMap = new Map<string, number>()
    allocationFacts.forEach((fact) => {
      if (isCancelled(fact.status)) return
      const matchedCost = toNumber(fact.matched_cogs)
      const matchedSales = toNumber(fact.sales_amount)
      addAmount(matchedPurchaseMap, fact.purchase_bill_id, matchedCost)
      addAmount(matchedPurchaseDocMap, fact.source_doc_no, matchedCost)
      addAmount(matchedSalesMap, fact.sales_bill_id, matchedSales)
      addAmount(matchedSalesDocMap, fact.sales_doc_no, matchedSales)
    })

    const purchaseRows = purchaseBills.map((bill) => {
      const total = toNumber(bill.subtotal) || toNumber(bill.total_amount)
      const matchedAmount = matchedPurchaseMap.get(bill.id) ?? matchedPurchaseDocMap.get(bill.doc_no) ?? 0
      return {
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.doc_no,
        matchedAmount,
        remainingAmount: Math.max(0, total - matchedAmount),
        supplierName: bill.suppliers?.name ?? '-',
        totalAmount: total,
      }
    })
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => !q || `${row.docNo} ${row.supplierName}`.toLowerCase().includes(q))

    const salesRows = salesBills.map((bill) => {
      const total = toNumber(bill.subtotal) || toNumber(bill.total_amount)
      const matchedAmount = matchedSalesMap.get(bill.id) ?? matchedSalesDocMap.get(bill.doc_no) ?? 0
      return {
        customerName: bill.customers?.name ?? '-',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.doc_no,
        matchedAmount,
        remainingAmount: Math.max(0, total - matchedAmount),
        totalAmount: total,
      }
    })
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => !q || `${row.docNo} ${row.customerName}`.toLowerCase().includes(q))

    const dealRows = allocationFacts.map((fact, index) => {
      const salesAmount = toNumber(fact.sales_amount)
      const purchaseAmount = toNumber(fact.matched_cogs)
      const grossProfit = salesAmount - purchaseAmount
      const customerName = fact.customer_name_snapshot ?? fact.customers?.name ?? '-'
      const supplierName = fact.supplier_name_snapshot ?? fact.suppliers?.name ?? '-'
      const productName = fact.product_name_snapshot ?? fact.products?.name ?? '-'
      const date = toDateOnly(fact.date)
      const status = fact.status ?? ''
      const purchaseBillNo = fact.source_doc_no ?? fact.purchase_bills?.doc_no ?? ''
      const salesBillNo = fact.sales_doc_no ?? fact.sales_bills?.doc_no ?? ''
      return {
        customerName,
        date,
        dealNo: fact.allocation_no,
        grossProfit,
        grossProfitPct: salesAmount > 0 ? (grossProfit / salesAmount) * 100 : 0,
        id: `${fact.allocation_no}:${purchaseBillNo}:${salesBillNo}:${supplierName}:${customerName}:${productName}:${date}:${status}:${index}`,
        matchedPurchaseAmount: purchaseAmount,
        matchedQty: toNumber(fact.qty),
        matchedSalesAmount: salesAmount,
        productName,
        purchaseBillNo,
        salesBillNo,
        status,
        supplierName,
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
        Customer: stringifyBusinessValue(deal.customerName),
        Date: deal.date,
        ExpectedGP: deal.grossProfit,
        GPPct: deal.grossProfitPct,
        Product: deal.productName,
        CostSource: deal.purchaseBillNo,
        Qty: deal.matchedQty,
        Sales: deal.matchedSalesAmount,
        SalesBillNo: deal.salesBillNo,
        Supplier: stringifyBusinessValue(deal.supplierName),
      }))), 'trading_matching.xlsx')
    }

    return NextResponse.json({
      deals: dealRows,
      filters: {
        statuses: Array.from(new Set(allocationFacts.map((fact) => fact.status ?? 'active'))).sort(),
      },
      purchases: purchaseRows,
      sales: salesRows,
      summary: {
        activeDeals: dealRows.filter((deal) => !isCancelled(deal.status)).length,
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
