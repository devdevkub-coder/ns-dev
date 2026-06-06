import type { Prisma } from '../../../generated/prisma/client'
import { normalizeDate, toDateOnly } from '@/lib/server/daily'

function normalizeBranchCode(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed.padStart(2, '0').slice(-2) : '00'
}

export async function nextPaymentApprovalDocNo(
  tx: Prisma.TransactionClient,
  documentDate: Date,
  branchCode: string,
) {
  const period = toDateOnly(documentDate).slice(2, 4) + toDateOnly(documentDate).slice(5, 7)
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

type EnsurePendingPaymentApprovalParams = {
  actor: string
  branchCode: string | null | undefined
  documentDate: Date
  partyCode?: string | null
  partyName?: string | null
  sourceDocNo: string
  sourceId: bigint
  sourceType: 'advance_payment' | 'expense' | 'purchase_bill'
}

type PaymentApprovalSourceType = EnsurePendingPaymentApprovalParams['sourceType']

const LOCKED_PAYMENT_APPROVAL_STATUSES = ['approved', 'paid'] as const

export async function ensurePendingPaymentApproval(
  tx: Prisma.TransactionClient,
  params: EnsurePendingPaymentApprovalParams,
) {
  const now = new Date()
  const sourceId = params.sourceId.toString()
  const existing = await tx.payment_approvals.findFirst({
    where: {
      source_id: sourceId,
      source_type: params.sourceType,
      status: 'pending',
    },
  })
  if (existing) {
    return tx.payment_approvals.update({
      where: { id: existing.id },
      data: {
        party_id: params.partyCode ?? null,
        party_name_snapshot: params.partyName ?? null,
        source_date_snapshot: normalizeDate(toDateOnly(params.documentDate)),
        source_doc_no_snapshot: params.sourceDocNo,
        updated_at: now,
      },
    })
  }

  const docNo = await nextPaymentApprovalDocNo(tx, params.documentDate, params.branchCode ?? '')
  return tx.payment_approvals.create({
    data: {
      approved_amount: 0,
      created_at: now,
      doc_no: docNo,
      note: 'pending_source_backed',
      party_id: params.partyCode ?? null,
      party_name_snapshot: params.partyName ?? null,
      source_date_snapshot: normalizeDate(toDateOnly(params.documentDate)),
      source_doc_no_snapshot: params.sourceDocNo,
      source_id: sourceId,
      source_type: params.sourceType,
      status: 'pending',
      updated_at: now,
    },
  })
}

export async function deletePendingPaymentApproval(
  tx: Prisma.TransactionClient,
  sourceType: PaymentApprovalSourceType,
  sourceId: bigint,
) {
  return tx.payment_approvals.deleteMany({
    where: {
      source_id: sourceId.toString(),
      source_type: sourceType,
      status: 'pending',
    },
  })
}

export async function hasLockedPaymentApproval(
  tx: Prisma.TransactionClient,
  sourceType: PaymentApprovalSourceType,
  sourceId: bigint,
) {
  const count = await tx.payment_approvals.count({
    where: {
      source_id: sourceId.toString(),
      source_type: sourceType,
      status: { in: [...LOCKED_PAYMENT_APPROVAL_STATUSES] },
    },
  })
  return count > 0
}

export async function backfillPendingPaymentApprovals(tx: Prisma.TransactionClient) {
  const existingApprovals = await tx.payment_approvals.findMany({
    select: {
      source_id: true,
      source_type: true,
      status: true,
    },
    where: {
      status: { in: ['pending', ...LOCKED_PAYMENT_APPROVAL_STATUSES] },
    },
  })

  const sourceKeySet = new Set(
    existingApprovals.map((approval) => `${approval.source_type}:${approval.source_id}`),
  )

  let createdCount = 0

  const [purchaseBills, advancePayments, expenses] = await Promise.all([
    tx.purchase_bills.findMany({
      include: {
        branches: { select: { code: true } },
        suppliers: { select: { code: true, name: true } },
      },
      where: {
        NOT: { status: 'cancelled' },
      },
    }),
    tx.supplier_advance_payments.findMany({
      include: {
        branches: { select: { code: true } },
        suppliers: { select: { code: true, name: true } },
      },
      where: {
        status: 'pending_approval',
      },
    }),
    tx.expenses.findMany({
      select: {
        date: true,
        doc_no: true,
        id: true,
        net_amount: true,
        payee: true,
        status: true,
        vat: true,
        wht: true,
        amount: true,
      },
      where: {
        status: { in: ['pending', 'pending_approval', ''] },
      },
    }),
  ])

  for (const bill of purchaseBills) {
    const payableBalance = Number(bill.payable_balance ?? 0)
    if (payableBalance <= 0.01) continue
    const sourceKey = `purchase_bill:${bill.id.toString()}`
    if (sourceKeySet.has(sourceKey)) continue
    await ensurePendingPaymentApproval(tx, {
      actor: 'system-backfill',
      branchCode: bill.branches?.code,
      documentDate: bill.date,
      partyCode: bill.suppliers?.code,
      partyName: bill.suppliers?.name,
      sourceDocNo: bill.doc_no,
      sourceId: bill.id,
      sourceType: 'purchase_bill',
    })
    sourceKeySet.add(sourceKey)
    createdCount += 1
  }

  for (const advance of advancePayments) {
    const sourceKey = `advance_payment:${advance.id.toString()}`
    if (sourceKeySet.has(sourceKey)) continue
    await ensurePendingPaymentApproval(tx, {
      actor: 'system-backfill',
      branchCode: advance.branches?.code,
      documentDate: advance.advance_date,
      partyCode: advance.suppliers?.code,
      partyName: advance.suppliers?.name,
      sourceDocNo: advance.doc_no,
      sourceId: advance.id,
      sourceType: 'advance_payment',
    })
    sourceKeySet.add(sourceKey)
    createdCount += 1
  }

  for (const expense of expenses) {
    const amount = Number(expense.net_amount ?? expense.amount ?? 0) || (Number(expense.amount ?? 0) + Number(expense.vat ?? 0) - Number(expense.wht ?? 0))
    if (amount <= 0.01) continue
    const sourceKey = `expense:${expense.id.toString()}`
    if (sourceKeySet.has(sourceKey)) continue
    await ensurePendingPaymentApproval(tx, {
      actor: 'system-backfill',
      branchCode: null,
      documentDate: expense.date,
      partyCode: null,
      partyName: expense.payee,
      sourceDocNo: expense.doc_no,
      sourceId: expense.id,
      sourceType: 'expense',
    })
    sourceKeySet.add(sourceKey)
    createdCount += 1
  }

  return { createdCount }
}
