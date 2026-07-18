import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { getProductImageDisplay } from '@/lib/product-images'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { listActiveProductReferences, listActiveProductThumbnailReferences } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const [products, thumbnails] = await Promise.all([
      listActiveProductReferences(),
      listActiveProductThumbnailReferences(),
    ])
    const thumbnailByCode = new Map(thumbnails.map((thumbnail) => [thumbnail.code, thumbnail.thumbnailStorageKey]))

    return NextResponse.json({
      rows: products.map((product) => {
        const code = requireBusinessCode(product.code, `สินค้า ${product.id}`)
        const image = getProductImageDisplay(null, thumbnailByCode.get(code) ?? null)
        return {
          code,
          id: code,
          name: product.name,
          thumbnailUrl: image.thumbnailUrl,
          type: product.type,
          unit: product.unit,
        }
      }),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการสินค้าไม่ได้', 500)
  }
}
