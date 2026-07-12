import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient, getSupabasePublicServerClient } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

const routeParamsSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, 'รหัสผู้ใช้ไม่ถูกต้อง'),
})

const inviteUserSchema = z.object({
  redirectTo: z.string().url().optional(),
}).default({})

type AdminUserInviteRouteProps = {
  params: Promise<unknown>
}

function parseAppUserId(value: string) {
  const parsed = parseInternalBigIntId(value)
  if (parsed == null) {
    throw new Error('รหัสผู้ใช้ไม่ถูกต้อง')
  }
  return parsed
}

function resolveRedirectTo(request: Request, requestedRedirectTo: string | undefined) {
  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  if (requestedRedirectTo) {
    try {
      const parsed = new URL(requestedRedirectTo)
      if (parsed.origin === origin && parsed.pathname === '/reset-password') {
        return parsed.toString()
      }
    } catch {
      // Fall back to the canonical reset URL below.
    }
  }

  return new URL('/reset-password', origin).toString()
}

export async function POST(request: Request, { params }: AdminUserInviteRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')

    const { id: rawId } = routeParamsSchema.parse(await params)
    const id = parseAppUserId(rawId)
    const body = inviteUserSchema.parse(await request.json().catch(() => ({})))
    const redirectTo = resolveRedirectTo(request, body.redirectTo)

    const appUser = await prisma.app_users.findUnique({
      select: {
        account_status: true,
        active: true,
        auth_user_id: true,
        display_name: true,
        email: true,
        id: true,
      },
      where: { id },
    })

    if (!appUser) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    if (!appUser.email) {
      return NextResponse.json({ error: 'ผู้ใช้นี้ยังไม่มี email' }, { status: 400 })
    }

    if (appUser.account_status === 'disabled') {
      return NextResponse.json({ error: 'ผู้ใช้นี้ถูกปิดใช้งานอยู่' }, { status: 400 })
    }

    if (appUser.account_status === 'active') {
      let authUserId = appUser.auth_user_id
      if (!authUserId) {
        const supabaseAdmin = getSupabaseAdminClient()
        if (!supabaseAdmin) {
          return NextResponse.json({ error: 'ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY บน server ก่อนสร้างบัญชี Auth' }, { status: 501 })
        }

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: appUser.email,
          email_confirm: true,
          user_metadata: { display_name: appUser.display_name },
        })
        if (error || !data.user) {
          return NextResponse.json({ error: error?.message ?? 'สร้างบัญชี Auth ไม่สำเร็จ' }, { status: 502 })
        }
        authUserId = data.user.id
        await prisma.app_users.update({
          data: {
            auth_user_id: authUserId,
            updated_by: context.appUser?.email ?? context.authUser.email ?? 'system',
          },
          where: { id: appUser.id },
        })
      }

      const supabase = getSupabasePublicServerClient()

      if (!supabase) {
        return NextResponse.json({ error: 'Supabase public env ยังไม่พร้อมสำหรับส่ง reset password' }, { status: 503 })
      }

      const { error } = await supabase.auth.resetPasswordForEmail(appUser.email, { redirectTo })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 502 })
      }

      const sentAt = new Date()
      await prisma.app_users.update({
        data: {
          password_link_sent_at: sentAt,
          updated_by: context.appUser?.email ?? context.authUser.email ?? 'system',
        },
        where: { id: appUser.id },
      })

      await recordAuthAuditEvent({
        context,
        eventType: 'app_user.reset_sent',
        metadata: {
          email: appUser.email,
          linkedAuthUser: Boolean(authUserId),
        },
        request,
        targetAppUserId: appUser.id.toString(),
      })

      return NextResponse.json({ mode: 'reset', sent: true })
    }

    if (appUser.auth_user_id) {
      const supabase = getSupabasePublicServerClient()
      if (!supabase) {
        return NextResponse.json({ error: 'Supabase public env ยังไม่พร้อมสำหรับส่งลิงก์ตั้งรหัสผ่าน' }, { status: 503 })
      }
      const { error } = await supabase.auth.resetPasswordForEmail(appUser.email, { redirectTo })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 502 })
      }
      await prisma.app_users.update({
        data: {
          invitation_sent_at: new Date(),
          updated_by: context.appUser?.email ?? context.authUser.email ?? 'system',
        },
        where: { id: appUser.id },
      })
      await recordAuthAuditEvent({
        context,
        eventType: 'app_user.invite_resent',
        metadata: { email: appUser.email },
        request,
        targetAppUserId: appUser.id.toString(),
      })
      return NextResponse.json({ mode: 'invite', sent: true })
    }

    const supabaseAdmin = getSupabaseAdminClient()

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY บน server ก่อนส่ง invite ผู้ใช้ใหม่' }, { status: 501 })
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(appUser.email, {
      data: {
        display_name: appUser.display_name,
      },
      redirectTo,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }

    await prisma.app_users.update({
      data: {
        ...(data.user?.id ? { auth_user_id: data.user.id } : {}),
        invitation_sent_at: new Date(),
        updated_by: context.appUser?.email ?? context.authUser.email ?? 'system',
      },
      where: { id: appUser.id },
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.invite_sent',
      metadata: {
        linkedAuthUser: Boolean(data.user?.id),
        email: appUser.email,
      },
      request,
      targetAppUserId: appUser.id.toString(),
    })

    return NextResponse.json({ mode: 'invite', sent: true })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
