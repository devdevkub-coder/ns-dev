import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { branchScopeIds } from '@/lib/server/weight-tickets'
import {
  listActiveCustomerBranchOptionsByBranchCodes,
  listActiveSupplierBranchOptionsByBranchCodes,
} from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

const querySchema = z.object({
  branchId: z.string().trim().min(1, 'เลือกสาขา'),
  type: z.enum(['WTI', 'WTO']),
})

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    const requestedBranch = query.branchId.toUpperCase()
    const scopedBranchIds = branchScopeIds(context)
    if (scopedBranchIds !== null && !scopedBranchIds.some((code) => code.toUpperCase() === requestedBranch)) {
      return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์ใช้สาขานี้' }, { status: 403 })
    }

    const rows = query.type === 'WTI'
      ? await listActiveSupplierBranchOptionsByBranchCodes([requestedBranch])
      : await listActiveCustomerBranchOptionsByBranchCodes([requestedBranch])

    return NextResponse.json({
      options: rows.map((row) => ({
        branchIds: row.branchIds,
        code: requireBusinessCode(row.code, `${query.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} ${row.id}`),
        id: requireBusinessCode(row.code, `${query.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} ${row.id}`),
        name: row.name,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลผู้ขาย/ลูกค้าสำหรับใบรับ-ส่งของไม่ได้', 500)
  }
}
