import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode, requireDocumentNo, stringifyBusinessValue } from '@/lib/business-code'
import { supplierPaymentFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, nextDailyDocNos, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { getActivePaymentMethods } from '@/lib/server/payment-methods'
import { appendPurchaseBillStatusLog, PURCHASE_BILL_STATUS_ACTION } from '@/lib/server/purchase-bill-history'
import { prisma } from '@/lib/server/prisma'
import { refreshPurchaseBillSettlement } from '@/lib/server/purchase-bill-settlement'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { activeWhtRatePercent } from '@/lib/server/tax-settings'

export const runtime = 'nodejs'

type DecimalLike = number | { toNumber: () => number } | null | undefined

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

async function refreshPurchaseBillPaymentStatus(tx: Prisma.TransactionClient, billId: bigint, actor: string) {
  const bill = await tx.purchase_bills.findUnique({
    select: { id: true, status: true },
    where: { id: billId },
  })
  if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการตัดชำระ')
  if (String(bill.status ?? '').toLowerCase().includes('cancel')) {
    throw new Error('ตัดชำระไม่ได้ เพราะบิลซื้อถูกยกเลิกแล้ว')
  }
  await refreshPurchaseBillSettlement(tx, billId, actor)
}

export async function GET() {
  try {
    const prismaExt = prisma as typeof prisma & {
      payment_approvals: {
        findMany: (args: unknown) => Promise<Array<{
          approved_amount: DecimalLike
          approved_at: Date | null
          doc_no: string | null
          destination_account_no_snapshot: string | null
          destination_bank_name_snapshot: string | null
          destination_payment_method_snapshot: string | null
          id: bigint
          party_id: string | null
          party_name_snapshot: string | null
          source_doc_no_snapshot: string | null
          source_id: string
          status: string | null
        }>>
      }
    }
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [accounts, suppliers, approvals, payments, paymentMethods, whtRatePercent] = await Promise.all([
      listDailyAccounts(),
      prisma.suppliers.findMany({
        orderBy: [{ name: 'asc' }],
        select: {
          active: true,
          code: true,
          id: true,
          name: true,
          supplier_bank_accounts: {
            include: {
              bank_names: {
                select: { code: true, name: true },
              },
            },
            orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
          },
        },
      }),
      prismaExt.payment_approvals.findMany({
        orderBy: [{ approved_at: 'desc' }, { created_at: 'desc' }],
        select: {
          approved_amount: true,
          approved_at: true,
          doc_no: true,
          destination_account_no_snapshot: true,
          destination_bank_name_snapshot: true,
          destination_payment_method_snapshot: true,
          id: true,
          party_id: true,
          party_name_snapshot: true,
          source_doc_no_snapshot: true,
          source_id: true,
          status: true,
        },
        take: 5000,
        where: { source_type: 'purchase_bill', status: 'approved' },
      }),
      prisma.payments.findMany({
        include: { accounts: true, suppliers: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
      getActivePaymentMethods(),
      activeWhtRatePercent(new Date()),
    ])
    const supplierCodeById = new Map(suppliers.map((supplier) => [supplier.id, requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)]))

    const approvalInternalIds = new Set(approvals.map((approval) => stringifyBusinessValue(approval.id)))
    const approvalDocNoByInternalId = new Map(
      approvals.map((approval) => [stringifyBusinessValue(approval.id), requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)] as const),
    )
    const paymentTotalsByApprovalId = new Map<string, number>()
    for (const payment of payments) {
      const approvalId = payment.payment_approval_id ? stringifyBusinessValue(payment.payment_approval_id) : ''
      if (!approvalId || !approvalInternalIds.has(approvalId) || payment.status === 'cancelled') continue
      const settled = toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
      paymentTotalsByApprovalId.set(approvalId, (paymentTotalsByApprovalId.get(approvalId) ?? 0) + settled)
    }

    const purchaseBillIds = [...new Set(approvals
      .map((approval) => parseInternalBigIntId(approval.source_id))
      .filter((value): value is bigint => value != null))]
    const purchaseBills = await prisma.purchase_bills.findMany({
      orderBy: [{ date: 'desc' }],
      select: { date: true, doc_no: true, id: true, paid_amount: true, payable_balance: true, status: true, supplier_id: true, total_amount: true },
      where: {
        id: { in: purchaseBillIds },
      },
    })
    const billById = new Map(purchaseBills.map((bill: typeof purchaseBills[number]) => [bill.id, bill]))

    return NextResponse.json({
      accounts,
      bills: approvals
        .map((approval: typeof approvals[number]) => {
          const billId = parseInternalBigIntId(approval.source_id)
          const bill = billId != null ? billById.get(billId) : undefined
          if (!bill) return null
          const approvedAmount = toNumber(approval.approved_amount)
          const approvalInternalId = stringifyBusinessValue(approval.id)
          const paidAgainstApproval = paymentTotalsByApprovalId.get(approvalInternalId) ?? 0
          const payableBalance = Math.max(0, approvedAmount - paidAgainstApproval)
          if (payableBalance <= 0.01) return null
          const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
          return {
            approvalAccountNo: approval.destination_account_no_snapshot ?? '',
            approvalBankName: approval.destination_bank_name_snapshot ?? '',
            approvalId: approvalDocNo,
            approvalPaymentMethod: approval.destination_payment_method_snapshot ?? '',
            approvedAmount,
            date: toDateOnly(bill.date),
            docNo: approvalDocNo,
            id: bill.doc_no,
            paidAmount: paidAgainstApproval,
            payableBalance,
            status: approval.status ?? '',
            sourceDocNo: approval.source_doc_no_snapshot ?? bill.doc_no,
            supplierId: approval.party_id != null
              ? (parseInternalBigIntId(approval.party_id) != null ? (supplierCodeById.get(parseInternalBigIntId(approval.party_id) as bigint) ?? '') : '')
              : bill.supplier_id != null
                ? (supplierCodeById.get(bill.supplier_id) ?? '')
                : '',
            totalAmount: approvedAmount,
          }
        })
        .filter((bill): bill is NonNullable<typeof bill> => Boolean(bill)),
      rows: payments.map((payment) => ({
        accountId: payment.accounts?.code ?? '',
        accountName: payment.accounts?.name ?? '-',
        approvalId: payment.payment_approval_id ? (approvalDocNoByInternalId.get(stringifyBusinessValue(payment.payment_approval_id)) ?? '') : '',
        amount: toNumber(payment.amount),
        billId: '',
        date: toDateOnly(payment.date),
        docNo: payment.doc_no,
        fee: toNumber(payment.fee ?? payment.bank_fee),
        id: payment.doc_no,
        method: payment.method ?? '',
        netAmount: toNumber(payment.net_amount),
        notes: payment.notes ?? '',
        partyName: payment.suppliers?.name ?? '-',
        supplierId: payment.supplier_id ? (supplierCodeById.get(payment.supplier_id) ?? '') : '',
        supplierName: payment.suppliers?.name ?? '-',
        voucherId: payment.voucher_id ?? payment.doc_no,
        status: payment.status ?? 'active',
        withholdingTax: toNumber(payment.withholding_tax),
      })),
      paymentMethods,
      settings: { whtRatePercent },
      suppliers: suppliers.map((supplier: typeof suppliers[number]) => ({
        active: supplier.active,
        bankAccount: supplier.supplier_bank_accounts.find((account) => account.is_primary)?.account_no
          ?? supplier.supplier_bank_accounts[0]?.account_no
          ?? null,
        bankAccounts: (supplier.supplier_bank_accounts ?? []).map((account) => ({
          accountNo: account.account_no,
          active: account.active,
          bankName: account.bank_names?.name ?? null,
          paymentMethod: account.payment_method,
        })),
        code: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        id: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        name: supplier.name,
      })),
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
    const supplierReference = values.supplierId ? await findActiveSupplierReferenceByCodeOrId(values.supplierId) : null
    if (values.supplierId && !supplierReference) {
      throw new Error('ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน')
    }
    const voucherId = values.id ?? `PMT-${randomUUID()}`
    const actor = currentActor(context)
    const paymentDate = normalizeDate(values.date)
    const whtRatePercent = await activeWhtRatePercent(paymentDate)
    const paymentLines = (values.lines?.length ? values.lines : [{
      approvalId: null,
      amount: values.amount,
      billId: values.billId,
      discount: values.discount,
      fee: values.fee,
      id: null,
      supplierId: supplierReference?.id ?? null,
      withholdingTax: values.withholdingTax,
    }]).filter((line) => line.billId && toNumber(line.amount) > 0)
    if (paymentLines.length === 0) throw new Error('เพิ่มรายการจ่ายอย่างน้อย 1 รายการ')
    const duplicateBillIds = paymentLines
      .map((line) => line.billId)
      .filter((billId, index, billIds) => billIds.indexOf(billId) !== index)
    if (duplicateBillIds.length > 0) throw new Error('รายการจ่ายต้องไม่เลือกบิลซ้ำใน Payment Voucher เดียวกัน')
    const paymentLineTotals = paymentLines.map((line) => ({
      ...line,
      amount: toNumber(line.amount),
      discount: toNumber(line.discount),
      fee: toNumber(line.fee),
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
    const splitAccountCodes = [...new Set(paymentSplits.map((split) => split.accountId).filter(Boolean))]
    const splitAccountReferences = await Promise.all(splitAccountCodes.map(async (code) => [code, await findActiveAccountReferenceByCode(code)] as const))
    const splitAccountByCode = new Map(splitAccountReferences)
    if (splitAccountReferences.some(([, account]) => !account)) throw new Error('บัญชีจ่ายบางรายการไม่ถูกต้องหรือไม่ active')
    const primaryAccount = paymentSplits[0]?.accountId ? splitAccountByCode.get(paymentSplits[0].accountId) ?? null : null
    if (!primaryAccount) throw new Error('เลือกบัญชีจ่าย')

    const result = await prisma.$transaction(async (tx) => {
      const txExt = tx as typeof tx & {
        payment_approvals: {
          findMany: (args: unknown) => Promise<Array<{
            approved_amount: DecimalLike
            id: bigint
            source_doc_no_snapshot: string | null
            source_id: string
          }>>
          update: (args: unknown) => Promise<unknown>
        }
      }
      const lineBillDocNos = [...new Set(paymentLineTotals.map((line) => requireDocumentNo(line.billId, 'บิลซื้อ')))]
      const lineApprovalDocNos = [...new Set(paymentLineTotals.map((line) => line.approvalId).filter(Boolean) as string[])]
      const [lineBills, account] = await Promise.all([
        tx.purchase_bills.findMany({
          select: { branch_id: true, doc_no: true, id: true, status: true, supplier_id: true },
          where: { doc_no: { in: lineBillDocNos } },
        }),
        tx.accounts.findUnique({
          select: { branch_id: true },
          where: { id: primaryAccount.id },
        }),
      ])
      const approvals = lineApprovalDocNos.length > 0
        ? await txExt.payment_approvals.findMany({
          where: {
            doc_no: { in: lineApprovalDocNos },
            source_type: 'purchase_bill',
            status: 'approved',
          },
        })
        : []
      const billByDocNo = new Map(lineBills.map((bill: typeof lineBills[number]) => [bill.doc_no, bill]))
      const approvalByDocNo = new Map(approvals.map((approval: typeof approvals[number]) => [requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`), approval]))
      if (billByDocNo.size !== lineBillDocNos.length) throw new Error('ไม่พบบิลซื้อที่ต้องการตัดชำระ')
      if (approvalByDocNo.size !== lineApprovalDocNos.length) throw new Error('รายการอนุมัติโอนเงินบางรายการไม่ถูกต้องหรือถูกใช้งานแล้ว')
      const firstBill = billByDocNo.get(requireDocumentNo(paymentLineTotals[0].billId, 'บิลซื้อ')) ?? null
      const firstSupplierId = firstBill?.supplier_id ?? paymentLineTotals[0].supplierId
      if (paymentLineTotals.some((line) => {
        const lineBill = billByDocNo.get(requireDocumentNo(line.billId, 'บิลซื้อ'))
        const lineSupplierId = lineBill?.supplier_id ?? line.supplierId
        return lineSupplierId !== firstSupplierId
      })) {
        throw new Error('Payment Voucher เดียวกันต้องเป็นบิลของ Supplier เดียวกัน')
      }
      if (paymentLineTotals.some((line) => !line.approvalId)) {
        throw new Error('ต้องเลือกจากรายการที่อนุมัติโอนเงินแล้วเท่านั้น')
      }
      const lineApprovalInternalIds = approvals.map((approval) => approval.id)
      const existingApprovalPayments = lineApprovalInternalIds.length > 0
        ? await (tx as any).payments.findMany({
          select: { amount: true, discount: true, id: true, payment_approval_id: true, status: true, withholding_tax: true },
          where: {
            payment_approval_id: { in: lineApprovalInternalIds },
            NOT: { status: 'cancelled' },
          },
        })
        : []
      const settledByApprovalId = new Map<string, number>()
      for (const payment of existingApprovalPayments) {
        const approvalId = payment.payment_approval_id ? stringifyBusinessValue(payment.payment_approval_id) : ''
        if (!approvalId) continue
        const settled = toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
        settledByApprovalId.set(approvalId, (settledByApprovalId.get(approvalId) ?? 0) + settled)
      }
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

      const existingPayments = await tx.payments.findMany({
        select: { bill_id: true },
        where: { voucher_id: voucherId },
      })
      await tx.payments.deleteMany({ where: { voucher_id: voucherId } })
      const payments = []
      for (const line of paymentLineTotals) {
        const lineBillDocNo = requireDocumentNo(line.billId, 'บิลซื้อ')
        const lineBill = billByDocNo.get(lineBillDocNo)
        if (!lineBill) throw new Error('บิลซื้อไม่ถูกต้อง')
        const approval = line.approvalId ? approvalByDocNo.get(line.approvalId) : null
        if (!approval) throw new Error('ไม่พบรายการอนุมัติโอนเงินของบิลนี้')
        if (approval.source_doc_no_snapshot !== lineBill.doc_no && approval.source_id !== lineBill.id.toString()) {
          throw new Error('รายการจ่ายไม่ตรงกับบิลที่อนุมัติไว้')
        }
        const approvalInternalId = stringifyBusinessValue(approval.id)
        const approvalRemaining = Math.max(0, toNumber(approval.approved_amount) - (settledByApprovalId.get(approvalInternalId) ?? 0))
        const lineSettlementAmount = line.amount + line.withholdingTax + line.discount
        if (lineSettlementAmount - approvalRemaining > 0.01) {
          throw new Error(`ยอดจ่ายของ ${approval.source_doc_no_snapshot ?? ''} เกินยอดที่อนุมัติไว้`)
        }
        const payment = await (tx as any).payments.create({
          data: {
            account_id: primaryAccount.id,
            amount: line.amount,
            bank_fee: line.fee,
            bill_id: lineBill.id,
            branch_id: branchId,
            created_by: actor,
            date: paymentDate,
            discount: line.discount,
            doc_no: docNo,
            fee: line.fee,
            method: values.method,
            net_amount: line.amount + line.fee,
            notes: values.notes,
            payment_approval_id: approval.id,
            status: 'active',
            supplier_id: lineBill.supplier_id ?? line.supplierId,
            updated_at: new Date(),
            updated_by: actor,
            voucher_id: voucherId,
            withholding_tax: line.withholdingTax,
          },
        })
        const nextSettled = (settledByApprovalId.get(approvalInternalId) ?? 0) + lineSettlementAmount
        settledByApprovalId.set(approvalInternalId, nextSettled)
        await txExt.payment_approvals.update({
          data: {
            paid_at: Math.max(0, toNumber(approval.approved_amount) - nextSettled) <= 0.01 ? new Date() : null,
            payment_id: Math.max(0, toNumber(approval.approved_amount) - nextSettled) <= 0.01 ? payment.id : null,
            status: Math.max(0, toNumber(approval.approved_amount) - nextSettled) <= 0.01 ? 'paid' : 'approved',
            updated_at: new Date(),
          },
          where: { id: approval.id },
        })
        payments.push(payment)
      }

      await tx.bank_statement.deleteMany({ where: { ref_id: voucherId, ref_type: 'PMT' } })
      const statementDocNos = await nextDailyDocNos('bank_statement', 'BST', values.date, paymentSplits.length)
      await tx.bank_statement.createMany({
        data: paymentSplits.map((split, index) => ({
          account_id: (splitAccountByCode.get(split.accountId)?.id as bigint),
          amount_in: 0,
          amount_out: split.amount,
          created_by: actor,
          date: paymentDate,
          description: `${docNo} - จ่าย Supplier${paymentSplits.length > 1 ? ` (split ${index + 1}/${paymentSplits.length})` : ''}`,
          doc_no: statementDocNos[index]!,
          ref_id: voucherId,
          ref_no: docNo,
          ref_type: 'PMT',
          type: 'จ่ายเงิน Supplier',
        })),
      })

      const billIdsToRefresh = [...new Set([
        ...existingPayments.map((payment) => payment.bill_id).filter((value): value is bigint => value != null),
        ...paymentLineTotals
          .map((line) => billByDocNo.get(requireDocumentNo(line.billId, 'บิลซื้อ'))?.id ?? null)
          .filter((value): value is bigint => value != null),
      ])]
      for (const billId of billIdsToRefresh) {
        await refreshPurchaseBillPaymentStatus(tx, billId, actor)
      }

      for (const line of paymentLineTotals) {
        const lineBill = billByDocNo.get(requireDocumentNo(line.billId, 'บิลซื้อ'))
        if (!lineBill) continue
        const approval = line.approvalId ? approvalByDocNo.get(line.approvalId) : null
        const primaryAccountForLog = splitAccountByCode.get(paymentSplits[0]?.accountId ?? '') ?? null
        const refreshedBill = await tx.purchase_bills.findUnique({
          select: { status: true },
          where: { id: lineBill.id },
        })
        await appendPurchaseBillStatusLog(tx, {
          action: PURCHASE_BILL_STATUS_ACTION.PAYMENT_RECORDED,
          actor,
          fromStatus: lineBill.status,
          meta: {
            accountCode: primaryAccountForLog?.code ?? null,
            accountName: primaryAccountForLog?.name ?? null,
            amount: line.amount,
            discount: line.discount,
            fee: line.fee,
            method: values.method,
            paymentDocNo: docNo,
            voucherId,
            withholdingTax: line.withholdingTax,
          },
          note: values.notes ?? null,
          purchaseBillDocNo: lineBill.doc_no,
          purchaseBillId: lineBill.id,
          toStatus: refreshedBill?.status ?? lineBill.status ?? 'unpaid',
        })
      }

      return payments[0]
    })

    return NextResponse.json({ id: voucherId, paymentId: stringifyBusinessValue(result.id) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกจ่ายเงิน Supplier ไม่ได้', 400)
  }
}
