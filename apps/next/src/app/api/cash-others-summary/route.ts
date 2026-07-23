import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildCashOthersSummary } from '@/lib/server/cash-others-anomaly'
import { REPORT_PAGE_PERMISSIONS } from '@/lib/report-permissions'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, REPORT_PAGE_PERMISSIONS.cashOthersSummary)
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await buildCashOthersSummary(searchParams.get('asOf')))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cash & Others Summary ไม่ได้', 500)
  }
}
