import { NextResponse } from 'next/server'
import { requireDocumentNo } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { averageCostForStock, normalizeStockReferenceInput, quantityForStock, stockReferenceData } from '@/lib/server/stock'
import { stockConvertFormSchema } from '@/lib/stock'

export const runtime = 'nodejs'

async function nextDocNo() {
  const prefix = 'GA-'
  const last = await prisma.stock_ledger.findFirst({
    orderBy: { ref_no: 'desc' },
    select: { ref_no: true },
    where: { ref_no: { startsWith: prefix }, ref_type: 'GA' },
  })
  const lastNumber = Number(String(last?.ref_no ?? '').slice(prefix.length))
  return `${prefix}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(6, '0')}`
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const [reference, adjustments, ledgerRows] = await Promise.all([
      stockReferenceData(),
      prisma.grade_adjustments.findMany({
        include: { products: true, warehouses: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 500,
      }),
      prisma.stock_ledger.findMany({
        include: { products: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 1000,
        where: { ref_type: 'GA' },
      }),
    ])
    const ledgerByRef = new Map<string, typeof ledgerRows>()
    for (const row of ledgerRows) {
      const key = requireDocumentNo(row.ref_no, `stock_ledger ${row.id}`)
      ledgerByRef.set(key, [...(ledgerByRef.get(key) ?? []), row])
    }

    return NextResponse.json({
      reference,
      rows: adjustments.map((row) => {
        const rows = ledgerByRef.get(row.doc_no) ?? []
        const source = rows.find((entry) => toNumber(entry.qty_out) > 0)
        const target = rows.find((entry) => toNumber(entry.qty_in) > 0)
        return {
          date: toDateOnly(row.date),
          branchWarehouse: row.warehouses?.name ?? '-',
          costStatus: toNumber(source?.unit_cost) > 0 ? 'allocated' : 'pending_cost',
          id: row.doc_no,
          lossQty: Math.max(0, toNumber(source?.qty_out) - toNumber(target?.qty_in)),
          refNo: row.doc_no,
          sourceProduct: source?.products ? `${source.products.code} · ${source.products.name}` : row.products ? `${row.products.code} · ${row.products.name}` : '-',
          sourceQty: Math.abs(toNumber(source?.qty_out) || toNumber(row.qty_diff)),
          sourceType: 'Manual',
          status: 'posted',
          targetProduct: target?.products ? `${target.products.code} · ${target.products.name}` : '-',
          targetQty: toNumber(target?.qty_in),
          targetUnitCost: toNumber(target?.unit_cost),
          unitCost: toNumber(source?.unit_cost),
          value: Math.abs(toNumber(row.value_diff)),
          warehouseName: row.warehouses?.name ?? '-',
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการปรับเกรดไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const values = stockConvertFormSchema.parse(await request.json())
    const [references, sourceProductReference, targetProductReference] = await Promise.all([
      normalizeStockReferenceInput({ branchId: values.branchId, warehouseId: values.warehouseId }),
      normalizeStockReferenceInput({ productId: values.sourceProductId }),
      normalizeStockReferenceInput({ productId: values.targetProductId }),
    ])
    if (!references.branchId) {
      return NextResponse.json({ error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!references.warehouseId) {
      return NextResponse.json({ error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!sourceProductReference.productId) {
      return NextResponse.json({ error: 'สินค้าต้นทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!targetProductReference.productId) {
      return NextResponse.json({ error: 'สินค้าปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    const availableQty = await quantityForStock({
      branchId: references.branchId,
      lotNo: values.lotNo,
      productId: sourceProductReference.productId,
      warehouseId: references.warehouseId,
    })
    if (values.sourceQty > availableQty + 0.000001) {
      return NextResponse.json({ error: `จำนวนเกินสต๊อกที่มี (${availableQty.toLocaleString('th-TH')})` }, { status: 400 })
    }

    const unitCost = await averageCostForStock({ branchId: references.branchId, lotNo: values.lotNo, productId: sourceProductReference.productId, warehouseId: references.warehouseId })
    const sourceValue = values.sourceQty * unitCost
    const targetValue = values.targetQty * unitCost
    const refNo = values.docNo ?? await nextDocNo()
    const actor = currentActor(context)

    await prisma.$transaction(async (tx) => {
      const adjustment = await tx.grade_adjustments.create({
        data: {
          approved_by: actor,
          date: normalizeDate(values.date),
          doc_no: refNo,
          notes: values.notes,
          product_id: sourceProductReference.productId,
          qty_diff: values.targetQty - values.sourceQty,
          reason: values.reason,
          updated_by: actor,
          value_diff: targetValue - sourceValue,
          warehouse_id: references.warehouseId,
        },
      })
      await tx.stock_ledger.createMany({
        data: [
          {
            branch_id: references.branchId,
            created_by: actor,
            date: normalizeDate(values.date),
            lot_no: values.lotNo,
            movement_type: 'GRADE_ADJUST_OUT',
            notes: values.reason ?? values.notes,
            product_id: sourceProductReference.productId,
            qty_in: 0,
            qty_out: values.sourceQty,
            ref_id: String(adjustment.id),
            ref_no: refNo,
            ref_type: 'GA',
            unit_cost: unitCost,
            value_in: 0,
            value_out: sourceValue,
            warehouse_id: references.warehouseId,
          },
          {
            branch_id: references.branchId,
            created_by: actor,
            date: normalizeDate(values.date),
            lot_no: values.targetLotNo ?? values.lotNo,
            movement_type: 'GRADE_ADJUST_IN',
            notes: values.reason ?? values.notes,
            product_id: targetProductReference.productId,
            qty_in: values.targetQty,
            qty_out: 0,
            ref_id: String(adjustment.id),
            ref_no: refNo,
            ref_type: 'GA',
            unit_cost: unitCost,
            value_in: targetValue,
            value_out: 0,
            warehouse_id: references.warehouseId,
          },
        ],
      })
    })

    return NextResponse.json({ id: refNo, refNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกปรับเกรดไม่ได้', 400)
  }
}
