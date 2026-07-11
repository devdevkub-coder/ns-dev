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
  departmentId: z.string().trim().regex(/^\d+$/, 'เลือกฝ่ายให้ถูกต้อง'),
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง'),
  firstName: z.string().trim().max(120, 'ชื่อจริงยาวเกินไป').optional().default(''),
  lastName: z.string().trim().max(120, 'นามสกุลยาวเกินไป').optional().default(''),
  mustChangePassword: z.boolean().default(false),
  namePrefix: z.enum(['', 'นาย', 'นาง', 'นางสาว', 'คุณ'], { message: 'คำนำหน้าชื่อไม่ถูกต้อง' }).optional().default(''),
  permissionOverrides: z.array(z.object({
    effect: z.enum(['allow', 'deny']),
    permissionId: z.string().trim().regex(/^\d+$/, 'สิทธิ์ไม่ถูกต้อง'),
  })).default([]),
  profileImageUrl: z.string().trim().max(500, 'URL รูป profile ยาวเกินไป').optional().default('')
    .refine((value) => !value || /^https?:\/\//i.test(value), 'URL รูป profile ต้องขึ้นต้นด้วย http:// หรือ https://'),
  roleIds: z.array(z.string().trim().regex(/^\d+$/, 'หน้าที่งานไม่ถูกต้อง')).length(1, 'เลือกหน้าที่งาน 1 รายการ'),
})

function toIso(value: Date | null) {
  return value ? value.toISOString() : null
}

