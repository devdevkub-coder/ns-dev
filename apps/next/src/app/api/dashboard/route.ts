import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildMainDashboards } from '@/lib/server/main-dashboards'

export const runtime = 'nodejs'

function parseDate(value: string | null) {
  const parsed = value ? new Date(value) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')
    const params = request.nextUrl.searchParams
    return NextResponse.json(await buildMainDashboards({ date: parseDate(params.get('date')), dateFrom: params.get('from') || undefined, dateTo: params.get('to') || undefined }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Dashboard ไม่ได้', 500)
  }
}
