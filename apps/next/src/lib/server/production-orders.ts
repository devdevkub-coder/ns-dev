import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { z } from 'zod'
import { requireBusinessCode } from '@/lib/business-code'
import { normalizeDate, toBangkokDateOnly, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveBranches, listActiveBranchesByCodes, listActiveProductReferences, listActiveProductionLines, listActiveProductionMachines, listActiveWarehouses, listActiveWarehousesByBranch } from '@/lib/server/reference-master-cache'

type DbClient = Prisma.TransactionClient | typeof prisma

export class ProductionOrderError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ProductionOrderError'
    this.status = status
  }
}

const codeSchema = z.string().trim().min(1).transform((value) => value.toUpperCase())
const qtySchema = z.coerce.number().finite('จำนวนต้องเป็นตัวเลขที่ถูกต้อง').positive('จำนวนต้องมากกว่า 0')
const nonNegativeQtySchema = z.coerce.number().finite('จำนวนต้องเป็นตัวเลขที่ถูกต้อง').min(0, 'จำนวนต้องไม่ติดลบ')

export const createProductionOrderSchema = z.object({
  branchCode: codeSchema,
  destinationWarehouseCode: codeSchema,
  machineCode: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  productionLineCode: z.string().trim().max(120).optional(),
  shift: z.string().trim().min(1, 'เลือกกะการผลิต').max(80),
  targetProductCode: codeSchema,
})

export const updateProductionOrderActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete'),
    confirmCloseWithWip: z.boolean().optional().default(false),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('cancel'),
    reason: z.string().trim().min(1, 'ระบุเหตุผลการยกเลิก').max(1000),
  }),
])

export const createProductionInputSchema = z.object({
  lines: z.array(z.object({
    lotNo: z.string().trim().max(80).optional(),
    netQty: qtySchema,
    productCode: codeSchema,
    sourceWarehouseCode: codeSchema,
    stockStatus: z.enum(['RM', 'FG']),
  })).min(1, 'ต้องมีวัตถุดิบอย่างน้อย 1 รายการ'),
})

export const reverseProductionInputSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  reason: z.string().trim().min(1, 'ระบุเหตุผลการ reverse').max(1000),
})

export const returnProductionInputSchema = z.object({
  lines: z.array(z.object({
    inputId: z.string().trim().regex(/^\d+$/, 'รายการวัตถุดิบไม่ถูกต้อง').transform((value) => BigInt(value)),
    qty: qtySchema,
  })).min(1, 'ต้องเลือกรายการวัตถุดิบที่ต้องการคืนอย่างน้อย 1 รายการ'),
  reason: z.string().trim().min(1, 'ระบุเหตุผลการคืนวัตถุดิบ').max(1000),
})

export const createProductionOutputSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  lines: z.array(z.object({
    categoryCode: z.enum(['FG', 'RM']),
    destinationWarehouseCode: codeSchema,
    lotNo: z.string().trim().max(80).optional(),
    netQty: qtySchema,
    productCode: codeSchema,
    sourceWipQty: qtySchema.optional(),
  })).default([]),
  lossQty: nonNegativeQtySchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  confirmQuantityVariance: z.boolean().optional(),
  sourceWipLines: z.array(z.object({
    productCode: codeSchema,
    qty: qtySchema,
    stockCategory: z.enum(['RM', 'FG']),
    sourceWarehouseCode: codeSchema,
  })).min(1, 'ต้องเลือกวัตถุดิบใน WIP อย่างน้อย 1 รายการ').optional(),
  sourceWipQty: qtySchema.optional(),
  sourceProductCode: codeSchema.optional(),
  sourceStockCategory: z.enum(['RM', 'FG']).optional(),
  sourceWarehouseCode: codeSchema.optional(),
}).refine((value) => value.lines.length > 0 || toNumber(value.lossQty) > 0, {
  message: 'ต้องมีผลผลิตหรือ loss อย่างน้อย 1 รายการ',
  path: ['lines'],
}).superRefine((value, context) => {
  const lines = value.sourceWipLines ?? []
  const seen = new Set<string>()
  for (const [index, line] of lines.entries()) {
    const key = `${line.productCode}|${line.stockCategory}|${line.sourceWarehouseCode}`
    if (seen.has(key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'วัตถุดิบใน WIP แหล่งเดียวกันซ้ำกันไม่ได้', path: ['sourceWipLines', index] })
    }
    seen.add(key)
  }
})

const productionOutputDraftLineSchema = z.object({
  categoryCode: z.enum(['FG', 'RM']),
  destinationWarehouseCode: z.string().trim().max(80),
  id: z.string().trim().min(1).max(160),
  lotNo: z.string().trim().max(80),
  lossQty: nonNegativeQtySchema,
  netQty: nonNegativeQtySchema,
  productCode: z.string().trim().max(80),
})
const productionOutputWipDraftSchema = z.object({
  id: z.string().trim().min(1).max(160),
  qty: qtySchema,
  sourceKey: z.string().trim().min(1).max(240),
})
export const productionOutputDraftSchema = z.object({
  outputDrafts: z.array(productionOutputDraftLineSchema).max(100),
  outputForm: z.object({ date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().trim().max(1000) }),
  outputWipDrafts: z.array(productionOutputWipDraftSchema).max(100),
})
export type ProductionOutputDraftPayload = z.infer<typeof productionOutputDraftSchema>

export async function getProductionOutputDraft(orderDocNo: string) {
  const order = await findOrderByDocNo(prisma, orderDocNo)
  const draft = await prisma.production_output_drafts.findUnique({ where: { order_id: order.id } })
  if (!draft) return null
  return { ...productionOutputDraftSchema.parse(draft.payload), updatedAt: draft.updated_at }
}

export async function saveProductionOutputDraft(orderDocNo: string, values: ProductionOutputDraftPayload, actor: string) {
  const order = await findOrderByDocNo(prisma, orderDocNo)
  const payload = productionOutputDraftSchema.parse(values)
  if (payload.outputWipDrafts.length > 0) {
    if (!order.branch_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา ไม่สามารถตรวจสอบ WIP ของร่างผลผลิตได้')
    const wipGroups = await productionWipGroupCosts(prisma, order.id)
    const stagedByGroup = new Map<string, number>()
    for (const draft of payload.outputWipDrafts) {
      const [productCode, stockCategory, ...warehouseNameParts] = draft.sourceKey.split('|')
      const warehouseName = warehouseNameParts.join('|')
      if (!productCode || !['RM', 'FG'].includes(stockCategory) || !warehouseName) throw new ProductionOrderError('แหล่งวัตถุดิบ WIP ในร่างผลผลิตไม่ถูกต้อง')
      const [product, warehouses] = await Promise.all([
        findActiveProductByCode(prisma, productCode),
        prisma.warehouses.findMany({ select: { id: true, name: true }, where: { active: true, branch_id: order.branch_id, name: warehouseName } }),
      ])
      if (warehouses.length !== 1) throw new ProductionOrderError(`ไม่พบคลังต้นทางของวัตถุดิบ WIP ${warehouseName}`)
      const groupKey = productionWipGroupKey(product.id, stockCategory, warehouses[0].id)
      stagedByGroup.set(groupKey, (stagedByGroup.get(groupKey) ?? 0) + draft.qty)
    }
    for (const [groupKey, stagedQty] of stagedByGroup) {
      const availableQty = wipGroups.get(groupKey)?.qty ?? 0
      if (stagedQty > availableQty + 0.000001) throw new ProductionOrderError('ร่างผลผลิตใช้ WIP เกินคงเหลือปัจจุบัน กรุณาโหลดข้อมูลใหม่')
    }
  }
  const draft = await prisma.production_output_drafts.upsert({
    where: { order_id: order.id },
    create: { order_id: order.id, payload, created_by: actor, updated_by: actor },
    update: { payload, updated_at: new Date(), updated_by: actor },
    select: { updated_at: true },
  })
  return { saved: true, updatedAt: draft.updated_at }
}

export async function deleteProductionOutputDraft(orderDocNo: string) {
  const order = await findOrderByDocNo(prisma, orderDocNo)
  await prisma.production_output_drafts.deleteMany({ where: { order_id: order.id } })
  return { deleted: true }
}

export const reverseProductionOutputSchema = reverseProductionInputSchema

export type CreateProductionOrderValues = z.infer<typeof createProductionOrderSchema>
export type CreateProductionInputValues = z.infer<typeof createProductionInputSchema>
export type CreateProductionOutputValues = z.infer<typeof createProductionOutputSchema>
export type ReverseProductionMovementValues = z.infer<typeof reverseProductionInputSchema>
export type ReturnProductionInputValues = z.infer<typeof returnProductionInputSchema>

function compactPeriod(date: string) {
  return date.slice(2, 4) + date.slice(5, 7)
}

async function nextDocNo(
  tx: Prisma.TransactionClient,
  tableName: 'production_orders' | 'production_inputs' | 'production_outputs',
  prefix: 'PO' | 'PI' | 'PO2' | 'PI-REV' | 'PO2-REV',
  date: string,
  branchCode?: string,
) {
  const isBranchScoped = prefix === 'PO' || prefix === 'PI'
  const branchSegment = isBranchScoped ? String(branchCode ?? '').trim() : ''
  if (isBranchScoped && !branchSegment) throw new ProductionOrderError(`ไม่พบรหัสสาขาสำหรับสร้างเลขที่เอกสาร ${prefix}`)
  const startsWith = `${prefix}${branchSegment}${compactPeriod(date)}-`
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`production.${startsWith}.doc_no`}))`
  const docNoColumn = prefix.endsWith('-REV') ? 'reversal_doc_no' : 'doc_no'
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select ${Prisma.raw(docNoColumn)} as doc_no
    from ${Prisma.raw(`public.${tableName}`)}
    where ${Prisma.raw(docNoColumn)} like ${`${startsWith}%`}
  `
  const lastNumber = rows.reduce((max: number, row: { doc_no: string }) => {
    const running = Number(String(row.doc_no).split('-').at(-1))
    return Number.isFinite(running) && running > max ? running : max
  }, 0)
  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
}

