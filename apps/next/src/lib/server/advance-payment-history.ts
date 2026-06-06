import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { toNumber } from '@/lib/server/daily'

type SupplierAdvanceStatusLogTx = Pick<
  Prisma.TransactionClient,
  'supplier_advance_payments' | 'supplier_advance_status_logs'
>

type SupplierAdvanceAllocationLogTx = Pick<
  Prisma.TransactionClient,
  'supplier_advance_allocation_logs' | 'supplier_advance_payments'
>

const EPSILON = 0.01

export const SUPPLIER_ADVANCE_STATUS_ACTION = {
  ALLOCATED: 'allocated',
  ALLOCATION_RELEASED: 'allocation_released',
  APPROVAL_VOIDED: 'approval_voided',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
  CREATED: 'created',
  EDITED: 'edited',
  PAID: 'paid',
  PARTIALLY_ALLOCATED: 'partially_allocated',
  PAYMENT_REVERSED: 'payment_reversed',
  REFUND_REQUIRED: 'refund_required',
  REFUNDED: 'refunded',
  STATUS_SYNCED: 'status_synced',
} as const

export const SUPPLIER_ADVANCE_ALLOCATION_ACTION = {
  ALLOCATED_TO_PURCHASE_BILL: 'allocated_to_purchase_bill',
  RELEASED_FROM_PURCHASE_BILL: 'released_from_purchase_bill',
} as const

export function supplierAdvanceStatusActionForStatus(status: string) {
  if (status === 'approved') return SUPPLIER_ADVANCE_STATUS_ACTION.APPROVED
  if (status === 'paid') return SUPPLIER_ADVANCE_STATUS_ACTION.PAID
  if (status === 'partially_allocated') return SUPPLIER_ADVANCE_STATUS_ACTION.PARTIALLY_ALLOCATED
  if (status === 'allocated') return SUPPLIER_ADVANCE_STATUS_ACTION.ALLOCATED
  if (status === 'refunding') return SUPPLIER_ADVANCE_STATUS_ACTION.REFUND_REQUIRED
  if (status === 'refunded') return SUPPLIER_ADVANCE_STATUS_ACTION.REFUNDED
  if (status === 'cancelled') return SUPPLIER_ADVANCE_STATUS_ACTION.CANCELLED
  return SUPPLIER_ADVANCE_STATUS_ACTION.STATUS_SYNCED
}

export async function appendSupplierAdvanceStatusLog(
  tx: SupplierAdvanceStatusLogTx,
  params: {
    action: typeof SUPPLIER_ADVANCE_STATUS_ACTION[keyof typeof SUPPLIER_ADVANCE_STATUS_ACTION]
    actor?: string | null
    advancePaymentId: bigint
    createdAt?: Date
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    note?: string | null
    toStatus: string
  },
) {
  const advance = await tx.supplier_advance_payments.findUnique({
    select: {
      allocated_amount: true,
      amount: true,
      doc_no: true,
      id: true,
      remaining_amount: true,
    },
    where: { id: params.advancePaymentId },
  })
  if (!advance) throw new Error('ไม่พบรายการ ADV สำหรับบันทึก timeline')

  const nextSequence = await tx.supplier_advance_status_logs.count({
    where: { advance_payment_id: params.advancePaymentId },
  }) + 1

  await tx.supplier_advance_status_logs.create({
    data: {
      action: params.action,
      advance_doc_no: advance.doc_no,
      advance_payment_id: params.advancePaymentId,
      allocated_amount_snapshot: toNumber(advance.allocated_amount),
      amount_snapshot: toNumber(advance.amount),
      created_at: params.createdAt ?? new Date(),
      created_by: params.actor ?? null,
      event_key: `ADVLOG-${advance.doc_no}-${String(nextSequence).padStart(4, '0')}`,
      from_status: params.fromStatus ?? null,
      meta: params.meta,
      note: params.note ?? null,
      remaining_amount_snapshot: toNumber(advance.remaining_amount),
      to_status: params.toStatus,
    },
  })
}

export async function appendSupplierAdvanceAllocationLogs(
  tx: SupplierAdvanceAllocationLogTx,
  entries: Array<{
    action: typeof SUPPLIER_ADVANCE_ALLOCATION_ACTION[keyof typeof SUPPLIER_ADVANCE_ALLOCATION_ACTION]
    actor?: string | null
    allocatedAmount: number
    allocationId?: bigint | null
    allocationKey?: string | null
    advancePaymentId: bigint
    createdAt?: Date
    meta?: Prisma.InputJsonValue
    note?: string | null
    purchaseBillDocNo?: string | null
    purchaseBillId?: bigint | null
  }>,
) {
  const materialEntries = entries.filter((entry) => Math.abs(entry.allocatedAmount) > EPSILON)
  if (materialEntries.length === 0) return

  const advanceIds = [...new Set(materialEntries.map((entry) => entry.advancePaymentId))]
  const advances = await tx.supplier_advance_payments.findMany({
    select: {
      doc_no: true,
      id: true,
      remaining_amount: true,
    },
    where: { id: { in: advanceIds } },
  })
  const advanceById = new Map(advances.map((advance) => [advance.id, advance] as const))
  const runningRemaining = new Map(advances.map((advance) => [advance.id, toNumber(advance.remaining_amount)] as const))

  const rows = materialEntries.map((entry) => {
    const advance = advanceById.get(entry.advancePaymentId)
    if (!advance) throw new Error('ไม่พบรายการ ADV สำหรับบันทึกประวัติการหักบิล')

    const fromRemainingAmount = runningRemaining.get(entry.advancePaymentId) ?? 0
    const toRemainingAmount = entry.action === SUPPLIER_ADVANCE_ALLOCATION_ACTION.RELEASED_FROM_PURCHASE_BILL
      ? fromRemainingAmount + entry.allocatedAmount
      : Math.max(0, fromRemainingAmount - entry.allocatedAmount)
    runningRemaining.set(entry.advancePaymentId, toRemainingAmount)

    return {
      action: entry.action,
      advance_doc_no: advance.doc_no,
      advance_payment_id: entry.advancePaymentId,
      allocated_amount: entry.allocatedAmount,
      allocation_id: entry.allocationId ?? null,
      allocation_key: entry.allocationKey ?? null,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      event_key: `ADVALLOC-${advance.doc_no}-${randomUUID()}`,
      from_remaining_amount: fromRemainingAmount,
      meta: entry.meta,
      note: entry.note ?? null,
      purchase_bill_doc_no: entry.purchaseBillDocNo ?? null,
      purchase_bill_id: entry.purchaseBillId ?? null,
      to_remaining_amount: toRemainingAmount,
    }
  })

  await tx.supplier_advance_allocation_logs.createMany({ data: rows })
}
