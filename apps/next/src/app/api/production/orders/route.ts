import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { createProductionOrder, createProductionOrderSchema, ProductionOrderError } from '@/lib/server/production-orders'
import { parseProductionOrdersQuery } from '@/lib/server/production-orders-query'
import { listActiveBranches, listActiveBranchesByCodes, listWarehouseMasterRecords } from '@/lib/server/reference-master-cache'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

const productionOutputCategories = [
  { availableForSale: true, code: 'FG', name: 'FG', stockEffect: 'stock_in' },
  { availableForSale: true, code: 'RM', name: 'RM', stockEffect: 'stock_in' },
  { availableForSale: false, code: 'LOSS', name: 'LOSS', stockEffect: 'loss' },
]
const noMachineLabel = 'ไม่มีเครื่องจักร'
const noProductionLineLabel = 'ไม่มีไลน์ผลิต'
type ProductionHistoryLine = { productCode: string; productName: string; stockCategory: string; qty: number; unitCost: number; totalCost: number; warehouseName: string }
type ProductionHistoryDetail = { label: string; value: string }

function productionHistoryLines(meta: Prisma.JsonValue | null | undefined, field = 'lines'): ProductionHistoryLine[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return []
  const values = meta as Record<string, unknown>
  if (!Array.isArray(values[field])) return []
  return values[field].flatMap((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return []
    const candidate = line as Record<string, unknown>
    if (typeof candidate.productCode !== 'string' || typeof candidate.productName !== 'string' || typeof candidate.stockCategory !== 'string' || typeof candidate.qty !== 'number' || typeof candidate.unitCost !== 'number' || typeof candidate.totalCost !== 'number' || typeof candidate.warehouseName !== 'string') return []
    return [{
      productCode: candidate.productCode,
      productName: candidate.productName,
      stockCategory: candidate.stockCategory,
      qty: candidate.qty,
      unitCost: candidate.unitCost,
      totalCost: candidate.totalCost,
      warehouseName: candidate.warehouseName,
    }]
  })
}

function productionHistoryDetails(meta: Prisma.JsonValue | null | undefined): ProductionHistoryDetail[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return []
  const values = meta as Record<string, unknown>
  const fields: Array<[string, string]> = [
    ['สินค้า', 'productName'],
    ['รหัสสินค้า', 'productCode'],
    ['สาขา', 'branchName'],
    ['คลังรับผลผลิต', 'destinationWarehouseName'],
    ['กะการผลิต', 'shift'],
    ['เครื่องจักร', 'machineName'],
    ['ไลน์ผลิต', 'productionLineName'],
  ]
  return fields.flatMap(([label, key]) => typeof values[key] === 'string' && values[key] ? [{ label, value: values[key] as string }] : [])
}

const productionOrderInclude = {
  branches: true,
  products: true,
  production_lines: true,
  production_inputs: { include: { products: true, production_input_returns: { where: { status: 'active' } } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] },
  production_outputs: { include: { products: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], where: { status: 'active' } },
  production_order_status_logs: { orderBy: [{ created_at: 'desc' }, { id: 'desc' }] },
  production_machines: true,
  warehouses: true,
} satisfies Prisma.production_ordersInclude

const productionOrderListSelect = {
  branches: { select: { code: true, name: true } },
  closed_at: true,
  created_at: true,
  date: true,
  doc_no: true,
  id: true,
  machine_id: true,
  notes: true,
  production_machines: { select: { name: true, type: true } },
  production_lines: { select: { name: true } },
  product_id: true,
  products: { select: { code: true, name: true } },
  qty_planned: true,
  status: true,
  warehouse_id: true,
  warehouses: { select: { name: true } },
} satisfies Prisma.production_ordersSelect

type ProductionOrderRecord = Prisma.production_ordersGetPayload<{ include: typeof productionOrderInclude }>
type ProductionOrderListRecord = Prisma.production_ordersGetPayload<{ select: typeof productionOrderListSelect }>

type ProductionInputAggregate = {
  _count: { _all: number }
  _sum: { qty: Prisma.Decimal | null; total_cost: Prisma.Decimal | null }
  order_id: bigint | null
}
type ProductionMovementDate = { order_id: bigint | null; date: Date }

type ProductionOutputAggregate = {
  _count: { _all: number }
  _sum: { qty: Prisma.Decimal | null; source_wip_qty: Prisma.Decimal | null; total_cost: Prisma.Decimal | null }
  category_code: string | null
  order_id: bigint | null
}
type ProductionInputReturnAggregate = {
  _sum: { qty: Prisma.Decimal | null; total_cost: Prisma.Decimal | null }
  order_id: bigint | null
}

