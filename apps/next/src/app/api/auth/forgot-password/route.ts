import { NextResponse } from 'next/server'
import { forgotPasswordSchema, isEmailIdentifier } from '@/lib/auth'
import { requestIp } from '@/lib/server/app-logging'
import { prisma } from '@/lib/server/prisma'
import { getSupabasePublicServerClient } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

function resolveRedirectTo(request: Request, requestedRedirectTo: unknown) {
  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  const fallback = new URL('/reset-password', origin).toString()
  if (typeof requestedRedirectTo !== 'string') return fallback

  try {
    const parsed = new URL(requestedRedirectTo)
    if (parsed.origin === origin && parsed.pathname === '/reset-password') {
      return parsed.toString()
    }
  } catch {
    return fallback
  }

  return fallback
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

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const identifier = parsed.data.identifier
  const identifierIsEmail = isEmailIdentifier(identifier)
  const appUser = await prisma.app_users.findFirst({
    select: {
      active: true,
      email: true,
      id: true,
      username: true,
    },
    where: identifierIsEmail
      ? { active: true, email: { equals: identifier, mode: 'insensitive' } }
      : { active: true, username: { equals: identifier, mode: 'insensitive' } },
  })

  await recordPublicResetRequest(request, appUser?.id ?? null, {
    foundActiveAppUser: appUser != null,
    identifierType: identifierIsEmail ? 'email' : 'username',
    source: 'self_service',
    username: appUser?.username ?? null,
  })

  const email = appUser?.email ?? (identifierIsEmail ? identifier : null)
  if (!email) {
    return NextResponse.json({ sent: true })
  }

  const supabase = getSupabasePublicServerClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase public env ยังไม่พร้อมสำหรับส่ง reset password' }, { status: 503 })
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resolveRedirectTo(request, body.redirectTo),
  })

  if (error) {
    return NextResponse.json({ error: 'ส่งอีเมล reset password ไม่สำเร็จ' }, { status: 502 })
  }

  return NextResponse.json({ sent: true })
}
