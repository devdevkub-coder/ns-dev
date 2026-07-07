import type { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId } from '@/lib/business-code'
import { toNumber } from '@/lib/server/daily'

const COST_EPSILON = 0.0001

function statusForPool(originalQty: number, allocatedQty: number, releasedQty: number) {
  if (releasedQty >= originalQty - COST_EPSILON) return 'Released'
  if (allocatedQty >= originalQty - releasedQty - COST_EPSILON) return 'Fully Used'
  if (allocatedQty > COST_EPSILON) return 'Partially Used'
  return 'Available'
}

function isEligibleMetalGroup(metalGroup: string | null | undefined) {
  const normalized = (metalGroup ?? '').trim().toLowerCase()
  return normalized.includes('ทองแดง') || normalized.includes('ทองเหลือง') || normalized.includes('copper') || normalized.includes('brass')
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function readItems(items: unknown) {
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : []
}

export async function syncPoBuyCostPoolEntries(
  tx: Prisma.TransactionClient,
  params: {
    actor: string
    poBuyId: bigint
  },
) {
  const po = await tx.po_buys.findUnique({
    where: { id: params.poBuyId },
    select: {
      branch_id: true,
      cancelled_at: true,
      date: true,
      doc_no: true,
      id: true,
      items: true,
      note: true,
      notes: true,
      product_id: true,
      qty: true,
      remaining_qty: true,
      short_closed_at: true,
      status: true,
      unit_price: true,
      updated_by: true,
      warehouse_id: true,
    },
  })
  if (!po) throw new Error('ไม่พบ PO Buy สำหรับ sync cost pool')

  const existingEntries = await tx.stock_cost_pool_entries.findMany({
    orderBy: { id: 'asc' },
    where: {
      source_ref_id: po.id.toString(),
      source_ref_type: 'POB',
    },
  })

  const rawItems = readItems(po.items)
  const productIdsFromItems = rawItems
    .map((item) => parseInternalBigIntId(
      typeof item.productIdInternal === 'number'
        ? BigInt(item.productIdInternal)
        : typeof item.productIdInternal === 'string' || typeof item.productIdInternal === 'bigint'
          ? item.productIdInternal
          : null,
    ))
    .filter((value): value is bigint => value != null)
  const productIds = [...new Set([...(po.product_id ? [po.product_id] : []), ...productIdsFromItems])]
  const products = productIds.length > 0
    ? await tx.products.findMany({
      select: { id: true, metal_group: true },
      where: { id: { in: productIds } },
    })
    : []
  const productById = new Map(products.map((product) => [product.id, product] as const))

  const nextLines = new Map<string, {
    originalQty: number
    originalValue: number
    productId: bigint
    sourceLineId: string
    unitCost: number
  }>()

  const shouldKeepActive = !String(po.status ?? '').toLowerCase().includes('cancel')
  if (shouldKeepActive && rawItems.length > 0) {
    rawItems.forEach((item, index) => {
      const productId = parseInternalBigIntId(
        typeof item.productIdInternal === 'number'
          ? BigInt(item.productIdInternal)
          : typeof item.productIdInternal === 'string' || typeof item.productIdInternal === 'bigint'
            ? item.productIdInternal
            : null,
      )
      if (!productId) return
      const product = productById.get(productId)
      if (!isEligibleMetalGroup(product?.metal_group)) return
      const originalQty = jsonNumber(item.remainingQty ?? item.qty)
      const unitCost = jsonNumber(item.unitPrice ?? po.unit_price)
      if (originalQty <= COST_EPSILON || unitCost <= 0) return
      const sourceLineId = typeof item.productId === 'string' && item.productId.trim()
        ? `${item.productId.trim()}-${index}`
        : `line-${index + 1}`
      nextLines.set(sourceLineId, {
        originalQty,
        originalValue: originalQty * unitCost,
        productId,
        sourceLineId,
        unitCost,
      })
    })
  } else if (shouldKeepActive && po.product_id) {
    const product = productById.get(po.product_id)
    if (isEligibleMetalGroup(product?.metal_group)) {
      const originalQty = toNumber(po.remaining_qty ?? po.qty)
      const unitCost = toNumber(po.unit_price)
      if (originalQty > COST_EPSILON && unitCost > 0) {
        nextLines.set('header', {
          originalQty,
          originalValue: originalQty * unitCost,
          productId: po.product_id,
          sourceLineId: 'header',
          unitCost,
        })
      }
    }
  }

  for (const entry of existingEntries) {
    const nextLine = nextLines.get(entry.source_line_id ?? '')
    const allocatedQty = toNumber(entry.allocated_qty)
    const releasedQty = toNumber(entry.released_qty)
    const hasUsage = allocatedQty > COST_EPSILON || releasedQty > COST_EPSILON

    if (!nextLine) {
      if (hasUsage) {
        throw new Error(`ไม่สามารถลบ Cost Pool ของ PO Buy ${po.doc_no} แถว ${entry.source_line_id ?? '-'} ได้ เพราะถูกใช้งานแล้ว`)
      }
      if (entry.status !== 'Reversed') {
        await tx.stock_cost_pool_entries.update({
          data: {
            status: 'Reversed',
            updated_at: new Date(),
            updated_by: params.actor,
          },
          where: { id: entry.id },
        })
      }
      continue
    }

    const materiallyChanged = (
      entry.product_id !== nextLine.productId
      || Math.abs(toNumber(entry.original_qty) - nextLine.originalQty) > COST_EPSILON
      || Math.abs(toNumber(entry.unit_cost) - nextLine.unitCost) > COST_EPSILON
      || Math.abs(toNumber(entry.original_value) - nextLine.originalValue) > 0.01
      || entry.source_type !== 'Purchase'
      || (entry.source_ref_no ?? '') !== po.doc_no
      || entry.branch_id !== po.branch_id
      || entry.warehouse_id !== po.warehouse_id
    )
    if (hasUsage && materiallyChanged) {
      throw new Error(`ไม่สามารถแก้ Cost Pool ของ PO Buy ${po.doc_no} แถว ${entry.source_line_id ?? '-'} ได้ เพราะถูกใช้งานแล้ว`)
    }

    await tx.stock_cost_pool_entries.update({
      data: {
        branch_id: po.branch_id,
        date: po.date,
        notes: po.note ?? po.notes ?? null,
        original_qty: nextLine.originalQty,
        original_value: nextLine.originalValue,
        product_id: nextLine.productId,
        source_ref_no: po.doc_no,
        source_type: 'Purchase',
        status: statusForPool(nextLine.originalQty, allocatedQty, releasedQty),
        unit_cost: nextLine.unitCost,
        updated_at: new Date(),
        updated_by: params.actor,
        warehouse_id: po.warehouse_id,
      },
      where: { id: entry.id },
    })
    nextLines.delete(entry.source_line_id ?? '')
  }

  for (const nextLine of nextLines.values()) {
    await tx.stock_cost_pool_entries.create({
      data: {
        branch_id: po.branch_id,
        created_by: params.actor,
        date: po.date,
        notes: po.note ?? po.notes ?? null,
        original_qty: nextLine.originalQty,
        original_value: nextLine.originalValue,
        product_id: nextLine.productId,
        source_line_id: nextLine.sourceLineId,
        source_ref_id: po.id.toString(),
        source_ref_no: po.doc_no,
        source_ref_type: 'POB',
        source_type: 'Purchase',
        status: 'Available',
        unit_cost: nextLine.unitCost,
        warehouse_id: po.warehouse_id,
      },
    })
  }
}
