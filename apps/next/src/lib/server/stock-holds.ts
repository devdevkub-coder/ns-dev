import { requireBusinessCode } from '@/lib/business-code'
import { toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../generated/prisma/client'

const WTO_WAREHOUSE_TYPES = ['RM', 'FG'] as const

export type WtoStockOption = {
  availableQty: number
  branchId: string
  code: string
  id: string
  name: string
  onHandQty: number
  onHoldQty: number
  type: 'RM' | 'FG'
}

export class WtoStockOptionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message)
  }
}

export class WtoStockHoldError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
  }
}

export type WtoWarehouseReference = {
  code: string
  id: bigint
  name: string
  type: string | null
}

type WtoAvailabilityLine = {
  index: number
  netWeight: number
  productId: bigint
  productName: string
  warehouseId: bigint | null
}

type WtoCreatedLine = {
  id: bigint
  line_no: number
  net_weight: Prisma.Decimal | number
  product_id: bigint
  product_name: string
  warehouse_id: bigint | null
}

type TxClient = Prisma.TransactionClient

export type ConsumedWtoStockHoldLine = {
  productId: bigint
  qty: number
  sourceDocNo: string
  sourceLineNo: number | null
  unitCost: number
  valueOut: number
  warehouseId: bigint
  weightTicketLineId: bigint | null
}

function normalizeCode(value: string | null | undefined) {
  return String(value ?? '').trim().toUpperCase()
}

export async function loadWtoStockOptions(input: {
  branchId: string
  productId: string
  scopedBranchIds: string[]
}) {
  const branchCode = normalizeCode(input.branchId)
  const productCode = normalizeCode(input.productId)

  if (!branchCode) {
    throw new WtoStockOptionError('เลือกสาขา', 400, 'BRANCH_REQUIRED')
  }
  if (!productCode) {
    throw new WtoStockOptionError('เลือกสินค้า', 400, 'PRODUCT_REQUIRED')
  }
  if (input.scopedBranchIds.length && !input.scopedBranchIds.includes(branchCode)) {
    throw new WtoStockOptionError('ไม่มีสิทธิ์ดูสต็อกของสาขานี้', 403, 'BRANCH_FORBIDDEN')
  }

  const [branch, product] = await Promise.all([
    prisma.branches.findFirst({
      select: { code: true, id: true, name: true },
      where: { active: true, code: branchCode },
    }),
    prisma.products.findFirst({
      select: { code: true, id: true, name: true },
      where: { active: true, code: productCode },
    }),
  ])

  if (!branch) {
    throw new WtoStockOptionError('ไม่พบสาขาที่ใช้งาน', 404, 'BRANCH_NOT_FOUND')
  }
  if (!product) {
    throw new WtoStockOptionError('ไม่พบสินค้าที่ใช้งาน', 404, 'PRODUCT_NOT_FOUND')
  }

  const warehouses = await prisma.warehouses.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }, { code: 'asc' }],
    select: { code: true, id: true, name: true, type: true },
    where: {
      active: true,
      branch_id: branch.id,
      type: { in: [...WTO_WAREHOUSE_TYPES] },
    },
  })

  const warehouseIds = warehouses.map((warehouse) => warehouse.id)
  if (!warehouseIds.length) {
    return {
      branch: { id: requireBusinessCode(branch.code, `สาขา ${branch.id}`), name: branch.name },
      product: { id: requireBusinessCode(product.code, `สินค้า ${product.id}`), name: product.name },
      warehouses: [] as WtoStockOption[],
    }
  }

  const [ledgerSums, holdSums] = await Promise.all([
    prisma.stock_ledger.groupBy({
      _sum: { qty_in: true, qty_out: true },
      by: ['warehouse_id'],
      where: {
        branch_id: branch.id,
        product_id: product.id,
        warehouse_id: { in: warehouseIds },
      },
    }),
    prisma.stock_holds.groupBy({
      _sum: { qty: true },
      by: ['warehouse_id'],
      where: {
        branch_id: branch.id,
        product_id: product.id,
        status: 'active',
        warehouse_id: { in: warehouseIds },
      },
    }),
  ])

  const onHandByWarehouse = new Map(
    ledgerSums.map((row) => [
      row.warehouse_id,
      toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out),
    ]),
  )
  const onHoldByWarehouse = new Map(
    holdSums.map((row) => [row.warehouse_id, toNumber(row._sum.qty)]),
  )

  return {
    branch: { id: requireBusinessCode(branch.code, `สาขา ${branch.id}`), name: branch.name },
    product: { id: requireBusinessCode(product.code, `สินค้า ${product.id}`), name: product.name },
    warehouses: warehouses.map((warehouse) => {
      const code = requireBusinessCode(warehouse.code, `คลัง ${warehouse.id}`)
      const onHandQty = onHandByWarehouse.get(warehouse.id) ?? 0
      const onHoldQty = onHoldByWarehouse.get(warehouse.id) ?? 0
      return {
        availableQty: onHandQty - onHoldQty,
        branchId: branch.code,
        code,
        id: code,
        name: warehouse.name,
        onHandQty,
        onHoldQty,
        type: warehouse.type as 'RM' | 'FG',
      }
    }),
  }
}

