import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, createProductionInput, createProductionInputSchema, ProductionOrderError } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ProductionOrderRouteContext = {
  params: Promise<{ docNo: string }>
}

export async function POST(request: Request, context: ProductionOrderRouteContext) {
  const { docNo } = await context.params
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.input')
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    const values = createProductionInputSchema.parse(await request.json())
    return NextResponse.json(await createProductionInput(docNo, values, currentActor(auth)), { status: 201 })
  } catch (caught) {
    console.error('[production/orders/inputs] failed', {
      code: caught instanceof Error && 'code' in caught ? caught.code : undefined,
      docNo,
      message: caught instanceof Error ? caught.message : String(caught),
    })
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'เบิกวัตถุดิบเข้า Production ไม่ได้', 500)
  }
}
