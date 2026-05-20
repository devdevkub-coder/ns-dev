import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildDualCostingManagement } from '@/lib/server/dual-costing-management'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const status = url.searchParams.get('status')
    const category = url.searchParams.get('category')
    const targetType = url.searchParams.get('targetType')

    const payload = await buildDualCostingManagement()
    const rows = payload.ledgerRows
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => !status || status === 'all' || row.status === status)
      .filter((row) => !category || category === 'all' || row.productCategory === category)
      .filter((row) => !targetType || targetType === 'all' || row.targetType === targetType)
      .filter((row) => !q || `${row.matchId} ${row.saleDocNo} ${row.sourceNo} ${row.productName}`.toLowerCase().includes(q))

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
