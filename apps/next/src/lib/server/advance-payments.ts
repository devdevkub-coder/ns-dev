import type { Prisma } from '../../../generated/prisma/client'
import {
  appendSupplierAdvanceStatusLog,
  SUPPLIER_ADVANCE_STATUS_ACTION,
  supplierAdvanceStatusActionForStatus,
} from '@/lib/server/advance-payment-history'
import { supplierAdvanceTypeLabel, supplierAdvanceVatTypeLabel } from '@/lib/purchase-advance'
import { toDateOnly, toNumber } from '@/lib/server/daily'

export type AdvancePaymentTimelineEvent = {
  action: string
  actorName: string
  eventKey: string
  id: string
  metadata: Record<string, unknown>
  occurredAt: string
  outcome: 'blocked' | 'failure' | 'success'
}

type StatusTimelineRow = {
  action: string
  allocated_amount_snapshot: number | { toNumber: () => number } | null
  amount_snapshot: number | { toNumber: () => number } | null
  created_at: Date
  created_by: string | null
  event_key: string
  from_status: string | null
  meta: unknown
  note: string | null
  remaining_amount_snapshot: number | { toNumber: () => number } | null
  to_status: string
}

type AllocationLogTimelineRow = {
  action: string
  allocated_amount: number | { toNumber: () => number } | null
  created_at: Date
  created_by: string | null
  event_key: string
  from_remaining_amount: number | { toNumber: () => number } | null
  meta: unknown
  note: string | null
  purchase_bill_doc_no: string | null
  to_remaining_amount: number | { toNumber: () => number } | null
}

export function advancePaymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    allocated: 'ใช้หักบิลแล้ว',
    approved: 'อนุมัติแล้ว',
    cancelled: 'ยกเลิก',
    paid: 'จ่ายแล้ว',
    partially_allocated: 'ใช้หักบิลบางส่วน',
    partially_approved: 'อนุมัติแล้วบางส่วน',
    partially_paid: 'จ่ายแล้วบางส่วน',
    pending_approval: 'ยังไม่อนุมัติ',
  }
  return labels[status] ?? status
}

