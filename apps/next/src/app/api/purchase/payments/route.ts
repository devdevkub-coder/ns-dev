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
    const paymentLines = (values.lines?.length ? values.lines : [{
      amount: values.amount,
      billId: values.billId,
      discount: values.discount,
      fee: values.fee,
      id: null,
      supplierId: values.supplierId,
      withholdingTax: values.withholdingTax,
    }]).filter((line) => line.billId && toNumber(line.amount) > 0)
    if (paymentLines.length === 0) throw new Error('เพิ่มรายการจ่ายอย่างน้อย 1 รายการ')
    const paymentLineTotals = paymentLines.map((line, index) => ({
      ...line,
      amount: toNumber(line.amount),
      discount: toNumber(line.discount),
      fee: toNumber(line.fee),
      id: paymentLines.length === 1 ? id : `${id}-L${index + 1}`,
      withholdingTax: withholdingTaxFromCashAmount(toNumber(line.amount), whtRatePercent),
    }))
    const totalAmount = roundMoney(paymentLineTotals.reduce((sum, line) => sum + line.amount, 0))
    const totalFee = roundMoney(paymentLineTotals.reduce((sum, line) => sum + line.fee, 0))
    const netAmount = totalAmount + totalFee
    const paymentSplits = values.splits
    const splitTotal = roundMoney(paymentSplits.reduce((sum, split) => sum + toNumber(split.amount), 0))
    if (Math.abs(splitTotal - netAmount) > 0.01) {
      throw new Error('รวมยอดแยกบัญชีต้องเท่ากับยอดสุทธิที่ต้องจ่าย')
    }
    const primaryAccountId = paymentSplits[0]?.accountId
    if (!primaryAccountId) throw new Error('เลือกบัญชีจ่าย')

    const result = await prisma.$transaction(async (tx) => {
      const splitAccountIds = [...new Set(paymentSplits.map((split) => split.accountId))]
      const lineBillIds = [...new Set(paymentLineTotals.map((line) => line.billId))]
      const [lineBills, account] = await Promise.all([
        tx.purchase_bills.findMany({
          select: { branch_id: true, id: true, supplier_id: true },
          where: { id: { in: lineBillIds } },
        }),
        tx.accounts.findUnique({
          select: { branch_id: true },
          where: { id: primaryAccountId },
        }),
      ])
      const billById = new Map(lineBills.map((bill) => [bill.id, bill]))
      if (billById.size !== lineBillIds.length) throw new Error('ไม่พบบิลซื้อที่ต้องการตัดชำระ')
      const splitAccountCount = await tx.accounts.count({ where: { active: true, id: { in: splitAccountIds } } })
      if (splitAccountCount !== splitAccountIds.length) throw new Error('บัญชีจ่ายบางรายการไม่ถูกต้องหรือไม่ active')
      const firstBill = billById.get(paymentLineTotals[0].billId)
      const branchId = firstBill?.branch_id ?? account?.branch_id ?? null
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

      await tx.payments.deleteMany({ where: { voucher_id: id, id: { notIn: paymentLineTotals.map((line) => line.id) } } })
      const payments = []
      for (const line of paymentLineTotals) {
        const lineBill = billById.get(line.billId)
        const payment = await tx.payments.upsert({
          where: { id: line.id },
          create: {
            account_id: primaryAccountId,
            amount: line.amount,
            bank_fee: line.fee,
            bill_id: line.billId,
            branch_id: branchId,
            created_by: actor,
            date: paymentDate,
            discount: line.discount,
            doc_no: docNo,
            fee: line.fee,
            id: line.id,
            method: values.method,
            net_amount: line.amount + line.fee,
            notes: values.notes,
            status: 'active',
            supplier_id: lineBill?.supplier_id ?? line.supplierId,
            updated_at: new Date(),
            updated_by: actor,
            voucher_id: id,
            withholding_tax: line.withholdingTax,
          },
          update: {
            account_id: primaryAccountId,
            amount: line.amount,
            bank_fee: line.fee,
            bill_id: line.billId,
            branch_id: branchId,
            date: paymentDate,
            discount: line.discount,
            doc_no: docNo,
            fee: line.fee,
            method: values.method,
            net_amount: line.amount + line.fee,
            notes: values.notes,
            supplier_id: lineBill?.supplier_id ?? line.supplierId,
            updated_at: new Date(),
            updated_by: actor,
            voucher_id: id,
            withholding_tax: line.withholdingTax,
          },
        })
        payments.push(payment)
      }

      await tx.bank_statement.deleteMany({ where: { ref_id: id, ref_type: 'PMT' } })
      await tx.bank_statement.createMany({
        data: paymentSplits.map((split, index) => ({
          account_id: split.accountId,
          amount_in: 0,
          amount_out: split.amount,
          created_by: actor,
          date: paymentDate,
          description: `${docNo} - จ่าย Supplier${paymentSplits.length > 1 ? ` (split ${index + 1}/${paymentSplits.length})` : ''}`,
          id: `BS-PMT-${id}-${index}`,
          ref_id: id,
          ref_no: docNo,
          ref_type: 'PMT',
          type: 'จ่ายเงิน Supplier',
        })),
      })

      const billIdsToRefresh = [...new Set([existingPayment?.bill_id, ...paymentLineTotals.map((line) => line.billId)].filter(Boolean) as string[])]
      for (const billId of billIdsToRefresh) {
        await refreshPurchaseBillPaymentStatus(tx, billId, actor)
      }

      return payments[0]
    })

    return NextResponse.json({ id: result.id })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกจ่ายเงิน Supplier ไม่ได้', 400)
  }
}
