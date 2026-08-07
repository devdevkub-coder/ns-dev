import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'

type BranchReferenceForAccess = {
  code: string
  id: bigint
}

export type AdminUserBranchAccessMode = 'all' | 'selected'

export const adminUserBranchAccessModeSchema = z.enum(['all', 'selected']).optional()

export const adminUserPermissionOverridesSchema = z.array(z.object({
  effect: z.enum(['allow', 'deny']),
  permissionId: z.string().trim().regex(/^\d+$/, 'สิทธิ์ไม่ถูกต้อง'),
})).optional()

export class AdminUserReferenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminUserReferenceError'
  }
}

export function adminUserReferenceErrorResponse(caught: unknown) {
  if (caught instanceof AdminUserReferenceError) {
    return NextResponse.json({ code: 'VALIDATION_ERROR', error: caught.message }, { status: 400 })
  }
  if (caught instanceof z.ZodError) {
    return NextResponse.json({ code: 'VALIDATION_ERROR', error: caught.issues[0]?.message ?? 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, { status: 400 })
  }
  return null
}

export function findBranchReferenceForAccess(branchRefs: BranchReferenceForAccess[], branchCode: string) {
  const normalizedBranchCode = branchCode.trim().toUpperCase()
  const branchRef = branchRefs.find((branch) => branch.code.trim().toUpperCase() === normalizedBranchCode)

  if (!branchRef) {
    throw new AdminUserReferenceError('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return branchRef
}

export function resolveBranchReferencesForUser(input: {
  activeBranchRefs: BranchReferenceForAccess[]
  branchAccessMode?: AdminUserBranchAccessMode
  branchIds: string[]
  hasUnrestrictedRole: boolean
  selectedBranchRefs: BranchReferenceForAccess[]
}) {
  const { activeBranchRefs, branchAccessMode, branchIds, hasUnrestrictedRole, selectedBranchRefs } = input

  if (branchAccessMode === 'all') {
    if (branchIds.length) throw new AdminUserReferenceError('เมื่อเลือกทุกสาขา ไม่ต้องส่งรายการสาขา')
    return hasUnrestrictedRole ? [] : activeBranchRefs
  }

  if (branchAccessMode === 'selected' && !branchIds.length) {
    throw new AdminUserReferenceError('กรุณาเลือกสาขาที่เข้าถึงอย่างน้อย 1 สาขา')
  }

  if (branchAccessMode === undefined) {
    if (hasUnrestrictedRole && branchIds.length) {
      throw new AdminUserReferenceError('Role นี้กำหนดให้เข้าถึงทุกสาขา จึงไม่ต้องเลือกสาขารายการ')
    }
    if (!hasUnrestrictedRole && !branchIds.length) {
      throw new AdminUserReferenceError('Role นี้ต้องเลือกสาขาที่เข้าถึงอย่างน้อย 1 สาขา')
    }
  }

  if (branchIds.length && selectedBranchRefs.length !== new Set(branchIds.map((branchId) => branchId.trim().toUpperCase())).size) {
    throw new AdminUserReferenceError('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return selectedBranchRefs
}

export async function assertUserPermissionOverrides(values: NonNullable<z.infer<typeof adminUserPermissionOverridesSchema>>) {
  const seen = new Set<string>()
  const parsed = values.map((override) => {
    const permissionId = parseInternalBigIntId(override.permissionId)
    const key = permissionId?.toString() ?? ''
    if (permissionId == null || seen.has(key)) {
      throw new AdminUserReferenceError('สิทธิ์รายผู้ใช้ไม่ถูกต้อง')
    }
    seen.add(key)
    return { effect: override.effect, permissionId }
  })
  const permissions = await prisma.app_permissions.findMany({
    select: { id: true },
    where: { active: true, id: { in: parsed.map((item) => item.permissionId) } },
  })
  if (permissions.length !== parsed.length) {
    throw new AdminUserReferenceError('สิทธิ์รายผู้ใช้ไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
  return parsed
}
