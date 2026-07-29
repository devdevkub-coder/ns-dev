import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, ProductionOrderError, returnProductionInput, returnProductionInputSchema } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ReturnRouteContext = { params: Promise<{ docNo: string; inputDocNo: string }> }

export async function POST(request: Request, context: ReturnRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.input_return')
    const { docNo, inputDocNo } = await context.params
    const allowedBranchCodes = getBranchCodeIntersection(auth)
    await assertProductionOrderBranchAccess(docNo, allowedBranchCodes)
    const requestValues = await request.json()
    const values = returnProductionInputSchema.parse({
      lines: requestValues.lines ?? (requestValues.qty ? [{ inputId: inputDocNo, qty: requestValues.qty }] : []),
      reason: requestValues.reason,
    })
    return NextResponse.json(await returnProductionInput(docNo, values, currentActor(auth)))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'คืนวัตถุดิบไม่ได้', 500)
  }
}
