import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    const scopedBranchIds = context.isAdmin ? [] : context.appUser?.branchIds ?? []
    const rows = await prisma.branches.findMany({
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      select: { code: true, id: true, name: true },
      where: {
        active: true,
        ...(scopedBranchIds.length ? { code: { in: scopedBranchIds } } : {}),
      },
    })

    return NextResponse.json({
      branches: rows.map((row) => ({
        code: row.code,
        id: row.code,
        name: row.name,
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลสาขาไม่ได้', 500)
  }
}
