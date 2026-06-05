import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { mapPrismaSupplier } from '@/lib/domain/supplier'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { listSalespersonReferencesByIds } from '@/lib/server/salesperson-reference'
import type { SupplierPaymentMethodRecord } from '@/lib/supplier'
import type { Prisma } from '../../../../../../generated/prisma/client'

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
    const resolvedSupplier = await prisma.suppliers.findFirst({
      select: { id: true },
      where: {
        OR: [{ code: id.toUpperCase() }, ...(parseInternalBigIntId(id) != null ? [{ id: parseInternalBigIntId(id) as bigint }] : [])],
      } as Prisma.suppliersWhereInput,
    })
    if (!resolvedSupplier) {
      throw new Error('ไม่พบผู้ขายที่ต้องการอัปเดต')
    }

    const [supplier, paymentMethods] = await Promise.all([
      prisma.suppliers.update({
        where: {
          id: resolvedSupplier.id,
        },
        data: {
          active: values.active,
        },
        include: {
          branches: true,
          supplier_bank_accounts: {
            orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
          },
        },
      }),
      prisma.payment_methods.findMany({
        orderBy: [{ name: 'asc' }],
        select: { name: true, type: true },
        where: { active: true },
      }),
    ])
    const salespersonReferences = await listSalespersonReferencesByIds([supplier.sales_id])

    return NextResponse.json(mapPrismaSupplier(supplier as any, paymentMethods as SupplierPaymentMethodRecord[], {
      salesId: salespersonReferences.get(String(supplier.sales_id ?? ''))?.code ?? null,
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปเดตสถานะผู้ขายไม่ได้', 400)
  }
}
