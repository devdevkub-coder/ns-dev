import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type MatchLogRow = {
  allocationMode: string
  costType: 'Purchase'
  date: string
  id: string
  matchId: string
  matchType: 'sales'
  product: string
  qtyUsed: number
  sourceNo: string
  sourceType: 'Trading_Deal'
  status: 'approved' | 'reversed'
  target: string
  totalCost: number
  unitCost: number
}

function buildWorkbook(rows: MatchLogRow[]) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    AllocationMode: row.allocationMode,
    CostType: row.costType,
    Date: row.date,
    MatchId: row.matchId,
    MatchType: row.matchType,
    Product: row.product,
    QtyUsed: row.qtyUsed,
    SourceNo: row.sourceNo,
    SourceType: row.sourceType,
    Status: row.status,
    Target: row.target,
    TotalCost: row.totalCost,
    UnitCost: row.unitCost,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Match Log')
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

function isCancelled(status: string | null | undefined) {
  return status === 'cancelled' || status === 'Cancelled'
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const costType = url.searchParams.get('costType')
    const matchType = url.searchParams.get('matchType')
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const status = url.searchParams.get('status')

    const deals = await prisma.trading_deals.findMany({
      include: { customers: true, products: true, purchase_bills: true, sales_bills: true, suppliers: true },
      orderBy: [{ date: 'desc' }, { deal_no: 'desc' }],
      take: 10000,
    })

    const rows: MatchLogRow[] = deals.map((deal) => {
      const qtyUsed = toNumber(deal.matched_qty)
      const totalCost = toNumber(deal.matched_purchase_amount)
      return {
        allocationMode: deal.auto_created ? 'Auto' : 'Trading',
        costType: 'Purchase' as const,
        date: toDateOnly(deal.date),
        id: deal.deal_no,
        matchId: deal.deal_no,
        matchType: 'sales' as const,
        product: deal.products?.name ?? '-',
        qtyUsed,
        sourceNo: deal.purchase_bill_no ?? deal.purchase_bills?.doc_no ?? '-',
        sourceType: 'Trading_Deal' as const,
        status: isCancelled(deal.status) ? 'reversed' as const : 'approved' as const,
        target: deal.sales_bill_no
          ?? deal.sales_bills?.doc_no
          ?? deal.customers?.name
          ?? '-',
        totalCost,
        unitCost: qtyUsed > 0 ? totalCost / qtyUsed : 0,
      }
    })
      .filter((row) => !costType || costType === 'all' || row.costType === costType)
      .filter((row) => !matchType || matchType === 'all' || row.matchType === matchType)
      .filter((row) => !status || status === 'all' || row.status === status)
      .filter((row) => !q || `${row.matchId} ${row.target} ${row.sourceNo} ${row.product} ${row.status}`.toLowerCase().includes(q))

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows), 'match_log.xlsx')
    }

    const activeRows = rows.filter((row) => row.status !== 'reversed')
    return NextResponse.json({
      filters: {
        costTypes: ['Purchase'],
        matchTypes: ['sales'],
        statuses: ['approved', 'reversed'],
      },
      rows,
      summary: {
        active: activeRows.length,
        reversed: rows.length - activeRows.length,
        sales: rows.length,
        total: rows.length,
        totalCost: activeRows.reduce((sum, row) => sum + row.totalCost, 0),
        totalQty: activeRows.reduce((sum, row) => sum + row.qtyUsed, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Match Log ไม่ได้', 500)
  }
}
