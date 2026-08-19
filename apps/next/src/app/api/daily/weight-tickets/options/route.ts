import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { branchScopeIds } from '@/lib/server/weight-tickets'
import {
  listActiveBranches,
  listActiveBranchesByCodes,
  listWarehouseMasterRecords,
} from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const scopedBranchIds = branchScopeIds(context)
    const branches = scopedBranchIds === null ? await listActiveBranches() : await listActiveBranchesByCodes(scopedBranchIds)
    const warehouseRows = await listWarehouseMasterRecords()
    const warehouses = warehouseRows
      .filter((row) => row.active === true && /^WH-\d+$/i.test(row.code))
      .map((row) => {
        const code = requireBusinessCode(row.code, `คลัง ${row.id.toString()}`)
        return {
          branchCode: row.branchCode ?? null,
          code,
          id: code,
          name: row.name,
        }
      })
    return NextResponse.json({
      branches: branches.map((branch) => {
        const code = requireBusinessCode(branch.code, `สาขา ${branch.id.toString()}`)
        return { code, id: code, name: branch.name }
      }),
      warehouses,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลอ้างอิงสำหรับใบรับ-ส่งของไม่ได้', 500)
  }
}
