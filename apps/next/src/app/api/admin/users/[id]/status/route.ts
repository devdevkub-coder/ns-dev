import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const updateUserStatusSchema = z.object({
  active: z.boolean(),
})

const routeParamsSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, 'รหัสผู้ใช้ไม่ถูกต้อง'),
})

type AdminUserStatusRouteProps = {
  params: Promise<unknown>
}

function parseAppUserId(value: string) {
  const parsed = parseInternalBigIntId(value)
  if (parsed == null) {
    throw new Error('รหัสผู้ใช้ไม่ถูกต้อง')
  }
  return parsed
}

export async function PATCH(request: Request, { params }: AdminUserStatusRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')

    const { id: rawId } = routeParamsSchema.parse(await params)
    const id = parseAppUserId(rawId)
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

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.status_updated',
      metadata: {
        active: user.active,
        username: user.username,
      },
      request,
      targetAppUserId: user.id.toString(),
    })

    return NextResponse.json({
      active: user.active,
      id: user.id.toString(),
      updatedAt: user.updated_at.toISOString(),
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