async function findActiveBranchByCode(tx: DbClient, code: string) {
  const branch = await tx.branches.findFirst({ select: { code: true, id: true, name: true }, where: { active: true, code } })
  if (!branch) throw new ProductionOrderError(`ไม่พบสาขา ${code}`)
  return branch
}

async function findActiveWarehouseByCode(tx: DbClient, code: string, branchId?: bigint) {
  const warehouse = await tx.warehouses.findFirst({
    select: { branch_id: true, code: true, id: true, name: true, type: true },
    where: { active: true, code },
  })
  if (!warehouse) throw new ProductionOrderError(`ไม่พบคลัง ${code}`)
  if (branchId != null && warehouse.branch_id !== branchId) throw new ProductionOrderError(`คลัง ${code} ไม่อยู่ในสาขาที่เลือก`)
  return warehouse
}

async function findBranchWipWarehouse(tx: DbClient, branchId: bigint) {
  const warehouses = await tx.warehouses.findMany({
    select: { branch_id: true, code: true, id: true, name: true, type: true },
    where: { active: true, branch_id: branchId, type: { equals: 'WIP', mode: 'insensitive' } },
  })
  if (warehouses.length === 0) throw new ProductionOrderError('สาขานี้ยังไม่ได้ตั้งค่าคลัง WIP')
  if (warehouses.length > 1) throw new ProductionOrderError('สาขานี้มีคลัง WIP มากกว่า 1 แห่ง กรุณาตั้งค่าให้เหลือ 1 แห่ง')
  return warehouses[0]
}

async function findActiveProductByCode(tx: DbClient, code: string) {
  const product = await tx.products.findFirst({ select: { code: true, id: true, name: true, metal_group: true }, where: { active: true, code } })
  if (!product) throw new ProductionOrderError(`ไม่พบสินค้า ${code}`)
  requireBusinessCode(product.code, `สินค้า ${product.id}`)
  return product
}

async function findMachineByCode(tx: DbClient, code: string | undefined, branchId: bigint) {
  if (!code) return null
  const machine = await tx.production_machines.findFirst({
    select: { id: true, name: true, type: true },
    where: { active: true, name: { equals: code, mode: 'insensitive' }, OR: [{ branch_id: null }, { branch_id: branchId }] },
  })
  if (!machine) throw new ProductionOrderError(`ไม่พบเครื่องจักร ${code}`)
  return machine
}

async function findProductionLineByCode(tx: DbClient, code: string | undefined, branchId: bigint) {
  if (!code) return null
  const line = await tx.production_lines.findFirst({
    select: { id: true, name: true },
    where: { active: true, name: { equals: code, mode: 'insensitive' }, OR: [{ branch_id: null }, { branch_id: branchId }] },
  })
  if (!line) throw new ProductionOrderError(`ไม่พบไลน์ผลิต ${code}`)
  return line
}

async function findOrderByDocNo(tx: DbClient, docNo: string) {
  const order = await tx.production_orders.findFirst({
    where: { doc_no: docNo },
  })
  if (!order) throw new ProductionOrderError(`ไม่พบใบสั่งผลิต ${docNo}`, 404)
  return order
}

export async function assertProductionOrderBranchAccess(docNo: string, allowedBranchCodes: string[] | null) {
  const order = await prisma.production_orders.findFirst({
    select: { branches: { select: { code: true } }, doc_no: true },
    where: { doc_no: docNo },
  })
  if (!order) throw new ProductionOrderError(`ไม่พบใบสั่งผลิต ${docNo}`, 404)
  if (allowedBranchCodes && !allowedBranchCodes.includes(order.branches?.code ?? '')) {
    throw new ProductionOrderError('ไม่มีสิทธิ์เข้าถึงใบสั่งผลิตสาขานี้', 403)
  }
  return order
}

function isGracePeriodActive(order: { status: string | null; closed_at: Date | null }) {
  if (order.status !== 'Completed' || !order.closed_at) return false
  const closedTime = new Date(order.closed_at).getTime()
  const now = Date.now()
  const diffTime = now - closedTime
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  return diffDays <= 7
}

export async function productionWipBalance(tx: DbClient, orderId: bigint) {
  const [input, output] = await Promise.all([
    tx.production_inputs.findMany({
      where: { order_id: orderId, status: 'active' },
      select: {
        qty: true,
        total_cost: true,
        production_input_returns: {
          where: { status: 'active' },
          select: { qty: true, total_cost: true },
        },
      },
    }),
    tx.production_outputs.aggregate({
      _sum: { source_wip_qty: true, qty: true },
      where: { order_id: orderId, status: 'active' },
    }),
  ])
  const inputQty = input.reduce((sum, row) => {
    const returnedQty = row.production_input_returns.reduce((subtotal, returned) => subtotal + toNumber(returned.qty), 0)
    return sum + Math.max(0, toNumber(row.qty) - returnedQty)
  }, 0)
  const inputCost = input.reduce((sum, row) => {
    const returnedCost = row.production_input_returns.reduce((subtotal, returned) => subtotal + toNumber(returned.total_cost), 0)
    return sum + Math.max(0, toNumber(row.total_cost) - returnedCost)
  }, 0)
  const consumedWipQty = toNumber(output._sum.source_wip_qty)
  return {
    consumedWipQty,
    inputCost,
    inputQty,
    outputQty: toNumber(output._sum.qty),
    wipQty: inputQty - consumedWipQty,
  }
}

type ProductionWipGroupCost = { qty: number; value: number }

function productionWipGroupKey(productId: bigint | string, stockCategory: string, warehouseId: bigint | string) {
  return `${productId.toString()}|${stockCategory}|${warehouseId.toString()}`
}

async function productionWipGroupCosts(tx: DbClient, orderId: bigint) {
  const [inputs, outputs, warehouses] = await Promise.all([
    tx.production_inputs.findMany({
      select: {
        product_id: true,
        qty: true,
        source_warehouse_id: true,
        stock_category: true,
        total_cost: true,
        production_input_returns: { where: { status: 'active' }, select: { qty: true, total_cost: true } },
      },
      where: { order_id: orderId, status: 'active' },
    }),
    tx.production_outputs.findMany({
      select: { source_wip_qty: true, source_wip_allocations: true, source_product_id: true, source_stock_category: true, source_warehouse_id: true, unit_cost: true },
      where: { order_id: orderId, status: 'active' },
    }),
    tx.warehouses.findMany({ select: { code: true, id: true } }),
  ])
  const warehouseIdByCode = new Map(warehouses.map((warehouse) => [warehouse.code, warehouse.id]))
  const groups = new Map<string, ProductionWipGroupCost>()
  const add = (key: string, qty: number, value: number) => {
    const current = groups.get(key) ?? { qty: 0, value: 0 }
    current.qty += qty
    current.value += value
    groups.set(key, current)
  }

  for (const input of inputs) {
    if (!input.product_id || !input.source_warehouse_id || (input.stock_category !== 'RM' && input.stock_category !== 'FG')) continue
    const returnedQty = input.production_input_returns.reduce((sum, row) => sum + toNumber(row.qty), 0)
    const returnedValue = input.production_input_returns.reduce((sum, row) => sum + toNumber(row.total_cost), 0)
    add(
      productionWipGroupKey(input.product_id, input.stock_category, input.source_warehouse_id),
      Math.max(0, toNumber(input.qty) - returnedQty),
      Math.max(0, toNumber(input.total_cost) - returnedValue),
    )
  }

  for (const output of outputs) {
    if (Array.isArray(output.source_wip_allocations)) {
      for (const allocation of output.source_wip_allocations as unknown[]) {
        if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) continue
        const item = allocation as { productId?: string; stockCategory?: string; warehouseCode?: string; qty?: number; totalCost?: number; unitCost?: number }
        const warehouseId = item.warehouseCode ? warehouseIdByCode.get(item.warehouseCode) : undefined
        if (!item.productId || !warehouseId || (item.stockCategory !== 'RM' && item.stockCategory !== 'FG')) continue
        const qty = Number(item.qty ?? 0)
        const unitCost = Number(item.unitCost ?? 0)
        const value = typeof item.totalCost === 'number' ? item.totalCost : qty * unitCost
        add(productionWipGroupKey(item.productId, item.stockCategory, warehouseId), -qty, -value)
      }
      continue
    }
    if (output.source_product_id && output.source_stock_category && output.source_warehouse_id) {
      const qty = toNumber(output.source_wip_qty)
      add(productionWipGroupKey(output.source_product_id, output.source_stock_category, output.source_warehouse_id), -qty, -(qty * toNumber(output.unit_cost)))
    }
  }
  return groups
}

