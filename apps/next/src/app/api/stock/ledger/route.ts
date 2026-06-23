import { NextResponse } from 'next/server'
import { Prisma } from '../../../../../generated/prisma/client'
import { z } from 'zod'
import { parseInternalBigIntId } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
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
  balanceMode: z.enum(['product', 'warehouse']).default('warehouse'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  movementType: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(80).nullable().default(null),
  ),
  negativeOnly: z.coerce.boolean().default(false),
  warehouseType: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.enum(['RM', 'WIP', 'FG']).nullable().default(null),
  ),
})

function sourcePathFor(row: { refNo: string; refType: string }) {
  if (!row.refNo) return ''
  const refNo = encodeURIComponent(row.refNo)
  if (row.refType === 'PB' || row.refType === 'PB-CANCEL' || row.refType === 'PB-EDIT-REV') return `/purchase/bills/${refNo}`
  if (row.refType === 'SB' || row.refType === 'SB-CANCEL') return `/sales/bills?docNo=${refNo}`
  if (row.refType === 'PSALE' || row.refType === 'PSALE-CANCEL') return `/sales/stock-issue?docNo=${refNo}`
  if (row.refType === 'ST') return `/stock/transfer?docNo=${refNo}`
  if (row.refType === 'SC' || row.refType === 'SC-REV') return `/stock/status-convert?docNo=${refNo}`
  if (row.refType === 'GA') return `/stock/convert?docNo=${refNo}`
  if (row.refType === 'ADJ') return `/stock/adjust?docNo=${refNo}`
  if (row.refType === 'PI' || row.refType === 'PI-REV' || row.refType === 'PO2' || row.refType === 'PO2-REV') return `/production/orders?docNo=${refNo}`
  return ''
}