const EPSILON = 0.01

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function toBangkokDateTimeInput(date: Date | null | undefined) {
  if (!date) return ''
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function parseBangkokDateTimeInput(value: string) {
  return new Date(`${value}:00+07:00`)
}

export function canMutateAdvancePayment(row: {
  allocated_amount: number | { toNumber: () => number } | null
  cancelled_at?: Date | null
  status: string
}) {
  const allocatedAmount = toNumber(row.allocated_amount)
  if (row.cancelled_at) return false
  if (allocatedAmount > 0) return false
  return row.status === 'pending_approval'
}

export function advancePaymentMutationReason(row: {
  allocated_amount: number | { toNumber: () => number } | null
  cancelled_at?: Date | null
  status: string
}, action: 'cancel' | 'edit') {
  if (row.cancelled_at || row.status === 'cancelled') return 'รายการ ADV นี้ถูกยกเลิกแล้ว'
  if (toNumber(row.allocated_amount) > 0) return action === 'edit'
    ? 'แก้ไขไม่ได้ เพราะรายการ ADV นี้ถูกใช้หักบิลแล้ว'
    : 'ยกเลิกไม่ได้ เพราะรายการ ADV นี้ถูกใช้หักบิลแล้ว'
  if (row.status === 'paid') return action === 'edit'
    ? 'แก้ไขไม่ได้ เพราะรายการ ADV นี้จ่ายแล้ว'
    : 'ยกเลิกไม่ได้ เพราะรายการ ADV นี้จ่ายแล้ว'
  if (row.status === 'approved' || row.status === 'partially_approved') return action === 'edit'
    ? 'แก้ไขไม่ได้ เพราะรายการ ADV นี้อนุมัติแล้ว'
    : 'ยกเลิกไม่ได้ เพราะรายการ ADV นี้อนุมัติแล้ว'
  if (row.status !== 'pending_approval') return action === 'edit'
    ? 'แก้ไขไม่ได้ เพราะสถานะรายการนี้ไม่อนุญาตให้แก้ไข'
    : 'ยกเลิกไม่ได้ เพราะสถานะรายการนี้ไม่อนุญาตให้ยกเลิก'
  return ''
}

type AdvancePaymentRow = Prisma.supplier_advance_paymentsGetPayload<{
  include: {
    accounts: true
    branches: true
    suppliers: true
    supplier_advance_allocations: {
      select: {
        allocation_key: true
        allocated_amount: true
        allocated_subtotal_amount: true
        allocated_total_amount: true
        allocated_vat_amount: true
        allocated_at: true
        allocated_by: true
        id: true
        purchase_bills: {
          select: {
            doc_no: true
            id: true
          }
        }
        status: true
        void_reason: true
        voided_at: true
        voided_by: true
      }
    }
  }
}>

export function mapAdvancePaymentRow(row: AdvancePaymentRow) {
  const amount = toNumber(row.amount)
  const allocatedAmount = toNumber(row.allocated_amount)
  const remainingAmount = Math.max(0, toNumber(row.remaining_amount))
  const canMutate = canMutateAdvancePayment(row)
  const allocationRows = row.supplier_advance_allocations
    .map((allocation: AdvancePaymentRow['supplier_advance_allocations'][number]) => ({
      allocatedAmount: toNumber(allocation.allocated_amount),
      allocatedSubtotalAmount: toNumber(allocation.allocated_subtotal_amount),
      allocatedAt: allocation.allocated_at.toISOString(),
      allocatedBy: allocation.allocated_by ?? '',
      allocatedTotalAmount: toNumber(allocation.allocated_total_amount),
      allocatedVatAmount: toNumber(allocation.allocated_vat_amount),
      id: allocation.allocation_key,
      purchaseBillDocNo: allocation.purchase_bills?.doc_no ?? '',
      purchaseBillId: allocation.purchase_bills?.doc_no ?? '',
      status: allocation.status,
      voidReason: allocation.void_reason ?? '',
      voidedAt: allocation.voided_at?.toISOString() ?? '',
      voidedBy: allocation.voided_by ?? '',
    }))
    .sort((left: { allocatedAt: string }, right: { allocatedAt: string }) => right.allocatedAt.localeCompare(left.allocatedAt))

  return {
    accountName: row.accounts?.name ?? '-',
    advanceDate: toDateOnly(row.advance_date),
    allocatedAmount,
    allocations: allocationRows,
    amount,
    advanceType: row.advance_type ?? 'WAITING_SORT',
    advanceTypeLabel: supplierAdvanceTypeLabel(row.advance_type),
    branchId: row.branches?.code ?? '',
    branchName: row.branches.name,
    canCancel: canMutate,
    canEdit: canMutate,
    cancelReason: row.cancel_reason ?? '',
    cancelledAt: row.cancelled_at?.toISOString() ?? '',
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by ?? '',
    customerName: row.customer_name ?? '',
    docNo: row.doc_no,
    driverName: row.driver_name ?? '',
    fundingAccountId: row.accounts?.code ?? '',
    id: row.doc_no,
    inDate: toBangkokDateTimeInput(row.in_date),
    invoiceNo: row.invoice_no ?? '',
    largeScaleDocNo: row.large_scale_doc_no ?? '',
    lockedReason: canMutate ? '' : advancePaymentMutationReason(row, 'edit'),
    netWeight: toNumber(row.net_weight),
    outDate: toBangkokDateTimeInput(row.out_date),
    paymentMethod: row.payment_method ?? '',
    plateNo: row.plate_no ?? '',
    pricePerKg: toNumber(row.price_per_kg),
    productName: row.product_name ?? '',
    remainingAmount,
    remark: row.remark ?? '',
    scaleOperator: row.scale_operator ?? '',
    senderName: row.sender_name ?? '',
    status: row.status,
    statusLabel: advancePaymentStatusLabel(row.status),
    subtotalAmount: toNumber(row.subtotal_amount) || amount,
    supplierCode: row.suppliers.code ?? '',
    supplierId: row.suppliers.code ?? '',
    supplierName: row.suppliers.name,
    totalAmount: toNumber(row.total_amount) || amount,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by ?? '',
    vatAmount: toNumber(row.vat_amount),
    vatRatePercent: toNumber(row.vat_rate_percent),
    vatType: row.vat_type ?? 'NONE',
    vatTypeLabel: supplierAdvanceVatTypeLabel(row.vat_type),
    vehiclePhotoNames: row.vehicle_photo_names ?? [],
    weightIn: toNumber(row.weight_in),
    weightOut: toNumber(row.weight_out),
  }
}

type PrismaClientLike = {
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>
}

type AdvancePaymentStatusTx = Pick<
  Prisma.TransactionClient,
  'payment_approvals' | 'payments' | 'supplier_advance_payments' | 'supplier_advance_status_logs'
>

type SupplierAdvanceStatusAction = typeof SUPPLIER_ADVANCE_STATUS_ACTION[keyof typeof SUPPLIER_ADVANCE_STATUS_ACTION]

export type AdvancePaymentApprovalStatusSummary = {
  activeApprovalAmount: number
  activeApprovalCount: number
  allActiveApprovalsSettled: boolean
  settledAmount: number
}

export function deriveAdvancePaymentWorkflowStatus(params: {
  activeApprovalAmount: number
  allocatedAmount: number
  allActiveApprovalsSettled: boolean
  amount: number
  cancelledAt?: Date | null
  currentStatus?: string | null
  remainingAmount: number
  settledAmount: number
}) {
  const currentStatus = String(params.currentStatus ?? '')
  if (params.cancelledAt || currentStatus === 'cancelled') return 'cancelled'
  if (params.allocatedAmount > EPSILON) {
    return params.remainingAmount <= EPSILON ? 'allocated' : 'partially_allocated'
  }
  if (params.settledAmount >= params.amount - EPSILON) return 'paid'
  if (params.settledAmount > EPSILON) return 'partially_paid'
  if (params.activeApprovalAmount <= EPSILON) return 'pending_approval'
  if (params.activeApprovalAmount < params.amount - EPSILON) return 'partially_approved'
  return params.allActiveApprovalsSettled ? 'paid' : 'approved'
}

export async function summarizeAdvancePaymentApprovalStatus(
  tx: Pick<Prisma.TransactionClient, 'payment_approvals' | 'payments'>,
  advancePaymentId: bigint,
): Promise<AdvancePaymentApprovalStatusSummary> {
  const approvals = await tx.payment_approvals.findMany({
    select: { approved_amount: true, id: true },
    where: {
      source_id: advancePaymentId.toString(),
      source_type: 'advance_payment',
      status: { in: ['approved', 'paid'] },
    },
  })
  let allActiveApprovalsSettled = approvals.length > 0
  let totalSettledAmount = 0
  for (const approval of approvals) {
    const payments = await tx.payments.findMany({
      select: { amount: true, discount: true, withholding_tax: true },
      where: {
        payment_approval_id: approval.id,
        NOT: { status: 'cancelled' },
      },
    })
    const settledAmount = payments.reduce((sum, payment) => (
      sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
    ), 0)
    totalSettledAmount += settledAmount
    if (Math.max(0, toNumber(approval.approved_amount) - settledAmount) > EPSILON) {
      allActiveApprovalsSettled = false
      break
    }
  }

  return {
    activeApprovalAmount: roundMoney(approvals.reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)),
    activeApprovalCount: approvals.length,
    allActiveApprovalsSettled,
    settledAmount: roundMoney(totalSettledAmount),
  }
}