async function appendOrderStatusLog(tx: Prisma.TransactionClient, input: {
  action: string
  actor: string
  fromStatus?: string | null
  meta?: Prisma.InputJsonValue
  note?: string | null
  orderDocNo: string
  orderId: bigint
  toStatus: string
}) {
  await tx.production_order_status_logs.create({
    data: {
      action: input.action,
      created_by: input.actor,
      event_key: `POSTATUS-${input.orderDocNo}-${randomUUID()}`,
      from_status: input.fromStatus ?? null,
      meta: input.meta ?? undefined,
      note: input.note ?? null,
      order_doc_no: input.orderDocNo,
      order_id: input.orderId,
      to_status: input.toStatus,
    },
  })
}

export async function createProductionOrder(values: CreateProductionOrderValues, actor: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const createdAt = new Date()
    const postingDate = toBangkokDateOnly(createdAt)
    const [branch, product] = await Promise.all([
      findActiveBranchByCode(tx, values.branchCode),
      findActiveProductByCode(tx, values.targetProductCode),
    ])
    const [destinationWarehouse, machine, line, wipWarehouse] = await Promise.all([
      findActiveWarehouseByCode(tx, values.destinationWarehouseCode, branch.id),
      findMachineByCode(tx, values.machineCode, branch.id),
      findProductionLineByCode(tx, values.productionLineCode, branch.id),
      findBranchWipWarehouse(tx, branch.id),
    ])
    if (destinationWarehouse.type?.toUpperCase() === 'WIP') throw new ProductionOrderError(`คลัง ${values.destinationWarehouseCode} ต้องเป็นคลังรับผลผลิต ไม่ใช่คลัง WIP`)
    const docNo = await nextDocNo(tx, 'production_orders', 'PO', postingDate, branch.code)
    const created = await tx.production_orders.create({
      data: {
        branch_id: branch.id,
        date: normalizeDate(postingDate),
        doc_no: docNo,
        machine_id: machine?.id ?? null,
        notes: values.notes ?? null,
        product_id: product.id,
        production_line_id: line?.id ?? null,
        production_type: null,
        shift: values.shift ?? null,
        status: 'Open',
        updated_by: actor,
        warehouse_id: destinationWarehouse.id,
        warehouse_to_id: destinationWarehouse.id,
        warehouse_wip_id: wipWarehouse.id,
        created_at: createdAt,
      },
    })
    await appendOrderStatusLog(tx, {
      action: 'created',
      actor,
      meta: {
        branchName: branch.name,
        destinationWarehouseName: destinationWarehouse.name,
        machineName: machine?.name ?? 'ไม่มีเครื่องจักร',
        productCode: product.code,
        productName: product.name,
        productionLineName: line?.name ?? 'ไม่มีไลน์ผลิต',
        shift: values.shift,
      },
      note: values.notes ?? null,
      orderDocNo: created.doc_no,
      orderId: created.id,
      toStatus: 'Open',
    })
    return { docNo: created.doc_no, id: created.doc_no, status: 'Open' }
  })
}

async function stockSnapshot(tx: DbClient, input: {
  branchId: bigint
  lotNo?: string | null
  productId: bigint
  status: 'RM' | 'FG'
  warehouseId: bigint
}) {
  const rows = await tx.stock_ledger.findMany({
    select: { qty_in: true, qty_out: true, value_in: true, value_out: true },
    where: {
      branch_id: input.branchId,
      lot_no: input.lotNo || null,
      OR: [
        { not_available_for_sale: false },
        { not_available_for_sale: null },
      ],
      output_category: input.status,
      product_id: input.productId,
      warehouse_id: input.warehouseId,
    },
  })
  const qty = rows.reduce((sum: number, row: (typeof rows)[number]) => sum + toNumber(row.qty_in) - toNumber(row.qty_out), 0)
  const value = rows.reduce((sum: number, row: (typeof rows)[number]) => sum + toNumber(row.value_in) - toNumber(row.value_out), 0)
  return { qty, unitCost: qty > 0 ? value / qty : 0, value }
}

async function lockProductionOrder(tx: Prisma.TransactionClient, orderId: bigint) {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`production.order.${orderId.toString()}`}))`
}

async function lockStockScope(tx: Prisma.TransactionClient, input: {
  branchId: bigint
  lotNo?: string | null
  productId: bigint
  status: string
  warehouseId: bigint
}) {
  const lot = input.lotNo ?? ''
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`stock.${input.branchId.toString()}.${input.warehouseId.toString()}.${input.productId.toString()}.${input.status}.${lot}`}))`
}

export async function createProductionInput(orderDocNo: string, values: CreateProductionInputValues, actor: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    await lockProductionOrder(tx, order.id)
    const isGrace = isGracePeriodActive(order)
    if (!['Open', 'In Production', 'Partially Completed'].includes(order.status ?? '') && !isGrace) {
      throw new ProductionOrderError('สถานะใบสั่งผลิตไม่อนุญาตให้เบิกวัตถุดิบ')
    }
    if (!order.branch_id || !order.warehouse_wip_id || !order.product_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา สินค้า หรือคลัง WIP ที่ครบถ้วน')
    const recordedAt = new Date()
    const postingDate = toBangkokDateOnly(recordedAt)
    const branch = await tx.branches.findUnique({ select: { code: true }, where: { id: order.branch_id } })
    const inputDocNo = await nextDocNo(tx, 'production_inputs', 'PI', postingDate, branch?.code)
    const createdInputs = []
    const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
    const sourceWarehouseNames = new Set<string>()
    const inputLineDetails: Array<{ productCode: string; productName: string; stockCategory: string; qty: number; unitCost: number; totalCost: number; warehouseName: string }> = []
    let totalCost = 0
    let totalQty = 0

    for (const line of values.lines) {
      const [product, sourceWarehouse] = await Promise.all([
        findActiveProductByCode(tx, line.productCode),
        findActiveWarehouseByCode(tx, line.sourceWarehouseCode, order.branch_id),
      ])
      const expectedStockCategory = sourceWarehouse.type?.toUpperCase() === 'FG' ? 'FG' : 'RM'
      sourceWarehouseNames.add(sourceWarehouse.name)
      if (line.stockStatus !== expectedStockCategory) {
        throw new ProductionOrderError(`ประเภทสินค้าไม่ตรงกับประเภทคลัง ${line.sourceWarehouseCode}`)
      }
      await lockStockScope(tx, {
        branchId: order.branch_id,
        lotNo: line.lotNo ?? null,
        productId: product.id,
        status: line.stockStatus,
        warehouseId: sourceWarehouse.id,
      })
      const stock = await stockSnapshot(tx, {
        branchId: order.branch_id,
        lotNo: line.lotNo ?? null,
        productId: product.id,
        status: line.stockStatus,
        warehouseId: sourceWarehouse.id,
      })
      if (stock.qty < line.netQty) throw new ProductionOrderError(`สินค้า ${line.productCode} ในคลัง ${line.sourceWarehouseCode} ไม่พอ`)
      if (!(stock.unitCost > 0)) throw new ProductionOrderError(`หา WAC ของสินค้า ${line.productCode} ไม่ได้`)
      const totalLineCost = line.netQty * stock.unitCost
      totalCost += totalLineCost
      totalQty += line.netQty
      inputLineDetails.push({
        productCode: product.code,
        productName: product.name,
        stockCategory: line.stockStatus,
        qty: line.netQty,
        unitCost: stock.unitCost,
        totalCost: totalLineCost,
        warehouseName: sourceWarehouse.name,
      })
      const created = await tx.production_inputs.create({
        data: {
          created_at: recordedAt,
          date: normalizeDate(postingDate),
          doc_no: inputDocNo,
          lot_no: line.lotNo ?? null,
          production_orders: { connect: { id: order.id } },
          products: { connect: { id: product.id } },
          qty: line.netQty,
          source: line.sourceWarehouseCode,
          stock_category: line.stockStatus,
          status: 'active',
          total_cost: totalLineCost,
          unit_cost: stock.unitCost,
          updated_by: actor,
          wac_unit_cost: stock.unitCost,
          warehouses_production_inputs_source_warehouse_idTowarehouses: { connect: { id: sourceWarehouse.id } },
          warehouses_production_inputs_wip_warehouse_idTowarehouses: { connect: { id: order.warehouse_wip_id } },
        },
      })
      createdInputs.push(created)
      ledgerRows.push(
        {
          branch_id: order.branch_id,
          created_by: actor,
          created_at: recordedAt,
          date: normalizeDate(postingDate),
          lot_no: line.lotNo ?? null,
          movement_type: 'PRODUCTION_INPUT_OUT',
          output_category: line.stockStatus,
          product_id: product.id,
          qty_out: line.netQty,
          ref_id: created.id.toString(),
          ref_no: inputDocNo,
          ref_type: 'PI',
          unit_cost: stock.unitCost,
          value_out: totalLineCost,
          warehouse_id: sourceWarehouse.id,
        },
        {
          branch_id: order.branch_id,
          created_by: actor,
          created_at: recordedAt,
          date: normalizeDate(postingDate),
          lot_no: line.lotNo ?? null,
          movement_type: 'WIP_IN',
          output_category: 'WIP',
          product_id: order.product_id,
          qty_in: line.netQty,
          ref_id: created.id.toString(),
          ref_no: inputDocNo,
          ref_type: 'PI',
          unit_cost: stock.unitCost,
          value_in: totalLineCost,
          warehouse_id: order.warehouse_wip_id,
        },
      )
    }

    await tx.stock_ledger.createMany({ data: ledgerRows })
    const nextStatus = order.status === 'Open' ? 'In Production' : order.status ?? 'In Production'
    await tx.production_orders.update({
      data: {
        status: nextStatus,
        total_input_cost: { increment: totalCost },
        updated_by: actor,
      },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: 'input_created',
      actor,
      fromStatus: order.status,
      meta: {
        averageCost: totalQty > 0 ? totalCost / totalQty : 0,
        inputDocNo,
        lines: inputLineDetails,
        sourceWarehouseNames: [...sourceWarehouseNames],
        totalCost,
        totalQty,
      },
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: nextStatus,
    })
    const wip = await productionWipBalance(tx, order.id)
    return { inputDocNo, ledgerRefs: ledgerRows.map((row) => row.ref_no).filter(Boolean), orderStatus: nextStatus, totalInputCost: totalCost, wipQty: wip.wipQty }
  })
}

