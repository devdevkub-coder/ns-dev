import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type DealMarginRow = {
  avgCost: number
  channel: string
  customer: string
  date: string
  docNo: string
  id: string
  margin: number
  marginPct: number
  matchedCost: number
  matchedQty: number
  product: string
  sellQty: number
  statusMatch: 'Fully' | 'None' | 'Partial'
  totalRevenue: number
  unitPrice: number
}

function buildWorkbook(rows: DealMarginRow[]) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    AvgCost: row.avgCost,
    Channel: row.channel,
    Customer: row.customer,
    Date: row.date,
    DealNo: row.docNo,
    Margin: row.margin,
    MarginPct: row.marginPct,
    MatchedCost: row.matchedCost,
    MatchedQty: row.matchedQty,
    Product: row.product,
    Revenue: row.totalRevenue,
    SellQty: row.sellQty,
    StatusMatch: row.statusMatch,
    UnitPrice: row.unitPrice,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Deal Margin')
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

function statusMatch(qty: number, matchedQty: number, rawStatus?: string | null): DealMarginRow['statusMatch'] {
  const normalizedStatus = rawStatus?.toLowerCase() ?? ''
  if (normalizedStatus.includes('partial')) return 'Partial'
  if (normalizedStatus.includes('none') || normalizedStatus.includes('unmatched')) return 'None'
  if (normalizedStatus.includes('fully') || normalizedStatus.includes('complete')) return 'Fully'
  if (matchedQty <= 0) return 'None'
  if (qty > 0 && matchedQty >= qty - 0.001) return 'Fully'
  return 'Partial'
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const channel = url.searchParams.get('channel')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const deals = await prisma.trading_deals.findMany({
      include: { customers: true, products: true, sales_bills: true },
      orderBy: [{ date: 'desc' }, { deal_no: 'desc' }],
      take: 10000,
      where: { NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
    })

    const rows: DealMarginRow[] = deals.map((deal) => {
      const matchedQty = toNumber(deal.matched_qty)
      const matchedCost = toNumber(deal.matched_purchase_amount)
      const totalRevenue = toNumber(deal.matched_sales_amount)
      const margin = totalRevenue - matchedCost
      const unitPrice = matchedQty > 0 ? totalRevenue / matchedQty : 0
      return {
        avgCost: matchedQty > 0 ? matchedCost / matchedQty : 0,
        channel: 'Trading Deal',
        customer: deal.customers?.name ?? '-',
        date: toDateOnly(deal.date),
        docNo: deal.deal_no,
        id: deal.deal_no,
        margin,
        marginPct: totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0,
        matchedCost,
        matchedQty,
        product: deal.products?.name ?? '-',
        sellQty: matchedQty,
        statusMatch: statusMatch(matchedQty, matchedQty, deal.status),
        totalRevenue,
        unitPrice,
      }
    })
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => !channel || channel === 'all' || row.channel === channel)

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows), 'deal_margin.xlsx')
    }

    const revenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0)
    const cost = rows.reduce((sum, row) => sum + row.matchedCost, 0)
    const margin = revenue - cost

    return NextResponse.json({
      filters: {
        channels: Array.from(new Set(rows.map((row) => row.channel))).sort(),
      },
      rows,
      summary: {
        cost,
        fullyMatched: rows.filter((row) => row.statusMatch === 'Fully').length,
        margin,
        marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
        none: rows.filter((row) => row.statusMatch === 'None').length,
        partial: rows.filter((row) => row.statusMatch === 'Partial').length,
        revenue,
        rows: rows.length,
      },
      topDeals: [...rows].sort((left, right) => right.margin - left.margin).slice(0, 5),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Deal Margin ไม่ได้', 500)
  }
}
