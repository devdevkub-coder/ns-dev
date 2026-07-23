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

const productionOrderInclude = {
  branches: true,
  products: true,
  production_inputs: { include: { products: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], where: { status: 'active' } },
  production_outputs: { include: { products: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], where: { status: 'active' } },
  warehouses: true,
} satisfies Prisma.production_ordersInclude

type ProductionOrderRecord = Prisma.production_ordersGetPayload<{ include: typeof productionOrderInclude }>

function mapProductionOrderRows(rows: ProductionOrderRecord[], warehouseById: Map<string, { code: string; name: string }>) {
  return rows.map((row) => {
    const inputQty = row.production_inputs.reduce((sum, input) => sum + toNumber(input.qty), 0)
    const inputCost = row.production_inputs.reduce((sum, input) => sum + toNumber(input.total_cost), 0)
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

    return {
      branchName: row.branches?.name ?? '-',
      closedAt: row.closed_at?.toISOString() ?? null,
      createdAt: row.created_at?.toISOString() ?? null,
      date: toDateOnly(row.date),
      docNo: row.doc_no,
      id: row.doc_no,
      consumedWipQty,
      inputCost,
      inputCount: row.production_inputs.length,
      inputs: row.production_inputs.map((input) => ({
        date: toDateOnly(input.date),
        docNo: input.doc_no,
        lotNo: input.lot_no ?? '',
        productCode: input.products?.code ? requireBusinessCode(input.products.code, `สินค้า ${input.product_id}`) : '',
        productName: input.products?.name ?? '-',
        qty: toNumber(input.qty),
        status: input.status,
        stockStatus: input.source ?? '',
        totalCost: toNumber(input.total_cost),
        unitCost: toNumber(input.unit_cost),
        warehouseCode: input.source_warehouse_id ? warehouseById.get(input.source_warehouse_id.toString())?.code ?? '' : '',
        warehouseName: input.source_warehouse_id ? warehouseById.get(input.source_warehouse_id.toString())?.name ?? '-' : '-',
      })),
      inputQty,
      lossQty,
      notes: row.notes ?? '',
      outputCategories: outputCategories.map((code) => ({
        code,
        name: String(code),
      })),
      outputCount: row.production_outputs.length,
      outputs: row.production_outputs.map((output) => ({
        categoryCode: output.category_code ?? output.output_category ?? '',
        date: toDateOnly(output.date),
        docNo: output.doc_no,
        lotNo: output.lot_no ?? '',
        outputType: output.output_type ?? '',
        productCode: output.products?.code ? requireBusinessCode(output.products.code, `สินค้า ${output.product_id}`) : '',
        productName: output.products?.name ?? '-',
        qty: toNumber(output.qty),
        status: output.status,
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
      warehouseName: row.warehouses?.name ?? '-',
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
  if (sort === 'status') return [{ status: direction }, { date: 'desc' }]
  if (sort === 'qtyPlanned') return [{ qty_planned: direction }, { date: 'desc' }]
  if (sort === 'inputCost') return [{ total_input_cost: direction }, { date: 'desc' }]
  if (sort === 'outputValue') return [{ total_output_value: direction }, { date: 'desc' }]
  if (sort === 'variance') return [{ variance: direction }, { date: 'desc' }]
  return [{ date: direction }, { doc_no: 'desc' }]
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.orders.view')

    const url = new URL(request.url)
    const { branchCode, dateFrom, dateTo, direction, page, pageSize, search, sort, statuses } = parseProductionOrdersQuery(url.searchParams)
    const allowedBranchCodes = getBranchCodeIntersection(context, branchCode)
    const visibleBranchCodes = getBranchCodeIntersection(context)

    const where: Prisma.production_ordersWhereInput = {
      ...(allowedBranchCodes ? { branches: { code: { in: allowedBranchCodes } } } : {}),
      ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
      ...(dateFrom || dateTo ? {
        date: {
          ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
          ...(dateTo ? { lte: new Date(`${dateTo}T00:00:00.000Z`) } : {}),
        },
      } : {}),
      ...(search ? {
        OR: [
          { doc_no: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { products: { name: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
    }

    const isXlsx = url.searchParams.get('format') === 'xlsx'
    const take = isXlsx ? 10000 : pageSize
    const [total, rows, warehouses, branches] = await Promise.all([
      isXlsx ? Promise.resolve(0) : prisma.production_orders.count({ where }),
      prisma.production_orders.findMany({
        include: productionOrderInclude,
        orderBy: orderBy(sort, direction),
        ...(isXlsx ? {} : { skip: (page - 1) * pageSize }),
        take,
        where,
      }),
      listWarehouseMasterRecords(),
      isXlsx
        ? Promise.resolve([])
        : (visibleBranchCodes ? listActiveBranchesByCodes(visibleBranchCodes) : listActiveBranches()),
    ])

    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id.toString(), warehouse]))
    const payloadRows = mapProductionOrderRows(rows, warehouseById)

    if (isXlsx) {
      return xlsxResponse(await buildProductionOrdersWorkbook(payloadRows), `production_orders_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }
    const summary = payloadRows.reduce((acc, row) => {
      acc.inputCost += row.inputCost
      acc.outputValue += row.outputValue
      acc.qtyPlanned += row.qtyPlanned
      acc.variance += row.variance
      return acc
    }, { inputCost: 0, outputValue: 0, qtyPlanned: 0, variance: 0 })

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
      rows: payloadRows,
      summary: {
        inputCost: summary.inputCost,
        outputValue: summary.outputValue,
        qtyPlanned: summary.qtyPlanned,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        variance: summary.variance,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดใบสั่งผลิตไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.orders.view')
    const values = createProductionOrderSchema.parse(await request.json())
    const created = await createProductionOrder(values, currentActor(context))
    return NextResponse.json(created, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof ProductionOrderError) return apiErrorResponse(caught, caught.message, caught.status)
    return apiErrorResponse(caught, 'สร้างใบสั่งผลิตไม่ได้', 500)
  }
}
