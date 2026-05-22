import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildProfitCostAnalysis, defaultProfitCostRange } from '@/lib/server/profit-cost-analysis'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')

    const fallback = defaultProfitCostRange()
    const params = request.nextUrl.searchParams
    const metalGroups = params.getAll('metalGroup').flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean)

    return NextResponse.json(await buildProfitCostAnalysis({
      branchId: params.get('branchId') || undefined,
      customerId: params.get('customerId') || undefined,
      dateFrom: params.get('from') || fallback.from,
      dateTo: params.get('to') || fallback.to,
      metalGroups,
      salesChannelId: params.get('salesChannelId') || undefined,
      supplierId: params.get('supplierId') || undefined,
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Profit & Cost Analysis ไม่ได้', 500)
  }
}
