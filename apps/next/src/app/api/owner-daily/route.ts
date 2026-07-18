import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { noStoreHeaders, parseReportDate } from '@/lib/server/dashboard-report-shared'
import { buildOwnerDailyDashboard } from '@/lib/server/owner-daily-dashboard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')
    const params = request.nextUrl.searchParams
    return NextResponse.json(await buildOwnerDailyDashboard({
      branchId: params.get('branchId') || undefined,
      date: parseReportDate(params.get('date')),
      dateFrom: params.get('from') || undefined,
      dateTo: params.get('to') || undefined,
    }), { headers: noStoreHeaders() })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Owner Daily ไม่ได้', 500)
  }
}
