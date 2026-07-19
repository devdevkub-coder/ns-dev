import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const roleFormSchema = z.object({
  active: z.boolean().default(true),
  branchScope: z.enum(['all', 'own', 'custom']).default('all'),
  description: z.string().trim().max(500, 'คำอธิบายยาวเกินไป').optional().default(''),
  name: z.string().trim().min(1, 'กรอกชื่อหน้าที่งาน').max(120, 'ชื่อหน้าที่งานยาวเกินไป'),
  permissionIds: z.array(z.string().trim().regex(/^\d+$/, 'สิทธิ์ไม่ถูกต้อง')).default([]),
})

function parsePermissionIds(permissionIds: string[]) {
  const seen = new Set<string>()
  const parsed = permissionIds.map((permissionId) => {
    const parsedId = parseInternalBigIntId(permissionId)
    if (parsedId == null || seen.has(permissionId)) {
      throw new Error('สิทธิ์ที่เลือกไม่ถูกต้อง')
    }
    seen.add(permissionId)
    return parsedId
  })
  return parsed
}

async function assertPermissionRefs(permissionIds: string[]) {
  const parsedIds = parsePermissionIds(permissionIds)
  const permissions = await prisma.app_permissions.findMany({
    select: { id: true },
    where: { active: true, id: { in: parsedIds } },
  })

  if (permissions.length !== parsedIds.length) {
    throw new Error('สิทธิ์ที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return parsedIds
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.roles.create')

    const values = roleFormSchema.parse(await request.json())
    const permissionIds = await assertPermissionRefs(values.permissionIds)
    const existing = await prisma.app_roles.findFirst({
      where: { name: { equals: values.name, mode: 'insensitive' } },
    })
    if (existing) {
      return NextResponse.json({ error: 'มีหน้าที่งานชื่อนี้อยู่แล้ว' }, { status: 409 })
    }

    const actor = context.appUser?.email ?? context.authUser.email ?? 'system'
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.app_roles.create({
        data: {
          active: values.active,
          branch_scope: values.branchScope,
          code: `custom_${randomUUID().replaceAll('-', '')}`,
          created_by: actor,
          description: values.description || null,
          is_system: false,
          name: values.name,
          updated_by: actor,
        },
      })

      if (permissionIds.length) {
        await tx.app_role_permissions.createMany({
          data: permissionIds.map((permissionId) => ({
            created_by: actor,
            permission_id: permissionId,
            role_id: created.id,
          })),
        })
      }

      return created
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_role.created',
      metadata: {
        name: role.name,
        permissionCount: permissionIds.length,
      },
      request,
    })

    return NextResponse.json({ id: role.id.toString() }, { status: 201 })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
