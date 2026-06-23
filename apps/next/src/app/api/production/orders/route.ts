import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { createProductionOrder, createProductionOrderSchema, ProductionOrderError } from '@/lib/server/production-orders'

export const runtime = 'nodejs'

const productionOutputCategories = [
  { availableForSale: true, code: 'FG', name: 'FG', stockEffect: 'stock_in' },
  { availableForSale: true, code: 'RM', name: 'RM', stockEffect: 'stock_in' },
  { availableForSale: false, code: 'LOSS', name: 'LOSS', stockEffect: 'loss' },
]

const allowedSorts = new Set(['date', 'docNo', 'status', 'qtyPlanned', 'inputCost', 'outputValue', 'variance'])

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
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10))
    const search = url.searchParams.get('search')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''
    const dateFrom = url.searchParams.get('dateFrom')?.trim() ?? ''
    const dateTo = url.searchParams.get('dateTo')?.trim() ?? ''
    const sort = allowedSorts.has(url.searchParams.get('sort') ?? '') ? url.searchParams.get('sort') as string : 'date'
    const direction = url.searchParams.get('direction') === 'asc' ? 'asc' : 'desc'

    const where: Prisma.production_ordersWhereInput = {
      ...(status ? { status } : {}),
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

    const [total, rows, warehouses] = await Promise.all([
      prisma.production_orders.count({ where }),
      prisma.production_orders.findMany({
        include: {
          branches: true,
          products: true,
          production_inputs: { include: { products: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], where: { status: 'active' } },
          production_outputs: { include: { products: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], where: { status: 'active' } },
          warehouses: true,
        },
        orderBy: orderBy(sort, direction),
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.warehouses.findMany({
        select: { code: true, id: true, name: true },
      }),
    ])

    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id.toString(), warehouse]))
    const payloadRows = rows.map((row) => {
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
    const summary = payloadRows.reduce((acc, row) => {
      acc.inputCost += row.inputCost
      acc.outputValue += row.outputValue
      acc.qtyPlanned += row.qtyPlanned
      acc.variance += row.variance
      return acc
    }, { inputCost: 0, outputValue: 0, qtyPlanned: 0, variance: 0 })

    return NextResponse.json({
      categories: productionOutputCategories,
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
