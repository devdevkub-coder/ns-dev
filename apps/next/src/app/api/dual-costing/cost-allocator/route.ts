import { NextResponse } from 'next/server'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type CostPoolRow = {
  availableQty: number
  availableValue: number
  branchName: string
  costPoolId: string
  costType: string
  counterparty: string
  date: string
  productId: string
  productName: string
  qty: number
  sourceNo: string
  sourceType: string
  status: string
  totalCost: number
  unitCost: number
  usedQty: number
}

type CostPoolPayload = {
  rows: CostPoolRow[]
}

type PoSellItem = {
  productCode?: string | null
  productId?: string | number | bigint | null
  productName?: string | null
  qty?: number | string | null
  remainingQty?: number | string | null
  totalAmount?: number | string | null
  totalRevenue?: number | string | null
  unitPrice?: number | string | null
}

type ProductRef = {
  code: string
  id: bigint
  metal_group: string | null
  name: string
}

type PoSellSourceRow = {
  items: unknown
  product_id: bigint | null
  qty: unknown
  remaining_qty: unknown
  unit_price: unknown
}

type SaleRow = {
  customerName: string
  date: string
  docNo: string
  id: string
  matchedQty: number
  productId: string
  productName: string
  qty: number
  remainingQty: number
  unitPrice: number
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function resolveProductCode(value: string | number | bigint | null | undefined, productById: Map<bigint, ProductRef>) {
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const product = productById.get(BigInt(trimmed))
      return product ? requireBusinessCode(product.code, `สินค้า ${product.id}`) : ''
    }
    return trimmed
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    const product = productById.get(BigInt(value))
    return product ? requireBusinessCode(product.code, `สินค้า ${product.id}`) : ''
  }
  return ''
}

function itemRows(row: PoSellSourceRow, fallbackProduct: ProductRef | null, productById: Map<bigint, ProductRef>) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoSellItem => typeof item === 'object' && item !== null)
      .map((item, index) => ({
        lineId: `${resolveProductCode(item.productCode ?? item.productId ?? row.product_id, productById) || 'line'}-${index}`,
        productId: resolveProductCode(item.productCode ?? item.productId ?? row.product_id, productById),
        productName: item.productName ?? item.productCode ?? fallbackProduct?.name ?? '-',
        qty: jsonNumber(item.qty),
        remainingQty: jsonNumber(item.remainingQty ?? item.qty),
        totalAmount: jsonNumber(item.totalRevenue ?? item.totalAmount),
        unitPrice: jsonNumber(item.unitPrice ?? row.unit_price),
      }))
  }

  return [{
    lineId: fallbackProduct?.code || 'header',
    productId: fallbackProduct?.code ?? '',
    productName: fallbackProduct?.name ?? '-',
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    totalAmount: 0,
    unitPrice: jsonNumber(row.unit_price),
  }]
}

function isCancelled(status: string | null | undefined) {
  return status === 'cancelled' || status === 'Cancelled'
}

function sortPool(rows: CostPoolRow[], mode: string) {
  const nextRows = [...rows]
  if (mode === 'Cheap') return nextRows.sort((left, right) => left.unitCost - right.unitCost)
  if (mode === 'Expensive') return nextRows.sort((left, right) => right.unitCost - left.unitCost)
  if (mode === 'LIFO') return nextRows.sort((left, right) => right.date.localeCompare(left.date))
  return nextRows.sort((left, right) => left.date.localeCompare(right.date))
}

