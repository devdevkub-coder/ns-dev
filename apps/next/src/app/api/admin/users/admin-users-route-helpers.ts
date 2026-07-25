import { NextResponse } from 'next/server'
import { z } from 'zod'

type BranchReferenceForAccess = {
  code: string
  id: bigint
}

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
