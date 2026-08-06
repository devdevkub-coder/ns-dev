import { userProfileSchema } from '@/lib/auth'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext } from '@/lib/server/auth-context'
import { authJson, withAuthNoStore } from '@/lib/server/auth-response'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function PUT(request: Request) {
  try {
    const context = await getCurrentAuthContext()

    if (!context.appUser) {
      return authJson({ error: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = userProfileSchema.safeParse(body)

    if (!parsed.success) {
      return authJson(
        { error: 'ข้อมูลไม่ถูกต้อง', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updatedUser = await prisma.app_users.update({
      data: {
        display_name: parsed.data.displayName,
        updated_by: context.appUser.email?.trim() || context.authUser.email?.trim() || context.authUser.id,
      },
      where: { id: context.appUser.id },
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.profile_updated',
      metadata: {
        displayName: parsed.data.displayName,
      },
      request,
      targetAppUserId: context.appUser.id.toString(),
    })

    return authJson({
      ok: true,
      user: {
        displayName: updatedUser.display_name,
        email: updatedUser.email,
      },
    })
  } catch (caught) {
    return withAuthNoStore(authContextErrorResponse(caught))
  }
}
