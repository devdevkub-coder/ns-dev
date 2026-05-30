import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    await request.text()
    return NextResponse.json({
      code: 'BAD_REQUEST',
      error: 'ยกเลิกรายการรอจ่ายไม่ได้อีกแล้ว เพราะรายการที่อนุมัติเป็น PMA final ต้องไปจัดการที่ PMT/การจ่ายเงินจริงแทน',
    }, { status: 400 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรายการรอจ่ายไม่ได้', 400)
  }
}
