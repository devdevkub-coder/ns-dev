import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { z } from 'zod'
import { requireBusinessCode } from '@/lib/business-code'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

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
const qtySchema = z.coerce.number().positive('จำนวนต้องมากกว่า 0')
const nonNegativeQtySchema = z.coerce.number().min(0, 'จำนวนต้องไม่ติดลบ')

export const createProductionOrderSchema = z.object({
  branchCode: codeSchema,
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  destinationWarehouseCode: codeSchema,
  machineCode: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
  productionLineCode: z.string().trim().optional(),
  productionType: z.string().trim().min(1, 'เลือกประเภทการผลิต').max(80),
  shift: z.string().trim().max(80).optional(),
  sourceWarehouseCode: codeSchema,
  targetProductCode: codeSchema,
  wipWarehouseCode: codeSchema,
})

export const updateProductionOrderActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete'),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('cancel'),
    reason: z.string().trim().min(1, 'ระบุเหตุผลการยกเลิก').max(1000),
  }),
])

export const createProductionInputSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  lines: z.array(z.object({
    lotNo: z.string().trim().max(80).optional(),
    netQty: qtySchema,
    productCode: codeSchema,
    sourceWarehouseCode: codeSchema,
    stockStatus: z.enum(['RM', 'FG']),
  })).min(1, 'ต้องมีวัตถุดิบอย่างน้อย 1 รายการ'),
  notes: z.string().trim().max(1000).optional(),
})

export const reverseProductionInputSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  reason: z.string().trim().min(1, 'ระบุเหตุผลการ reverse').max(1000),
})