export async function resolveWtoWarehousesForLines(tx: TxClient, input: {
  branchId: bigint
  lines: Array<{ warehouseId: string }>
}) {
  const warehouseCodes = [...new Set(input.lines.map((line) => normalizeCode(line.warehouseId)).filter(Boolean))]
  if (!warehouseCodes.length) return new Map<string, WtoWarehouseReference>()

  const warehouses = await tx.warehouses.findMany({
    select: { code: true, id: true, name: true, type: true },
    where: {
      active: true,
      branch_id: input.branchId,
      code: { in: warehouseCodes },
      type: { in: [...WTO_WAREHOUSE_TYPES] },
    },
  })
  const warehouseByCode = new Map(
    warehouses.map((warehouse) => [
      normalizeCode(warehouse.code),
      {
        code: requireBusinessCode(warehouse.code, `คลัง ${warehouse.id}`),
        id: warehouse.id,
        name: warehouse.name,
        type: warehouse.type,
      },
    ] as const),
  )
  const missingIndex = input.lines.findIndex((line) => {
    const code = normalizeCode(line.warehouseId)
    return Boolean(code) && !warehouseByCode.has(code)
  })
  if (missingIndex >= 0) {
    throw new WtoStockHoldError(`รายการที่ ${missingIndex + 1}: คลังไม่ถูกต้องหรือไม่ใช่คลัง RM/FG ของสาขานี้`, {
      [`lines.${missingIndex}.warehouseId`]: ['คลังไม่ถูกต้องหรือไม่ใช่คลัง RM/FG ของสาขานี้'],
    })
  }
  return warehouseByCode
}

export async function validateWtoStockAvailability(tx: TxClient, input: {
  branchId: bigint
  lines: WtoAvailabilityLine[]
}) {
  const required = new Map<string, { indexes: number[]; productId: bigint; productName: string; qty: number; warehouseId: bigint }>()
  for (const line of input.lines) {
    if (!line.warehouseId) {
      throw new WtoStockHoldError(`รายการที่ ${line.index + 1}: เลือกคลัง`, {
        [`lines.${line.index}.warehouseId`]: ['เลือกคลัง'],
      })
    }
    const key = `${line.productId}:${line.warehouseId}`
    const current = required.get(key)
    if (current) {
      current.qty += line.netWeight
      current.indexes.push(line.index)
    } else {
      required.set(key, {
        indexes: [line.index],
        productId: line.productId,
        productName: line.productName,
        qty: line.netWeight,
        warehouseId: line.warehouseId,
      })
    }
  }
  if (!required.size) return

  const productIds = [...new Set([...required.values()].map((row) => row.productId))]
  const warehouseIds = [...new Set([...required.values()].map((row) => row.warehouseId))]
  const [ledgerSums, holdSums] = await Promise.all([
    tx.stock_ledger.groupBy({
      _sum: { qty_in: true, qty_out: true },
      by: ['product_id', 'warehouse_id'],
      where: {
        branch_id: input.branchId,
        product_id: { in: productIds },
        warehouse_id: { in: warehouseIds },
      },
    }),
    tx.stock_holds.groupBy({
      _sum: { qty: true },
      by: ['product_id', 'warehouse_id'],
      where: {
        branch_id: input.branchId,
        product_id: { in: productIds },
        status: 'active',
        warehouse_id: { in: warehouseIds },
      },
    }),
  ])

  const onHandByKey = new Map(
    ledgerSums.map((row) => [
      `${row.product_id}:${row.warehouse_id}`,
      toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out),
    ]),
  )
  const onHoldByKey = new Map(
    holdSums.map((row) => [`${row.product_id}:${row.warehouse_id}`, toNumber(row._sum.qty)]),
  )
  for (const [key, row] of required) {
    const available = (onHandByKey.get(key) ?? 0) - (onHoldByKey.get(key) ?? 0)
    if (row.qty > available + 0.000001) {
      const firstIndex = row.indexes[0] ?? 0
      throw new WtoStockHoldError(`รายการที่ ${firstIndex + 1}: ${row.productName} มีจำนวนพร้อมส่งไม่พอ`, {
        [`lines.${firstIndex}.grossWeight`]: [`จำนวนพร้อมส่ง ${available.toLocaleString('th-TH', { maximumFractionDigits: 3 })}`],
        [`lines.${firstIndex}.warehouseId`]: ['คลังนี้มีจำนวนพร้อมส่งไม่พอ'],
      })
    }
  }
}

