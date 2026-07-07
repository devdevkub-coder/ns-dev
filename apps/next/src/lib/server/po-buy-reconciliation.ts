import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId, stringifyBusinessValue } from '@/lib/business-code'
import { toNumber } from '@/lib/server/daily'
import { syncPoBuyCostPoolEntries } from '@/lib/server/po-buy-cost-pool'

export const PO_BUY_STATUS = {
  CANCELLED: 'Cancelled',
  OPEN: 'Open',
  PARTIAL: 'Partially Received',
  RECEIVED: 'Received',
  SHORT_CLOSED: 'Short Closed',
} as const

export const PO_BUY_STATUS_ACTION = {
  CANCELLED: 'cancelled',
  CREATED: 'created',
  EDITED: 'edited',
  RECEIVED_FULL: 'received_full',
  RECEIVED_PARTIAL: 'received_partial',
  SHORT_CLOSED: 'short_closed',
  STATUS_SYNCED: 'status_synced',
} as const

export const PO_BUY_ALLOCATION_ACTION = {
  ALLOCATED_TO_PURCHASE_BILL: 'allocated_to_purchase_bill',
  RELEASED_FROM_PURCHASE_BILL: 'released_from_purchase_bill',
} as const

type DbClient = Prisma.TransactionClient

type PoBuyRow = Awaited<ReturnType<DbClient['po_buys']['findMany']>>[number]

type DraftPoItem = {
  productId: string
  productIdKey: string
  productName: string
  qty: number
  raw: Record<string, unknown>
  unitPrice: number
}

