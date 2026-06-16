import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
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

const statusConvertReverseSchema = z.object({
  action: z.literal('reverse'),
  note: z.string().trim().min(3, 'กรอกเหตุผล reverse อย่างน้อย 3 ตัวอักษร').max(240, 'เหตุผลยาวเกินไป').optional(),
  refNo: z.string().trim().min(1, 'ระบุเลขที่เอกสาร'),
})

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
    const [reference, rows, total, reversedRefs] = await Promise.all([
      stockReferenceData({ includeCustomers: false }),
      prisma.stock_ledger.findMany({
        include: stockLedgerInclude,
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: ledgerWhere,
      }),
      prisma.stock_ledger.count({ where: ledgerWhere }),
      prisma.stock_ledger.findMany({
        distinct: ['ref_id'],
        select: { ref_id: true },
        where: { ref_id: { not: null }, ref_type: 'SC-REV' },
      }),
    ])
    const reversedRefSet = new Set(reversedRefs.map((row) => row.ref_id).filter(Boolean))

    const refNos = rows.map((row) => row.ref_no).filter(Boolean) as string[]
    const targetLedgers = refNos.length
      ? await prisma.stock_ledger.findMany({
          select: {
            ref_no: true,
            warehouse_id: true,
            warehouses: { select: { name: true } },
          },
          where: {
            ref_no: { in: refNos },
            ref_type: 'SC',
            qty_in: { gt: 0 },
          },
        })
      : []

    const targetWarehouseMap = new Map<string, { id: string; name: string }>()
    for (const item of targetLedgers) {
      if (item.ref_no && item.warehouse_id) {
        targetWarehouseMap.set(item.ref_no, {
          id: String(item.warehouse_id),
          name: item.warehouses?.name ?? '-',
        })
      }
    }

    return NextResponse.json({
      pagination: { page, pageSize, total },
      reference,
      rows: rows.map((row) => {
        const target = targetWarehouseMap.get(row.ref_no ?? '')
        return {
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
          status: reversedRefSet.has(row.ref_no ?? '') ? 'reversed' : 'posted',
          statusFrom: row.output_category ?? '',
          statusTo: row.note ?? '',
          unitCost: toNumber(row.unit_cost),
          value: toNumber(row.value_out),
          createdBy: row.created_by ?? '',
          warehouseName: row.warehouses?.name ?? '-',
          targetWarehouseName: target?.name ?? '-',
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการปรับสถานะไม่ได้', 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const values = statusConvertReverseSchema.parse(await request.json())
    const actor = currentActor(context)

    const originalRows = await prisma.stock_ledger.findMany({
      orderBy: [{ qty_out: 'desc' }, { id: 'asc' }],
      where: { ref_no: values.refNo, ref_type: 'SC' },
    })
    if (!originalRows.length) {
      return NextResponse.json({ error: 'ไม่พบเอกสารปรับสถานะต้นทาง' }, { status: 404 })
    }
    const alreadyReversed = await prisma.stock_ledger.findFirst({
      select: { id: true },
      where: { ref_id: values.refNo, ref_type: 'SC-REV' },
    })
    if (alreadyReversed) {
      return NextResponse.json({ error: 'เอกสารนี้ถูก reverse แล้ว' }, { status: 400 })
    }
    const sourceOut = originalRows.find((row) => toNumber(row.qty_out) > 0)
    const targetIn = originalRows.find((row) => toNumber(row.qty_in) > 0)
    if (!sourceOut || !targetIn || !sourceOut.product_id || !sourceOut.branch_id || !sourceOut.warehouse_id || !targetIn.product_id || !targetIn.branch_id || !targetIn.warehouse_id) {
      return NextResponse.json({ error: 'เอกสาร SC ไม่ครบคู่ ไม่สามารถ reverse ได้' }, { status: 400 })
    }
    const qty = toNumber(sourceOut.qty_out)
    const targetAvailableQty = await quantityForStock({
      branchId: targetIn.branch_id,
      lotNo: targetIn.lot_no,
      productId: targetIn.product_id as bigint,
      quantityType: 'ready',
      status: targetIn.output_category,
      warehouseId: targetIn.warehouse_id,
    })
    if (qty > targetAvailableQty + 0.000001) {
      return NextResponse.json({ error: `Reverse ไม่ได้: stock ฝั่ง ${targetIn.output_category ?? '-'} ถูกใช้ต่อแล้ว เหลือพร้อมใช้ ${targetAvailableQty.toLocaleString('th-TH')}` }, { status: 400 })
    }

    const reverseRefNo = `${values.refNo}-REV`
    await prisma.stock_ledger.createMany({
      data: [
        {
          branch_id: targetIn.branch_id,
          created_by: actor,
          date: new Date(),
          lot_no: targetIn.lot_no,
          movement_type: 'STATUS_CONVERT_REVERSAL_OUT',
          note: sourceOut.output_category,
          notes: values.note ?? `Reverse ${values.refNo}`,
          not_available_for_sale: targetIn.not_available_for_sale,
          output_category: targetIn.output_category,
          product_id: targetIn.product_id,
          qty_in: 0,
          qty_out: qty,
          ref_id: values.refNo,
          ref_no: reverseRefNo,
          ref_type: 'SC-REV',
          unit_cost: targetIn.unit_cost,
          value_in: 0,
          value_out: toNumber(targetIn.value_in),
          warehouse_id: targetIn.warehouse_id,
        },
        {
          branch_id: sourceOut.branch_id,
          created_by: actor,
          date: new Date(),
          lot_no: sourceOut.lot_no,
          movement_type: 'STATUS_CONVERT_REVERSAL_IN',
          note: targetIn.output_category,
          notes: values.note ?? `Reverse ${values.refNo}`,
          not_available_for_sale: sourceOut.not_available_for_sale,
          output_category: sourceOut.output_category,
          product_id: sourceOut.product_id,
          qty_in: qty,
          qty_out: 0,
          ref_id: values.refNo,
          ref_no: reverseRefNo,
          ref_type: 'SC-REV',
          unit_cost: sourceOut.unit_cost,
          value_in: toNumber(sourceOut.value_out),
          value_out: 0,
          warehouse_id: sourceOut.warehouse_id,
        },
      ],
    })

    return NextResponse.json({ id: reverseRefNo, refNo: reverseRefNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Reverse ปรับสถานะไม่ได้', 400)
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

    // ตรวจสอบคลังสินค้าปลายทาง
    const targetRef = await normalizeStockReferenceInput({ branchId: values.branchId, warehouseId: values.targetWarehouseId })
    const targetWarehouseId = targetRef.warehouseId
    if (!targetWarehouseId) {
      return NextResponse.json({ error: 'คลังปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    const targetWarehouse = await prisma.warehouses.findFirst({
      select: { branch_id: true },
      where: { active: true, id: targetWarehouseId },
    })
    if (!targetWarehouse || targetWarehouse.branch_id !== references.branchId) {
      return NextResponse.json({ error: 'คลังปลายทางไม่ถูกต้องหรือไมู่อยู่ในสาขาที่เลือก' }, { status: 400 })
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
          warehouse_id: targetWarehouseId,
        },
      ],
    })

    return NextResponse.json({ id: refNo, refNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกปรับสถานะไม่ได้', 400)
  }
}
