import {
  buildCustomerReceiptLineFlexMessage,
  type CustomerReceiptLineFlexData,
} from './customer-receipt-line-flex'
import { prisma } from './prisma'
import { sendLinePush } from './weight-ticket-line-notification'

export type LoadedCustomerReceiptLineNotificationSource = {
  data: CustomerReceiptLineFlexData
  documentType: 'RCP'
  id: bigint
  routingDocument: {
    branchId: string
    customerId: string
    partyId: string
    type: 'RCP'
  }
}

function toNumber(value: { toNumber: () => number } | number | null | undefined) {
  if (value == null) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

export async function loadCustomerReceiptLineNotificationSource(
  documentNo: string,
): Promise<LoadedCustomerReceiptLineNotificationSource | null> {
  const receipt = await prisma.customer_receipts.findUnique({
    where: { doc_no: documentNo },
    select: {
      account_code_snapshot: true,
      account_name_snapshot: true,
      bank_fee_total: true,
      branches: { select: { code: true, name: true } },
      customer_code_snapshot: true,
      customer_name_snapshot: true,
      customer_receipt_allocations: {
        orderBy: { line_no: 'asc' },
        where: { status: 'active' },
        select: {
          allocated_ar_amount: true,
          discount_amount: true,
          receipt_amount: true,
          sales_bill_doc_no_snapshot: true,
          withholding_tax_amount: true,
        },
      },
      date: true,
      discount_total: true,
      doc_no: true,
      gross_amount: true,
      id: true,
      net_cash_in: true,
      notes: true,
      payment_method_name_snapshot: true,
      status: true,
      withholding_tax_total: true,
    },
  })
  if (!receipt || receipt.status !== 'active') return null

  const statements = await prisma.bank_statement.findMany({
    where: {
      amount_in: { gt: 0 },
      ref_id: String(receipt.id),
      ref_type: 'RCP',
    },
    orderBy: [{ doc_no: 'asc' }, { id: 'asc' }],
    select: {
      accounts: { select: { code: true, name: true } },
      amount_in: true,
    },
  })
  const companyAccounts = statements.length > 0
    ? statements.map((statement) => ({
      accountCode: statement.accounts?.code ?? undefined,
      accountName: statement.accounts?.name ?? '-',
      amount: toNumber(statement.amount_in),
    }))
    : [{
      accountCode: receipt.account_code_snapshot,
      accountName: receipt.account_name_snapshot,
      amount: toNumber(receipt.net_cash_in),
    }]

  return {
    data: {
      allocations: receipt.customer_receipt_allocations.map((allocation) => ({
        allocatedArAmount: toNumber(allocation.allocated_ar_amount),
        discount: toNumber(allocation.discount_amount),
        receiptAmount: toNumber(allocation.receipt_amount),
        salesBillDocumentNo: allocation.sales_bill_doc_no_snapshot,
        withholdingTax: toNumber(allocation.withholding_tax_amount),
      })),
      branchName: receipt.branches?.name ?? '-',
      companyAccounts,
      customerName: receipt.customer_name_snapshot,
      date: receipt.date.toISOString(),
      discount: toNumber(receipt.discount_total),
      documentNo: receipt.doc_no,
      fee: toNumber(receipt.bank_fee_total),
      netCashIn: toNumber(receipt.net_cash_in),
      notes: receipt.notes ?? undefined,
      paymentMethod: receipt.payment_method_name_snapshot,
      receivedAmount: toNumber(receipt.gross_amount),
      status: receipt.status,
      withholdingTax: toNumber(receipt.withholding_tax_total),
    },
    documentType: 'RCP',
    id: receipt.id,
    routingDocument: {
      branchId: receipt.branches?.code ?? '',
      customerId: receipt.customer_code_snapshot,
      partyId: receipt.customer_code_snapshot,
      type: 'RCP',
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

export type NotifyCustomerReceiptLineResult = {
  error?: string
  lineRequestId?: string | null
  sentResults?: Array<{
    lineRequestId?: string
    status: 'sent' | 'skipped'
    targetId: string
  }>
  status: number
}

export async function notifyCustomerReceiptLine(
  documentNo: string,
  options: {
    customMessage?: string
    origin: string
    retryKey?: string
    targetId: string
  },
): Promise<NotifyCustomerReceiptLineResult> {
  const loaded = await loadCustomerReceiptLineNotificationSource(documentNo)
  if (!loaded) return { status: 404, error: `ไม่พบเอกสาร ${documentNo}` }

  const detailUrl = new URL('/sales/receipts?tab=history', options.origin).toString()
  const flexMessage = buildCustomerReceiptLineFlexMessage(loaded.data, detailUrl)
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
    sentResults: [{
      lineRequestId: pushResult.lineRequestId || undefined,
      status: pushResult.isConflict ? 'skipped' : 'sent',
      targetId: options.targetId,
    }],
    status,
  }
}
