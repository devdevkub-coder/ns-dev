import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { salesBranchScope, salesOptionsPayload, salesReferenceOptionsPayload } from '@/app/api/sales/bills/route'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const scope = new URL(request.url).searchParams.get('scope') ?? 'full'
    const branchScope = await salesBranchScope(context)
    const payload = scope === 'reference'
      ? await salesReferenceOptionsPayload(branchScope)
      : await salesOptionsPayload(branchScope)
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดตัวเลือกบิลขายไม่ได้', 500)
  }
}