function sqlWhereForStockLedger(input: {
  branchId: bigint | null
  from?: string | null
  lotNo?: string | null
  movementType?: string | null
  productId: bigint | null
  q?: string | null
  refType?: string | null
  status?: string | null
  to?: string | null
  warehouseId: bigint | null
  warehouseType?: string | null
}) {
  const clauses: Prisma.Sql[] = [Prisma.sql`true`]
  if (input.productId) clauses.push(Prisma.sql`product_id = ${input.productId}`)
  if (input.branchId) clauses.push(Prisma.sql`branch_id = ${input.branchId}`)
  if (input.warehouseId) clauses.push(Prisma.sql`warehouse_id = ${input.warehouseId}`)
  if (input.movementType) clauses.push(Prisma.sql`movement_type = ${input.movementType}`)
  if (input.refType) clauses.push(Prisma.sql`ref_type = ${input.refType}`)
  if (input.lotNo) clauses.push(Prisma.sql`lot_no ilike ${`%${input.lotNo}%`}`)
  if (input.status) clauses.push(Prisma.sql`output_category = ${input.status}`)
  if (input.warehouseType) clauses.push(Prisma.sql`exists (select 1 from public.warehouses wtype where wtype.id = stock_ledger.warehouse_id and wtype.type = ${input.warehouseType})`)
  if (input.q) {
    clauses.push(Prisma.sql`(
      ref_no ilike ${`%${input.q}%`}
      or ref_id ilike ${`%${input.q}%`}
      or notes ilike ${`%${input.q}%`}
      or note ilike ${`%${input.q}%`}
      or exists (select 1 from public.products p where p.id = stock_ledger.product_id and (p.code ilike ${`%${input.q}%`} or p.name ilike ${`%${input.q}%`}))
      or exists (select 1 from public.branches b where b.id = stock_ledger.branch_id and b.name ilike ${`%${input.q}%`})
      or exists (select 1 from public.warehouses w where w.id = stock_ledger.warehouse_id and w.name ilike ${`%${input.q}%`})
    )`)
  }
  if (input.from) clauses.push(Prisma.sql`date >= ${normalizeDate(input.from)}`)
  if (input.to) clauses.push(Prisma.sql`date <= ${normalizeDate(input.to)}`)
  return Prisma.join(clauses, ' and ')
}

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
    case 'warehouseName':
      return [{ warehouses: { name: direction } }, { date: direction }, { created_at: direction }, { id: direction }]
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
    const baseWhere = stockWhere({ ...normalizedQuery, from: query.from, lotNo: query.lotNo, movementType: query.movementType, refType: query.refType, status: query.status, to: query.to })
    const where: Prisma.stock_ledgerWhereInput = {
      ...baseWhere,
      ...(query.warehouseType ? { warehouses: { type: query.warehouseType } } : {}),
      ...(query.q
        ? {
            OR: [
              { ref_no: { contains: query.q, mode: 'insensitive' } },
              { ref_id: { contains: query.q, mode: 'insensitive' } },
              { notes: { contains: query.q, mode: 'insensitive' } },
              { note: { contains: query.q, mode: 'insensitive' } },
              { products: { code: { contains: query.q, mode: 'insensitive' } } },
              { products: { name: { contains: query.q, mode: 'insensitive' } } },
              { branches: { name: { contains: query.q, mode: 'insensitive' } } },
              { warehouses: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const orderBy = stockLedgerOrderBy(query.sort, query.direction)

    const sqlWhere = sqlWhereForStockLedger({
      branchId: normalizedQuery.branchId,
      from: query.from,
      lotNo: query.lotNo,
      movementType: query.movementType,
      productId: normalizedQuery.productId,
      q: query.q,
      refType: query.refType,
      status: query.status,
      to: query.to,
      warehouseId: normalizedQuery.warehouseId,
      warehouseType: query.warehouseType,
    })
    const [pageRowsRaw, reference, total, aggregate, movementTypeRows] = await Promise.all([
      prisma.stock_ledger.findMany({
        include: stockLedgerInclude,
        orderBy,
        skip,
        take: query.pageSize,
        where,
      }),
      stockReferenceData(),
      prisma.stock_ledger.count({ where }),
      prisma.stock_ledger.aggregate({
        _sum: { qty_in: true, qty_out: true, value_in: true, value_out: true },
        where,
      }),
      prisma.stock_ledger.findMany({
        distinct: ['movement_type'],
        orderBy: { movement_type: 'asc' },
        select: { movement_type: true },
        where,
      }),
    ])
    const pageRows = pageRowsRaw as Array<(typeof pageRowsRaw)[number] & {
      branches?: { name: string } | null
      products?: { code: string; name: string } | null
      warehouses?: { name: string } | null
    }>
    const pageRowIds = pageRows.map((row) => row.id)

    const purchaseRefTypes = new Set(['PB', 'PB-CANCEL', 'PB-EDIT-REV'])
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

    const partitionSql = query.balanceMode === 'warehouse'
      ? Prisma.sql`product_id, branch_id, warehouse_id, coalesce(lot_no, ''), coalesce(output_category, ''), coalesce(not_available_for_sale, false)`
      : Prisma.sql`product_id`
    const [runningRows, negativeRows] = await Promise.all([
      pageRowIds.length
        ? prisma.$queryRaw<Array<{ id: bigint; running_balance: Prisma.Decimal | number | string }>>`
          with running as (
            select
              id,
              sum(coalesce(qty_in, 0) - coalesce(qty_out, 0)) over (
                partition by ${partitionSql}
                order by date asc, created_at asc, id asc
                rows between unbounded preceding and current row
              ) as running_balance
            from public.stock_ledger
            where ${sqlWhere}
          )
          select id, running_balance
          from running
          where id in (${Prisma.join(pageRowIds)})
        `
        : Promise.resolve([]),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        select count(*)::bigint as count
        from (
          select
            sum(coalesce(qty_in, 0) - coalesce(qty_out, 0)) over (
              partition by ${partitionSql}
              order by date asc, created_at asc, id asc
              rows between unbounded preceding and current row
            ) as running_balance
          from public.stock_ledger
          where ${sqlWhere}
        ) running
        where running_balance < 0
      `,
    ])
    const runningByRowId = new Map(runningRows.map((row) => [String(row.id), Number(row.running_balance)]))

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
        sourcePath: sourcePathFor({ refNo: outwardRefNo, refType: row.ref_type ?? '' }),
        unitCost: toNumber(row.unit_cost),
        valueIn: toNumber(row.value_in),
        valueOut: toNumber(row.value_out),
        warehouseName: row.warehouses?.name ?? '-',
      }
    })
    const negativeCount = Number(negativeRows[0]?.count ?? 0)
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
        qtyIn: toNumber(aggregate._sum.qty_in),
        qtyOut: toNumber(aggregate._sum.qty_out),
        valueIn: toNumber(aggregate._sum.value_in),
        valueOut: toNumber(aggregate._sum.value_out),
      },
      total,
      movementTypes: movementTypeRows.map((row) => row.movement_type).filter(Boolean).sort(),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Stock Ledger ไม่ได้', 500)
  }
}
