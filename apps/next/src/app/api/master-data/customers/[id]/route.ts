import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mapPrismaCustomer } from '@/lib/domain/customer'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const updateCustomerStatusSchema = z.object({
  active: z.boolean(),
})

type CustomerRouteProps = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: Request, { params }: CustomerRouteProps) {
  try {
    const { id } = await params
    const body = await request.json()
    const values = updateCustomerStatusSchema.parse(body)

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
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'อัปเดตสถานะลูกค้าไม่ได้' }, { status: 400 })
  }
}
