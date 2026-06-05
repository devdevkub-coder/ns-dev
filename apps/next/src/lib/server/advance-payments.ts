import type { Prisma } from '../../../generated/prisma/client'
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

type AdvancePaymentAuditRow = {
  action: string | null
  actor_display_name: string | null
  actor_username: string | null
  event_key: string
  id: string
  metadata: unknown
  occurred_at: Date
  outcome: string | null
}

type AllocationTimelineRow = {
  allocation_key: string
  allocated_amount: number | { toNumber: () => number } | null
  allocated_at: Date
  allocated_by: string | null
  purchase_bill_doc_no: string | null
  status: string
  void_reason: string | null
  voided_at: Date | null
  voided_by: string | null
}

export function advancePaymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    allocated: 'ใช้หักบิลแล้ว',
    approved: 'อนุมัติแล้ว',
    cancelled: 'ยกเลิก',
    paid: 'เสร็จสิ้น',
    partially_allocated: 'ใช้หักบิลบางส่วน',
    pending_approval: 'ยังไม่อนุมัติ',
    refunded: 'คืนเงินแล้ว',
    refunding: 'รอคืนเงิน',
  }
  return labels[status] ?? status
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
  if (row.status === 'refunding' || row.status === 'refunded') return action === 'edit'
    ? 'แก้ไขไม่ได้ เพราะรายการ ADV นี้อยู่ในขั้นตอนคืนเงินแล้ว'
    : 'ยกเลิกไม่ได้ เพราะรายการ ADV นี้อยู่ในขั้นตอนคืนเงินแล้ว'
  if (row.status === 'approved') return action === 'edit'
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
      allocatedAt: allocation.allocated_at.toISOString(),
      allocatedBy: allocation.allocated_by ?? '',
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
    supplierCode: row.suppliers.code ?? '',
    supplierId: row.suppliers.code ?? '',
    supplierName: row.suppliers.name,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by ?? '',
    vehiclePhotoNames: row.vehicle_photo_names ?? [],
    weightIn: toNumber(row.weight_in),
    weightOut: toNumber(row.weight_out),
  }
}

type PrismaClientLike = {
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>
}

export async function getAdvancePaymentTimeline(tx: PrismaClientLike, advancePaymentId: string): Promise<AdvancePaymentTimelineEvent[]> {
  const [auditRows, allocationRows] = await Promise.all([
    tx.$queryRaw<AdvancePaymentAuditRow[]>`
      select
        a.id::text as id,
        a.event_key,
        a.action,
        a.outcome,
        a.occurred_at,
        a.metadata,
        a.actor_display_name,
        a.actor_username
      from public.app_audit_logs a
      where a.entity_table = 'supplier_advance_payments'
        and a.entity_id = ${advancePaymentId}
      order by a.occurred_at desc, a.id desc
    `,
    tx.$queryRaw<AllocationTimelineRow[]>`
      select
        saa.allocation_key,
        saa.allocated_amount,
        saa.allocated_at,
        saa.allocated_by,
        saa.status,
        saa.voided_at,
        saa.voided_by,
        saa.void_reason,
        pb.doc_no as purchase_bill_doc_no
      from public.supplier_advance_allocations saa
      left join public.purchase_bills pb on pb.id = saa.purchase_bill_id
      where saa.advance_payment_id = ${advancePaymentId}
      order by coalesce(saa.voided_at, saa.allocated_at) desc, saa.id desc
    `,
  ])

  const auditEvents = auditRows.map((row) => ({
    action: row.action ?? 'system',
    actorName: row.actor_display_name ?? row.actor_username ?? '-',
    eventKey: row.event_key,
    id: row.event_key,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    occurredAt: row.occurred_at.toISOString(),
    outcome: (row.outcome === 'blocked' || row.outcome === 'failure' ? row.outcome : 'success') as 'blocked' | 'failure' | 'success',
  }))

  const allocationEvents = allocationRows.flatMap((row) => {
    const baseMetadata = {
      allocatedAmount: toNumber(row.allocated_amount),
      purchaseBillDocNo: row.purchase_bill_doc_no ?? '',
    }
    const allocationDocNo = row.purchase_bill_doc_no ?? row.allocated_at.toISOString()
    const createdEvent: AdvancePaymentTimelineEvent = {
      action: 'allocate',
      actorName: row.allocated_by ?? '-',
      eventKey: 'purchase.advance-payment.allocated',
      id: `${row.allocation_key}:allocated`,
      metadata: baseMetadata,
      occurredAt: row.allocated_at.toISOString(),
      outcome: 'success',
    }
    const voidEvent = row.voided_at
      ? [{
          action: 'void',
          actorName: row.voided_by ?? '-',
          eventKey: 'purchase.advance-payment.allocation-voided',
          id: `${row.allocation_key}:voided`,
          metadata: {
            ...baseMetadata,
            voidReason: row.void_reason ?? '',
          },
          occurredAt: row.voided_at.toISOString(),
          outcome: 'success' as const,
        }]
      : []
    return [createdEvent, ...voidEvent]
  })

  return [...auditEvents, ...allocationEvents].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
}
