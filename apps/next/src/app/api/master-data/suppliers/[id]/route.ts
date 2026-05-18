import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mapPrismaSupplier } from '@/lib/domain/supplier'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
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
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.suppliers.status')

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
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปเดตสถานะผู้ขายไม่ได้', 400)
  }
}
