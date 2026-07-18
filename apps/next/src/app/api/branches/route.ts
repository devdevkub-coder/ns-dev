import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { listActiveBranches, listActiveBranchesByCodes } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    const allowedBranchCodes = getBranchCodeIntersection(context)
    const rows = allowedBranchCodes ? await listActiveBranchesByCodes(allowedBranchCodes) : await listActiveBranches()

    return NextResponse.json({
      branches: rows.map((row) => ({
        code: row.code,
        id: row.code,
        name: row.name,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลสาขาไม่ได้', 500)
  }
}
