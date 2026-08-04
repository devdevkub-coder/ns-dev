import type { Prisma } from '../../../generated/prisma/client'
import { toDateOnly } from '@/lib/server/daily'

function normalizeBranchCode(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  const digits = trimmed.replace(/\D/g, '')
  const normalized = digits ? digits.padStart(2, '0').slice(-2) : ''
  if (!normalized) throw new Error('ไม่พบรหัสสาขาสำหรับออกเลข PMA')
  return normalized
}

export async function nextPaymentApprovalDocNos(
  tx: Prisma.TransactionClient,
  documentDate: Date,
  branchCode: string,
  count: number,
) {
  if (count <= 0) return []
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
  return Array.from({ length: count }, (_, index) => `${startsWith}${String(lastNumber + 1 + index).padStart(4, '0')}`)
}

export async function nextPaymentApprovalDocNo(
  tx: Prisma.TransactionClient,
  documentDate: Date,
  branchCode: string,
) {
  const [docNo] = await nextPaymentApprovalDocNos(tx, documentDate, branchCode, 1)
  if (!docNo) throw new Error('ออกเลข PMA ไม่ได้')
  return docNo
}

type PaymentApprovalSourceType = 'advance_payment' | 'expense' | 'purchase_bill'

const LOCKED_PAYMENT_APPROVAL_STATUSES = ['approved', 'paid'] as const

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
