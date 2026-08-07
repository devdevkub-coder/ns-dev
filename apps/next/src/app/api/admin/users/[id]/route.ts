import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { prisma } from '@/lib/server/prisma'
import { listActiveBranches } from '@/lib/server/reference-master-cache'
import { adminUserEmailSchema, contactPhoneErrorMessage, isValidContactPhone } from '../admin-user-form-validation'
import { AdminUserReferenceError, adminUserPermissionOverridesSchema, adminUserReferenceErrorResponse, adminUserBranchAccessModeSchema, assertUserPermissionOverrides, resolveBranchReferencesForUser } from '../admin-users-route-helpers'

export const runtime = 'nodejs'

const routeParamsSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, 'รหัสผู้ใช้ไม่ถูกต้อง'),
})

const adminUserFormSchema = z.object({
  active: z.boolean().default(true),
  branchAccessMode: adminUserBranchAccessModeSchema,
  branchIds: z.array(z.string().min(1)).default([]),
  contactLineId: z.string().trim().max(120, 'LINE ID ยาวเกินไป').optional().default(''),
  contactNote: z.string().trim().max(500, 'หมายเหตุ contact ยาวเกินไป').optional().default(''),
  contactPhone: z.string().trim().max(80, 'เบอร์ติดต่อยาวเกินไป').refine(isValidContactPhone, contactPhoneErrorMessage).optional().default(''),
  departmentId: z.string().trim().regex(/^\d+$/, 'เลือกฝ่ายให้ถูกต้อง'),
  email: adminUserEmailSchema,
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อจริง').max(120, 'ชื่อจริงยาวเกินไป'),
  lastName: z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(120, 'นามสกุลยาวเกินไป'),
  mustChangePassword: z.boolean().default(false),
  namePrefix: z.enum(['', 'นาย', 'นาง', 'นางสาว', 'คุณ'], { message: 'คำนำหน้าชื่อไม่ถูกต้อง' }).optional().default(''),
  profileImageUrl: z.string().trim().max(500, 'URL รูป profile ยาวเกินไป').optional().default('')
    .refine((value) => !value || /^https?:\/\//i.test(value), 'URL รูป profile ต้องขึ้นต้นด้วย http:// หรือ https://'),
  permissionOverrides: adminUserPermissionOverridesSchema,
  roleIds: z.array(z.string().trim().regex(/^\d+$/, 'หน้าที่งานไม่ถูกต้อง')).min(1, 'เลือกหน้าที่งานอย่างน้อย 1 รายการ'),
})

type AdminUserRouteProps = {
  params: Promise<unknown>
}

function parseAppUserId(value: string) {
  const parsed = parseInternalBigIntId(value)
  if (parsed == null) {
    throw new AdminUserReferenceError('รหัสผู้ใช้ไม่ถูกต้อง')
  }
  return parsed
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

  if (!parsed.length || parsed.some((roleId) => roleId == null) || new Set(parsed.filter((roleId): roleId is bigint => roleId != null)).size !== parsed.length) {
    throw new AdminUserReferenceError('Role ที่เลือกไม่ถูกต้อง')
  }

  return parsed as bigint[]
}

function parseDepartmentId(value: string) {
  const parsed = parseInternalBigIntId(value)
  if (parsed == null) {
    throw new AdminUserReferenceError('ฝ่ายไม่ถูกต้อง')
  }
  return parsed
}

async function assertUserRefs(
  roleIds: string[],
  branchIds: string[],
  departmentId: string,
  branchAccessMode?: 'all' | 'selected',
) {
  const parsedRoleIds = parseRoleIds(roleIds)
  const parsedDepartmentId = parseDepartmentId(departmentId)
  const [roles, branches, department, activeBranches] = await Promise.all([
    prisma.app_roles.findMany({
      select: { branch_scope: true, id: true },
      where: { id: { in: parsedRoleIds }, active: true },
    }),
    findActiveBranchReferencesByCodes(branchIds),
    prisma.departments.findFirst({
      select: { id: true },
      where: { id: parsedDepartmentId, active: true },
    }),
    branchAccessMode === 'all' ? listActiveBranches() : Promise.resolve([]),
  ])

  if (roles.length !== new Set(parsedRoleIds.map((roleId) => roleId.toString())).size) {
    throw new AdminUserReferenceError('หน้าที่งานที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  const hasUnrestrictedRole = roles.some((role) => role.branch_scope.trim().toLowerCase() === 'all')
  const branchRefs = resolveBranchReferencesForUser({
    activeBranchRefs: activeBranches,
    branchAccessMode,
    branchIds,
    hasUnrestrictedRole,
    selectedBranchRefs: branches,
  })

  if (!department) {
    throw new AdminUserReferenceError('ฝ่ายที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return {
    branchRefs,
    departmentId: parsedDepartmentId,
    roleRefIds: parsedRoleIds,
  }
}

export async function PATCH(request: Request, { params }: AdminUserRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.update')

    const { id: rawId } = routeParamsSchema.parse(await params)
    const id = parseAppUserId(rawId)
    const values = adminUserFormSchema.parse(await request.json())
    const { branchRefs, departmentId, roleRefIds } = await assertUserRefs(values.roleIds, values.branchIds, values.departmentId, values.branchAccessMode)
    const permissionOverrides = values.permissionOverrides === undefined
      ? null
      : await assertUserPermissionOverrides(values.permissionOverrides)
    if (permissionOverrides !== null) {
      requirePermission(context, 'system.permissions.update')
    }
    const displayName = displayNameFromProfile(values)

    const existing = await prisma.app_users.findFirst({
      where: {
        id: { not: id },
        email: { equals: values.email, mode: 'insensitive' },
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'อีเมลนี้มีอยู่แล้ว' }, { status: 409 })
    }

    const actor = context.appUser?.email?.trim() || context.authUser.email?.trim() || context.authUser.id

    await prisma.$transaction(async (tx) => {
      await tx.app_users.update({
        data: {
          contact_line_id: optionalText(values.contactLineId),
          contact_note: optionalText(values.contactNote),
          contact_phone: optionalText(values.contactPhone),
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
        where: { id },
      })

      await tx.app_user_roles.deleteMany({ where: { user_id: id } })
      await tx.app_user_roles.createMany({
        data: roleRefIds.map((roleId) => ({
          created_by: actor,
          role_id: roleId,
          user_id: id,
        })),
      })

      await tx.app_user_branch_access.deleteMany({ where: { user_id: id } })

      if (branchRefs.length) {
        await tx.app_user_branch_access.createMany({
          data: branchRefs.map((branch) => ({
            branch_id: branch.id,
            created_by: actor,
            user_id: id,
          })),
        })
      }

      if (permissionOverrides !== null) {
        await tx.app_user_permission_overrides.deleteMany({ where: { user_id: id } })
      }
      if (permissionOverrides?.length) {
        await tx.app_user_permission_overrides.createMany({
          data: permissionOverrides.map((override) => ({
            created_by: actor,
            effect: override.effect,
            permission_id: override.permissionId,
            updated_by: actor,
            user_id: id,
          })),
        })
      }
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.updated',
      metadata: {
        branchCount: branchRefs.length,
        departmentId: departmentId.toString(),
        displayName,
        roleCount: values.roleIds.length,
        permissionOverrideCount: permissionOverrides?.length ?? null,
        email: values.email,
      },
      request,
      targetAppUserId: id.toString(),
    })

    return NextResponse.json({ id: id.toString() })
  } catch (caught) {
    const validationErrorResponse = adminUserReferenceErrorResponse(caught)
    if (validationErrorResponse) return validationErrorResponse
    return authContextErrorResponse(caught)
  }
}
