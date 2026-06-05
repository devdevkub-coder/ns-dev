import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBusinessCode, requireDocumentNo } from '@/lib/business-code'
import { stockTransferFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { normalizeStockReferenceInput } from '@/lib/server/stock'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'

export const runtime = 'nodejs'

async function nextStockTransferDocNo(date: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `ST${compactDate}-`
  const last = await prisma.stock_ledger.findFirst({
    orderBy: { ref_no: 'desc' },
    select: { ref_no: true },
    where: { ref_no: { startsWith }, ref_type: 'ST' },
  })
  const lastNumber = Number(String(last?.ref_no ?? '').slice(startsWith.length))
  return `${startsWith}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(4, '0')}`
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const [branches, warehouses, products, ledgerRows] = await Promise.all([
      prisma.branches.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
      prisma.warehouses.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          active: true,
          branches: { select: { code: true } },
          branch_id: true,
          code: true,
          id: true,
          name: true,
        },
      }),
      prisma.products.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
      prisma.stock_ledger.findMany({
        include: { branches: true, products: true, warehouses: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
        where: { ref_type: 'ST' },
      }),
    ])

    const grouped = new Map<string, {
      date: string
      docNo: string
      from: string
      id: string
      itemCount: number
      notes: string
      to: string
      totalQty: number
    }>()
    for (const row of ledgerRows) {
      const key = requireDocumentNo(row.ref_no, `stock_ledger ${row.id}`)
      const current = grouped.get(key) ?? {
        date: toDateOnly(row.date),
        docNo: key,
        from: '',
        id: key,
        itemCount: 0,
        notes: row.notes ?? '',
        to: '',
        totalQty: 0,
      }
      if (!current.notes && row.notes) current.notes = row.notes
      if (toNumber(row.qty_out) > 0) current.from = `${row.branches?.name ?? '-'} / ${row.warehouses?.name ?? '-'}`
      if (toNumber(row.qty_in) > 0) current.to = `${row.branches?.name ?? '-'} / ${row.warehouses?.name ?? '-'}`
      if (toNumber(row.qty_out) > 0) {
        current.itemCount += 1
        current.totalQty += toNumber(row.qty_out)
      }
      grouped.set(key, current)
    }

    return NextResponse.json({
      branches: branches.map((branch) => ({
        ...branch,
        id: branch.code,
      })),
      products: products.map((product) => ({
        ...product,
        id: product.code,
      })),
      rows: Array.from(grouped.values()),
      warehouses: warehouses.map((warehouse) => ({
        ...warehouse,
        branch_id: warehouse.branches ? requireBusinessCode(warehouse.branches.code, `สาขาคลัง ${warehouse.branch_id ?? warehouse.id}`) : null,
        id: warehouse.code,
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการโอนสินค้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const values = stockTransferFormSchema.parse(await request.json())
    const refId = `ST-${randomUUID()}`
    const docNo = values.docNo ?? await nextStockTransferDocNo(values.date)
    const actor = currentActor(context)
    const [fromBranch, toBranch, fromWarehouse, toWarehouse] = await Promise.all([
      findActiveBranchReferenceByCodeOrId(values.fromBranchId),
      findActiveBranchReferenceByCodeOrId(values.toBranchId),
      findActiveWarehouseReferenceByCodeOrId(values.fromWarehouseId),
      findActiveWarehouseReferenceByCodeOrId(values.toWarehouseId),
    ])

    if (!fromBranch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาต้นทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!toBranch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!fromWarehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'คลังต้นทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!toWarehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'คลังปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (fromWarehouse.branchCode && fromWarehouse.branchCode !== fromBranch.code) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาต้นทางและคลังต้นทางไม่ตรงกัน' }, { status: 400 })
    }
    if (toWarehouse.branchCode && toWarehouse.branchCode !== toBranch.code) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาปลายทางและคลังปลายทางไม่ตรงกัน' }, { status: 400 })
    }
    const normalizedItems = await Promise.all(values.items.map(async (item, index) => {
      const productReference = await normalizeStockReferenceInput({ productId: item.productId })
      if (!productReference.productId) {
        throw new Error(`สินค้าแถวที่ ${index + 1} ไม่ถูกต้องหรือถูกปิดใช้งาน`)
      }
      return {
        ...item,
        productId: productReference.productId,
      }
    }))

    await prisma.$transaction(async (tx) => {
      await tx.stock_ledger.deleteMany({ where: { ref_id: refId, ref_type: 'ST' } })
      for (const item of normalizedItems) {
        const unitCost = 0
        await tx.stock_ledger.createMany({
          data: [
            {
              branch_id: fromBranch.id,
              created_by: actor,
              date: normalizeDate(values.date),
              lot_no: item.lotNo,
              movement_type: 'โอนระหว่างสาขา-ออก',
              notes: values.notes,
              product_id: item.productId,
              qty_in: 0,
              qty_out: item.qty,
              ref_id: refId,
              ref_no: docNo,
              ref_type: 'ST',
              unit_cost: unitCost,
              value_in: 0,
              value_out: 0,
              warehouse_id: fromWarehouse.id,
            },
            {
              branch_id: toBranch.id,
              created_by: actor,
              date: normalizeDate(values.date),
              lot_no: item.lotNo,
              movement_type: 'โอนระหว่างสาขา-เข้า',
              notes: values.notes,
              product_id: item.productId,
              qty_in: item.qty,
              qty_out: 0,
              ref_id: refId,
              ref_no: docNo,
              ref_type: 'ST',
              unit_cost: unitCost,
              value_in: 0,
              value_out: 0,
              warehouse_id: toWarehouse.id,
            },
          ],
        })
      }
    })

    return NextResponse.json({ id: docNo, refNo: docNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกโอนสินค้าไม่ได้', 400)
  }
}