export async function refreshAdvancePaymentWorkflowStatus(
  tx: AdvancePaymentStatusTx,
  advancePaymentId: bigint,
  actor?: string | null,
  options?: {
    action?: SupplierAdvanceStatusAction
    logIfUnchanged?: boolean
    meta?: Prisma.InputJsonValue
    note?: string | null
  },
) {
  const advance = await tx.supplier_advance_payments.findUnique({
    select: {
      allocated_amount: true,
      amount: true,
      cancelled_at: true,
      id: true,
      remaining_amount: true,
      status: true,
      total_amount: true,
    },
    where: { id: advancePaymentId },
  })
  if (!advance) throw new Error('ไม่พบ ADV ที่ต้องการคำนวณสถานะใหม่')

  const approvalSummary = await summarizeAdvancePaymentApprovalStatus(tx, advancePaymentId)
  const nextStatus = deriveAdvancePaymentWorkflowStatus({
    activeApprovalAmount: approvalSummary.activeApprovalAmount,
    allocatedAmount: toNumber(advance.allocated_amount),
    allActiveApprovalsSettled: approvalSummary.allActiveApprovalsSettled,
    amount: toNumber(advance.total_amount) || toNumber(advance.amount),
    cancelledAt: advance.cancelled_at,
    currentStatus: advance.status,
    remainingAmount: toNumber(advance.remaining_amount),
    settledAmount: approvalSummary.settledAmount,
  })

  if (nextStatus !== advance.status) {
    await tx.supplier_advance_payments.update({
      data: {
        status: nextStatus,
        updated_at: new Date(),
        updated_by: actor ?? null,
      },
      where: { id: advancePaymentId },
    })
  }

  if (nextStatus !== advance.status || options?.logIfUnchanged) {
    await appendSupplierAdvanceStatusLog(tx, {
      action: options?.action ?? supplierAdvanceStatusActionForStatus(nextStatus),
      actor: actor ?? null,
      advancePaymentId,
      fromStatus: advance.status,
      meta: options?.meta,
      note: options?.note ?? null,
      toStatus: nextStatus,
    })
  }

  return {
    ...approvalSummary,
    status: nextStatus,
  }
}

