import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { toNumber } from '@/lib/server/daily'

type DbClient = Prisma.TransactionClient

export const STOCK_ISSUE_STATUS_ACTION = {
  CANCELLED: 'cancelled',
  CONVERTED: 'converted',
  CREATED: 'created',
  EDITED: 'edited',
} as const

export type StockIssueStatusAction = typeof STOCK_ISSUE_STATUS_ACTION[keyof typeof STOCK_ISSUE_STATUS_ACTION]

export type StockIssueStatusLogEntry = {
  action: StockIssueStatusAction
  actor?: string | null
  createdAt?: Date
  fromStatus?: string | null
  meta?: Prisma.InputJsonValue
  note?: string | null
  stockIssueId: bigint
  toStatus: string
}

export async function appendStockIssueStatusLog(
  tx: DbClient,
  entry: StockIssueStatusLogEntry,
) {
  const stockIssue = await tx.stock_issues.findUnique({
    select: {
      doc_no: true,
      id: true,
      total_cost: true,
      total_est_amount: true,
    },
    where: { id: entry.stockIssueId },
  })
  if (!stockIssue) {
    throw new Error(`ไม่พบรายการเบิกออกรอบิลสำหรับบันทึกประวัติสถานะ: ${String(entry.stockIssueId)}`)
  }

  await tx.stock_issue_status_logs.create({
    data: {
      action: entry.action,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      event_key: `PSALELOG-${stockIssue.doc_no}-${randomUUID()}`,
      from_status: entry.fromStatus ?? null,
      meta: entry.meta,
      note: entry.note ?? null,
      stock_issue_doc_no: stockIssue.doc_no,
      stock_issue_id: stockIssue.id,
      to_status: entry.toStatus,
      total_cost_snapshot: toNumber(stockIssue.total_cost),
      total_est_amount_snapshot: toNumber(stockIssue.total_est_amount),
    },
  })
}
