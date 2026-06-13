import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { toNumber } from '@/lib/server/daily'

type DbClient = Prisma.TransactionClient

export const SALES_BILL_STATUS_ACTION = {
  CANCELLED: 'cancelled',
  CREATED: 'created',
  STATUS_SYNCED: 'status_synced',
} as const

export type SalesBillStatusAction = typeof SALES_BILL_STATUS_ACTION[keyof typeof SALES_BILL_STATUS_ACTION]

export type SalesBillStatusLogEntry = {
  action: SalesBillStatusAction
  actor?: string | null
  createdAt?: Date
  fromStatus?: string | null
  meta?: Prisma.InputJsonValue
  note?: string | null
  salesBillId: bigint
  toStatus: string
}

export async function appendSalesBillStatusLog(
  tx: DbClient,
  entry: SalesBillStatusLogEntry,
) {
  const bill = await tx.sales_bills.findUnique({
    select: {
      doc_no: true,
      id: true,
      receivable_balance: true,
      received_amount: true,
      total_amount: true,
    },
    where: { id: entry.salesBillId },
  })
  if (!bill) {
    throw new Error(`ไม่พบบิลขายสำหรับบันทึกประวัติสถานะ: ${String(entry.salesBillId)}`)
  }

  await tx.sales_bill_status_logs.create({
    data: {
      action: entry.action,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      event_key: `SBSTATUS-${bill.doc_no}-${randomUUID()}`,
      from_status: entry.fromStatus ?? null,
      meta: entry.meta,
      note: entry.note ?? null,
      receivable_balance_snapshot: toNumber(bill.receivable_balance),
      received_amount_snapshot: toNumber(bill.received_amount),
      sales_bill_doc_no: bill.doc_no,
      sales_bill_id: bill.id,
      to_status: entry.toStatus,
      total_amount_snapshot: toNumber(bill.total_amount),
    },
  })
}
