import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toBangkokDateOnly } from '@/lib/server/daily'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { buildCashFlowForecastCalendar, CashFlowValidationError } from '@/lib/server/finance-accounting-cashflow-planning'

export const runtime = 'nodejs'

function parseDate(value: string | null, fallback: string) {
  const normalized = value ?? fallback
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new CashFlowValidationError('วันที่เริ่มต้นต้องอยู่ในรูปแบบ YYYY-MM-DD')
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new CashFlowValidationError('วันที่เริ่มต้นไม่ถูกต้อง')
  }
  return parsed
}

function parseHorizon(value: string | null) {
  const normalized = value ?? '30'
  if (!['7', '30', '90'].includes(normalized)) {
    throw new CashFlowValidationError('ช่วงประมาณการต้องเป็น 7, 30 หรือ 90 วัน')
  }
  return Number(normalized)
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const params = request.nextUrl.searchParams
    const today = toBangkokDateOnly(new Date())
    const branchParam = (params.get('branchId') || '').trim()
    const branchId = branchParam && branchParam.toUpperCase() !== 'ALL' ? branchParam.toUpperCase() : undefined
    const allowedBranchCodes = getFinanceBranchCodeIntersection(context)
    if (branchId && getFinanceBranchCodeIntersection(context, branchId)?.length === 0) {
      throw new CashFlowValidationError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่ระบุ', 403)
    }
    const payload = await buildCashFlowForecastCalendar({
      allowedBranchCodes,
      branchId,
      horizon: parseHorizon(params.get('horizon')),
      startDate: parseDate(params.get('startDate'), today),
    })

    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof CashFlowValidationError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'โหลด CF Forecast Calendar ไม่ได้', 500)
  }
}
