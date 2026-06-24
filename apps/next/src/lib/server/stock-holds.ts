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

type WtoStockBucket = {
  availableQty: number
  lotNo: string | null
  notAvailableForSale: boolean
  outputCategory: string | null
  productId: bigint
  warehouseId: bigint
}

type WtoHoldAllocation = WtoStockBucket & {
  qty: number
  sourceLineId: bigint
  sourceLineNo: number
}

export type ConsumedWtoStockHoldLine = {
  holdKey: string
  lotNo: string | null
  notAvailableForSale: boolean
  outputCategory: string | null
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

function bucketKey(input: {
  lotNo: string | null
  notAvailableForSale: boolean | null
  outputCategory: string | null
  productId: bigint | null
  warehouseId: bigint | null
}) {
  return [
    input.productId?.toString() ?? '-',
    input.warehouseId?.toString() ?? '-',
    input.outputCategory ?? '-',
    input.lotNo ?? '-',
    input.notAvailableForSale ? 'NA' : 'A',
  ].join('|')
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
      by: ['warehouse_id', 'output_category', 'not_available_for_sale'],
      where: {
        branch_id: branch.id,
        OR: [
          { not_available_for_sale: false },
          { not_available_for_sale: null },
        ],
        product_id: product.id,
        warehouse_id: { in: warehouseIds },
      },
    }),
    prisma.stock_holds.groupBy({
      _sum: { qty: true },
      by: ['warehouse_id', 'output_category', 'not_available_for_sale'],
      where: {
        branch_id: branch.id,
        not_available_for_sale: false,
        product_id: product.id,
        status: 'active',
        warehouse_id: { in: warehouseIds },
      },
    }),
  ])

  const onHandByWarehouse = new Map(
    warehouses.map((warehouse) => {
      const qty = ledgerSums
        .filter((row) => row.warehouse_id === warehouse.id && row.output_category === warehouse.type && row.not_available_for_sale !== true)
        .reduce((sum, row) => sum + toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out), 0)
      return [warehouse.id, qty] as const
    }),
  )
  const onHoldByWarehouse = new Map(
    warehouses.map((warehouse) => {
      const qty = holdSums
        .filter((row) => row.warehouse_id === warehouse.id && row.output_category === warehouse.type && row.not_available_for_sale !== true)
        .reduce((sum, row) => sum + toNumber(row._sum.qty), 0)
      return [warehouse.id, qty] as const
    }),
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

async function loadSaleableBuckets(tx: TxClient, input: {
  branchId: bigint
  productIds: bigint[]
  warehouseIds: bigint[]
}) {
  if (!input.productIds.length || !input.warehouseIds.length) return [] as WtoStockBucket[]

  const [ledgerSums, holdSums] = await Promise.all([
    tx.stock_ledger.groupBy({
      _sum: { qty_in: true, qty_out: true },
      by: ['product_id', 'warehouse_id', 'output_category', 'lot_no', 'not_available_for_sale'],
      where: {
        branch_id: input.branchId,
        OR: [
          { not_available_for_sale: false },
          { not_available_for_sale: null },
        ],
        product_id: { in: input.productIds },
        warehouse_id: { in: input.warehouseIds },
      },
    }),
    tx.stock_holds.groupBy({
      _sum: { qty: true },
      by: ['product_id', 'warehouse_id', 'output_category', 'lot_no', 'not_available_for_sale'],
      where: {
        branch_id: input.branchId,
        not_available_for_sale: false,
        product_id: { in: input.productIds },
        status: 'active',
        warehouse_id: { in: input.warehouseIds },
      },
    }),
  ])

  const onHoldByBucket = new Map<string, number>()
  holdSums.forEach((row) => {
    const key = bucketKey({
      lotNo: row.lot_no,
      notAvailableForSale: row.not_available_for_sale,
      outputCategory: row.output_category,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
    })
    onHoldByBucket.set(key, (onHoldByBucket.get(key) ?? 0) + toNumber(row._sum.qty))
  })

  const onHandBuckets = new Map<string, WtoStockBucket>()
  ledgerSums.forEach((row) => {
    const key = bucketKey({
      lotNo: row.lot_no,
      notAvailableForSale: row.not_available_for_sale,
      outputCategory: row.output_category,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
    })
    const current = onHandBuckets.get(key) ?? {
      availableQty: 0,
      lotNo: row.lot_no,
      notAvailableForSale: row.not_available_for_sale === true,
      outputCategory: row.output_category,
      productId: row.product_id as bigint,
      warehouseId: row.warehouse_id as bigint,
    }
    current.availableQty += toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out)
    onHandBuckets.set(key, current)
  })

  return [...onHandBuckets.entries()]
    .map(([key, row]) => ({
      ...row,
      availableQty: row.availableQty - (onHoldByBucket.get(key) ?? 0),
    }))
    .filter((row) => row.productId != null && row.warehouseId != null && row.availableQty > 0.000001)
    .sort((left, right) => (
      (left.outputCategory ?? '').localeCompare(right.outputCategory ?? '')
      || (left.lotNo ?? '').localeCompare(right.lotNo ?? '')
      || left.productId.toString().localeCompare(right.productId.toString())
      || left.warehouseId.toString().localeCompare(right.warehouseId.toString())
    ))
}