export async function createActiveWtoStockHolds(tx: TxClient, input: {
  actor: string
  branchId: bigint
  documentNo: string
  lines: WtoCreatedLine[]
  weightTicketId: bigint
}) {
  const rows = input.lines
    .filter((line) => line.warehouse_id != null && toNumber(line.net_weight) > 0)
    .map((line) => ({
      branch_id: input.branchId,
      created_by: input.actor,
      held_at: new Date(),
      product_id: line.product_id,
      qty: toNumber(line.net_weight),
      source_doc_no: input.documentNo,
      source_line_no: line.line_no,
      source_type: 'WTO',
      status: 'active',
      updated_by: input.actor,
      warehouse_id: line.warehouse_id as bigint,
      weight_ticket_id: input.weightTicketId,
      weight_ticket_line_id: line.id,
    }))
  if (!rows.length) return
  await tx.stock_holds.createMany({ data: rows })
}

export async function closeActiveWtoStockHolds(tx: TxClient, input: {
  actor: string
  reason: 'cancel' | 'edit'
  weightTicketId: bigint
}) {
  const now = new Date()
  await tx.stock_holds.updateMany({
    data: {
      ...(input.reason === 'cancel' ? { cancelled_at: now } : { released_at: now }),
      status: input.reason === 'cancel' ? 'cancelled' : 'released',
      updated_at: now,
      updated_by: input.actor,
    },
    where: {
      status: 'active',
      weight_ticket_id: input.weightTicketId,
    },
  })
}