export async function returnProductionInput(orderDocNo: string, values: ReturnProductionInputValues, actor: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    await lockProductionOrder(tx, order.id)
    const isGrace = isGracePeriodActive(order)
    if (['Completed', 'Cancelled'].includes(order.status ?? '') && (!isGrace || order.status === 'Cancelled')) {
      throw new ProductionOrderError('ใบสั่งผลิตปิดงานหรือยกเลิกแล้ว ไม่สามารถคืนวัตถุดิบได้')
    }
    if (!order.branch_id || !order.warehouse_wip_id || !order.product_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา สินค้า หรือคลัง WIP ที่ครบถ้วน')

    const inputIds = values.lines.map((line) => line.inputId)
    if (new Set(inputIds.map((id) => id.toString())).size !== inputIds.length) throw new ProductionOrderError('มีรายการวัตถุดิบซ้ำกันในคำขอคืน')
    const inputs = await tx.production_inputs.findMany({
      where: { id: { in: inputIds }, order_id: order.id, status: 'active' },
    })
    if (inputs.length !== inputIds.length) throw new ProductionOrderError('ไม่พบรายการวัตถุดิบที่คืนได้ หรือรายการไม่อยู่ในใบสั่งผลิตนี้', 404)
    const inputById = new Map(inputs.map((input) => [input.id.toString(), input]))
    const existingReturns = await tx.production_input_returns.groupBy({
      by: ['production_input_id'],
      where: { production_input_id: { in: inputIds }, status: 'active' },
      _sum: { qty: true },
    })
    const returnedByInputId = new Map(existingReturns.map((item) => [item.production_input_id.toString(), toNumber(item._sum.qty)]))

    const wip = await productionWipBalance(tx, order.id)
    const wipGroups = await productionWipGroupCosts(tx, order.id)
    const reverseQty = values.lines.reduce((sum, line) => sum + line.qty, 0)
    if (reverseQty > wip.wipQty + 0.000001) throw new ProductionOrderError('WIP ถูกใช้ไปแล้ว ไม่สามารถคืนวัตถุดิบชุดนี้ได้')

    const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
    const returnLineDetails: Array<{ productCode: string; productName: string; stockCategory: string; qty: number; unitCost: number; totalCost: number; warehouseName: string }> = []
    let reverseCost = 0

    for (const line of values.lines) {
      const input = inputById.get(line.inputId.toString())
      if (!input) throw new ProductionOrderError('ไม่พบรายการวัตถุดิบที่คืนได้', 404)
      if (!input.source_warehouse_id || !input.wip_warehouse_id || !input.product_id) {
        throw new ProductionOrderError(`รายการ ${input.doc_no} ไม่มีข้อมูลคลังหรือสินค้า ไม่สามารถคืนวัตถุดิบได้`)
      }
      const qty = line.qty
      const alreadyReturnedQty = returnedByInputId.get(input.id.toString()) ?? 0
      const returnableQty = toNumber(input.qty) - alreadyReturnedQty
      if (qty > returnableQty + 0.000001) throw new ProductionOrderError(`คืนรายการ ${input.doc_no} ได้ไม่เกิน ${returnableQty.toFixed(2)} กก.`)
      const stockCategory = input.stock_category
      if (stockCategory !== 'RM' && stockCategory !== 'FG') {
        throw new ProductionOrderError(`รายการ ${input.doc_no} ไม่มีประเภทสินค้าเดิม ไม่สามารถคืนวัตถุดิบได้`)
      }
      await lockStockScope(tx, {
        branchId: order.branch_id,
        lotNo: input.lot_no,
        productId: input.product_id,
        status: stockCategory,
        warehouseId: input.source_warehouse_id,
      })
      const wipGroup = input.product_id && input.source_warehouse_id
        ? wipGroups.get(productionWipGroupKey(input.product_id, stockCategory, input.source_warehouse_id))
        : undefined
      if (!wipGroup || wipGroup.qty <= 0.000001) throw new ProductionOrderError(`ไม่พบต้นทุนเฉลี่ย WIP ของรายการ ${input.doc_no} ที่ยังคืนได้`)
      const unitCost = wipGroup.value / wipGroup.qty
      const totalCost = qty * unitCost
      // The input lines are pooled in WIP. Return at the current WIP WAC because
      // the original source layer cannot be identified after pooling.
      const stockReceiptUnitCost = unitCost
      const stockReceiptTotalCost = totalCost
      reverseCost += totalCost
      const sourceWarehouse = await tx.warehouses.findUnique({ select: { name: true }, where: { id: input.source_warehouse_id } })
      const product = await tx.products.findUnique({ select: { code: true, name: true }, where: { id: input.product_id } })
      returnLineDetails.push({
        productCode: product?.code ?? '',
        productName: product?.name ?? '-',
        stockCategory,
        qty,
        unitCost,
        totalCost,
        warehouseName: sourceWarehouse?.name ?? '-',
      })
      const returned = await tx.production_input_returns.create({
        data: {
          created_by: actor,
          date: normalizeDate(toBangkokDateOnly(new Date())),
          order_id: order.id,
          production_input_id: input.id,
          qty,
          reason: values.reason,
          stock_receipt_total_cost: stockReceiptTotalCost,
          stock_receipt_unit_cost: stockReceiptUnitCost,
          total_cost: totalCost,
          unit_cost: unitCost,
          cost_variance: stockReceiptTotalCost - totalCost,
        },
      })
      ledgerRows.push(
        {
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(toBangkokDateOnly(new Date())),
          lot_no: input.lot_no,
          movement_type: 'PRODUCTION_INPUT_RETURN_WIP_OUT',
          notes: values.reason,
          output_category: 'WIP',
          product_id: order.product_id,
          qty_out: qty,
          ref_id: returned.id.toString(),
          ref_no: input.doc_no,
          ref_type: 'PI-RETURN',
          unit_cost: unitCost,
          value_out: totalCost,
          warehouse_id: input.wip_warehouse_id,
        },
        {
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(toBangkokDateOnly(new Date())),
          lot_no: input.lot_no,
          movement_type: 'PRODUCTION_INPUT_RETURN_STOCK_IN',
          notes: values.reason,
          output_category: stockCategory,
          product_id: input.product_id,
          qty_in: qty,
          ref_id: returned.id.toString(),
          ref_no: input.doc_no,
          ref_type: 'PI-RETURN',
          unit_cost: stockReceiptUnitCost,
          value_in: stockReceiptTotalCost,
          warehouse_id: input.source_warehouse_id,
        },
      )
    }

    await tx.stock_ledger.createMany({ data: ledgerRows })

    const [remainingInputs, activeOutputs] = await Promise.all([
      tx.production_inputs.findMany({
        where: { order_id: order.id, status: 'active' },
        include: { production_input_returns: { where: { status: 'active' }, select: { qty: true } } },
      }),
      tx.production_outputs.count({ where: { order_id: order.id, status: 'active' } }),
    ])
    const remainingInputQty = remainingInputs.reduce((sum, input) => {
      const returnedQty = input.production_input_returns.reduce((returnedSum, returned) => returnedSum + toNumber(returned.qty), 0)
      return sum + Math.max(0, toNumber(input.qty) - returnedQty)
    }, 0)
    const nextStatus = remainingInputQty <= 0.000001 && activeOutputs === 0 ? 'Open' : activeOutputs > 0 ? 'Partially Completed' : 'In Production'
    await tx.production_orders.update({
      data: { status: nextStatus, total_input_cost: { decrement: reverseCost }, updated_by: actor },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: 'input_returned',
      actor,
      fromStatus: order.status,
      meta: { inputDocNos: [...new Set(inputs.map((input) => input.doc_no))], lines: returnLineDetails, returnCost: reverseCost, returnQty: reverseQty },
      note: values.reason,
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: nextStatus,
    })
    const nextWip = await productionWipBalance(tx, order.id)
    return { orderStatus: nextStatus, returnedQty: reverseQty, wipQty: nextWip.wipQty }
  })
}

