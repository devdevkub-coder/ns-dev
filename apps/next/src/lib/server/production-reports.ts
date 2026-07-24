import type { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { prisma } from '@/lib/server/prisma'
import { toDateOnly, toNumber } from '@/lib/server/daily'

export type ProductionReportFilters = {
  allowedBranchIds?: bigint[] | null
  branchId?: string
  dateFrom?: string
  dateTo?: string
  machineId?: string
  status?: string
}

export type ProductionOrderMetric = {
  branchName: string
  costPerKg: number
  costBreakdown: Record<string, number>
  costAllocationMethod: string
  date: string
  docNo: string
  id: string
  inputCost: number
  inputQty: number
  ledgerBalanced: boolean
  ledgerMismatchQty: number
  lossPct: number
  lossQty: number
  lossValue: number
  machineName: string
  normalLossPercent: number
  outputProducts: ProductionOutputProductMetric[]
  outputQty: number
  outputValue: number
  processCost: number
  productionCostPerKg: number
  productCode: string
  productName: string
  productionLineName: string
  productionType: string
  rmCostPerKg: number
  status: string
  totalCost: number
  variance: number
  warehouseName: string
  wipQty: number
  wipValue: number
  yieldPct: number
  inputProducts: string
  machineId?: string | null
}

export type ProductionOutputProductMetric = {
  cost: number
  productCode: string
  productName: string
  qty: number
  unitCost: number
}

type ProductionLedgerMetric = {
  inputQty: number
  inputValue: number
  lossQty: number
  outputQty: number
  outputValue: number
  wipConsumedQty: number
  wipConsumedValue: number
}

type ProductionLedgerOutputProductMetric = ProductionOutputProductMetric

const emptyLedgerMetric = (): ProductionLedgerMetric => ({
  inputQty: 0,
  inputValue: 0,
  lossQty: 0,
  outputQty: 0,
  outputValue: 0,
  wipConsumedQty: 0,
  wipConsumedValue: 0,
})

export function productionWhere(filters: ProductionReportFilters, branchId?: bigint | null, machineId?: bigint | null): Prisma.production_ordersWhereInput {
  const requestedBranchAllowed = branchId != null && (filters.allowedBranchIds === undefined || filters.allowedBranchIds === null || filters.allowedBranchIds.some((allowedBranchId) => allowedBranchId === branchId))
  const scopedBranch = filters.allowedBranchIds === undefined || filters.allowedBranchIds === null
    ? {}
    : { branch_id: { in: filters.allowedBranchIds } }
  return {
    ...(branchId != null
      ? requestedBranchAllowed ? { branch_id: branchId } : { branch_id: { in: [] } }
      : scopedBranch),
    ...(machineId != null ? { machine_id: machineId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.dateFrom || filters.dateTo ? {
      date: {
        ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
        ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T00:00:00.000Z`) } : {}),
      },
    } : {}),
    NOT: { status: 'Cancelled' },
  }
}

async function resolveMachineId(machineId?: string) {
  const normalized = machineId?.trim()
  if (!normalized) return null
  const internalId = parseInternalBigIntId(normalized)
  const machine = await prisma.production_machines.findFirst({
    select: { id: true },
    where: internalId != null ? { active: true, id: internalId } : { active: true, name: normalized },
  })
  return machine?.id ?? BigInt(-1)
}

export async function loadProductionMetrics(filters: ProductionReportFilters = {}) {
  const [branch, machineId] = await Promise.all([
    filters.branchId ? findActiveBranchReferenceByCodeOrId(filters.branchId) : Promise.resolve(null),
    resolveMachineId(filters.machineId),
  ])
  const orders = await prisma.production_orders.findMany({
    select: {
      branches: { select: { name: true } },
      cost_allocation_method: true,
      date: true,
      doc_no: true,
      id: true,
      normal_loss_percent: true,
      process_costs: {
        select: {
          amount: true,
          cost_type: true,
          include_in_production: true,
          status: true,
        },
      },
      production_inputs: {
        select: {
          id: true,
          qty: true,
          total_cost: true,
          production_input_returns: {
            select: { qty: true, total_cost: true },
            where: { status: 'active' },
          },
          products: {
            select: {
              code: true,
              name: true,
            },
          },
        },
        where: { status: 'active' },
      },
      production_lines: { select: { name: true } },
      production_machines: { select: { id: true, name: true } },
      production_outputs: {
        select: {
          category_code: true,
          id: true,
          output_category: true,
          output_status: true,
          output_type: true,
          qty: true,
          source_wip_qty: true,
          total_cost: true,
        },
        where: { status: 'active' },
      },
      production_type: true,
      products: { select: { code: true, name: true } },
      status: true,
      variance: true,
      warehouses: { select: { name: true } },
    },
    orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
    where: productionWhere(filters, branch?.id ?? null, machineId),
  })
  const inputOwnerById = new Map<string, string>()
  const outputOwnerById = new Map<string, string>()
  const factMetricByOrder = new Map<string, ProductionLedgerMetric>()
  orders.forEach((order) => {
    const orderKey = order.id.toString()
    const factMetric = emptyLedgerMetric()
    order.production_inputs.forEach((input) => {
      inputOwnerById.set(input.id.toString(), orderKey)
      const returnedQty = input.production_input_returns.reduce((sum, returned) => sum + toNumber(returned.qty), 0)
      const returnedCost = input.production_input_returns.reduce((sum, returned) => sum + toNumber(returned.total_cost), 0)
      factMetric.inputQty += Math.max(0, toNumber(input.qty) - returnedQty)
      factMetric.inputValue += Math.max(0, toNumber(input.total_cost) - returnedCost)
    })
    order.production_outputs.forEach((output) => {
      outputOwnerById.set(output.id.toString(), orderKey)
      const sourceWipQty = toNumber(output.source_wip_qty) || toNumber(output.qty)
      const totalCost = toNumber(output.total_cost)
      factMetric.wipConsumedQty += sourceWipQty
      factMetric.wipConsumedValue += totalCost
      if (output.category_code === 'LOSS' || output.output_status === 'LOSS' || output.output_type === 'Loss') {
        factMetric.lossQty += sourceWipQty
      } else {
        factMetric.outputQty += toNumber(output.qty)
        factMetric.outputValue += totalCost
      }
    })
    factMetricByOrder.set(orderKey, factMetric)
  })
  const ledgerMetricByOrder = new Map<string, ProductionLedgerMetric>()
  const outputProductsByOrder = new Map<string, ProductionLedgerOutputProductMetric[]>()
  const ledgerRows = inputOwnerById.size || outputOwnerById.size
    ? await prisma.stock_ledger.findMany({
        select: {
          movement_type: true,
          products: { select: { code: true, name: true } },
          qty_in: true,
          qty_out: true,
          ref_id: true,
          ref_type: true,
          value_in: true,
          value_out: true,
        },
        where: {
          OR: [
            ...(inputOwnerById.size ? [{ ref_id: { in: [...inputOwnerById.keys()] }, ref_type: 'PI' }] : []),
            ...(outputOwnerById.size ? [{ ref_id: { in: [...outputOwnerById.keys()] }, ref_type: 'PO2' }] : []),
          ],
        },
      })
    : []
  ledgerRows.forEach((row) => {
    const refId = String(row.ref_id ?? '')
    const orderKey = row.ref_type === 'PI' ? inputOwnerById.get(refId) : outputOwnerById.get(refId)
    if (!orderKey) return
    const metric = ledgerMetricByOrder.get(orderKey) ?? emptyLedgerMetric()
    if (row.ref_type === 'PI' && row.movement_type === 'WIP_IN') {
      metric.inputQty += toNumber(row.qty_in)
      metric.inputValue += toNumber(row.value_in)
    } else if (row.ref_type === 'PO2' && row.movement_type === 'PRODUCTION_OUTPUT_WIP_OUT') {
      metric.wipConsumedQty += toNumber(row.qty_out)
      metric.wipConsumedValue += toNumber(row.value_out)
    } else if (row.ref_type === 'PO2' && row.movement_type === 'PRODUCTION_LOSS') {
      metric.lossQty += toNumber(row.qty_out)
      metric.wipConsumedQty += toNumber(row.qty_out)
      metric.wipConsumedValue += toNumber(row.value_out)
    } else if (row.ref_type === 'PO2' && ['PRODUCTION_OUTPUT_IN', 'PRODUCTION_OUTPUT_RM_IN'].includes(row.movement_type ?? '')) {
      const qty = toNumber(row.qty_in)
      const cost = toNumber(row.value_in)
      metric.outputQty += qty
      metric.outputValue += cost
      const products = outputProductsByOrder.get(orderKey) ?? []
      products.push({
        cost,
        productCode: row.products?.code ?? '',
        productName: row.products?.name ?? '-',
        qty,
        unitCost: qty > 0 ? cost / qty : 0,
      })
      outputProductsByOrder.set(orderKey, products)
    }
    ledgerMetricByOrder.set(orderKey, metric)
  })

  return orders.map((order): ProductionOrderMetric => {
    const orderKey = order.id.toString()
    const facts = factMetricByOrder.get(orderKey) ?? emptyLedgerMetric()
    const ledgers = ledgerMetricByOrder.get(orderKey) ?? emptyLedgerMetric()
    const inputQty = ledgers.inputQty
    const inputCost = ledgers.inputValue
    const outputQty = ledgers.outputQty
    const lossQty = ledgers.lossQty
    const outputValue = ledgers.outputValue
    const processCost = order.process_costs
      .filter((cost) => cost.status !== 'reversed' && cost.include_in_production)
      .reduce((sum, cost) => sum + toNumber(cost.amount), 0)
    const totalCost = inputCost + processCost
    const rmCostPerKg = inputQty > 0 ? inputCost / inputQty : 0
    const productionCostPerKg = outputQty > 0 ? totalCost / outputQty : 0
    const lossValue = lossQty * rmCostPerKg
    const rawWipQty = inputQty - ledgers.wipConsumedQty
    const rawWipValue = inputCost - ledgers.wipConsumedValue
    const wipQty = Math.max(0, rawWipQty)
    const ledgerMismatchQty = Math.abs((facts.inputQty - facts.wipConsumedQty) - rawWipQty)
    const ledgerBalanced = ledgerMismatchQty <= 0.000001
    const wipValue = Math.max(0, rawWipValue)

    return {
      branchName: order.branches?.name ?? '-',
      costAllocationMethod: order.cost_allocation_method ?? order.production_type ?? '-',
      costPerKg: productionCostPerKg,
      costBreakdown: Object.fromEntries(order.process_costs
        .filter((cost) => cost.status !== 'reversed' && cost.include_in_production)
        .reduce((map, cost) => map.set(cost.cost_type, (map.get(cost.cost_type) ?? 0) + toNumber(cost.amount)), new Map<string, number>())),
      date: toDateOnly(order.date),
      docNo: order.doc_no,
      id: order.doc_no,
      inputCost,
      inputQty,
      ledgerBalanced,
      ledgerMismatchQty,
      lossPct: inputQty > 0 ? lossQty / inputQty * 100 : 0,
      lossQty,
      lossValue,
      machineName: order.production_machines?.name ?? '-',
      normalLossPercent: toNumber(order.normal_loss_percent),
      outputProducts: outputProductsByOrder.get(orderKey) ?? [],
      outputQty,
      outputValue,
      processCost,
      productionCostPerKg,
      productCode: order.products?.code ?? '',
      productName: order.products?.name ?? '-',
      productionLineName: order.production_lines?.name ?? '-',
      productionType: order.production_type ?? '-',
      rmCostPerKg,
      status: order.status ?? 'Open',
      totalCost,
      variance: outputValue - totalCost,
      warehouseName: order.warehouses?.name ?? '-',
      wipQty,
      wipValue,
      yieldPct: inputQty > 0 ? outputQty / inputQty * 100 : 0,
      inputProducts: Array.from(new Set(order.production_inputs.map(input => input.products?.name).filter(Boolean))).join(', ') || '-',
      machineId: order.production_machines?.id?.toString() ?? null,
    }
  })
}

export async function loadProductionTotalWipQty(filters: Pick<ProductionReportFilters, 'allowedBranchIds'> = {}) {
  const orders = await prisma.production_orders.findMany({
    select: {
      id: true,
      production_inputs: {
        select: {
          id: true,
          production_input_returns: {
            select: { qty: true },
            where: { status: 'active' },
          },
        },
        where: { status: 'active' },
      },
      production_outputs: {
        select: { id: true },
        where: { status: 'active' },
      },
    },
    where: {
      ...(filters.allowedBranchIds === undefined || filters.allowedBranchIds === null ? {} : { branch_id: { in: filters.allowedBranchIds } }),
      OR: [
        { status: null },
        { status: { notIn: ['Closed', 'Completed', 'Cancelled'] } },
      ],
    },
  })

  const inputOwnerById = new Map<string, string>()
  const outputOwnerById = new Map<string, string>()
  orders.forEach((order) => {
    const orderKey = order.id.toString()
    order.production_inputs.forEach((input) => inputOwnerById.set(input.id.toString(), orderKey))
    order.production_outputs.forEach((output) => outputOwnerById.set(output.id.toString(), orderKey))
  })

  if (!inputOwnerById.size && !outputOwnerById.size) return 0

  const wipByOrder = new Map<string, { inputQty: number; consumedQty: number; returnedQty: number }>()
  const ledgerRows = await prisma.stock_ledger.findMany({
    select: {
      movement_type: true,
      qty_in: true,
      qty_out: true,
      ref_id: true,
      ref_type: true,
    },
    where: {
      OR: [
        ...(inputOwnerById.size ? [{ ref_id: { in: [...inputOwnerById.keys()] }, ref_type: 'PI' }] : []),
        ...(outputOwnerById.size ? [{ ref_id: { in: [...outputOwnerById.keys()] }, ref_type: 'PO2' }] : []),
      ],
    },
  })

  ledgerRows.forEach((row) => {
    const refId = String(row.ref_id ?? '')
    const orderKey = row.ref_type === 'PI' ? inputOwnerById.get(refId) : outputOwnerById.get(refId)
    if (!orderKey) return
    const metric = wipByOrder.get(orderKey) ?? { consumedQty: 0, inputQty: 0, returnedQty: 0 }
    if (row.ref_type === 'PI' && row.movement_type === 'WIP_IN') {
      metric.inputQty += toNumber(row.qty_in)
    } else if (row.ref_type === 'PO2' && ['PRODUCTION_OUTPUT_WIP_OUT', 'PRODUCTION_LOSS'].includes(row.movement_type ?? '')) {
      metric.consumedQty += toNumber(row.qty_out)
    }
    wipByOrder.set(orderKey, metric)
  })

  orders.forEach((order) => {
    const orderKey = order.id.toString()
    const metric = wipByOrder.get(orderKey) ?? { consumedQty: 0, inputQty: 0, returnedQty: 0 }
    metric.returnedQty += order.production_inputs.reduce((sum, input) => sum + input.production_input_returns.reduce((subtotal, returned) => subtotal + toNumber(returned.qty), 0), 0)
    wipByOrder.set(orderKey, metric)
  })

  return Array.from(wipByOrder.values()).reduce((sum, row) => sum + Math.max(0, row.inputQty - row.returnedQty - row.consumedQty), 0)
}

export function summarizeProductionMetrics(rows: ProductionOrderMetric[]) {
  const inputQty = rows.reduce((sum, row) => sum + row.inputQty, 0)
  const outputQty = rows.reduce((sum, row) => sum + row.outputQty, 0)
  const lossQty = rows.reduce((sum, row) => sum + row.lossQty, 0)
  const inputCost = rows.reduce((sum, row) => sum + row.inputCost, 0)
  const lossValue = rows.reduce((sum, row) => sum + row.lossValue, 0)
  const processCost = rows.reduce((sum, row) => sum + row.processCost, 0)
  const totalCost = inputCost + processCost

  return {
    costPerKg: outputQty > 0 ? totalCost / outputQty : 0,
    count: rows.length,
    inputCost,
    inputQty,
    lossPct: inputQty > 0 ? lossQty / inputQty * 100 : 0,
    lossQty,
    lossValue,
    outputQty,
    processCost,
    productionCostPerKg: outputQty > 0 ? totalCost / outputQty : 0,
    rmCostPerKg: inputQty > 0 ? inputCost / inputQty : 0,
    totalCost,
    wipQty: rows.reduce((sum, row) => sum + row.wipQty, 0),
    wipValue: rows.reduce((sum, row) => sum + row.wipValue, 0),
    yieldPct: inputQty > 0 ? outputQty / inputQty * 100 : 0,
  }
}

export function summarizeProductionOutputProducts(rows: ProductionOrderMetric[]) {
  const grouped = new Map<string, { batches: number; code: string; cost: number; name: string; qty: number }>()
  rows.forEach((row) => {
    row.outputProducts.forEach((output) => {
      const key = output.productCode || output.productName
      const current = grouped.get(key) ?? { batches: 0, code: output.productCode, cost: 0, name: output.productName, qty: 0 }
      current.batches += 1
      current.qty += output.qty
      current.cost += output.cost
      grouped.set(key, current)
    })
  })
  return Array.from(grouped.values())
    .map((item) => ({ ...item, unitCost: item.qty > 0 ? item.cost / item.qty : 0 }))
    .sort((left, right) => right.qty - left.qty)
}
