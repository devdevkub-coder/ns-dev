import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import { isTradingMatchingAllocationFact } from '@/lib/server/trading-matching'

export const runtime = 'nodejs'

type DealMarginRow = {
  allocationNo: string
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

async function buildWorkbook(rows: DealMarginRow[]) {
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
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
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

function isDualCostingGroup(group: string | null | undefined) {
  const normalized = (group ?? '').trim().toLowerCase()
  return normalized.includes('ทองแดง')
    || normalized.includes('ทองเหลือง')
    || normalized.includes('copper')
    || normalized.includes('brass')
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const channel = url.searchParams.get('channel')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const allocations = await prisma.trading_allocation_facts.findMany({
      include: { customers: true, products: true, sales_bills: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 5000,
      where: { status: 'active' },
    })

    const rows: DealMarginRow[] = allocations
      .filter(isTradingMatchingAllocationFact)
      .filter((allocation) => isDualCostingGroup(
        allocation.products?.metal_group
        ?? allocation.product_name_snapshot
        ?? allocation.products?.name,
      ))
      .map((allocation, index) => {
        const matchedQty = toNumber(allocation.qty)
        const matchedCost = toNumber(allocation.matched_cogs)
        const totalRevenue = toNumber(allocation.sales_amount)
        const margin = totalRevenue - matchedCost
        const unitPrice = matchedQty > 0 ? totalRevenue / matchedQty : 0
        const customer = allocation.customer_name_snapshot ?? allocation.customers?.name ?? '-'
        const product = allocation.product_name_snapshot ?? allocation.products?.name ?? '-'
        const date = toDateOnly(allocation.date)
        const docNo = allocation.sales_doc_no ?? allocation.sales_bills?.doc_no ?? allocation.allocation_no
        const rowStatusMatch = statusMatch(matchedQty, matchedQty, allocation.status)
        return {
          allocationNo: allocation.allocation_no,
          avgCost: matchedQty > 0 ? matchedCost / matchedQty : 0,
          channel: 'Trading Deal',
          customer,
          date,
          docNo,
          id: `${docNo}:${allocation.allocation_no}:${customer}:${product}:${date}:${rowStatusMatch}:${index}`,
          margin,
          marginPct: totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0,
          matchedCost,
          matchedQty,
          product,
          sellQty: matchedQty,
          statusMatch: rowStatusMatch,
          totalRevenue,
          unitPrice,
        }
      })
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => !channel || channel === 'all' || row.channel === channel)

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(rows), 'deal_margin.xlsx')
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
