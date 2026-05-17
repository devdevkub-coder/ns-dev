import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mapPrismaSupplier } from '@/lib/domain/supplier'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const updateSupplierStatusSchema = z.object({
  active: z.boolean(),
})

type SupplierRouteProps = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: Request, { params }: SupplierRouteProps) {
  try {
    const { id } = await params
    const body = await request.json()
    const values = updateSupplierStatusSchema.parse(body)

    const supplier = await prisma.suppliers.update({
      where: {
        id,
      },
      data: {
        active: values.active,
      },
      include: { branches: true },
    })

    return NextResponse.json(mapPrismaSupplier(supplier))
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'อัปเดตสถานะผู้ขายไม่ได้' }, { status: 400 })
  }
}
