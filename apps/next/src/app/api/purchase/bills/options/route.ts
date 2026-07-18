import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { optionsPayload, referenceOptionsPayload } from '@/app/api/purchase/bills/route'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const startedAt = performance.now()
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const scope = new URL(request.url).searchParams.get('scope') ?? 'full'
    const allowedBranchCodes = getBranchCodeIntersection(context)
    const payload = scope === 'reference'
      ? await referenceOptionsPayload(allowedBranchCodes)
      : await optionsPayload(allowedBranchCodes)

    console.info(JSON.stringify({
      durationMs: Math.round(performance.now() - startedAt),
      event: 'purchase_bill_options',
      scope,
    }))
    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดตัวเลือกบิลรับซื้อไม่ได้', 500)
  }
}
