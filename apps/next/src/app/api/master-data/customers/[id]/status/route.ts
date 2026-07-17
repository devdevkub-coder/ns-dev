import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { mapPrismaCustomer } from '@/lib/domain/customer'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { invalidateCustomerReferenceCache } from '@/lib/server/reference-master-cache'
import { listSalespersonReferencesByIds } from '@/lib/server/salesperson-reference'
import type { Prisma } from '../../../../../../../generated/prisma/client'

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
    const resolvedCustomer = await prisma.customers.findFirst({
      select: { id: true },
      where: {
        OR: [{ code: id.toUpperCase() }, ...(parseInternalBigIntId(id) != null ? [{ id: parseInternalBigIntId(id) as bigint }] : [])],
      } as Prisma.customersWhereInput,
    })
    if (!resolvedCustomer) {
      throw new Error('ไม่พบลูกค้าที่ต้องการอัปเดต')
    }

    const customer = await prisma.customers.update({
      where: {
        id: resolvedCustomer.id,
      },
      data: {
        active: values.active,
      },
    })
    await invalidateCustomerReferenceCache()
    const salespersonReferences = await listSalespersonReferencesByIds([customer.sales_id])

    return NextResponse.json(mapPrismaCustomer(customer as any, {
      salesId: salespersonReferences.get(String(customer.sales_id ?? ''))?.code ?? null,
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปเดตสถานะลูกค้าไม่ได้', 400)
  }
}
