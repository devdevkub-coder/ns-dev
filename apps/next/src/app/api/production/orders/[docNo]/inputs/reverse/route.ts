import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { ProductionOrderError, reverseProductionInput, reverseProductionInputSchema } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

const reverseInputRequestSchema = reverseProductionInputSchema.extend({
  inputDocNo: z.string().trim().min(1, 'ระบุเลขที่เอกสารเบิกวัตถุดิบ'),
})

type ProductionInputReverseRouteContext = {
  params: Promise<{ docNo: string }>
}

export async function POST(request: Request, context: ProductionInputReverseRouteContext) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'production.orders.view')
    const { docNo } = await context.params
    const { inputDocNo, ...values } = reverseInputRequestSchema.parse(await request.json())
    return NextResponse.json(await reverseProductionInput(docNo, inputDocNo, values, currentActor(auth)))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'reverse การเบิกวัตถุดิบไม่ได้', 500)
  }
}
