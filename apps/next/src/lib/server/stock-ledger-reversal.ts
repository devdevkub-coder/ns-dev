import { toNumber } from '@/lib/server/daily'
import type { Prisma } from '../../../generated/prisma/client'

const PB_STOCK_REF_TYPES = ['PB', 'PB-CANCEL', 'PB-EDIT-REV'] as const

type PurchaseBillStockReversalType = 'PB-CANCEL' | 'PB-EDIT-REV'

type StockLedgerTx = Pick<Prisma.TransactionClient, 'stock_ledger'>

type PurchaseBillStockReversalInput = {
  actor: string
  billDocNo: string
  date: Date
  movementType: string
  note?: string | null
  notes?: string | null
  reason: string
  reversalRefType: PurchaseBillStockReversalType
}

type PurchaseBillLedgerGroup = {
  branchId: bigint
  lotNo: string | null
  notAvailableForSale: boolean | null
  outputCategory: string | null
  productId: bigint
  purchaseChannelId: bigint | null
  qty: number
  salesChannelId: bigint | null
  sourceInputId: string | null
  sourceInputProductId: bigint | null
  value: number
  warehouseId: bigint
}

function groupKey(row: {
  branch_id: bigint | null
  lot_no: string | null
  not_available_for_sale: boolean | null
  output_category: string | null
  product_id: bigint | null
  purchase_channel_id: bigint | null
  sales_channel_id: bigint | null
  source_input_id: string | null
  source_input_product_id: bigint | null
  warehouse_id: bigint | null
}) {
  return [
    row.branch_id?.toString() ?? '',
    row.warehouse_id?.toString() ?? '',
    row.product_id?.toString() ?? '',
    row.lot_no ?? '',
    row.output_category ?? '',
    row.not_available_for_sale === null ? '' : String(row.not_available_for_sale),
    row.sales_channel_id?.toString() ?? '',
    row.purchase_channel_id?.toString() ?? '',
    row.source_input_id ?? '',
    row.source_input_product_id?.toString() ?? '',
  ].join('\u001f')
}

export async function appendPurchaseBillStockReversal(
  tx: StockLedgerTx,
  input: PurchaseBillStockReversalInput,
) {
  const docNo = input.billDocNo.trim()
  if (!docNo) throw new Error('ไม่พบเลขที่ PB สำหรับ reverse stock ledger')

  if (input.reversalRefType === 'PB-CANCEL') {
    const existingCancelReversal = await tx.stock_ledger.count({
      where: {
        OR: [{ ref_id: docNo }, { ref_no: docNo }],
        ref_type: 'PB-CANCEL',
      },
    })
    if (existingCancelReversal > 0) {
      throw new Error(`PB ${docNo} มี stock ledger reversal สำหรับการยกเลิกแล้ว`)
    }
  }

  const rows = await tx.stock_ledger.findMany({
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    where: {
      OR: [{ ref_id: docNo }, { ref_no: docNo }],
      ref_type: { in: [...PB_STOCK_REF_TYPES] },
    },
  })
  if (rows.length === 0) throw new Error(`ไม่พบ stock ledger ของ PB ${docNo}`)

  const groups = new Map<string, PurchaseBillLedgerGroup>()
  for (const row of rows) {
    if (row.branch_id == null || row.warehouse_id == null || row.product_id == null) {
      throw new Error(`stock ledger ของ PB ${docNo} มี dimension ไม่ครบ`)
    }

    const key = groupKey(row)
    const current = groups.get(key) ?? {
      branchId: row.branch_id,
      lotNo: row.lot_no,
      notAvailableForSale: row.not_available_for_sale ?? null,
      outputCategory: row.output_category ?? null,
      productId: row.product_id,
      purchaseChannelId: row.purchase_channel_id ?? null,
      qty: 0,
      salesChannelId: row.sales_channel_id ?? null,
      sourceInputId: row.source_input_id ?? null,
      sourceInputProductId: row.source_input_product_id ?? null,
      value: 0,
      warehouseId: row.warehouse_id,
    }
    current.qty += toNumber(row.qty_in) - toNumber(row.qty_out)
    current.value += toNumber(row.value_in) - toNumber(row.value_out)
    groups.set(key, current)
  }

  const reversalGroups = [...groups.values()].filter((group) => Math.abs(group.qty) > 0.000001 || Math.abs(group.value) > 0.000001)
  const invalidGroups = reversalGroups.filter((group) => group.qty < -0.000001 || group.value < -0.000001)
  if (invalidGroups.length > 0) {
    throw new Error(`stock ledger ของ PB ${docNo} มี net movement ติดลบ ไม่สามารถ reverse ได้`)
  }
  const positiveGroups = reversalGroups.filter((group) => group.qty > 0.000001 || group.value > 0.000001)
  if (positiveGroups.length === 0) {
    throw new Error(`stock ledger ของ PB ${docNo} ไม่มียอดคงเหลือให้ reverse`)
  }

  await tx.stock_ledger.createMany({
    data: positiveGroups.map((group) => ({
      branch_id: group.branchId,
      created_by: input.actor,
      date: input.date,
      lot_no: group.lotNo,
      movement_type: input.movementType,
      note: input.note ?? null,
      notes: input.notes ?? input.reason,
      not_available_for_sale: group.notAvailableForSale,
      output_category: group.outputCategory,
      product_id: group.productId,
      purchase_channel_id: group.purchaseChannelId,
      qty_in: 0,
      qty_out: group.qty,
      ref_id: docNo,
      ref_no: docNo,
      ref_type: input.reversalRefType,
      sales_channel_id: group.salesChannelId,
      source_input_id: group.sourceInputId,
      source_input_product_id: group.sourceInputProductId,
      unit_cost: group.qty > 0.000001 ? group.value / group.qty : 0,
      value_in: 0,
      value_out: group.value,
      warehouse_id: group.warehouseId,
    })),
  })
}