// Keep the old route callable during rollout; it now executes the return flow and does not create a reversal document.
export async function reverseProductionInput(orderDocNo: string, inputDocNo: string, values: ReverseProductionMovementValues, actor: string) {
  const order = await findOrderByDocNo(prisma, orderDocNo)
  const inputs = await prisma.production_inputs.findMany({ where: { doc_no: inputDocNo, order_id: order.id, status: 'active' }, select: { id: true, qty: true } })
  return returnProductionInput(orderDocNo, { lines: inputs.map((input) => ({ inputId: input.id, qty: toNumber(input.qty) })), reason: values.reason }, actor)
}

export async function createProductionOutput(orderDocNo: string, values: CreateProductionOutputValues, actor: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    await lockProductionOrder(tx, order.id)
    const isGrace = isGracePeriodActive(order)
    if (!['In Production', 'Partially Completed'].includes(order.status ?? '') && !isGrace) throw new ProductionOrderError('สถานะใบสั่งผลิตไม่อนุญาตให้รับผลผลิต')
    if (!order.branch_id || !order.warehouse_wip_id || !order.product_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา สินค้า หรือคลัง WIP ที่ครบถ้วน')
    const beforeWip = await productionWipBalance(tx, order.id)
    const branchId = order.branch_id
    const lossQty = toNumber(values.lossQty)
    const sourceWipLines = values.sourceWipLines ?? (values.sourceWipQty != null && values.sourceProductCode && values.sourceStockCategory && values.sourceWarehouseCode ? [{ productCode: values.sourceProductCode, qty: values.sourceWipQty, stockCategory: values.sourceStockCategory, sourceWarehouseCode: values.sourceWarehouseCode }] : [])
    if (sourceWipLines.length === 0) throw new ProductionOrderError('ต้องเลือกวัตถุดิบใน WIP อย่างน้อย 1 รายการ')
    const sourceRows = await Promise.all(sourceWipLines.map(async (line) => {
      const [product, warehouse, inputs, priorOutputs] = await Promise.all([
        findActiveProductByCode(tx, line.productCode),
        findActiveWarehouseByCode(tx, line.sourceWarehouseCode, branchId),
        tx.production_inputs.findMany({
          select: { product_id: true, source_warehouse_id: true, stock_category: true, qty: true, total_cost: true, production_input_returns: { where: { status: 'active' }, select: { qty: true, total_cost: true } } },
          where: { order_id: order.id, status: 'active' },
        }),
        tx.production_outputs.findMany({
          select: { source_wip_qty: true, source_wip_allocations: true, source_product_id: true, source_stock_category: true, source_warehouse_id: true },
          where: { order_id: order.id, status: 'active' },
        }),
      ])
      const matchingInputs = inputs.filter((input) => input.product_id === product.id && input.source_warehouse_id === warehouse.id && input.stock_category === line.stockCategory)
      const issuedQty = matchingInputs.reduce((sum, input) => sum + toNumber(input.qty) - input.production_input_returns.reduce((subtotal, returned) => subtotal + toNumber(returned.qty), 0), 0)
      const issuedCost = matchingInputs.reduce((sum, input) => sum + toNumber(input.total_cost) - input.production_input_returns.reduce((subtotal, returned) => subtotal + toNumber(returned.total_cost), 0), 0)
      const priorConsumed = priorOutputs.reduce((sum, output) => {
        if (Array.isArray(output.source_wip_allocations)) {
          return sum + (output.source_wip_allocations as unknown[]).reduce<number>((subtotal, allocation) => {
            const item = allocation as { productCode?: string; stockCategory?: string; warehouseCode?: string; qty?: number }
            return item.productCode === line.productCode && item.stockCategory === line.stockCategory && item.warehouseCode === line.sourceWarehouseCode ? subtotal + Number(item.qty ?? 0) : subtotal
          }, 0)
        }
        return output.source_product_id === product.id && output.source_stock_category === line.stockCategory && output.source_warehouse_id === warehouse.id ? sum + toNumber(output.source_wip_qty) : sum
      }, 0)
      const availableQty = Math.max(0, issuedQty - priorConsumed)
      if (line.qty > availableQty) throw new ProductionOrderError(`น้ำหนักที่ใช้ผลิตของ ${line.productCode} ในคลัง ${line.sourceWarehouseCode} เกิน WIP คงเหลือ`)
      return { line, product, warehouse, unitCost: issuedQty > 0 ? issuedCost / issuedQty : 0 }
    }))
    const requestedWipQty = sourceRows.reduce((sum, row) => sum + toNumber(row.line.qty), 0)
    if (lossQty > requestedWipQty) throw new ProductionOrderError('น้ำหนักสูญเสียต้องไม่เกินน้ำหนักรวมที่ใช้ผลิต')
    if (requestedWipQty > beforeWip.wipQty) throw new ProductionOrderError('รับผลผลิตเกิน WIP คงเหลือ')
    const outputSourceQty = Math.max(0, requestedWipQty - lossQty)
    const allocate = (totalQty: number) => {
      let remaining = totalQty
      return sourceRows.map((source, index) => {
        const qty = index === sourceRows.length - 1 ? Math.max(0, remaining) : Math.min(toNumber(source.line.qty), Math.max(0, remaining))
        remaining -= qty
        return { productCode: source.line.productCode, productId: source.product.id.toString(), stockCategory: source.line.stockCategory, warehouseCode: source.line.sourceWarehouseCode, qty, unitCost: source.unitCost, totalCost: qty * source.unitCost }
      }).filter((allocation) => allocation.qty > 0)
    }
    const outputAllocations = allocate(outputSourceQty)
    const lossAllocations = allocate(lossQty)
    const singleSource = sourceRows.length === 1 ? sourceRows[0] : null
    const outputDocNo = await nextDocNo(tx, 'production_outputs', 'PO2', values.date)
    const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
    const outputLineDetails: Array<{ productCode: string; productName: string; stockCategory: string; qty: number; unitCost: number; totalCost: number; warehouseName: string }> = []
    let outputQty = 0
    let outputValue = 0
    let stockReceiptValue = 0
    const averageWipCost = requestedWipQty > 0 ? [...outputAllocations, ...lossAllocations].reduce((sum, allocation) => sum + allocation.totalCost, 0) / requestedWipQty : 0
    const totalOutputQty = values.lines.reduce((sum, line) => sum + line.netQty, 0)
    const outputSourceQtyByLine = values.lines.map((line) => line.sourceWipQty ?? (values.lines.length === 1 ? outputSourceQty : totalOutputQty > 0 ? outputSourceQty * (line.netQty / totalOutputQty) : 0))
    if (Math.abs(outputSourceQtyByLine.reduce((sum, qty) => sum + qty, 0) - outputSourceQty) > 0.000001) {
      throw new ProductionOrderError('น้ำหนัก WIP ที่ใช้ผลิตของรายการผลผลิตรวมกันไม่ตรงกับผลผลิตและสูญเสีย')
    }

    for (const [lineIndex, line] of values.lines.entries()) {
      const [product, destinationWarehouse] = await Promise.all([
        findActiveProductByCode(tx, line.productCode),
        findActiveWarehouseByCode(tx, line.destinationWarehouseCode, order.branch_id),
      ])
      const sourceWipQty = outputSourceQtyByLine[lineIndex] ?? 0
      const lineOutputAllocations = allocate(sourceWipQty)
      const lineCost = lineOutputAllocations.reduce((sum, allocation) => sum + allocation.totalCost, 0)
      await lockStockScope(tx, {
        branchId: order.branch_id,
        productId: product.id,
        status: line.categoryCode,
        warehouseId: destinationWarehouse.id,
      })
      const destinationStock = await stockSnapshot(tx, {
        branchId: order.branch_id,
        productId: product.id,
        status: line.categoryCode,
        warehouseId: destinationWarehouse.id,
      })
      const stockReceiptUnitCost = destinationStock.unitCost
      const stockReceiptTotalCost = line.netQty * stockReceiptUnitCost
      outputQty += line.netQty
      outputValue += lineCost
      stockReceiptValue += stockReceiptTotalCost
      outputLineDetails.push({
        productCode: product.code,
        productName: product.name,
        stockCategory: line.categoryCode,
        qty: line.netQty,
        unitCost: line.netQty > 0 ? lineCost / line.netQty : 0,
        totalCost: lineCost,
        warehouseName: destinationWarehouse.name,
      })
      const created = await tx.production_outputs.create({
        data: {
          category_code: line.categoryCode,
          date: normalizeDate(values.date),
          destination_warehouse_id: destinationWarehouse.id,
          doc_no: outputDocNo,
          lot_no: line.lotNo ?? null,
          notes: values.notes ?? null,
          order_id: order.id,
          output_status: line.categoryCode,
          output_type: line.categoryCode === 'FG' ? 'Main Product' : 'Recovered Material',
          product_id: product.id,
          qty: line.netQty,
          source_wip_qty: sourceWipQty,
          source_wip_allocations: lineOutputAllocations,
          source_product_id: singleSource?.product.id ?? null,
          source_stock_category: singleSource?.line.stockCategory ?? null,
          source_warehouse_id: singleSource?.warehouse.id ?? null,
          stock_receipt_total_cost: stockReceiptTotalCost,
          stock_receipt_unit_cost: stockReceiptUnitCost,
          status: 'active',
          total_cost: lineCost,
          unit_cost: averageWipCost,
          cost_variance: stockReceiptTotalCost - lineCost,
          updated_by: actor,
        },
      })
      if (product.metal_group === 'ทองแดง' || product.metal_group === 'ทองเหลือง') {
        await tx.stock_cost_pool_entries.create({
          data: {
            source_type: 'Production',
            source_ref_type: 'PO2',
            source_ref_id: created.id.toString(),
            source_ref_no: outputDocNo,
            date: normalizeDate(values.date),
            branch_id: order.branch_id,
            warehouse_id: destinationWarehouse.id,
            product_id: product.id,
            lot_no: line.lotNo ?? null,
            original_qty: line.netQty,
            unit_cost: stockReceiptUnitCost,
            original_value: stockReceiptTotalCost,
            status: 'Available',
            created_by: actor,
            notes: values.notes ?? null,
          },
        })
      }
      ledgerRows.push(
        ...lineOutputAllocations.map((allocation) => {
          return {
            branch_id: order.branch_id,
            created_by: actor,
            date: normalizeDate(values.date),
            lot_no: line.lotNo ?? null,
            movement_type: 'PRODUCTION_OUTPUT_WIP_OUT',
            notes: values.notes ?? null,
            output_category: 'WIP',
            product_id: order.product_id,
            qty_out: allocation.qty,
            ref_id: created.id.toString(),
            ref_no: outputDocNo,
            ref_type: 'PO2',
            unit_cost: allocation.unitCost,
            value_out: allocation.totalCost,
            warehouse_id: order.warehouse_wip_id,
          }
        }),
      )
      ledgerRows.push({
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: line.lotNo ?? null,
          movement_type: line.categoryCode === 'FG' ? 'PRODUCTION_OUTPUT_IN' : 'PRODUCTION_OUTPUT_RM_IN',
          notes: values.notes ?? null,
          output_category: line.categoryCode,
          product_id: product.id,
          qty_in: line.netQty,
          ref_id: created.id.toString(),
          ref_no: outputDocNo,
          ref_type: 'PO2',
          unit_cost: stockReceiptUnitCost,
          value_in: stockReceiptTotalCost,
          warehouse_id: destinationWarehouse.id,
      })
    }

    if (lossQty > 0) {
      const lossCost = lossQty * averageWipCost
      outputValue += lossCost
      const created = await tx.production_outputs.create({
        data: {
          category_code: 'LOSS',
          date: normalizeDate(values.date),
          doc_no: outputDocNo,
          notes: values.notes ?? null,
          order_id: order.id,
          output_status: 'LOSS',
          output_type: 'Loss',
          product_id: order.product_id,
          qty: lossQty,
          source_wip_qty: lossQty,
          source_wip_allocations: lossAllocations,
          source_product_id: singleSource?.product.id ?? null,
          source_stock_category: singleSource?.line.stockCategory ?? null,
          source_warehouse_id: singleSource?.warehouse.id ?? null,
          status: 'active',
          total_cost: lossCost,
          unit_cost: averageWipCost,
          updated_by: actor,
        },
      })
      ledgerRows.push(...lossAllocations.map((allocation) => {
        return {
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(values.date),
          movement_type: 'PRODUCTION_LOSS',
          notes: values.notes ?? null,
          output_category: 'LOSS',
          product_id: order.product_id,
          qty_out: allocation.qty,
          ref_id: created.id.toString(),
          ref_no: outputDocNo,
          ref_type: 'PO2',
          unit_cost: allocation.unitCost,
          value_out: allocation.totalCost,
          warehouse_id: order.warehouse_wip_id,
        }
      }))
    }

    const resultQty = outputQty + lossQty
    const quantityVariance = resultQty - requestedWipQty
    if (!values.confirmQuantityVariance && Math.abs(quantityVariance) > 0.000001) {
      const quantityText = Math.abs(quantityVariance) > 0.000001
        ? `จำนวนผลผลิตรวมสูญเสีย ${resultQty.toFixed(2)} กก. เทียบกับ WIP ที่ใช้ ${requestedWipQty.toFixed(2)} กก. ต่างกัน ${quantityVariance.toFixed(2)} กก.`
        : 'จำนวนผลผลิตรวมสูญเสียตรงกับ WIP ที่ใช้'
      throw new ProductionOrderError(`ตรวจพบจำนวนต่างก่อนส่งเข้าคลัง: ${quantityText} กรุณายืนยันก่อนส่งเข้าคลัง`, 409)
    }

    await tx.stock_ledger.createMany({ data: ledgerRows })
    const nextWipQty = beforeWip.wipQty - requestedWipQty
    const nextStatus = 'Partially Completed'
    await tx.production_orders.update({
      data: {
        status: nextStatus,
        total_output_value: { increment: outputValue },
        updated_by: actor,
      },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: 'output_created',
      actor,
      fromStatus: order.status,
      meta: {
        lossQty,
        lines: outputLineDetails,
        outputDocNo,
        outputQty,
        productionCost: outputValue,
        sourceWipLines: sourceRows.map((source) => ({
          productCode: source.product.code,
          productName: source.product.name,
          stockCategory: source.line.stockCategory,
          qty: source.line.qty,
          unitCost: source.unitCost,
          totalCost: source.line.qty * source.unitCost,
          warehouseName: source.warehouse.name,
        })),
        sourceWipQty: requestedWipQty,
        stockReceiptValue,
      },
      note: values.notes ?? null,
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: nextStatus,
    })
    await tx.production_output_drafts.deleteMany({ where: { order_id: order.id } })
    return { lossQty, orderStatus: nextStatus, outputDocNo, outputQty, productionCost: outputValue, stockReceiptValue, wipQty: nextWipQty }
  })
}

