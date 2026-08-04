import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { listActiveBranches, listActiveBranchesByCodes } from '@/lib/server/reference-master-cache'
import { apiErrorResponse } from '@/lib/server/api-error'
import { masterDataListJson } from '@/lib/server/master-data'
import { MASTER_DATA_PAGE_PERMISSIONS } from '@/lib/master-data-page-permissions'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, MASTER_DATA_PAGE_PERMISSIONS.customers.view)

    const allowedBranchCodes = getBranchCodeIntersection(context)
    const rows = allowedBranchCodes
      ? await listActiveBranchesByCodes(allowedBranchCodes)
      : await listActiveBranches()

    return masterDataListJson(rows.map((row) => ({
      id: row.code,
      code: row.code,
      name: row.name,
      active: true,
    })))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลอ้างอิงลูกค้าไม่ได้', 500)
  }
}
