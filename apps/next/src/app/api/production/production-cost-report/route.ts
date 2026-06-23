import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { loadProductionMetrics, summarizeProductionMetrics } from '@/lib/server/production-reports'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.reports.view')
    const url = new URL(request.url)
    const rows = await loadProductionMetrics({
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
    })
    const summary = summarizeProductionMetrics(rows)
    const breakdown = rows.reduce<Record<string, number>>((acc, row) => {
      Object.entries(row.costBreakdown).forEach(([key, value]) => {
        acc[key] = (acc[key] ?? 0) + value
      })
      return acc
    }, { RM: summary.inputCost })
    return NextResponse.json({ breakdown, rows, summary })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Production Cost Report ไม่ได้', 500)
  }
}
