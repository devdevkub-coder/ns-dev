import type { Prisma } from '../../../generated/prisma/client'
import { calculateCustomerAdvancePaidBaseCapacity } from '@/lib/customer-advance'
import { toNumber } from '@/lib/server/daily'

type CustomerAdvanceSettlementTx = Pick<
  Prisma.TransactionClient,
  'customer_advance_status_logs' | 'customer_advance_statuses' | 'customer_advances' | 'sales_bill_customer_advance_allocations'
>

type NumericValue = { toNumber: () => number } | number | null | undefined

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function customerAdvanceStatusCode(params: {
  allocatedAmount: number
  baseCapacity: number
  cancelled: boolean
  receivedAmount: number
  targetAmount: number
}) {
  if (params.cancelled) return 'cancelled'
  if (params.allocatedAmount > 0.01 && params.baseCapacity - params.allocatedAmount <= 0.01) return 'allocated'
  if (params.allocatedAmount > 0.01) return 'partially_allocated'
  if (params.receivedAmount >= params.targetAmount - 0.01) return 'received'
  if (params.receivedAmount > 0.01) return 'partially_received'
  return 'pending_receipt'
}

export async function refreshCustomerAdvanceAllocation(
  tx: CustomerAdvanceSettlementTx,
  customerAdvanceId: bigint,
  actor?: string | null,
) {
  const [advance, statuses] = await Promise.all([
    tx.customer_advances.findUnique({
      select: {
        allocated_amount: true,
        available_amount: true,
        cancelled_at: true,
        doc_no: true,
        id: true,
        received_amount: true,
        status_id: true,
        subtotal_amount: true,
        target_amount: true,
      },
      where: { id: customerAdvanceId },
    }),
    tx.customer_advance_statuses.findMany({
      select: { code: true, id: true },
      where: { active: true },
    }),
  ])

  if (!advance) throw new Error('ไม่พบ CADV ที่ต้องการคำนวณสถานะ')
  const activeAllocations = await tx.sales_bill_customer_advance_allocations.findMany({
    select: {
      allocated_amount: true,
      allocated_subtotal_amount: true,
    },
    where: {
      customer_advance_doc_no: advance.doc_no,
      status: 'active',
    },
  })

  const targetAmount = toNumber(advance.target_amount as NumericValue)
  const subtotalAmount = toNumber(advance.subtotal_amount as NumericValue)
  const receivedAmount = toNumber(advance.received_amount as NumericValue)
  if (targetAmount <= 0 || subtotalAmount <= 0) {
    throw new Error('ข้อมูลยอดเงิน CADV ไม่ถูกต้อง กรุณาแก้ข้อมูลต้นทางก่อนคำนวณสถานะ')
  }

  const baseCapacity = calculateCustomerAdvancePaidBaseCapacity({
    receivedGrossAmount: receivedAmount,
    subtotalAmount,
    targetAmount,
  })
  const allocatedAmount = roundMoney(activeAllocations.reduce((sum, allocation) => (
    sum + (toNumber(allocation.allocated_subtotal_amount as NumericValue) || toNumber(allocation.allocated_amount as NumericValue))
  ), 0))
  if (allocatedAmount - baseCapacity > 0.01) throw new Error('ยอดใช้หักบิลรวมเกินยอด CADV ที่รับเงินจริงแล้ว')

  const availableAmount = Math.max(0, roundMoney(baseCapacity - allocatedAmount))
  const nextStatusCode = customerAdvanceStatusCode({
    allocatedAmount,
    baseCapacity,
    cancelled: Boolean(advance.cancelled_at),
    receivedAmount,
    targetAmount,
  })
  const nextStatus = statuses.find((status) => status.code === nextStatusCode)
  if (!nextStatus) throw new Error(`ไม่พบสถานะ CADV ${nextStatusCode}`)

  await tx.customer_advances.update({
    data: {
      allocated_amount: allocatedAmount,
      available_amount: availableAmount,
      status_id: nextStatus.id,
      updated_at: new Date(),
      updated_by: actor ?? 'system',
    },
    where: { id: customerAdvanceId },
  })

  if (nextStatus.id !== advance.status_id) {
    await tx.customer_advance_status_logs.create({
      data: {
        action: `status_${nextStatusCode}`,
        allocated_amount_snapshot: allocatedAmount,
        available_amount_snapshot: availableAmount,
        created_by: actor ?? 'system',
        customer_advance_doc_no: advance.doc_no,
        customer_advance_id: advance.id,
        event_key: `customer-advance.status.${advance.doc_no}.${nextStatusCode}.${Date.now()}`,
        from_status_id: advance.status_id,
        meta: { source: 'customer_advance_settlement' },
        received_amount_snapshot: receivedAmount,
        target_amount_snapshot: targetAmount,
        to_status_id: nextStatus.id,
      },
    })
  }

  return {
    allocatedAmount,
    availableAmount,
    baseCapacity,
    status: nextStatusCode,
  }
}
