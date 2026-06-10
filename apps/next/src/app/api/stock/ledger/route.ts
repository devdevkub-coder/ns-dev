import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { buildStockWorkbook, normalizeStockReferenceInput, stockReferenceData, stockWhere, xlsxResponse } from '@/lib/server/stock'
import { stockMovementTypeLabel } from '@/lib/stock-movement-types'
import { stockQuerySchema } from '@/lib/stock'

export const runtime = 'nodejs'

const stockLedgerInclude = {
  branches: true,
  products: { select: { code: true, name: true } },
  warehouses: true,
} as const

const ledgerQuerySchema = stockQuerySchema.extend({
  balanceMode: z.enum(['product', 'warehouse']).default('product'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  movementType: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(80).nullable().default(null),
  ),
  negativeOnly: z.coerce.boolean().default(false),
})

function stockLedgerOrderBy(sort: string, direction: 'asc' | 'desc') {
  switch (sort) {
    case 'movementType':
      return [{ movement_type: direction }, { date: direction }, { created_at: direction }, { id: direction }]
    case 'qtyIn':
      return [{ qty_in: direction }, { date: direction }, { created_at: direction }, { id: direction }]
    case 'qtyOut':
      return [{ qty_out: direction }, { date: direction }, { created_at: direction }, { id: direction }]
    case 'refNo':
      return [{ ref_no: direction }, { date: direction }, { created_at: direction }, { id: direction }]
    case 'unitCost':
      return [{ unit_cost: direction }, { date: direction }, { created_at: direction }, { id: direction }]
    case 'valueIn':
      return [{ value_in: direction }, { date: direction }, { created_at: direction }, { id: direction }]
    case 'valueOut':
      return [{ value_out: direction }, { date: direction }, { created_at: direction }, { id: direction }]
    case 'date':
    default:
      return [{ date: direction }, { created_at: direction }, { id: direction }]
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const url = new URL(request.url)
    const query = ledgerQuerySchema.parse(Object.fromEntries(url.searchParams))
    const skip = (query.page - 1) * query.pageSize
    const normalizedQuery = await normalizeStockReferenceInput(query)
    const where = stockWhere(normalizedQuery)
    const orderBy = stockLedgerOrderBy(query.sort, query.direction)

    const [allRowsRaw, pageRowsRaw, reference, total] = await Promise.all([
      prisma.stock_ledger.findMany({
        include: stockLedgerInclude,
        orderBy: [{ date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        where,
      }),
      prisma.stock_ledger.findMany({
        include: stockLedgerInclude,
        orderBy,
        skip,
        take: query.pageSize,
        where,
      }),
      stockReferenceData(),
      prisma.stock_ledger.count({ where }),
    ])
    const allRows = allRowsRaw
    const pageRows = pageRowsRaw as Array<(typeof pageRowsRaw)[number] & {
      branches?: { name: string } | null
      products?: { code: string; name: string } | null
      warehouses?: { name: string } | null
    }>

    const purchaseRefTypes = new Set(['PB', 'PB-CANCEL'])
    const salesRefTypes = new Set(['SB', 'SB-CANCEL'])
    const purchaseBillIds = [...new Set(pageRows
      .filter((row) => row.ref_type && purchaseRefTypes.has(row.ref_type) && row.ref_id)
      .map((row) => parseInternalBigIntId(row.ref_id))
      .filter((id): id is bigint => id !== null))]
    const purchaseBillDocNos = [...new Set(pageRows
      .filter((row) => row.ref_type && purchaseRefTypes.has(row.ref_type))
      .flatMap((row) => [row.ref_id, row.ref_no].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))]
    const salesBillIds = [...new Set(pageRows
      .filter((row) => row.ref_type && salesRefTypes.has(row.ref_type) && row.ref_id)
      .map((row) => parseInternalBigIntId(row.ref_id))
      .filter((id): id is bigint => id !== null))]
    const salesBillDocNos = [...new Set(pageRows
      .filter((row) => row.ref_type && salesRefTypes.has(row.ref_type))
      .flatMap((row) => [row.ref_id, row.ref_no].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))]
    const [purchaseBills, salesBills] = await Promise.all([
      purchaseBillIds.length || purchaseBillDocNos.length
        ? prisma.purchase_bills.findMany({
          include: { suppliers: true },
          where: { OR: [...(purchaseBillIds.length ? [{ id: { in: purchaseBillIds } }] : []), ...(purchaseBillDocNos.length ? [{ doc_no: { in: purchaseBillDocNos } }] : [])] },
        })
        : Promise.resolve([]),
      salesBillIds.length || salesBillDocNos.length
        ? prisma.sales_bills.findMany({
          include: { customers: true },
          where: { OR: [...(salesBillIds.length ? [{ id: { in: salesBillIds } }] : []), ...(salesBillDocNos.length ? [{ doc_no: { in: salesBillDocNos } }] : [])] },
        })
        : Promise.resolve([]),
    ])
    const purchaseById = new Map(purchaseBills.map((bill) => [bill.id, bill]))
    const purchaseByDocNo = new Map(purchaseBills.map((bill) => [bill.doc_no, bill]))
    const salesById = new Map(salesBills.map((bill) => [bill.id, bill]))
    const salesByDocNo = new Map(salesBills.map((bill) => [bill.doc_no, bill]))

    const balanceByKey = new Map<string, number>()
    const runningByRowId = new Map<string, number>()
    for (const row of allRows) {
      const key = query.balanceMode === 'warehouse'
        ? `${String(row.product_id ?? '')}|${String(row.branch_id ?? '')}|${String(row.warehouse_id ?? '')}|${row.lot_no ?? ''}|${row.output_category ?? ''}`
        : String(row.product_id ?? '')
      if (!key) continue
      const nextBalance = (balanceByKey.get(key) ?? 0) + toNumber(row.qty_in) - toNumber(row.qty_out)
      balanceByKey.set(key, nextBalance)
      runningByRowId.set(String(row.id), nextBalance)
    }

    let payloadRows = pageRows.map((row) => {
      const purchaseBillId = row.ref_type && purchaseRefTypes.has(row.ref_type) && row.ref_id ? parseInternalBigIntId(row.ref_id) : null
      const salesBillId = row.ref_type && salesRefTypes.has(row.ref_type) && row.ref_id ? parseInternalBigIntId(row.ref_id) : null
      const purchaseBill = purchaseBillId != null
        ? purchaseById.get(purchaseBillId)
        : row.ref_type && purchaseRefTypes.has(row.ref_type)
          ? purchaseByDocNo.get(row.ref_id ?? '') ?? purchaseByDocNo.get(row.ref_no ?? '')
          : null
      const salesBill = salesBillId != null
        ? salesById.get(salesBillId)
        : row.ref_type && salesRefTypes.has(row.ref_type)
          ? salesByDocNo.get(row.ref_id ?? '') ?? salesByDocNo.get(row.ref_no ?? '')
          : null
      const outwardRefNo = row.ref_no ?? purchaseBill?.doc_no ?? salesBill?.doc_no ?? ''
      return {
        branchName: row.branches?.name ?? '-',
        counterpartyName: purchaseBill?.suppliers?.name ?? salesBill?.customers?.name ?? '-',
        date: toDateOnly(row.date),
        id: row.ledger_key,
        movementType: row.movement_type,
        lotNo: row.lot_no ?? '',
        note: row.note ?? row.notes ?? '',
        notAvailableForSale: row.not_available_for_sale === true,
        outputCategory: row.output_category ?? '',
        productCode: row.products?.code ?? '',
        productId: row.products?.code ?? '',
        productName: row.products?.name ?? '-',
        qtyIn: toNumber(row.qty_in),
        qtyOut: toNumber(row.qty_out),
        refId: outwardRefNo,
        refNo: outwardRefNo,
        refType: row.ref_type ?? '',
        runningBalanceByProduct: runningByRowId.get(String(row.id)) ?? 0,
        unitCost: toNumber(row.unit_cost),
        valueIn: toNumber(row.value_in),
        valueOut: toNumber(row.value_out),
        warehouseName: row.warehouses?.name ?? '-',
      }
    })
    const negativeCount = Array.from(runningByRowId.values()).filter((value) => value < 0).length
    if (query.negativeOnly) payloadRows = payloadRows.filter((row) => row.runningBalanceByProduct < 0)

    if (query.format === 'xlsx') {
      const body = buildStockWorkbook('Stock Ledger', payloadRows.map((row) => ({
        วันที่: row.date,
        Ref: `${row.refType}:${row.refNo}`,
        Movement: stockMovementTypeLabel(row.movementType),
        สินค้า: `${row.productCode} ${row.productName}`.trim(),
        'ผู้ขาย/ผู้ซื้อ': row.counterpartyName,
        สาขา: row.branchName,
        คลัง: row.warehouseName,
        Lot: row.lotNo,
        สถานะ: row.outputCategory,
        เข้า: row.qtyIn,
        ออก: row.qtyOut,
        คงเหลือ: row.runningBalanceByProduct,
        ต้นทุน: row.unitCost,
        มูลค่าเข้า: row.valueIn,
        มูลค่าออก: row.valueOut,
        พร้อมขาย: row.notAvailableForSale ? 'No' : 'Yes',
      })))
      return xlsxResponse(body, `stock_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return NextResponse.json({
      page: query.page,
      pageSize: query.pageSize,
      reference,
      rows: payloadRows,
      summary: {
        count: total,
        negativeCount,
        pageCount: payloadRows.length,
        qtyIn: allRows.reduce((sum, row) => sum + toNumber(row.qty_in), 0),
        qtyOut: allRows.reduce((sum, row) => sum + toNumber(row.qty_out), 0),
        valueIn: allRows.reduce((sum, row) => sum + toNumber(row.value_in), 0),
        valueOut: allRows.reduce((sum, row) => sum + toNumber(row.value_out), 0),
      },
      total,
      movementTypes: Array.from(new Set(allRows.map((row) => row.movement_type).filter(Boolean))).sort(),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Stock Ledger ไม่ได้', 500)
  }
}