async function allocateWtoHoldBuckets(tx: TxClient, input: {
  branchId: bigint
  lines: WtoCreatedLine[]
}) {
  const requiredLines = input.lines.filter((line) => line.warehouse_id != null && toNumber(line.net_weight) > 0)
  if (!requiredLines.length) return [] as WtoHoldAllocation[]

  const warehouseIds = [...new Set(requiredLines.map((line) => line.warehouse_id as bigint))]
  const warehouseTypes = await tx.warehouses.findMany({
    select: { id: true, type: true },
    where: { id: { in: warehouseIds } },
  })
  const warehouseTypeById = new Map(warehouseTypes.map((warehouse) => [warehouse.id, warehouse.type] as const))
  const buckets = await loadSaleableBuckets(tx, {
    branchId: input.branchId,
    productIds: [...new Set(requiredLines.map((line) => line.product_id))],
    warehouseIds,
  })
  const remainingByBucket = new Map(buckets.map((bucket) => [bucketKey(bucket), bucket.availableQty]))
  const allocations: WtoHoldAllocation[] = []

  for (const line of requiredLines) {
    const warehouseId = line.warehouse_id as bigint
    const warehouseType = warehouseTypeById.get(warehouseId) ?? null
    let remainingLineQty = toNumber(line.net_weight)
    const candidates = buckets.filter((bucket) => (
      bucket.productId === line.product_id
      && bucket.warehouseId === warehouseId
      && bucket.outputCategory === warehouseType
      && !bucket.notAvailableForSale
    ))

    for (const bucket of candidates) {
      if (remainingLineQty <= 0.000001) break
      const key = bucketKey(bucket)
      const remainingBucketQty = remainingByBucket.get(key) ?? 0
      if (remainingBucketQty <= 0.000001) continue
      const qty = Math.min(remainingLineQty, remainingBucketQty)
      allocations.push({
        ...bucket,
        qty,
        sourceLineId: line.id,
        sourceLineNo: line.line_no,
      })
      remainingLineQty -= qty
      remainingByBucket.set(key, remainingBucketQty - qty)
    }

    if (remainingLineQty > 0.000001) {
      throw new WtoStockHoldError(`รายการที่ ${line.line_no}: ${line.product_name} มีจำนวนพร้อมส่งไม่พอ`, {
        [`lines.${line.line_no - 1}.grossWeight`]: [`จำนวนพร้อมส่งไม่พอใน bucket ${warehouseType ?? '-'}`],
        [`lines.${line.line_no - 1}.warehouseId`]: ['คลังนี้มีจำนวนพร้อมส่งไม่พอ'],
      })
    }
  }

  return allocations
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
  const [warehouses, buckets] = await Promise.all([
    tx.warehouses.findMany({ select: { id: true, type: true }, where: { id: { in: warehouseIds } } }),
    loadSaleableBuckets(tx, { branchId: input.branchId, productIds, warehouseIds }),
  ])
  const warehouseTypeById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.type] as const))
  const availableByKey = new Map<string, number>()
  for (const bucket of buckets) {
    const warehouseType = warehouseTypeById.get(bucket.warehouseId) ?? null
    if (bucket.outputCategory !== warehouseType || bucket.notAvailableForSale) continue
    const key = `${bucket.productId}:${bucket.warehouseId}`
    availableByKey.set(key, (availableByKey.get(key) ?? 0) + bucket.availableQty)
  }
  for (const [key, row] of required) {
    const available = availableByKey.get(key) ?? 0
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
  const allocations = await allocateWtoHoldBuckets(tx, { branchId: input.branchId, lines: input.lines })
  const rows = input.lines
    .flatMap((line) => allocations
      .filter((allocation) => allocation.sourceLineId === line.id)
      .map((allocation) => ({
      branch_id: input.branchId,
      created_by: input.actor,
      held_at: new Date(),
      product_id: line.product_id,
      lot_no: allocation.lotNo,
      not_available_for_sale: allocation.notAvailableForSale,
      output_category: allocation.outputCategory,
      qty: allocation.qty,
      source_doc_no: input.documentNo,
      source_line_no: line.line_no,
      source_type: 'WTO',
      status: 'active',
      updated_by: input.actor,
      warehouse_id: allocation.warehouseId,
      weight_ticket_id: input.weightTicketId,
      weight_ticket_line_id: line.id,
    })))
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
    throw new WtoStockHoldError('ไม่พบ pending_out ที่พร้อมใช้สำหรับใบส่งของนี้')
  }

  const productIds = [...new Set(holds.map((hold) => hold.product_id))]
  const warehouseIds = [...new Set(holds.map((hold) => hold.warehouse_id))]
  const ledgerSums = await tx.stock_ledger.groupBy({
    _sum: { qty_in: true, qty_out: true, value_in: true, value_out: true },
    by: ['product_id', 'warehouse_id', 'output_category', 'lot_no', 'not_available_for_sale'],
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
      return [bucketKey({
        lotNo: row.lot_no,
        notAvailableForSale: row.not_available_for_sale,
        outputCategory: row.output_category,
        productId: row.product_id,
        warehouseId: row.warehouse_id,
      }), qty > 0 ? value / qty : 0] as const
    }),
  )
  const consumedLines: ConsumedWtoStockHoldLine[] = holds.map((hold) => {
    const unitCost = unitCostByKey.get(bucketKey({
      lotNo: hold.lot_no,
      notAvailableForSale: hold.not_available_for_sale,
      outputCategory: hold.output_category,
      productId: hold.product_id,
      warehouseId: hold.warehouse_id,
    })) ?? 0
    const qty = toNumber(hold.qty)
    return {
      holdKey: hold.hold_key,
      lotNo: hold.lot_no,
      notAvailableForSale: hold.not_available_for_sale,
      outputCategory: hold.output_category,
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
      date: input.billDate,
      lot_no: line.lotNo,
      movement_type: 'ขายออก',
      note: `WTO ${line.sourceDocNo}${line.sourceLineNo ? ` / รายการ ${line.sourceLineNo}` : ''}`,
      notes: `ตัด stock จาก pending_out ${line.holdKey}`,
      not_available_for_sale: line.notAvailableForSale,
      output_category: line.outputCategory,
      product_id: line.productId,
      qty_in: 0,
      qty_out: line.qty,
      ref_id: input.salesBillDocNo,
      ref_no: input.salesBillDocNo,
      ref_type: 'SB',
      sales_channel_id: input.salesChannelId ?? null,
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
    throw new WtoStockHoldError('pending_out ของใบส่งของนี้ถูกใช้งานไปแล้ว กรุณาโหลดข้อมูลใหม่')
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
    throw new WtoStockHoldError('ไม่พบ pending_out ที่ถูกใช้โดยบิลขายนี้')
  }

  const activeHold = await tx.stock_holds.findFirst({
    select: { id: true },
    where: {
      status: 'active',
      weight_ticket_id: { in: [...new Set(holds.map((hold) => hold.weight_ticket_id))] },
    },
  })
  if (activeHold) {
    throw new WtoStockHoldError('ใบส่งของนี้มี pending_out active อยู่แล้ว กรุณาตรวจสอบก่อนยกเลิกซ้ำ')
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
    throw new WtoStockHoldError('pending_out ของบิลขายนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
  }

  return holds
}
