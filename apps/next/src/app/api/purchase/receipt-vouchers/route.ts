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

    const rows = await prisma.receipt_vouchers.findMany({
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 5000,
    })

    return NextResponse.json({
      rows: rows.map((row) => ({
        amountInWords: row.amount_in_words ?? '',
        createdAt: row.created_at?.toISOString() ?? '',
        createdBy: row.created_by ?? '',
        date: toDateOnly(row.date),
        docNo: row.doc_no,
        id: row.doc_no,
        items: row.items ?? [],
        licensePlate: row.license_plate ?? '',
        note: row.note ?? '',
        payerSignerName: row.payer_signer_name ?? '',
        paymentMethod: row.payment_method ?? '',
        purchaseBillId: row.purchase_bill_doc_no ?? '',
        purchaseBillDocNo: row.purchase_bill_doc_no ?? '',
        receiverSignerName: row.receiver_signer_name ?? '',
        salesPerson: row.sales_person ?? '',
        sellerAddress: row.seller_address ?? '',
        sellerName: row.seller_name ?? '',
        sellerPhone: row.seller_phone ?? '',
        sellerTaxId: row.seller_tax_id ?? '',
        totalAmount: toNumber(row.total_amount),
        totalQty: toNumber(row.total_qty),
        updatedAt: row.updated_at?.toISOString() ?? '',
        updatedBy: row.updated_by ?? '',
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดใบสำคัญรับเงินไม่ได้', 500)
  }
}
