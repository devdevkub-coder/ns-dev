import type { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { prisma } from '@/lib/server/prisma'
import { toDateOnly, toNumber } from '@/lib/server/daily'

export type ProductionReportFilters = {
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
  lossPct: number
  lossQty: number
  machineName: string
  normalLossPercent: number
  outputQty: number
  outputValue: number
  processCost: number
  productCode: string
  productName: string
  productionLineName: string
  productionType: string
  status: string
  totalCost: number
  variance: number
  warehouseName: string
  wipQty: number
  wipValue: number
  yieldPct: number
}

export function productionWhere(filters: ProductionReportFilters, branchId?: bigint | null): Prisma.production_ordersWhereInput {
  const machineId = parseInternalBigIntId(filters.machineId)
  return {
    ...(branchId != null ? { branch_id: branchId } : {}),
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

export async function loadProductionMetrics(filters: ProductionReportFilters = {}) {
  const branch = filters.branchId ? await findActiveBranchReferenceByCodeOrId(filters.branchId) : null
  const [orders, categories] = await Promise.all([
    prisma.production_orders.findMany({
      include: {
        branches: true,
        process_costs: true,
        production_inputs: true,
        production_lines: true,
        production_machines: true,
        production_outputs: { include: { products: true } },
        products: true,
        warehouses: true,
      },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      where: productionWhere(filters, branch?.id ?? null),
    }),
    prisma.production_output_categories.findMany(),
  ])
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  return orders.map((order): ProductionOrderMetric => {
    const inputQty = order.production_inputs.reduce((sum, input) => sum + toNumber(input.qty), 0)
    const inputCost = order.production_inputs.reduce((sum, input) => sum + toNumber(input.total_cost), 0) || toNumber(order.total_input_cost)
    const outputs = order.production_outputs.filter((output) => {
      const category = output.output_category != null ? categoryById.get(output.output_category) : null
      return output.output_status !== 'LOSS' && output.output_type !== 'Loss' && category?.stock_effect !== 'loss'
    })
    const losses = order.production_outputs.filter((output) => {
      const category = output.output_category != null ? categoryById.get(output.output_category) : null
      return output.output_status === 'LOSS' || output.output_type === 'Loss' || category?.stock_effect === 'loss'
    })
    const outputQty = outputs.reduce((sum, output) => sum + toNumber(output.qty), 0)
    const lossQty = losses.reduce((sum, output) => sum + toNumber(output.qty), 0)
    const outputValue = outputs.reduce((sum, output) => sum + toNumber(output.total_cost), 0) || toNumber(order.total_output_value)
    const processCost = order.process_costs
      .filter((cost) => cost.status !== 'reversed' && cost.include_in_production)
      .reduce((sum, cost) => sum + toNumber(cost.amount), 0)
    const totalCost = inputCost + processCost
    const wipQty = Math.max(0, inputQty - outputQty - lossQty)
    const inputUnitCost = inputQty > 0 ? inputCost / inputQty : 0

    return {
      branchName: order.branches?.name ?? '-',
      costAllocationMethod: order.cost_allocation_method ?? order.production_type ?? '-',
      costPerKg: outputQty > 0 ? totalCost / outputQty : 0,
      costBreakdown: Object.fromEntries(order.process_costs
        .filter((cost) => cost.status !== 'reversed' && cost.include_in_production)
        .reduce((map, cost) => map.set(cost.cost_type, (map.get(cost.cost_type) ?? 0) + toNumber(cost.amount)), new Map<string, number>())),
      date: toDateOnly(order.date),
      docNo: order.doc_no,
      id: order.doc_no,
      inputCost,
      inputQty,
      lossPct: inputQty > 0 ? lossQty / inputQty * 100 : 0,
      lossQty,
      machineName: order.production_machines?.name ?? '-',
      normalLossPercent: toNumber(order.normal_loss_percent),
      outputQty,
      outputValue,
      processCost,
      productCode: order.products?.code ?? '',
      productName: order.products?.name ?? '-',
      productionLineName: order.production_lines?.name ?? '-',
      productionType: order.production_type ?? '-',
      status: order.status ?? 'Open',
      totalCost,
      variance: outputValue - totalCost || toNumber(order.variance),
      warehouseName: order.warehouses?.name ?? '-',
      wipQty,
      wipValue: wipQty * inputUnitCost,
      yieldPct: inputQty > 0 ? outputQty / inputQty * 100 : 0,
    }
  })
}

export function summarizeProductionMetrics(rows: ProductionOrderMetric[]) {
  const inputQty = rows.reduce((sum, row) => sum + row.inputQty, 0)
  const outputQty = rows.reduce((sum, row) => sum + row.outputQty, 0)
  const lossQty = rows.reduce((sum, row) => sum + row.lossQty, 0)
  const inputCost = rows.reduce((sum, row) => sum + row.inputCost, 0)
  const processCost = rows.reduce((sum, row) => sum + row.processCost, 0)
  const totalCost = inputCost + processCost

  return {
    costPerKg: outputQty > 0 ? totalCost / outputQty : 0,
    count: rows.length,
    inputCost,
    inputQty,
    lossPct: inputQty > 0 ? lossQty / inputQty * 100 : 0,
    lossQty,
    outputQty,
    processCost,
    totalCost,
    wipQty: rows.reduce((sum, row) => sum + row.wipQty, 0),
    wipValue: rows.reduce((sum, row) => sum + row.wipValue, 0),
    yieldPct: inputQty > 0 ? outputQty / inputQty * 100 : 0,
  }
}