function optionalText(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

function displayNameFromProfile(values: { email: string; firstName: string; lastName: string; namePrefix: string }) {
  return [values.namePrefix, values.firstName, values.lastName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ') || values.email
}

function parseRoleIds(roleIds: string[]) {
  const parsed = roleIds.map((roleId) => parseInternalBigIntId(roleId))

  if (parsed.some((roleId) => roleId == null)) {
    throw new Error('Role ที่เลือกไม่ถูกต้อง')
  }

  return parsed as bigint[]
}

function parseDepartmentId(value: string) {
  const parsed = parseInternalBigIntId(value)
  if (parsed == null) {
    throw new Error('ฝ่ายไม่ถูกต้อง')
  }
  return parsed
}

function parsePermissionOverrides(overrides: Array<{ effect: 'allow' | 'deny'; permissionId: string }>) {
  const seen = new Set<string>()
  const parsed = overrides.map((override) => {
    const permissionId = parseInternalBigIntId(override.permissionId)
    if (permissionId == null || seen.has(override.permissionId)) {
      throw new Error('สิทธิ์รายผู้ใช้ไม่ถูกต้อง')
    }
    seen.add(override.permissionId)
    return { effect: override.effect, permissionId }
  })
  return parsed
}

async function assertUserRefs(
  roleIds: string[],
  branchIds: string[],
  departmentId: string,
  permissionOverrides: Array<{ effect: 'allow' | 'deny'; permissionId: string }>,
) {
  const parsedRoleIds = parseRoleIds(roleIds)
  const parsedDepartmentId = parseDepartmentId(departmentId)
  const parsedPermissionOverrides = parsePermissionOverrides(permissionOverrides)
  const [roles, branches, department, permissions] = await Promise.all([
    prisma.app_roles.findMany({
      select: { id: true },
      where: { id: { in: parsedRoleIds }, active: true, is_employee_role: true },
    }),
    findActiveBranchReferencesByCodes(branchIds),
    prisma.departments.findFirst({
      select: { id: true },
      where: { id: parsedDepartmentId, active: true },
    }),
    prisma.app_permissions.findMany({
      select: { id: true },
      where: {
        active: true,
        id: { in: parsedPermissionOverrides.map((override) => override.permissionId) },
      },
    }),
  ])

  if (roles.length !== new Set(parsedRoleIds.map((roleId) => roleId.toString())).size) {
    throw new Error('หน้าที่งานที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  if (branchIds.length && branches.length !== new Set(branchIds).size) {
    throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  if (!department) {
    throw new Error('ฝ่ายที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  if (permissions.length !== parsedPermissionOverrides.length) {
    throw new Error('สิทธิ์รายผู้ใช้ไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return {
    branchRefs: branches,
    departmentId: parsedDepartmentId,
    permissionOverrides: parsedPermissionOverrides,
    roleRefIds: parsedRoleIds,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')

    const [users, roles, branches, departments, permissions] = await Promise.all([
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
          app_user_permission_overrides: {
            include: {
              app_permissions: true,
            },
          },
          departments: true,
        },
        orderBy: [{ active: 'desc' }, { email: 'asc' }],
      }),
      prisma.app_roles.findMany({
        include: {
          app_role_permissions: {
            select: { permission_id: true },
          },
        },
        orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
      }),
      prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        where: {
          active: true,
        },
      }),
      prisma.departments.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        where: {
          active: true,
        },
      }),
      prisma.app_permissions.findMany({
        orderBy: [{ module: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
        where: { active: true },
      }),
    ])

    return NextResponse.json({
      branches: branches.map((branch) => ({
        code: branch.code,
        id: branch.code,
        name: branch.name,
      })),
      departments: departments.map((department) => ({
        code: department.code,
        id: department.id.toString(),
        name: department.name,
      })),
      permissions: permissions.map((permission) => ({
        action: permission.action,
        code: permission.code,
        description: permission.description,
        id: permission.id.toString(),
        module: permission.module,
        resource: permission.resource,
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
        isEmployeeRole: role.is_employee_role,
        isSystem: role.is_system,
        name: role.name,
        permissionIds: role.app_role_permissions.map((permission) => permission.permission_id.toString()),
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
        permissionOverrides: user.app_user_permission_overrides
          .filter((override) => override.app_permissions.active)
          .map((override) => ({
            effect: override.effect,
            permissionId: override.permission_id.toString(),
          })),
        contactPhone: user.contact_phone ?? null,
        contactLineId: user.contact_line_id ?? null,
        contactNote: user.contact_note ?? null,
        department: user.departments
          ? {
              code: user.departments.code,
              id: user.departments.id.toString(),
              name: user.departments.name,
            }
          : null,
        departmentId: user.department_id?.toString() ?? null,
        roles: user.app_user_roles.map((userRole) => ({
          branchScope: userRole.app_roles.branch_scope,
          code: userRole.app_roles.code,
          id: userRole.role_id.toString(),
          name: userRole.app_roles.name,
        })),
        updatedAt: toIso(user.updated_at),
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
    const { branchRefs, departmentId, permissionOverrides, roleRefIds } = await assertUserRefs(values.roleIds, values.branchIds, values.departmentId, values.permissionOverrides)
    const displayName = displayNameFromProfile(values)
    const existing = await prisma.app_users.findFirst({
      where: {
        email: { equals: values.email, mode: 'insensitive' },
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'อีเมลนี้มีอยู่แล้ว' }, { status: 409 })
    }

    const actor = context.appUser?.email ?? context.authUser.email ?? 'system'
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.app_users.create({
        data: {
          active: values.active,
          contact_line_id: optionalText(values.contactLineId),
          contact_note: optionalText(values.contactNote),
          contact_phone: optionalText(values.contactPhone),
          created_by: actor,
          department_id: departmentId,
          display_name: displayName,
          email: values.email,
          first_name: optionalText(values.firstName),
          last_name: optionalText(values.lastName),
          must_change_password: values.mustChangePassword,
          name_prefix: optionalText(values.namePrefix),
          profile_image_url: optionalText(values.profileImageUrl),
          updated_by: actor,
        },
      })

      await tx.app_user_roles.createMany({
        data: roleRefIds.map((roleId) => ({
          created_by: actor,
          role_id: roleId,
          user_id: created.id,
        })),
      })

      if (permissionOverrides.length) {
        await tx.app_user_permission_overrides.createMany({
          data: permissionOverrides.map((override) => ({
            created_by: actor,
            effect: override.effect,
            permission_id: override.permissionId,
            updated_by: actor,
            user_id: created.id,
          })),
        })
      }

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
        departmentId: departmentId.toString(),
        displayName,
        roleCount: values.roleIds.length,
        permissionOverrideCount: values.permissionOverrides.length,
        email: user.email,
      },
      request,
      targetAppUserId: user.id.toString(),
    })

    return NextResponse.json({ id: user.id.toString() }, { status: 201 })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
