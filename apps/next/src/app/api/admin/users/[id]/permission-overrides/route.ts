import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const paramsSchema = z.object({ id: z.string().regex(/^\d+$/, 'รหัสผู้ใช้ไม่ถูกต้อง') })
const bodySchema = z.object({
  permissionOverrides: z.array(z.object({
    effect: z.enum(['allow', 'deny']),
    permissionId: z.string().regex(/^\d+$/, 'สิทธิ์ไม่ถูกต้อง'),
  })),
})

export async function PUT(request: Request, { params }: { params: Promise<unknown> }) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')
    const { id: rawId } = paramsSchema.parse(await params)
    const userId = parseInternalBigIntId(rawId)
    if (userId == null) throw new Error('รหัสผู้ใช้ไม่ถูกต้อง')

    const { permissionOverrides } = bodySchema.parse(await request.json())
    const seen = new Set<string>()
    const parsed = permissionOverrides.map((override) => {
      const permissionId = parseInternalBigIntId(override.permissionId)
      if (permissionId == null || seen.has(override.permissionId)) throw new Error('สิทธิ์รายผู้ใช้ไม่ถูกต้อง')
      seen.add(override.permissionId)
      return { effect: override.effect, permissionId }
    })
    const [user, permissions] = await Promise.all([
      prisma.app_users.findUnique({ select: { id: true }, where: { id: userId } }),
      prisma.app_permissions.findMany({ select: { id: true }, where: { active: true, id: { in: parsed.map((item) => item.permissionId) } } }),
    ])
    if (!user) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    if (permissions.length !== parsed.length) throw new Error('สิทธิ์รายผู้ใช้ไม่ถูกต้องหรือถูกปิดใช้งาน')

    const actor = context.appUser?.email ?? context.authUser.email ?? 'system'
    await prisma.$transaction(async (tx) => {
      await tx.app_user_permission_overrides.deleteMany({ where: { user_id: userId } })
      if (parsed.length) {
        await tx.app_user_permission_overrides.createMany({
          data: parsed.map((item) => ({ created_by: actor, effect: item.effect, permission_id: item.permissionId, updated_by: actor, user_id: userId })),
        })
      }
    })
    await recordAuthAuditEvent({ context, eventType: 'app_user.permission_overrides_updated', metadata: { overrideCount: parsed.length, userId: userId.toString() }, request })
    return NextResponse.json({ id: userId.toString() })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
