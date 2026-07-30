import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'

type DbClient = Prisma.TransactionClient

export const PURCHASE_BILL_STATUS_ACTION = {
  CANCELLED: 'cancelled',
  CREATED: 'created',
  EDITED: 'edited',
  PAYMENT_RECORDED: 'payment_recorded',
  PAYMENT_REVERSED: 'payment_reversed',
  STATUS_SYNCED: 'status_synced',
  SUPPLIER_SWAP_CANCELLED: 'supplier_swap_cancelled',
} as const

async function insertStatusLogs(
  tx: DbClient,
  entries: Array<{
    action: string
    createdAt?: Date
    createdBy?: string | null
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    note?: string | null
    purchaseBillDocNo: string
    purchaseBillId: bigint
    toStatus: string
  }>,
) {
  if (entries.length === 0) return

  for (const entry of entries) {
    await tx.purchase_bill_status_logs.create({
      data: {
        action: entry.action,
        created_at: entry.createdAt ?? new Date(),
        created_by: entry.createdBy ?? null,
        event_key: `PBLOG-${entry.purchaseBillDocNo}-${randomUUID()}`,
        from_status: entry.fromStatus ?? null,
        ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
        note: entry.note ?? null,
        purchase_bill_doc_no: entry.purchaseBillDocNo,
        purchase_bill_id: entry.purchaseBillId,
        to_status: entry.toStatus,
      },
    })
  }
}

export async function appendPurchaseBillStatusLog(
  tx: DbClient,
  params: {
    action: string
    actor?: string | null
    createdAt?: Date
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    note?: string | null
    purchaseBillDocNo: string
    purchaseBillId: bigint
    toStatus: string
  },
) {
  await insertStatusLogs(tx, [{
    action: params.action,
    createdAt: params.createdAt,
    createdBy: params.actor ?? null,
    fromStatus: params.fromStatus ?? null,
    meta: params.meta,
    note: params.note ?? null,
    purchaseBillDocNo: params.purchaseBillDocNo,
    purchaseBillId: params.purchaseBillId,
    toStatus: params.toStatus,
  }])
}

export async function createInitialPurchaseBillStatusLog(
  tx: DbClient,
  params: {
    actor?: string | null
    createdAt?: Date
    meta?: Prisma.InputJsonValue
    purchaseBillDocNo: string
    purchaseBillId: bigint
    toStatus: string
  },
) {
  await appendPurchaseBillStatusLog(tx, {
    action: PURCHASE_BILL_STATUS_ACTION.CREATED,
    actor: params.actor ?? null,
    createdAt: params.createdAt,
    fromStatus: null,
    meta: params.meta,
    purchaseBillDocNo: params.purchaseBillDocNo,
    purchaseBillId: params.purchaseBillId,
    toStatus: params.toStatus,
  })
}
