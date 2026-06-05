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
      select: {
        after_amount: true,
        after_price: true,
        after_supplier_id: true,
        before_amount: true,
        before_price: true,
        before_supplier_id: true,
        bill_id: true,
        changed_by: true,
        event_key: true,
        id: true,
        item_index: true,
        reason: true,
        swap_date: true,
      },
      take: 5000,
    })
    const supplierIds = Array.from(new Set(
      rows
        .flatMap((row) => [row.before_supplier_id, row.after_supplier_id])
        .filter((value): value is bigint => value != null),
    ))
    const billIds = Array.from(new Set(
      rows
        .map((row) => row.bill_id)
        .filter((value): value is bigint => value != null),
    ))
    const [suppliers, bills] = await Promise.all([
      supplierIds.length ? prisma.suppliers.findMany({ select: { code: true, id: true, name: true }, where: { id: { in: supplierIds } } }) : [],
      billIds.length ? prisma.purchase_bills.findMany({ select: { doc_no: true, id: true }, where: { id: { in: billIds } } }) : [],
    ])
    const supplierCodeById = new Map(suppliers.map((supplier) => [supplier.id, supplier.code]))
    const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]))
    const billDocNoById = new Map(bills.map((bill) => [bill.id, bill.doc_no]))

    return NextResponse.json({
      rows: rows.map((row) => {
        const afterSupplierId = row.after_supplier_id
        const beforeSupplierId = row.before_supplier_id
        const billDocNo = billDocNoById.get(row.bill_id) ?? ''

        return {
          afterAmount: toNumber(row.after_amount),
          afterPrice: toNumber(row.after_price),
          afterSupplierId: afterSupplierId != null ? (supplierCodeById.get(afterSupplierId) ?? '') : '',
          afterSupplierName: afterSupplierId != null ? (supplierNameById.get(afterSupplierId) ?? '-') : '-',
          beforeAmount: toNumber(row.before_amount),
          beforePrice: toNumber(row.before_price),
          beforeSupplierId: beforeSupplierId != null ? (supplierCodeById.get(beforeSupplierId) ?? '') : '',
          beforeSupplierName: beforeSupplierId != null ? (supplierNameById.get(beforeSupplierId) ?? '-') : '-',
          billDocNo,
          billId: billDocNo,
          changedBy: row.changed_by ?? '',
          id: row.event_key,
          itemIndex: row.item_index,
          reason: row.reason ?? '',
          swapDate: toDateOnly(row.swap_date),
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดประวัติเปลี่ยน Supplier ไม่ได้', 500)
  }
}