export async function consumeActiveWtoStockHolds(tx: TxClient, input: {
  actor: string
  billDate: Date
  branchId: bigint
  salesBillDocNo: string
  salesChannelId?: bigint | null
  weightTicketId: bigint
}) {
  const holds = await tx.stock_holds.findMany({
    orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
    where: {
      status: 'active',
      weight_ticket_id: input.weightTicketId,
    },
  })
  if (!holds.length) {
    throw new WtoStockHoldError('ไม่พบ stock hold ที่พร้อมใช้สำหรับใบส่งของนี้')
  }

  const productIds = [...new Set(holds.map((hold) => hold.product_id))]
  const warehouseIds = [...new Set(holds.map((hold) => hold.warehouse_id))]
  const ledgerSums = await tx.stock_ledger.groupBy({
    _sum: { qty_in: true, qty_out: true, value_in: true, value_out: true },
    by: ['product_id', 'warehouse_id'],
    where: {
      branch_id: input.branchId,
      product_id: { in: productIds },
      warehouse_id: { in: warehouseIds },
    },
  })
  const unitCostByKey = new Map(
    ledgerSums.map((row) => {
      const qty = toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out)
      const value = toNumber(row._sum.value_in) - toNumber(row._sum.value_out)
      return [`${row.product_id}:${row.warehouse_id}`, qty > 0 ? value / qty : 0] as const
    }),
  )
  const ledgerRows = holds.map((hold) => {
    const unitCost = unitCostByKey.get(`${hold.product_id}:${hold.warehouse_id}`) ?? 0
    const qty = toNumber(hold.qty)
    return {
      branch_id: input.branchId,
      created_by: input.actor,
      date: input.billDate,
      movement_type: 'ขายออก',
      note: `WTO ${hold.source_doc_no}${hold.source_line_no ? ` / รายการ ${hold.source_line_no}` : ''}`,
      notes: `ตัด stock จาก hold ${hold.hold_key}`,
      product_id: hold.product_id,
      qty_in: 0,
      qty_out: qty,
      ref_id: input.salesBillDocNo,
      ref_no: input.salesBillDocNo,
      ref_type: 'SB',
      sales_channel_id: input.salesChannelId ?? null,
      unit_cost: unitCost,
      value_in: 0,
      value_out: qty * unitCost,
      warehouse_id: hold.warehouse_id,
    }
  })
  await tx.stock_ledger.createMany({ data: ledgerRows })
  const now = new Date()
  const consumed = await tx.stock_holds.updateMany({
    data: {
      consumed_at: now,
      consumed_by: input.actor,
      consumed_by_ref_no: input.salesBillDocNo,
      consumed_by_ref_type: 'SB',
      status: 'consumed',
      updated_at: now,
      updated_by: input.actor,
    },
    where: {
      id: { in: holds.map((hold) => hold.id) },
      status: 'active',
    },
  })
  if (consumed.count !== holds.length) {
    throw new WtoStockHoldError('stock hold ของใบส่งของนี้ถูกใช้งานไปแล้ว กรุณาโหลดข้อมูลใหม่')
  }
}

export async function consumeActiveWtoStockHoldsForPendingSale(tx: TxClient, input: {
  actor: string
  branchId: bigint
  issueDate: Date
  stockIssueDocNo: string
  weightTicketId: bigint
}) {
  const holds = await tx.stock_holds.findMany({
    orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
    where: {
      status: 'active',
      weight_ticket_id: input.weightTicketId,
    },
  })
  if (!holds.length) {
    throw new WtoStockHoldError('ไม่พบ stock hold ที่พร้อมใช้สำหรับใบส่งของนี้')
  }

  const productIds = [...new Set(holds.map((hold) => hold.product_id))]
  const warehouseIds = [...new Set(holds.map((hold) => hold.warehouse_id))]
  const ledgerSums = await tx.stock_ledger.groupBy({
    _sum: { qty_in: true, qty_out: true, value_in: true, value_out: true },
    by: ['product_id', 'warehouse_id'],
    where: {
      branch_id: input.branchId,
      product_id: { in: productIds },
      warehouse_id: { in: warehouseIds },
    },
  })
  const unitCostByKey = new Map(
    ledgerSums.map((row) => {
      const qty = toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out)
      const value = toNumber(row._sum.value_in) - toNumber(row._sum.value_out)
      return [`${row.product_id}:${row.warehouse_id}`, qty > 0 ? value / qty : 0] as const
    }),
  )
  const consumedLines: ConsumedWtoStockHoldLine[] = holds.map((hold) => {
    const unitCost = unitCostByKey.get(`${hold.product_id}:${hold.warehouse_id}`) ?? 0
    const qty = toNumber(hold.qty)
    return {
      productId: hold.product_id,
      qty,
      sourceDocNo: hold.source_doc_no,
      sourceLineNo: hold.source_line_no,
      unitCost,
      valueOut: qty * unitCost,
      warehouseId: hold.warehouse_id,
      weightTicketLineId: hold.weight_ticket_line_id,
    }
  })
  await tx.stock_ledger.createMany({
    data: consumedLines.map((line) => ({
      branch_id: input.branchId,
      created_by: input.actor,
      date: input.issueDate,
      movement_type: 'เบิกออกรอบิล',
      note: `WTO ${line.sourceDocNo}${line.sourceLineNo ? ` / รายการ ${line.sourceLineNo}` : ''}`,
      notes: `ตัด stock เข้า Pending Sale ${input.stockIssueDocNo}`,
      product_id: line.productId,
      qty_in: 0,
      qty_out: line.qty,
      ref_id: input.stockIssueDocNo,
      ref_no: input.stockIssueDocNo,
      ref_type: 'PSALE',
      unit_cost: line.unitCost,
      value_in: 0,
      value_out: line.valueOut,
      warehouse_id: line.warehouseId,
    })),
  })
  const now = new Date()
  const consumed = await tx.stock_holds.updateMany({
    data: {
      consumed_at: now,
      consumed_by: input.actor,
      consumed_by_ref_no: input.stockIssueDocNo,
      consumed_by_ref_type: 'PSALE',
      status: 'consumed',
      updated_at: now,
      updated_by: input.actor,
    },
    where: {
      id: { in: holds.map((hold) => hold.id) },
      status: 'active',
    },
  })
  if (consumed.count !== holds.length) {
    throw new WtoStockHoldError('stock hold ของใบส่งของนี้ถูกใช้งานไปแล้ว กรุณาโหลดข้อมูลใหม่')
  }

  return consumedLines
}