function statusTimelineEventKey(action: string) {
  if (action === 'created') return 'purchase.advance-payment.created'
  if (action === 'edited') return 'purchase.advance-payment.updated'
  if (action === 'cancelled') return 'purchase.advance-payment.cancelled'
  if (action === 'approved') return 'purchase.advance-payment.approved'
  if (action === 'partially_approved') return 'purchase.advance-payment.partially-approved'
  if (action === 'approval_voided') return 'purchase.advance-payment.approval-voided'
  if (action === 'partially_paid') return 'purchase.advance-payment.partially-paid'
  if (action === 'paid') return 'purchase.advance-payment.paid'
  if (action === 'payment_reversed') return 'purchase.advance-payment.payment-reversed'
  if (action === 'partially_allocated') return 'purchase.advance-payment.partially-allocated'
  if (action === 'allocated') return 'purchase.advance-payment.fully-allocated'
  if (action === 'allocation_released') return 'purchase.advance-payment.allocation-released'
  return 'purchase.advance-payment.status-synced'
}

function allocationTimelineEventKey(action: string) {
  if (action === 'released_from_purchase_bill') return 'purchase.advance-payment.allocation-voided'
  return 'purchase.advance-payment.allocated'
}

export async function getAdvancePaymentTimeline(tx: PrismaClientLike, advancePaymentId: string | bigint): Promise<AdvancePaymentTimelineEvent[]> {
  const internalAdvancePaymentId = typeof advancePaymentId === 'bigint' ? advancePaymentId : BigInt(advancePaymentId)
  const [statusRows, allocationRows] = await Promise.all([
    tx.$queryRaw<StatusTimelineRow[]>`
      select
        s.event_key,
        s.action,
        s.from_status,
        s.to_status,
        s.amount_snapshot,
        s.allocated_amount_snapshot,
        s.remaining_amount_snapshot,
        s.note,
        s.meta,
        s.created_at,
        s.created_by
      from public.supplier_advance_status_logs s
      where s.advance_payment_id = ${internalAdvancePaymentId}
      order by s.created_at desc, s.id desc
    `,
    tx.$queryRaw<AllocationLogTimelineRow[]>`
      select
        l.event_key,
        l.action,
        l.allocated_amount,
        l.from_remaining_amount,
        l.to_remaining_amount,
        l.note,
        l.meta,
        l.created_at,
        l.created_by,
        l.purchase_bill_doc_no
      from public.supplier_advance_allocation_logs l
      where l.advance_payment_id = ${internalAdvancePaymentId}
      order by l.created_at desc, l.id desc
    `,
  ])

  const statusEvents = statusRows.map((row) => ({
    action: row.action,
    actorName: row.created_by ?? '-',
    eventKey: statusTimelineEventKey(row.action),
    id: row.event_key,
    metadata: {
      ...(row.meta && typeof row.meta === 'object' ? row.meta as Record<string, unknown> : {}),
      allocatedAmount: toNumber(row.allocated_amount_snapshot),
      amount: toNumber(row.amount_snapshot),
      fromStatus: row.from_status,
      note: row.note ?? '',
      remainingAmount: toNumber(row.remaining_amount_snapshot),
      toStatus: row.to_status,
    },
    occurredAt: row.created_at.toISOString(),
    outcome: 'success' as const,
  }))

  const allocationEvents = allocationRows.map((row) => ({
    action: row.action,
    actorName: row.created_by ?? '-',
    eventKey: allocationTimelineEventKey(row.action),
    id: row.event_key,
    metadata: {
      ...(row.meta && typeof row.meta === 'object' ? row.meta as Record<string, unknown> : {}),
      allocatedAmount: toNumber(row.allocated_amount),
      fromRemainingAmount: toNumber(row.from_remaining_amount),
      note: row.note ?? '',
      purchaseBillDocNo: row.purchase_bill_doc_no ?? '',
      toRemainingAmount: toNumber(row.to_remaining_amount),
    },
    occurredAt: row.created_at.toISOString(),
    outcome: 'success' as const,
  }))

  return [...statusEvents, ...allocationEvents].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
}
