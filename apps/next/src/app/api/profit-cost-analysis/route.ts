import { NextRequest, NextResponse } from 'next/server'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { REPORT_PAGE_PERMISSIONS } from '@/lib/report-permissions'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, REPORT_PAGE_PERMISSIONS.profitCostAnalysis)

    return NextResponse.json({
      error: 'Endpoint นี้ยกเลิกแล้ว ให้ใช้ /summary, /rankings และ endpoint ตารางแยกตาม tab',
    }, { status: 410, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    console.error('Retired Profit & Cost Analysis route authorization failed', caught)
    return NextResponse.json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
