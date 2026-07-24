import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, ProductionOrderError, reverseProductionInput, reverseProductionInputSchema } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ReturnRouteContext = { params: Promise<{ docNo: string; inputDocNo: string }> }

export async function POST(request: Request, context: ReturnRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.input_return')
    const { docNo, inputDocNo } = await context.params
    const allowedBranchCodes = getBranchCodeIntersection(auth)
    await assertProductionOrderBranchAccess(docNo, allowedBranchCodes)
    const values = reverseProductionInputSchema.parse(await request.json())
    return NextResponse.json(await reverseProductionInput(docNo, inputDocNo, values, currentActor(auth)))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'คืนวัตถุดิบไม่ได้', 500)
  }
}
