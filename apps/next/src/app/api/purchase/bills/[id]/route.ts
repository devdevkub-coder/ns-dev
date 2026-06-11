import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { getPurchaseBillDetail } from '@/lib/server/purchase-bill-detail'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const detail = await getPurchaseBillDetail(decodeURIComponent(id))
    if (!detail) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อที่ต้องการ' }, { status: 404 })
    }

    const allowedBranchCodes = getBranchCodeIntersection(auth)
    if (allowedBranchCodes && !allowedBranchCodes.includes(detail.branchId)) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อที่ต้องการ' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายละเอียดบิลรับซื้อไม่ได้', 500)
  }
}
