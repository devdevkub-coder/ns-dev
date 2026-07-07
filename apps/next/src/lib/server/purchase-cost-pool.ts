import { Prisma } from '../../../generated/prisma/client'
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

type SyncPurchaseBillCostPoolParams = {
  actor: string
  billId: bigint
  branchId: bigint | null
  date: Date
  notes?: string | null
  transactionMode: string | null | undefined
  warehouseId: bigint | null
}

export async function syncPurchaseBillCostPoolEntries(
  tx: Prisma.TransactionClient,
  params: SyncPurchaseBillCostPoolParams,
) {
  const bill = await tx.purchase_bills.findUnique({
    where: { id: params.billId },
    select: {
      doc_no: true,
      status: true,
    },
  })
  if (!bill) throw new Error('ไม่พบบิลรับซื้อสำหรับ sync cost pool')

  const existingEntries = await tx.stock_cost_pool_entries.findMany({
    orderBy: { id: 'asc' },
    where: {
      source_ref_id: params.billId.toString(),
      source_ref_type: 'PB',
    },
  })
  type ExistingEntry = typeof existingEntries[number]

  const shouldKeepActive = params.transactionMode === 'STOCK' && !String(bill.status ?? '').toLowerCase().includes('cancel')
  const activeItems = shouldKeepActive
    ? await tx.purchase_bill_items.findMany({
      orderBy: { line_no: 'asc' },
      select: {
        amount: true,
        line_no: true,
        lot_no: true,
        price: true,
        product_id: true,
        qty: true,
        source_snapshot: true,
      },
      where: {
        item_status: 'active',
        purchase_bill_id: params.billId,
      },
    })
    : []
  type ActiveItem = typeof activeItems[number]

  const productIds = [...new Set(activeItems.map((item: ActiveItem) => item.product_id).filter((value: bigint | null): value is bigint => value != null))]
  const products = productIds.length > 0
    ? await tx.products.findMany({
      select: { id: true, metal_group: true },
      where: { id: { in: productIds } },
    })
    : []
  type ProductRow = typeof products[number]
  const productById = new Map(products.map((product: ProductRow) => [product.id, product] as const))

  const nextLines = new Map<string, {
    lineNo: number
    lotNo: string | null
    originalQty: number
    originalValue: number
    productId: bigint
    unitCost: number
  }>()

  for (const item of activeItems) {
    if (!item.product_id || item.line_no == null) continue
    const product = productById.get(item.product_id)
    if (!isEligibleMetalGroup(product?.metal_group)) continue

    const lineNo = item.line_no
    const originalQty = toNumber(item.qty)
    const originalValue = toNumber(item.amount)
    const unitCost = originalQty > COST_EPSILON ? (originalValue > 0 ? originalValue / originalQty : toNumber(item.price)) : 0
    if (originalQty <= COST_EPSILON || unitCost <= 0) continue

    nextLines.set(String(lineNo), {
      lineNo,
      lotNo: item.lot_no ?? null,
      originalQty,
      originalValue: originalValue > 0 ? originalValue : originalQty * unitCost,
      productId: item.product_id,
      unitCost,
    })
  }

  for (const entry of existingEntries as ExistingEntry[]) {
    const lineKey = entry.source_line_id ?? ''
    const nextLine = nextLines.get(lineKey)
    const allocatedQty = toNumber(entry.allocated_qty)
    const releasedQty = toNumber(entry.released_qty)
    const hasUsage = allocatedQty > COST_EPSILON || releasedQty > COST_EPSILON

    if (!nextLine) {
      if (hasUsage) {
        throw new Error(`ไม่สามารถลบหรือยกเลิก Cost Pool ของ ${bill.doc_no} แถว ${lineKey || '-'} ได้ เพราะถูกใช้งานแล้ว`)
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
      || (entry.lot_no ?? null) !== nextLine.lotNo
      || Math.abs(toNumber(entry.original_qty) - nextLine.originalQty) > COST_EPSILON
      || Math.abs(toNumber(entry.unit_cost) - nextLine.unitCost) > COST_EPSILON
      || Math.abs(toNumber(entry.original_value) - nextLine.originalValue) > 0.01
      || entry.source_type !== 'Purchase'
      || (entry.source_ref_no ?? '') !== bill.doc_no
      || entry.branch_id !== params.branchId
      || entry.warehouse_id !== params.warehouseId
    )
    if (hasUsage && materiallyChanged) {
      throw new Error(`ไม่สามารถแก้ Cost Pool ของ ${bill.doc_no} แถว ${lineKey || '-'} ได้ เพราะถูกใช้งานแล้ว`)
    }

    await tx.stock_cost_pool_entries.update({
      data: {
        branch_id: params.branchId,
        date: params.date,
        lot_no: nextLine.lotNo,
        notes: params.notes ?? null,
        original_qty: nextLine.originalQty,
        original_value: nextLine.originalValue,
        product_id: nextLine.productId,
        source_ref_no: bill.doc_no,
        source_type: 'Purchase',
        status: statusForPool(nextLine.originalQty, allocatedQty, releasedQty),
        unit_cost: nextLine.unitCost,
        updated_at: new Date(),
        updated_by: params.actor,
        warehouse_id: params.warehouseId,
      },
      where: { id: entry.id },
    })
    nextLines.delete(lineKey)
  }

  for (const nextLine of nextLines.values()) {
    await tx.stock_cost_pool_entries.create({
      data: {
        branch_id: params.branchId,
        created_by: params.actor,
        date: params.date,
        lot_no: nextLine.lotNo,
        notes: params.notes ?? null,
        original_qty: nextLine.originalQty,
        original_value: nextLine.originalValue,
        product_id: nextLine.productId,
        source_line_id: String(nextLine.lineNo),
        source_ref_id: params.billId.toString(),
        source_ref_no: bill.doc_no,
        source_ref_type: 'PB',
        source_type: 'Purchase',
        status: 'Available',
        unit_cost: nextLine.unitCost,
        warehouse_id: params.warehouseId,
      },
    })
  }
}