function buildWipSummaryGroups(inputs: ProductionOrderRecord['production_inputs'], outputs: ProductionOrderRecord['production_outputs'], warehouseById: Map<string, { code: string; name: string }>) {
  const groups = new Map<string, {
    avgCost: number
    consumedWipQty: number
    consumedWipCost: number
    docNos: Set<string>
    inputCost: number
    inputQty: number
    productCode: string
    productName: string
    stockCategory: string
    warehouseCode: string
    warehouseName: string
  }>()

  for (const input of inputs.filter((candidate) => candidate.status === 'active')) {
    if (!input.product_id) throw new Error(`รายการเบิกวัตถุดิบ ${input.doc_no} ไม่มีสินค้าอ้างอิง`)
    const stockCategory = input.stock_category ?? ''
    const warehouseName = input.source_warehouse_id ? warehouseById.get(input.source_warehouse_id.toString())?.name ?? '-' : '-'
    const productCode = input.products?.code ? requireBusinessCode(input.products.code, `สินค้า ${input.product_id}`) : ''
    const key = `${input.product_id.toString()}|${stockCategory}|${input.source_warehouse_id?.toString() ?? ''}`
    const current = groups.get(key) ?? {
      avgCost: 0,
      consumedWipQty: 0,
      consumedWipCost: 0,
      docNos: new Set<string>(),
      inputCost: 0,
      inputQty: 0,
      productCode,
      productName: input.products?.name ?? '-',
      stockCategory,
      warehouseCode: input.source_warehouse_id ? warehouseById.get(input.source_warehouse_id.toString())?.code ?? '' : '',
      warehouseName,
    }
    current.docNos.add(input.doc_no)
    const returnedQty = input.production_input_returns.reduce((sum, returned) => sum + toNumber(returned.qty), 0)
    const returnedCost = input.production_input_returns.reduce((sum, returned) => sum + toNumber(returned.total_cost), 0)
    current.inputQty += Math.max(0, toNumber(input.qty) - returnedQty)
    current.inputCost += Math.max(0, toNumber(input.total_cost) - returnedCost)
    groups.set(key, current)
  }

  for (const output of outputs.filter((candidate) => candidate.status === 'active')) {
    if (Array.isArray(output.source_wip_allocations)) {
      for (const allocation of output.source_wip_allocations as unknown[]) {
        if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) continue
        const item = allocation as { productCode?: string; stockCategory?: string; warehouseCode?: string; qty?: number; totalCost?: number; unitCost?: number }
        const current = [...groups.values()].find((group) => group.productCode === item.productCode && group.stockCategory === item.stockCategory && group.warehouseCode === item.warehouseCode)
        if (current) {
          const qty = typeof item.qty === 'number' ? item.qty : 0
          current.consumedWipQty += qty
          current.consumedWipCost += typeof item.totalCost === 'number' ? item.totalCost : qty * (typeof item.unitCost === 'number' ? item.unitCost : 0)
        }
      }
      continue
    }
    if (output.source_product_id && output.source_stock_category && output.source_warehouse_id) {
      const key = `${output.source_product_id.toString()}|${output.source_stock_category}|${output.source_warehouse_id.toString()}`
      const current = groups.get(key)
      if (current) {
        const qty = toNumber(output.source_wip_qty)
        current.consumedWipQty += qty
        current.consumedWipCost += qty * toNumber(output.unit_cost)
      }
    }
  }

  return [...groups.values()].map((group) => ({
    avgCost: group.inputQty > group.consumedWipQty
      ? Math.max(0, group.inputCost - group.consumedWipCost) / (group.inputQty - group.consumedWipQty)
      : 0,
    consumedWipQty: group.consumedWipQty,
    docNos: [...group.docNos],
    inputQty: group.inputQty,
    productCode: group.productCode,
    productName: group.productName,
    stockCategory: group.stockCategory,
    warehouseCode: group.warehouseCode,
    warehouseName: group.warehouseName,
    wipValue: Math.max(0, group.inputCost - group.consumedWipCost),
    wipQty: Math.max(0, group.inputQty - group.consumedWipQty),
  }))
}

