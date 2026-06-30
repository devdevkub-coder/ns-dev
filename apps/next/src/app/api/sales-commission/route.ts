import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildSalesCommission } from '@/lib/server/main-sales-control'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')

    const { searchParams } = request.nextUrl
    const dateFrom = searchParams.get('dateFrom') || undefined
    const dateTo = searchParams.get('dateTo') || undefined
    const branchId = searchParams.get('branchId') || undefined

    return NextResponse.json(await buildSalesCommission({ dateFrom, dateTo, branchId }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Sales Commission ไม่ได้', 500)
  }
}
