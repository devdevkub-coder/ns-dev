import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, ProductionOrderError, reverseProductionOutput, reverseProductionOutputSchema } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ProductionOutputVoidRouteContext = {
  params: Promise<{ docNo: string; outputDocNo: string }>
}

export async function POST(request: Request, context: ProductionOutputVoidRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.reverse')
    const { docNo, outputDocNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    const values = reverseProductionOutputSchema.parse(await request.json())
    const result = await reverseProductionOutput(docNo, outputDocNo, values, currentActor(auth))
    return NextResponse.json({ ...result, action: 'voided' })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'ยกเลิกผลผลิตไม่ได้', 500)
  }
}
