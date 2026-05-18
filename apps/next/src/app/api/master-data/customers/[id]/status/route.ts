import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mapPrismaCustomer } from '@/lib/domain/customer'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const updateCustomerStatusSchema = z.object({
  active: z.boolean(),
})

type CustomerStatusRouteProps = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: Request, { params }: CustomerStatusRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.customers.status')

    const { id } = await params
    const values = updateCustomerStatusSchema.parse(await request.json())

    const customer = await prisma.customers.update({
      where: {
        id,
      },
      data: {
        active: values.active,
      },
    })

    return NextResponse.json(mapPrismaCustomer(customer))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปเดตสถานะลูกค้าไม่ได้', 400)
  }
}
