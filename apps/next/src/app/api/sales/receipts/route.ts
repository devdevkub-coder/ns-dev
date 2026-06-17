import { NextResponse } from 'next/server'
import { customerReceiptFormSchema } from '@/lib/daily'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { cancelCustomerReceipt, createCustomerReceipt, replaceCustomerReceipt } from '@/lib/server/customer-receipts'
import { listDailyAccounts, toDateOnly, toNumber } from '@/lib/server/daily'
import { getActivePaymentMethods } from '@/lib/server/payment-methods'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const CUSTOMER_RECEIPT_LIST_LIMIT = 5000

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const salesBillSelect = {
      customer_receipt_allocations: {
        orderBy: [{ created_at: 'desc' }],
        select: {
          customer_receipts: {
            select: {
              doc_no: true,
              status: true,
            },
          },
          status: true,
        },
        where: {
          customer_receipts: { is: { status: { notIn: ['cancelled', 'canceled'] } } },
          status: 'active',
        },
      },
      customers: { select: { code: true } },
      date: true,
      doc_no: true,
      id: true,
      receivable_balance: true,
      total_amount: true,
    } as const

    const [accounts, customers, outstandingBills, allocatedBills, receipts, paymentMethods] = await Promise.all([
      listDailyAccounts(),
      prisma.customers.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
      prisma.sales_bills.findMany({
        select: salesBillSelect,
        orderBy: [{ date: 'desc' }],
        take: CUSTOMER_RECEIPT_LIST_LIMIT,
        where: {
          receivable_balance: { gt: 0 },
          status: { notIn: ['cancelled', 'canceled'] },
        },
      }),
      prisma.sales_bills.findMany({
        select: salesBillSelect,
        orderBy: [{ date: 'desc' }],
        take: CUSTOMER_RECEIPT_LIST_LIMIT,
        where: {
          customer_receipt_allocations: {
            some: { status: 'active' },
          },
        },
      }),
      prisma.customer_receipts.findMany({
        select: {
          account_code_snapshot: true,
          account_name_snapshot: true,
          bank_fee_total: true,
          customer_receipt_allocations: {
            orderBy: [{ line_no: 'asc' }],
            select: {
              discount_amount: true,
              line_no: true,
              receipt_amount: true,
              sales_bill_doc_no_snapshot: true,
              withholding_tax_amount: true,
            },
          },
          customer_code_snapshot: true,
          customer_name_snapshot: true,
          date: true,
          doc_no: true,
          gross_amount: true,
          net_cash_in: true,
          notes: true,
          payment_method_name_snapshot: true,
          status: true,
          withholding_tax_total: true,
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: CUSTOMER_RECEIPT_LIST_LIMIT,
      }),
      getActivePaymentMethods(),
    ])
    const bills = [...new Map([...outstandingBills, ...allocatedBills].map((bill) => [bill.doc_no, bill])).values()]
      .sort((left, right) => right.date.getTime() - left.date.getTime())
      .slice(0, CUSTOMER_RECEIPT_LIST_LIMIT)

    return NextResponse.json({
      accounts,
      bills: bills.map((bill) => ({
        activeReceiptDocNos: [...new Set(bill.customer_receipt_allocations
          .filter((allocation) => {
            const receiptStatus = allocation.customer_receipts.status.toLowerCase()
            return allocation.status === 'active' && receiptStatus !== 'cancelled' && receiptStatus !== 'canceled'
          })
          .map((allocation) => allocation.customer_receipts.doc_no))],
        customerId: requireBusinessCode(bill.customers?.code, `ลูกค้าบิลขาย ${bill.id}`),
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.doc_no,
        paidAmount: Math.max(0, toNumber(bill.total_amount) - toNumber(bill.receivable_balance)),
        receivableBalance: toNumber(bill.receivable_balance),
        totalAmount: toNumber(bill.total_amount),
      })),
      customers: customers.map((customer) => ({
        ...customer,
        id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
      })),
      paymentMethods,
      rows: receipts.map((receipt) => ({
        accountId: receipt.account_code_snapshot,
        accountName: receipt.account_name_snapshot,
        amount: toNumber(receipt.gross_amount),
        billDocNos: receipt.customer_receipt_allocations.map((allocation) => allocation.sales_bill_doc_no_snapshot),
        billId: receipt.customer_receipt_allocations[0]?.sales_bill_doc_no_snapshot ?? '',
        customerId: receipt.customer_code_snapshot,
        customerName: receipt.customer_name_snapshot,
        date: toDateOnly(receipt.date),
        docNo: receipt.doc_no,
        fee: toNumber(receipt.bank_fee_total),
        id: receipt.doc_no,
        method: receipt.payment_method_name_snapshot,
        netAmount: toNumber(receipt.net_cash_in),
        notes: receipt.notes ?? '',
        partyName: receipt.customer_name_snapshot,
        receiptLines: receipt.customer_receipt_allocations.map((allocation) => ({
          discountAmount: toNumber(allocation.discount_amount),
          lineNo: allocation.line_no,
          receiptAmount: toNumber(allocation.receipt_amount),
          salesBillDocNo: allocation.sales_bill_doc_no_snapshot,
          withholdingTaxAmount: toNumber(allocation.withholding_tax_amount),
        })),
        status: receipt.status,
        withholdingTax: toNumber(receipt.withholding_tax_total),
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการรับเงิน Customer ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = customerReceiptFormSchema.parse(await request.json())
    const result = await createCustomerReceipt(values, context)

    return NextResponse.json(result)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรับเงิน Customer ไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const payload = await request.json() as { action?: string; docNo?: string; reason?: string; values?: unknown }
    if (payload.action === 'cancel') {
      const result = await cancelCustomerReceipt(payload.docNo ?? '', payload.reason ?? '', context)
      return NextResponse.json(result)
    }
    if (payload.action === 'replace') {
      const values = customerReceiptFormSchema.parse(payload.values)
      const result = await replaceCustomerReceipt(payload.docNo ?? values.id ?? '', values, payload.reason ?? 'แก้ไข Receipt Voucher โดยยกเลิกใบเดิมและออกใบใหม่', context)
      return NextResponse.json(result)
    }
    return NextResponse.json({ code: 'BAD_REQUEST', error: 'action ไม่ถูกต้อง' }, { status: 400 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรับเงิน Customer ไม่ได้', 400)
  }
}
