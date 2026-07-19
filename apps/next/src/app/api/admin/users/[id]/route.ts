import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const routeParamsSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, 'รหัสผู้ใช้ไม่ถูกต้อง'),
})

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
  profileImageUrl: z.string().trim().max(500, 'URL รูป profile ยาวเกินไป').optional().default('')
    .refine((value) => !value || /^https?:\/\//i.test(value), 'URL รูป profile ต้องขึ้นต้นด้วย http:// หรือ https://'),
  roleIds: z.array(z.string().trim().regex(/^\d+$/, 'หน้าที่งานไม่ถูกต้อง')).length(1, 'เลือกหน้าที่งาน 1 รายการ'),
})

type AdminUserRouteProps = {
  params: Promise<unknown>
}

function parseAppUserId(value: string) {
  const parsed = parseInternalBigIntId(value)
  if (parsed == null) {
    throw new Error('รหัสผู้ใช้ไม่ถูกต้อง')
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

async function assertUserRefs(
  roleIds: string[],
  branchIds: string[],
  departmentId: string,
) {
  const parsedRoleIds = parseRoleIds(roleIds)
  const parsedDepartmentId = parseDepartmentId(departmentId)
  const [roles, branches, department] = await Promise.all([
    prisma.app_roles.findMany({
      select: { id: true },
      where: { id: { in: parsedRoleIds }, active: true, is_employee_role: true },
    }),
    findActiveBranchReferencesByCodes(branchIds),
    prisma.departments.findFirst({
      select: { id: true },
      where: { id: parsedDepartmentId, active: true },
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

  return {
    branchRefs: branches,
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
    const { branchRefs, departmentId, roleRefIds } = await assertUserRefs(values.roleIds, values.branchIds, values.departmentId)
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

    const actor = context.appUser?.email ?? context.authUser.email ?? 'system'

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

      if (values.branchIds.length) {
        await tx.app_user_branch_access.createMany({
          data: values.branchIds.map((branchId) => ({
            branch_id: branchRefs.find((branch) => branch.code === branchId.toUpperCase())!.id,
            created_by: actor,
            user_id: id,
          })),
        })
      }
    })

    await recordAuthAuditEvent({
      context,
      eventType: 'app_user.updated',
      metadata: {
        branchCount: values.branchIds.length,
        departmentId: departmentId.toString(),
        displayName,
        roleCount: values.roleIds.length,
        permissionOverrideCount: 0,
        email: values.email,
      },
      request,
      targetAppUserId: id.toString(),
    })

    return NextResponse.json({ id: id.toString() })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