const EPSILON = 0.0001

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function calculateVatAmount(subtotal: number, hasVat: boolean, vatRatePercent: number) {
  if (!hasVat) return 0
  return roundMoney(subtotal * vatRatePercent / 100)
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function canonicalItemProductIdKey(item: Record<string, unknown>, row: PoBuyRow) {
  const rawInternalId = item.productIdInternal
  const parsed = parseInternalBigIntId(
    typeof rawInternalId === 'number'
      ? BigInt(rawInternalId)
      : typeof rawInternalId === 'string' || typeof rawInternalId === 'bigint'
        ? rawInternalId
        : null,
  )
  if (!parsed) {
    throw new Error(`PO Buy ${row.doc_no} มีรายการสินค้าที่ไม่มี productIdInternal สำหรับ reconcile`)
  }
  return stringifyBusinessValue(parsed)
}

function normalizePoItems(row: PoBuyRow) {
  if (Array.isArray(row.items) && row.items.length > 0) {
    const jsonItems = (row.items as unknown[]).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    return jsonItems.map((item) => ({
        productId: stringifyBusinessValue(
          typeof item.productCode === 'string'
            ? item.productCode
            : typeof item.productId === 'string' && !/^\d+$/.test(item.productId)
              ? item.productId
              : null,
        ),
        productIdKey: canonicalItemProductIdKey(item, row),
        productName: stringifyBusinessValue(
          typeof item.productName === 'string' ? item.productName : typeof item.productCode === 'string' ? item.productCode : null,
        ),
        qty: jsonNumber(item.qty),
        raw: item,
        unitPrice: jsonNumber(item.unitPrice ?? row.unit_price),
      }))
  }

  return [{
    productId: '',
    productIdKey: stringifyBusinessValue(row.product_id),
    productName: '-',
    qty: jsonNumber(row.qty),
    raw: {
      productId: '',
      productName: '-',
      qty: jsonNumber(row.qty),
      unitPrice: jsonNumber(row.unit_price),
    },
    unitPrice: jsonNumber(row.unit_price),
  }]
}

function remainingItemsAfterAllocation(items: DraftPoItem[], allocatedQtyByProduct: Map<string, number>, forceZeroRemaining: boolean) {
  const allocationLeft = new Map(allocatedQtyByProduct)
  return items.map((item) => {
    const allocatedForProduct = Math.max(0, allocationLeft.get(item.productIdKey) ?? 0)
    const consumedOnThisLine = forceZeroRemaining ? item.qty : Math.min(item.qty, allocatedForProduct)
    const remainingQty = forceZeroRemaining ? 0 : Math.max(0, item.qty - consumedOnThisLine)
    allocationLeft.set(item.productIdKey, Math.max(0, allocatedForProduct - consumedOnThisLine))

    return {
      ...item.raw,
      productId: item.productId,
      productIdInternal: item.productIdKey,
      productName: item.productName,
      qty: item.qty,
      remainingQty,
      totalCost: item.qty * item.unitPrice,
      unitPrice: item.unitPrice,
    }
  })
}

function nextPoStatus(params: {
  cancelledAt: Date | null
  hasShortClose: boolean
  remainingQty: number
  totalQty: number
}) {
  if (params.cancelledAt) return PO_BUY_STATUS.CANCELLED
  if (params.hasShortClose) return PO_BUY_STATUS.SHORT_CLOSED
  if (params.remainingQty <= EPSILON) return PO_BUY_STATUS.RECEIVED
  if (params.remainingQty >= Math.max(0, params.totalQty - EPSILON)) return PO_BUY_STATUS.OPEN
  return PO_BUY_STATUS.PARTIAL
}

async function insertStatusLogs(
  tx: DbClient,
  entries: Array<{
    action: string
    createdBy?: string | null
    createdAt?: Date
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    note?: string | null
    poBuyDocNo: string
    poBuyId: bigint
    toStatus: string
  }>,
) {
  if (entries.length === 0) return
  const poBuyIds = [...new Set(entries.map((entry) => entry.poBuyId))]
  const existingCounts = await Promise.all(
    poBuyIds.map(async (poBuyId) => [
      poBuyId,
      await tx.po_buy_status_logs.count({ where: { po_buy_id: poBuyId } }),
    ] as const),
  )
  const nextSequenceByPoId = new Map(existingCounts)

  for (const entry of entries) {
    const nextSequence = (nextSequenceByPoId.get(entry.poBuyId) ?? 0) + 1
    nextSequenceByPoId.set(entry.poBuyId, nextSequence)

    await tx.po_buy_status_logs.create({
      data: {
        action: entry.action,
        created_at: entry.createdAt ?? new Date(),
        created_by: entry.createdBy ?? null,
        event_key: `POBLOG-${entry.poBuyDocNo}-${String(nextSequence).padStart(4, '0')}`,
        from_status: entry.fromStatus ?? null,
        ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
        note: entry.note ?? null,
        po_buy_doc_no: entry.poBuyDocNo,
        po_buy_id: entry.poBuyId,
        to_status: entry.toStatus,
      },
    })
  }
}

function inferStatusAction(params: { fromStatus?: string | null; reason?: string | null; toStatus: string }) {
  if (params.reason === 'create') return PO_BUY_STATUS_ACTION.CREATED
  if (params.reason === 'edit') return PO_BUY_STATUS_ACTION.EDITED
  if (params.reason === 'cancel_action') return PO_BUY_STATUS_ACTION.CANCELLED
  if (params.reason === 'short_close_action') return PO_BUY_STATUS_ACTION.SHORT_CLOSED
  if (params.toStatus === PO_BUY_STATUS.PARTIAL) return PO_BUY_STATUS_ACTION.RECEIVED_PARTIAL
  if (params.toStatus === PO_BUY_STATUS.RECEIVED) return PO_BUY_STATUS_ACTION.RECEIVED_FULL
  if (params.toStatus === PO_BUY_STATUS.CANCELLED) return PO_BUY_STATUS_ACTION.CANCELLED
  if (params.toStatus === PO_BUY_STATUS.SHORT_CLOSED) return PO_BUY_STATUS_ACTION.SHORT_CLOSED
  if (!params.fromStatus || params.fromStatus === params.toStatus) return PO_BUY_STATUS_ACTION.STATUS_SYNCED
  return PO_BUY_STATUS_ACTION.STATUS_SYNCED
}

export async function appendPoBuyStatusLog(
  tx: DbClient,
  params: {
    actor?: string | null
    createdAt?: Date
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    note?: string | null
    poBuyDocNo: string
    poBuyId: bigint
    reason?: string | null
    toStatus: string
  },
) {
  await insertStatusLogs(tx, [{
    action: inferStatusAction({ fromStatus: params.fromStatus, reason: params.reason ?? null, toStatus: params.toStatus }),
    createdAt: params.createdAt,
    createdBy: params.actor ?? null,
    fromStatus: params.fromStatus ?? null,
    meta: params.meta,
    note: params.note ?? null,
    poBuyDocNo: params.poBuyDocNo,
    poBuyId: params.poBuyId,
    toStatus: params.toStatus,
  }])
}

export async function createInitialPoBuyStatusLog(tx: DbClient, params: { actor?: string | null; poBuyDocNo: string; poBuyId: bigint }) {
  await insertStatusLogs(tx, [{
    action: PO_BUY_STATUS_ACTION.CREATED,
    createdBy: params.actor ?? null,
    fromStatus: null,
    meta: { reason: 'create' },
    poBuyDocNo: params.poBuyDocNo,
    poBuyId: params.poBuyId,
    toStatus: PO_BUY_STATUS.OPEN,
  }])
}

export async function appendPoBuyAllocationLogs(
  tx: DbClient,
  entries: Array<{
    action: typeof PO_BUY_ALLOCATION_ACTION[keyof typeof PO_BUY_ALLOCATION_ACTION]
    actor?: string | null
    allocatedAmount: number
    allocatedQty: number
    createdAt?: Date
    meta?: Prisma.InputJsonValue
    note?: string | null
    poBuyId: bigint
    productCodeSnapshot?: string | null
    productId?: bigint | null
    productNameSnapshot?: string | null
    purchaseBillDocNo?: string | null
    purchaseBillId?: bigint | null
    purchaseBillItemId?: bigint | null
    purchaseBillLineNo?: number | null
    unitPriceSnapshot?: number | null
  }>,
) {
  const materialEntries = entries.filter((entry) => Math.abs(entry.allocatedQty) > EPSILON || Math.abs(entry.allocatedAmount) > EPSILON)
  if (materialEntries.length === 0) return

  const poBuyIds = [...new Set(materialEntries.map((entry) => entry.poBuyId))]
  const poRows = await tx.po_buys.findMany({
    select: { doc_no: true, id: true, remaining_qty: true },
    where: { id: { in: poBuyIds } },
  })
  const poById = new Map(poRows.map((po) => [po.id, po]))
  const runningRemainingQty = new Map(poRows.map((po) => [po.id, toNumber(po.remaining_qty)] as const))

  const rows = materialEntries.map((entry) => {
    const po = poById.get(entry.poBuyId)
    if (!po) throw new Error(`ไม่พบ PO Buy สำหรับบันทึกประวัติการจัดสรร: ${String(entry.poBuyId)}`)

    const fromRemainingQty = runningRemainingQty.get(entry.poBuyId) ?? 0
    const toRemainingQty = entry.action === PO_BUY_ALLOCATION_ACTION.RELEASED_FROM_PURCHASE_BILL
      ? fromRemainingQty + entry.allocatedQty
      : Math.max(0, fromRemainingQty - entry.allocatedQty)
    runningRemainingQty.set(entry.poBuyId, toRemainingQty)

    return {
      action: entry.action,
      allocated_amount: entry.allocatedAmount,
      allocated_qty: entry.allocatedQty,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      event_key: `POALLOC-${po.doc_no}-${randomUUID()}`,
      from_remaining_qty: fromRemainingQty,
      meta: entry.meta,
      note: entry.note ?? null,
      po_buy_doc_no: po.doc_no,
      po_buy_id: entry.poBuyId,
      product_code_snapshot: entry.productCodeSnapshot ?? null,
      product_id: entry.productId ?? null,
      product_name_snapshot: entry.productNameSnapshot ?? null,
      purchase_bill_doc_no: entry.purchaseBillDocNo ?? null,
      purchase_bill_id: entry.purchaseBillId ?? null,
      purchase_bill_item_id: entry.purchaseBillItemId ?? null,
      purchase_bill_line_no: entry.purchaseBillLineNo ?? null,
      to_remaining_qty: toRemainingQty,
      unit_price_snapshot: entry.unitPriceSnapshot ?? 0,
    }
  })

  await tx.po_buy_allocation_logs.createMany({ data: rows })
}

export async function reconcilePoBuys(
  tx: DbClient,
  poBuyIds: bigint[],
  options?: {
    actor?: string | null
    statusMetaByPoId?: Map<bigint, Prisma.InputJsonValue>
    statusNoteByPoId?: Map<bigint, string>
  },
) {
  const uniquePoIds = [...new Set(poBuyIds)]
  if (uniquePoIds.length === 0) return

  const [poRows, allocations] = await Promise.all([
    tx.po_buys.findMany({ where: { id: { in: uniquePoIds } } }),
    tx.purchase_bill_po_allocations.findMany({
      include: {
        purchase_bill_items: { select: { product_id: true } },
        purchase_bills: { select: { status: true } },
      },
      where: {
        allocation_status: 'active',
        po_buy_id: { in: uniquePoIds },
        purchase_bill_items: { item_status: 'active' },
      },
    }),
  ])

  const activeAllocations = allocations.filter((allocation) => !String(allocation.purchase_bills.status ?? '').toLowerCase().includes('cancel'))
  const allocationsByPo = new Map<bigint, { amount: number; qtyByProduct: Map<string, number> }>()
  activeAllocations.forEach((allocation) => {
    const current = allocationsByPo.get(allocation.po_buy_id) ?? { amount: 0, qtyByProduct: new Map<string, number>() }
    const productId = stringifyBusinessValue(allocation.purchase_bill_items.product_id)
    current.amount += toNumber(allocation.allocated_amount)
    current.qtyByProduct.set(productId, (current.qtyByProduct.get(productId) ?? 0) + toNumber(allocation.allocated_qty))
    allocationsByPo.set(allocation.po_buy_id, current)
  })

  const logEntries: Array<{
    action: string
    createdBy?: string | null
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    note?: string | null
    poBuyDocNo: string
    poBuyId: bigint
    toStatus: string
  }> = []

  for (const row of poRows) {
    if ((row.status ?? '') === PO_BUY_STATUS.CANCELLED) continue

    const normalizedItems = normalizePoItems(row)
    const totalQty = normalizedItems.reduce((sum, item) => sum + item.qty, 0)
    const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0))
    const hasVat = Boolean(row.has_vat)
    const vatRatePercent = toNumber(row.vat_rate_percent) || 7
    const vatAmount = calculateVatAmount(subtotal, hasVat, vatRatePercent)
    const totalAmount = roundMoney(subtotal + vatAmount)
    const allocated = allocationsByPo.get(row.id) ?? { amount: 0, qtyByProduct: new Map<string, number>() }
    const hasShortClose = Boolean(row.short_closed_at) && (toNumber(row.short_closed_qty) > EPSILON || toNumber(row.short_closed_amount) > EPSILON)
    const nextItems = remainingItemsAfterAllocation(normalizedItems, allocated.qtyByProduct, hasShortClose)
    const remainingQty = hasShortClose ? 0 : nextItems.reduce((sum: number, item) => sum + jsonNumber(item.remainingQty), 0)
    const remainingSubtotal = hasShortClose ? 0 : roundMoney(nextItems.reduce((sum: number, item) => sum + jsonNumber(item.remainingQty) * jsonNumber(item.unitPrice), 0))
    const remainingVatAmount = calculateVatAmount(remainingSubtotal, hasVat, vatRatePercent)
    const remainingAmount = hasShortClose ? 0 : roundMoney(remainingSubtotal + remainingVatAmount)
    const nextStatus = nextPoStatus({
      cancelledAt: row.cancelled_at ?? null,
      hasShortClose,
      remainingQty,
      totalQty,
    })
    const currentStatus = row.status ?? PO_BUY_STATUS.OPEN

    await tx.po_buys.update({
      data: {
        cut_amount: Math.max(0, totalAmount - remainingAmount),
        items: nextItems,
        qty: totalQty,
        remaining_amount: remainingAmount,
        remaining_qty: remainingQty,
        status: nextStatus,
        subtotal,
        total_amount: totalAmount,
        updated_at: new Date(),
        updated_by: options?.actor ?? row.updated_by ?? row.created_by ?? null,
        vat_amount: vatAmount,
        vat_rate_percent: vatRatePercent,
        vat_type: hasVat ? 'EXCLUDE' : 'NONE',
        version: { increment: 1 },
      },
      where: { id: row.id },
    })
    await syncPoBuyCostPoolEntries(tx, {
      actor: options?.actor ?? row.updated_by ?? row.created_by ?? 'system',
      poBuyId: row.id,
    })

    if (currentStatus !== nextStatus) {
      const meta = options?.statusMetaByPoId?.get(row.id)
      logEntries.push({
        action: inferStatusAction({
          fromStatus: currentStatus,
          reason: typeof meta === 'object' && meta !== null && 'reason' in meta ? String((meta as Record<string, unknown>).reason ?? '') : null,
          toStatus: nextStatus,
        }),
        createdBy: options?.actor ?? row.updated_by ?? row.created_by ?? null,
        fromStatus: currentStatus,
        meta: meta ?? {
          allocatedAmount: allocated.amount,
          hasShortClose,
          remainingAmount,
          remainingQty,
          subtotal,
          totalAmount,
          totalQty,
          vatAmount,
          vatRatePercent,
        },
        note: options?.statusNoteByPoId?.get(row.id) ?? (hasShortClose ? row.short_closed_note : null),
        poBuyDocNo: row.doc_no,
        poBuyId: row.id,
        toStatus: nextStatus,
      })
    }
  }

  await insertStatusLogs(tx, logEntries)
}
