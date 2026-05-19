import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildTaxVatWht } from '@/lib/server/finance-accounting-tax'

export const runtime = 'nodejs'

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const now = new Date()
    const params = request.nextUrl.searchParams
    const month = Math.min(12, Math.max(1, parseIntParam(params.get('month'), now.getMonth() + 1)))
    const year = parseIntParam(params.get('year'), now.getFullYear())
    const payload = await buildTaxVatWht({
      branchId: params.get('branchId') || undefined,
      month,
      year,
    })

    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Tax / VAT / WHT ไม่ได้', 500)
  }
}
