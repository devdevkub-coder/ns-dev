import { randomUUID } from 'node:crypto'
import { Prisma } from '../../../generated/prisma/client'
import { requireDocumentNo } from '@/lib/business-code'
import { toNumber } from '@/lib/server/daily'

type PaymentHistoryTx = Pick<
  Prisma.TransactionClient,
  | 'accounts'
  | 'payment_account_splits'
  | 'payment_allocations'
  | 'payment_approval_status_logs'
  | 'payment_approvals'
  | 'payment_status_logs'
  | 'payments'
>

export const PAYMENT_APPROVAL_STATUS_ACTION = {
  APPROVED: 'approved',
  PAID: 'paid',
  REVERSED_BY_PAYMENT_CANCEL: 'reversed_by_payment_cancel',
  SELECTED_FOR_PAYMENT: 'selected_for_payment',
  VOIDED_BEFORE_PAYMENT: 'voided_before_payment',
} as const

export const PAYMENT_STATUS_ACTION = {
  BANK_POSTED: 'bank_posted',
  BANK_REVERSED: 'bank_reversed',
  CANCELLED: 'cancelled',
  POSTED: 'posted',
} as const

export async function appendPaymentApprovalStatusLog(
  tx: PaymentHistoryTx,
  params: {
    action: typeof PAYMENT_APPROVAL_STATUS_ACTION[keyof typeof PAYMENT_APPROVAL_STATUS_ACTION]
    actor?: string | null
    createdAt?: Date
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    note?: string | null
    paymentApprovalId: bigint
    paymentDocNo?: string | null
    paymentId?: bigint | null
    toStatus: string
  },
) {
  const approval = await tx.payment_approvals.findUnique({
    select: {
      approved_amount: true,
      doc_no: true,
      id: true,
      source_doc_no_snapshot: true,
      source_id: true,
      source_type: true,
    },
    where: { id: params.paymentApprovalId },
  })
  if (!approval) throw new Error('ไม่พบ PMA สำหรับบันทึก timeline')

  const payment = params.paymentId
    ? await tx.payments.findUnique({
        select: { doc_no: true },
        where: { id: params.paymentId },
      })
    : null
  const approvalDocNo = requireDocumentNo(approval.doc_no, `PMA ${approval.id}`)
  const nextSequence = await tx.payment_approval_status_logs.count({
    where: { payment_approval_id: params.paymentApprovalId },
  }) + 1

  await tx.payment_approval_status_logs.create({
    data: {
      action: params.action,
      approved_amount_snapshot: toNumber(approval.approved_amount),
      created_at: params.createdAt ?? new Date(),
      created_by: params.actor ?? null,
      event_key: `PMALOG-${approvalDocNo}-${String(nextSequence).padStart(4, '0')}`,
      from_status: params.fromStatus ?? null,
      ...(params.meta !== undefined ? { meta: params.meta } : {}),
      note: params.note ?? null,
      payment_approval_doc_no: approvalDocNo,
      payment_approval_id: params.paymentApprovalId,
      payment_doc_no: params.paymentDocNo ?? payment?.doc_no ?? null,
      payment_id: params.paymentId ?? null,
      source_doc_no_snapshot: approval.source_doc_no_snapshot,
      source_id: approval.source_id,
      source_type: approval.source_type,
      to_status: params.toStatus,
    },
  })
}

