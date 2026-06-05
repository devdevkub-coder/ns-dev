import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mapPrismaProduct } from '@/lib/domain/product'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const routeParamsSchema = z.object({
  id: z.string().min(1),
})

const updateProductStatusSchema = z.object({
  active: z.boolean(),
})

type ProductRouteProps = {
  params: Promise<unknown>
}

export async function PATCH(request: Request, { params }: ProductRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.products.status')

    const { id } = routeParamsSchema.parse(await params)
    const values = updateProductStatusSchema.parse(await request.json())
    const resolved = await prisma.products.findFirst({
      select: { id: true },
      where: {
        OR: [{ code: id.toUpperCase() }, ...(parseInternalBigIntId(id) != null ? [{ id: parseInternalBigIntId(id) as bigint }] : [])],
      } as any,
    })
    if (!resolved) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบสินค้าที่ต้องการอัปเดต' }, { status: 404 })
    }
    const product = await prisma.products.update({
      data: { active: values.active },
      where: { id: resolved.id },
    })

    return NextResponse.json(mapPrismaProduct(product))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปเดตสถานะสินค้าไม่ได้', 400)
  }
}
