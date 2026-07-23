import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { assertProductionOrderBranchAccess, ProductionOrderError, readProductionWip } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ProductionOrderRouteContext = {
  params: Promise<{ docNo: string }>
}

export async function GET(_request: Request, context: ProductionOrderRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.view')
    const { docNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    return NextResponse.json(await readProductionWip(docNo))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'โหลด WIP ใบสั่งผลิตไม่ได้', 500)
  }
}
