import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { parseReportDate, reportTimingHeaders } from '@/lib/server/dashboard-report-shared'
import { buildDashboardSummary } from '@/lib/server/dashboard-summary'
import { REPORT_PAGE_PERMISSIONS } from '@/lib/report-permissions'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const startedAt = performance.now()
  const authStartedAt = performance.now()
  try {
    const context = await getCurrentAuthContext()
    const authFinishedAt = performance.now()
    requirePermission(context, REPORT_PAGE_PERMISSIONS.dashboardOverview)
    const params = request.nextUrl.searchParams
    const payload = await buildDashboardSummary({
      branchId: params.get('branchId') || undefined,
      customerId: params.get('customerId') || undefined,
      date: parseReportDate(params.get('date')),
      dateFrom: params.get('from') || undefined,
      dateTo: params.get('to') || undefined,
      group: params.get('group') || undefined,
      productId: params.get('productId') || undefined,
      supplierId: params.get('supplierId') || undefined,
    })
    return NextResponse.json(payload, { headers: reportTimingHeaders(startedAt, authStartedAt, authFinishedAt) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Dashboard Overview ไม่ได้', 500)
  }
}
