import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildProductionReconciliationReport } from '@/lib/server/production-reconciliation'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.operations.view')

    return NextResponse.json(await buildProductionReconciliationReport())
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ตรวจ reconciliation ใบสั่งผลิตไม่ได้', 500)
  }
}
