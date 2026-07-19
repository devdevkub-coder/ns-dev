import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

const routeParamsSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, 'รหัสผู้ใช้ไม่ถูกต้อง'),
})

type TemporaryPasswordRouteProps = {
  params: Promise<unknown>
}

function temporaryPassword() {
  return `${randomBytes(12).toString('base64url')}aA1!`
}

export async function POST(request: Request, { params }: TemporaryPasswordRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.credentials_manage')

    const { id: rawId } = routeParamsSchema.parse(await params)
    const id = parseInternalBigIntId(rawId)
    if (id == null) {
      return NextResponse.json({ error: 'รหัสผู้ใช้ไม่ถูกต้อง' }, { status: 400 })
    }

    const appUser = await prisma.app_users.findUnique({
      select: {
        account_status: true,
        auth_user_id: true,
        display_name: true,
        email: true,
        id: true,
      },
      where: { id },
    })
    if (!appUser) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    if (appUser.account_status !== 'active') {
      return NextResponse.json({ error: 'ต้องเปิดใช้งานบัญชีก่อนสร้างรหัสผ่านชั่วคราว' }, { status: 400 })
    }
    if (!appUser.email) return NextResponse.json({ error: 'ผู้ใช้นี้ยังไม่มี email' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdminClient()
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY ก่อนสร้างรหัสผ่านชั่วคราว' }, { status: 501 })
    }

    const password = temporaryPassword()
    let authUserId = appUser.auth_user_id
    if (authUserId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 502 })
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: appUser.email,
        email_confirm: true,
        password,
        user_metadata: { display_name: appUser.display_name },
      })
      if (error || !data.user) {
        return NextResponse.json({ error: error?.message ?? 'สร้างบัญชี Auth ไม่สำเร็จ' }, { status: 502 })
      }
      authUserId = data.user.id
    }

    const issuedAt = new Date()
    await prisma.app_users.update({
      data: {
        auth_user_id: authUserId,
        must_change_password: true,
        password_set_at: null,
        temporary_password_issued_at: issuedAt,
        updated_by: context.appUser?.email ?? context.authUser.email ?? 'system',
      },
      where: { id: appUser.id },
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.temporary_password_issued',
      metadata: {
        email: appUser.email,
      },
      request,
      targetAppUserId: appUser.id.toString(),
    })

    return NextResponse.json({
      issuedAt: issuedAt.toISOString(),
      temporaryPassword: password,
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
