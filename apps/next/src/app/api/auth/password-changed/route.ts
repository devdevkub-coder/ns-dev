import { NextResponse } from 'next/server'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, getSupabaseServerClient } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json({ cleared: false })
    }

    const appUser = await prisma.app_users.findUnique({
      select: { account_status: true, email: true, id: true, must_change_password: true },
      where: { auth_user_id: data.user.id },
    })
    if (!appUser) {
      return NextResponse.json({ cleared: false })
    }

    const changedAt = new Date()
    const activatesInvitation = appUser.account_status === 'pending'
    await prisma.app_users.update({
      data: {
        ...(activatesInvitation ? {
          account_status: 'active',
          activated_at: changedAt,
          activated_by: appUser.email ?? data.user.email ?? 'self-service',
          activation_source: 'invitation',
          active: true,
        } : {}),
        must_change_password: false,
        password_set_at: changedAt,
        updated_by: appUser.email ?? data.user.email ?? 'self-service',
      },
      where: { id: appUser.id },
    })

    const context = await getCurrentAuthContext()
    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.password_changed',
      metadata: {
        activatedByInvitation: activatesInvitation,
        clearedMustChangePassword: appUser.must_change_password,
        source: 'self_service',
      },
      request,
      targetAppUserId: appUser.id.toString(),
    })

    return NextResponse.json({ activated: activatesInvitation, cleared: true })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
