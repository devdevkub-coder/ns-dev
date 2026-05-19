import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type PoSellItem = {
  productCode?: string
  productId?: string
  productName?: string
  qty?: number | string
  remainingQty?: number | string
  totalAmount?: number | string
  totalRevenue?: number | string
  unitPrice?: number | string
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function itemRows(row: { items: unknown; product_id: string | null; qty: unknown; remaining_qty: unknown; unit_price: unknown }, productName: string) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoSellItem => typeof item === 'object' && item !== null)
      .map((item) => ({
        productId: item.productId ?? '',
        productName: item.productName ?? item.productCode ?? productName,
        qty: jsonNumber(item.qty),
        remainingQty: jsonNumber(item.remainingQty ?? item.qty),
        totalAmount: jsonNumber(item.totalRevenue ?? item.totalAmount),
        unitPrice: jsonNumber(item.unitPrice),
      }))
  }

  return [{
    productId: row.product_id ?? '',
    productName,
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    totalAmount: 0,
    unitPrice: jsonNumber(row.unit_price),
  }]
}

function matchStatus(matchedQty: number, qty: number) {
  if (matchedQty <= 0) return 'Not Matched'
  if (qty > 0 && matchedQty > qty + 0.001) return 'Over Matched'
  if (qty > 0 && matchedQty >= qty - 0.001) return 'Fully Matched'
  return 'Partially Matched'
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'PO Sell')
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
    const matchStatusFilter = url.searchParams.get('matchStatus')
    const activeStatusFilter = statusFilter && statusFilter !== 'all' ? statusFilter : null
    const activeMatchStatusFilter = matchStatusFilter && matchStatusFilter !== 'all' ? matchStatusFilter : null

    const [poSells, branches, channels, products, salesBills, tradingDeals] = await Promise.all([
      prisma.po_sells.findMany({
        include: { customers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
      }),
      prisma.branches.findMany({ select: { id: true, name: true } }),
      prisma.sales_channels.findMany({ select: { id: true, name: true } }),
      prisma.products.findMany({ select: { code: true, id: true, name: true } }),
      prisma.sales_bills.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' }, po_sell_id: { not: null } },
      }),
      prisma.trading_deals.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: { in: ['Cancelled', 'cancelled'] } } },
      }),
    ])

    const branchById = new Map(branches.map((branch) => [branch.id, branch]))
    const channelById = new Map(channels.map((channel) => [channel.id, channel]))
    const productById = new Map(products.map((product) => [product.id, product]))

    const salesBillIdsByPoSellId = new Map<string, Set<string>>()
    salesBills.forEach((bill) => {
      if (!bill.po_sell_id) return
      const current = salesBillIdsByPoSellId.get(bill.po_sell_id) ?? new Set<string>()
      current.add(bill.id)
      salesBillIdsByPoSellId.set(bill.po_sell_id, current)
    })

    const tradingDealsBySalesBillId = new Map<string, typeof tradingDeals>()
    tradingDeals.forEach((deal) => {
      if (!deal.sales_bill_id) return
      const current = tradingDealsBySalesBillId.get(deal.sales_bill_id) ?? []
      current.push(deal)
      tradingDealsBySalesBillId.set(deal.sales_bill_id, current)
    })

    const matchedByPoSellId = new Map<string, { cost: number; qty: number; salesAmount: number }>()
    poSells.forEach((po) => {
      const billIds = salesBillIdsByPoSellId.get(po.id) ?? new Set<string>()
      let cost = 0
      let qty = 0
      let salesAmount = 0
      billIds.forEach((billId) => {
        const deals = tradingDealsBySalesBillId.get(billId) ?? []
        deals.forEach((deal) => {
          cost += toNumber(deal.matched_purchase_amount)
          qty += toNumber(deal.matched_qty)
          salesAmount += toNumber(deal.matched_sales_amount)
        })
      })
      matchedByPoSellId.set(po.id, { cost, qty, salesAmount })
    })

    const rows = poSells.map((po) => {
      const fallbackProductName = po.product_id ? productById.get(po.product_id)?.name ?? po.product_id : ''
      const items = itemRows(po, fallbackProductName)
      const qty = items.reduce((sum, item) => sum + item.qty, 0) || toNumber(po.qty)
      const remainingQty = items.reduce((sum, item) => sum + item.remainingQty, 0) || toNumber(po.remaining_qty)
      const totalAmount = toNumber(po.total_amount) || items.reduce((sum, item) => sum + (item.totalAmount || item.qty * item.unitPrice), 0)
      const remainingAmount = toNumber(po.remaining_amount) || items.reduce((sum, item) => sum + item.remainingQty * item.unitPrice, 0)
      const matched = matchedByPoSellId.get(po.id) ?? { cost: 0, qty: 0, salesAmount: 0 }
      const margin = matched.salesAmount > 0 ? matched.salesAmount - matched.cost : totalAmount - matched.cost
      const status = po.status ?? 'Open'
      const currentMatchStatus = matchStatus(matched.qty, qty)

      return {
        branchName: po.branch_id ? branchById.get(po.branch_id)?.name ?? po.branch_id : '-',
        channelName: po.channel_id ? channelById.get(po.channel_id)?.name ?? po.channel_id : '-',
        customerName: po.customers?.name ?? po.customer_id ?? '-',
        date: toDateOnly(po.date),
        docNo: po.doc_no,
        expectedDelivery: toDateOnly(po.expected_delivery),
        id: po.id,
        itemCount: items.length,
        margin,
        marginPct: totalAmount > 0 ? (margin / totalAmount) * 100 : 0,
        matchStatus: currentMatchStatus,
        matchedCost: matched.cost,
        matchedPct: qty > 0 ? (matched.qty / qty) * 100 : 0,
        matchedQty: matched.qty,
        productName: items.map((item) => item.productName).filter(Boolean).join(', ') || fallbackProductName || '-',
        qty,
        remainingAmount,
        remainingQty,
        requireDelivery: po.require_delivery !== false,
        status,
        totalAmount,
        unitPrice: qty > 0 ? totalAmount / qty : toNumber(po.unit_price),
      }
    })
      .filter((row) => !activeStatusFilter || row.status === activeStatusFilter)
      .filter((row) => !activeMatchStatusFilter || row.matchStatus === activeMatchStatusFilter)
      .filter((row) => !q || `${row.docNo} ${row.customerName} ${row.channelName} ${row.branchName} ${row.productName} ${row.status} ${row.matchStatus}`.toLowerCase().includes(q))

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows.map((row) => ({
        Branch: row.branchName,
        Channel: row.channelName,
        Customer: row.customerName,
        Date: row.date,
        DocNo: row.docNo,
        ExpectedDelivery: row.expectedDelivery,
        Margin: row.margin,
        MarginPct: row.marginPct,
        MatchStatus: row.matchStatus,
        MatchedCost: row.matchedCost,
        MatchedPct: row.matchedPct,
        MatchedQty: row.matchedQty,
        Product: row.productName,
        Qty: row.qty,
        RemainingAmount: row.remainingAmount,
        RemainingQty: row.remainingQty,
        Status: row.status,
        TotalAmount: row.totalAmount,
      }))), 'po_sell.xlsx')
    }

    return NextResponse.json({
      filters: {
        matchStatuses: Array.from(new Set(rows.map((row) => row.matchStatus))).sort(),
        statuses: Array.from(new Set(poSells.map((row) => row.status ?? 'Open'))).sort(),
      },
      rows,
      summary: {
        fullyMatched: rows.filter((row) => row.matchStatus === 'Fully Matched').length,
        margin: rows.reduce((sum, row) => sum + row.margin, 0),
        open: rows.filter((row) => !['Cancelled', 'cancelled', 'Received', 'received'].includes(row.status)).length,
        overMatched: rows.filter((row) => row.matchStatus === 'Over Matched').length,
        partiallyMatched: rows.filter((row) => row.matchStatus === 'Partially Matched').length,
        qty: rows.reduce((sum, row) => sum + row.qty, 0),
        remainingAmount: rows.reduce((sum, row) => sum + row.remainingAmount, 0),
        remainingQty: rows.reduce((sum, row) => sum + row.remainingQty, 0),
        totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
        totalRows: rows.length,
        unmatched: rows.filter((row) => row.matchStatus === 'Not Matched').length,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด PO Sell ไม่ได้', 500)
  }
}
