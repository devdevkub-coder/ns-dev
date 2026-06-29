import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode, requireDocumentNo, stringifyBusinessValue } from '@/lib/business-code'
import { supplierPaymentFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { refreshAdvancePaymentWorkflowStatus } from '@/lib/server/advance-payments'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, nextBankStatementDocNos, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { refreshExpensePaymentStatus } from '@/lib/server/expense-payment-status'
import { getActivePaymentMethods } from '@/lib/server/payment-methods'
import {
  appendPaymentApprovalStatusLog,
  appendPaymentStatusLog,
  createPaymentAccountSplitFacts,
  createPaymentAllocationFacts,
  PAYMENT_APPROVAL_STATUS_ACTION,
  PAYMENT_STATUS_ACTION,
} from '@/lib/server/payment-history'
import { appendPurchaseBillStatusLog, PURCHASE_BILL_STATUS_ACTION } from '@/lib/server/purchase-bill-history'
import { prisma } from '@/lib/server/prisma'
import { refreshPurchaseBillSettlement } from '@/lib/server/purchase-bill-settlement'
import { activeWhtRatePercent } from '@/lib/server/tax-settings'

export const runtime = 'nodejs'

type DecimalLike = number | { toNumber: () => number } | null | undefined
type PayableSourceType = 'advance_payment' | 'expense' | 'petty_advance_return' | 'purchase_bill'

const PAYABLE_SOURCE_TYPES: PayableSourceType[] = ['purchase_bill', 'advance_payment', 'expense', 'petty_advance_return']

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function branchPaymentCode(branchCode: string | null | undefined) {
  const digits = String(branchCode ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(2, '0').slice(-2) : null
}

function expensePartyCode(payee: string | null | undefined, fallbackDocNo: string | null | undefined) {
  const normalized = String(payee ?? fallbackDocNo ?? '').trim()
  return normalized ? `EXP:${normalized}` : ''
}

function pettyReturnPartyCode(payee: string | null | undefined, fallbackDocNo: string | null | undefined) {
  const normalized = String(payee ?? fallbackDocNo ?? '').trim()
  return normalized ? `PETTY:${normalized}` : ''
}

function normalizedPaymentMethod(value: string | null | undefined) {
  return String(value ?? '').trim()
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

async function refreshAdvancePaymentPaymentStatus(tx: Prisma.TransactionClient, advanceId: bigint, actor: string) {
  await refreshAdvancePaymentWorkflowStatus(tx, advanceId, actor, {
    meta: { reason: 'payment_status_refresh' },
  })
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
          source_type: string
          status: string | null
        }>>
      }
    }
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const allowedBranchCodes = getBranchCodeIntersection(context)
    let allowedBranchIds: bigint[] | undefined = undefined
    if (allowedBranchCodes) {
      const matchingBranches = await prisma.branches.findMany({
        where: { code: { in: allowedBranchCodes } },
        select: { id: true }
      })
      allowedBranchIds = matchingBranches.map((b) => b.id)
    }

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
          source_type: true,
          status: true,
        },
        take: 5000,
        where: { source_type: { in: PAYABLE_SOURCE_TYPES }, status: 'approved' },
      }),
      prisma.payments.findMany({
        where: {
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        },
        include: {
          accounts: true,
          payment_approvals: true,
          suppliers: true,
          payment_account_splits: {
            include: { accounts: true },
          },
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
      getActivePaymentMethods(),
      activeWhtRatePercent(new Date()),
    ])
    const supplierCodeById = new Map(suppliers.map((supplier) => [supplier.id, requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)]))
    const supplierCodeSet = new Set(suppliers.map((supplier) => requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)))
    const resolveSupplierCode = (partyId: string | null, sourceSupplierId: bigint | null | undefined) => {
      if (partyId) {
        const internalId = parseInternalBigIntId(partyId)
        if (internalId != null) return supplierCodeById.get(internalId) ?? ''
        return supplierCodeSet.has(partyId) ? partyId : ''
      }
      return sourceSupplierId != null ? (supplierCodeById.get(sourceSupplierId) ?? '') : ''
    }

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
      .filter((approval) => approval.source_type === 'purchase_bill')
      .map((approval) => parseInternalBigIntId(approval.source_id))
      .filter((value): value is bigint => value != null))]
    const advanceIds = [...new Set(approvals
      .filter((approval) => approval.source_type === 'advance_payment')
      .map((approval) => parseInternalBigIntId(approval.source_id))
      .filter((value): value is bigint => value != null))]
    const expenseIds = [...new Set(approvals
      .filter((approval) => approval.source_type === 'expense')
      .map((approval) => parseInternalBigIntId(approval.source_id))
      .filter((value): value is bigint => value != null))]
    const pettyReturnIds = [...new Set(approvals
      .filter((approval) => approval.source_type === 'petty_advance_return')
      .map((approval) => parseInternalBigIntId(approval.source_id))
      .filter((value): value is bigint => value != null))]
    const [purchaseBills, advancePayments, expenses, pettyReturns] = await Promise.all([
      prisma.purchase_bills.findMany({
        orderBy: [{ date: 'desc' }],
        select: { date: true, doc_no: true, id: true, paid_amount: true, payable_balance: true, status: true, supplier_id: true, total_amount: true },
        where: {
          id: { in: purchaseBillIds },
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        },
      }),
      prisma.supplier_advance_payments.findMany({
        orderBy: [{ advance_date: 'desc' }],
        select: { advance_date: true, amount: true, doc_no: true, id: true, supplier_id: true, status: true },
        where: {
          id: { in: advanceIds },
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        },
      }),
      prisma.expenses.findMany({
        orderBy: [{ date: 'desc' }],
        select: { date: true, doc_no: true, id: true, net_amount: true, amount: true, vat: true, wht: true, payee: true, payee_account_no: true, payee_bank: true, status: true },
        where: {
          id: { in: expenseIds },
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        },
      }),
      prisma.petty_advance_returns.findMany({
        orderBy: [{ date: 'desc' }],
        select: {
          amount: true,
          date: true,
          doc_no: true,
          id: true,
          status: true,
          petty_advances: {
            select: {
              doc_no: true,
              recipient_name: true,
            },
          },
        },
        where: { id: { in: pettyReturnIds } },
      }),
    ])
    const billById = new Map(purchaseBills.map((bill: typeof purchaseBills[number]) => [bill.id, bill]))
    const advanceById = new Map(advancePayments.map((advance: typeof advancePayments[number]) => [advance.id, advance]))
    const expenseById = new Map(expenses.map((expense: typeof expenses[number]) => [expense.id, expense]))
    const pettyReturnById = new Map(pettyReturns.map((entry: typeof pettyReturns[number]) => [entry.id, entry]))
    const expensePartiesById = new Map<string, {
      active: boolean
      bankAccount: string | null
      bankAccounts: Array<{ accountNo: string | null; active: boolean; bankName: string | null; paymentMethod: null }>
      code: string
      id: string
      name: string
    }>()
    for (const expense of expenses) {
      const partyCode = expensePartyCode(expense.payee, expense.doc_no)
      if (!partyCode || expensePartiesById.has(partyCode)) continue
      expensePartiesById.set(partyCode, {
        active: true,
        bankAccount: expense.payee_account_no,
        bankAccounts: [{
          accountNo: expense.payee_account_no,
          active: true,
          bankName: expense.payee_bank,
          paymentMethod: null,
        }].filter((account) => Boolean(account.accountNo || account.bankName)),
        code: partyCode,
        id: partyCode,
        name: expense.payee || expense.doc_no,
      })
    }
    const expenseParties = Array.from(expensePartiesById.values())
    const pettyReturnPartiesById = new Map<string, {
      active: boolean
      bankAccount: null
      bankAccounts: Array<{ accountNo: string | null; active: boolean; bankName: string | null; paymentMethod: null }>
      code: string
      id: string
      name: string
    }>()
    for (const entry of pettyReturns) {
      const partyCode = pettyReturnPartyCode(entry.petty_advances.recipient_name, entry.petty_advances.doc_no)
      if (!partyCode || pettyReturnPartiesById.has(partyCode)) continue
      pettyReturnPartiesById.set(partyCode, {
        active: true,
        bankAccount: null,
        bankAccounts: [],
        code: partyCode,
        id: partyCode,
        name: entry.petty_advances.recipient_name || entry.petty_advances.doc_no,
      })
    }
    const pettyReturnParties = Array.from(pettyReturnPartiesById.values())

    return NextResponse.json({
      accounts,
      bills: approvals
        .map((approval: typeof approvals[number]) => {
          const approvedAmount = toNumber(approval.approved_amount)
          const approvalInternalId = stringifyBusinessValue(approval.id)
          const paidAgainstApproval = paymentTotalsByApprovalId.get(approvalInternalId) ?? 0
          const payableBalance = Math.max(0, approvedAmount - paidAgainstApproval)
          if (payableBalance <= 0.01) return null
          const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
          if (approval.source_type === 'purchase_bill') {
            const billId = parseInternalBigIntId(approval.source_id)
            const bill = billId != null ? billById.get(billId) : undefined
            if (!bill) return null
            const sourceDocNo = requireDocumentNo(approval.source_doc_no_snapshot, `เอกสารอ้างอิงของ ${approvalDocNo}`)
            return {
              approvalAccountNo: approval.destination_account_no_snapshot ?? '',
              approvalBankName: approval.destination_bank_name_snapshot ?? '',
              approvalId: approvalDocNo,
              approvalPaymentMethod: approval.destination_payment_method_snapshot ?? '',
              approvedAmount,
              date: toDateOnly(bill.date),
              docNo: approvalDocNo,
              id: approvalDocNo,
              paidAmount: paidAgainstApproval,
              payableBalance,
              status: approval.status ?? '',
              sourceDocNo,
              sourceType: 'purchase_bill',
              supplierId: resolveSupplierCode(approval.party_id, bill.supplier_id),
              totalAmount: approvedAmount,
            }
          }
          if (approval.source_type === 'expense') {
            const expenseId = parseInternalBigIntId(approval.source_id)
            const expense = expenseId != null ? expenseById.get(expenseId) : undefined
            if (!expense) return null
            const sourceDocNo = requireDocumentNo(approval.source_doc_no_snapshot, `เอกสารอ้างอิงของ ${approvalDocNo}`)
            const totalAmount = toNumber(expense.net_amount) || toNumber(expense.amount) + toNumber(expense.vat) - toNumber(expense.wht)
            return {
              approvalAccountNo: approval.destination_account_no_snapshot ?? '',
              approvalBankName: approval.destination_bank_name_snapshot ?? '',
              approvalId: approvalDocNo,
              approvalPaymentMethod: approval.destination_payment_method_snapshot ?? '',
              approvedAmount,
              date: toDateOnly(expense.date),
              docNo: approvalDocNo,
              id: approvalDocNo,
              paidAmount: paidAgainstApproval,
              payableBalance,
              sourceDocNo,
              sourceType: 'expense',
              status: approval.status ?? '',
              supplierId: expensePartyCode(expense.payee, expense.doc_no),
              totalAmount: approvedAmount || totalAmount,
            }
          }
          if (approval.source_type === 'petty_advance_return') {
            const pettyReturnId = parseInternalBigIntId(approval.source_id)
            const entry = pettyReturnId != null ? pettyReturnById.get(pettyReturnId) : undefined
            if (!entry) return null
            const sourceDocNo = requireDocumentNo(approval.source_doc_no_snapshot, `เอกสารอ้างอิงของ ${approvalDocNo}`)
            return {
              approvalAccountNo: approval.destination_account_no_snapshot ?? '',
              approvalBankName: approval.destination_bank_name_snapshot ?? '',
              approvalId: approvalDocNo,
              approvalPaymentMethod: approval.destination_payment_method_snapshot ?? '',
              approvedAmount,
              date: toDateOnly(entry.date),
              docNo: approvalDocNo,
              id: approvalDocNo,
              paidAmount: paidAgainstApproval,
              payableBalance,
              sourceDocNo,
              sourceType: 'petty_advance_return',
              status: approval.status ?? '',
              supplierId: pettyReturnPartyCode(approval.party_name_snapshot ?? entry.petty_advances.recipient_name, sourceDocNo),
              totalAmount: approvedAmount || toNumber(entry.amount),
            }
          }
          const advanceId = parseInternalBigIntId(approval.source_id)
          const advance = advanceId != null ? advanceById.get(advanceId) : undefined
          if (!advance) return null
          const sourceDocNo = requireDocumentNo(approval.source_doc_no_snapshot, `เอกสารอ้างอิงของ ${approvalDocNo}`)
          return {
            approvalAccountNo: approval.destination_account_no_snapshot ?? '',
            approvalBankName: approval.destination_bank_name_snapshot ?? '',
            approvalId: approvalDocNo,
            approvalPaymentMethod: approval.destination_payment_method_snapshot ?? '',
            approvedAmount,
            date: toDateOnly(advance.advance_date),
            docNo: approvalDocNo,
            id: approvalDocNo,
            paidAmount: paidAgainstApproval,
            payableBalance,
            sourceType: 'advance_payment',
            status: approval.status ?? '',
            sourceDocNo,
            supplierId: resolveSupplierCode(approval.party_id, advance.supplier_id),
            totalAmount: approvedAmount,
          }
        })
        .filter((bill): bill is NonNullable<typeof bill> => Boolean(bill)),
      rows: payments.map((payment) => {
        const splits = payment.payment_account_splits ?? []
        const accountSummaries = splits.length > 0
          ? splits.map((split) => `${split.accounts?.name ?? '-'} - ${toNumber(split.amount).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`)
          : [`${payment.accounts?.name ?? '-'} - ${toNumber(payment.amount).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`]
        const accountSplits = splits.length > 0
          ? splits.map((split) => ({
              accountId: split.accounts?.code ? requireBusinessCode(split.accounts.code, `บัญชีเงิน ${split.accounts.id}`) : '',
              amount: toNumber(split.amount),
              id: split.id.toString(),
            }))
          : [{
              accountId: payment.accounts?.code ? requireBusinessCode(payment.accounts.code, `บัญชีเงิน ${payment.accounts.id}`) : '',
              amount: toNumber(payment.amount),
              id: `${payment.doc_no}-split-1`,
            }]
        return {
          accountId: payment.accounts?.code ?? '',
          accountName: payment.accounts?.name ?? '-',
          accountSummaries,
          accountSplits,
          approvalId: payment.payment_approval_id ? (approvalDocNoByInternalId.get(stringifyBusinessValue(payment.payment_approval_id)) ?? '') : '',
          amount: toNumber(payment.amount),
          billId: payment.payment_approvals?.source_doc_no_snapshot ?? '',
          billDocNo: payment.payment_approvals?.source_doc_no_snapshot ?? '',
          billDocNos: payment.payment_approvals?.source_doc_no_snapshot ? [payment.payment_approvals.source_doc_no_snapshot] : [],
          date: toDateOnly(payment.date),
          docNo: payment.doc_no,
          fee: toNumber(payment.fee ?? payment.bank_fee),
          id: payment.doc_no,
          method: payment.method ?? '',
          netAmount: toNumber(payment.net_amount),
          notes: payment.notes ?? '',
          partyName: payment.suppliers?.name ?? payment.payment_approvals?.party_name_snapshot ?? '-',
          supplierId: payment.supplier_id ? (supplierCodeById.get(payment.supplier_id) ?? '') : '',
          supplierName: payment.suppliers?.name ?? payment.payment_approvals?.party_name_snapshot ?? '-',
          voucherId: payment.voucher_id ?? payment.doc_no,
          status: payment.status ?? 'active',
          withholdingTax: toNumber(payment.withholding_tax),
          sourceType: payment.payment_approvals?.source_type ?? '',
        }
      }),
      paymentMethods,
      settings: { whtRatePercent },
      suppliers: [...suppliers.map((supplier: typeof suppliers[number]) => ({
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
      })), ...expenseParties, ...pettyReturnParties],
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการจ่ายเงินผู้รับเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = supplierPaymentFormSchema.parse(await request.json())
    const actor = currentActor(context)

    const voucherId = values.id ?? `PMT-${randomUUID()}`
    const paymentDate = normalizeDate(values.date)
    const paymentLines = (values.lines?.length ? values.lines : [{
      approvalId: null,
      amount: values.amount,
      billId: values.billId,
      discount: values.discount,
      fee: values.fee,
      id: null,
      supplierId: values.supplierId,
      withholdingTax: 0,
    }]).filter((line) => line.billId && toNumber(line.amount) > 0)
    if (paymentLines.length === 0) throw new Error('เพิ่มรายการจ่ายอย่างน้อย 1 รายการ')
      const duplicateApprovalIds = paymentLines
        .map((line) => line.approvalId)
        .filter((approvalId, index, approvalIds) => approvalId != null && approvalIds.indexOf(approvalId) !== index)
      if (duplicateApprovalIds.length > 0) throw new Error('รายการจ่ายต้องไม่เลือก PMA ซ้ำใน Payment Voucher เดียวกัน')
    const paymentLineTotals = paymentLines.map((line) => ({
      ...line,
      amount: toNumber(line.amount),
      discount: toNumber(line.discount),
      fee: toNumber(line.fee),
      withholdingTax: 0,
    }))
    const totalAmount = roundMoney(paymentLineTotals.reduce((sum, line) => sum + line.amount, 0))
    const totalFee = roundMoney(paymentLineTotals.reduce((sum, line) => sum + line.fee, 0))
    const netAmount = totalAmount + totalFee
    const paymentSplits = values.splits
    const splitTotal = roundMoney(paymentSplits.reduce((sum, split) => sum + toNumber(split.amount), 0))
    if (Math.abs(splitTotal - netAmount) > 0.01) {
      throw new Error('รวมยอดแยกบัญชีต้องเท่ากับยอดสุทธิที่ต้องจ่าย')
    }
    const allAccounts = await listDailyAccounts()
    for (const split of paymentSplits) {
      const account = allAccounts.find((a) => a.id === split.accountId)
      if (account) {
        const splitAmount = toNumber(split.amount)
        const available = (account.balance ?? 0) + (account.subtype === 'current' ? (account.odLimit ?? 0) : 0)
        if (splitAmount > available + 0.01) {
          throw new Error('ยอดจ่ายเกินยอดเงินคงเหลือและวงเงิน OD ที่ใช้ได้ กรุณาลดจำนวนหรือเพิ่มบัญชีจ่าย')
        }
      }
    }
    const splitAccountCodes = [...new Set(paymentSplits.map((split) => split.accountId).filter(Boolean))]
    const splitAccountReferences = await Promise.all(splitAccountCodes.map(async (code) => [code, await findActiveAccountReferenceByCode(code)] as const))
    const splitAccountByCode = new Map(splitAccountReferences)
    if (splitAccountReferences.some(([, account]) => !account)) throw new Error('บัญชีจ่ายบางรายการไม่ถูกต้องหรือไม่ active')
    const primaryAccount = paymentSplits[0]?.accountId ? splitAccountByCode.get(paymentSplits[0].accountId) ?? null : null
    if (!primaryAccount) throw new Error('เลือกบัญชีจ่าย')
    const activePaymentMethods = await getActivePaymentMethods()
    const activePaymentMethod = activePaymentMethods.find((method) => normalizedPaymentMethod(method.name) === normalizedPaymentMethod(values.method))
    if (!activePaymentMethod) throw new Error('วิธีจ่ายไม่ถูกต้องหรือไม่ active')

    if (values.id) {
      const existingPayments = await prisma.payments.findMany({
        where: { voucher_id: values.id },
      })
      if (existingPayments.length === 0) throw new Error('ไม่พบข้อมูลการจ่ายเงินที่ต้องการแก้ไข')
      const docNo = existingPayments[0].doc_no
      const paidAt = new Date()

      await prisma.$transaction(async (tx) => {
        await tx.payments.updateMany({
          data: {
            account_id: primaryAccount.id,
            notes: values.notes,
            method: values.method,
            date: normalizeDate(values.date),
            updated_at: new Date(),
            updated_by: actor,
          },
          where: { voucher_id: values.id },
        })

        await tx.payment_account_splits.deleteMany({ where: { payment_voucher_id: values.id } })

        await tx.bank_statement.deleteMany({ where: { ref_id: values.id, ref_type: 'PMT' } })
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`
        const statementDocNos = await nextBankStatementDocNos(values.date, paymentSplits.length, tx)

        await tx.bank_statement.createMany({
          data: paymentSplits.map((split, index) => ({
            account_id: (splitAccountByCode.get(split.accountId)?.id as bigint),
            amount_in: 0,
            amount_out: split.amount,
            created_by: actor,
            date: normalizeDate(values.date),
            description: `${values.id} - จ่ายผู้รับเงิน${paymentSplits.length > 1 ? ` (split ${index + 1}/${paymentSplits.length})` : ''}`,
            doc_no: statementDocNos[index]!,
            ref_id: values.id,
            ref_no: docNo,
            ref_type: 'PMT',
            type: 'จ่ายเงินผู้รับเงิน',
          })),
        })

        const createdStatements = await tx.bank_statement.findMany({
          include: { accounts: true },
          where: { doc_no: { in: statementDocNos } },
        })
        const statementByDocNo = new Map(createdStatements.map((statement) => [statement.doc_no, statement] as const))
        const primaryPayment = existingPayments[0]!

        await createPaymentAccountSplitFacts(tx, paymentSplits.map((split, index) => {
          const accountReference = splitAccountByCode.get(split.accountId)
          if (!accountReference) throw new Error('บัญชีจ่ายบางรายการไม่ถูกต้องหรือไม่ active')
          const statementDocNo = statementDocNos[index]!
          const statement = statementByDocNo.get(statementDocNo)
          return {
            accountCodeSnapshot: accountReference.code,
            accountId: accountReference.id,
            accountNameSnapshot: accountReference.name,
            actor,
            amount: toNumber(split.amount),
            bankStatementDocNo: statementDocNo,
            bankStatementId: statement?.id ?? null,
            createdAt: paidAt,
            paymentDocNo: docNo,
            paymentId: primaryPayment.id,
            paymentVoucherId: values.id,
            splitKey: `PMTSPLIT-${docNo}-${statementDocNo}`,
          }
        }))

        await appendPaymentStatusLog(tx, {
          action: PAYMENT_STATUS_ACTION.POSTED,
          actor,
          amountSnapshot: totalAmount,
          createdAt: paidAt,
          fromStatus: 'active',
          meta: {
            note: 'แก้ไขข้อมูลบัญชี/ยอดจ่ายเงิน',
            voucherId: values.id,
          },
          netAmountSnapshot: netAmount,
          paymentDocNo: docNo,
          paymentId: primaryPayment.id,
          paymentVoucherId: values.id,
          toStatus: 'active',
        })
      })

      return NextResponse.json({ success: true })
    }

    const result = await prisma.$transaction(async (tx) => {
      const txExt = tx as typeof tx & {
        payment_approvals: {
          findMany: (args: unknown) => Promise<Array<{
          approved_amount: DecimalLike
          doc_no: string | null
          id: bigint
          source_doc_no_snapshot: string | null
          source_id: string
          source_type: string
        }>>
        update: (args: unknown) => Promise<unknown>
      }
      }
      const lineApprovalDocNos = [...new Set(paymentLineTotals.map((line) => line.approvalId).filter(Boolean) as string[])]
      const [account] = await Promise.all([
        tx.accounts.findUnique({
          select: { branch_id: true },
          where: { id: primaryAccount.id },
        }),
      ])
      const approvals = lineApprovalDocNos.length > 0
        ? await txExt.payment_approvals.findMany({
          where: {
            doc_no: { in: lineApprovalDocNos },
            source_type: { in: PAYABLE_SOURCE_TYPES },
            status: 'approved',
          },
        })
        : []
      const approvalByDocNo = new Map(approvals.map((approval: typeof approvals[number]) => [requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`), approval]))
      if (approvalByDocNo.size !== lineApprovalDocNos.length) throw new Error('รายการอนุมัติโอนเงินบางรายการไม่ถูกต้องหรือถูกใช้งานแล้ว')
      const approvalPaymentMethods = [...new Set(approvals.map((approval) => normalizedPaymentMethod(approval.destination_payment_method_snapshot)).filter(Boolean))]
      if (approvalPaymentMethods.length !== 1) {
        throw new Error('Payment Voucher เดียวกันต้องเลือก PMA ที่มีช่องทางรับเงินเดียวกัน')
      }
      if (normalizedPaymentMethod(values.method) !== approvalPaymentMethods[0]) {
        throw new Error('วิธีจ่ายของ Payment Voucher ต้องตรงกับช่องทางรับเงินที่อนุมัติไว้')
      }
      const purchaseBillSourceIds = [...new Set(approvals
        .filter((approval) => approval.source_type === 'purchase_bill')
        .map((approval) => parseInternalBigIntId(approval.source_id))
        .filter((value): value is bigint => value != null))]
      const advanceSourceIds = [...new Set(approvals
        .filter((approval) => approval.source_type === 'advance_payment')
        .map((approval) => parseInternalBigIntId(approval.source_id))
        .filter((value): value is bigint => value != null))]
      const expenseSourceIds = [...new Set(approvals
        .filter((approval) => approval.source_type === 'expense')
        .map((approval) => parseInternalBigIntId(approval.source_id))
        .filter((value): value is bigint => value != null))]
      const pettyReturnSourceIds = [...new Set(approvals
        .filter((approval) => approval.source_type === 'petty_advance_return')
        .map((approval) => parseInternalBigIntId(approval.source_id))
        .filter((value): value is bigint => value != null))]
      const [lineBills, lineAdvances, lineExpenses, linePettyReturns] = await Promise.all([
        tx.purchase_bills.findMany({
          select: {
            branch_id: true,
            doc_no: true,
            id: true,
            license_plate: true,
            sales_id: true,
            status: true,
            supplier_id: true,
            suppliers: {
              select: { address: true, name: true, phone: true, tax_id: true },
            },
          },
          where: { id: { in: purchaseBillSourceIds } },
        }),
        tx.supplier_advance_payments.findMany({
          select: {
            branch_id: true,
            doc_no: true,
            id: true,
            status: true,
            supplier_id: true,
            suppliers: {
              select: { address: true, name: true, phone: true, tax_id: true },
            },
          },
          where: { id: { in: advanceSourceIds } },
        }),
        tx.expenses.findMany({
          select: { branch_id: true, doc_no: true, id: true, payee: true, status: true },
          where: { id: { in: expenseSourceIds } },
        }),
        tx.petty_advance_returns.findMany({
          select: {
            accounts: { select: { branch_id: true } },
            doc_no: true,
            id: true,
            petty_advances: { select: { doc_no: true, recipient_name: true } },
            status: true,
          },
          where: { id: { in: pettyReturnSourceIds } },
        }),
      ])
      const billByDocNo = new Map(lineBills.map((bill: typeof lineBills[number]) => [bill.doc_no, bill]))
      const advanceByDocNo = new Map(lineAdvances.map((advance: typeof lineAdvances[number]) => [advance.doc_no, advance]))
      const expenseByDocNo = new Map(lineExpenses.map((expense: typeof lineExpenses[number]) => [expense.doc_no, expense]))
      const pettyReturnById = new Map(linePettyReturns.map((entry: typeof linePettyReturns[number]) => [entry.id.toString(), entry]))
      const pettyReturnByAdvanceDocNo = new Map(linePettyReturns.map((entry: typeof linePettyReturns[number]) => [entry.petty_advances.doc_no, entry]))
      const firstBill = billByDocNo.get(requireDocumentNo(paymentLineTotals[0].billId, 'เอกสารอ้างอิง')) ?? null
      const firstAdvance = advanceByDocNo.get(requireDocumentNo(paymentLineTotals[0].billId, 'เอกสารอ้างอิง')) ?? null
      const firstExpense = expenseByDocNo.get(requireDocumentNo(paymentLineTotals[0].billId, 'เอกสารอ้างอิง')) ?? null
      const firstPettyReturn = pettyReturnByAdvanceDocNo.get(requireDocumentNo(paymentLineTotals[0].billId, 'เอกสารอ้างอิง')) ?? null
      const sourcePartyKey = (line: typeof paymentLineTotals[number]) => {
        const sourceDocNo = requireDocumentNo(line.billId, 'เอกสารอ้างอิง')
        const bill = billByDocNo.get(sourceDocNo)
        if (bill) return bill.supplier_id != null ? `supplier:${bill.supplier_id.toString()}` : ''
        const advance = advanceByDocNo.get(sourceDocNo)
        if (advance) return advance.supplier_id != null ? `supplier:${advance.supplier_id.toString()}` : ''
        const expense = expenseByDocNo.get(sourceDocNo)
        if (expense) return `expense:${String(expense.payee ?? expense.doc_no ?? expense.id.toString()).trim().toLowerCase()}`
        const pettyReturn = pettyReturnByAdvanceDocNo.get(sourceDocNo)
        if (pettyReturn) return `petty:${String(pettyReturn.petty_advances.recipient_name ?? pettyReturn.petty_advances.doc_no).trim().toLowerCase()}`
        return ''
      }
      const firstPartyKey = sourcePartyKey(paymentLineTotals[0])
      if (!firstPartyKey) throw new Error('ไม่พบผู้รับเงินของเอกสารต้นทาง')
      if (paymentLineTotals.some((line) => {
        return sourcePartyKey(line) !== firstPartyKey
      })) {
        throw new Error('Payment Voucher เดียวกันต้องเป็นรายการของผู้รับเงินเดียวกัน')
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
      const branchId = firstBill?.branch_id ?? firstAdvance?.branch_id ?? firstExpense?.branch_id ?? firstPettyReturn?.accounts?.branch_id ?? account?.branch_id ?? null
      if (!branchId) throw new Error('ไม่พบสาขาสำหรับออกเลขเอกสารจ่ายเงินผู้รับเงิน')
      const branch = await tx.branches.findFirst({
        select: { code: true },
        where: { active: true, id: branchId },
      })
      const branchCode = branchPaymentCode(branch?.code)
      if (!branchCode) throw new Error('รหัสสาขาต้องเป็นตัวเลขเพื่อออกเลขเอกสารจ่ายเงินผู้รับเงิน')
      const allowedBranchCodes = getBranchCodeIntersection(context)
      if (allowedBranchCodes && branch && !allowedBranchCodes.includes(branch.code)) {
        throw new Error('ไม่มีสิทธิ์ทำรายการจ่ายเงินในสาขานี้')
      }
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('payments.doc_no'))`
      const docNo = values.docNo ?? await nextSupplierPaymentDocNo(tx, values.date, branchCode)

      const existingPayments = await tx.payments.findMany({
        select: { bill_id: true, payment_approval_id: true },
        where: { voucher_id: voucherId },
      })
      await tx.payment_allocations.deleteMany({ where: { payment_voucher_id: voucherId } })
      await tx.payment_account_splits.deleteMany({ where: { payment_voucher_id: voucherId } })
      await tx.payments.deleteMany({ where: { voucher_id: voucherId } })
      const payments = []
      const paidAt = new Date()
      for (const line of paymentLineTotals) {
        const lineSourceDocNo = requireDocumentNo(line.billId, 'เอกสารอ้างอิง')
        const approval = line.approvalId ? approvalByDocNo.get(line.approvalId) : null
        if (!approval) throw new Error('ไม่พบรายการอนุมัติโอนเงินของบิลนี้')
        const lineBill = approval.source_type === 'purchase_bill' ? billByDocNo.get(lineSourceDocNo) : null
        const lineAdvance = approval.source_type === 'advance_payment' ? advanceByDocNo.get(lineSourceDocNo) : null
        const lineExpense = approval.source_type === 'expense' ? expenseByDocNo.get(lineSourceDocNo) : null
        const linePettyReturn = approval.source_type === 'petty_advance_return' ? pettyReturnById.get(approval.source_id) : null
        if (approval.source_type === 'purchase_bill' && !lineBill) throw new Error('บิลซื้อไม่ถูกต้อง')
        if (approval.source_type === 'advance_payment' && !lineAdvance) throw new Error('ADV อ้างอิงไม่ถูกต้อง')
        if (approval.source_type === 'expense' && !lineExpense) throw new Error('EXP อ้างอิงไม่ถูกต้อง')
        if (approval.source_type === 'petty_advance_return' && !linePettyReturn) throw new Error('รายการคืนเงินสำรองจ่ายไม่ถูกต้อง')
        const approvalSourceDocNo = requireDocumentNo(approval.source_doc_no_snapshot, `เอกสารอ้างอิงของ ${line.approvalId}`)
        const matchesSource = approval.source_type === 'purchase_bill'
          ? approvalSourceDocNo === lineBill?.doc_no && approval.source_id === lineBill?.id.toString()
          : approval.source_type === 'advance_payment'
            ? approvalSourceDocNo === lineAdvance?.doc_no && approval.source_id === lineAdvance?.id.toString()
            : approval.source_type === 'expense'
              ? approvalSourceDocNo === lineExpense?.doc_no && approval.source_id === lineExpense?.id.toString()
              : approvalSourceDocNo === linePettyReturn?.petty_advances.doc_no && approval.source_id === linePettyReturn?.id.toString()
        if (!matchesSource) throw new Error('รายการจ่ายไม่ตรงกับเอกสารที่อนุมัติไว้')
        const approvalInternalId = stringifyBusinessValue(approval.id)
        const approvalRemaining = Math.max(0, toNumber(approval.approved_amount) - (settledByApprovalId.get(approvalInternalId) ?? 0))
        const lineSettlementAmount = line.amount + line.discount
        if (lineSettlementAmount - approvalRemaining > 0.01) {
          throw new Error(`ยอดจ่ายของ ${approvalSourceDocNo} เกินยอดที่อนุมัติไว้`)
        }
        if (Math.abs(lineSettlementAmount - approvalRemaining) > 0.01) {
          throw new Error(`ยอดจ่ายของ ${line.approvalId} ต้องเท่ากับยอด PMA ที่เหลือ`)
        }
        const payment = await (tx as any).payments.create({
          data: {
            account_id: primaryAccount.id,
            amount: line.amount,
            bank_fee: line.fee,
            bill_id: lineBill?.id ?? null,
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
            supplier_id: lineBill?.supplier_id ?? lineAdvance?.supplier_id ?? null,
            updated_at: new Date(),
            updated_by: actor,
            voucher_id: voucherId,
            withholding_tax: 0,
          },
        })
        const nextSettled = (settledByApprovalId.get(approvalInternalId) ?? 0) + lineSettlementAmount
        settledByApprovalId.set(approvalInternalId, nextSettled)
        await txExt.payment_approvals.update({
          data: {
            paid_at: Math.max(0, toNumber(approval.approved_amount) - nextSettled) <= 0.01 ? paidAt : null,
            payment_id: Math.max(0, toNumber(approval.approved_amount) - nextSettled) <= 0.01 ? payment.id : null,
            status: Math.max(0, toNumber(approval.approved_amount) - nextSettled) <= 0.01 ? 'paid' : 'approved',
            updated_at: paidAt,
          },
          where: { id: approval.id },
        })
        await createPaymentAllocationFacts(tx, [{
          actor,
          allocatedAmount: lineSettlementAmount,
          allocationKey: `PMTALLOC-${docNo}-${payment.id}`,
          createdAt: paidAt,
          paymentApprovalDocNo: requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`),
          paymentApprovalId: approval.id,
          paymentDocNo: docNo,
          paymentId: payment.id,
          paymentVoucherId: voucherId,
          sourceDocNoSnapshot: approvalSourceDocNo,
          sourceType: approval.source_type,
        }])
        await appendPaymentApprovalStatusLog(tx, {
          action: PAYMENT_APPROVAL_STATUS_ACTION.PAID,
          actor,
          createdAt: paidAt,
          fromStatus: 'approved',
          meta: {
            allocatedAmount: lineSettlementAmount,
            paymentDocNo: docNo,
            sourceDocNo: approvalSourceDocNo,
            voucherId,
          },
          paymentApprovalId: approval.id,
          paymentDocNo: docNo,
          paymentId: payment.id,
          toStatus: 'paid',
        })
        if (approval.source_type === 'advance_payment' && lineAdvance) {
          await refreshAdvancePaymentPaymentStatus(tx, lineAdvance.id, actor)
        }
        if (approval.source_type === 'expense' && lineExpense) {
          await refreshExpensePaymentStatus(tx, lineExpense.id, actor)
        }
        payments.push(payment)
      }

      await tx.bank_statement.deleteMany({ where: { ref_id: voucherId, ref_type: 'PMT' } })
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('bank_statement.doc_no'))`
      const statementDocNos = await nextBankStatementDocNos(values.date, paymentSplits.length, tx)
      await tx.bank_statement.createMany({
        data: paymentSplits.map((split, index) => ({
          account_id: (splitAccountByCode.get(split.accountId)?.id as bigint),
          amount_in: 0,
          amount_out: split.amount,
          created_by: actor,
          date: paymentDate,
          description: `${docNo} - จ่ายผู้รับเงิน${paymentSplits.length > 1 ? ` (split ${index + 1}/${paymentSplits.length})` : ''}`,
          doc_no: statementDocNos[index]!,
          ref_id: voucherId,
          ref_no: docNo,
          ref_type: 'PMT',
          type: 'จ่ายเงินผู้รับเงิน',
        })),
      })
      const createdStatements = await tx.bank_statement.findMany({
        include: { accounts: true },
        where: { doc_no: { in: statementDocNos } },
      })
      const statementByDocNo = new Map(createdStatements.map((statement) => [statement.doc_no, statement] as const))
      const primaryPayment = payments[0]
      if (!primaryPayment) throw new Error('ไม่พบ PMT ที่ต้องการบันทึก timeline')
      await createPaymentAccountSplitFacts(tx, paymentSplits.map((split, index) => {
        const accountReference = splitAccountByCode.get(split.accountId)
        if (!accountReference) throw new Error('บัญชีจ่ายบางรายการไม่ถูกต้องหรือไม่ active')
        const statementDocNo = statementDocNos[index]!
        const statement = statementByDocNo.get(statementDocNo)
        return {
          accountCodeSnapshot: accountReference.code,
          accountId: accountReference.id,
          accountNameSnapshot: accountReference.name,
          actor,
          amount: toNumber(split.amount),
          bankStatementDocNo: statementDocNo,
          bankStatementId: statement?.id ?? null,
          createdAt: paidAt,
          paymentDocNo: docNo,
          paymentId: primaryPayment.id,
          paymentVoucherId: voucherId,
          splitKey: `PMTSPLIT-${docNo}-${statementDocNo}`,
        }
      }))
      await appendPaymentStatusLog(tx, {
        action: PAYMENT_STATUS_ACTION.POSTED,
        actor,
        amountSnapshot: totalAmount,
        createdAt: paidAt,
        fromStatus: null,
        meta: {
          approvalDocNos: lineApprovalDocNos,
          lineCount: paymentLineTotals.length,
          voucherId,
        },
        netAmountSnapshot: netAmount,
        paymentDocNo: docNo,
        paymentId: primaryPayment.id,
        paymentVoucherId: voucherId,
        toStatus: 'active',
      })
      await appendPaymentStatusLog(tx, {
        action: PAYMENT_STATUS_ACTION.BANK_POSTED,
        actor,
        amountSnapshot: totalAmount,
        createdAt: paidAt,
        fromStatus: null,
        meta: {
          bankStatementDocNos: statementDocNos,
          splitCount: paymentSplits.length,
          voucherId,
        },
        netAmountSnapshot: netAmount,
        paymentDocNo: docNo,
        paymentId: primaryPayment.id,
        paymentVoucherId: voucherId,
        toStatus: 'active',
      })

      const billIdsToRefresh = [...new Set([
        ...existingPayments.map((payment) => payment.bill_id).filter((value): value is bigint => value != null),
        ...paymentLineTotals
          .map((line) => billByDocNo.get(requireDocumentNo(line.billId, 'เอกสารอ้างอิง'))?.id ?? null)
          .filter((value): value is bigint => value != null),
      ])]
      const advanceIdsToRefresh = [...new Set([
        ...paymentLineTotals
          .map((line) => advanceByDocNo.get(requireDocumentNo(line.billId, 'เอกสารอ้างอิง'))?.id ?? null)
          .filter((value): value is bigint => value != null),
      ])]
      const expenseIdsToRefresh = [...new Set([
        ...paymentLineTotals
          .map((line) => expenseByDocNo.get(requireDocumentNo(line.billId, 'เอกสารอ้างอิง'))?.id ?? null)
          .filter((value): value is bigint => value != null),
      ])]
      for (const billId of billIdsToRefresh) {
        await refreshPurchaseBillPaymentStatus(tx, billId, actor)
      }
      for (const advanceId of advanceIdsToRefresh) {
        await refreshAdvancePaymentPaymentStatus(tx, advanceId, actor)
      }
      for (const expenseId of expenseIdsToRefresh) {
        await refreshExpensePaymentStatus(tx, expenseId, actor)
      }

      for (const line of paymentLineTotals) {
        const lineBill = billByDocNo.get(requireDocumentNo(line.billId, 'เอกสารอ้างอิง'))
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
    return apiErrorResponse(caught, 'บันทึกจ่ายเงินผู้รับเงินไม่ได้', 400)
  }
}
