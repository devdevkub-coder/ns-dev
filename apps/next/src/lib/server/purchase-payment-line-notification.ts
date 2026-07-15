import {
  buildPurchasePaymentLineFlexMessage,
  type PurchasePaymentLineFlexData,
} from './purchase-payment-line-flex'
import { prisma } from './prisma'
import { sendLinePush } from './weight-ticket-line-notification'

export type LoadedPurchasePaymentLineNotificationSource = {
  data: PurchasePaymentLineFlexData
  documentType: 'PMT'
  id: bigint
  routingDocument: {
    branchId: string
    partyId: string
    supplierId: string
    type: 'PMT'
  }
}

function toNumber(value: { toNumber: () => number } | number | null | undefined) {
  if (value == null) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

export async function loadPurchasePaymentLineNotificationSource(
  documentNo: string,
): Promise<LoadedPurchasePaymentLineNotificationSource | null> {
  const payments = await prisma.payments.findMany({
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    select: {
      amount: true,
      bank_fee: true,
      branches: { select: { code: true, name: true } },
      date: true,
      discount: true,
      fee: true,
      id: true,
      method: true,
      net_amount: true,
      notes: true,
      status: true,
      suppliers: { select: { code: true, name: true } },
      voucher_id: true,
      withholding_tax: true,
    },
    where: { doc_no: documentNo },
  })
  if (payments.length === 0) return null

  const first = payments[0]!
  const voucherIds = new Set(payments.flatMap((payment) => {
    const voucherId = payment.voucher_id?.trim()
    return voucherId ? [voucherId] : []
  }))
  if (voucherIds.size > 1) {
    throw new Error(`PMT ${documentNo} ต้องผูกกับ Payment Voucher เดียว`)
  }
  const voucherId = first.voucher_id?.trim() || documentNo

  const [allocations, accountSplits] = await Promise.all([
    prisma.payment_allocations.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        allocated_amount: true,
        payment_approval_doc_no: true,
        payment_approvals: {
          select: {
            destination_account_no_snapshot: true,
            destination_bank_name_snapshot: true,
            destination_payment_method_snapshot: true,
            party_id: true,
            party_name_snapshot: true,
            source_doc_no_snapshot: true,
            source_type: true,
          },
        },
        source_doc_no_snapshot: true,
        source_type: true,
      },
      where: {
        OR: [{ payment_voucher_id: voucherId }, { payment_doc_no: documentNo }],
        status: 'active',
      },
    }),
    prisma.payment_account_splits.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        account_code_snapshot: true,
        account_name_snapshot: true,
        accounts: { select: { code: true, name: true } },
        amount: true,
      },
      where: {
        OR: [{ payment_voucher_id: voucherId }, { payment_doc_no: documentNo }],
        status: 'active',
      },
    }),
  ])

  const approval = allocations[0]?.payment_approvals
  const partyId = approval?.party_id?.trim() || first.suppliers?.code || ''

  return {
    data: {
      approvals: allocations.map((allocation) => ({
        amount: toNumber(allocation.allocated_amount),
        approvalNo: allocation.payment_approval_doc_no,
        sourceDocumentNo: allocation.source_doc_no_snapshot
          ?? allocation.payment_approvals.source_doc_no_snapshot
          ?? '-',
        sourceType: allocation.source_type || allocation.payment_approvals.source_type,
      })),
      branchName: first.branches?.name ?? first.branches?.code ?? '-',
      companyAccounts: accountSplits.map((split) => ({
        accountCode: split.account_code_snapshot ?? split.accounts?.code ?? undefined,
        accountName: split.account_name_snapshot ?? split.accounts?.name ?? '-',
        amount: toNumber(split.amount),
      })),
      date: first.date.toISOString(),
      destinationAccountNo: approval?.destination_account_no_snapshot ?? undefined,
      destinationBankName: approval?.destination_bank_name_snapshot ?? undefined,
      discount: payments.reduce((sum, payment) => sum + toNumber(payment.discount), 0),
      documentNo,
      fee: payments.reduce(
        (sum, payment) => sum + toNumber(payment.fee ?? payment.bank_fee),
        0,
      ),
      netCashOut: payments.reduce((sum, payment) => sum + toNumber(payment.net_amount), 0),
      notes: payments.find((payment) => payment.notes?.trim())?.notes ?? undefined,
      paidAmount: payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0),
      payeeName: approval?.party_name_snapshot?.trim() || first.suppliers?.name || '-',
      paymentMethod: approval?.destination_payment_method_snapshot?.trim() || first.method || '-',
      status: payments.some((payment) => payment.status === 'cancelled')
        ? 'cancelled'
        : first.status ?? 'active',
      withholdingTax: payments.reduce(
        (sum, payment) => sum + toNumber(payment.withholding_tax),
        0,
      ),
    },
    documentType: 'PMT',
    id: first.id,
    routingDocument: {
      branchId: first.branches?.code ?? '',
      partyId,
      supplierId: first.suppliers?.code ?? '',
      type: 'PMT',
    },
  }
}

async function lineChannelAccessToken() {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
  })
  return setting?.value || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
}

export type NotifyPurchasePaymentLineResult = {
  error?: string
  lineRequestId?: string | null
  pdfUrl?: string
  sentResults?: Array<{
    lineRequestId?: string
    status: 'sent' | 'skipped'
    targetId: string
  }>
  status: number
}

export async function notifyPurchasePaymentLine(
  documentNo: string,
  options: {
    customMessage?: string
    origin: string
    retryKey?: string
    targetId: string
  },
): Promise<NotifyPurchasePaymentLineResult> {
  const loaded = await loadPurchasePaymentLineNotificationSource(documentNo)
  if (!loaded) return { status: 404, error: `ไม่พบเอกสาร ${documentNo}` }

  const detailUrl = new URL('/purchase/payments?tab=history', options.origin).toString()
  const flexMessage = buildPurchasePaymentLineFlexMessage(loaded.data, detailUrl)
  const customMessage = options.customMessage?.trim()
  const messages = customMessage
    ? [{ type: 'text', text: customMessage.slice(0, 5_000) }, flexMessage]
    : [flexMessage]
  const pushResult = await sendLinePush(
    options.targetId,
    messages,
    await lineChannelAccessToken(),
    options.retryKey,
    AbortSignal.timeout(10_000),
  )
  const status = pushResult.isConflict ? 409 : 200

  return {
    lineRequestId: pushResult.lineRequestId,
    pdfUrl: undefined,
    sentResults: [{
      lineRequestId: pushResult.lineRequestId || undefined,
      status: pushResult.isConflict ? 'skipped' : 'sent',
      targetId: options.targetId,
    }],
    status,
  }
}
