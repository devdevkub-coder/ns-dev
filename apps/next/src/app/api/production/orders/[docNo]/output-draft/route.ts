import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, deleteProductionOutputDraft, getProductionOutputDraft, ProductionOrderError, productionOutputDraftSchema, saveProductionOutputDraft } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ProductionOrderRouteContext = { params: Promise<{ docNo: string }> }

export async function GET(_request: Request, context: ProductionOrderRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.view')
    const { docNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    return NextResponse.json({ draft: await getProductionOutputDraft(docNo) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'โหลดร่างผลผลิตไม่ได้', 500)
  }
}

export async function PUT(request: Request, context: ProductionOrderRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.output')
    const { docNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    const values = productionOutputDraftSchema.parse(await request.json())
    return NextResponse.json(await saveProductionOutputDraft(docNo, values, currentActor(auth)))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'บันทึกร่างผลผลิตไม่ได้', 500)
  }
}

export async function DELETE(_request: Request, context: ProductionOrderRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.output')
    const { docNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    return NextResponse.json(await deleteProductionOutputDraft(docNo))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'ลบร่างผลผลิตไม่ได้', 500)
  }
}
