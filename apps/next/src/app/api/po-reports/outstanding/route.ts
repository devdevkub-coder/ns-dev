import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type PoItem = {
  productId?: string
  productName?: string
  qty?: number | string
  remainingQty?: number | string
  unitPrice?: number | string
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function poItems(
  row: { items: unknown; product_id: bigint | null; qty: unknown; remaining_qty: unknown; unit_price: unknown },
  product: { code: string; name: string } | null,
) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoItem => typeof item === 'object' && item !== null)
      .map((item) => ({
        productId: item.productId ?? '',
        productName: item.productName ?? product?.name ?? '-',
        qty: jsonNumber(item.qty),
        remainingQty: jsonNumber(item.remainingQty ?? item.qty),
        unitPrice: jsonNumber(item.unitPrice),
      }))
  }

  return [{
    productId: product?.code ?? '',
    productName: product?.name ?? '-',
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    unitPrice: jsonNumber(row.unit_price),
  }]
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')

    const [poBuys, poSells] = await Promise.all([
      prisma.po_buys.findMany({
        include: { suppliers: true },
        orderBy: [{ expected_delivery: 'asc' }, { date: 'asc' }],
        take: 5000,
        where: {
          NOT: { status: { in: ['Cancelled', 'cancelled', 'Received', 'received'] } },
          require_delivery: { not: false },
        },
      }),
      prisma.po_sells.findMany({
        include: { customers: true },
        orderBy: [{ expected_delivery: 'asc' }, { date: 'asc' }],
        take: 5000,
        where: {
          NOT: { status: { in: ['Cancelled', 'cancelled', 'Canceled', 'canceled', 'Closed', 'closed', 'Completed', 'completed', 'Fully Matched', 'fully matched', 'Received', 'received'] } },
          require_delivery: { not: false },
        },
      }),
    ])

    const productIds = [...new Set([...poBuys.map((row) => row.product_id), ...poSells.map((row) => row.product_id)].filter((value): value is bigint => value != null))]
    const products = productIds.length ? await prisma.products.findMany({ select: { code: true, id: true, name: true }, where: { id: { in: productIds } } }) : []
    const productById = new Map(products.map((product) => [product.id, product]))

    const buyRows = poBuys.flatMap((po) => {
      const productRow = po.product_id ? productById.get(po.product_id) ?? null : null
      const product = productRow ? { code: requireBusinessCode(productRow.code, `สินค้า ${productRow.id}`), name: productRow.name } : null
      return poItems(po, product)
        .filter((item) => item.remainingQty > 0.001)
        .map((item) => ({
          date: toDateOnly(po.date),
          docNo: po.doc_no,
          expectedDelivery: toDateOnly(po.expected_delivery),
          id: `${po.id}:${item.productId}`,
          partnerName: po.suppliers?.name ?? '-',
          productId: item.productId,
          productName: item.productName,
          qty: item.qty,
          receivedQty: item.qty - item.remainingQty,
          remainingQty: item.remainingQty,
          remainingValue: item.remainingQty * item.unitPrice,
          status: po.status ?? 'Open',
          unitPrice: item.unitPrice,
        }))
    })

    const sellRows = poSells.flatMap((po) => {
      const productRow = po.product_id ? productById.get(po.product_id) ?? null : null
      const product = productRow ? { code: requireBusinessCode(productRow.code, `สินค้า ${productRow.id}`), name: productRow.name } : null
      return poItems(po, product)
        .filter((item) => item.remainingQty > 0.001)
        .map((item) => ({
          date: toDateOnly(po.date),
          docNo: po.doc_no,
          expectedDelivery: toDateOnly(po.expected_delivery),
          id: `${po.id}:${item.productId}`,
          partnerName: po.customers?.name ?? '-',
          productId: item.productId,
          productName: item.productName,
          qty: item.qty,
          remainingQty: item.remainingQty,
          remainingValue: item.remainingQty * item.unitPrice,
          soldQty: item.qty - item.remainingQty,
          status: po.status ?? 'Open',
          unitPrice: item.unitPrice,
        }))
    })

    return NextResponse.json({
      buyRows,
      sellRows,
      summary: {
        buyCount: buyRows.length,
        buyRemainingQty: buyRows.reduce((sum, row) => sum + row.remainingQty, 0),
        buyRemainingValue: buyRows.reduce((sum, row) => sum + row.remainingValue, 0),
        sellCount: sellRows.length,
        sellRemainingQty: sellRows.reduce((sum, row) => sum + row.remainingQty, 0),
        sellRemainingValue: sellRows.reduce((sum, row) => sum + row.remainingValue, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด PO Outstanding ไม่ได้', 500)
  }
}
