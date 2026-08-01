import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')
    const rows = await prisma.account_categories.findMany({
      orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
      where: { active: true },
    })
    return NextResponse.json(rows.map((row) => ({
      active: row.active,
      code: row.code,
      id: row.code,
      name: row.name,
      sortOrder: row.sort_order,
      type: row.account_group,
    })))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return NextResponse.json({ error: 'โหลดประเภทบัญชีไม่ได้' }, { status: 500 })
  }
}
