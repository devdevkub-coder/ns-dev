import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getSalesBillDetail } from '@/lib/server/sales-bill-detail'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const detail = await getSalesBillDetail(decodeURIComponent(id))
    if (!detail) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลขายที่ต้องการ' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายละเอียดบิลขายไม่ได้', 500)
  }
}
