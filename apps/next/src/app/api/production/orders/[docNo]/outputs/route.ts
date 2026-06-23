import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { createProductionOutput, createProductionOutputSchema, ProductionOrderError } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

type ProductionOrderRouteContext = {
  params: Promise<{ docNo: string }>
}

export async function POST(request: Request, context: ProductionOrderRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.view')
    const { docNo } = await context.params
    const values = createProductionOutputSchema.parse(await request.json())
    return NextResponse.json(await createProductionOutput(docNo, values, currentActor(auth)), { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'รับผลผลิตไม่ได้', 500)
  }
}
