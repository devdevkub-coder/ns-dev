import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../../../../generated/prisma/client'
import { supplierPaymentFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { activeWhtRatePercent } from '@/lib/server/tax-settings'

export const runtime = 'nodejs'

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function withholdingTaxFromCashAmount(amount: number, ratePercent: number) {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent >= 100) return 0
  return roundMoney(amount * ratePercent / (100 - ratePercent))
}

function branchPaymentCode(branchCode: string | null | undefined) {
  const digits = String(branchCode ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(2, '0').slice(-2) : null
}

async function nextSupplierPaymentDocNo(tx: Prisma.TransactionClient, date: string, branchCode: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `PMT${branchCode}${compactDate}-`
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.payments
    where doc_no like ${`PMT${compactDate}-%`}
       or doc_no like ${`PMT__${compactDate}-%`}
  `
  const lastNumber = rows.reduce((max, row) => {
    const running = Number(row.doc_no.split('-').at(-1))
    return Number.isFinite(running) && running > max ? running : max
  }, 0)
  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
}

async function refreshPurchaseBillPaymentStatus(tx: Prisma.TransactionClient, billId: string, actor: string) {
  const bill = await tx.purchase_bills.findUnique({
    select: { id: true, status: true, total_amount: true },
    where: { id: billId },
  })
  if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการตัดชำระ')
  if (String(bill.status ?? '').toLowerCase().includes('cancel')) {
    throw new Error('ตัดชำระไม่ได้ เพราะบิลซื้อถูกยกเลิกแล้ว')
  }

  const payments = await tx.payments.findMany({
    select: { amount: true, discount: true, status: true, withholding_tax: true },
    where: { bill_id: billId, NOT: { status: 'cancelled' } },
  })
  const paidAmount = payments.reduce((sum, payment) => (
    sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
  ), 0)
  const totalAmount = toNumber(bill.total_amount)
  if (paidAmount - totalAmount > 0.01) throw new Error('ยอดจ่ายรวมเกินยอดค้างของบิลซื้อ')

  const payableBalance = Math.max(0, totalAmount - paidAmount)
  const status = paidAmount <= 0 ? 'open' : payableBalance <= 0.01 ? 'paid' : 'partial'

  await tx.purchase_bills.update({
    data: {
      paid_amount: paidAmount,
      payable_balance: payableBalance,
      status,
      updated_at: new Date(),
      updated_by: actor,
    },
    where: { id: billId },
  })
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [accounts, suppliers, bills, payments, whtRatePercent] = await Promise.all([
      listDailyAccounts(),
      prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, id: true, name: true } }),
      prisma.purchase_bills.findMany({
        orderBy: [{ date: 'desc' }],
        select: { date: true, doc_no: true, id: true, paid_amount: true, payable_balance: true, status: true, supplier_id: true, total_amount: true },
        take: 5000,
      }),
      prisma.payments.findMany({
        include: { accounts: true, suppliers: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
      activeWhtRatePercent(new Date()),
    ])

    return NextResponse.json({
      accounts,
      bills: bills.map((bill) => ({
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.id,
        paidAmount: toNumber(bill.paid_amount),
        payableBalance: toNumber(bill.payable_balance),
        status: bill.status ?? '',
        supplierId: bill.supplier_id,
        totalAmount: toNumber(bill.total_amount),
      })),
      rows: payments.map((payment) => ({
        accountId: payment.account_id ?? '',
        accountName: payment.accounts?.name ?? '-',
        amount: toNumber(payment.amount),
        billId: payment.bill_id ?? '',
        date: toDateOnly(payment.date),
        docNo: payment.doc_no,
        fee: toNumber(payment.fee ?? payment.bank_fee),
        id: payment.id,
        method: payment.method ?? '',
        netAmount: toNumber(payment.net_amount),
        notes: payment.notes ?? '',
        partyName: payment.suppliers?.name ?? payment.supplier_id ?? '-',
        supplierId: payment.supplier_id ?? '',
        supplierName: payment.suppliers?.name ?? payment.supplier_id ?? '-',
        withholdingTax: toNumber(payment.withholding_tax),
      })),
      settings: { whtRatePercent },
      suppliers,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการจ่ายเงิน Supplier ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = supplierPaymentFormSchema.parse(await request.json())
    const id = values.id ?? `PMT-${randomUUID()}`
    const actor = currentActor(context)
    const paymentDate = normalizeDate(values.date)
    const whtRatePercent = await activeWhtRatePercent(paymentDate)
    const withholdingTax = withholdingTaxFromCashAmount(values.amount, whtRatePercent)
    const netAmount = values.amount + values.fee

    const result = await prisma.$transaction(async (tx) => {
      const [bill, account] = await Promise.all([
        values.billId
          ? tx.purchase_bills.findUnique({
            select: { branch_id: true, supplier_id: true },
            where: { id: values.billId },
          })
          : Promise.resolve(null),
        tx.accounts.findUnique({
          select: { branch_id: true },
          where: { id: values.accountId },
        }),
      ])
      if (values.billId && !bill) throw new Error('ไม่พบบิลซื้อที่ต้องการตัดชำระ')
      const branchId = bill?.branch_id ?? account?.branch_id ?? null
      if (!branchId) throw new Error('ไม่พบสาขาสำหรับออกเลขเอกสารจ่ายเงิน Supplier')
      const branch = await tx.branches.findFirst({
        select: { code: true },
        where: { active: true, id: branchId },
      })
      const branchCode = branchPaymentCode(branch?.code)
      if (!branchCode) throw new Error('รหัสสาขาต้องเป็นตัวเลขเพื่อออกเลขเอกสารจ่ายเงิน Supplier')
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('payments.doc_no'))`
      const docNo = values.docNo ?? await nextSupplierPaymentDocNo(tx, values.date, branchCode)

      const existingPayment = await tx.payments.findUnique({
        select: { bill_id: true },
        where: { id },
      })

      const payment = await tx.payments.upsert({
        where: { id },
        create: {
          account_id: values.accountId,
          amount: values.amount,
          bank_fee: values.fee,
          bill_id: values.billId,
          branch_id: branchId,
          created_by: actor,
          date: paymentDate,
          discount: values.discount,
          doc_no: docNo,
          fee: values.fee,
          id,
          method: values.method,
          net_amount: netAmount,
          notes: values.notes,
          status: 'active',
          supplier_id: values.supplierId,
          updated_at: new Date(),
          updated_by: actor,
          voucher_id: id,
          withholding_tax: withholdingTax,
        },
        update: {
          account_id: values.accountId,
          amount: values.amount,
          bank_fee: values.fee,
          bill_id: values.billId,
          branch_id: branchId,
          date: paymentDate,
          discount: values.discount,
          doc_no: docNo,
          fee: values.fee,
          method: values.method,
          net_amount: netAmount,
          notes: values.notes,
          supplier_id: values.supplierId,
          updated_at: new Date(),
          updated_by: actor,
          voucher_id: id,
          withholding_tax: withholdingTax,
        },
      })

      await tx.bank_statement.deleteMany({ where: { ref_id: id, ref_type: 'PMT' } })
      await tx.bank_statement.create({
        data: {
          account_id: values.accountId,
          amount_in: 0,
          amount_out: netAmount,
          created_by: actor,
          date: paymentDate,
          description: `${docNo} - จ่าย Supplier`,
          id: `BS-PMT-${id}`,
          ref_id: id,
          ref_no: docNo,
          ref_type: 'PMT',
          type: 'จ่ายเงิน Supplier',
        },
      })

      const billIdsToRefresh = [...new Set([existingPayment?.bill_id, values.billId].filter(Boolean) as string[])]
      for (const billId of billIdsToRefresh) {
        await refreshPurchaseBillPaymentStatus(tx, billId, actor)
      }

      return payment
    })

    return NextResponse.json({ id: result.id })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกจ่ายเงิน Supplier ไม่ได้', 400)
  }
}
