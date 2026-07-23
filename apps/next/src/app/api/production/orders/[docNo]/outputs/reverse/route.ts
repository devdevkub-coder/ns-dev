import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { assertProductionOrderBranchAccess, ProductionOrderError, reverseProductionOutput, reverseProductionOutputSchema } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

const reverseOutputRequestSchema = reverseProductionOutputSchema.extend({
  outputDocNo: z.string().trim().min(1, 'ระบุเลขที่เอกสารรับผลผลิต'),
})

type ProductionOutputReverseRouteContext = {
  params: Promise<{ docNo: string }>
}

export async function POST(request: Request, context: ProductionOutputReverseRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.reverse')
    const { docNo } = await context.params
    await assertProductionOrderBranchAccess(docNo, getBranchCodeIntersection(auth))
    const { outputDocNo, ...values } = reverseOutputRequestSchema.parse(await request.json())
    return NextResponse.json(await reverseProductionOutput(docNo, outputDocNo, values, currentActor(auth)))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'reverse การรับผลผลิตไม่ได้', 500)
  }
}