export const createProductionOutputSchema = z.object({
  completeOrder: z.boolean().optional(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  lines: z.array(z.object({
    categoryCode: z.enum(['FG', 'RM']),
    destinationWarehouseCode: codeSchema,
    lotNo: z.string().trim().max(80).optional(),
    netQty: qtySchema,
    productCode: codeSchema,
  })).default([]),
  lossQty: nonNegativeQtySchema.optional(),
  notes: z.string().trim().max(1000).optional(),
}).refine((value) => value.lines.length > 0 || toNumber(value.lossQty) > 0, {
  message: 'ต้องมีผลผลิตหรือ loss อย่างน้อย 1 รายการ',
  path: ['lines'],
})

export const reverseProductionOutputSchema = reverseProductionInputSchema

export type CreateProductionOrderValues = z.infer<typeof createProductionOrderSchema>
export type CreateProductionInputValues = z.infer<typeof createProductionInputSchema>
export type CreateProductionOutputValues = z.infer<typeof createProductionOutputSchema>
export type ReverseProductionMovementValues = z.infer<typeof reverseProductionInputSchema>

function compactPeriod(date: string) {
  return date.slice(2, 4) + date.slice(5, 7)
}

async function nextDocNo(
  tx: Prisma.TransactionClient,
  tableName: 'production_orders' | 'production_inputs' | 'production_outputs',
  prefix: 'PO' | 'PI' | 'PO2' | 'PI-REV' | 'PO2-REV',
  date: string,
) {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`production.${prefix}.doc_no`}))`
  const startsWith = `${prefix}${compactPeriod(date)}-`
  const docNoColumn = prefix.endsWith('-REV') ? 'reversal_doc_no' : 'doc_no'
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select ${Prisma.raw(docNoColumn)} as doc_no
    from ${Prisma.raw(`public.${tableName}`)}
    where ${Prisma.raw(docNoColumn)} like ${`${startsWith}%`}
  `
  const lastNumber = rows.reduce((max, row) => {
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

async function findActiveProductByCode(tx: DbClient, code: string) {
  const product = await tx.products.findFirst({ select: { code: true, id: true, name: true, metal_group: true }, where: { active: true, code } })
  if (!product) throw new ProductionOrderError(`ไม่พบสินค้า ${code}`)
  requireBusinessCode(product.code, `สินค้า ${product.id}`)
  return product
}

async function findOptionalMachineByCode(tx: DbClient, code?: string) {
  if (!code) return null
  const machine = await tx.production_machines.findFirst({ select: { id: true }, where: { active: true, name: { equals: code, mode: 'insensitive' } } })
  if (!machine) throw new ProductionOrderError(`ไม่พบเครื่องจักร ${code}`)
  return machine
}

async function findOptionalProductionLineByCode(tx: DbClient, code?: string) {
  if (!code) return null
  const line = await tx.production_lines.findFirst({ select: { id: true }, where: { active: true, name: { equals: code, mode: 'insensitive' } } })
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
    tx.production_inputs.aggregate({
      _sum: { qty: true, total_cost: true },
      where: { order_id: orderId, status: 'active' },
    }),
    tx.production_outputs.aggregate({
      _sum: { source_wip_qty: true, qty: true },
      where: { order_id: orderId, status: 'active' },
    }),
  ])
  const inputQty = toNumber(input._sum.qty)
  const consumedWipQty = toNumber(output._sum.source_wip_qty)
  return {
    consumedWipQty,
    inputCost: toNumber(input._sum.total_cost),
    inputQty,
    outputQty: toNumber(output._sum.qty),
    wipQty: inputQty - consumedWipQty,
  }
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
  return prisma.$transaction(async (tx) => {
    const [branch, product] = await Promise.all([
      findActiveBranchByCode(tx, values.branchCode),
      findActiveProductByCode(tx, values.targetProductCode),
    ])
    const [sourceWarehouse, wipWarehouse, destinationWarehouse, machine, line] = await Promise.all([
      findActiveWarehouseByCode(tx, values.sourceWarehouseCode, branch.id),
      findActiveWarehouseByCode(tx, values.wipWarehouseCode, branch.id),
      findActiveWarehouseByCode(tx, values.destinationWarehouseCode, branch.id),
      findOptionalMachineByCode(tx, values.machineCode),
      findOptionalProductionLineByCode(tx, values.productionLineCode),
    ])
    if (wipWarehouse.type?.toUpperCase() !== 'WIP') throw new ProductionOrderError(`คลัง ${values.wipWarehouseCode} ไม่ใช่คลัง WIP`)
    const docNo = await nextDocNo(tx, 'production_orders', 'PO', values.date)
    const created = await tx.production_orders.create({
      data: {
        branch_id: branch.id,
        date: normalizeDate(values.date),
        doc_no: docNo,
        machine_id: machine?.id ?? null,
        notes: values.notes ?? null,
        product_id: product.id,
        production_line_id: line?.id ?? null,
        production_type: values.productionType,
        shift: values.shift ?? null,
        status: 'Open',
        updated_by: actor,
        warehouse_from_id: sourceWarehouse.id,
        warehouse_id: destinationWarehouse.id,
        warehouse_to_id: destinationWarehouse.id,
        warehouse_wip_id: wipWarehouse.id,
      },
    })
    await appendOrderStatusLog(tx, {
      action: 'created',
      actor,
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
  const qty = rows.reduce((sum, row) => sum + toNumber(row.qty_in) - toNumber(row.qty_out), 0)
  const value = rows.reduce((sum, row) => sum + toNumber(row.value_in) - toNumber(row.value_out), 0)
  return { qty, unitCost: qty > 0 ? value / qty : 0, value }
}

export async function createProductionInput(orderDocNo: string, values: CreateProductionInputValues, actor: string) {
  return prisma.$transaction(async (tx) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    const isGrace = isGracePeriodActive(order)
    if (!['Open', 'In Production', 'Partially Completed'].includes(order.status ?? '') && !isGrace) {
      throw new ProductionOrderError('สถานะใบสั่งผลิตไม่อนุญาตให้เบิกวัตถุดิบ')
    }
    if (!order.branch_id || !order.warehouse_wip_id || !order.product_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา สินค้า หรือคลัง WIP ที่ครบถ้วน')
    const inputDocNo = await nextDocNo(tx, 'production_inputs', 'PI', values.date)
    const createdInputs = []
    const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
    let totalCost = 0
    let totalQty = 0

    for (const line of values.lines) {
      const [product, sourceWarehouse] = await Promise.all([
        findActiveProductByCode(tx, line.productCode),
        findActiveWarehouseByCode(tx, line.sourceWarehouseCode, order.branch_id),
      ])
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
      const created = await tx.production_inputs.create({
        data: {
          date: normalizeDate(values.date),
          doc_no: inputDocNo,
          lot_no: line.lotNo ?? null,
          notes: values.notes ?? null,
          order_id: order.id,
          product_id: product.id,
          qty: line.netQty,
          source: line.sourceWarehouseCode,
          source_warehouse_id: sourceWarehouse.id,
          status: 'active',
          total_cost: totalLineCost,
          unit_cost: stock.unitCost,
          updated_by: actor,
          wac_unit_cost: stock.unitCost,
          wip_warehouse_id: order.warehouse_wip_id,
        },
      })
      createdInputs.push(created)
      ledgerRows.push(
        {
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: line.lotNo ?? null,
          movement_type: 'PRODUCTION_INPUT_OUT',
          notes: values.notes ?? null,
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
          date: normalizeDate(values.date),
          lot_no: line.lotNo ?? null,
          movement_type: 'WIP_IN',
          notes: values.notes ?? null,
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
      meta: { inputDocNo, totalCost, totalQty },
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: nextStatus,
    })
    const wip = await productionWipBalance(tx, order.id)
    return { inputDocNo, ledgerRefs: ledgerRows.map((row) => row.ref_no).filter(Boolean), orderStatus: nextStatus, totalInputCost: totalCost, wipQty: wip.wipQty }
  })
}

export async function reverseProductionInput(orderDocNo: string, inputDocNo: string, values: ReverseProductionMovementValues, actor: string) {
  return prisma.$transaction(async (tx) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    const isGrace = isGracePeriodActive(order)
    if (['Completed', 'Cancelled'].includes(order.status ?? '') && (!isGrace || order.status === 'Cancelled')) {
      throw new ProductionOrderError('ใบสั่งผลิตปิดงานหรือยกเลิกแล้ว ไม่สามารถ reverse ได้')
    }
    if (!order.branch_id || !order.warehouse_wip_id || !order.product_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา สินค้า หรือคลัง WIP ที่ครบถ้วน')

    const inputs = await tx.production_inputs.findMany({
      where: { doc_no: inputDocNo, order_id: order.id, status: 'active' },
    })
    if (inputs.length === 0) throw new ProductionOrderError(`ไม่พบรายการเบิกวัตถุดิบที่ reverse ได้ ${inputDocNo}`, 404)

    const wip = await productionWipBalance(tx, order.id)
    const reverseQty = inputs.reduce((sum, row) => sum + toNumber(row.qty), 0)
    if (reverseQty > wip.wipQty + 0.000001) throw new ProductionOrderError('WIP ถูกใช้ไปแล้ว ไม่สามารถ reverse input ชุดนี้ได้')

    const reversalDocNo = await nextDocNo(tx, 'production_inputs', 'PI-REV', values.date)
    const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
    let reverseCost = 0

    for (const input of inputs) {
      if (!input.source_warehouse_id || !input.wip_warehouse_id || !input.product_id) {
        throw new ProductionOrderError(`รายการ ${inputDocNo} ไม่มีข้อมูลคลังหรือสินค้า ไม่สามารถ reverse ได้`)
      }
      const qty = toNumber(input.qty)
      const unitCost = toNumber(input.wac_unit_cost) || toNumber(input.unit_cost)
      const totalCost = qty * unitCost
      reverseCost += totalCost
      ledgerRows.push(
        {
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: input.lot_no,
          movement_type: 'PRODUCTION_INPUT_REVERSE_WIP_OUT',
          notes: values.reason,
          output_category: 'WIP',
          product_id: order.product_id,
          qty_out: qty,
          ref_id: input.id.toString(),
          ref_no: reversalDocNo,
          ref_type: 'PI-REV',
          unit_cost: unitCost,
          value_out: totalCost,
          warehouse_id: input.wip_warehouse_id,
        },
        {
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: input.lot_no,
          movement_type: 'PRODUCTION_INPUT_REVERSE_STOCK_IN',
          notes: values.reason,
          output_category: input.source === 'FG' ? 'FG' : 'RM',
          product_id: input.product_id,
          qty_in: qty,
          ref_id: input.id.toString(),
          ref_no: reversalDocNo,
          ref_type: 'PI-REV',
          unit_cost: unitCost,
          value_in: totalCost,
          warehouse_id: input.source_warehouse_id,
        },
      )
    }

    await tx.stock_ledger.createMany({ data: ledgerRows })
    await tx.production_inputs.updateMany({
      data: { reversal_doc_no: reversalDocNo, reversed_at: new Date(), reversed_by: actor, reverse_reason: values.reason, status: 'reversed', updated_by: actor },
      where: { doc_no: inputDocNo, order_id: order.id, status: 'active' },
    })

    const [activeInputs, activeOutputs] = await Promise.all([
      tx.production_inputs.count({ where: { order_id: order.id, status: 'active' } }),
      tx.production_outputs.count({ where: { order_id: order.id, status: 'active' } }),
    ])
    const nextStatus = activeInputs === 0 && activeOutputs === 0 ? 'Open' : activeOutputs > 0 ? 'Partially Completed' : 'In Production'
    await tx.production_orders.update({
      data: { status: nextStatus, total_input_cost: { decrement: reverseCost }, updated_by: actor },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: 'input_reversed',
      actor,
      fromStatus: order.status,
      meta: { inputDocNo, reversalDocNo, reverseCost, reverseQty },
      note: values.reason,
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: nextStatus,
    })
    const nextWip = await productionWipBalance(tx, order.id)
    return { inputDocNo, orderStatus: nextStatus, reversalDocNo, reversedQty: reverseQty, wipQty: nextWip.wipQty }
  })
}

export async function createProductionOutput(orderDocNo: string, values: CreateProductionOutputValues, actor: string) {
  return prisma.$transaction(async (tx) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    const isGrace = isGracePeriodActive(order)
    if (!['In Production', 'Partially Completed'].includes(order.status ?? '') && !isGrace) throw new ProductionOrderError('สถานะใบสั่งผลิตไม่อนุญาตให้รับผลผลิต')
    if (!order.branch_id || !order.warehouse_wip_id || !order.product_id) throw new ProductionOrderError('ใบสั่งผลิตไม่มีสาขา สินค้า หรือคลัง WIP ที่ครบถ้วน')
    const beforeWip = await productionWipBalance(tx, order.id)
    const requestedWipQty = values.lines.reduce((sum, line) => sum + line.netQty, 0) + toNumber(values.lossQty)
    if (requestedWipQty > beforeWip.wipQty) throw new ProductionOrderError('รับผลผลิตเกิน WIP คงเหลือ')
    if (values.completeOrder && Math.abs(beforeWip.wipQty - requestedWipQty) > 0.000001) throw new ProductionOrderError('จะปิดงานได้ต้องเคลียร์ WIP ให้เป็นศูนย์')
    const outputDocNo = await nextDocNo(tx, 'production_outputs', 'PO2', values.date)
    const ledgerRows: Prisma.stock_ledgerCreateManyInput[] = []
    let outputQty = 0
    let lossQty = toNumber(values.lossQty)
    let outputValue = 0
    const averageWipCost = beforeWip.wipQty > 0 ? beforeWip.inputCost / beforeWip.inputQty : 0

    for (const line of values.lines) {
      const [product, destinationWarehouse] = await Promise.all([
        findActiveProductByCode(tx, line.productCode),
        findActiveWarehouseByCode(tx, line.destinationWarehouseCode, order.branch_id),
      ])
      const lineCost = line.netQty * averageWipCost
      outputQty += line.netQty
      outputValue += lineCost
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
          source_wip_qty: line.netQty,
          status: 'active',
          total_cost: lineCost,
          unit_cost: averageWipCost,
          updated_by: actor,
        },
      })
      if (product.metal_group === 'ทองแดง' || product.metal_group === 'ทองเหลือง') {
        await tx.stock_cost_pool_entries.create({
          data: {
            source_type: 'PRODUCTION',
            source_ref_type: 'PO2',
            source_ref_id: created.id.toString(),
            source_ref_no: outputDocNo,
            date: normalizeDate(values.date),
            branch_id: order.branch_id,
            warehouse_id: destinationWarehouse.id,
            product_id: product.id,
            lot_no: line.lotNo ?? null,
            original_qty: line.netQty,
            unit_cost: averageWipCost,
            original_value: lineCost,
            status: 'Available',
            created_by: actor,
            notes: values.notes ?? null,
          },
        })
      }
      ledgerRows.push(
        {
          branch_id: order.branch_id,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: line.lotNo ?? null,
          movement_type: 'PRODUCTION_OUTPUT_WIP_OUT',
          notes: values.notes ?? null,
          output_category: 'WIP',
          product_id: order.product_id,
          qty_out: line.netQty,
          ref_id: created.id.toString(),
          ref_no: outputDocNo,
          ref_type: 'PO2',
          unit_cost: averageWipCost,
          value_out: lineCost,
          warehouse_id: order.warehouse_wip_id,
        },
        {
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
          unit_cost: averageWipCost,
          value_in: lineCost,
          warehouse_id: destinationWarehouse.id,
        },
      )
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
          status: 'active',
          total_cost: lossCost,
          unit_cost: averageWipCost,
          updated_by: actor,
        },
      })
      ledgerRows.push({
        branch_id: order.branch_id,
        created_by: actor,
        date: normalizeDate(values.date),
        movement_type: 'PRODUCTION_LOSS',
        notes: values.notes ?? null,
        output_category: 'LOSS',
        product_id: order.product_id,
        qty_out: lossQty,
        ref_id: created.id.toString(),
        ref_no: outputDocNo,
        ref_type: 'PO2',
        unit_cost: averageWipCost,
        value_out: lossCost,
        warehouse_id: order.warehouse_wip_id,
      })
    }

    await tx.stock_ledger.createMany({ data: ledgerRows })
    const nextWipQty = beforeWip.wipQty - requestedWipQty
    const nextStatus = Math.abs(nextWipQty) <= 0.000001 && values.completeOrder ? 'Completed' : 'Partially Completed'
    await tx.production_orders.update({
      data: {
        status: nextStatus,
        total_output_value: { increment: outputValue },
        updated_by: actor,
        ...(nextStatus === 'Completed' ? { closed_at: new Date(), closed_by: actor } : {}),
      },
      where: { id: order.id },
    })
    await appendOrderStatusLog(tx, {
      action: nextStatus === 'Completed' ? 'completed' : 'output_created',
      actor,
      fromStatus: order.status,
      meta: { lossQty, outputDocNo, outputQty },
      orderDocNo: order.doc_no,
      orderId: order.id,
      toStatus: nextStatus,
    })
    return { lossQty, orderStatus: nextStatus, outputDocNo, outputQty, wipQty: nextWipQty }
  })
}

