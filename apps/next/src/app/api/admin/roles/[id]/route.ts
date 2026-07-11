import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const routeParamsSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, 'รหัสหน้าที่งานไม่ถูกต้อง'),
})

const roleFormSchema = z.object({
  active: z.boolean().default(true),
  branchScope: z.enum(['all', 'own', 'custom']).default('all'),
  description: z.string().trim().max(500, 'คำอธิบายยาวเกินไป').optional().default(''),
  name: z.string().trim().min(1, 'กรอกชื่อหน้าที่งาน').max(120, 'ชื่อหน้าที่งานยาวเกินไป'),
  permissionIds: z.array(z.string().trim().regex(/^\d+$/, 'สิทธิ์ไม่ถูกต้อง')).default([]),
})

type RoleRouteProps = { params: Promise<unknown> }

function parseRoleId(value: string) {
  const parsed = parseInternalBigIntId(value)
  if (parsed == null) throw new Error('รหัสหน้าที่งานไม่ถูกต้อง')
  return parsed
}

function parsePermissionIds(permissionIds: string[]) {
  const seen = new Set<string>()
  return permissionIds.map((permissionId) => {
    const parsedId = parseInternalBigIntId(permissionId)
    if (parsedId == null || seen.has(permissionId)) throw new Error('สิทธิ์ที่เลือกไม่ถูกต้อง')
    seen.add(permissionId)
    return parsedId
  })
}

async function assertPermissionRefs(permissionIds: string[]) {
  const parsedIds = parsePermissionIds(permissionIds)
  const permissions = await prisma.app_permissions.findMany({
    select: { id: true },
    where: { active: true, id: { in: parsedIds } },
  })
  if (permissions.length !== parsedIds.length) throw new Error('สิทธิ์ที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  return parsedIds
}

export async function PATCH(request: Request, { params }: RoleRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.roles.manage')

    const { id: rawId } = routeParamsSchema.parse(await params)
    const id = parseRoleId(rawId)
    const values = roleFormSchema.parse(await request.json())
    const permissionIds = await assertPermissionRefs(values.permissionIds)
    const role = await prisma.app_roles.findUnique({ where: { id } })
    if (!role) return NextResponse.json({ error: 'ไม่พบหน้าที่งาน' }, { status: 404 })

    const duplicate = await prisma.app_roles.findFirst({
      where: { id: { not: id }, name: { equals: values.name, mode: 'insensitive' } },
    })
    if (duplicate) return NextResponse.json({ error: 'มีหน้าที่งานชื่อนี้อยู่แล้ว' }, { status: 409 })

    const actor = context.appUser?.email ?? context.authUser.email ?? 'system'
    await prisma.$transaction(async (tx) => {
      await tx.app_roles.update({
        data: {
          active: values.active,
          branch_scope: values.branchScope,
          description: values.description || null,
          name: values.name,
          updated_by: actor,
        },
        where: { id },
      })
      await tx.app_role_permissions.deleteMany({ where: { role_id: id } })
      if (permissionIds.length) {
        await tx.app_role_permissions.createMany({
          data: permissionIds.map((permissionId) => ({
            created_by: actor,
            permission_id: permissionId,
            role_id: id,
          })),
        })
      }
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_role.updated',
      metadata: {
        name: values.name,
        permissionCount: permissionIds.length,
      },
      request,
    })

    return NextResponse.json({ id: id.toString() })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
