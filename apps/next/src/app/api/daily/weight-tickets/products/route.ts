import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { getProductImageDisplay } from '@/lib/product-images'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const products = await prisma.products.findMany({
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { code: true, id: true, image_storage_key: true, image_thumbnail_storage_key: true, name: true, type: true, unit: true },
      where: { active: true },
    })

    return NextResponse.json({
      rows: products.map((product) => {
        const code = requireBusinessCode(product.code, `สินค้า ${product.id}`)
        const image = getProductImageDisplay(product.image_storage_key, product.image_thumbnail_storage_key)
        return {
          code,
          id: code,
          name: product.name,
          thumbnailUrl: image.thumbnailUrl,
          type: product.type,
          unit: product.unit,
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการสินค้าไม่ได้', 500)
  }
}
