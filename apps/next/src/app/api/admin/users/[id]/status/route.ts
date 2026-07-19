import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'

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
    requirePermission(context, 'system.users.activate')

    const { id: rawId } = routeParamsSchema.parse(await params)
    const id = parseAppUserId(rawId)
    const values = updateUserStatusSchema.parse(await request.json())

    if (context.appUser?.id === id && values.active === false) {
      return NextResponse.json({ error: 'ไม่สามารถปิดบัญชีของตัวเองได้' }, { status: 400 })
    }

    const existing = await prisma.app_users.findUnique({
      select: { account_status: true, auth_user_id: true, id: true },
      where: { id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    const actor = context.appUser?.email ?? context.authUser.email ?? 'system'
    const activatedAt = values.active ? new Date() : null
    const accountStatus = values.active ? 'active' : 'disabled'
    const replacesPendingInvitation = values.active && existing.account_status === 'pending' && Boolean(existing.auth_user_id)

    if (replacesPendingInvitation && existing.auth_user_id) {
      const supabaseAdmin = getSupabaseAdminClient()
      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY ก่อนเปิดใช้งานแทนคำเชิญ' }, { status: 501 })
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(existing.auth_user_id)
      if (error) {
        return NextResponse.json({ error: `ยกเลิกคำเชิญเดิมไม่สำเร็จ: ${error.message}` }, { status: 502 })
      }
    }

    const user = await prisma.app_users.update({
      data: {
        account_status: accountStatus,
        active: values.active,
        ...(replacesPendingInvitation ? { auth_user_id: null } : {}),
        ...(values.active ? {
          activated_at: activatedAt,
          activated_by: actor,
          activation_source: 'admin',
        } : {}),
        updated_by: actor,
      },
      where: {
        id,
      },
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.status_updated',
      metadata: {
        accountStatus,
        active: user.active,
        previousAccountStatus: existing.account_status,
        replacedPendingInvitation: replacesPendingInvitation,
        email: user.email,
      },
      request,
      targetAppUserId: user.id.toString(),
    })

    return NextResponse.json({
      accountStatus,
      active: user.active,
      activatedAt: activatedAt?.toISOString() ?? null,
      id: user.id.toString(),
      updatedAt: user.updated_at.toISOString(),
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
