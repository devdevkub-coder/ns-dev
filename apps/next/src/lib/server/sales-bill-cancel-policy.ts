import type { Prisma } from '../../../generated/prisma/client'

const CANCELLED_SALES_BILL_STATUSES = ['cancelled', 'canceled', 'void', 'voided', 'reversed']
const ACTIVE_CUSTOMER_RECEIPT_EXCLUDED_STATUSES = ['cancelled', 'canceled']
const SALES_BILL_RETURN_LOCK_ACTIONS = ['returned_from_sales_bill', 'loss_from_sales_bill', 'returned_from_wto', 'loss_from_wto_return'] as const

export type SalesBillCancelState = {
  canCancel: boolean
  lockedReason: string | null
}

export function isSalesBillActiveForCancel(status: string | null | undefined) {
  return !CANCELLED_SALES_BILL_STATUSES.includes((status ?? '').trim().toLowerCase())
}

export function salesBillCancelState(
  status: string | null | undefined,
  activeReceiptCount: number,
): SalesBillCancelState {
  if (!isSalesBillActiveForCancel(status)) {
    return { canCancel: false, lockedReason: 'บิลนี้ถูกยกเลิกแล้ว' }
  }
  if (activeReceiptCount > 0) {
    return { canCancel: false, lockedReason: 'ยกเลิกบิลขายไม่ได้ เพราะมีรายการรับเงินแล้ว' }
  }
  return { canCancel: true, lockedReason: null }
}

type SalesReceiptCountClient = Pick<Prisma.TransactionClient, 'customer_receipt_allocations'>
type SalesBillReturnLockClient = Pick<Prisma.TransactionClient, 'weight_ticket_usage_logs'>

export async function activeSalesReceiptCount(tx: SalesReceiptCountClient, salesBillId: bigint) {
  return tx.customer_receipt_allocations.count({
    where: {
      sales_bill_id: salesBillId,
      status: 'active',
      customer_receipts: {
        status: { notIn: ACTIVE_CUSTOMER_RECEIPT_EXCLUDED_STATUSES },
      },
    },
  })
}

export async function activeSalesReceiptCountByBillId(tx: SalesReceiptCountClient, salesBillIds: bigint[]) {
  if (salesBillIds.length === 0) return new Map<bigint, number>()
  const customerReceiptAllocationGroups = await tx.customer_receipt_allocations.groupBy({
    _count: { _all: true },
    by: ['sales_bill_id'],
    where: {
      sales_bill_id: { in: salesBillIds },
      status: 'active',
      customer_receipts: {
        status: { notIn: ACTIVE_CUSTOMER_RECEIPT_EXCLUDED_STATUSES },
      },
    },
  })

  const counts = new Map<bigint, number>()
  for (const group of customerReceiptAllocationGroups) {
    counts.set(group.sales_bill_id, (counts.get(group.sales_bill_id) ?? 0) + group._count._all)
  }
  return counts
}

export async function salesBillHasReturnOrLoss(tx: SalesBillReturnLockClient, salesBillId: bigint) {
  const hit = await tx.weight_ticket_usage_logs.findFirst({
    select: { id: true },
    where: {
      action: { in: [...SALES_BILL_RETURN_LOCK_ACTIONS] },
      target_id: salesBillId,
      target_type: 'SALES_BILL',
    },
  })
  return Boolean(hit)
}

export async function salesBillReturnLockByBillId(tx: SalesBillReturnLockClient, salesBillIds: bigint[]) {
  if (salesBillIds.length === 0) return new Map<bigint, number>()
  const groups = await tx.weight_ticket_usage_logs.groupBy({
    _count: { _all: true },
    by: ['target_id'],
    where: {
      action: { in: [...SALES_BILL_RETURN_LOCK_ACTIONS] },
      target_id: { in: salesBillIds },
      target_type: 'SALES_BILL',
    },
  })

  const counts = new Map<bigint, number>()
  for (const group of groups) {
    if (group.target_id == null) continue
    counts.set(group.target_id, (counts.get(group.target_id) ?? 0) + group._count._all)
  }
  return counts
}