function mapProductionOrderListRows(
  rows: ProductionOrderListRecord[],
  inputs: ProductionInputAggregate[],
  outputs: ProductionOutputAggregate[],
  returns: ProductionInputReturnAggregate[],
  movementDates: ProductionMovementDate[],
) {
  const inputByOrder = new Map(inputs.map((row) => [row.order_id?.toString() ?? '', row]))
  const returnByOrder = new Map(returns.map((row) => [row.order_id?.toString() ?? '', row]))
  const outputByOrder = new Map<string, ProductionOutputAggregate[]>()
  const startDateByOrder = new Map<string, string>()
  for (const movement of movementDates) {
    if (!movement.order_id) continue
    const key = movement.order_id.toString()
    const date = toDateOnly(movement.date)
    const current = startDateByOrder.get(key)
    if (!current || date < current) startDateByOrder.set(key, date)
  }
  for (const row of outputs) {
    const key = row.order_id?.toString() ?? ''
    outputByOrder.set(key, [...(outputByOrder.get(key) ?? []), row])
  }

  return rows.map((row) => {
    const key = row.id.toString()
    const input = inputByOrder.get(key)
    const returned = returnByOrder.get(key)
    const outputRows = outputByOrder.get(key) ?? []
    const inputQty = Math.max(0, toNumber(input?._sum.qty) - toNumber(returned?._sum.qty))
    const inputCost = Math.max(0, toNumber(input?._sum.total_cost) - toNumber(returned?._sum.total_cost))
    const outputQty = outputRows
      .filter((output) => output.category_code !== 'LOSS')
      .reduce((sum, output) => sum + toNumber(output._sum.qty), 0)
    const consumedWipQty = outputRows.reduce((sum, output) => sum + toNumber(output._sum.source_wip_qty), 0)
    const lossQty = outputRows
      .filter((output) => output.category_code === 'LOSS')
      .reduce((sum, output) => sum + (toNumber(output._sum.source_wip_qty) || toNumber(output._sum.qty)), 0)
    const outputValue = outputRows
      .filter((output) => output.category_code !== 'LOSS')
      .reduce((sum, output) => sum + toNumber(output._sum.total_cost), 0)
    const consumedWipValue = outputRows.reduce((sum, output) => sum + toNumber(output._sum.total_cost), 0)
    const wipQty = inputQty - consumedWipQty
    const wipValue = inputCost - consumedWipValue
    const outputCategories = [...new Set(outputRows.map((output) => output.category_code).filter((value): value is string => Boolean(value)))]

    return {
      branchCode: row.branches?.code ?? '',
      branchName: row.branches?.name ?? '-',
      closedAt: row.closed_at?.toISOString() ?? null,
      createdAt: row.created_at?.toISOString() ?? null,
      date: toDateOnly(row.date),
      startDate: startDateByOrder.get(key) ?? null,
      docNo: row.doc_no,
      id: row.doc_no,
      consumedWipQty,
      inputCost,
      inputCount: input?._count._all ?? 0,
      inputs: [],
      history: [],
      inputQty,
      wipSummary: { avgCost: wipQty > 0 ? Math.max(0, wipValue) / wipQty : 0, consumedWipQty, groups: [], inputQty, wipQty },
      lossQty,
      machineName: row.production_machines?.name ?? noMachineLabel,
      machineType: row.production_machines?.type ?? '',
      productionLineName: row.production_lines?.name ?? noProductionLineLabel,
      notes: row.notes ?? '',
      outputCategories: outputCategories.map((code) => ({ code, name: code })),
      outputCount: outputRows.reduce((sum, output) => sum + output._count._all, 0),
      outputs: [],
      outputQty,
      outputValue,
      productCode: row.products?.code ?? '',
      productId: row.products?.code ? requireBusinessCode(row.products.code, `สินค้า ${row.product_id}`) : '',
      productName: row.products?.name ?? '-',
      qtyPlanned: toNumber(row.qty_planned),
      status: row.status ?? 'Open',
      variance: outputValue - inputCost,
      warehouseName: row.warehouses?.name ?? '-',
      wipQty,
      wipValue,
      yieldPct: inputQty > 0 ? outputQty / inputQty * 100 : 0,
    }
  })
}

