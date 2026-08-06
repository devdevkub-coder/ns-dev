import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { listActiveImpurities } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')
    const impurities = await listActiveImpurities()

    return NextResponse.json({
      options: impurities.map((impurity) => ({ id: impurity.id.toString(), label: impurity.name })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลสิ่งเจือปนสำหรับใบรับ-ส่งของไม่ได้', 500)
  }
}
