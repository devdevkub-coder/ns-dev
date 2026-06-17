import { NextResponse } from 'next/server'
import { customerReceiptFormSchema } from '@/lib/daily'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { cancelCustomerReceipt, createCustomerReceipt, replaceCustomerReceipt } from '@/lib/server/customer-receipts'
import { currentActor, listDailyAccounts, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { getActivePaymentMethods } from '@/lib/server/payment-methods'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const CUSTOMER_RECEIPT_LIST_LIMIT = 5000
const CANCELLED_RECEIPT_STATUSES = ['cancelled', 'canceled']
const RECEIPT_QUEUE_STATUSES = ['pending', 'active']

type PendingReceiptSalesBill = {
  branch_id: bigint | null
  customer_id: bigint
  customers: { code: string | null; name: string } | null
  date: Date
  doc_no: string
  id: bigint
  receivable_balance: unknown
}

async function ensurePendingCustomerReceipts(context: Awaited<ReturnType<typeof getCurrentAuthContext>>) {
  const actor = currentActor(context)
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('customer_receipts.doc_no'))`

    const [account, paymentMethod, bills] = await Promise.all([
      tx.accounts.findFirst({
        orderBy: [{ active: 'desc' }, { id: 'asc' }],
        select: { code: true, id: true, name: true },
        where: { active: true },
      }),
      tx.payment_methods.findFirst({
        orderBy: [{ active: 'desc' }, { id: 'asc' }],
        select: { code: true, id: true, name: true },
        where: { active: true },
      }),
      tx.sales_bills.findMany({
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        select: {
          branch_id: true,
          customer_id: true,
          customers: { select: { code: true, name: true } },
          date: true,
          doc_no: true,
          id: true,
          receivable_balance: true,
        },
        take: CUSTOMER_RECEIPT_LIST_LIMIT,
        where: {
          receivable_balance: { gt: 0 },
          status: { notIn: ['cancelled', 'canceled'] },
        },
      }),
    ])

    if (!account) throw new Error('ไม่พบบัญชีรับเงิน active สำหรับออกใบรับเงินรอดำเนินการ')
    if (!paymentMethod) throw new Error('ไม่พบวิธีรับเงิน active สำหรับออกใบรับเงินรอดำเนินการ')

    for (const bill of bills as PendingReceiptSalesBill[]) {
      const activeAllocation = await tx.customer_receipt_allocations.findFirst({
        select: { id: true },
        where: {
          sales_bill_id: bill.id,
          status: { in: RECEIPT_QUEUE_STATUSES },
          customer_receipts: { is: { status: { in: RECEIPT_QUEUE_STATUSES } } },
        },
      })
      if (activeAllocation) continue
      const cancelledPendingAllocation = await tx.customer_receipt_allocations.findFirst({
        select: { id: true },
        where: {
          allocated_ar_amount: 0,
          sales_bill_id: bill.id,
          status: { in: CANCELLED_RECEIPT_STATUSES },
          customer_receipts: {
            is: {
              status: { in: CANCELLED_RECEIPT_STATUSES },
            },
          },
        },
      })
      if (cancelledPendingAllocation) continue

      const customerCode = requireBusinessCode(bill.customers?.code, `ลูกค้าบิลขาย ${bill.doc_no}`)
      const date = toDateOnly(bill.date)
      const docNo = await nextDailyDocNo('customer_receipts', 'RCP', date, tx)
      const receivableBalance = toNumber(bill.receivable_balance as { toNumber: () => number } | number | null | undefined)
      const receipt = await tx.customer_receipts.create({
        data: {
          account_code_snapshot: requireBusinessCode(account.code, `บัญชีเงิน ${account.id}`),
          account_id: account.id,
          account_name_snapshot: account.name,
          bank_fee_total: 0,
          branch_id: bill.branch_id,
          customer_code_snapshot: customerCode,
          customer_id: bill.customer_id,
          customer_name_snapshot: bill.customers?.name ?? '-',
          date: normalizeDate(date),
          discount_total: 0,
          doc_no: docNo,
          gross_amount: receivableBalance,
          net_cash_in: 0,
          notes: `สร้างอัตโนมัติจากบิลขาย ${bill.doc_no}`,
          payment_method_code_snapshot: paymentMethod.code,
          payment_method_id: paymentMethod.id,
          payment_method_name_snapshot: paymentMethod.name,
          status: 'pending',
          updated_by: actor,
          withholding_tax_total: 0,
          created_by: actor,
        },
      })

      await tx.customer_receipt_allocations.create({
        data: {
          allocated_ar_amount: 0,
          created_by: actor,
          customer_code_snapshot: customerCode,
          discount_amount: 0,
          line_no: 1,
          outstanding_after: receivableBalance,
          outstanding_before: receivableBalance,
          receipt_amount: 0,
          receipt_id: receipt.id,
          sales_bill_doc_no_snapshot: bill.doc_no,
          sales_bill_id: bill.id,
          status: 'pending',
          updated_by: actor,
          withholding_tax_amount: 0,
        },
      })

      await tx.customer_receipt_status_logs.create({
        data: {
          action: 'pending_created',
          created_by: actor,
          event_key: `customer-receipt.pending-created.${docNo}`,
          gross_amount_snapshot: receivableBalance,
          meta: {
            salesBillDocNo: bill.doc_no,
            salesBillId: stringifyBusinessValue(bill.id),
          },
          net_cash_in_snapshot: 0,
          note: `สร้างใบรับเงินรอรับเงินจากบิลขาย ${bill.doc_no}`,
          receipt_doc_no: docNo,
          receipt_id: receipt.id,
          to_status: 'pending',
        },
      })
    }
  })
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    await ensurePendingCustomerReceipts(context)

    const salesBillSelect = {
      customer_receipt_allocations: {
        orderBy: [{ created_at: 'desc' }] as any,
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
          customer_receipts: { is: { status: { in: RECEIPT_QUEUE_STATUSES } } },
          status: { in: RECEIPT_QUEUE_STATUSES },
        },
      },
      customers: { select: { code: true } },
      date: true,
      doc_no: true,
      id: true,
      receivable_balance: true,
      total_amount: true,
    }

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
            some: { status: { in: RECEIPT_QUEUE_STATUSES } },
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
          id: true,
          net_cash_in: true,
          notes: true,
          payment_method_name_snapshot: true,
          status: true,
          withholding_tax_total: true,
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: CUSTOMER_RECEIPT_LIST_LIMIT,
        where: { status: { not: 'pending' } },
      }),
      getActivePaymentMethods(),
    ])
    const bills = [...new Map([...outstandingBills, ...allocatedBills].map((bill) => [bill.doc_no, bill])).values()]
      .sort((left, right) => right.date.getTime() - left.date.getTime())
      .slice(0, CUSTOMER_RECEIPT_LIST_LIMIT)
    const receiptIdStrings = receipts.map((receipt) => stringifyBusinessValue(receipt.id))
    const receiptBankStatements = receiptIdStrings.length > 0
      ? await prisma.bank_statement.findMany({
        orderBy: [{ doc_no: 'asc' }],
        select: {
          accounts: { select: { code: true, name: true } },
          amount_in: true,
          ref_id: true,
        },
        where: {
          amount_in: { gt: 0 },
          ref_id: { in: receiptIdStrings },
          ref_type: 'RCP',
        },
      })
      : []
    type ReceiptBankStatement = (typeof receiptBankStatements)[number]
    const bankStatementsByReceiptId = new Map<string, ReceiptBankStatement[]>()
    for (const statement of receiptBankStatements) {
      const key = statement.ref_id ?? ''
      if (!key) continue
      const current = bankStatementsByReceiptId.get(key) ?? []
      current.push(statement)
      bankStatementsByReceiptId.set(key, current)
    }

    return NextResponse.json({
      accounts,
      bills: bills.map((bill) => ({
        activeReceiptDocNos: [...new Set(bill.customer_receipt_allocations
          .filter((allocation) => {
            const receiptStatus = allocation.customer_receipts.status.toLowerCase()
            return RECEIPT_QUEUE_STATUSES.includes(allocation.status) && RECEIPT_QUEUE_STATUSES.includes(receiptStatus)
          })
          .map((allocation) => allocation.customer_receipts.doc_no))],
        receiptStatus: bill.customer_receipt_allocations.find((allocation) => RECEIPT_QUEUE_STATUSES.includes(allocation.status))?.customer_receipts.status ?? '',
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
      rows: receipts.map((receipt) => {
        const receiptStatements = bankStatementsByReceiptId.get(stringifyBusinessValue(receipt.id)) ?? []
        const accountSummaries = receiptStatements.length > 0
          ? receiptStatements.map((statement) => `${statement.accounts?.name ?? '-'} - ${toNumber(statement.amount_in).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`)
          : [receipt.account_name_snapshot]
        return {
          accountId: receipt.account_code_snapshot,
          accountName: accountSummaries[0] ?? receipt.account_name_snapshot,
          accountNames: receiptStatements.length > 0
            ? receiptStatements.map((statement) => statement.accounts?.name ?? '-')
            : [receipt.account_name_snapshot],
          accountSplits: receiptStatements.length > 0
            ? receiptStatements.map((statement, index) => ({
              accountId: statement.accounts?.code ?? receipt.account_code_snapshot,
              amount: toNumber(statement.amount_in),
              id: `${receipt.doc_no}-split-${index + 1}`,
            }))
            : [{
              accountId: receipt.account_code_snapshot,
              amount: toNumber(receipt.net_cash_in),
              id: `${receipt.doc_no}-split-1`,
            }],
          accountSummaries,
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
        }
      }),
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
