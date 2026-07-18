import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { noStoreHeaders, parseReportDate } from '@/lib/server/dashboard-report-shared'
import { buildDailyReportDashboard } from '@/lib/server/daily-report-dashboard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')
    const params = request.nextUrl.searchParams
    return NextResponse.json(await buildDailyReportDashboard({
      branchId: params.get('branchId') || undefined,
      customerId: params.get('customerId') || undefined,
      date: parseReportDate(params.get('date')),
      dateFrom: params.get('from') || undefined,
      dateTo: params.get('to') || undefined,
      group: params.get('group') || undefined,
      productId: params.get('productId') || undefined,
      supplierId: params.get('supplierId') || undefined,
    }), { headers: noStoreHeaders() })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Daily Report ไม่ได้', 500)
  }
}