export async function reverseProductionOutput(orderDocNo: string, outputDocNo: string, values: ReverseProductionMovementValues, actor: string) {
  return prisma.$transaction(async (tx) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
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
            status: 'Reversed',
            updated_by: actor,
            updated_at: new Date(),
          },
          where: { id: poolEntry.id },
        })
      }
      const qty = toNumber(output.qty)
      const unitCost = toNumber(output.unit_cost)
      const totalCost = toNumber(output.total_cost) || qty * unitCost
      reverseCost += totalCost
      reverseQty += qty

      if (output.category_code !== 'LOSS') {
        if (!output.destination_warehouse_id) throw new ProductionOrderError(`รายการ ${outputDocNo} ไม่มีคลังปลายทาง ไม่สามารถ reverse ได้`)
        const stockStatus = output.category_code === 'RM' ? 'RM' : 'FG'
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
          unit_cost: unitCost,
          value_out: totalCost,
          warehouse_id: output.destination_warehouse_id,
        })
      }

      ledgerRows.push({
        branch_id: order.branch_id,
        created_by: actor,
        date: normalizeDate(values.date),
        lot_no: output.lot_no,
        movement_type: 'PRODUCTION_OUTPUT_REVERSE_WIP_IN',
        notes: values.reason,
        output_category: 'WIP',
        product_id: order.product_id,
        qty_in: toNumber(output.source_wip_qty) || qty,
        ref_id: output.id.toString(),
        ref_no: reversalDocNo,
        ref_type: 'PO2-REV',
        unit_cost: unitCost,
        value_in: totalCost,
        warehouse_id: order.warehouse_wip_id,
      })
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

