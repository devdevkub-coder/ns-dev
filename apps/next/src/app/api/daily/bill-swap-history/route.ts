import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const rows = await prisma.bill_swap_history.findMany({
      orderBy: [{ swap_date: 'desc' }],
      take: 5000,
    })

    return NextResponse.json({
      rows: rows.map((row) => ({
        afterAmount: toNumber(row.after_amount),
        afterPrice: toNumber(row.after_price),
        afterSupplierId: row.after_supplier_id ?? '',
        beforeAmount: toNumber(row.before_amount),
        beforePrice: toNumber(row.before_price),
        beforeSupplierId: row.before_supplier_id ?? '',
        billId: row.bill_id,
        changedBy: row.changed_by ?? '',
        id: row.id,
        itemIndex: row.item_index,
        reason: row.reason ?? '',
        swapDate: toDateOnly(row.swap_date),
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดประวัติเปลี่ยน Supplier ไม่ได้', 500)
  }
}
