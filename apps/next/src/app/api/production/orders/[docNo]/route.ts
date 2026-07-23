import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, cancelProductionOrder, completeProductionOrder, ProductionOrderError, updateProductionOrderActionSchema } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ProductionOrderRouteContext = {
  params: Promise<{ docNo: string }>
}

export async function PATCH(request: Request, context: ProductionOrderRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.view')
    const { docNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    const values = updateProductionOrderActionSchema.parse(await request.json())
    requirePermission(auth, values.action === 'complete' ? 'production.orders.complete' : 'production.orders.cancel')
    const actor = currentActor(auth)
    const payload = values.action === 'complete'
      ? await completeProductionOrder(docNo, values.note, actor)
      : await cancelProductionOrder(docNo, values.reason, actor)
    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'อัปเดตใบสั่งผลิตไม่ได้', 500)
  }
}