function mapProductionOrderRows(rows: ProductionOrderRecord[], warehouseById: Map<string, { code: string; name: string }>, actorNameByEmail: Map<string, string>) {
  return rows.map((row) => {
    const inputHistoryLinesByDocNo = new Map<string, ProductionHistoryLine[]>()
    for (const input of row.production_inputs) {
      const lines = inputHistoryLinesByDocNo.get(input.doc_no) ?? []
      lines.push({
        productCode: input.products?.code ?? '',
        productName: input.products?.name ?? '-',
        stockCategory: input.stock_category ?? '',
        qty: toNumber(input.qty),
        unitCost: toNumber(input.unit_cost),
        totalCost: toNumber(input.total_cost),
        warehouseName: input.source_warehouse_id ? warehouseById.get(input.source_warehouse_id.toString())?.name ?? '-' : '-',
      })
      inputHistoryLinesByDocNo.set(input.doc_no, lines)
    }
    const outputHistoryLinesByDocNo = new Map<string, ProductionHistoryLine[]>()
    for (const output of row.production_outputs.filter((candidate) => candidate.category_code !== 'LOSS')) {
      const lines = outputHistoryLinesByDocNo.get(output.doc_no) ?? []
      const qty = toNumber(output.qty)
      lines.push({
        productCode: output.products?.code ?? '',
        productName: output.products?.name ?? '-',
        stockCategory: output.category_code ?? '',
        qty,
        unitCost: qty > 0 ? toNumber(output.total_cost) / qty : 0,
        totalCost: toNumber(output.total_cost),
        warehouseName: output.destination_warehouse_id ? warehouseById.get(output.destination_warehouse_id.toString())?.name ?? '-' : '-',
      })
      outputHistoryLinesByDocNo.set(output.doc_no, lines)
    }
    const activeInputs = row.production_inputs.filter((input) => input.status === 'active')
    const productionDates = row.production_outputs.map((output) => output.date).sort((left, right) => left.getTime() - right.getTime())
    const inputQty = activeInputs.reduce((sum, input) => sum + Math.max(0, toNumber(input.qty) - input.production_input_returns.reduce((subtotal, returned) => subtotal + toNumber(returned.qty), 0)), 0)
    const inputCost = activeInputs.reduce((sum, input) => sum + Math.max(0, toNumber(input.total_cost) - input.production_input_returns.reduce((subtotal, returned) => subtotal + toNumber(returned.total_cost), 0)), 0)
    const outputQty = row.production_outputs
      .filter((output) => output.category_code !== 'LOSS')
      .reduce((sum, output) => sum + toNumber(output.qty), 0)
    const consumedWipQty = row.production_outputs.reduce((sum, output) => sum + toNumber(output.source_wip_qty), 0)
    const lossQty = row.production_outputs
      .filter((output) => output.category_code === 'LOSS')
      .reduce((sum, output) => sum + (toNumber(output.source_wip_qty) || toNumber(output.qty)), 0)
    const outputValue = row.production_outputs
      .filter((output) => output.category_code !== 'LOSS')
      .reduce((sum, output) => sum + toNumber(output.total_cost), 0)
    const consumedWipValue = row.production_outputs.reduce((sum, output) => sum + toNumber(output.total_cost), 0)
    const wipQty = inputQty - consumedWipQty
    const wipValue = inputCost - consumedWipValue
    const outputCategories = [...new Set(row.production_outputs.map((output) => String(output.output_category ?? '')).filter((value) => value.length > 0))]
    const receivedWarehouseNames = [...new Set(
      row.production_outputs
        .filter((output) => output.category_code !== 'LOSS' && output.destination_warehouse_id)
        .map((output) => warehouseById.get(output.destination_warehouse_id!.toString())?.name ?? '')
        .filter((name) => name.length > 0),
    )]
    const wipSummaryGroups = buildWipSummaryGroups(row.production_inputs, row.production_outputs, warehouseById)

    return {
      branchCode: row.branches?.code ?? '',
      branchName: row.branches?.name ?? '-',
      closedAt: row.closed_at?.toISOString() ?? null,
      createdAt: row.created_at?.toISOString() ?? null,
      date: toDateOnly(row.date),
      startDate: productionDates[0] ? toDateOnly(productionDates[0]) : null,
      docNo: row.doc_no,
      id: row.doc_no,
      consumedWipQty,
      inputCost,
      inputCount: activeInputs.length,
      inputs: row.production_inputs.map((input) => ({
        createdAt: input.created_at?.toISOString() ?? null,
        date: toDateOnly(input.date),
        docNo: input.doc_no,
        id: input.id.toString(),
        lotNo: input.lot_no ?? '',
        productCode: input.products?.code ? requireBusinessCode(input.products.code, `สินค้า ${input.product_id}`) : '',
        productName: input.products?.name ?? '-',
        qty: toNumber(input.qty),
        returnedQty: input.production_input_returns.reduce((sum, returned) => sum + toNumber(returned.qty), 0),
        returnableQty: Math.max(0, toNumber(input.qty) - input.production_input_returns.reduce((sum, returned) => sum + toNumber(returned.qty), 0)),
        status: input.status,
        stockStatus: input.stock_category ?? '',
        totalCost: toNumber(input.total_cost),
        unitCost: toNumber(input.unit_cost),
        warehouseCode: input.source_warehouse_id ? warehouseById.get(input.source_warehouse_id.toString())?.code ?? '' : '',
        warehouseName: input.source_warehouse_id ? warehouseById.get(input.source_warehouse_id.toString())?.name ?? '-' : '-',
      })),
      inputQty,
      history: row.production_order_status_logs.map((log) => {
        const meta = log.meta && typeof log.meta === 'object' && !Array.isArray(log.meta) ? log.meta : null
        const savedDetails = productionHistoryDetails(meta)
        const details = savedDetails.length > 0 || log.action !== 'created' ? savedDetails : [
          { label: 'สินค้า', value: row.products?.name ?? '-' },
          { label: 'รหัสสินค้า', value: row.products?.code ?? '-' },
          { label: 'สาขา', value: row.branches?.name ?? '-' },
          { label: 'คลังรับผลผลิต', value: row.warehouses?.name ?? '-' },
          { label: 'กะการผลิต', value: row.shift ?? '-' },
          { label: 'เครื่องจักร', value: row.production_machines?.name ?? noMachineLabel },
          { label: 'ไลน์ผลิต', value: row.production_lines?.name ?? noProductionLineLabel },
        ]
        const documentNo = meta && typeof meta.inputDocNo === 'string'
          ? meta.inputDocNo
          : meta && Array.isArray(meta.inputDocNos) && typeof meta.inputDocNos[0] === 'string'
            ? meta.inputDocNos[0]
            : meta && typeof meta.outputDocNo === 'string'
              ? meta.outputDocNo
              : null
        const totalQty = meta && typeof meta.totalQty === 'number'
          ? meta.totalQty
          : meta && typeof meta.returnQty === 'number'
            ? meta.returnQty
            : null
        const totalCost = meta && typeof meta.totalCost === 'number'
          ? meta.totalCost
          : meta && typeof meta.returnCost === 'number'
            ? meta.returnCost
            : null
        const savedLines = productionHistoryLines(meta)
        const sourceWipLines = productionHistoryLines(meta, 'sourceWipLines')
        const lines = savedLines.length > 0
          ? savedLines
          : documentNo
            ? inputHistoryLinesByDocNo.get(documentNo) ?? outputHistoryLinesByDocNo.get(documentNo) ?? []
            : []
        return {
          action: log.action,
          createdAt: log.created_at.toISOString(),
          createdBy: log.created_by,
          createdByName: actorNameByEmail.get(log.created_by?.trim().toLowerCase() ?? '') ?? '-',
          details,
          fromStatus: log.from_status,
          note: log.note,
          averageCost: meta && typeof meta.averageCost === 'number' ? meta.averageCost : totalQty && totalCost != null ? totalCost / totalQty : null,
          documentNo,
          lossQty: meta && typeof meta.lossQty === 'number' ? meta.lossQty : null,
          outputQty: meta && typeof meta.outputQty === 'number' ? meta.outputQty : null,
          productionCost: meta && typeof meta.productionCost === 'number' ? meta.productionCost : null,
          reverseCost: meta && typeof meta.reverseCost === 'number' ? meta.reverseCost : null,
          reverseQty: meta && typeof meta.reverseQty === 'number' ? meta.reverseQty : null,
          reversalDocNo: meta && typeof meta.reversalDocNo === 'string' ? meta.reversalDocNo : null,
          sourceWipQty: meta && typeof meta.sourceWipQty === 'number' ? meta.sourceWipQty : null,
          stockReceiptValue: meta && typeof meta.stockReceiptValue === 'number' ? meta.stockReceiptValue : null,
          totalCost,
          totalQty,
          lines,
          sourceWipLines,
          warehouseNames: meta && Array.isArray(meta.sourceWarehouseNames)
            ? meta.sourceWarehouseNames.filter((value): value is string => typeof value === 'string')
            : null,
          toStatus: log.to_status,
        }
      }),
      wipSummary: { avgCost: wipQty > 0 ? Math.max(0, wipValue) / wipQty : 0, consumedWipQty, groups: wipSummaryGroups, inputQty, wipQty },
      lossQty,
      machineName: row.production_machines?.name ?? noMachineLabel,
      notes: row.notes ?? '',
      productionLineName: row.production_lines?.name ?? noProductionLineLabel,
      outputCategories: outputCategories.map((code) => ({
        code,
        name: String(code),
      })),
      outputCount: row.production_outputs.length,
      outputs: row.production_outputs.map((output) => ({
        categoryCode: output.category_code ?? output.output_category ?? '',
        createdAt: output.created_at?.toISOString() ?? null,
        date: toDateOnly(output.date),
        docNo: output.doc_no,
        lotNo: output.lot_no ?? '',
        outputType: output.output_type ?? '',
        productCode: output.products?.code ? requireBusinessCode(output.products.code, `สินค้า ${output.product_id}`) : '',
        productName: output.products?.name ?? '-',
        sourceWipAllocations: Array.isArray(output.source_wip_allocations) ? output.source_wip_allocations.flatMap((allocation) => {
          if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) return []
          const item = allocation as { productId?: string; productCode?: string; stockCategory?: string; warehouseCode?: string; qty?: number }
          const sourceInput = row.production_inputs.find((input) => input.product_id?.toString() === item.productId)
          const sourceWarehouse = [...warehouseById.values()].find((warehouse) => warehouse.code === item.warehouseCode)
          if (!item.productCode && !sourceInput?.products?.code) return []
          return [{
            productCode: item.productCode ?? sourceInput?.products?.code ?? '',
            productName: sourceInput?.products?.name ?? item.productCode ?? '-',
            qty: typeof item.qty === 'number' ? item.qty : 0,
            stockCategory: item.stockCategory ?? '',
            warehouseName: sourceWarehouse?.name ?? item.warehouseCode ?? '-',
          }]
        }) : [],
        qty: toNumber(output.qty),
        sourceWipQty: toNumber(output.source_wip_qty),
        notes: output.notes,
        status: output.status,
        costVariance: toNumber(output.cost_variance),
        productionCostTotal: toNumber(output.total_cost),
        productionCostUnit: toNumber(output.unit_cost),
        stockReceiptTotalCost: toNumber(output.stock_receipt_total_cost),
        stockReceiptUnitCost: toNumber(output.stock_receipt_unit_cost),
        totalCost: toNumber(output.total_cost),
        unitCost: toNumber(output.unit_cost),
        warehouseCode: output.destination_warehouse_id ? warehouseById.get(output.destination_warehouse_id.toString())?.code ?? '' : '',
        warehouseName: output.destination_warehouse_id ? warehouseById.get(output.destination_warehouse_id.toString())?.name ?? '-' : '-',
      })),
      outputQty,
      outputValue,
      productCode: row.products?.code ?? '',
      productId: row.products?.code ? requireBusinessCode(row.products.code, `สินค้า ${row.product_id}`) : '',
      productName: row.products?.name ?? '-',
      qtyPlanned: toNumber(row.qty_planned),
      status: row.status ?? 'Open',
      variance: outputValue - inputCost,
      warehouseName: receivedWarehouseNames.join('\n'),
      wipQty,
      wipValue,
      yieldPct: inputQty > 0 ? outputQty / inputQty * 100 : 0,
    }
  })
}

