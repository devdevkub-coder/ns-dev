import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { bangkokDateStart, toBangkokDateOnly } from '@/lib/server/daily'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'
import { buildStockFinanceHistory } from '@/lib/server/finance-accounting-working-capital'

export const runtime = 'nodejs'

function parseDateOnly(value: string | null, label: string) {
  const dateOnly = value?.trim()
  if (!dateOnly) throw new FinancialStatementInputError(`${label} ต้องอยู่ในรูปแบบ YYYY-MM-DD`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new FinancialStatementInputError(`${label} ต้องอยู่ในรูปแบบ YYYY-MM-DD`)
  }
  const parsed = bangkokDateStart(dateOnly)
  if (Number.isNaN(parsed.getTime()) || toBangkokDateOnly(parsed) !== dateOnly) {
    throw new FinancialStatementInputError(`${label} ไม่ถูกต้อง`)
  }
  return parsed
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
      return apiErrorResponse(new FinancialStatementInputError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403), 'ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403)
    }

    const from = parseDateOnly(params.get('from'), 'วันที่เริ่มต้น')
    const to = parseDateOnly(params.get('to'), 'วันที่สิ้นสุด')
    if (from > to) throw new FinancialStatementInputError('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด')

    const payload = await buildStockFinanceHistory({ allowedBranchCodes, branchId, from, to })
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof FinancialStatementInputError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'โหลดประวัติ Stock Finance ไม่ได้', 500)
  }
}
