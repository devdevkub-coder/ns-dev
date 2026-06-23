import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { loadWtoStockOptions, WtoStockOptionError } from '@/lib/server/stock-holds'
import { branchScopeIds } from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const stockOptionsQuerySchema = z.object({
  branchId: z.string().trim().min(1, 'เลือกสาขา'),
  productId: z.string().trim().min(1, 'เลือกสินค้า'),
})

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const query = stockOptionsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const payload = await loadWtoStockOptions({
      branchId: query.branchId,
      productId: query.productId,
      scopedBranchIds: branchScopeIds(context),
    })

    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoStockOptionError) {
      return NextResponse.json({ code: caught.code, error: caught.message }, { status: caught.status })
    }
    if (caught instanceof z.ZodError) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: caught.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }
    return apiErrorResponse(caught, 'โหลดข้อมูลคงเหลือสำหรับใบส่งของไม่ได้', 500)
  }
}