export async function reverseProductionOutput(orderDocNo: string, outputDocNo: string, values: ReverseProductionMovementValues, actor: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    await lockProductionOrder(tx, order.id)
    const isGrace = isGracePeriodActive(order)
    if (['Completed', 'Cancelled'].includes(order.status ?? '') && (!isGrace || order.status === 'Cancelled')) {
      throw new ProductionOrderError('ใบสั่งผลิตปิดงานหรือยกเลิกแล้ว ไม่สามารถ reverse ได้')
    }
    if (!order.branch_id || !order.warehouse_wip_id || !order.product_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา สินค้า หรือคลัง WIP ที่ครบถ้วน')

    const outputs = await tx.production_outputs.findMany({
      where: { doc_no: outputDocNo, order_id: order.id, status: 'active' },
    })
    if (outputs.length === 0) throw new ProductionOrderError(`ไม่พบรายการรับผลผลิตที่ reverse ได้ ${outputDocNo}`, 404)

    const reversalDocNo = await nextDocNo(tx, 'production_outputs', 'PO2-REV', values.date)
    const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
    let reverseCost = 0
    let reverseQty = 0

    for (const output of outputs) {
      if (!output.product_id) throw new ProductionOrderError(`รายการ ${outputDocNo} ไม่มีข้อมูลสินค้า ไม่สามารถ reverse ได้`)
      const poolEntry = await tx.stock_cost_pool_entries.findFirst({
        where: {
          source_ref_id: output.id.toString(),
          source_ref_type: 'PO2',
        },
      })
      if (poolEntry) {
        if (toNumber(poolEntry.allocated_qty) > 0) {
          throw new ProductionOrderError(`ไม่สามารถ reverse ได้เนื่องจากผลผลิตทองแดง/ทองเหลืองบางส่วนถูกขายหรือจัดสรรต้นทุนแล้ว (${outputDocNo})`)
        }
        await tx.stock_cost_pool_entries.update({
          data: {
            status: 'Cancelled',
            updated_by: actor,
            updated_at: new Date(),
          },
          where: { id: poolEntry.id },
        })
      }
      const qty = toNumber(output.qty)
      const productionUnitCost = toNumber(output.unit_cost)
      const productionTotalCost = toNumber(output.total_cost) || qty * productionUnitCost
      const stockReceiptUnitCost = output.stock_receipt_unit_cost === null ? productionUnitCost : toNumber(output.stock_receipt_unit_cost)
      const stockReceiptTotalCost = output.stock_receipt_total_cost === null ? qty * stockReceiptUnitCost : toNumber(output.stock_receipt_total_cost)
      reverseCost += productionTotalCost
      reverseQty += qty

      if (output.category_code !== 'LOSS') {
        if (!output.destination_warehouse_id) throw new ProductionOrderError(`รายการ ${outputDocNo} ไม่มีคลังปลายทาง ไม่สามารถ reverse ได้`)
        const stockStatus = output.category_code === 'RM' ? 'RM' : 'FG'
        await lockStockScope(tx, {
          branchId: order.branch_id,
          lotNo: output.lot_no,
          productId: output.product_id,
          status: stockStatus,
          warehouseId: output.destination_warehouse_id,
        })
        if (!output.created_at) throw new ProductionOrderError(`รายการ ${outputDocNo} ไม่มีเวลาบันทึก จึงตรวจสอบ dependency ก่อน void ไม่ได้`)
        const laterOutgoing = await tx.stock_ledger.aggregate({
          _sum: { qty_out: true },
          where: {
            branch_id: order.branch_id,
            created_at: { gt: output.created_at },
            lot_no: output.lot_no,
            movement_type: { notIn: ['PRODUCTION_OUTPUT_REVERSE_STOCK_OUT'] },
            output_category: stockStatus,
            product_id: output.product_id,
            qty_out: { gt: 0 },
            ref_type: { notIn: ['PO2', 'PO2-REV'] },
            warehouse_id: output.destination_warehouse_id,
          },
        })
        if (toNumber(laterOutgoing._sum.qty_out) > 0.000001) {
          throw new ProductionOrderError(`ไม่สามารถ void ${outputDocNo} ได้ เนื่องจากสินค้าถูกนำไปใช้หรือจ่ายออกจากคลังปลายทางแล้ว`)
        }
        const available = await stockSnapshot(tx, {
          branchId: order.branch_id,
          lotNo: output.lot_no,
          productId: output.product_id,
          status: stockStatus,
          warehouseId: output.destination_warehouse_id,
        })
        if (available.qty < qty) throw new ProductionOrderError(`สินค้าในคลังปลายทางของ ${outputDocNo} ไม่พอสำหรับ reverse`)
        ledgerRows.push({
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: output.lot_no,
          movement_type: 'PRODUCTION_OUTPUT_REVERSE_STOCK_OUT',
          notes: values.reason,
          output_category: stockStatus,
          product_id: output.product_id,
          qty_out: qty,
          ref_id: output.id.toString(),
          ref_no: reversalDocNo,
          ref_type: 'PO2-REV',
          unit_cost: stockReceiptUnitCost,
          value_out: stockReceiptTotalCost,
          warehouse_id: output.destination_warehouse_id,
        })
      }

      const sourceAllocations = Array.isArray(output.source_wip_allocations) && output.source_wip_allocations.length > 0
        ? (output.source_wip_allocations as unknown[]).map((allocation) => {
            const item = allocation as { productId?: string; qty?: number; unitCost?: number; totalCost?: number }
            const allocationQty = toNumber(item.qty)
            if (!item.productId || allocationQty <= 0) throw new ProductionOrderError(`รายการ ${outputDocNo} มีข้อมูลวัตถุดิบ WIP ไม่ครบ ไม่สามารถ reverse ได้`)
            return {
              productId: BigInt(item.productId),
              qty: allocationQty,
              unitCost: toNumber(item.unitCost),
              totalCost: toNumber(item.totalCost) || allocationQty * toNumber(item.unitCost),
            }
          })
        : [{
            productId: output.source_product_id ?? order.product_id,
            qty: toNumber(output.source_wip_qty) || qty,
            unitCost: productionUnitCost,
            totalCost: productionTotalCost,
          }]
      ledgerRows.push(...sourceAllocations.map((allocation) => ({
        branch_id: order.branch_id,
        created_by: actor,
        date: normalizeDate(values.date),
        lot_no: output.lot_no,
        movement_type: 'PRODUCTION_OUTPUT_REVERSE_WIP_IN',
        notes: values.reason,
        output_category: 'WIP',
        product_id: order.product_id,
        qty_in: allocation.qty,
        ref_id: output.id.toString(),
        ref_no: reversalDocNo,
        ref_type: 'PO2-REV',
        unit_cost: allocation.unitCost,
        value_in: allocation.totalCost,
        warehouse_id: order.warehouse_wip_id,
      })))
    }

    await tx.stock_ledger.createMany({ data: ledgerRows })
    await tx.production_outputs.updateMany({
      data: { reversal_doc_no: reversalDocNo, reversed_at: new Date(), reversed_by: actor, reverse_reason: values.reason, status: 'reversed', updated_by: actor },
      where: { doc_no: outputDocNo, order_id: order.id, status: 'active' },
    })

    const [activeInputs, activeOutputs] = await Promise.all([
      tx.production_inputs.count({ where: { order_id: order.id, status: 'active' } }),
      tx.production_outputs.count({ where: { order_id: order.id, status: 'active' } }),
    ])
    const nextStatus = activeInputs === 0 ? 'Open' : activeOutputs > 0 ? 'Partially Completed' : 'In Production'
    await tx.production_orders.update({
      data: { status: nextStatus, total_output_value: { decrement: reverseCost }, updated_by: actor },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: 'output_reversed',
      actor,
      fromStatus: order.status,
      meta: { outputDocNo, reversalDocNo, reverseCost, reverseQty },
      note: values.reason,
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: nextStatus,
    })
    const nextWip = await productionWipBalance(tx, order.id)
    return { orderStatus: nextStatus, outputDocNo, reversalDocNo, reversedQty: reverseQty, wipQty: nextWip.wipQty }
  })
}

