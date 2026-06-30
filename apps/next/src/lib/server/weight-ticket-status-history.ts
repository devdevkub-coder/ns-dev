import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { toNumber } from '@/lib/server/daily'

type DbClient = Prisma.TransactionClient

export const WEIGHT_TICKET_STATUS_ACTION = {
  CANCELLED: 'cancelled',
  CONFIRMED: 'confirmed',
  CREATED: 'created',
  EDITED: 'edited',
  STATUS_SYNCED: 'status_synced',
  USAGE_STATUS_CHANGED: 'usage_status_changed',
} as const

export type WeightTicketStatusAction = typeof WEIGHT_TICKET_STATUS_ACTION[keyof typeof WEIGHT_TICKET_STATUS_ACTION]

export type WeightTicketStatusLogEntry = {
  action: WeightTicketStatusAction
  actor?: string | null
  createdAt?: Date
  fromStatus?: string | null
  meta?: Prisma.InputJsonValue
  note?: string | null
  toStatus: string
  weightTicketId: bigint
}

export async function appendWeightTicketStatusLog(
  tx: DbClient,
  entry: WeightTicketStatusLogEntry,
) {
  const ticket = await tx.weight_tickets.findUnique({
    select: {
      deduct_weight: true,
      doc_no: true,
      doc_type: true,
      gross_weight: true,
      id: true,
      net_weight: true,
    },
    where: { id: entry.weightTicketId },
  })
  if (!ticket) {
    throw new Error(`ไม่พบใบรับ-ส่งของสำหรับบันทึกประวัติสถานะ: ${String(entry.weightTicketId)}`)
  }

  const eventKey = `WTSTATUS-${ticket.doc_no}-${randomUUID()}`
  await tx.weight_ticket_status_logs.create({
    data: {
      action: entry.action,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      deduct_weight_snapshot: toNumber(ticket.deduct_weight),
      doc_type: ticket.doc_type,
      event_key: eventKey,
      from_status: entry.fromStatus ?? null,
      gross_weight_snapshot: toNumber(ticket.gross_weight),
      meta: entry.meta,
      net_weight_snapshot: toNumber(ticket.net_weight),
      note: entry.note ?? null,
      to_status: entry.toStatus,
      weight_ticket_doc_no: ticket.doc_no,
      weight_ticket_id: ticket.id,
    },
  })
  return eventKey
}
