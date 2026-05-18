import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { stockTransferFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

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
      prisma.branches.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, id: true, name: true } }),
      prisma.warehouses.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, branch_id: true, id: true, name: true } }),
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
      to: string
      totalQty: number
    }>()
    for (const row of ledgerRows) {
      const key = row.ref_id ?? row.ref_no ?? row.id
      const current = grouped.get(key) ?? {
        date: toDateOnly(row.date),
        docNo: row.ref_no ?? key,
        from: '',
        id: key,
        itemCount: 0,
        to: '',
        totalQty: 0,
      }
      if (toNumber(row.qty_out) > 0) current.from = `${row.branches?.name ?? '-'} / ${row.warehouses?.name ?? '-'}`
      if (toNumber(row.qty_in) > 0) current.to = `${row.branches?.name ?? '-'} / ${row.warehouses?.name ?? '-'}`
      if (toNumber(row.qty_out) > 0) {
        current.itemCount += 1
        current.totalQty += toNumber(row.qty_out)
      }
      grouped.set(key, current)
    }

    return NextResponse.json({
      branches,
      products,
      rows: Array.from(grouped.values()),
      warehouses,
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

    await prisma.$transaction(async (tx) => {
      await tx.stock_ledger.deleteMany({ where: { ref_id: refId, ref_type: 'ST' } })
      for (const item of values.items) {
        const unitCost = 0
        await tx.stock_ledger.createMany({
          data: [
            {
              branch_id: values.fromBranchId,
              created_by: actor,
              date: normalizeDate(values.date),
              id: `SL-ST-${randomUUID()}`,
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
              warehouse_id: values.fromWarehouseId,
            },
            {
              branch_id: values.toBranchId,
              created_by: actor,
              date: normalizeDate(values.date),
              id: `SL-ST-${randomUUID()}`,
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
              warehouse_id: values.toWarehouseId,
            },
          ],
        })
      }
    })

    return NextResponse.json({ id: refId })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกโอนสินค้าไม่ได้', 400)
  }
}
