import { NextResponse } from 'next/server'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()

    if (!context.appUser) {
      return NextResponse.json({ cleared: false })
    }

    await prisma.app_users.update({
      data: {
        must_change_password: false,
        updated_by: context.appUser.email ?? context.authUser.email ?? 'system',
      },
      where: { id: context.appUser.id },
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.password_changed',
      metadata: {
        clearedMustChangePassword: context.appUser.mustChangePassword,
        source: 'self_service',
      },
      request,
      targetAppUserId: context.appUser.id.toString(),
    })

    return NextResponse.json({ cleared: true })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
