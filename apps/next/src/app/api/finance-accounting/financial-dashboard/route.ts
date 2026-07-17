import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { buildFinancialDashboard } from '@/lib/server/finance-accounting-dashboard'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'

export const runtime = 'nodejs'

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')
    const params = request.nextUrl.searchParams
    const branchParam = params.get('branchId')?.trim().toUpperCase()
    const branchId = branchParam && branchParam !== 'ALL' ? branchParam : undefined
    const allowedBranchCodes = getFinanceBranchCodeIntersection(context)
    if (branchId && getFinanceBranchCodeIntersection(context, branchId)?.length === 0) {
      return apiErrorResponse(new Error('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ'), 'ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403)
    }
    const payload = await buildFinancialDashboard({
      allowedBranchCodes,
      asOf: parseDate(params.get('asOf'), new Date()),
      branchId,
    })
    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof FinancialStatementInputError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'โหลด Financial Dashboard ไม่ได้', 500)
  }
}
