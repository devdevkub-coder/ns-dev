import { NextResponse } from 'next/server'
import { z } from 'zod'
import { paymentMethodGroupFromValue, resolvePaymentMethodName } from '@/lib/account-payment-method'
import { requireBusinessCode, requireDocumentNo } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { refreshAdvancePaymentWorkflowStatus } from '@/lib/server/advance-payments'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { listDailyAccounts, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { nextPaymentApprovalDocNos } from '@/lib/server/payment-approval-pending'
import { getActivePaymentMethods, type ActivePaymentMethod } from '@/lib/server/payment-methods'
import { appendPaymentApprovalStatusLog, PAYMENT_APPROVAL_STATUS_ACTION } from '@/lib/server/payment-history'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const approvalRequestSchema = z.object({
  approvalId: z.string().trim().min(1, 'ไม่พบรายการอนุมัติที่ต้องการดำเนินการ'),
  sourceType: z.enum(['purchase_bill', 'advance_payment', 'expense', 'petty_advance_return']),
  splits: z.array(z.object({
    approvedAmount: z.coerce.number().finite().gt(0, 'ยอดอนุมัติต้องมากกว่า 0'),
    destinationId: z.string().trim().min(1, 'เลือกช่องทางจ่ายปลายทาง'),
  })).min(1, 'เพิ่มอย่างน้อย 1 รายการอนุมัติ'),
})

type ApprovalDestinationOption = {
  accountNo: string
  bankName: string
  id: string
  isPrimary: boolean
  kind: 'bank' | 'cash'
  label: string
  paymentMethod: string
}

function normalizeSupplierBankAccounts(params: {
  paymentMethods: ActivePaymentMethod[]
  rows:
    | Array<{
        code: string | null
        account_no: string | null
        active: boolean | null
        bank_name_id: bigint | null
        bank_names: { code: string | null; name: string } | null
        id: bigint
        is_primary: boolean | null
        payment_method: string | null
      }>
    | null
    | undefined
}): ApprovalDestinationOption[] {
  return (params.rows ?? [])
    .filter((account) => account.active !== false)
    .map((account) => {
      const paymentMethod = resolvePaymentMethodName(account.payment_method, params.paymentMethods) ?? ''
      const kind: ApprovalDestinationOption['kind'] = paymentMethodGroupFromValue(paymentMethod, params.paymentMethods) === 'cash' ? 'cash' : 'bank'
      return {
        accountNo: account.account_no ?? '',
        bankName: account.bank_names?.name ?? '',
        id: requireBusinessCode(account.code, `บัญชีรับเงินผู้ขาย ${account.id}`),
        isPrimary: account.is_primary ?? false,
        kind,
        label: [paymentMethod, account.bank_names?.name ?? '', account.account_no ?? ''].filter(Boolean).join(' / ') || 'ไม่ระบุ',
        paymentMethod,
      }
    })
    .filter((option) => option.paymentMethod.trim() || option.accountNo.trim())
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [purchaseBills, advancePayments, expenses, approvals, paymentMethods, dailyAccounts] = await Promise.all([
      prisma.purchase_bills.findMany({
        include: {
          suppliers: {
            include: {
              supplier_bank_accounts: {
                include: {
                  bank_names: {
                    select: { code: true, name: true },
                  },
                },
                orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
              },
            },
          },
        },
        orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
        take: 5000,
        where: {
          status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] },
        },
      }),
      prisma.supplier_advance_payments.findMany({
        include: {
          branches: true,
          suppliers: {
            include: {
              supplier_bank_accounts: {
                include: {
                  bank_names: {
                    select: { code: true, name: true },
                  },
                },
                orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
              },
            },
          },
        },
        orderBy: [{ advance_date: 'asc' }, { doc_no: 'asc' }],
        take: 5000,
        where: {
          status: { not: 'cancelled' },
        },
      }),
      prisma.expenses.findMany({
        include: {
          accounts: true,
          suppliers: {
            include: {
              supplier_bank_accounts: {
                include: {
                  bank_names: {
                    select: { code: true, name: true },
                  },
                },
                orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
              },
            },
          },
        },
        orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
        take: 5000,
        where: {
          status: { notIn: ['paid', 'cancelled'] },
        },
      }),
      prisma.payment_approvals.findMany({
        orderBy: [{ approved_at: 'desc' }, { created_at: 'desc' }],
        take: 5000,
        where: {
          OR: [
            { source_type: 'petty_advance_return', status: { in: ['pending', 'approved', 'voided'] } },
            { status: { in: ['approved', 'paid', 'voided'] } },
          ],
        },
      }),
      getActivePaymentMethods(),
      listDailyAccounts(),
    ])

    const approvedByPurchaseBillId = new Map<string, typeof approvals[number][]>()
    const approvedByAdvanceId = new Map<string, typeof approvals[number][]>()
    const approvedByExpenseId = new Map<string, typeof approvals[number][]>()
    const voidedByPurchaseBillId = new Map<string, typeof approvals[number][]>()
    const voidedByAdvanceId = new Map<string, typeof approvals[number][]>()
    const voidedByExpenseId = new Map<string, typeof approvals[number][]>()
    const activeByAdvanceId = new Map<string, typeof approvals[number][]>()
    const activeByExpenseId = new Map<string, typeof approvals[number][]>()
    for (const approval of approvals) {
      if ((approval.status === 'approved' || approval.status === 'paid') && approval.source_type === 'advance_payment') {
        activeByAdvanceId.set(approval.source_id, [...(activeByAdvanceId.get(approval.source_id) ?? []), approval])
      }
      if ((approval.status === 'approved' || approval.status === 'paid') && approval.source_type === 'expense') {
        activeByExpenseId.set(approval.source_id, [...(activeByExpenseId.get(approval.source_id) ?? []), approval])
      }
      if (approval.status === 'voided') {
        const targetMap = approval.source_type === 'purchase_bill'
          ? voidedByPurchaseBillId
          : approval.source_type === 'advance_payment'
            ? voidedByAdvanceId
            : approval.source_type === 'expense'
              ? voidedByExpenseId
              : null
        if (targetMap) targetMap.set(approval.source_id, [...(targetMap.get(approval.source_id) ?? []), approval])
        continue
      }
      if (approval.status !== 'approved') continue
      const targetMap = approval.source_type === 'purchase_bill'
        ? approvedByPurchaseBillId
        : approval.source_type === 'advance_payment'
          ? approvedByAdvanceId
          : approval.source_type === 'expense'
            ? approvedByExpenseId
            : null
      if (targetMap) targetMap.set(approval.source_id, [...(targetMap.get(approval.source_id) ?? []), approval])
    }

    const apRows = purchaseBills.flatMap((bill: typeof purchaseBills[number]) => {
      const billId = bill.id.toString()
      const activeApprovals = approvedByPurchaseBillId.get(billId) ?? []
      const voidedApprovals = voidedByPurchaseBillId.get(billId) ?? []
      const totalAmount = toNumber(bill.total_amount)
      const paidAmount = toNumber(bill.paid_amount)
      const payableBalance = Math.max(0, toNumber(bill.payable_balance) || totalAmount - paidAmount)
      const bankAccounts = normalizeSupplierBankAccounts({
        paymentMethods,
        rows: bill.suppliers?.supplier_bank_accounts,
      })
      const approvedOutstanding = activeApprovals.reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)
      const pendingAmount = Math.max(0, payableBalance - approvedOutstanding)
      const sourceDocNo = requireDocumentNo(bill.doc_no, `บิลซื้อ ${bill.id}`)
      const pendingRows = pendingAmount > 0.01 ? [{
        approvalDisplayDocNo: null,
        bankAccount: '',
        bankAccounts,
        approvalId: sourceDocNo,
        approvalStatus: 'pending' as const,
        approvedAmount: 0,
        destinationLabel: '',
        bankName: '',
        date: toDateOnly(bill.date),
        docNo: sourceDocNo,
        id: `purchase_bill:${sourceDocNo}`,
        paidAmount,
        payableBalance: pendingAmount,
        sourceLabel: 'บิลซื้อ',
        sourceDocNo,
        sourceType: 'purchase_bill' as const,
        supplierName: bill.suppliers?.name ?? '-',
        totalAmount,
      }] : []
      const approvedRows = activeApprovals.map((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        return {
        approvalDisplayDocNo: approvalDocNo,
        bankAccount: approval.destination_account_no_snapshot ?? '',
        bankAccounts: [],
        approvalId: approvalDocNo,
        approvalStatus: 'approved' as const,
        approvedAmount: toNumber(approval.approved_amount),
        destinationLabel: [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / '),
        bankName: approval.destination_bank_name_snapshot ?? '',
        date: toDateOnly(approval.approved_at ?? bill.date),
        docNo: approvalDocNo,
        id: approvalDocNo,
        paidAmount: 0,
        payableBalance: toNumber(approval.approved_amount),
        sourceLabel: 'บิลซื้อ',
        sourceDocNo: bill.doc_no,
        sourceType: 'purchase_bill' as const,
        supplierName: approval.party_name_snapshot ?? bill.suppliers?.name ?? '-',
        totalAmount: toNumber(approval.approved_amount),
      }})
      const voidedRows = voidedApprovals.map((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        const approvedAmount = toNumber(approval.approved_amount)
        return {
        approvalDisplayDocNo: approvalDocNo,
        bankAccount: approval.destination_account_no_snapshot ?? '',
        bankAccounts: [],
        approvalId: approvalDocNo,
        approvalStatus: 'voided' as const,
        approvedAmount,
        destinationLabel: [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / '),
        bankName: approval.destination_bank_name_snapshot ?? '',
        date: toDateOnly(approval.voided_at ?? approval.approved_at ?? bill.date),
        docNo: approvalDocNo,
        id: approvalDocNo,
        paidAmount: 0,
        payableBalance: approvedAmount,
        sourceLabel: 'บิลซื้อ',
        sourceDocNo,
        sourceType: 'purchase_bill' as const,
        supplierName: approval.party_name_snapshot ?? bill.suppliers?.name ?? '-',
        totalAmount: approvedAmount,
        voidReason: approval.void_reason ?? '',
        voidedAt: toDateOnly(approval.voided_at),
      }})
      return [...pendingRows, ...approvedRows, ...voidedRows]
    })

    const advanceRows = advancePayments.flatMap((advance: typeof advancePayments[number]) => {
      const advanceId = advance.id.toString()
      const activeApprovals = approvedByAdvanceId.get(advanceId) ?? []
      const voidedApprovals = voidedByAdvanceId.get(advanceId) ?? []
      const activeOrConsumedApprovals = activeByAdvanceId.get(advanceId) ?? []
      const totalAmount = toNumber(advance.amount)
      const bankAccounts = normalizeSupplierBankAccounts({
        paymentMethods,
        rows: advance.suppliers?.supplier_bank_accounts,
      })
      const approvedOutstanding = activeOrConsumedApprovals.reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)
      const pendingAmount = Math.max(0, totalAmount - approvedOutstanding)
      const sourceDocNo = requireDocumentNo(advance.doc_no, `ADV ${advance.id}`)
      const pendingRows = pendingAmount > 0.01 ? [{
        approvalDisplayDocNo: null,
        bankAccount: '',
        bankAccounts,
        approvalId: sourceDocNo,
        approvalStatus: 'pending' as const,
        approvedAmount: 0,
        destinationLabel: '',
        bankName: '',
        date: toDateOnly(advance.advance_date),
        docNo: sourceDocNo,
        id: `advance_payment:${sourceDocNo}`,
        paidAmount: 0,
        payableBalance: pendingAmount,
        sourceLabel: 'ADV',
        sourceDocNo,
        sourceType: 'advance_payment' as const,
        supplierName: advance.suppliers?.name ?? '-',
        totalAmount,
      }] : []
      const approvedRows = activeApprovals.map((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        return {
        approvalDisplayDocNo: approvalDocNo,
        bankAccount: approval.destination_account_no_snapshot ?? '',
        bankAccounts: [],
        approvalId: approvalDocNo,
        approvalStatus: 'approved' as const,
        approvedAmount: toNumber(approval.approved_amount),
        destinationLabel: [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / '),
        bankName: approval.destination_bank_name_snapshot ?? '',
        date: toDateOnly(approval.approved_at ?? advance.advance_date),
        docNo: approvalDocNo,
        id: approvalDocNo,
        paidAmount: 0,
        payableBalance: toNumber(approval.approved_amount),
        sourceLabel: 'ADV',
        sourceDocNo: advance.doc_no,
        sourceType: 'advance_payment' as const,
        supplierName: approval.party_name_snapshot ?? advance.suppliers?.name ?? '-',
        totalAmount: toNumber(approval.approved_amount),
      }})
      const voidedRows = voidedApprovals.map((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        const approvedAmount = toNumber(approval.approved_amount)
        return {
        approvalDisplayDocNo: approvalDocNo,
        bankAccount: approval.destination_account_no_snapshot ?? '',
        bankAccounts: [],
        approvalId: approvalDocNo,
        approvalStatus: 'voided' as const,
        approvedAmount,
        destinationLabel: [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / '),
        bankName: approval.destination_bank_name_snapshot ?? '',
        date: toDateOnly(approval.voided_at ?? approval.approved_at ?? advance.advance_date),
        docNo: approvalDocNo,
        id: approvalDocNo,
        paidAmount: 0,
        payableBalance: approvedAmount,
        sourceLabel: 'ADV',
        sourceDocNo,
        sourceType: 'advance_payment' as const,
        supplierName: approval.party_name_snapshot ?? advance.suppliers?.name ?? '-',
        totalAmount: approvedAmount,
        voidReason: approval.void_reason ?? '',
        voidedAt: toDateOnly(approval.voided_at),
      }})
      return [...pendingRows, ...approvedRows, ...voidedRows]
    })

    const expenseRows = expenses.flatMap((expense: typeof expenses[number]) => {
      const amount = toNumber(expense.net_amount) || toNumber(expense.amount) + toNumber(expense.vat) - toNumber(expense.wht)
      const expenseId = expense.id.toString()
      const activeApprovals = approvedByExpenseId.get(expenseId) ?? []
      const voidedApprovals = voidedByExpenseId.get(expenseId) ?? []
      const activeOrConsumedApprovals = activeByExpenseId.get(expenseId) ?? []
      const approvedOutstanding = activeOrConsumedApprovals.reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)
      const pendingAmount = Math.max(0, amount - approvedOutstanding)
      const sourceDocNo = requireDocumentNo(expense.doc_no, `ค่าใช้จ่าย ${expense.id}`)
      const destinationOptions = normalizeSupplierBankAccounts({
        paymentMethods,
        rows: expense.suppliers?.supplier_bank_accounts,
      })
      const pendingRows = pendingAmount > 0.01 ? [{
        accountId: expense.accounts?.code ?? '',
        accountName: expense.accounts?.name ?? '',
        approvalDisplayDocNo: null,
        approvalId: sourceDocNo,
        approvalStatus: 'pending' as const,
        approvedAmount: 0,
        date: toDateOnly(expense.date),
        destinationLabel: '',
        destinationOptions,
        docNo: sourceDocNo,
        dueDate: toDateOnly(expense.due_date),
        id: `expense:${sourceDocNo}`,
        payee: expense.suppliers?.name ?? expense.payee ?? '-',
        refDocNo: expense.ref_doc_no ?? '',
        sourceDocNo,
        sourceType: 'expense' as const,
        totalAmount: pendingAmount,
      }] : []
      const approvedRows = activeApprovals.map((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        return {
        accountId: approval.destination_account_no_snapshot ?? expense.accounts?.code ?? '',
        accountName: approval.destination_bank_name_snapshot || approval.destination_payment_method_snapshot || '',
        approvalDisplayDocNo: approvalDocNo,
        approvalId: approvalDocNo,
        approvalStatus: 'approved' as const,
        approvedAmount: toNumber(approval.approved_amount),
        date: toDateOnly(approval.approved_at ?? expense.date),
        destinationLabel: [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / '),
        destinationOptions: [],
        docNo: approvalDocNo,
        dueDate: toDateOnly(expense.due_date),
        id: approvalDocNo,
        payee: approval.party_name_snapshot ?? expense.suppliers?.name ?? expense.payee ?? '-',
        refDocNo: expense.ref_doc_no ?? '',
        sourceDocNo: expense.doc_no,
        sourceType: 'expense' as const,
        totalAmount: toNumber(approval.approved_amount),
      }})
      const voidedRows = voidedApprovals.map((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        const approvedAmount = toNumber(approval.approved_amount)
        return {
        accountId: approval.destination_account_no_snapshot ?? expense.accounts?.code ?? '',
        accountName: approval.destination_bank_name_snapshot || approval.destination_payment_method_snapshot || '',
        approvalDisplayDocNo: approvalDocNo,
        approvalId: approvalDocNo,
        approvalStatus: 'voided' as const,
        approvedAmount,
        date: toDateOnly(approval.voided_at ?? approval.approved_at ?? expense.date),
        destinationLabel: [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / '),
        destinationOptions: [],
        docNo: approvalDocNo,
        dueDate: toDateOnly(expense.due_date),
        id: approvalDocNo,
        payee: approval.party_name_snapshot ?? expense.suppliers?.name ?? expense.payee ?? '-',
        refDocNo: expense.ref_doc_no ?? '',
        sourceDocNo,
        sourceType: 'expense' as const,
        totalAmount: approvedAmount,
        voidReason: approval.void_reason ?? '',
        voidedAt: toDateOnly(approval.voided_at),
      }})
      return [...pendingRows, ...approvedRows, ...voidedRows]
    })

    const dailyAccountOptions = dailyAccounts.map((account) => ({
      accountNo: account.code ?? '',
      bankName: account.name,
      id: account.id,
      isPrimary: false,
      kind: account.type === 'cash' ? 'cash' as const : 'bank' as const,
      label: [account.type, account.name, account.code ?? ''].filter(Boolean).join(' / '),
      paymentMethod: account.type,
    }))
    const pettyReturnRows = approvals
      .filter((approval) => approval.source_type === 'petty_advance_return')
      .map((approval) => {
        const approvalDocNo = approval.doc_no ? requireDocumentNo(approval.doc_no, `อนุมัติคืนเงิน ${approval.id}`) : null
        const approvedAmount = toNumber(approval.approved_amount)
        const destinationLabel = [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / ')
        const matchingOption = dailyAccountOptions.find((option) => option.id === approval.destination_bank_account_id_snapshot)
        return {
          accountId: approval.destination_bank_account_id_snapshot ?? matchingOption?.id ?? '',
          accountName: approval.destination_bank_name_snapshot || matchingOption?.bankName || '',
          approvalDisplayDocNo: approvalDocNo,
          approvalId: approval.id.toString(),
          approvalStatus: approval.status === 'voided' ? 'voided' as const : approval.status === 'approved' || approval.status === 'paid' ? 'approved' as const : 'pending' as const,
          approvedAmount: approval.status === 'pending' ? 0 : approvedAmount,
          date: toDateOnly(approval.source_date_snapshot ?? approval.approved_at ?? approval.created_at),
          destinationLabel,
          destinationOptions: matchingOption ? [matchingOption] : dailyAccountOptions,
          docNo: approvalDocNo ?? approval.source_doc_no_snapshot ?? `RET-${approval.id.toString()}`,
          dueDate: toDateOnly(approval.source_date_snapshot),
          id: `petty_advance_return:${approval.id.toString()}`,
          payee: approval.party_name_snapshot ?? '-',
          refDocNo: approval.note ?? '',
          sourceDocNo: approval.source_doc_no_snapshot ?? '',
          sourceType: 'petty_advance_return' as const,
          totalAmount: approvedAmount,
          voidReason: approval.void_reason ?? '',
          voidedAt: toDateOnly(approval.voided_at),
        }
      })

    return NextResponse.json({ apRows: [...apRows, ...advanceRows], expenseRows, pettyReturnRows })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการอนุมัติจ่ายเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = approvalRequestSchema.parse(await request.json())
    const actor = context.appUser?.username ?? context.authUser.email ?? context.authUser.id
    const paymentMethods = await getActivePaymentMethods()

    const result = await prisma.$transaction(async (tx) => {
      const sourceDocNo = requireDocumentNo(values.approvalId, 'เอกสารต้นทางที่ต้องการอนุมัติ')
      const bills = await tx.purchase_bills.findMany({
        include: {
          branches: true,
          suppliers: {
            include: {
              supplier_bank_accounts: {
                include: {
                  bank_names: {
                    select: { code: true, name: true },
                  },
                },
              },
            },
          },
        },
        where: {
          ...(values.sourceType === 'purchase_bill' ? { doc_no: sourceDocNo } : { id: BigInt(-1) }),
          status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] },
        },
      })
      if (values.sourceType === 'purchase_bill' && bills.length !== 1) throw new Error('ไม่พบบิลซื้อที่ต้องการอนุมัติ หรือบิลถูกยกเลิกแล้ว')

      const advancePayments = await tx.supplier_advance_payments.findMany({
        include: {
          branches: true,
          suppliers: {
            include: {
              supplier_bank_accounts: {
                include: {
                  bank_names: {
                    select: { code: true, name: true },
                  },
                },
              },
            },
          },
        },
        where: {
          ...(values.sourceType === 'advance_payment' ? { doc_no: sourceDocNo } : { id: BigInt(-1) }),
          status: { notIn: ['cancelled', 'paid'] },
        },
      })
      if (values.sourceType === 'advance_payment' && advancePayments.length !== 1) throw new Error('ไม่พบรายการ ADV ที่ต้องการอนุมัติ หรือรายการถูกยกเลิกแล้ว')

      const expenses = await tx.expenses.findMany({
        include: {
          accounts: true,
          branches: true,
          suppliers: {
            include: {
              supplier_bank_accounts: {
                include: {
                  bank_names: {
                    select: { code: true, name: true },
                  },
                },
                orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
              },
            },
          },
        },
        where: {
          ...(values.sourceType === 'expense' ? { doc_no: sourceDocNo } : { id: BigInt(-1) }),
          status: { notIn: ['paid', 'cancelled'] },
        },
      })
      if (values.sourceType === 'expense' && expenses.length !== 1) throw new Error('ไม่พบรายการค่าใช้จ่ายที่ต้องการอนุมัติ หรือรายการถูกยกเลิกแล้ว')

      const pettyReturnApproval = values.sourceType === 'petty_advance_return'
        ? await tx.payment_approvals.findFirst({
            where: {
              id: BigInt(values.approvalId),
              source_type: 'petty_advance_return',
              status: 'pending',
            },
          })
        : null
      if (values.sourceType === 'petty_advance_return' && !pettyReturnApproval) throw new Error('ไม่พบรายการคืนเงินที่รออนุมัติ')

      const sourceInternalId = values.sourceType === 'purchase_bill'
        ? bills[0]?.id
        : values.sourceType === 'advance_payment'
          ? advancePayments[0]?.id
          : values.sourceType === 'expense'
            ? expenses[0]?.id
            : pettyReturnApproval?.id
      if (sourceInternalId == null) throw new Error('รหัสรายการอนุมัติไม่ถูกต้อง')

      const billById = new Map(bills.map((bill) => [bill.id.toString(), bill]))
      const advanceById = new Map(advancePayments.map((advance) => [advance.id.toString(), advance]))
      const expenseById = new Map(expenses.map((expense) => [expense.id.toString(), expense]))
      const existingApprovals = await tx.payment_approvals.findMany({
        where: {
          source_id: sourceInternalId.toString(),
          source_type: values.sourceType,
          status: { in: ['approved', 'paid'] },
        },
      })
      const approvedUnpaidAmount = existingApprovals
        .filter((approval) => approval.status === 'approved')
        .reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)
      const approvedOrPaidAmount = existingApprovals
        .reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)

      const created = []
      if (values.sourceType === 'purchase_bill') {
        const bill = billById.get(sourceInternalId.toString())
        if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการอนุมัติ')
        const totalAmount = toNumber(bill.total_amount)
        const paidAmount = toNumber(bill.paid_amount)
        const payableBalance = Math.max(0, toNumber(bill.payable_balance) || totalAmount - paidAmount)
        const alreadyApproved = approvedUnpaidAmount
        const pendingAmount = Math.max(0, payableBalance - alreadyApproved)
        const cycleAmount = values.splits.reduce((sum, split) => sum + split.approvedAmount, 0)
        if (cycleAmount - pendingAmount > 0.01) {
          throw new Error(`ยอดอนุมัติของ ${bill.doc_no} เกินยอดคงเหลือที่ยังไม่ได้อนุมัติ`)
        }

        const destinations = normalizeSupplierBankAccounts({
          paymentMethods,
          rows: bill.suppliers?.supplier_bank_accounts,
        })
        const approvedAt = new Date()
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('payment_approvals.doc_no'))`
        const approvalDocNos = await nextPaymentApprovalDocNos(tx, bill.date, bill.branches?.code ?? '', values.splits.length)

        for (const [index, split] of values.splits.entries()) {
          const selectedDestination = destinations.find((option) => option.id === split.destinationId)
          const approvalDocNo = requireDocumentNo(approvalDocNos[index], `PMA split ${index + 1}`)
          if (!selectedDestination) throw new Error(`ไม่พบช่องทางจ่ายปลายทางของ ${bill.doc_no}`)
          const approval = await tx.payment_approvals.create({
            data: {
              approved_amount: split.approvedAmount,
              approved_at: approvedAt,
              approved_by: actor,
              destination_account_no_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.accountNo || null,
              destination_bank_account_id_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.id,
              destination_bank_name_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.bankName || null,
              destination_payment_method_snapshot: selectedDestination.paymentMethod || null,
              doc_no: approvalDocNo,
              party_id: bill.suppliers?.code ?? null,
              party_name_snapshot: bill.suppliers?.name ?? null,
              source_date_snapshot: bill.date ? normalizeDate(toDateOnly(bill.date)) : null,
              source_doc_no_snapshot: bill.doc_no,
              source_id: bill.id.toString(),
              source_type: 'purchase_bill',
              status: 'approved',
              updated_at: approvedAt,
            },
          })
          created.push(approval)
          await appendPaymentApprovalStatusLog(tx, {
            action: PAYMENT_APPROVAL_STATUS_ACTION.APPROVED,
            actor,
            createdAt: approvedAt,
            fromStatus: null,
            meta: {
              destinationId: split.destinationId,
              sourceDocNo: bill.doc_no,
              sourceType: 'purchase_bill',
              splitCount: values.splits.length,
              splitIndex: index + 1,
            },
            paymentApprovalId: approval.id,
            toStatus: 'approved',
          })
        }
      }

      if (values.sourceType === 'advance_payment') {
        const advance = advanceById.get(sourceInternalId.toString())
        if (!advance) throw new Error('ไม่พบรายการ ADV ที่ต้องการอนุมัติ')
        const totalAmount = toNumber(advance.amount)
        const alreadyApproved = approvedOrPaidAmount
        const pendingAmount = Math.max(0, totalAmount - alreadyApproved)
        const cycleAmount = values.splits.reduce((sum, split) => sum + split.approvedAmount, 0)
        if (cycleAmount - pendingAmount > 0.01) {
          throw new Error(`ยอดอนุมัติของ ${advance.doc_no} เกินยอดคงเหลือที่ยังไม่ได้อนุมัติ`)
        }

        const destinations = normalizeSupplierBankAccounts({
          paymentMethods,
          rows: advance.suppliers?.supplier_bank_accounts,
        })
        const approvedAt = new Date()
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('payment_approvals.doc_no'))`
        const approvalDocNos = await nextPaymentApprovalDocNos(tx, advance.advance_date, advance.branches?.code ?? '', values.splits.length)

        for (const [index, split] of values.splits.entries()) {
          const selectedDestination = destinations.find((option) => option.id === split.destinationId)
          const approvalDocNo = requireDocumentNo(approvalDocNos[index], `PMA split ${index + 1}`)
          if (!selectedDestination) throw new Error(`ไม่พบช่องทางจ่ายปลายทางของ ${advance.doc_no}`)
          const approval = await tx.payment_approvals.create({
            data: {
              approved_amount: split.approvedAmount,
              approved_at: approvedAt,
              approved_by: actor,
              destination_account_no_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.accountNo || null,
              destination_bank_account_id_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.id,
              destination_bank_name_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.bankName || null,
              destination_payment_method_snapshot: selectedDestination.paymentMethod || null,
              doc_no: approvalDocNo,
              party_id: advance.suppliers?.code ?? null,
              party_name_snapshot: advance.suppliers?.name ?? null,
              source_date_snapshot: advance.advance_date ? normalizeDate(toDateOnly(advance.advance_date)) : null,
              source_doc_no_snapshot: advance.doc_no,
              source_id: advance.id.toString(),
              source_type: 'advance_payment',
              status: 'approved',
              updated_at: approvedAt,
            },
          })
          created.push(approval)
          await appendPaymentApprovalStatusLog(tx, {
            action: PAYMENT_APPROVAL_STATUS_ACTION.APPROVED,
            actor,
            createdAt: approvedAt,
            fromStatus: null,
            meta: {
              destinationId: split.destinationId,
              sourceDocNo: advance.doc_no,
              sourceType: 'advance_payment',
              splitCount: values.splits.length,
              splitIndex: index + 1,
            },
            paymentApprovalId: approval.id,
            toStatus: 'approved',
          })
        }
        await refreshAdvancePaymentWorkflowStatus(tx, advance.id, actor, {
          logIfUnchanged: true,
          meta: {
            approvedAmount: cycleAmount,
            approvalDocNos,
            splitCount: values.splits.length,
          },
        })
      }

      if (values.sourceType === 'expense') {
        const expense = expenseById.get(sourceInternalId.toString())
        if (!expense) throw new Error('ไม่พบรายการค่าใช้จ่ายที่ต้องการอนุมัติ')
        const totalAmount = toNumber(expense.net_amount) || toNumber(expense.amount) + toNumber(expense.vat) - toNumber(expense.wht)
        const alreadyApproved = approvedOrPaidAmount
        const pendingAmount = Math.max(0, totalAmount - alreadyApproved)
        const cycleAmount = values.splits.reduce((sum, split) => sum + split.approvedAmount, 0)
        if (cycleAmount - pendingAmount > 0.01) {
          throw new Error(`ยอดอนุมัติของ ${expense.doc_no} เกินยอดคงเหลือที่ยังไม่ได้อนุมัติ`)
        }

        const approvedAt = new Date()
        const destinations = normalizeSupplierBankAccounts({
          paymentMethods,
          rows: expense.suppliers?.supplier_bank_accounts,
        })
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('payment_approvals.doc_no'))`
        const approvalDocNos = await nextPaymentApprovalDocNos(tx, expense.date, expense.branches?.code ?? '', values.splits.length)

        for (const [index, split] of values.splits.entries()) {
          const approvalDocNo = requireDocumentNo(approvalDocNos[index], `PMA split ${index + 1}`)
          const selectedDestination = destinations.find((option) => option.id === split.destinationId)
          if (!selectedDestination) throw new Error(`ไม่พบบัญชีปลายทางของ ${expense.doc_no}`)
          const approval = await tx.payment_approvals.create({
            data: {
              approved_amount: split.approvedAmount,
              approved_at: approvedAt,
              approved_by: actor,
              destination_account_no_snapshot: selectedDestination.accountNo || null,
              destination_bank_account_id_snapshot: selectedDestination.id,
              destination_bank_name_snapshot: selectedDestination.bankName || null,
              destination_payment_method_snapshot: selectedDestination.paymentMethod || selectedDestination.label || null,
              doc_no: approvalDocNo,
              party_id: expense.suppliers?.code ?? null,
              party_name_snapshot: expense.suppliers?.name ?? expense.payee ?? null,
              source_date_snapshot: expense.date ? normalizeDate(toDateOnly(expense.date)) : null,
              source_doc_no_snapshot: expense.doc_no,
              source_id: expense.id.toString(),
              source_type: 'expense',
              status: 'approved',
              updated_at: approvedAt,
            },
          })
          created.push(approval)
          await appendPaymentApprovalStatusLog(tx, {
            action: PAYMENT_APPROVAL_STATUS_ACTION.APPROVED,
            actor,
            createdAt: approvedAt,
            fromStatus: null,
            meta: {
              destinationId: split.destinationId,
              sourceDocNo: expense.doc_no,
              sourceType: 'expense',
              splitCount: values.splits.length,
              splitIndex: index + 1,
            },
            paymentApprovalId: approval.id,
            toStatus: 'approved',
          })
        }
        await tx.expenses.update({
          data: {
            status: 'approved',
            updated_at: approvedAt,
            updated_by: actor,
          },
          where: { id: expense.id },
        })
      }

      if (values.sourceType === 'petty_advance_return') {
        const returnApproval = pettyReturnApproval
        if (!returnApproval) throw new Error('ไม่พบรายการคืนเงินที่รออนุมัติ')
        if (values.splits.length !== 1) throw new Error('รายการคืนเงินอนุมัติได้ครั้งละ 1 บัญชีรับคืน')
        const split = values.splits[0]
        const returnAmount = toNumber(returnApproval.approved_amount)
        if (Math.abs(split.approvedAmount - returnAmount) > 0.01) {
          throw new Error(`ยอดอนุมัติคืนเงินต้องเท่ากับ ${returnAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        }
        const destinationCode = returnApproval.destination_bank_account_id_snapshot ?? ''
        if (split.destinationId !== destinationCode) throw new Error('บัญชีรับคืนไม่ตรงกับรายการที่แจ้งคืน')

        const [advance, account] = await Promise.all([
          tx.petty_advances.findUnique({ where: { id: BigInt(returnApproval.source_id) } }),
          tx.accounts.findFirst({ where: { active: true, code: destinationCode } }),
        ])
        if (!advance) throw new Error('ไม่พบรายการเงินสำรองจ่ายที่ต้องคืน')
        if (!account) throw new Error('บัญชีรับคืนไม่ถูกต้อง')

        const returnDate = toDateOnly(returnApproval.source_date_snapshot ?? new Date())
        const returnedAmount = toNumber(advance.returned_amount) + returnAmount
        const status = returnedAmount >= toNumber(advance.amount) ? 'closed' : advance.status
        const approvedAt = new Date()
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('payment_approvals.doc_no'))`
        const [approvalDocNo] = await nextPaymentApprovalDocNos(tx, new Date(returnDate), '', 1)
        const returnDocNo = await nextDailyDocNo('petty_advance_returns', 'PRET', returnDate, tx)

        const entry = await tx.petty_advance_returns.create({
          data: {
            account_id: account.id,
            advance_id: advance.id,
            amount: returnAmount,
            created_by: actor,
            date: normalizeDate(returnDate),
            doc_no: returnDocNo,
            notes: returnApproval.note,
          },
        })

        await tx.petty_advances.update({
          data: {
            closed_at: status === 'closed' ? approvedAt : advance.closed_at,
            returned_amount: returnedAmount,
            status,
            updated_at: approvedAt,
            updated_by: actor,
          },
          where: { id: advance.id },
        })

        await tx.bank_statement.create({
          data: {
            account_id: account.id,
            amount_in: returnAmount,
            amount_out: 0,
            created_by: actor,
            date: normalizeDate(returnDate),
            description: `คืน ${advance.doc_no} โดย ${advance.recipient_name}`,
            doc_no: await nextDailyDocNo('bank_statement', 'BST', returnDate, tx),
            ref_id: entry.doc_no,
            ref_no: entry.doc_no,
            ref_type: 'PRET',
            type: 'คืนเงินสำรองจ่าย',
          },
        })

        const approval = await tx.payment_approvals.update({
          data: {
            approved_at: approvedAt,
            approved_by: actor,
            doc_no: approvalDocNo,
            status: 'approved',
            updated_at: approvedAt,
          },
          where: { id: returnApproval.id },
        })
        created.push(approval)
        await appendPaymentApprovalStatusLog(tx, {
          action: PAYMENT_APPROVAL_STATUS_ACTION.APPROVED,
          actor,
          createdAt: approvedAt,
          fromStatus: 'pending',
          meta: {
            pretDocNo: returnDocNo,
            sourceDocNo: advance.doc_no,
            sourceType: 'petty_advance_return',
          },
          paymentApprovalId: approval.id,
          toStatus: 'approved',
        })
      }

      return created.map((approval) => ({
        ...approval,
        id: requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`),
      }))
    })

    return NextResponse.json({ items: result })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อนุมัติจ่ายเงินไม่ได้', 400)
  }
}
