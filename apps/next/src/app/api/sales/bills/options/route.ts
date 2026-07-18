import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { salesBranchScope, salesGlobalReferenceOptionsPayload, salesOptionsPayload, salesReferenceOptionsPayload } from '@/app/api/sales/bills/route'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const scope = new URL(request.url).searchParams.get('scope') ?? 'full'
    const payload = scope === 'global-reference'
      ? await salesGlobalReferenceOptionsPayload()
      : await (async () => {
        const branchScope = await salesBranchScope(context)
        return scope === 'reference'
          ? salesReferenceOptionsPayload(branchScope)
          : salesOptionsPayload(branchScope)
      })()
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดตัวเลือกบิลขายไม่ได้', 500)
  }
}
