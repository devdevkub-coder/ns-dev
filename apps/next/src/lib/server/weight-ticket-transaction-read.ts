import { Prisma } from '../../../generated/prisma/client'
import { WeightTicketDataContractError, type WeightTicketRow } from './weight-tickets'

/**
 * Prisma interactive transactions use one pg connection. Relation includes
 * may fan out into concurrent queries on that connection, so transaction
 * lifecycle reads must be explicit and awaited in sequence.
 */
export async function readWeightTicketInTransaction(
  tx: Prisma.TransactionClient,
  ticketId: bigint,
): Promise<WeightTicketRow> {
  const ticket = await tx.weight_tickets.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new WeightTicketDataContractError('ไม่พบใบรับ-ส่งของใน transaction')

  const branches = await tx.branches.findUnique({ where: { id: ticket.branch_id } })
  if (!branches) throw new WeightTicketDataContractError('ข้อมูลสาขาของใบรับ-ส่งของไม่ครบ')

  const customers = ticket.doc_type !== 'WTO' || ticket.customer_id == null
    ? null
    : await tx.customers.findUnique({ where: { id: ticket.customer_id } })
  const suppliers = ticket.doc_type !== 'WTI' || ticket.supplier_id == null
    ? null
    : await tx.suppliers.findUnique({ where: { id: ticket.supplier_id } })

  const summaries = await tx.weight_ticket_product_summaries.findMany({
    orderBy: { product_name: 'asc' },
    where: { weight_ticket_id: ticket.id },
  })
  const lines = await tx.weight_ticket_lines.findMany({
    orderBy: { line_no: 'asc' },
    where: { weight_ticket_id: ticket.id },
  })

  const stockHolds = await tx.stock_holds.findMany({
    orderBy: { source_line_no: 'asc' },
    select: {
      cost_snapshot_at: true,
      cost_snapshot_note: true,
      cost_snapshot_source: true,
      consumed_at: true,
      consumed_by_ref_no: true,
      hold_key: true,
      held_at: true,
      product_id: true,
      qty: true,
      released_at: true,
      source_doc_no: true,
      source_line_no: true,
      status: true,
      unit_cost_snapshot: true,
      value_snapshot: true,
      warehouse_id: true,
    },
    where: { weight_ticket_id: ticket.id },
  })

  const productIds = [...new Set([
    ...summaries.map((summary) => summary.product_id),
    ...lines.map((line) => line.product_id),
  ])]
  const products = productIds.length === 0
    ? []
    : await tx.products.findMany({
      select: { code: true, id: true, metal_group: true },
      where: { id: { in: productIds } },
    })

  const warehouseIds = [...new Set([
    ...lines.flatMap((line) => line.warehouse_id == null ? [] : [line.warehouse_id]),
    ...stockHolds.map((hold) => hold.warehouse_id),
  ])]
  const warehouses = warehouseIds.length === 0
    ? []
    : await tx.warehouses.findMany({
      select: { code: true, id: true, name: true, type: true },
      where: { id: { in: warehouseIds } },
    })
  const productById = new Map(products.map((product) => [product.id, product] as const))
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse] as const))

  return {
    ...ticket,
    branches,
    customers,
    suppliers,
    stock_holds: stockHolds.map((hold) => {
      const warehouse = warehouseById.get(hold.warehouse_id)
      if (!warehouse) throw new WeightTicketDataContractError(`ข้อมูลคลังของ stock hold ${hold.hold_key} ไม่ครบ`)
      return { ...hold, warehouses: warehouse }
    }),
    weight_ticket_lines: lines.map((line) => {
      const product = productById.get(line.product_id)
      if (!product) throw new WeightTicketDataContractError(`ข้อมูลสินค้าในรายการที่ ${line.line_no} ไม่ครบ`)
      const warehouse = line.warehouse_id == null ? null : warehouseById.get(line.warehouse_id)
      if (line.warehouse_id != null && !warehouse) {
        throw new WeightTicketDataContractError(`ข้อมูลคลังในรายการที่ ${line.line_no} ไม่ครบ`)
      }
      return {
        ...line,
        products: product,
        warehouses: warehouse ?? null,
      }
    }),
    weight_ticket_product_summaries: summaries.map((summary) => {
      const product = productById.get(summary.product_id)
      if (!product) throw new WeightTicketDataContractError('ข้อมูลสินค้าในสรุปใบรับ-ส่งของไม่ครบ')
      return { ...summary, products: product }
    }),
  }
}
