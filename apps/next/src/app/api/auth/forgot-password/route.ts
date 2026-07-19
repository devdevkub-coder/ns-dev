import { NextResponse } from 'next/server'
import { forgotPasswordSchema } from '@/lib/auth'
import { requestIp } from '@/lib/server/app-logging'
import { consumeForgotPasswordRateLimit } from '@/lib/server/auth-rate-limit'
import { prisma } from '@/lib/server/prisma'
import { getSupabasePublicServerClient } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

function resolveRedirectTo(request: Request, requestedRedirectTo: unknown) {
  if (typeof requestedRedirectTo !== 'string') return null

  try {
    const parsed = new URL(requestedRedirectTo)
    if (parsed.origin === new URL(request.url).origin && parsed.pathname === '/reset-password') {
      return parsed.toString()
    }
  } catch {
    return null
  }

  return null
}

async function recordPublicResetRequest(request: Request, appUserId: bigint | null, metadata: Record<string, boolean | string | null>) {
  try {
    await prisma.$transaction([
      prisma.$executeRaw`
        insert into public.app_audit_logs (
          event_key,
          action,
          outcome,
          severity,
          target_type,
          target_id,
          http_method,
          request_path,
          ip_address,
          user_agent,
          metadata
        ) values (
          'app_user.reset_requested',
          'reset',
          'success',
          'info',
          ${appUserId ? 'app_user' : null},
          ${appUserId == null ? null : appUserId.toString()},
          ${request.method},
          ${new URL(request.url).pathname},
          ${requestIp(request)}::inet,
          ${request.headers.get('user-agent')},
          ${JSON.stringify(metadata)}::jsonb
        )
      `,
      prisma.$executeRaw`
        insert into public.app_auth_events (
          target_app_user_id,
          event_type,
          metadata,
          ip_address,
          user_agent
        ) values (
          ${appUserId}::bigint,
          'app_user.reset_requested',
          ${JSON.stringify(metadata)}::jsonb,
          ${requestIp(request)}::inet,
          ${request.headers.get('user-agent')}
        )
      `,
    ])
  } catch (caught) {
    console.warn('Failed to record public password reset request', caught)
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = forgotPasswordSchema.safeParse(body)
  const redirectTo = resolveRedirectTo(request, body.redirectTo)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  if (!redirectTo) {
    return NextResponse.json({ error: 'ลิงก์สำหรับ reset password ไม่ถูกต้อง' }, { status: 400 })
  }

  const email = parsed.data.email
  const limiter = await consumeForgotPasswordRateLimit({
    email,
    ip: requestIp(request),
  })

  if (limiter.outcome === 'unavailable') {
    return NextResponse.json({ error: 'ระบบป้องกันคำขอ reset password ยังไม่พร้อมใช้งาน' }, { status: 503 })
  }

  if (limiter.outcome === 'throttled') {
    await recordPublicResetRequest(request, null, {
      identifierType: 'email',
      outcome: 'throttled',
      source: 'self_service',
    })
    return NextResponse.json({ accepted: true }, { status: 202 })
  }

  const appUser = await prisma.app_users.findFirst({
    select: {
      active: true,
      email: true,
      id: true,
    },
    where: { active: true, email: { equals: email, mode: 'insensitive' } },
  })

  await recordPublicResetRequest(request, appUser?.id ?? null, {
    identifierType: 'email',
    source: 'self_service',
    outcome: appUser ? 'accepted' : 'suppressed',
  })

  if (!appUser?.email) {
    return NextResponse.json({ accepted: true }, { status: 202 })
  }

  const supabase = getSupabasePublicServerClient()
  if (!supabase) {
    await recordPublicResetRequest(request, appUser.id, {
      identifierType: 'email',
      outcome: 'delivery_failed',
      source: 'self_service',
    })
    console.warn('Password reset delivery unavailable', { category: 'supabase_public_client_unavailable' })
    return NextResponse.json({ accepted: true }, { status: 202 })
  }

  const { error } = await supabase.auth.resetPasswordForEmail(appUser.email, {
    redirectTo,
  })

  if (error) {
    await recordPublicResetRequest(request, appUser.id, {
      identifierType: 'email',
      outcome: 'delivery_failed',
      source: 'self_service',
    })
    console.warn('Password reset delivery failed', { category: 'supabase_reset_password_failed' })
    return NextResponse.json({ accepted: true }, { status: 202 })
  }

  return NextResponse.json({ accepted: true }, { status: 202 })
}
