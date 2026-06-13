import type { Prisma } from '../../../generated/prisma/client'

const CANCELLED_SALES_BILL_STATUSES = ['cancelled', 'canceled', 'void', 'voided', 'reversed']
const ACTIVE_LEGACY_RECEIPT_EXCLUDED_STATUSES = ['cancelled', 'Canceled', 'void', 'voided', 'reversed']
const ACTIVE_CUSTOMER_RECEIPT_EXCLUDED_STATUSES = ['cancelled', 'canceled']

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

export async function activeSalesReceiptCount(tx: Prisma.TransactionClient, salesBillId: bigint) {
  const [legacyReceiptCount, customerReceiptAllocationCount] = await Promise.all([
    tx.receipts.count({
      where: {
        bill_id: salesBillId,
        status: { notIn: ACTIVE_LEGACY_RECEIPT_EXCLUDED_STATUSES },
      },
    }),
    tx.customer_receipt_allocations.count({
      where: {
        sales_bill_id: salesBillId,
        status: 'active',
        customer_receipts: {
          status: { notIn: ACTIVE_CUSTOMER_RECEIPT_EXCLUDED_STATUSES },
        },
      },
    }),
  ])
  return legacyReceiptCount + customerReceiptAllocationCount
}

export async function activeSalesReceiptCountByBillId(tx: Prisma.TransactionClient, salesBillIds: bigint[]) {
  if (salesBillIds.length === 0) return new Map<bigint, number>()
  const [legacyReceiptGroups, customerReceiptAllocationGroups] = await Promise.all([
    tx.receipts.groupBy({
      _count: { _all: true },
      by: ['bill_id'],
      where: {
        bill_id: { in: salesBillIds },
        status: { notIn: ACTIVE_LEGACY_RECEIPT_EXCLUDED_STATUSES },
      },
    }),
    tx.customer_receipt_allocations.groupBy({
      _count: { _all: true },
      by: ['sales_bill_id'],
      where: {
        sales_bill_id: { in: salesBillIds },
        status: 'active',
        customer_receipts: {
          status: { notIn: ACTIVE_CUSTOMER_RECEIPT_EXCLUDED_STATUSES },
        },
      },
    }),
  ])

  const counts = new Map<bigint, number>()
  for (const group of legacyReceiptGroups) {
    if (group.bill_id == null) continue
    counts.set(group.bill_id, (counts.get(group.bill_id) ?? 0) + group._count._all)
  }
  for (const group of customerReceiptAllocationGroups) {
    counts.set(group.sales_bill_id, (counts.get(group.sales_bill_id) ?? 0) + group._count._all)
  }
  return counts
}
