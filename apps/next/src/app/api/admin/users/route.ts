import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const adminUserFormSchema = z.object({
  active: z.boolean().default(true),
  branchIds: z.array(z.string().min(1)).default([]),
  contactLineId: z.string().trim().max(120, 'LINE ID ยาวเกินไป').optional().default(''),
  contactNote: z.string().trim().max(500, 'หมายเหตุ contact ยาวเกินไป').optional().default(''),
  contactPhone: z.string().trim().max(80, 'เบอร์ติดต่อยาวเกินไป').optional().default(''),
  displayName: z.string().trim().min(1, 'กรอกชื่อผู้ใช้').max(160, 'ชื่อผู้ใช้ยาวเกินไป'),
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง'),
  firstName: z.string().trim().max(120, 'ชื่อจริงยาวเกินไป').optional().default(''),
  lastName: z.string().trim().max(120, 'นามสกุลยาวเกินไป').optional().default(''),
  mustChangePassword: z.boolean().default(false),
  namePrefix: z.string().trim().max(40, 'คำนำหน้าชื่อยาวเกินไป').optional().default(''),
  profileImageUrl: z.string().trim().max(500, 'URL รูป profile ยาวเกินไป').optional().default('')
    .refine((value) => !value || /^https?:\/\//i.test(value), 'URL รูป profile ต้องขึ้นต้นด้วย http:// หรือ https://'),
  roleIds: z.array(z.string().trim().regex(/^\d+$/, 'Role ไม่ถูกต้อง')).min(1, 'เลือก role อย่างน้อย 1 รายการ'),
  username: z.string().trim()
    .min(3, 'Username ต้องมีอย่างน้อย 3 ตัวอักษร')
    .max(60, 'Username ยาวเกินไป')
    .regex(/^[A-Za-z0-9._-]+$/, 'Username ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง และ underscore'),
})

function toIso(value: Date | null) {
  return value ? value.toISOString() : null
}

function optionalText(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

function parseRoleIds(roleIds: string[]) {
  const parsed = roleIds.map((roleId) => parseInternalBigIntId(roleId))

  if (parsed.some((roleId) => roleId == null)) {
    throw new Error('Role ที่เลือกไม่ถูกต้อง')
  }

  return parsed as bigint[]
}

async function assertUserRefs(roleIds: string[], branchIds: string[]) {
  const parsedRoleIds = parseRoleIds(roleIds)
  const [roles, branches] = await Promise.all([
    prisma.app_roles.findMany({
      select: { id: true },
      where: { id: { in: parsedRoleIds }, active: true },
    }),
    findActiveBranchReferencesByCodes(branchIds),
  ])

  if (roles.length !== new Set(parsedRoleIds.map((roleId) => roleId.toString())).size) {
    throw new Error('Role ที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  if (branchIds.length && branches.length !== new Set(branchIds).size) {
    throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return {
    branchRefs: branches,
    roleRefIds: parsedRoleIds,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')

    const [users, roles, branches] = await Promise.all([
      prisma.app_users.findMany({
        include: {
          app_user_branch_access: {
            include: {
              branches: true,
            },
          },
          app_user_roles: {
            include: {
              app_roles: true,
            },
          },
        },
        orderBy: [{ active: 'desc' }, { username: 'asc' }],
      }),
      prisma.app_roles.findMany({
        orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
      }),
      prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        where: {
          active: true,
        },
      }),
    ])

    return NextResponse.json({
      branches: branches.map((branch) => ({
        code: branch.code,
        id: branch.code,
        name: branch.name,
      })),
      roles: roles.map((role) => ({
        active: role.active,
        branchScope: role.branch_scope,
        canEditOpeningBalance: role.can_edit_opening_balance,
        canSeeCash: role.can_see_cash,
        canSeeCost: role.can_see_cost,
        canSeeFinancials: role.can_see_financials,
        canSeeProfit: role.can_see_profit,
        code: role.code,
        description: role.description,
        id: role.id.toString(),
        isSystem: role.is_system,
        name: role.name,
      })),
      users: users.map((user) => ({
        active: user.active,
        authUserId: user.auth_user_id,
        branchIds: user.app_user_branch_access.map((branch) => branch.branches.code),
        branches: user.app_user_branch_access.map((branch) => ({
          code: branch.branches.code,
          id: branch.branches.code,
          name: branch.branches.name,
        })),
        createdAt: toIso(user.created_at),
        displayName: user.display_name,
        email: user.email,
        firstName: user.first_name ?? null,
        id: user.id.toString(),
        lastLoginAt: toIso(user.last_login_at),
        lastName: user.last_name ?? null,
        mustChangePassword: user.must_change_password,
        namePrefix: user.name_prefix ?? null,
        profileImageUrl: user.profile_image_url ?? null,
        contactPhone: user.contact_phone ?? null,
        contactLineId: user.contact_line_id ?? null,
        contactNote: user.contact_note ?? null,
        roles: user.app_user_roles.map((userRole) => ({
          branchScope: userRole.app_roles.branch_scope,
          code: userRole.app_roles.code,
          id: userRole.role_id.toString(),
          name: userRole.app_roles.name,
        })),
        updatedAt: toIso(user.updated_at),
        username: user.username,
      })),
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')

    const values = adminUserFormSchema.parse(await request.json())
    const { branchRefs, roleRefIds } = await assertUserRefs(values.roleIds, values.branchIds)

    const existing = await prisma.app_users.findFirst({
      where: {
        OR: [
          { username: { equals: values.username, mode: 'insensitive' } },
          { email: { equals: values.email, mode: 'insensitive' } },
        ],
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'Username หรือ email นี้มีอยู่แล้ว' }, { status: 409 })
    }

    const actor = context.appUser?.username ?? context.authUser.email ?? 'system'
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.app_users.create({
        data: {
          active: values.active,
          contact_line_id: optionalText(values.contactLineId),
          contact_note: optionalText(values.contactNote),
          contact_phone: optionalText(values.contactPhone),
          created_by: actor,
          display_name: values.displayName,
          email: values.email,
          first_name: optionalText(values.firstName),
          last_name: optionalText(values.lastName),
          must_change_password: values.mustChangePassword,
          name_prefix: optionalText(values.namePrefix),
          profile_image_url: optionalText(values.profileImageUrl),
          updated_by: actor,
          username: values.username,
        },
      })

      await tx.app_user_roles.createMany({
        data: roleRefIds.map((roleId) => ({
          created_by: actor,
          role_id: roleId,
          user_id: created.id,
        })),
      })

      if (values.branchIds.length) {
        await tx.app_user_branch_access.createMany({
          data: values.branchIds.map((branchId) => ({
            branch_id: branchRefs.find((branch) => branch.code === branchId.toUpperCase())!.id,
            created_by: actor,
            user_id: created.id,
          })),
        })
      }

      return created
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.created',
      metadata: {
        active: user.active,
        branchCount: values.branchIds.length,
        roleCount: values.roleIds.length,
        username: user.username,
      },
      request,
      targetAppUserId: user.id.toString(),
    })

    return NextResponse.json({ id: user.id.toString() }, { status: 201 })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
