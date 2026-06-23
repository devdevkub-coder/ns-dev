import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { productionProductStock, ProductionOrderError } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.orders.view')
    const url = new URL(request.url)
    const branchCode = url.searchParams.get('branchCode') ?? ''
    const productCode = url.searchParams.get('productCode') ?? ''
    const warehouseCode = url.searchParams.get('warehouseCode') ?? ''
    return NextResponse.json(await productionProductStock({ branchCode, productCode, warehouseCode }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'โหลดสต๊อกสินค้าไม่ได้', 500)
  }
}
