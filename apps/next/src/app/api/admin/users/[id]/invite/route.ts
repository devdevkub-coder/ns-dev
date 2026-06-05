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
        active: true,
        auth_user_id: true,
        display_name: true,
        email: true,
        id: true,
        username: true,
      },
      where: { id },
    })

    if (!appUser) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    if (!appUser.email) {
      return NextResponse.json({ error: 'ผู้ใช้นี้ยังไม่มี email' }, { status: 400 })
    }

    if (!appUser.active) {
      return NextResponse.json({ error: 'ผู้ใช้นี้ถูกปิดใช้งานอยู่' }, { status: 400 })
    }

    if (appUser.auth_user_id) {
      const supabase = getSupabasePublicServerClient()

      if (!supabase) {
        return NextResponse.json({ error: 'Supabase public env ยังไม่พร้อมสำหรับส่ง reset password' }, { status: 503 })
      }

      const { error } = await supabase.auth.resetPasswordForEmail(appUser.email, { redirectTo })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 502 })
      }

      await recordAuthAuditEvent({
        context,
        eventType: 'app_user.reset_sent',
        metadata: {
          username: appUser.username,
        },
        request,
        targetAppUserId: appUser.id.toString(),
      })

      return NextResponse.json({ mode: 'reset', sent: true })
    }

    const supabaseAdmin = getSupabaseAdminClient()

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY บน server ก่อนส่ง invite ผู้ใช้ใหม่' }, { status: 501 })
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(appUser.email, {
      data: {
        display_name: appUser.display_name,
        username: appUser.username,
      },
      redirectTo,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }

    if (data.user?.id) {
      await prisma.app_users.update({
        data: {
          auth_user_id: data.user.id,
          updated_by: context.appUser?.username ?? context.authUser.email ?? 'system',
        },
        where: { id: appUser.id },
      })
    }

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.invite_sent',
      metadata: {
        linkedAuthUser: Boolean(data.user?.id),
        username: appUser.username,
      },
      request,
      targetAppUserId: appUser.id.toString(),
    })

    return NextResponse.json({ mode: 'invite', sent: true })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
