import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { toNumber } from '@/lib/server/daily'

type DbClient = Prisma.TransactionClient

export const WEIGHT_TICKET_USAGE_ACTION = {
  ALLOCATED_TO_PURCHASE_BILL: 'allocated_to_purchase_bill',
  RELEASED_FROM_PURCHASE_BILL: 'released_from_purchase_bill',
} as const

export type WeightTicketUsageAction = typeof WEIGHT_TICKET_USAGE_ACTION[keyof typeof WEIGHT_TICKET_USAGE_ACTION]

export type WeightTicketUsageLogEntry = {
  action: WeightTicketUsageAction
  actor?: string | null
  allocatedDeductWeight: number
  allocatedGrossWeight: number
  allocatedNetWeight: number
  allocatedQty: number
  createdAt?: Date
  meta?: Prisma.InputJsonValue
  note?: string | null
  productCodeSnapshot?: string | null
  productId?: bigint | null
  productNameSnapshot?: string | null
  purchaseBillId?: bigint | null
  purchaseBillItemId?: bigint | null
  targetDocNo?: string | null
  targetId?: bigint | null
  targetLineNo?: number | null
  targetType: 'PURCHASE_BILL' | 'SALES_BILL'
  weightTicketId: bigint
  weightTicketProductSummaryId: bigint
}

const EPSILON = 0.0001

function isReleaseAction(action: WeightTicketUsageAction) {
  return action === WEIGHT_TICKET_USAGE_ACTION.RELEASED_FROM_PURCHASE_BILL
}

export async function appendWeightTicketUsageLogs(
  tx: DbClient,
  entries: WeightTicketUsageLogEntry[],
) {
  const materialEntries = entries.filter((entry) => Math.abs(entry.allocatedNetWeight) > EPSILON || Math.abs(entry.allocatedQty) > EPSILON)
  if (materialEntries.length === 0) return

  const summaryIds = [...new Set(materialEntries.map((entry) => entry.weightTicketProductSummaryId))]
  const summaries = await tx.weight_ticket_product_summaries.findMany({
    include: {
      products: { select: { code: true, id: true, name: true } },
      weight_tickets: { select: { doc_no: true, doc_type: true, id: true } },
    },
    where: { id: { in: summaryIds } },
  })
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]))
  const runningRemainingBySummaryId = new Map(summaries.map((summary) => [summary.id, toNumber(summary.remaining_weight)] as const))

  const rows = materialEntries.map((entry) => {
    const summary = summaryById.get(entry.weightTicketProductSummaryId)
    if (!summary) {
      throw new Error(`ไม่พบ WTI product summary สำหรับบันทึกประวัติการใช้งาน: ${String(entry.weightTicketProductSummaryId)}`)
    }

    const fromRemainingWeight = runningRemainingBySummaryId.get(entry.weightTicketProductSummaryId) ?? 0
    const toRemainingWeight = isReleaseAction(entry.action)
      ? fromRemainingWeight + entry.allocatedNetWeight
      : Math.max(0, fromRemainingWeight - entry.allocatedNetWeight)
    runningRemainingBySummaryId.set(entry.weightTicketProductSummaryId, toRemainingWeight)

    return {
      action: entry.action,
      allocated_deduct_weight: entry.allocatedDeductWeight,
      allocated_gross_weight: entry.allocatedGrossWeight,
      allocated_net_weight: entry.allocatedNetWeight,
      allocated_qty: entry.allocatedQty,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      doc_type: summary.weight_tickets.doc_type,
      event_key: `WTUSE-${summary.weight_tickets.doc_no}-${randomUUID()}`,
      from_remaining_weight: fromRemainingWeight,
      meta: entry.meta,
      note: entry.note ?? null,
      product_code_snapshot: entry.productCodeSnapshot ?? summary.products.code,
      product_id: entry.productId ?? summary.product_id,
      product_name_snapshot: entry.productNameSnapshot ?? summary.product_name ?? summary.products.name,
      purchase_bill_id: entry.purchaseBillId ?? null,
      purchase_bill_item_id: entry.purchaseBillItemId ?? null,
      target_doc_no: entry.targetDocNo ?? null,
      target_id: entry.targetId ?? entry.purchaseBillId ?? null,
      target_line_no: entry.targetLineNo ?? null,
      target_type: entry.targetType,
      to_remaining_weight: toRemainingWeight,
      weight_ticket_doc_no: summary.weight_tickets.doc_no,
      weight_ticket_id: entry.weightTicketId,
      weight_ticket_product_summary_id: entry.weightTicketProductSummaryId,
    }
  })

  await tx.weight_ticket_usage_logs.createMany({ data: rows })
}
