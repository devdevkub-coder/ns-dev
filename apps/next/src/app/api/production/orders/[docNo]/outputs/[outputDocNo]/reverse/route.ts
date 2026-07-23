import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, ProductionOrderError, reverseProductionOutput, reverseProductionOutputSchema } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ProductionOutputReverseRouteContext = {
  params: Promise<{ docNo: string; outputDocNo: string }>
}

export async function POST(request: Request, context: ProductionOutputReverseRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.reverse')
    const { docNo, outputDocNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    const values = reverseProductionOutputSchema.parse(await request.json())
    return NextResponse.json(await reverseProductionOutput(docNo, outputDocNo, values, currentActor(auth)))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'reverse การรับผลผลิตไม่ได้', 500)
  }
}
