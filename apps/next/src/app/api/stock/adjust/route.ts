import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { averageCostForStock, normalizeStockReferenceInput, quantityForStock, stockReferenceData } from '@/lib/server/stock'
import { stockAdjustFormSchema } from '@/lib/stock'

export const runtime = 'nodejs'

async function nextDocNo() {
  const prefix = 'ADJ-'
  const last = await prisma.stock_adjustments.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith: prefix } },
  })
  const lastNumber = Number(String(last?.doc_no ?? '').slice(prefix.length))
  return `${prefix}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(6, '0')}`
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const [reference, adjustments] = await Promise.all([
      stockReferenceData(),
      prisma.stock_adjustments.findMany({ orderBy: [{ date: 'desc' }, { created_at: 'desc' }], take: 500 }),
    ])
    const [branches, warehouses, products] = await Promise.all([
      prisma.branches.findMany({ where: { id: { in: adjustments.map((row) => row.branch_id).filter((id): id is bigint => id !== null) } } }),
      prisma.warehouses.findMany({ where: { id: { in: adjustments.map((row) => row.warehouse_id).filter((id): id is bigint => id !== null) } } }),
      prisma.products.findMany({ where: { id: { in: adjustments.map((row) => row.product_id).filter((id): id is bigint => id !== null) } } }),
    ])
    const branchById = new Map(branches.map((row) => [row.id, row]))
    const warehouseById = new Map(warehouses.map((row) => [row.id, row]))
    const productById = new Map(products.map((row) => [row.id, row]))

    return NextResponse.json({
      reference,
      rows: adjustments.map((row) => {
        const product = row.product_id ? productById.get(row.product_id) : null
        return {
          adjustType: row.adjust_type ?? '',
          branchId: row.branch_id ? branchById.get(row.branch_id)?.code ?? '' : '',
          branchName: row.branch_id ? branchById.get(row.branch_id)?.name ?? '-' : '-',
          branchWarehouse: `${row.branch_id ? branchById.get(row.branch_id)?.name ?? '-' : '-'} / ${row.warehouse_id ? warehouseById.get(row.warehouse_id)?.name ?? '-' : '-'}`,
          countedQty: toNumber(row.counted_qty),
          date: row.date ? toDateOnly(row.date) : '',
          diffQty: toNumber(row.diff_qty),
          docNo: row.doc_no ?? '',
          id: row.doc_no ?? '',
          lotNo: row.lot_no ?? '',
          productCode: product?.code ?? '',
          productName: product?.name ?? '-',
          reason: row.reason ?? '',
          status: row.status ?? '',
          systemQty: toNumber(row.system_qty),
          valueNote: toNumber(row.value_note),
          warehouseName: row.warehouse_id ? warehouseById.get(row.warehouse_id)?.name ?? '-' : '-',
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการปรับสต๊อกไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const values = stockAdjustFormSchema.parse(await request.json())
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
    const systemQty = await quantityForStock({ branchId: references.branchId, lotNo: values.lotNo, productId: references.productId, warehouseId: references.warehouseId })
    const diffQty = values.countedQty - systemQty
    if (Math.abs(diffQty) < 0.000001) {
      return NextResponse.json({ error: 'นับจริงเท่ากับยอดในระบบ ไม่ต้องสร้างรายการปรับ' }, { status: 400 })
    }

    const unitCost = await averageCostForStock({ branchId: references.branchId, lotNo: values.lotNo, productId: references.productId, warehouseId: references.warehouseId })
    const docNo = values.docNo ?? await nextDocNo()
    const actor = currentActor(context)
    const adjustType = diffQty < 0 ? 'LOSS' : 'GAIN'

    await prisma.$transaction(async (tx) => {
      const adjustment = await tx.stock_adjustments.create({
        data: {
          adjust_type: adjustType,
          branch_id: references.branchId,
          counted_qty: values.countedQty,
          created_by: actor,
          date: normalizeDate(values.date),
          diff_qty: diffQty,
          doc_no: docNo,
          lot_no: values.lotNo,
          product_id: references.productId,
          reason: values.reason,
          remark: values.remark,
          status: 'posted',
          system_qty: systemQty,
          unit_cost_used: unitCost,
          updated_by: actor,
          value_note: Math.abs(diffQty) * unitCost,
          warehouse_id: references.warehouseId,
        },
      })
      const ledger = await tx.stock_ledger.create({
        data: {
          branch_id: references.branchId,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: values.lotNo,
          movement_type: diffQty < 0 ? 'STOCK_COUNT_LOSS' : 'STOCK_COUNT_GAIN',
          notes: values.reason,
          product_id: references.productId,
          qty_in: diffQty > 0 ? diffQty : 0,
          qty_out: diffQty < 0 ? Math.abs(diffQty) : 0,
          ref_id: String(adjustment.id),
          ref_no: docNo,
          ref_type: 'ADJ',
          unit_cost: unitCost,
          value_in: 0,
          value_out: 0,
          warehouse_id: references.warehouseId,
        },
      })
      await tx.stock_adjustments.update({
        data: { stock_ledger_id: ledger.id },
        where: { id: adjustment.id },
      })
    })

    return NextResponse.json({ id: docNo, refNo: docNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกปรับสต๊อกไม่ได้', 400)
  }
}
