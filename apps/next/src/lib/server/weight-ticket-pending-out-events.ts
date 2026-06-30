import { toNumber } from '@/lib/server/daily'
import { Prisma } from '../../../generated/prisma/client'

type DbClient = Prisma.TransactionClient | {
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>
}

type PendingOutEventRow = {
  cost_snapshot_at: Date | null
  cost_snapshot_note: string | null
  cost_snapshot_source: string | null
  id: bigint
  event_key: string
  event_type: string
  occurred_at: Date
  product_code_snapshot: string | null
  product_id: bigint | null
  product_name_snapshot: string
  qty: Prisma.Decimal
  qty_after: Prisma.Decimal | null
  qty_before: Prisma.Decimal | null
  reference_doc_no: string | null
  source_hold_key: string | null
  source_line_no: number | null
  status_log_event_key: string | null
  status_snapshot: string
  unit_cost_snapshot: Prisma.Decimal | null
  value_snapshot: Prisma.Decimal | null
  warehouse_code_snapshot: string | null
  warehouse_id: bigint | null
  warehouse_name_snapshot: string
}

type HoldSnapshotRow = {
  cost_snapshot_at: Date | null
  cost_snapshot_note: string | null
  cost_snapshot_source: string | null
  hold_key: string
  product_code: string | null
  product_id: bigint
  product_name: string
  qty: Prisma.Decimal
  source_doc_no: string
  source_line_no: number | null
  status: string
  unit_cost_snapshot: Prisma.Decimal | null
  value_snapshot: Prisma.Decimal | null
  warehouse_code: string | null
  warehouse_id: bigint
  warehouse_name: string
  weight_ticket_doc_no: string
  weight_ticket_id: bigint
  weight_ticket_line_id: bigint | null
}

export type WtoPendingOutEventInput = {
  actor: string
  eventTypeForHold?: (hold: HoldSnapshotRow) => string
  holdIds: bigint[]
  occurredAt: Date
  qtyBeforeForHold?: (hold: HoldSnapshotRow) => number | null
  referenceDocNo?: string | null
  referenceDocType?: string | null
  statusLogEventKey?: string | null
  statusSnapshot?: string
  usageLogEventKey?: string | null
  weightTicketId: bigint
}

type HoldRefRow = {
  id: bigint
  weight_ticket_id: bigint
}

export type WeightTicketPendingOutEventRecord = {
  costSnapshotAt: string | null
  costSnapshotNote: string
  costSnapshotSource: string
  eventKey: string
  eventType: string
  heldAt: string | null
  holdKey: string
  pendingOutValue: number | null
  productId: string
  productName: string
  qty: number
  qtyAfter: number | null
  qtyBefore: number | null
  referenceDocNo: string
  releasedAt: string | null
  sourceLineNo: number | null
  status: string
  statusLogEventKey: string | null
  unitCostSnapshot: number | null
  warehouseId: string
  warehouseName: string
}

