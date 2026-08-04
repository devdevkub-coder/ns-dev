import type { Prisma } from '../../../generated/prisma/client'
import { isSalesBillActiveStatus } from '@/lib/server/sales-bill-history'

const ACTIVE_CUSTOMER_RECEIPT_EXCLUDED_STATUSES = ['cancelled', 'canceled']

export type SalesBillCancelState = {
  canCancel: boolean
  lockedReason: string | null
}

export function isSalesBillActiveForCancel(status: string | null | undefined, docNo: string) {
  return isSalesBillActiveStatus(status, docNo)
}

export function salesBillCancelState(
  status: string | null | undefined,
  docNo: string,
  activeReceiptCount: number,
): SalesBillCancelState {
  if (!isSalesBillActiveForCancel(status, docNo)) {
    return { canCancel: false, lockedReason: 'บิลนี้ถูกยกเลิกแล้ว' }
  }
  if (activeReceiptCount > 0) {
    return { canCancel: false, lockedReason: 'ยกเลิกบิลขายไม่ได้ เพราะมีรายการรับเงินแล้ว' }
  }
  return { canCancel: true, lockedReason: null }
}

type SalesReceiptCountClient = Pick<Prisma.TransactionClient, 'customer_receipt_allocations'>

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
