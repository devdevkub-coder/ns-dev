import { MASTER_DATA_PAGE_PERMISSIONS } from '@/lib/master-data-page-permissions'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { listProductTypes, listProductUnits } from '@/lib/server/reference-master-cache'
import { apiErrorResponse } from '@/lib/server/api-error'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, MASTER_DATA_PAGE_PERMISSIONS.products.view)

    const [productTypes, productUnits] = await Promise.all([listProductTypes(), listProductUnits()])
    return Response.json({
      productTypes: productTypes.map((row) => ({ id: row.id.toString(), code: row.code, name: row.name, active: row.active })),
      productUnits: productUnits.map((row) => ({ id: row.id.toString(), code: row.code, name: row.name, active: row.active })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลอ้างอิงสินค้าไม่ได้', 500)
  }
}
