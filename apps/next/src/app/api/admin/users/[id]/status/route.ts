import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const updateUserStatusSchema = z.object({
  active: z.boolean(),
})

const routeParamsSchema = z.object({
  id: z.string().min(1),
})

type AdminUserStatusRouteProps = {
  params: Promise<unknown>
}

export async function PATCH(request: Request, { params }: AdminUserStatusRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')

    const { id } = routeParamsSchema.parse(await params)
    const values = updateUserStatusSchema.parse(await request.json())

    if (context.appUser?.id === id && values.active === false) {
      return NextResponse.json({ error: 'ไม่สามารถปิดบัญชีของตัวเองได้' }, { status: 400 })
    }

    const user = await prisma.app_users.update({
      data: {
        active: values.active,
        updated_by: context.appUser?.username ?? context.authUser.email ?? 'system',
      },
      where: {
        id,
      },
    })

    return NextResponse.json({
      active: user.active,
      id: user.id,
      updatedAt: user.updated_at.toISOString(),
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
