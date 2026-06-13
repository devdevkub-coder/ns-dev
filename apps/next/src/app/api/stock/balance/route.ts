import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildStockWorkbook, stockBalanceDetail, stockBalanceSnapshot, stockReferenceData, xlsxResponse } from '@/lib/server/stock'
import { stockQuerySchema } from '@/lib/stock'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const searchParams = new URL(request.url).searchParams
    const query = stockQuerySchema.parse(Object.fromEntries(searchParams))
    if (searchParams.get('detail') === '1') {
      if (!query.productId || !query.branchId || !query.warehouseId) {
        return NextResponse.json({ error: 'ระบุสินค้า สาขา และคลังให้ครบก่อนดูรายละเอียด' }, { status: 400 })
      }
      return NextResponse.json({
        detail: await stockBalanceDetail({
          branchId: query.branchId,
          lotNo: query.lotNo,
          notAvailable: searchParams.get('notAvailable') === '1' || searchParams.get('notAvailable') === 'true',
          productId: query.productId,
          status: query.status,
          warehouseId: query.warehouseId,
        }),
      })
    }

    const [snapshot, reference] = await Promise.all([
      stockBalanceSnapshot(query),
      stockReferenceData(),
    ])

    if (query.format === 'xlsx') {
      const body = buildStockWorkbook('Stock Balance', snapshot.rows.map((row) => ({
        สินค้า: `${row.productCode} ${row.productName}`.trim(),
        คลัง: row.onHoldQty > 0 ? `${row.status} / On Hold` : row.status,
        สาขา: row.branchName,
        คลังจัดเก็บ: row.warehouseName,
        Lot: row.lotNo,
        คงเหลือ: row.qty,
        จองไว้: row.onHoldQty,
        พร้อมส่ง: row.readyQty,
        มูลค่า: row.value,
        ต้นทุนเฉลี่ย: row.avgCost,
        พร้อมขาย: row.notAvailable ? 'No' : 'Yes',
        ล่าสุด: row.lastDate,
      })))
      return xlsxResponse(body, `stock_balance_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return NextResponse.json({ ...snapshot, reference })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดสต๊อกคงเหลือไม่ได้', 500)
  }
}
