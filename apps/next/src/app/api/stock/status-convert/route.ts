import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../../../../generated/prisma/client'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { averageCostForStock, normalizeStockReferenceInput, quantityForStock, stockReferenceData } from '@/lib/server/stock'
import { statusConvertFormSchema } from '@/lib/stock'

export const runtime = 'nodejs'

const stockLedgerInclude = {
  branches: { select: { name: true } },
  products: { select: { code: true, name: true } },
  warehouses: { select: { name: true } },
} as const

async function nextDocNo() {
  const prefix = 'SC-'
  const last = await prisma.stock_ledger.findFirst({
    orderBy: { ref_no: 'desc' },
    select: { ref_no: true },
    where: { ref_no: { startsWith: prefix }, ref_type: 'SC' },
  })
  const lastNumber = Number(String(last?.ref_no ?? '').slice(prefix.length))
  return `${prefix}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(6, '0')}`
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q')?.trim()
    const dateFrom = searchParams.get('dateFrom')?.trim()
    const dateTo = searchParams.get('dateTo')?.trim()
    const fromStatus = searchParams.get('fromStatus')?.trim()
    const toStatus = searchParams.get('toStatus')?.trim()
    const filterReferences = await normalizeStockReferenceInput({
      branchId: searchParams.get('branchId'),
      productId: searchParams.get('productId'),
      warehouseId: searchParams.get('warehouseId'),
    })
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(200, Math.max(10, Number(searchParams.get('pageSize') ?? '100') || 100))
    const ledgerWhere: Prisma.stock_ledgerWhereInput = {
      ref_type: 'SC',
      qty_out: { gt: 0 },
      ...(filterReferences.branchId ? { branch_id: filterReferences.branchId } : {}),
      ...(filterReferences.productId ? { product_id: filterReferences.productId } : {}),
      ...(filterReferences.warehouseId ? { warehouse_id: filterReferences.warehouseId } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: normalizeDate(dateFrom) } : {}),
              ...(dateTo ? { lte: normalizeDate(dateTo) } : {}),
            },
          }
        : {}),
      ...(fromStatus === 'RM' || fromStatus === 'FG' ? { output_category: fromStatus } : {}),
      ...(toStatus === 'RM' || toStatus === 'FG' ? { note: toStatus } : {}),
      ...(q
        ? {
            OR: [
              { ref_no: { contains: q, mode: 'insensitive' as const } },
              { lot_no: { contains: q, mode: 'insensitive' as const } },
              { notes: { contains: q, mode: 'insensitive' as const } },
              { products: { code: { contains: q, mode: 'insensitive' as const } } },
              { products: { name: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    }
    const [reference, rows, total] = await Promise.all([
      stockReferenceData({ includeCustomers: false }),
      prisma.stock_ledger.findMany({
        include: stockLedgerInclude,
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: ledgerWhere,
      }),
      prisma.stock_ledger.count({ where: ledgerWhere }),
    ])

    return NextResponse.json({
      pagination: { page, pageSize, total },
      reference,
      rows: rows.map((row) => ({
        branchName: row.branches?.name ?? '-',
        createdAt: row.created_at ? row.created_at.toISOString() : '',
        date: toDateOnly(row.date),
        id: row.ref_no ?? '',
        lotNo: row.lot_no ?? '',
        note: row.notes ?? '',
        productCode: row.products?.code ?? '',
        productName: row.products?.name ?? '-',
        qty: toNumber(row.qty_out),
        refNo: row.ref_no ?? '',
        statusFrom: row.output_category ?? '',
        statusTo: row.note ?? '',
        unitCost: toNumber(row.unit_cost),
        value: toNumber(row.value_out),
        createdBy: row.created_by ?? '',
        warehouseName: row.warehouses?.name ?? '-',
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการปรับสถานะไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const values = statusConvertFormSchema.parse(await request.json())
    const references = await normalizeStockReferenceInput({ branchId: values.branchId, productId: values.productId, warehouseId: values.warehouseId })
    if (!references.branchId) {
      return NextResponse.json({ error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!references.warehouseId) {
      return NextResponse.json({ error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!references.productId) {
      return NextResponse.json({ error: 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    const warehouse = await prisma.warehouses.findFirst({
      select: { branch_id: true },
      where: { active: true, id: references.warehouseId },
    })
    if (!warehouse || warehouse.branch_id !== references.branchId) {
      return NextResponse.json({ error: 'คลังไม่อยู่ในสาขาที่เลือก' }, { status: 400 })
    }
    const availableQty = await quantityForStock({
      branchId: references.branchId,
      lotNo: values.lotNo,
      productId: references.productId,
      quantityType: 'ready',
      status: values.fromStatus,
      warehouseId: references.warehouseId,
    })
    if (values.qty > availableQty + 0.000001) {
      return NextResponse.json({ error: `จำนวนเกินสต๊อกพร้อมใช้ของ ${values.fromStatus} (${availableQty.toLocaleString('th-TH')})` }, { status: 400 })
    }

    const unitCost = await averageCostForStock({ branchId: references.branchId, lotNo: values.lotNo, productId: references.productId, status: values.fromStatus, warehouseId: references.warehouseId })
    const value = values.qty * unitCost
    const refId = `SC-${randomUUID()}`
    const refNo = values.docNo ?? await nextDocNo()
    const actor = currentActor(context)

    await prisma.stock_ledger.createMany({
      data: [
        {
          branch_id: references.branchId,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: values.lotNo,
          movement_type: 'STATUS_CONVERT_OUT',
          note: values.toStatus,
          notes: values.reason ?? values.notes,
          output_category: values.fromStatus,
          product_id: references.productId,
          qty_in: 0,
          qty_out: values.qty,
          ref_id: refId,
          ref_no: refNo,
          ref_type: 'SC',
          unit_cost: unitCost,
          value_in: 0,
          value_out: value,
          warehouse_id: references.warehouseId,
        },
        {
          branch_id: references.branchId,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: values.lotNo,
          movement_type: 'STATUS_CONVERT_IN',
          note: values.fromStatus,
          notes: values.reason ?? values.notes,
          output_category: values.toStatus,
          product_id: references.productId,
          qty_in: values.qty,
          qty_out: 0,
          ref_id: refId,
          ref_no: refNo,
          ref_type: 'SC',
          unit_cost: unitCost,
          value_in: value,
          value_out: 0,
          warehouse_id: references.warehouseId,
        },
      ],
    })

    return NextResponse.json({ id: refNo, refNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกปรับสถานะไม่ได้', 400)
  }
}
