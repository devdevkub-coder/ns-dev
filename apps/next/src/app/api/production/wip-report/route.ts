import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { loadProductionMetrics, summarizeProductionMetrics } from '@/lib/server/production-reports'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.operations.view')
    const now = new Date()
    const rows = (await loadProductionMetrics())
      .filter((row) => row.wipQty > 0)
      .map((row) => ({
        ...row,
        ageDays: Math.max(0, Math.floor((now.getTime() - new Date(`${row.date}T00:00:00.000Z`).getTime()) / 86400000)),
      }))
      .sort((a, b) => b.ageDays - a.ageDays || b.wipQty - a.wipQty)
    return NextResponse.json({ rows, summary: summarizeProductionMetrics(rows) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด WIP คงเหลือไม่ได้', 500)
  }
}
