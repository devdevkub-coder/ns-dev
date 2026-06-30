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

export class WtoPendingOutError extends Error {
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

export type WtoPreservedCostSnapshot = {
  costSnapshotAt: Date | null
  costSnapshotNote: string | null
  costSnapshotSource: string | null
  lotNo: string | null
  notAvailableForSale: boolean
  outputCategory: string | null
  productId: bigint
  qty: number
  sourceLineNo: number | null
  unitCostSnapshot: Prisma.Decimal | number | null
  valueSnapshot: Prisma.Decimal | number | null
  warehouseId: bigint
  weightTicketLineId: bigint | null
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

type WtoPendingOutAllocation = WtoStockBucket & {
  qty: number
  sourceLineId: bigint
  sourceLineNo: number
}

export type ConsumedWtoPendingOutLine = {
  pendingOutKey: string
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

export type ReturnedWtoPendingOutResult = {
  branchId: bigint
  pendingOutKey: string
  lossPendingOutKey: string | null
  lossQty: number
  lossUnitCost: number
  lossValueOut: number
  pendingQty: number
  productCode: string | null
  productId: bigint
  productName: string
  returnedQty: number
  sourceDocNo: string
  sourceLineNo: number | null
  warehouseId: bigint
  weightTicketId: bigint
  weightTicketLineId: bigint | null
}

export type ReleasedWtoPendingOutLine = {
  pendingOutKey: string
  lotNo: string | null
  notAvailableForSale: boolean
  outputCategory: string | null
  productId: bigint
  qty: number
  sourceDocNo: string
  sourceLineNo: number | null
  unitCost: number
  valueIn: number
  warehouseId: bigint
  weightTicketId: bigint
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

function lineBucketKey(input: {
  lotNo: string | null
  notAvailableForSale: boolean | null
  outputCategory: string | null
  productId: bigint | null
  sourceLineNo: number | null
  warehouseId: bigint | null
}) {
  return [
    input.sourceLineNo ?? '-',
    bucketKey(input),
  ].join('|')
}

function assertPositiveWtoAverageCost(value: number | null | undefined, message: string) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    throw new WtoPendingOutError(message)
  }
  return value
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
    throw new WtoPendingOutError(`รายการที่ ${missingIndex + 1}: คลังไม่ถูกต้องหรือไม่ใช่คลัง RM/FG ของสาขานี้`, {
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

async function allocateWtoPendingOutBuckets(tx: TxClient, input: {
  branchId: bigint
  lines: WtoCreatedLine[]
}) {
  const requiredLines = input.lines.filter((line) => line.warehouse_id != null && toNumber(line.net_weight) > 0)
  if (!requiredLines.length) return [] as WtoPendingOutAllocation[]

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
  const allocations: WtoPendingOutAllocation[] = []

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
      throw new WtoPendingOutError(`รายการที่ ${line.line_no}: ${line.product_name} มีจำนวนพร้อมส่งไม่พอ`, {
        [`lines.${line.line_no - 1}.grossWeight`]: [`จำนวนพร้อมส่งไม่พอใน bucket ${warehouseType ?? '-'}`],
        [`lines.${line.line_no - 1}.warehouseId`]: ['คลังนี้มีจำนวนพร้อมส่งไม่พอ'],
      })
    }
  }

  return allocations
}

async function loadAverageCostByBucketKey(tx: TxClient, input: {
  branchId: bigint
  productIds: bigint[]
  warehouseIds: bigint[]
}) {
  if (!input.productIds.length || !input.warehouseIds.length) return new Map<string, number>()

  const ledgerSums = await tx.stock_ledger.groupBy({
    _sum: { qty_in: true, qty_out: true, value_in: true, value_out: true },
    by: ['product_id', 'warehouse_id', 'output_category', 'lot_no', 'not_available_for_sale'],
    where: {
      branch_id: input.branchId,
      product_id: { in: input.productIds },
      warehouse_id: { in: input.warehouseIds },
    },
  })

  const totalsByBucket = new Map<string, { qty: number; value: number }>()
  ledgerSums.forEach((row) => {
    const key = bucketKey({
      lotNo: row.lot_no,
      notAvailableForSale: row.not_available_for_sale,
      outputCategory: row.output_category,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
    })
    const current = totalsByBucket.get(key) ?? { qty: 0, value: 0 }
    current.qty += toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out)
    current.value += toNumber(row._sum.value_in) - toNumber(row._sum.value_out)
    totalsByBucket.set(key, current)
  })

  return new Map(
    [...totalsByBucket.entries()]
      .filter(([, total]) => total.qty > 0 && total.value > 0)
      .map(([key, total]) => [key, total.value / total.qty] as const),
  )
}

export async function validateWtoStockAvailability(tx: TxClient, input: {
  branchId: bigint
  lines: WtoAvailabilityLine[]
}) {
  const required = new Map<string, { indexes: number[]; productId: bigint; productName: string; qty: number; warehouseId: bigint }>()
  for (const line of input.lines) {
    if (!line.warehouseId) {
      throw new WtoPendingOutError(`รายการที่ ${line.index + 1}: เลือกคลัง`, {
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
      throw new WtoPendingOutError(`รายการที่ ${firstIndex + 1}: ${row.productName} มีจำนวนพร้อมส่งไม่พอ`, {
        [`lines.${firstIndex}.grossWeight`]: [`จำนวนพร้อมส่ง ${available.toLocaleString('th-TH', { maximumFractionDigits: 3 })}`],
        [`lines.${firstIndex}.warehouseId`]: ['คลังนี้มีจำนวนพร้อมส่งไม่พอ'],
      })
    }
  }
}

export async function createActiveWtoPendingOut(tx: TxClient, input: {
  actor: string
  branchId: bigint
  documentNo: string
  lines: WtoCreatedLine[]
  preservedCostSnapshots?: WtoPreservedCostSnapshot[]
  snapshotCost?: boolean
  snapshotSource?: string
  weightTicketId: bigint
}) {
  const allocations = await allocateWtoPendingOutBuckets(tx, { branchId: input.branchId, lines: input.lines })
  const costByBucketKey = input.snapshotCost
    ? await loadAverageCostByBucketKey(tx, {
      branchId: input.branchId,
      productIds: [...new Set(allocations.map((allocation) => allocation.productId))],
      warehouseIds: [...new Set(allocations.map((allocation) => allocation.warehouseId))],
    })
    : new Map<string, number>()
  const now = new Date()
  const preservedByLineBucket = new Map<string, WtoPreservedCostSnapshot[]>()
  for (const snapshot of input.preservedCostSnapshots ?? []) {
    const key = lineBucketKey({
      lotNo: snapshot.lotNo,
      notAvailableForSale: snapshot.notAvailableForSale,
      outputCategory: snapshot.outputCategory,
      productId: snapshot.productId,
      sourceLineNo: snapshot.sourceLineNo,
      warehouseId: snapshot.warehouseId,
    })
    preservedByLineBucket.set(key, [...(preservedByLineBucket.get(key) ?? []), { ...snapshot }])
  }

  const rows: Prisma.stock_holdsCreateManyInput[] = []
  for (const line of input.lines) {
    const lineAllocations = allocations.filter((allocation) => allocation.sourceLineId === line.id)
    for (const allocation of lineAllocations) {
      const pushRow = (qty: number, snapshot: {
        costSnapshotAt: Date | null
        costSnapshotNote: string | null
        costSnapshotSource: string | null
        unitCostSnapshot: number | null
      }) => {
        rows.push({
          branch_id: input.branchId,
          cost_snapshot_at: snapshot.costSnapshotAt,
          cost_snapshot_note: snapshot.costSnapshotNote,
          cost_snapshot_source: snapshot.costSnapshotSource,
          created_by: input.actor,
          held_at: now,
          lot_no: allocation.lotNo,
          not_available_for_sale: allocation.notAvailableForSale,
          output_category: allocation.outputCategory,
          product_id: line.product_id,
          qty,
          source_doc_no: input.documentNo,
          source_line_no: line.line_no,
          source_type: 'WTO',
          status: 'active',
          unit_cost_snapshot: snapshot.unitCostSnapshot,
          updated_by: input.actor,
          value_snapshot: snapshot.unitCostSnapshot == null ? null : qty * snapshot.unitCostSnapshot,
          warehouse_id: allocation.warehouseId,
          weight_ticket_id: input.weightTicketId,
          weight_ticket_line_id: line.id,
        })
      }

      if (!input.snapshotCost) {
        pushRow(allocation.qty, {
          costSnapshotAt: null,
          costSnapshotNote: null,
          costSnapshotSource: null,
          unitCostSnapshot: null,
        })
        continue
      }

      let remainingQty = allocation.qty
      const key = bucketKey(allocation)
      const preserved = preservedByLineBucket.get(lineBucketKey({
        lotNo: allocation.lotNo,
        notAvailableForSale: allocation.notAvailableForSale,
        outputCategory: allocation.outputCategory,
        productId: allocation.productId,
        sourceLineNo: line.line_no,
        warehouseId: allocation.warehouseId,
      })) ?? []
      while (remainingQty > 0.0001 && preserved.length) {
        const snapshot = preserved[0]
        if (snapshot.unitCostSnapshot == null) {
          throw new WtoPendingOutError(`pending_out เดิมของ ${input.documentNo} ยังไม่มีราคาต้นทุนเฉลี่ยที่บันทึกไว้ ไม่สามารถแก้ไขหลังยืนยันได้`)
        }
        const unitCostSnapshot = assertPositiveWtoAverageCost(
          toNumber(snapshot.unitCostSnapshot),
          `pending_out เดิมของ ${input.documentNo} มีราคาต้นทุนเฉลี่ยไม่ถูกต้อง ไม่สามารถแก้ไขหลังยืนยันได้`,
        )
        const preservedQty = Math.min(remainingQty, snapshot.qty)
        pushRow(preservedQty, {
          costSnapshotAt: snapshot.costSnapshotAt,
          costSnapshotNote: snapshot.costSnapshotNote,
          costSnapshotSource: snapshot.costSnapshotSource,
          unitCostSnapshot,
        })
        snapshot.qty = Number((snapshot.qty - preservedQty).toFixed(6))
        remainingQty = Number((remainingQty - preservedQty).toFixed(6))
        if (snapshot.qty <= 0.0001) preserved.shift()
      }

      if (remainingQty > 0.0001) {
        const unitCostSnapshot = costByBucketKey.get(key)
        const positiveUnitCostSnapshot = assertPositiveWtoAverageCost(
          unitCostSnapshot,
          `ไม่พบราคาต้นทุนเฉลี่ยสำหรับ pending_out ${input.documentNo} line ${line.line_no}`,
        )
        pushRow(remainingQty, {
          costSnapshotAt: now,
          costSnapshotNote: `เต๋าที่ ${line.line_no}`,
          costSnapshotSource: input.snapshotSource ?? 'WTO_CONFIRM',
          unitCostSnapshot: positiveUnitCostSnapshot,
        })
      }
    }
  }
  if (!rows.length) return [] as bigint[]
  await tx.stock_holds.createMany({ data: rows })
  const createdHolds = await tx.stock_holds.findMany({
    select: { id: true },
    where: {
      held_at: now,
      weight_ticket_id: input.weightTicketId,
    },
  })
  return createdHolds.map((hold) => hold.id)
}

export async function snapshotActiveWtoPendingOutCosts(tx: TxClient, input: {
  actor: string
  branchId: bigint
  source: 'WTO_CONFIRM' | 'WTO_EDIT_INCREASE'
  weightTicketId: bigint
}) {
  const holds = await tx.stock_holds.findMany({
    where: {
      status: 'active',
      unit_cost_snapshot: null,
      weight_ticket_id: input.weightTicketId,
    },
  })
  if (!holds.length) return [] as bigint[]

  const costByBucketKey = await loadAverageCostByBucketKey(tx, {
    branchId: input.branchId,
    productIds: [...new Set(holds.map((hold) => hold.product_id))],
    warehouseIds: [...new Set(holds.map((hold) => hold.warehouse_id))],
  })
  const now = new Date()

  const updatedHoldIds: bigint[] = []
  for (const hold of holds) {
    const unitCostSnapshot = costByBucketKey.get(bucketKey({
      lotNo: hold.lot_no,
      notAvailableForSale: hold.not_available_for_sale,
      outputCategory: hold.output_category,
      productId: hold.product_id,
      warehouseId: hold.warehouse_id,
    }))
    const positiveUnitCostSnapshot = assertPositiveWtoAverageCost(
      unitCostSnapshot,
      `ไม่พบราคาต้นทุนเฉลี่ยสำหรับ pending_out ${hold.hold_key} กรุณาตรวจสอบ stock ก่อนยืนยันใบส่งของ`,
    )
    await tx.stock_holds.update({
      data: {
        cost_snapshot_at: now,
        cost_snapshot_note: hold.source_line_no ? `เต๋าที่ ${hold.source_line_no}` : null,
        cost_snapshot_source: input.source,
        unit_cost_snapshot: positiveUnitCostSnapshot,
        updated_at: now,
        updated_by: input.actor,
        value_snapshot: toNumber(hold.qty) * positiveUnitCostSnapshot,
      },
      where: { id: hold.id },
    })
    updatedHoldIds.push(hold.id)
  }
  return updatedHoldIds
}

export async function releaseActiveWtoPendingOut(tx: TxClient, input: {
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

export async function consumeActiveWtoPendingOut(tx: TxClient, input: {
  actor: string
  allocations?: Array<{ productId: bigint; qty: number }>
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
    throw new WtoPendingOutError('ไม่พบ pending_out ที่พร้อมใช้สำหรับใบส่งของนี้')
  }

  const requestedByProductId = new Map<bigint, number>()
  input.allocations?.forEach((allocation) => {
    if (allocation.qty <= 0.0001) return
    requestedByProductId.set(allocation.productId, (requestedByProductId.get(allocation.productId) ?? 0) + allocation.qty)
  })
  const shouldLimitByAllocation = requestedByProductId.size > 0

  const consumedLines: ConsumedWtoPendingOutLine[] = []
  const holdUpdates: Array<{
    consumedQty: number
    hold: (typeof holds)[number]
    remainingQty: number
  }> = []

  for (const hold of holds) {
    const holdQty = toNumber(hold.qty)
    const requestedQty = shouldLimitByAllocation ? requestedByProductId.get(hold.product_id) ?? 0 : holdQty
    if (requestedQty <= 0.0001) continue
    const qty = Math.min(holdQty, requestedQty)
    if (hold.unit_cost_snapshot == null) {
      throw new WtoPendingOutError(`pending_out ${hold.hold_key} ยังไม่มีราคาต้นทุนเฉลี่ยที่บันทึกไว้ กรุณายืนยันใบส่งของก่อนเปิดบิลขาย`)
    }
    const unitCost = toNumber(hold.unit_cost_snapshot)
    consumedLines.push({
      pendingOutKey: hold.hold_key,
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
    })
    holdUpdates.push({ consumedQty: qty, hold, remainingQty: Math.max(0, holdQty - qty) })
    if (shouldLimitByAllocation) {
      requestedByProductId.set(hold.product_id, Math.max(0, requestedQty - qty))
    }
  }

  const missingProducts = [...requestedByProductId.entries()].filter(([, qty]) => qty > 0.0001)
  if (missingProducts.length) {
    throw new WtoPendingOutError('pending_out ไม่พอสำหรับตัด stock กรุณาโหลดข้อมูลใหม่')
  }
  if (!consumedLines.length) {
    throw new WtoPendingOutError('ไม่พบ pending_out ที่พร้อมใช้สำหรับจำนวนที่ออกบิล')
  }

  await tx.stock_ledger.createMany({
    data: consumedLines.map((line) => ({
      branch_id: input.branchId,
      created_by: input.actor,
      date: input.billDate,
      lot_no: line.lotNo,
      movement_type: 'ขายออก',
      note: `WTO ${line.sourceDocNo}${line.sourceLineNo ? ` / รายการ ${line.sourceLineNo}` : ''}`,
      notes: `ตัด stock จาก pending_out ${line.pendingOutKey}`,
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
  for (const update of holdUpdates) {
    if (update.remainingQty <= 0.0001) {
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
          id: update.hold.id,
          status: 'active',
        },
      })
      if (consumed.count !== 1) {
        throw new WtoPendingOutError('pending_out ของใบส่งของนี้ถูกใช้งานไปแล้ว กรุณาโหลดข้อมูลใหม่')
      }
      continue
    }

    const reduced = await tx.stock_holds.updateMany({
      data: {
        qty: update.remainingQty,
        updated_at: now,
        updated_by: input.actor,
      },
      where: {
        id: update.hold.id,
        status: 'active',
      },
    })
    if (reduced.count !== 1) {
      throw new WtoPendingOutError('pending_out ของใบส่งของนี้ถูกใช้งานไปแล้ว กรุณาโหลดข้อมูลใหม่')
    }
    await tx.stock_holds.create({
      data: {
        branch_id: update.hold.branch_id,
        consumed_at: now,
        consumed_by: input.actor,
        consumed_by_ref_no: input.salesBillDocNo,
        consumed_by_ref_type: 'SB',
        created_at: now,
        created_by: input.actor,
        held_at: update.hold.held_at,
        lot_no: update.hold.lot_no,
        meta: update.hold.meta ?? undefined,
        not_available_for_sale: update.hold.not_available_for_sale,
        note: update.hold.note,
        output_category: update.hold.output_category,
        product_id: update.hold.product_id,
        qty: update.consumedQty,
        unit_cost_snapshot: update.hold.unit_cost_snapshot,
        value_snapshot: update.hold.unit_cost_snapshot == null ? null : update.consumedQty * toNumber(update.hold.unit_cost_snapshot),
        cost_snapshot_at: update.hold.cost_snapshot_at,
        cost_snapshot_source: update.hold.cost_snapshot_source,
        cost_snapshot_note: update.hold.cost_snapshot_note,
        source_doc_no: update.hold.source_doc_no,
        source_line_no: update.hold.source_line_no,
        source_type: update.hold.source_type,
        status: 'consumed',
        updated_at: now,
        updated_by: input.actor,
        warehouse_id: update.hold.warehouse_id,
        weight_ticket_id: update.hold.weight_ticket_id,
        weight_ticket_line_id: update.hold.weight_ticket_line_id,
      },
    })
  }

  return consumedLines
}

export async function reopenConsumedWtoPendingOutForSalesBill(tx: TxClient, input: {
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
    throw new WtoPendingOutError('บิลขายนี้ถูก reverse stock ledger แล้ว')
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
    throw new WtoPendingOutError('ไม่พบ stock ledger ของบิลขายนี้สำหรับทำ reversal')
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
      qty_out: toNumber(row.qty_in),
      ref_id: input.salesBillDocNo,
      ref_no: input.salesBillDocNo,
      ref_type: 'SB-CANCEL',
      sales_channel_id: row.sales_channel_id,
      unit_cost: row.unit_cost,
      value_in: toNumber(row.value_out),
      value_out: toNumber(row.value_in),
      warehouse_id: row.warehouse_id,
    })),
  })

  const hasReturnFromSalesBill = await tx.weight_ticket_usage_logs.findFirst({
    select: { id: true },
    where: {
      action: { in: ['returned_from_sales_bill', 'loss_from_sales_bill'] },
      target_doc_no: input.salesBillDocNo,
      target_type: 'SALES_BILL',
    },
  })
  if (hasReturnFromSalesBill) {
    return []
  }

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
    throw new WtoPendingOutError('ไม่พบ pending_out ที่ถูกใช้โดยบิลขายนี้')
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
    throw new WtoPendingOutError('pending_out ของบิลขายนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
  }

  return holds
}

export async function releaseConsumedWtoPendingOutForSalesBill(tx: TxClient, input: {
  actor: string
  allocations: Array<{ productId: bigint; qty: number }>
  billDate: Date
  branchId: bigint
  note?: string | null
  salesBillDocNo: string
  salesChannelId?: bigint | null
  weightTicketId: bigint
}) {
  const requestedByProductId = new Map<bigint, number>()
  input.allocations.forEach((allocation) => {
    if (allocation.qty <= 0.0001) return
    requestedByProductId.set(allocation.productId, (requestedByProductId.get(allocation.productId) ?? 0) + allocation.qty)
  })
  if (requestedByProductId.size === 0) return [] as ReleasedWtoPendingOutLine[]

  const holds = await tx.stock_holds.findMany({
    orderBy: [{ source_line_no: 'desc' }, { id: 'desc' }],
    where: {
      consumed_by_ref_no: input.salesBillDocNo,
      consumed_by_ref_type: 'SB',
      product_id: { in: [...requestedByProductId.keys()] },
      status: 'consumed',
      weight_ticket_id: input.weightTicketId,
    },
  })
  if (!holds.length) {
    throw new WtoPendingOutError('ไม่พบ pending_out ที่บิลขายนี้เคยตัดไว้สำหรับคืน stock')
  }

  const releasedLines: ReleasedWtoPendingOutLine[] = []
  const now = new Date()

  for (const hold of holds) {
    const requestedQty = requestedByProductId.get(hold.product_id) ?? 0
    if (requestedQty <= 0.0001) continue

    const holdQty = toNumber(hold.qty)
    const releaseQty = Math.min(holdQty, requestedQty)
    if (hold.unit_cost_snapshot == null) {
      throw new WtoPendingOutError(`pending_out ${hold.hold_key} ยังไม่มีราคาต้นทุนเฉลี่ยที่บันทึกไว้ ไม่สามารถคืน stock จากการแก้ไขบิลขายได้`)
    }
    const unitCost = toNumber(hold.unit_cost_snapshot)

    releasedLines.push({
      pendingOutKey: hold.hold_key,
      lotNo: hold.lot_no,
      notAvailableForSale: hold.not_available_for_sale,
      outputCategory: hold.output_category,
      productId: hold.product_id,
      qty: releaseQty,
      sourceDocNo: hold.source_doc_no,
      sourceLineNo: hold.source_line_no,
      unitCost,
      valueIn: releaseQty * unitCost,
      warehouseId: hold.warehouse_id,
      weightTicketId: hold.weight_ticket_id,
      weightTicketLineId: hold.weight_ticket_line_id,
    })

    if (releaseQty >= holdQty - 0.0001) {
      const reopened = await tx.stock_holds.updateMany({
        data: {
          consumed_at: null,
          consumed_by: null,
          consumed_by_ref_no: null,
          consumed_by_ref_type: null,
          note: input.note ?? null,
          status: 'active',
          updated_at: now,
          updated_by: input.actor,
        },
        where: {
          id: hold.id,
          status: 'consumed',
        },
      })
      if (reopened.count !== 1) {
        throw new WtoPendingOutError('pending_out ของบิลขายนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
      }
    } else {
      const reduced = await tx.stock_holds.updateMany({
        data: {
          qty: Number((holdQty - releaseQty).toFixed(2)),
          updated_at: now,
          updated_by: input.actor,
        },
        where: {
          id: hold.id,
          status: 'consumed',
        },
      })
      if (reduced.count !== 1) {
        throw new WtoPendingOutError('pending_out ของบิลขายนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
      }

      await tx.stock_holds.create({
        data: {
          branch_id: hold.branch_id,
          created_at: now,
          created_by: input.actor,
          held_at: hold.held_at,
          lot_no: hold.lot_no,
          meta: hold.meta ?? undefined,
          not_available_for_sale: hold.not_available_for_sale,
          note: input.note ?? null,
          output_category: hold.output_category,
          product_id: hold.product_id,
          qty: releaseQty,
          unit_cost_snapshot: hold.unit_cost_snapshot,
          value_snapshot: hold.unit_cost_snapshot == null ? null : releaseQty * toNumber(hold.unit_cost_snapshot),
          cost_snapshot_at: hold.cost_snapshot_at,
          cost_snapshot_source: hold.cost_snapshot_source,
          cost_snapshot_note: hold.cost_snapshot_note,
          source_doc_no: hold.source_doc_no,
          source_line_no: hold.source_line_no,
          source_type: hold.source_type,
          status: 'active',
          updated_at: now,
          updated_by: input.actor,
          warehouse_id: hold.warehouse_id,
          weight_ticket_id: hold.weight_ticket_id,
          weight_ticket_line_id: hold.weight_ticket_line_id,
        },
      })
    }

    requestedByProductId.set(hold.product_id, Math.max(0, requestedQty - releaseQty))
  }

  const missingProducts = [...requestedByProductId.entries()].filter(([, qty]) => qty > 0.0001)
  if (missingProducts.length) {
    throw new WtoPendingOutError('จำนวน stock ที่ต้องคืนมากกว่าจำนวนที่บิลขายนี้เคยตัดไว้ กรุณาโหลดข้อมูลใหม่')
  }

  await tx.stock_ledger.createMany({
    data: releasedLines.map((line) => ({
      branch_id: input.branchId,
      created_by: input.actor,
      date: input.billDate,
      lot_no: line.lotNo,
      movement_type: 'แก้ไขบิลขายคืนสต๊อก',
      note: input.note ?? `คืน stock จากการแก้ไขบิลขาย ${input.salesBillDocNo}`,
      notes: `คืน stock จาก pending_out ${line.pendingOutKey}`,
      not_available_for_sale: line.notAvailableForSale,
      output_category: line.outputCategory,
      product_id: line.productId,
      qty_in: line.qty,
      qty_out: 0,
      ref_id: input.salesBillDocNo,
      ref_no: input.salesBillDocNo,
      ref_type: 'SB',
      sales_channel_id: input.salesChannelId ?? null,
      unit_cost: line.unitCost,
      value_in: line.valueIn,
      value_out: 0,
      warehouse_id: line.warehouseId,
    })),
  })

  return releasedLines
}

export async function closeActiveWtoPendingOutForSalesBillReturn(tx: TxClient, input: {
  actor: string
  pendingOutKey: string
  note?: string | null
  reason?: string | null
  returnDate: Date
  returnedQty: number
  salesBillDocNo: string
  salesChannelId?: bigint | null
}) {
  const hold = await tx.stock_holds.findFirst({
    include: {
      products: { select: { code: true, id: true, name: true } },
      weight_tickets: { select: { doc_no: true, doc_type: true, id: true } },
    },
    where: {
      hold_key: input.pendingOutKey,
      source_type: 'WTO',
      status: 'active',
    },
  })
  if (!hold) {
    throw new WtoPendingOutError('ไม่พบ pending_out ที่พร้อมรับคืน กรุณาโหลดข้อมูลใหม่')
  }
  if (hold.weight_tickets.doc_type !== 'WTO') {
    throw new WtoPendingOutError('รับคืนได้เฉพาะ pending_out จากใบส่งของ WTO')
  }

  const pendingQty = toNumber(hold.qty)
  const returnedQty = Number(input.returnedQty.toFixed(2))
  if (pendingQty <= 0.0001) {
    throw new WtoPendingOutError('pending_out นี้ไม่มีจำนวนคงเหลือให้รับคืน')
  }
  if (returnedQty < -0.0001) {
    throw new WtoPendingOutError('น้ำหนักรับคืนต้องไม่ติดลบ')
  }
  if (returnedQty > pendingQty + 0.0001) {
    throw new WtoPendingOutError(`น้ำหนักรับคืนเกิน pending_out (${pendingQty.toLocaleString('th-TH', { maximumFractionDigits: 2 })} กก.)`)
  }

  const normalizedReturnedQty = Math.max(0, Math.min(pendingQty, returnedQty))
  const lossQty = Number(Math.max(0, pendingQty - normalizedReturnedQty).toFixed(2))
  if (lossQty > 0.0001 && !input.reason?.trim()) {
    throw new WtoPendingOutError('น้ำหนักรับคืนไม่เท่ากับ pending_out ต้องกรอกเหตุผลส่วนต่างก่อนบันทึก', {
      reason: ['กรอกเหตุผลส่วนต่าง'],
    })
  }

  const now = new Date()
  let lossUnitCost = 0
  let lossValueOut = 0
  let lossPendingOutKey: string | null = null
  if (lossQty > 0.0001) {
    if (hold.unit_cost_snapshot == null) {
      throw new WtoPendingOutError(`pending_out ${hold.hold_key} ยังไม่มีราคาต้นทุนเฉลี่ยที่บันทึกไว้ ไม่สามารถบันทึกของขาดได้`)
    }
    lossUnitCost = toNumber(hold.unit_cost_snapshot)
    lossValueOut = lossQty * lossUnitCost
  }

  if (normalizedReturnedQty > 0.0001 && lossQty > 0.0001) {
    const released = await tx.stock_holds.updateMany({
      data: {
        note: input.note ?? null,
        qty: normalizedReturnedQty,
        release_reason: 'sales_bill_stock_return',
        released_at: now,
        released_by: input.actor,
        status: 'released',
        updated_at: now,
        updated_by: input.actor,
      },
      where: { id: hold.id, status: 'active' },
    })
    if (released.count !== 1) {
      throw new WtoPendingOutError('pending_out นี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
    }
    const lostHold = await tx.stock_holds.create({
      data: {
        branch_id: hold.branch_id,
        created_at: now,
        created_by: input.actor,
        held_at: hold.held_at,
        lot_no: hold.lot_no,
        meta: hold.meta ?? undefined,
        not_available_for_sale: hold.not_available_for_sale,
        note: input.reason ?? input.note ?? null,
        output_category: hold.output_category,
        product_id: hold.product_id,
        qty: lossQty,
        release_reason: 'sales_bill_stock_return_loss',
        released_at: now,
        released_by: input.actor,
        source_doc_no: hold.source_doc_no,
        source_line_no: hold.source_line_no,
        source_type: hold.source_type,
        status: 'lost',
        updated_at: now,
        updated_by: input.actor,
        warehouse_id: hold.warehouse_id,
        weight_ticket_id: hold.weight_ticket_id,
        weight_ticket_line_id: hold.weight_ticket_line_id,
      },
      select: { hold_key: true },
    })
    lossPendingOutKey = lostHold.hold_key
  } else {
    const status = lossQty > 0.0001 ? 'lost' : 'released'
    const closed = await tx.stock_holds.updateMany({
      data: {
        note: lossQty > 0.0001 ? input.reason ?? input.note ?? null : input.note ?? null,
        release_reason: lossQty > 0.0001 ? 'sales_bill_stock_return_loss' : 'sales_bill_stock_return',
        released_at: now,
        released_by: input.actor,
        status,
        updated_at: now,
        updated_by: input.actor,
      },
      where: { id: hold.id, status: 'active' },
    })
    if (closed.count !== 1) {
      throw new WtoPendingOutError('pending_out นี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดข้อมูลใหม่')
    }
  }

  if (lossQty > 0.0001) {
    await tx.stock_ledger.create({
      data: {
        branch_id: hold.branch_id,
        created_by: input.actor,
        date: input.returnDate,
        lot_no: hold.lot_no,
        movement_type: 'ของขาดจากรับคืน WTO',
        note: input.reason ?? `รับคืน WTO ${hold.source_doc_no} ไม่ครบ`,
        notes: `ปิด pending_out ${hold.hold_key} จาก SB ${input.salesBillDocNo}`,
        not_available_for_sale: hold.not_available_for_sale,
        output_category: hold.output_category,
        product_id: hold.product_id,
        qty_in: 0,
        qty_out: lossQty,
        ref_id: input.salesBillDocNo,
        ref_no: input.salesBillDocNo,
        ref_type: 'WTO-RETURN-LOSS',
        return_reason: input.reason ?? null,
        sales_channel_id: input.salesChannelId ?? null,
        unit_cost: lossUnitCost,
        value_in: 0,
        value_out: lossValueOut,
        warehouse_id: hold.warehouse_id,
      },
    })
  }

  return {
    branchId: hold.branch_id,
    pendingOutKey: hold.hold_key,
    lossPendingOutKey,
    lossQty,
    lossUnitCost,
    lossValueOut,
    pendingQty,
    productCode: hold.products.code,
    productId: hold.product_id,
    productName: hold.products.name,
    returnedQty: normalizedReturnedQty,
    sourceDocNo: hold.source_doc_no,
    sourceLineNo: hold.source_line_no,
    warehouseId: hold.warehouse_id,
    weightTicketId: hold.weight_ticket_id,
    weightTicketLineId: hold.weight_ticket_line_id,
  } satisfies ReturnedWtoPendingOutResult
}
