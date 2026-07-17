import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { buildCashFlowStatement, FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'

export const runtime = 'nodejs'

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const params = request.nextUrl.searchParams
    const now = new Date()
    const branchParam = (params.get('branchId') || '').trim()
    const branchId = branchParam && branchParam.toUpperCase() !== 'ALL' ? branchParam.toUpperCase() : undefined
    const allowedBranchCodes = getFinanceBranchCodeIntersection(context)
    const payload = await buildCashFlowStatement({
      allowedBranchCodes,
      branchId,
      from: parseDate(params.get('from'), firstDayOfMonth(now)),
      to: parseDate(params.get('to'), now),
    })

    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof FinancialStatementInputError) {
      return NextResponse.json({ code: caught.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', error: caught.message }, { status: caught.status })
    }
    return apiErrorResponse(caught, 'โหลดงบกระแสเงินสดเพื่อการบริหารไม่ได้', 500)
  }
}
