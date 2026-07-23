import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getAllowedBranchIds } from '@/lib/server/branch-scope'
import { loadProductionDashboard } from '@/lib/server/production-dashboard'

export const runtime = 'nodejs'

function defaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.operations.view')
    const url = new URL(request.url)
    const fallback = defaultRange()
    const dateFrom = url.searchParams.get('dateFrom') || fallback.dateFrom
    const dateTo = url.searchParams.get('dateTo') || fallback.dateTo
    const allowedBranchIds = await getAllowedBranchIds(context)
    const response = await loadProductionDashboard({ allowedBranchIds, dateFrom, dateTo })
    return NextResponse.json(response, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Production Dashboard ไม่ได้', 500)
  }
}
