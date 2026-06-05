import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { z } from 'zod'
import { defaultPaymentMethodNameByGroup, paymentMethodGroupFromValue, resolvePaymentMethodName } from '@/lib/account-payment-method'
import { requireBusinessCode } from '@/lib/business-code'
import { requireDocumentNo } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { getActivePaymentMethods, type ActivePaymentMethod } from '@/lib/server/payment-methods'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const approvalRequestSchema = z.object({
  sourceId: z.string().trim().min(1, 'ไม่พบเอกสารที่ต้องการอนุมัติ'),
  sourceType: z.enum(['purchase_bill', 'advance_payment', 'expense']),
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

async function findApprovalSourceByDocNo(
  tx: Prisma.TransactionClient,
  sourceType: 'purchase_bill' | 'advance_payment' | 'expense',
  value: string,
) {
  if (sourceType === 'purchase_bill') {
    return tx.purchase_bills.findFirst({
      select: { id: true },
      where: { doc_no: value, NOT: { status: 'cancelled' } },
    })
  }
  if (sourceType === 'advance_payment') {
    return tx.supplier_advance_payments.findFirst({
      select: { id: true },
      where: { doc_no: value, status: { not: 'cancelled' } },
    })
  }
  return tx.expenses.findFirst({
    select: { id: true },
    where: { doc_no: value, status: { notIn: ['paid', 'cancelled'] } },
  })
}

function normalizeSupplierBankAccounts(params: {
  paymentMethods: ActivePaymentMethod[]
  rows:
    | Array<{
        code: string | null
        account_no: string | null
        active: boolean | null
        bank_name: string | null
        id: bigint
        is_primary: boolean | null
        payment_method: string | null
      }>
    | null
    | undefined
}): ApprovalDestinationOption[] {
  const defaultBankMethod = defaultPaymentMethodNameByGroup(params.paymentMethods, 'bank') ?? ''
  const cashMethod = defaultPaymentMethodNameByGroup(params.paymentMethods, 'cash')
  const options: ApprovalDestinationOption[] = (params.rows ?? [])
    .filter((account) => account.active !== false)
    .map((account) => ({
      accountNo: account.account_no ?? '',
      bankName: account.bank_name ?? '',
      id: requireBusinessCode(account.code, `บัญชีรับเงินผู้ขาย ${account.id}`),
      isPrimary: account.is_primary ?? false,
      kind: 'bank' as const,
      label: [account.bank_name ?? '', account.account_no ?? ''].filter(Boolean).join(' / ') || resolvePaymentMethodName(account.payment_method, params.paymentMethods) || defaultBankMethod || 'ไม่ระบุ',
      paymentMethod: resolvePaymentMethodName(account.payment_method, params.paymentMethods) ?? defaultBankMethod,
    }))

  if (cashMethod) {
    const hasCash = options.some((option) => paymentMethodGroupFromValue(option.paymentMethod, params.paymentMethods) === 'cash')
    if (!hasCash) {
      options.unshift({
        accountNo: '',
        bankName: '',
        id: `cash:${cashMethod}`,
        isPrimary: options.length === 0,
        kind: 'cash',
        label: cashMethod,
        paymentMethod: cashMethod,
      })
    }
  }

  return options
}

function normalizeBranchCode(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed.padStart(2, '0').slice(-2) : '00'
}

async function nextPaymentApprovalDocNo(
  tx: { $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => Promise<T> },
  approvedDate: Date,
  branchCode: string,
) {
  const period = toDateOnly(approvedDate).slice(2, 4) + toDateOnly(approvedDate).slice(5, 7)
  const normalizedBranchCode = normalizeBranchCode(branchCode)
  const startsWith = `PMA${normalizedBranchCode}${period}-`
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.payment_approvals
    where doc_no like ${`${startsWith}%`}
  `
  const lastNumber = rows.reduce((max: number, row: { doc_no: string }) => {
    const suffix = String(row.doc_no).split('-').at(-1) ?? ''
    const running = Number(suffix.split('/')[0] ?? '')
    return Number.isFinite(running) && running > max ? running : max
  }, 0)
  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [purchaseBills, advancePayments, expenses, approvals, paymentMethods] = await Promise.all([
      prisma.purchase_bills.findMany({
        include: {
          suppliers: {
            include: {
              supplier_bank_accounts: {
                orderBy: [{ is_primary: 'desc' }, { id: 'asc' }],
              },
            },
          },
        },
        orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
        take: 5000,
        where: {
          NOT: { status: 'cancelled' },
        },
      }),
      prisma.supplier_advance_payments.findMany({
        include: {
          branches: true,
          suppliers: {
            include: {
              supplier_bank_accounts: {
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
        include: { accounts: true },
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
          status: 'approved',
        },
      }),
      getActivePaymentMethods(),
    ])

    const approvedByPurchaseBillId = new Map<string, typeof approvals[number][]>()
    const approvedByAdvanceId = new Map<string, typeof approvals[number][]>()
    const approvedByExpenseId = new Map<string, typeof approvals[number][]>()
    for (const approval of approvals) {
      const targetMap =
        approval.source_type === 'purchase_bill'
          ? approvedByPurchaseBillId
          : approval.source_type === 'advance_payment'
            ? approvedByAdvanceId
            : approvedByExpenseId
      if (approval.source_type === 'purchase_bill') {
        targetMap.set(approval.source_id, [...(targetMap.get(approval.source_id) ?? []), approval])
      }
      if (approval.source_type === 'advance_payment') {
        targetMap.set(approval.source_id, [...(targetMap.get(approval.source_id) ?? []), approval])
      }
      if (approval.source_type === 'expense') {
        targetMap.set(approval.source_id, [...(targetMap.get(approval.source_id) ?? []), approval])
      }
    }

    const apRows = purchaseBills.flatMap((bill: typeof purchaseBills[number]) => {
      const billId = bill.id.toString()
      const activeApprovals = approvedByPurchaseBillId.get(billId) ?? []
      const totalAmount = toNumber(bill.total_amount)
      const paidAmount = toNumber(bill.paid_amount)
      const payableBalance = Math.max(0, toNumber(bill.payable_balance) || totalAmount - paidAmount)
      const bankAccounts = normalizeSupplierBankAccounts({
        paymentMethods,
        rows: bill.suppliers?.supplier_bank_accounts,
      })
      const approvedOutstanding = activeApprovals.reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)
      const pendingAmount = Math.max(0, payableBalance - approvedOutstanding)
      const pendingRows = pendingAmount > 0.01 ? [{
        approvalDisplayDocNo: null,
        bankAccount: '',
        bankAccounts,
        approvalId: null,
        approvalStatus: 'pending' as const,
        approvedAmount: 0,
        destinationLabel: '',
        bankName: '',
        date: toDateOnly(bill.date),
        docNo: bill.doc_no,
        id: bill.doc_no,
        paidAmount,
        payableBalance: pendingAmount,
        sourceLabel: 'บิลซื้อ',
        sourceDocNo: bill.doc_no,
        sourceId: bill.doc_no,
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
        sourceId: bill.doc_no,
        sourceType: 'purchase_bill' as const,
        supplierName: approval.party_name_snapshot ?? bill.suppliers?.name ?? '-',
        totalAmount: toNumber(approval.approved_amount),
      }})
      return [...pendingRows, ...approvedRows]
    })

    const advanceRows = advancePayments.flatMap((advance: typeof advancePayments[number]) => {
      const advanceId = advance.id.toString()
      const activeApprovals = approvedByAdvanceId.get(advanceId) ?? []
      const totalAmount = toNumber(advance.amount)
      const bankAccounts = normalizeSupplierBankAccounts({
        paymentMethods,
        rows: advance.suppliers?.supplier_bank_accounts,
      })
      const approvedOutstanding = activeApprovals.reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)
      const pendingAmount = Math.max(0, totalAmount - approvedOutstanding)
      const pendingRows = pendingAmount > 0.01 ? [{
        approvalDisplayDocNo: null,
        bankAccount: '',
        bankAccounts,
        approvalId: null,
        approvalStatus: 'pending' as const,
        approvedAmount: 0,
        destinationLabel: '',
        bankName: '',
        date: toDateOnly(advance.advance_date),
        docNo: advance.doc_no,
        id: advance.doc_no,
        paidAmount: 0,
        payableBalance: pendingAmount,
        sourceLabel: 'ADV',
        sourceDocNo: advance.doc_no,
        sourceId: advance.doc_no,
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
        sourceId: advance.doc_no,
        sourceType: 'advance_payment' as const,
        supplierName: approval.party_name_snapshot ?? advance.suppliers?.name ?? '-',
        totalAmount: toNumber(approval.approved_amount),
      }})
      return [...pendingRows, ...approvedRows]
    })

    const expenseRows = expenses.flatMap((expense: typeof expenses[number]) => {
      const amount = toNumber(expense.net_amount) || toNumber(expense.amount) + toNumber(expense.vat) - toNumber(expense.wht)
      const expenseId = expense.id.toString()
      const activeApprovals = approvedByExpenseId.get(expenseId) ?? []
      const approvedOutstanding = activeApprovals.reduce((sum, approval) => sum + toNumber(approval.approved_amount), 0)
      const pendingAmount = Math.max(0, amount - approvedOutstanding)
      const pendingRows = pendingAmount > 0.01 ? [{
        accountName: expense.accounts?.name ?? '',
        approvalDisplayDocNo: null,
        approvalId: null,
        approvalStatus: 'pending' as const,
        approvedAmount: 0,
        date: toDateOnly(expense.date),
        destinationLabel: '',
        docNo: expense.doc_no,
        dueDate: toDateOnly(expense.due_date),
        id: expense.doc_no,
        payee: expense.payee ?? '-',
        refDocNo: expense.ref_doc_no ?? '',
        sourceId: expense.doc_no,
        sourceDocNo: expense.doc_no,
        sourceType: 'expense' as const,
        totalAmount: pendingAmount,
      }] : []
      const approvedRows = activeApprovals.map((approval) => {
        const approvalDocNo = requireDocumentNo(approval.doc_no, `อนุมัติจ่าย ${approval.id}`)
        return {
        accountName: approval.destination_bank_name_snapshot || approval.destination_payment_method_snapshot || '',
        approvalDisplayDocNo: approvalDocNo,
        approvalId: approvalDocNo,
        approvalStatus: 'approved' as const,
        approvedAmount: toNumber(approval.approved_amount),
        date: toDateOnly(approval.approved_at ?? expense.date),
        destinationLabel: [approval.destination_payment_method_snapshot ?? '', approval.destination_bank_name_snapshot ?? '', approval.destination_account_no_snapshot ?? ''].filter(Boolean).join(' / '),
        docNo: approvalDocNo,
        dueDate: toDateOnly(expense.due_date),
        id: approvalDocNo,
        payee: approval.party_name_snapshot ?? expense.payee ?? '-',
        refDocNo: expense.ref_doc_no ?? '',
        sourceId: expense.doc_no,
        sourceDocNo: expense.doc_no,
        sourceType: 'expense' as const,
        totalAmount: toNumber(approval.approved_amount),
      }})
      return [...pendingRows, ...approvedRows]
    })

    return NextResponse.json({ apRows: [...apRows, ...advanceRows], expenseRows })
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

    if (values.sourceType === 'expense') {
      throw new Error('ค่าใช้จ่ายยังไม่เปิด approval write flow ในรอบนี้')
    }

    const result = await prisma.$transaction(async (tx) => {
      const sourceRecord = await findApprovalSourceByDocNo(tx, values.sourceType, values.sourceId)
      const sourceInternalId = sourceRecord?.id ?? null
      if (sourceInternalId == null) {
        throw new Error('รหัสเอกสารที่ต้องการอนุมัติไม่ถูกต้อง')
      }
      const bills = await tx.purchase_bills.findMany({
        include: {
          branches: true,
          suppliers: {
            include: {
              supplier_bank_accounts: true,
            },
          },
        },
        where: {
          ...(values.sourceType === 'purchase_bill' ? { id: sourceInternalId } : { id: BigInt(-1) }),
          NOT: { status: 'cancelled' },
        },
      })
      if (values.sourceType === 'purchase_bill' && bills.length !== 1) throw new Error('ไม่พบบิลซื้อที่ต้องการอนุมัติ หรือบิลถูกยกเลิกแล้ว')

      const advancePayments = await tx.supplier_advance_payments.findMany({
        include: {
          branches: true,
          suppliers: {
            include: {
              supplier_bank_accounts: true,
            },
          },
        },
        where: {
          ...(values.sourceType === 'advance_payment' ? { id: sourceInternalId } : { id: BigInt(-1) }),
          status: { not: 'cancelled' },
        },
      })
      if (values.sourceType === 'advance_payment' && advancePayments.length !== 1) throw new Error('ไม่พบรายการ ADV ที่ต้องการอนุมัติ หรือรายการถูกยกเลิกแล้ว')

      const billById = new Map(bills.map((bill) => [bill.id.toString(), bill]))
      const advanceById = new Map(advancePayments.map((advance) => [advance.id.toString(), advance]))
      const existingApprovals = await tx.payment_approvals.findMany({
        where: {
          source_id: sourceInternalId.toString(),
          source_type: values.sourceType,
          status: 'approved',
        },
      })
      const approvedAmountBySourceId = new Map<string, number>()
      for (const approval of existingApprovals) {
        approvedAmountBySourceId.set(approval.source_id, (approvedAmountBySourceId.get(approval.source_id) ?? 0) + toNumber(approval.approved_amount))
      }

      const created = []
      if (values.sourceType === 'purchase_bill') {
        const bill = billById.get(values.sourceId)
        if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการอนุมัติ')
        const totalAmount = toNumber(bill.total_amount)
        const paidAmount = toNumber(bill.paid_amount)
        const payableBalance = Math.max(0, toNumber(bill.payable_balance) || totalAmount - paidAmount)
      const alreadyApproved = approvedAmountBySourceId.get(bill.id.toString()) ?? 0
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
        const cycleDocNo = await nextPaymentApprovalDocNo(tx, approvedAt, bill.branches?.code ?? '')

        for (const [index, split] of values.splits.entries()) {
          const selectedDestination = destinations.find((option) => option.id === split.destinationId)
          if (!selectedDestination) throw new Error(`ไม่พบช่องทางจ่ายปลายทางของ ${bill.doc_no}`)
          const docNo = values.splits.length > 1 ? `${cycleDocNo}/${index + 1}` : cycleDocNo
          const approval = await tx.payment_approvals.create({
            data: {
              approved_amount: split.approvedAmount,
              approved_at: approvedAt,
              approved_by: actor,
              destination_account_no_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.accountNo || null,
              destination_bank_account_id_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.id,
              destination_bank_name_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.bankName || null,
              destination_payment_method_snapshot: selectedDestination.paymentMethod || null,
              doc_no: docNo,
              party_id: bill.suppliers?.code ?? null,
              party_name_snapshot: bill.suppliers?.name ?? null,
              source_date_snapshot: bill.date ? normalizeDate(toDateOnly(bill.date)) : null,
              source_doc_no_snapshot: bill.doc_no,
              source_id: bill.id.toString(),
              source_type: 'purchase_bill',
              status: 'approved',
            },
          })
          created.push(approval)
        }
      }

      if (values.sourceType === 'advance_payment') {
        const advance = advanceById.get(values.sourceId)
        if (!advance) throw new Error('ไม่พบรายการ ADV ที่ต้องการอนุมัติ')
        if (advance.status !== 'pending_approval') {
          throw new Error(`รายการ ${advance.doc_no} ไม่ได้อยู่ในสถานะยังไม่อนุมัติแล้ว`)
        }
        const totalAmount = toNumber(advance.amount)
        const alreadyApproved = approvedAmountBySourceId.get(advance.id.toString()) ?? 0
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
        const cycleDocNo = await nextPaymentApprovalDocNo(tx, approvedAt, advance.branches?.code ?? '')

        for (const [index, split] of values.splits.entries()) {
          const selectedDestination = destinations.find((option) => option.id === split.destinationId)
          if (!selectedDestination) throw new Error(`ไม่พบช่องทางจ่ายปลายทางของ ${advance.doc_no}`)
          const docNo = values.splits.length > 1 ? `${cycleDocNo}/${index + 1}` : cycleDocNo
          const approval = await tx.payment_approvals.create({
            data: {
              approved_amount: split.approvedAmount,
              approved_at: approvedAt,
              approved_by: actor,
              destination_account_no_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.accountNo || null,
              destination_bank_account_id_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.id,
              destination_bank_name_snapshot: selectedDestination.kind === 'cash' ? null : selectedDestination.bankName || null,
              destination_payment_method_snapshot: selectedDestination.paymentMethod || null,
              doc_no: docNo,
              party_id: advance.suppliers?.code ?? null,
              party_name_snapshot: advance.suppliers?.name ?? null,
              source_date_snapshot: advance.advance_date ? normalizeDate(toDateOnly(advance.advance_date)) : null,
              source_doc_no_snapshot: advance.doc_no,
              source_id: advance.id.toString(),
              source_type: 'advance_payment',
              status: 'approved',
            },
          })
          created.push(approval)
        }
        await tx.supplier_advance_payments.update({
          data: {
            status: 'approved',
            updated_at: new Date(),
            updated_by: actor,
          },
          where: { id: advance.id },
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
