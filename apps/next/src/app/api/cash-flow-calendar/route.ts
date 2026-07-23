import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildCashFlowCalendar } from '@/lib/server/main-calendars'
import { REPORT_PAGE_PERMISSIONS } from '@/lib/report-permissions'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, REPORT_PAGE_PERMISSIONS.cashFlowCalendar)
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await buildCashFlowCalendar(searchParams.get('month')))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cash Flow Calendar ไม่ได้', 500)
  }
}