export async function completeProductionOrder(orderDocNo: string, note: string | undefined, actor: string, confirmCloseWithWip = false) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    await lockProductionOrder(tx, order.id)
    if (!order.branch_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา ไม่สามารถปิดงานได้')
    const wip = await productionWipBalance(tx, order.id)
    if (wip.wipQty > 0.000001 && !confirmCloseWithWip) {
      throw new ProductionOrderError(`ยังมี WIP คงเหลือ ${wip.wipQty.toFixed(2)} กก. หากยืนยันปิดงาน ระบบจะคืน WIP ที่เหลือกลับคลังต้นทาง`, 409)
    }
    if (wip.wipQty < -0.000001) throw new ProductionOrderError('ยอด WIP ติดลบ ไม่สามารถปิดงานได้')

    if (wip.wipQty > 0.000001) {
      const [inputs, wipGroups, warehouses] = await Promise.all([
        tx.production_inputs.findMany({
          where: { order_id: order.id, status: 'active' },
          include: { products: true, production_input_returns: { where: { status: 'active' }, select: { qty: true } } },
          orderBy: [{ id: 'asc' }],
        }),
        productionWipGroupCosts(tx, order.id),
        tx.warehouses.findMany({ select: { id: true, name: true }, where: { branch_id: order.branch_id } }),
      ])
      const warehouseNameById = new Map(warehouses.map((warehouse) => [warehouse.id.toString(), warehouse.name]))
      const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
      const returnedLines: Array<{ productCode: string; productName: string; stockCategory: string; qty: number; unitCost: number; totalCost: number; warehouseName: string }> = []
      const groupRemaining = new Map([...wipGroups.entries()].map(([key, value]) => [key, { ...value }]))
      const recordedAt = new Date()
      const postingDate = normalizeDate(toBangkokDateOnly(recordedAt))
      let returnCost = 0
      let returnQty = 0

      for (const input of inputs) {
        if (!input.product_id || !input.source_warehouse_id || !input.stock_category) continue
        const returnedQty = input.production_input_returns.reduce((sum, returned) => sum + toNumber(returned.qty), 0)
        const inputRemaining = Math.max(0, toNumber(input.qty) - returnedQty)
        const key = productionWipGroupKey(input.product_id, input.stock_category, input.source_warehouse_id)
        const group = groupRemaining.get(key)
        if (!group || group.qty <= 0.000001 || inputRemaining <= 0.000001) continue
        const qty = Math.min(inputRemaining, group.qty)
        const unitCost = group.value / group.qty
        const totalCost = qty * unitCost
        await lockStockScope(tx, {
          branchId: order.branch_id,
          lotNo: input.lot_no,
          productId: input.product_id,
          status: input.stock_category,
          warehouseId: input.source_warehouse_id,
        })
        const returned = await tx.production_input_returns.create({
          data: {
            created_by: actor,
            date: postingDate,
            order_id: order.id,
            production_input_id: input.id,
            qty,
            reason: note?.trim() || 'คืน WIP คงเหลือก่อนปิดงาน',
            stock_receipt_total_cost: totalCost,
            stock_receipt_unit_cost: unitCost,
            total_cost: totalCost,
            unit_cost: unitCost,
            cost_variance: 0,
          },
        })
        ledgerRows.push(
          {
            branch_id: order.branch_id,
            created_by: actor,
            created_at: recordedAt,
            date: postingDate,
            lot_no: input.lot_no,
            movement_type: 'PRODUCTION_INPUT_RETURN_WIP_OUT',
            notes: note?.trim() || 'คืน WIP คงเหลือก่อนปิดงาน',
            output_category: 'WIP',
            product_id: order.product_id,
            qty_out: qty,
            ref_id: returned.id.toString(),
            ref_no: input.doc_no,
            ref_type: 'PI-RETURN',
            unit_cost: unitCost,
            value_out: totalCost,
            warehouse_id: input.wip_warehouse_id,
          },
          {
            branch_id: order.branch_id,
            created_by: actor,
            created_at: recordedAt,
            date: postingDate,
            lot_no: input.lot_no,
            movement_type: 'PRODUCTION_INPUT_RETURN_STOCK_IN',
            notes: note?.trim() || 'คืน WIP คงเหลือก่อนปิดงาน',
            output_category: input.stock_category,
            product_id: input.product_id,
            qty_in: qty,
            ref_id: returned.id.toString(),
            ref_no: input.doc_no,
            ref_type: 'PI-RETURN',
            unit_cost: unitCost,
            value_in: totalCost,
            warehouse_id: input.source_warehouse_id,
          },
        )
        returnedLines.push({
          productCode: input.products?.code ?? '',
          productName: input.products?.name ?? '-',
          stockCategory: input.stock_category,
          qty,
          unitCost,
          totalCost,
          warehouseName: warehouseNameById.get(input.source_warehouse_id.toString()) ?? '-',
        })
        group.qty -= qty
        group.value -= totalCost
        returnQty += qty
        returnCost += totalCost
      }

      if (Math.abs(returnQty - wip.wipQty) > 0.000001) throw new ProductionOrderError('ไม่สามารถจัดสรร WIP คงเหลือกลับคลังต้นทางได้ครบถ้วน')
      await tx.stock_ledger.createMany({ data: ledgerRows })
      await appendOrderStatusLog(tx, {
        action: 'input_returned',
        actor,
        fromStatus: order.status,
        meta: { inputDocNos: [...new Set(inputs.map((input) => input.doc_no))], lines: returnedLines, returnCost, returnQty, automatic: true },
        note: note?.trim() || 'คืน WIP คงเหลือก่อนปิดงาน',
        orderDocNo: order.doc_no,
        orderId: order.id,
        toStatus: order.status ?? 'In Production',
      })
      await tx.production_orders.update({ data: { total_input_cost: { decrement: returnCost }, updated_by: actor }, where: { id: order.id } })
    }
    const updated = await tx.production_orders.update({
      data: { closed_at: new Date(), closed_by: actor, status: 'Completed', updated_by: actor },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: 'completed',
      actor,
      fromStatus: order.status,
      note,
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: 'Completed',
    })
    return { docNo: updated.doc_no, status: updated.status }
  })
}