export async function appendWtoPendingOutEventsFromHolds(tx: DbClient, input: WtoPendingOutEventInput) {
  if (!input.holdIds.length) return

  const holds = await tx.$queryRaw<HoldSnapshotRow[]>`
    select
      h.hold_key,
      h.weight_ticket_id,
      wt.doc_no as weight_ticket_doc_no,
      h.weight_ticket_line_id,
      h.source_doc_no,
      h.source_line_no,
      h.status,
      h.product_id,
      p.code as product_code,
      coalesce(p.name, '') as product_name,
      h.warehouse_id,
      w.code as warehouse_code,
      coalesce(w.name, '') as warehouse_name,
      h.qty,
      h.unit_cost_snapshot,
      h.value_snapshot,
      h.cost_snapshot_at,
      h.cost_snapshot_source,
      h.cost_snapshot_note
    from public.stock_holds h
    join public.weight_tickets wt on wt.id = h.weight_ticket_id
    left join public.products p on p.id = h.product_id
    left join public.warehouses w on w.id = h.warehouse_id
    where h.id in (${Prisma.join(input.holdIds)})
      and h.weight_ticket_id = ${input.weightTicketId}
    order by h.source_line_no asc, h.id asc
  `

  for (const hold of holds) {
    const unitCost = hold.unit_cost_snapshot == null ? null : toNumber(hold.unit_cost_snapshot)
    const qty = toNumber(hold.qty)
    const value = hold.value_snapshot == null
      ? unitCost == null ? null : qty * unitCost
      : toNumber(hold.value_snapshot)
    const eventType = input.eventTypeForHold?.(hold) ?? 'hold_snapshot'
    const qtyBefore = input.qtyBeforeForHold?.(hold) ?? null

    await tx.$executeRaw`
      insert into public.weight_ticket_pending_out_events (
        weight_ticket_id,
        weight_ticket_doc_no,
        status_log_event_key,
        usage_log_event_key,
        event_type,
        source_hold_key,
        source_line_no,
        weight_ticket_line_id,
        product_id,
        product_code_snapshot,
        product_name_snapshot,
        warehouse_id,
        warehouse_code_snapshot,
        warehouse_name_snapshot,
        qty,
        qty_before,
        qty_after,
        unit_cost_snapshot,
        value_snapshot,
        cost_snapshot_at,
        cost_snapshot_source,
        status_snapshot,
        reference_doc_no,
        reference_doc_type,
        occurred_at,
        actor,
        note,
        meta
      )
      values (
        ${hold.weight_ticket_id},
        ${hold.weight_ticket_doc_no},
        ${input.statusLogEventKey ?? null},
        ${input.usageLogEventKey ?? null},
        ${eventType},
        ${hold.hold_key},
        ${hold.source_line_no},
        ${hold.weight_ticket_line_id},
        ${hold.product_id},
        ${hold.product_code},
        ${hold.product_name},
        ${hold.warehouse_id},
        ${hold.warehouse_code},
        ${hold.warehouse_name},
        ${qty},
        ${qtyBefore},
        ${qty},
        ${unitCost},
        ${value},
        ${hold.cost_snapshot_at},
        ${hold.cost_snapshot_source},
        ${input.statusSnapshot ?? hold.status},
        ${input.referenceDocNo ?? hold.source_doc_no},
        ${input.referenceDocType ?? 'WTO'},
        ${input.occurredAt},
        ${input.actor},
        ${hold.cost_snapshot_note},
        cast(${JSON.stringify({ source: 'stock_holds', sourceHoldKey: hold.hold_key })} as jsonb)
      )
      on conflict do nothing
    `
  }
}

async function appendWtoPendingOutEventsForHoldRefs(tx: DbClient, refs: HoldRefRow[], input: Omit<WtoPendingOutEventInput, 'holdIds' | 'weightTicketId'>) {
  const holdIdsByTicketId = new Map<bigint, bigint[]>()
  refs.forEach((ref) => {
    const holdIds = holdIdsByTicketId.get(ref.weight_ticket_id) ?? []
    holdIds.push(ref.id)
    holdIdsByTicketId.set(ref.weight_ticket_id, holdIds)
  })

  for (const [weightTicketId, holdIds] of holdIdsByTicketId.entries()) {
    await appendWtoPendingOutEventsFromHolds(tx, {
      ...input,
      holdIds,
      weightTicketId,
    })
  }
}

export async function appendWtoPendingOutEventsFromHoldIds(tx: DbClient, input: Omit<WtoPendingOutEventInput, 'weightTicketId'>) {
  if (!input.holdIds.length) return
  const refs = await tx.$queryRaw<HoldRefRow[]>`
    select id, weight_ticket_id
    from public.stock_holds
    where id in (${Prisma.join(input.holdIds)})
      and source_type = 'WTO'
    order by weight_ticket_id asc, source_line_no asc, id asc
  `
  await appendWtoPendingOutEventsForHoldRefs(tx, refs, input)
}

export async function appendWtoPendingOutEventsForSalesBill(tx: DbClient, input: Omit<WtoPendingOutEventInput, 'holdIds' | 'weightTicketId'> & {
  salesBillDocNo: string
}) {
  const { salesBillDocNo, ...eventInput } = input
  const refs = await tx.$queryRaw<HoldRefRow[]>`
    select id, weight_ticket_id
    from public.stock_holds
    where source_type = 'WTO'
      and consumed_by_ref_no = ${salesBillDocNo}
      and consumed_by_ref_type = 'SB'
      and status = 'consumed'
    order by weight_ticket_id asc, source_line_no asc, id asc
  `
  await appendWtoPendingOutEventsForHoldRefs(tx, refs, {
    ...eventInput,
    referenceDocNo: input.referenceDocNo ?? salesBillDocNo,
    referenceDocType: input.referenceDocType ?? 'SB',
  })
}