async function readCostPool(request: Request) {
  const url = new URL(request.url)
  const poolUrl = new URL('/api/dual-costing/cost-pool?availableOnly=true', url.origin)
  const response = await fetch(poolUrl, {
    headers: {
      authorization: request.headers.get('authorization') ?? '',
      cookie: request.headers.get('cookie') ?? '',
    },
  })
  if (!response.ok) throw new Error(`Cost Pool API failed with ${response.status}`)
  return response.json() as Promise<CostPoolPayload>
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const productId = url.searchParams.get('productId')
    const poSellId = url.searchParams.get('poSellId')
    const mode = url.searchParams.get('mode') ?? 'FIFO'

    const [costPool, poSells, salesBills, tradingDeals, products] = await Promise.all([
      readCostPool(request),
      prisma.po_sells.findMany({
        include: { customers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { NOT: { status: { in: ['cancelled', 'Cancelled'] } } },
      }),
      prisma.sales_bills.findMany({
        select: { id: true, po_sell_id: true },
        take: 10000,
        where: { NOT: { status: 'cancelled' }, po_sell_id: { not: null } },
      }),
      prisma.trading_deals.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: { in: ['Cancelled', 'cancelled'] } } },
      }),
      prisma.products.findMany({ select: { code: true, id: true, metal_group: true, name: true } }),
    ])

    const productById = new Map(products.map((product) => [product.id, { ...product, code: requireBusinessCode(product.code, `สินค้า ${product.id}`) }]))
    const productByCode = new Map(Array.from(productById.values()).map((product) => [product.code, product]))
    const salesBillIdsByPoSellId = new Map<bigint, Set<bigint>>()
    salesBills.forEach((bill) => {
      if (!bill.po_sell_id) return
      const current = salesBillIdsByPoSellId.get(bill.po_sell_id) ?? new Set<bigint>()
      current.add(bill.id)
      salesBillIdsByPoSellId.set(bill.po_sell_id, current)
    })

    const matchedQtyByPoSellId = new Map<bigint, number>()
    poSells.forEach((po) => {
      const billIds = salesBillIdsByPoSellId.get(po.id) ?? new Set<bigint>()
      let matchedQty = 0
      tradingDeals.forEach((deal) => {
        if (deal.sales_bill_id && billIds.has(deal.sales_bill_id) && !isCancelled(deal.status)) matchedQty += toNumber(deal.matched_qty)
      })
      matchedQtyByPoSellId.set(po.id, matchedQty)
    })

    const salesRows: SaleRow[] = poSells.flatMap((po) => {
      const fallbackProduct = po.product_id ? productById.get(po.product_id) ?? null : null
      const items = itemRows(po, fallbackProduct, productById)
      const matchedQty = matchedQtyByPoSellId.get(po.id) ?? 0
      return items.map((item) => {
        const qty = item.qty || jsonNumber(po.qty)
        const itemRemainingQty = item.remainingQty || jsonNumber(po.remaining_qty ?? po.qty)
        const remainingQty = Math.max(0, itemRemainingQty - matchedQty)
        const unitPrice = item.unitPrice || (qty > 0 ? (item.totalAmount || toNumber(po.total_amount)) / qty : 0)
        return {
          customerName: po.customers?.name ?? '-',
          date: toDateOnly(po.date),
          docNo: po.doc_no,
          id: `${stringifyBusinessValue(po.id)}-${item.lineId}`,
          matchedQty,
          productId: item.productId,
          productName: item.productName || fallbackProduct?.name || '-',
          qty,
          remainingQty,
          unitPrice,
        }
      })
    }).filter((row) => row.productId && row.remainingQty > 0)

    const poolRows = costPool.rows.filter((row) => row.productId && row.availableQty > 0)
    const productIds = new Set([...salesRows.map((row) => row.productId), ...poolRows.map((row) => row.productId)])
    const productOptions = Array.from(productIds).map((id) => {
      const product = productByCode.get(id)
      const poolForProduct = poolRows.filter((row) => row.productId === id)
      const salesForProduct = salesRows.filter((row) => row.productId === id)
      return {
        code: product?.code ?? id,
        id,
        metalGroup: product?.metal_group ?? '',
        name: product?.name ?? poolRows.find((row) => row.productId === id)?.productName ?? salesRows.find((row) => row.productId === id)?.productName ?? '-',
        poolCount: poolForProduct.length,
        poolQty: poolForProduct.reduce((sum, row) => sum + row.availableQty, 0),
        poSellCount: salesForProduct.length,
      }
    }).sort((left, right) => `${left.code} ${left.name}`.localeCompare(`${right.code} ${right.name}`))

    const filteredPool = productId ? poolRows.filter((row) => row.productId === productId) : []
    const filteredSales = productId ? salesRows.filter((row) => row.productId === productId) : []
    const selectedSale = poSellId ? filteredSales.find((row) => row.id === poSellId) ?? null : null
    const selectedPool = sortPool(filteredPool, mode)

    let need = selectedSale?.remainingQty ?? 0
    const candidates = selectedPool.flatMap((row) => {
      if (!selectedSale || need <= 0) return []
      const qtyToUse = Math.min(row.availableQty, need)
      need -= qtyToUse
      return [{
        ...row,
        qtyToUse,
        totalCostUse: qtyToUse * row.unitCost,
      }]
    })

    const totalToMatch = candidates.reduce((sum, row) => sum + row.qtyToUse, 0)
    const totalCostMatch = candidates.reduce((sum, row) => sum + row.totalCostUse, 0)
    const expectedRevenue = selectedSale ? totalToMatch * selectedSale.unitPrice : 0
    const expectedMargin = expectedRevenue - totalCostMatch
    const poolQty = filteredPool.reduce((sum, row) => sum + row.availableQty, 0)
    const poolValue = filteredPool.reduce((sum, row) => sum + row.availableValue, 0)

    return NextResponse.json({
      candidates,
      filters: {
        modes: ['FIFO', 'LIFO', 'Cheap', 'Expensive'],
        products: productOptions,
        sourceTypes: ['po-sell', 'spot-sell'],
      },
      pool: filteredPool,
      poSells: filteredSales,
      selectedPoSell: selectedSale,
      summary: {
        expectedMargin,
        expectedRevenue,
        poolAvgCost: poolQty > 0 ? poolValue / poolQty : 0,
        poolCount: filteredPool.length,
        poolQty,
        poolValue,
        remainingAfterPreview: Math.max(0, need),
        totalCostMatch,
        totalToMatch,
      },
      writeDeferred: true,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cost Allocator ไม่ได้', 500)
  }
}