export async function cancelProductionOrder(orderDocNo: string, reason: string, actor: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    await lockProductionOrder(tx, order.id)
    const [activeInputs, activeOutputs] = await Promise.all([
      tx.production_inputs.count({ where: { order_id: order.id, status: 'active' } }),
      tx.production_outputs.count({ where: { order_id: order.id, status: 'active' } }),
    ])
    if (activeInputs > 0 || activeOutputs > 0) throw new ProductionOrderError('ยกเลิกได้เฉพาะใบที่ยังไม่มี movement หรือ reverse ครบแล้ว')
    const updated = await tx.production_orders.update({
      data: { notes: order.notes ? `${order.notes}\nCancel: ${reason}` : `Cancel: ${reason}`, status: 'Cancelled', updated_by: actor },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: 'cancelled',
      actor,
      fromStatus: order.status,
      note: reason,
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: 'Cancelled',
    })
    return { docNo: updated.doc_no, status: updated.status }
  })
}

export async function readProductionWip(orderDocNo: string) {
  const order = await findOrderByDocNo(prisma, orderDocNo)
  const wip = await productionWipBalance(prisma, order.id)
  return { docNo: order.doc_no, ...wip }
}

export async function productionOrderOptions(allowedBranchCodes: string[] | null = null) {
  const branches = allowedBranchCodes ? await listActiveBranchesByCodes(allowedBranchCodes) : await listActiveBranches()
  const [warehouses, products, machines, lines] = allowedBranchCodes
    ? await Promise.all([
        listActiveWarehouses(),
        listActiveProductReferences(),
        prisma.production_machines.findMany({
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { active: true, id: true, name: true, type: true },
          where: { active: true, OR: [{ branch_id: null }, { branch_id: { in: branches.map((row) => row.id) } }] },
        }),
        prisma.production_lines.findMany({
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { active: true, id: true, name: true },
          where: { active: true, OR: [{ branch_id: null }, { branch_id: { in: branches.map((row) => row.id) } }] },
        }),
      ])
    : await Promise.all([listActiveWarehouses(), listActiveProductReferences(), listActiveProductionMachines(), listActiveProductionLines()])
  const visibleBranchCodes = new Set(branches.flatMap((row) => row.code ? [row.code] : []))
  const visibleWarehouses = warehouses.filter((row) => !allowedBranchCodes || (row.branchCode != null && visibleBranchCodes.has(row.branchCode)))
  return {
    branches: branches.map((row: (typeof branches)[number]) => ({ code: requireBusinessCode(row.code, `สาขา ${row.id}`), id: requireBusinessCode(row.code, `สาขา ${row.id}`), name: row.name })),
    machines: machines.map((row: (typeof machines)[number]) => ({ code: row.name, id: row.name, name: row.name, type: row.type })),
    productionLines: lines.map((row: (typeof lines)[number]) => ({ code: row.name, id: row.name, name: row.name })),
    products: products.map((row: (typeof products)[number]) => ({ code: requireBusinessCode(row.code, `สินค้า ${row.id}`), id: requireBusinessCode(row.code, `สินค้า ${row.id}`), name: row.name })),
    productionTypes: ['Sorting', 'Baling', 'Melting', 'Processing'],
    warehouses: visibleWarehouses.map((row: (typeof warehouses)[number]) => ({ branchCode: row.branchCode, code: row.code, id: row.code, name: row.name, type: row.type })),
  }
}

export async function productionProductStock(input: { branchCode: string; productCode: string; warehouseCode: string }) {
  const branch = await findActiveBranchByCode(prisma, input.branchCode.trim().toUpperCase())
  const product = await findActiveProductByCode(prisma, input.productCode.trim().toUpperCase())

  const warehouses = await listActiveWarehousesByBranch(branch.code)

  const rows: Array<{
    avgCost: number
    qty: number
    status: string
    value: number
    warehouseCode: string
    warehouseName: string
  }> = []

  const snapshots = await prisma.stock_ledger.groupBy({
    by: ['warehouse_id', 'output_category'],
    where: {
      branch_id: branch.id,
      lot_no: null,
      OR: [{ not_available_for_sale: false }, { not_available_for_sale: null }],
      output_category: { in: ['RM', 'FG'] },
      product_id: product.id,
      warehouse_id: { in: warehouses.map((warehouse) => warehouse.id) },
    },
    _sum: { qty_in: true, qty_out: true, value_in: true, value_out: true },
  })
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id.toString(), warehouse]))
  for (const snapshot of snapshots) {
    const warehouse = snapshot.warehouse_id == null ? null : warehouseById.get(snapshot.warehouse_id.toString())
    const status = snapshot.output_category
    if (!warehouse || (status !== 'RM' && status !== 'FG')) continue
    const qty = toNumber(snapshot._sum.qty_in) - toNumber(snapshot._sum.qty_out)
    const value = toNumber(snapshot._sum.value_in) - toNumber(snapshot._sum.value_out)
    if (Math.abs(qty) <= 0.000001) continue
    rows.push({
      avgCost: qty > 0 ? value / qty : 0,
      qty,
      status,
      value,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
    })
  }

  return {
    branchCode: branch.code,
    productCode: product.code,
    productName: product.name,
    rows,
    warehouseCode: input.warehouseCode,
  }
}
