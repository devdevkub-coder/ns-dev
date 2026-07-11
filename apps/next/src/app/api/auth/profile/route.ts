import { NextResponse } from 'next/server'
import { userProfileSchema } from '@/lib/auth'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { apiErrorResponse } from '@/lib/server/api-error'

export const runtime = 'nodejs'

export async function PUT(request: Request) {
  try {
    const context = await getCurrentAuthContext()

    if (!context.appUser) {
      return apiErrorResponse(null, 'ไม่พบข้อมูลผู้ใช้งานในระบบ', 403)
    }

    const body = await request.json().catch(() => ({}))
    const parsed = userProfileSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ถูกต้อง', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updatedUser = await prisma.app_users.update({
      data: {
        display_name: parsed.data.displayName,
        updated_by: context.appUser.email ?? context.authUser.email ?? 'system',
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

    return NextResponse.json({
      ok: true,
      user: {
        displayName: updatedUser.display_name,
        email: updatedUser.email,
      },
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