export async function appendPaymentStatusLog(
  tx: PaymentHistoryTx,
  params: {
    action: typeof PAYMENT_STATUS_ACTION[keyof typeof PAYMENT_STATUS_ACTION]
    actor?: string | null
    amountSnapshot?: number
    createdAt?: Date
    fromStatus?: string | null
    meta?: Prisma.InputJsonValue
    netAmountSnapshot?: number
    note?: string | null
    paymentDocNo?: string | null
    paymentId: bigint
    paymentVoucherId?: string | null
    toStatus: string
  },
) {
  const payment = await tx.payments.findUnique({
    include: {
      accounts: { select: { code: true } },
      suppliers: { select: { code: true } },
    },
    where: { id: params.paymentId },
  })
  if (!payment) throw new Error('ไม่พบ PMT สำหรับบันทึก timeline')

  const voucherKey = params.paymentVoucherId ?? payment.voucher_id ?? payment.doc_no
  const nextSequence = await tx.payment_status_logs.count({
    where: { payment_voucher_id: voucherKey },
  }) + 1

  await tx.payment_status_logs.create({
    data: {
      account_code_snapshot: payment.accounts?.code ?? null,
      account_id: payment.account_id ?? null,
      action: params.action,
      amount_snapshot: params.amountSnapshot ?? toNumber(payment.amount),
      created_at: params.createdAt ?? new Date(),
      created_by: params.actor ?? null,
      event_key: `PMTLOG-${voucherKey}-${String(nextSequence).padStart(4, '0')}`,
      from_status: params.fromStatus ?? null,
      ...(params.meta !== undefined ? { meta: params.meta } : {}),
      net_amount_snapshot: params.netAmountSnapshot ?? toNumber(payment.net_amount),
      note: params.note ?? null,
      payment_doc_no: params.paymentDocNo ?? payment.doc_no,
      payment_id: params.paymentId,
      payment_voucher_id: voucherKey,
      supplier_code_snapshot: payment.suppliers?.code ?? null,
      supplier_id: payment.supplier_id ?? null,
      to_status: params.toStatus,
    },
  })
}

export async function createPaymentAllocationFacts(
  tx: PaymentHistoryTx,
  entries: Array<{
    actor?: string | null
    allocatedAmount: number
    allocationKey?: string | null
    createdAt?: Date
    paymentApprovalDocNo: string
    paymentApprovalId: bigint
    paymentDocNo: string
    paymentId: bigint
    paymentVoucherId?: string | null
    sourceDocNoSnapshot?: string | null
    sourceType: string
    status?: 'active' | 'reversed'
  }>,
) {
  if (entries.length === 0) return

  await tx.payment_allocations.createMany({
    data: entries.map((entry) => ({
      allocated_amount: entry.allocatedAmount,
      allocation_key: entry.allocationKey ?? `PMTALLOC-${entry.paymentDocNo}-${entry.paymentApprovalDocNo}-${randomUUID()}`,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      payment_approval_doc_no: entry.paymentApprovalDocNo,
      payment_approval_id: entry.paymentApprovalId,
      payment_doc_no: entry.paymentDocNo,
      payment_id: entry.paymentId,
      payment_voucher_id: entry.paymentVoucherId ?? null,
      source_doc_no_snapshot: entry.sourceDocNoSnapshot ?? null,
      source_type: entry.sourceType,
      status: entry.status ?? 'active',
    })),
  })
}

export async function createPaymentAccountSplitFacts(
  tx: PaymentHistoryTx,
  entries: Array<{
    accountCodeSnapshot?: string | null
    accountId: bigint
    accountNameSnapshot?: string | null
    actor?: string | null
    amount: number
    bankStatementDocNo?: string | null
    bankStatementId?: bigint | null
    createdAt?: Date
    paymentDocNo: string
    paymentId: bigint
    paymentVoucherId?: string | null
    splitKey?: string | null
    status?: 'active' | 'reversed'
  }>,
) {
  if (entries.length === 0) return

  await tx.payment_account_splits.createMany({
    data: entries.map((entry) => ({
      account_code_snapshot: entry.accountCodeSnapshot ?? null,
      account_id: entry.accountId,
      account_name_snapshot: entry.accountNameSnapshot ?? null,
      amount: entry.amount,
      bank_statement_doc_no: entry.bankStatementDocNo ?? null,
      bank_statement_id: entry.bankStatementId ?? null,
      created_at: entry.createdAt ?? new Date(),
      created_by: entry.actor ?? null,
      payment_doc_no: entry.paymentDocNo,
      payment_id: entry.paymentId,
      payment_voucher_id: entry.paymentVoucherId ?? null,
      split_key: entry.splitKey ?? `PMTSPLIT-${entry.paymentDocNo}-${entry.accountId}-${randomUUID()}`,
      status: entry.status ?? 'active',
    })),
  })
}
