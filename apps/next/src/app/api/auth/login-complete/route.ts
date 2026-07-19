import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext } from '@/lib/server/auth-context'
import { authJson, withAuthNoStore } from '@/lib/server/auth-response'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()

    if (!context.appUser) {
      return authJson({ error: 'ไม่พบข้อมูลผู้ใช้ในระบบ' }, { status: 403 })
    }

    const loggedInAt = new Date()

    await prisma.app_users.update({
      data: {
        last_login_at: loggedInAt,
      },
      where: {
        id: context.appUser.id,
      },
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.login_completed',
      metadata: {
        source: 'password_login',
      },
      request,
      targetAppUserId: context.appUser.id.toString(),
    })

    return authJson({
      lastLoginAt: loggedInAt.toISOString(),
    })
  } catch (caught) {
    return withAuthNoStore(authContextErrorResponse(caught))
  }
}
