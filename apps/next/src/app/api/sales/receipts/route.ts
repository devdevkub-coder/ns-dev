import { NextResponse } from 'next/server'
import { customerReceiptFormSchema } from '@/lib/daily'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { currentActor, listDailyAccounts, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { getActivePaymentMethods } from '@/lib/server/payment-methods'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [accounts, customers, bills, receipts, paymentMethods] = await Promise.all([
      listDailyAccounts(),
      prisma.customers.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
      prisma.sales_bills.findMany({
        include: { customers: { select: { code: true } } },
        orderBy: [{ date: 'desc' }],
        take: 5000,
      }),
      prisma.receipts.findMany({
        include: { accounts: true, customers: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
      getActivePaymentMethods(),
    ])
    const billDocNoById = new Map(bills.map((bill) => [bill.id, bill.doc_no]))

    return NextResponse.json({
      accounts,
      bills: bills.map((bill) => ({
        customerId: requireBusinessCode(bill.customers?.code, `ลูกค้าบิลขาย ${bill.id}`),
        docNo: bill.doc_no,
        id: bill.doc_no,
        receivableBalance: toNumber(bill.receivable_balance),
        totalAmount: toNumber(bill.total_amount),
      })),
      customers: customers.map((customer) => ({
        ...customer,
        id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
      })),
      paymentMethods,
      rows: receipts.map((receipt) => ({
        accountId: receipt.accounts?.code ?? '',
        accountName: receipt.accounts?.name ?? '-',
        amount: toNumber(receipt.amount),
        billId: receipt.bill_id ? (billDocNoById.get(receipt.bill_id) ?? '') : '',
        customerId: receipt.customers?.code ?? '',
        customerName: receipt.customers?.name ?? '-',
        date: toDateOnly(receipt.date),
        docNo: receipt.doc_no,
        fee: toNumber(receipt.fee ?? receipt.bank_fee),
        id: receipt.doc_no,
        method: receipt.method ?? '',
        netAmount: toNumber(receipt.net_amount),
        notes: receipt.notes ?? '',
        partyName: receipt.customers?.name ?? '-',
        withholdingTax: toNumber(receipt.withholding_tax),
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
    const docNo = values.docNo ?? await nextDailyDocNo('receipts', 'RCP', values.date)
    const actor = currentActor(context)
    const netAmount = values.amount - values.fee - values.withholdingTax - values.discount
    const billDocNo = values.billId?.trim() ?? ''
    const account = await findActiveAccountReferenceByCode(values.accountId)
    const customer = await findActiveCustomerReferenceByCodeOrId(values.customerId)

    if (!customer) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!account) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บัญชีรับเงินไม่ถูกต้อง' }, { status: 400 })
    }

    const bill = billDocNo
      ? await prisma.sales_bills.findFirst({
        select: { customer_id: true, id: true },
        where: { doc_no: billDocNo },
      })
      : null

    if (values.billId && !bill) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลขายไม่ถูกต้อง' }, { status: 400 })
    }

    if (bill?.customer_id && bill.customer_id !== customer.id) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าและบิลขายไม่ตรงกัน' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingReceipt = values.id
        ? await tx.receipts.findFirst({ where: { doc_no: values.id }, select: { id: true } })
        : null

      if (values.id && !existingReceipt) {
        throw new Error('ไม่พบรายการรับเงินที่ต้องการแก้ไข')
      }

      const receiptData = {
        account_id: account.id,
        amount: values.amount,
        bank_fee: values.fee,
        bill_id: bill?.id ?? null,
        customer_id: customer.id,
        date: normalizeDate(values.date),
        discount: values.discount,
        doc_no: docNo,
        fee: values.fee,
        method: values.method,
        net_amount: netAmount,
        notes: values.notes,
        updated_at: new Date(),
        updated_by: actor,
        voucher_id: docNo,
        withholding_tax: values.withholdingTax,
      }

      const receipt = existingReceipt
        ? await tx.receipts.update({
          data: receiptData,
          where: { id: existingReceipt.id },
        })
        : await tx.receipts.create({
          data: {
            ...receiptData,
            created_by: actor,
            status: 'active',
          },
        })

      const receiptRefId = stringifyBusinessValue(receipt.id)
      const statementDocNo = await nextDailyDocNo('bank_statement', 'BST', values.date)
      await tx.bank_statement.deleteMany({ where: { ref_id: receiptRefId, ref_type: 'RCP' } })
      await tx.bank_statement.create({
        data: {
          account_id: account.id,
          amount_in: netAmount,
          amount_out: 0,
          created_by: actor,
          date: normalizeDate(values.date),
          description: `${docNo} - รับเงิน Customer`,
          doc_no: statementDocNo,
          ref_id: receiptRefId,
          ref_no: docNo,
          ref_type: 'RCP',
          type: 'รับเงิน Customer',
        },
      })

      return receipt
    })

    return NextResponse.json({ id: result.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรับเงิน Customer ไม่ได้', 400)
  }
}