type ProductionOrderPayloadRow = ReturnType<typeof mapProductionOrderRows>[number]

async function buildProductionOrdersWorkbook(rows: ProductionOrderPayloadRow[]) {
  const workbookRows = rows.map((row) => ({
    เลขที่: row.docNo,
    วันที่ใบสั่งผลิต: row.date,
    วันที่สร้างรายการ: row.createdAt,
    สาขา: row.branchName,
    สินค้าที่ผลิต: row.productName,
    รหัสสินค้า: row.productCode || row.productId,
    คลังรับผลผลิต: row.warehouseName,
    ปริมาณแผน: row.qtyPlanned,
    ปริมาณเบิก: row.inputQty,
    WIPคงเหลือ: Math.max(0, row.wipQty),
    ปริมาณผลิต: row.outputQty,
    Yield: row.yieldPct,
    ต้นทุนเบิก: row.inputCost,
    มูลค่าผลผลิต: row.outputValue,
    Variance: row.variance,
    สถานะ: row.status,
    หมายเหตุ: row.notes,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(workbookRows)
  const headers = workbookRows[0] ? Object.keys(workbookRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, workbookRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Production Orders')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

function orderBy(sort: string, direction: 'asc' | 'desc'): Prisma.production_ordersOrderByWithRelationInput[] {
  if (sort === 'docNo') return [{ doc_no: direction }]
  if (sort === 'createdAt') return [{ created_at: direction }, { doc_no: 'desc' }]
  if (sort === 'qtyPlanned') return [{ qty_planned: direction }, { date: 'desc' }]
  if (sort === 'inputCost') return [{ total_input_cost: direction }, { date: 'desc' }]
  if (sort === 'outputValue') return [{ total_output_value: direction }, { date: 'desc' }]
  if (sort === 'variance') return [{ variance: direction }, { date: 'desc' }]
  return [{ date: direction }, { doc_no: 'desc' }]
}

const aggregateSorts = new Set(['startDate', 'status', 'qtyPlanned', 'inputQty', 'wipQty', 'outputQty', 'yield', 'inputCost', 'outputValue', 'variance'])

const statusSortOrder: Record<string, number> = {
  Open: 0,
  'In Production': 1,
  'Partially Completed': 2,
  Completed: 3,
  Cancelled: 4,
}

function sortAggregateRows<T extends { date: string; startDate: string | null; docNo: string; inputQty: number; outputQty: number; qtyPlanned: number; wipQty: number; inputCost: number; outputValue: number; variance: number; status: string }>(
  rows: T[],
  sort: string,
  direction: 'asc' | 'desc',
) {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    if (sort === 'startDate') {
      if (left.startDate !== right.startDate) {
        if (!left.startDate) return 1
        if (!right.startDate) return -1
        return left.startDate.localeCompare(right.startDate) * multiplier
      }
      return right.docNo.localeCompare(left.docNo)
    }
    const leftValue = sort === 'yield'
      ? (left.inputQty > 0 ? left.outputQty / left.inputQty * 100 : 0)
      : sort === 'status'
        ? statusSortOrder[left.status] ?? Number.MAX_SAFE_INTEGER
        : left[sort as keyof T] as number
    const rightValue = sort === 'yield'
      ? (right.inputQty > 0 ? right.outputQty / right.inputQty * 100 : 0)
      : sort === 'status'
        ? statusSortOrder[right.status] ?? Number.MAX_SAFE_INTEGER
        : right[sort as keyof T] as number
    const value = leftValue - rightValue
    if (value !== 0) return value * multiplier
    return (right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo))
  })
}

function dateExclusiveEnd(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    const url = new URL(request.url)
    const isXlsx = url.searchParams.get('format') === 'xlsx'
    requirePermission(context, isXlsx ? 'production.orders.export' : 'production.orders.view')

    const { branchCode, dateFrom, dateTo, direction, docNo, includeDetail, page, pageSize, search, sort, statuses } = parseProductionOrdersQuery(url.searchParams)
    const requiresAggregateSort = !includeDetail && aggregateSorts.has(sort)
    const allowedBranchCodes = getBranchCodeIntersection(context, branchCode)
    const visibleBranchCodes = getBranchCodeIntersection(context)

    const where: Prisma.production_ordersWhereInput = {
      ...(allowedBranchCodes ? { branches: { code: { in: allowedBranchCodes } } } : {}),
      ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
      ...(dateFrom || dateTo ? {
        date: {
          ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
          ...(dateTo ? { lt: dateExclusiveEnd(dateTo) } : {}),
        },
      } : {}),
      ...(search ? {
        OR: [
          { doc_no: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { products: { code: { contains: search, mode: 'insensitive' } } },
          { products: { name: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
      ...(docNo ? { doc_no: docNo } : {}),
    }

    const take = requiresAggregateSort ? undefined : isXlsx ? 10000 : pageSize
    const rowsPromise = includeDetail
      ? prisma.production_orders.findMany({
          include: productionOrderInclude,
          orderBy: requiresAggregateSort ? orderBy('date', direction) : orderBy(sort, direction),
          ...(isXlsx ? {} : { skip: (page - 1) * pageSize }),
          take,
          where,
        })
      : prisma.production_orders.findMany({
          select: productionOrderListSelect,
          orderBy: requiresAggregateSort ? orderBy('date', direction) : orderBy(sort, direction),
          ...(isXlsx ? {} : { skip: (page - 1) * pageSize }),
          take,
          where,
        })
    const [total, rows, warehouses, branches] = await Promise.all([
      isXlsx ? Promise.resolve(0) : prisma.production_orders.count({ where }),
      rowsPromise,
      listWarehouseMasterRecords(),
      isXlsx
        ? Promise.resolve([])
        : (visibleBranchCodes ? listActiveBranchesByCodes(visibleBranchCodes) : listActiveBranches()),
    ])

    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id.toString(), warehouse]))
    const payloadRows = includeDetail
      ? await (async () => {
        const detailRows = rows as ProductionOrderRecord[]
        const actorValues = [...new Set(detailRows.flatMap((row) => row.production_order_status_logs.map((log) => log.created_by?.trim()).filter((value): value is string => Boolean(value))))]
        const actorRows = actorValues.length
          ? await prisma.app_users.findMany({ select: { display_name: true, email: true, first_name: true, last_name: true }, where: { email: { in: actorValues, mode: 'insensitive' } } })
          : []
        const actorNameByEmail = new Map(actorRows.map((actor) => {
          const personalName = [actor.first_name?.trim(), actor.last_name?.trim()].filter(Boolean).join(' ')
          return [actor.email?.trim().toLowerCase() ?? '', personalName || actor.display_name?.trim() || '-']
        }))
        return mapProductionOrderRows(detailRows, warehouseById, actorNameByEmail)
      })()
      : (() => {
          const orderIds = (rows as ProductionOrderListRecord[]).map((row) => row.id)
          if (orderIds.length === 0) return mapProductionOrderListRows(rows as ProductionOrderListRecord[], [], [], [], [])
          return Promise.all([
            prisma.production_inputs.groupBy({
              by: ['order_id'],
              where: { order_id: { in: orderIds }, status: 'active' },
              _count: { _all: true },
              _sum: { qty: true, total_cost: true },
            }),
            prisma.production_outputs.groupBy({
              by: ['order_id', 'category_code'],
              where: { order_id: { in: orderIds }, status: 'active' },
              _count: { _all: true },
              _sum: { qty: true, source_wip_qty: true, total_cost: true },
            }),
            prisma.production_input_returns.groupBy({
              by: ['order_id'],
              where: { order_id: { in: orderIds }, status: 'active' },
              _sum: { qty: true, total_cost: true },
            }),
            prisma.production_outputs.findMany({ select: { order_id: true, date: true }, where: { order_id: { in: orderIds } } }),
          ]).then(([inputAggregates, outputAggregates, returnAggregates, outputDates]) => mapProductionOrderListRows(rows as ProductionOrderListRecord[], inputAggregates, outputAggregates, returnAggregates, outputDates))
        })()

    let resolvedPayloadRows = payloadRows instanceof Promise ? await payloadRows : payloadRows
    if (requiresAggregateSort) {
      resolvedPayloadRows = sortAggregateRows(resolvedPayloadRows, sort, direction)
      if (!isXlsx) resolvedPayloadRows = resolvedPayloadRows.slice((page - 1) * pageSize, page * pageSize)
    }

    if (isXlsx) {
      return xlsxResponse(await buildProductionOrdersWorkbook(resolvedPayloadRows), `production_orders_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }
  const summary = resolvedPayloadRows.reduce((acc, row) => {
    acc.inputCost += row.inputCost
    acc.inputQty += row.inputQty
    acc.outputValue += row.outputValue
    acc.outputQty += row.outputQty
    acc.qtyPlanned += row.qtyPlanned
    acc.variance += row.variance
    acc.wipQty += row.wipQty
    return acc
  }, { inputCost: 0, inputQty: 0, outputQty: 0, outputValue: 0, qtyPlanned: 0, variance: 0, wipQty: 0 })

    return NextResponse.json({
      categories: productionOutputCategories,
      filters: {
        branches: branches.map((branch) => ({
          code: branch.code,
          id: branch.code,
          name: branch.name,
        })),
      },
      page,
      pageSize,
      rows: resolvedPayloadRows,
      summary: {
        inputCost: summary.inputCost,
        inputQty: summary.inputQty,
        outputQty: summary.outputQty,
        outputValue: summary.outputValue,
        qtyPlanned: summary.qtyPlanned,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        variance: summary.variance,
        wipQty: summary.wipQty,
      },
      summaryScope: 'page',
    })
  } catch (caught) {
    console.error('[production/orders] GET failed', {
      code: caught instanceof Error && 'code' in caught ? caught.code : undefined,
      message: caught instanceof Error ? caught.message : String(caught),
    })
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดใบสั่งผลิตไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.orders.create')
    const values = createProductionOrderSchema.parse(await request.json())
    const allowedBranchCodes = getBranchCodeIntersection(context, values.branchCode)
    if (allowedBranchCodes && !allowedBranchCodes.includes(values.branchCode)) {
      throw new AuthContextError('ไม่มีสิทธิ์สร้างใบสั่งผลิตในสาขานี้', 403)
    }
    const created = await createProductionOrder(values, currentActor(context))
    return NextResponse.json(created, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'สร้างใบสั่งผลิตไม่ได้', 500)
  }
}