export async function reopenConsumedWtoStockHoldsForSalesBill(tx: TxClient, input: {
  actor: string
  cancelDate: Date
  note?: string | null
  salesBillDocNo: string
}) {
  const existingReverseRow = await tx.stock_ledger.findFirst({
    select: { id: true },
    where: {
      ref_type: 'SB-CANCEL',
      OR: [
        { ref_id: input.salesBillDocNo },
        { ref_no: input.salesBillDocNo },
      ],
    },
  })
  if (existingReverseRow) {
    throw new WtoStockHoldError('บิลขายนี้ถูก reverse stock ledger แล้ว')
  }

  const ledgerRows = await tx.stock_ledger.findMany({
    orderBy: [{ date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    where: {
      ref_type: 'SB',
      OR: [
        { ref_id: input.salesBillDocNo },
        { ref_no: input.salesBillDocNo },
      ],
    },
  })
  if (!ledgerRows.length) {
    throw new WtoStockHoldError('ไม่พบ stock ledger ของบิลขายนี้สำหรับทำ reversal')
  }

  await tx.stock_ledger.createMany({
    data: ledgerRows.map((row) => ({
      branch_id: row.branch_id,
      created_by: input.actor,
      date: input.cancelDate,
      lot_no: row.lot_no,
      movement_type: 'ยกเลิกขายคืนสต๊อก',
      note: input.note ?? `ยกเลิกบิลขาย ${input.salesBillDocNo}`,
      notes: `Reverse ${row.ledger_key}`,
      not_available_for_sale: row.not_available_for_sale,
      output_category: row.output_category,
      product_id: row.product_id,
      qty_in: toNumber(row.qty_out),
      qty_out: 0,
      ref_id: input.salesBillDocNo,
      ref_no: input.salesBillDocNo,
      ref_type: 'SB-CANCEL',
      sales_channel_id: row.sales_channel_id,
      unit_cost: row.unit_cost,
      value_in: toNumber(row.value_out),
      value_out: 0,
      warehouse_id: row.warehouse_id,
    })),
  })

  const holds = await tx.stock_holds.findMany({
    select: {
      id: true,
      weight_ticket_id: true,
    },
    where: {
      consumed_by_ref_no: input.salesBillDocNo,
      consumed_by_ref_type: 'SB',
      status: 'consumed',
    },
  })
  if (!holds.length) {
    throw new WtoStockHoldError('ไม่พบ stock hold ที่ถูกใช้โดยบิลขายนี้')
  }

  const activeHold = await tx.stock_holds.findFirst({
    select: { id: true },
    where: {
      status: 'active',
      weight_ticket_id: { in: [...new Set(holds.map((hold) => hold.weight_ticket_id))] },
    },
  })
  if (activeHold) {
    throw new WtoStockHoldError('ใบส่งของนี้มี stock hold active อยู่แล้ว กรุณาตรวจสอบก่อนยกเลิกซ้ำ')
  }

  const reopened = await tx.stock_holds.updateMany({
    data: {
      consumed_at: null,
      consumed_by: null,
      consumed_by_ref_no: null,
      consumed_by_ref_type: null,
      note: input.note ?? null,
      status: 'active',
      updated_at: new Date(),
      updated_by: input.actor,
    },
    where: {
      id: { in: holds.map((hold) => hold.id) },
      status: 'consumed',
    },
  })
  if (reopened.count !== holds.length) {
    throw new WtoStockHoldError('stock hold ของบิลขายนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
  }

  return holds
}

export async function reversePendingSaleStockIssue(tx: TxClient, input: {
  actor: string
  cancelDate: Date
  note?: string | null
  stockIssueDocNo: string
}) {
  const [ledgerRows, reversalRows] = await Promise.all([
    tx.stock_ledger.findMany({
      orderBy: [{ date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      where: {
        ref_type: 'PSALE',
        OR: [
          { ref_id: input.stockIssueDocNo },
          { ref_no: input.stockIssueDocNo },
        ],
      },
    }),
    tx.stock_ledger.findMany({
      select: { notes: true },
      where: {
        ref_type: 'PSALE-CANCEL',
        OR: [
          { ref_id: input.stockIssueDocNo },
          { ref_no: input.stockIssueDocNo },
        ],
      },
    }),
  ])
  const reversedLedgerKeys = new Set(
    reversalRows
      .map((row) => row.notes?.match(/^Reverse (.+)$/)?.[1])
      .filter((ledgerKey): ledgerKey is string => Boolean(ledgerKey)),
  )
  if (!ledgerRows.length) {
    throw new WtoStockHoldError('ไม่พบ stock ledger ของรายการเบิกออกรอบิลนี้สำหรับทำ reversal')
  }

  const unreversedLedgerRows = ledgerRows.filter((row) => !reversedLedgerKeys.has(row.ledger_key))
  if (!unreversedLedgerRows.length) {
    throw new WtoStockHoldError('รายการเบิกออกรอบิลนี้ถูก reverse stock ledger แล้ว')
  }

  await tx.stock_ledger.createMany({
    data: unreversedLedgerRows.map((row) => ({
      branch_id: row.branch_id,
      created_by: input.actor,
      date: input.cancelDate,
      lot_no: row.lot_no,
      movement_type: 'ยกเลิกเบิกออกรอบิล',
      note: input.note ?? `ยกเลิกเบิกออกรอบิล ${input.stockIssueDocNo}`,
      notes: `Reverse ${row.ledger_key}`,
      not_available_for_sale: row.not_available_for_sale,
      output_category: row.output_category,
      product_id: row.product_id,
      qty_in: toNumber(row.qty_out),
      qty_out: 0,
      ref_id: input.stockIssueDocNo,
      ref_no: input.stockIssueDocNo,
      ref_type: 'PSALE-CANCEL',
      sales_channel_id: row.sales_channel_id,
      unit_cost: row.unit_cost,
      value_in: toNumber(row.value_out),
      value_out: 0,
      warehouse_id: row.warehouse_id,
    })),
  })

  const holds = await tx.stock_holds.findMany({
    select: {
      id: true,
      weight_ticket_id: true,
    },
    where: {
      consumed_by_ref_no: input.stockIssueDocNo,
      consumed_by_ref_type: 'PSALE',
      status: 'consumed',
    },
  })
  if (!holds.length) {
    throw new WtoStockHoldError('ไม่พบ stock hold ที่ถูกใช้โดยรายการเบิกออกรอบิลนี้')
  }

  const activeHold = await tx.stock_holds.findFirst({
    select: { id: true },
    where: {
      status: 'active',
      weight_ticket_id: { in: [...new Set(holds.map((hold) => hold.weight_ticket_id))] },
    },
  })
  if (activeHold) {
    throw new WtoStockHoldError('ใบส่งของนี้มี stock hold active อยู่แล้ว กรุณาตรวจสอบก่อนยกเลิกซ้ำ')
  }

  const reopened = await tx.stock_holds.updateMany({
    data: {
      consumed_at: null,
      consumed_by: null,
      consumed_by_ref_no: null,
      consumed_by_ref_type: null,
      note: input.note ?? null,
      release_reason: null,
      released_at: null,
      released_by: null,
      status: 'active',
      updated_at: new Date(),
      updated_by: input.actor,
    },
    where: {
      id: { in: holds.map((hold) => hold.id) },
      status: 'consumed',
    },
  })
  if (reopened.count !== holds.length) {
    throw new WtoStockHoldError('stock hold ของรายการเบิกออกรอบิลนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
  }

  return holds
}