export async function completeProductionOrder(orderDocNo: string, note: string | undefined, actor: string) {
  return prisma.$transaction(async (tx) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
    const wip = await productionWipBalance(tx, order.id)
    if (Math.abs(wip.wipQty) > 0.000001) throw new ProductionOrderError('ยังมี WIP คงเหลือ ไม่สามารถปิดงานได้')
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
  return prisma.$transaction(async (tx) => {
    const order = await findOrderByDocNo(tx, orderDocNo)
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

export async function productionOrderOptions() {
  const [branches, warehouses, products, machines, lines] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ code: 'asc' }], select: { active: true, code: true, id: true, name: true }, where: { active: true } }),
    prisma.warehouses.findMany({ orderBy: [{ code: 'asc' }], select: { active: true, branch_id: true, branches: { select: { code: true } }, code: true, id: true, name: true, type: true }, where: { active: true } }),
    prisma.products.findMany({ orderBy: [{ code: 'asc' }], select: { active: true, code: true, id: true, name: true }, where: { active: true } }),
    prisma.production_machines.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, id: true, name: true, type: true }, where: { active: true } }),
    prisma.production_lines.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, id: true, name: true }, where: { active: true } }),
  ])
  return {
    branches: branches.map((row) => ({ code: requireBusinessCode(row.code, `สาขา ${row.id}`), id: requireBusinessCode(row.code, `สาขา ${row.id}`), name: row.name })),
    machines: machines.map((row) => ({ code: row.name, id: row.name, name: row.name, type: row.type })),
    productionLines: lines.map((row) => ({ code: row.name, id: row.name, name: row.name })),
    products: products.map((row) => ({ code: requireBusinessCode(row.code, `สินค้า ${row.id}`), id: requireBusinessCode(row.code, `สินค้า ${row.id}`), name: row.name })),
    productionTypes: ['Sorting', 'Baling', 'Melting', 'Processing'],
    warehouses: warehouses.map((row) => ({ branchCode: row.branches?.code ?? null, code: row.code, id: row.code, name: row.name, type: row.type })),
  }
}

export async function productionProductStock(input: { branchCode: string; productCode: string; warehouseCode: string }) {
  const branch = await findActiveBranchByCode(prisma, input.branchCode.trim().toUpperCase())
  const product = await findActiveProductByCode(prisma, input.productCode.trim().toUpperCase())

  const warehouses = await prisma.warehouses.findMany({
    select: { id: true, code: true, name: true, type: true },
    where: { branch_id: branch.id, active: true },
    orderBy: { code: 'asc' },
  })

  const rows: Array<{
    avgCost: number
    qty: number
    status: string
    value: number
    warehouseCode: string
    warehouseName: string
  }> = []

  for (const warehouse of warehouses) {
    for (const status of ['RM', 'FG'] as const) {
      const snap = await stockSnapshot(prisma, {
        branchId: branch.id,
        productId: product.id,
        status,
        warehouseId: warehouse.id,
      })
      if (Math.abs(snap.qty) > 0.000001) {
        rows.push({
          avgCost: snap.unitCost,
          qty: snap.qty,
          status,
          value: snap.value,
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
        })
      }
    }
  }

  return {
    branchCode: branch.code,
    productCode: product.code,
    productName: product.name,
    rows,
    warehouseCode: input.warehouseCode,
  }
}