export async function appendWtoPendingOutEventsForHoldKeys(tx: DbClient, input: Omit<WtoPendingOutEventInput, 'holdIds' | 'weightTicketId'> & {
  holdKeys: string[]
}) {
  const { holdKeys, ...eventInput } = input
  if (!holdKeys.length) return
  const refs = await tx.$queryRaw<HoldRefRow[]>`
    select id, weight_ticket_id
    from public.stock_holds
    where source_type = 'WTO'
      and hold_key in (${Prisma.join(holdKeys)})
    order by weight_ticket_id asc, source_line_no asc, id asc
  `
  await appendWtoPendingOutEventsForHoldRefs(tx, refs, eventInput)
}

export async function getWeightTicketPendingOutEvents(tx: DbClient, ticketId: bigint) {
  const rows = await tx.$queryRaw<PendingOutEventRow[]>`
    select
      e.id,
      e.event_key,
      e.status_log_event_key,
      e.event_type,
      e.source_hold_key,
      e.source_line_no,
      e.product_id,
      e.product_code_snapshot,
      e.product_name_snapshot,
      e.warehouse_id,
      e.warehouse_code_snapshot,
      e.warehouse_name_snapshot,
      e.qty,
      e.qty_before,
      e.qty_after,
      e.unit_cost_snapshot,
      e.value_snapshot,
      e.cost_snapshot_at,
      e.cost_snapshot_source,
      e.note as cost_snapshot_note,
      e.status_snapshot,
      e.reference_doc_no,
      e.occurred_at
    from public.weight_ticket_pending_out_events e
    where e.weight_ticket_id = ${ticketId}
    order by e.occurred_at asc, e.id asc
  `

  const seenSourceLineNos = new Set<number>()
  return rows.map((row) => {
    let eventType = row.event_type
    if (row.event_type === 'edit_snapshot' && row.source_line_no != null) {
      eventType = seenSourceLineNos.has(row.source_line_no) ? 'edit_update_scale' : 'edit_add_scale'
    }
    if (row.source_line_no != null) {
      seenSourceLineNos.add(row.source_line_no)
    }

    const unitCostSnapshot = row.unit_cost_snapshot == null ? null : toNumber(row.unit_cost_snapshot)
    const qty = toNumber(row.qty)
    const pendingOutValue = row.value_snapshot == null
      ? unitCostSnapshot == null ? null : qty * unitCostSnapshot
      : toNumber(row.value_snapshot)
    return {
      costSnapshotAt: row.cost_snapshot_at?.toISOString() ?? null,
      costSnapshotNote: row.cost_snapshot_note ?? '',
      costSnapshotSource: row.cost_snapshot_source ?? '',
      eventKey: row.event_key,
      eventType,
      heldAt: row.occurred_at.toISOString(),
      holdKey: row.source_hold_key ?? row.event_key,
      pendingOutValue,
      productId: row.product_code_snapshot || String(row.product_id ?? ''),
      productName: row.product_name_snapshot || '-',
      qty,
      qtyAfter: row.qty_after == null ? null : toNumber(row.qty_after),
      qtyBefore: row.qty_before == null ? null : toNumber(row.qty_before),
      referenceDocNo: row.reference_doc_no ?? '',
      releasedAt: null,
      sourceLineNo: row.source_line_no,
      status: row.status_snapshot,
      statusLogEventKey: row.status_log_event_key,
      unitCostSnapshot,
      warehouseId: row.warehouse_code_snapshot || String(row.warehouse_id ?? ''),
      warehouseName: row.warehouse_name_snapshot || '',
    } satisfies WeightTicketPendingOutEventRecord
  }).sort((a, b) => {
    const timeA = a.heldAt == null ? 0 : new Date(a.heldAt).getTime()
    const timeB = b.heldAt == null ? 0 : new Date(b.heldAt).getTime()
    return timeB - timeA
  })
}
