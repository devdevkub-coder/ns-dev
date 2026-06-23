import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { loadProductionMetrics, summarizeProductionMetrics, summarizeProductionOutputProducts } from '@/lib/server/production-reports'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.reports.view')
    const url = new URL(request.url)
    const rows = await loadProductionMetrics({
      branchId: url.searchParams.get('branchId') || undefined,
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
      machineId: url.searchParams.get('machineId') || undefined,
      status: url.searchParams.get('status') || undefined,
    })
    return NextResponse.json({
      productSummary: summarizeProductionOutputProducts(rows),
      rows,
      summary: summarizeProductionMetrics(rows),
      wipRows: rows.filter((row) => row.wipQty > 0.000001),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายงานการผลิตไม่ได้', 500)
  }
}
