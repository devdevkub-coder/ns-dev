import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mapPrismaImpurity, type PrismaImpurityRow } from '@/lib/domain/impurity'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const routeParamsSchema = z.object({
  id: z.string().min(1),
})

const updateImpurityStatusSchema = z.object({
  active: z.boolean(),
})

type ImpurityRouteProps = {
  params: Promise<unknown>
}

export async function PATCH(request: Request, { params }: ImpurityRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = routeParamsSchema.parse(await params)
    const values = updateImpurityStatusSchema.parse(await request.json())
    const rows = await prisma.$queryRaw<PrismaImpurityRow[]>`
      update public.impurities
      set active = ${values.active}
      where id = ${id}
      returning id, name, active, created_at, updated_at
    `

    const row = rows[0]
    if (!row) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบข้อมูลสิ่งเจือปนที่ต้องการแก้ไข' }, { status: 404 })
    }

    return NextResponse.json(mapPrismaImpurity(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปเดตสถานะสิ่งเจือปนไม่ได้', 400)
  }
}
