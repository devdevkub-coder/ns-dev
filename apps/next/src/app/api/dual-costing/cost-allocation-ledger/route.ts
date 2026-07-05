import { NextResponse } from 'next/server'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildDualCostingManagement } from '@/lib/server/dual-costing-management'

export const runtime = 'nodejs'

type LedgerExportRow = Awaited<ReturnType<typeof buildDualCostingManagement>>['ledgerRows'][number]

function filterLedgerRows(rows: LedgerExportRow[], filters: {
  category: string | null
  from: string | null
  q: string | undefined
  status: string | null
  targetType: string | null
  to: string | null
}) {
  const { category, from, q, status, targetType, to } = filters

  return rows
    .filter((row) => !from || row.date >= from)
    .filter((row) => !to || row.date <= to)
    .filter((row) => !status || status === 'all' || row.status === status)
    .filter((row) => !category || category === 'all' || row.productCategory === category)
    .filter((row) => !targetType || targetType === 'all' || row.targetType === targetType)
    .filter((row) => !q || `${row.matchId} ${row.saleDocNo} ${row.sourceNo} ${row.productName}`.toLowerCase().includes(q))
}

async function buildWorkbook(rows: LedgerExportRow[]) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    MatchId: row.matchId,
    Type: row.targetType,
    SaleDoc: row.saleDocNo,
    Product: row.productName,
    Category: row.productCategory,
    SaleQty: row.saleQty,
    AllocatedQty: row.allocatedQty,
    CostPool: row.costPoolNo,
    CostPerKg: row.costPerKg,
    TotalCost: row.totalCost,
    Revenue: row.allocatedRevenue,
    GrossProfit: row.grossProfit,
    GpPct: row.gpPct,
    AllocatedBy: row.allocatedBy,
    AllocatedAt: row.allocatedAt,
    Status: row.status,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Allocation Ledger')
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

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const from = url.searchParams.get('from')
    const format = url.searchParams.get('format')
    const to = url.searchParams.get('to')
    const status = url.searchParams.get('status')
    const category = url.searchParams.get('category')
    const targetType = url.searchParams.get('targetType')

    const payload = await buildDualCostingManagement()
    const rows = filterLedgerRows(payload.ledgerRows, { category, from, q, status, targetType, to })

    if (format === 'xlsx') {
      return xlsxResponse(await buildWorkbook(rows), 'cost_allocation_ledger.xlsx')
    }

    const activeRows = rows.filter((row) => row.status === 'approved')
    const revenue = activeRows.reduce((sum, row) => sum + row.allocatedRevenue, 0)
    const cost = activeRows.reduce((sum, row) => sum + row.totalCost, 0)
    const gp = revenue - cost

    return NextResponse.json({
      filters: {
        categories: Array.from(new Set(payload.ledgerRows.map((row) => row.productCategory))).sort(),
        statuses: ['approved', 'reversed'],
        targetTypes: ['PO_SELL', 'SPOT_SELL'],
      },
      rows,
      summary: {
        active: activeRows.length,
        cost,
        gp,
        gpPct: revenue > 0 ? (gp / revenue) * 100 : 0,
        poCount: activeRows.filter((row) => row.targetType === 'PO_SELL').length,
        revenue,
        reversed: rows.length - activeRows.length,
        rows: rows.length,
        spotCount: activeRows.filter((row) => row.targetType === 'SPOT_SELL').length,
        totalQty: activeRows.reduce((sum, row) => sum + row.allocatedQty, 0),
      },
      writeDeferred: true,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Allocation Ledger ไม่ได้', 500)
  }
}
