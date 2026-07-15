import { buildBillLineFlexMessage, type BillLineFlexData } from './bill-line-flex'
import { getPurchaseBillDetail, type PurchaseBillDetail } from './purchase-bill-detail'
import { prisma } from './prisma'
import { getSalesBillDetail, type SalesBillDetail } from './sales-bill-detail'
import { sendLinePush } from './weight-ticket-line-notification'

export type BillLineNotificationSourceType = 'purchase_bill' | 'sales_bill'

type LoadedPurchaseBill = {
  detail: PurchaseBillDetail
  documentType: 'PB'
  id: bigint
  routingDocument: Record<string, unknown>
  sourceType: 'purchase_bill'
}

type LoadedSalesBill = {
  detail: SalesBillDetail
  documentType: 'SB'
  id: bigint
  routingDocument: Record<string, unknown>
  sourceType: 'sales_bill'
}

export type LoadedBillLineNotificationSource = LoadedPurchaseBill | LoadedSalesBill

export async function loadBillLineNotificationSource(
  sourceType: BillLineNotificationSourceType,
  documentNo: string,
): Promise<LoadedBillLineNotificationSource | null> {
  if (sourceType === 'purchase_bill') {
    const [row, detail] = await Promise.all([
      prisma.purchase_bills.findUnique({
        select: { id: true, supplier_id: true, warehouse_id: true },
        where: { doc_no: documentNo },
      }),
      getPurchaseBillDetail(documentNo),
    ])
    if (!row || !detail) return null

    return {
      detail,
      documentType: 'PB',
      id: row.id,
      routingDocument: {
        branchId: detail.branchId,
        lines: detail.productSummaries.map((item) => ({
          productId: item.productId,
          warehouseId: row.warehouse_id == null ? undefined : String(row.warehouse_id),
        })),
        partyId: row.supplier_id == null ? detail.supplierCode : String(row.supplier_id),
        supplierId: row.supplier_id == null ? detail.supplierCode : String(row.supplier_id),
        totals: { netWeight: detail.productSummaries.reduce((sum, item) => sum + item.qty, 0) },
        type: 'PB',
      },
      sourceType,
    }
  }

  const [row, detail] = await Promise.all([
    prisma.sales_bills.findUnique({
      select: { customer_id: true, id: true, warehouse_id: true },
      where: { doc_no: documentNo },
    }),
    getSalesBillDetail(documentNo),
  ])
  if (!row || !detail) return null

  return {
    detail,
    documentType: 'SB',
    id: row.id,
    routingDocument: {
      branchId: detail.branchId,
      customerId: row.customer_id == null ? detail.customerCode : String(row.customer_id),
      lines: detail.items.map((item) => ({
        productId: item.productId,
        warehouseId: row.warehouse_id == null ? undefined : String(row.warehouse_id),
      })),
      partyId: row.customer_id == null ? detail.customerCode : String(row.customer_id),
      totals: { netWeight: detail.items.reduce((sum, item) => sum + item.qty, 0) },
      type: 'SB',
    },
    sourceType,
  }
}

function flexData(loaded: LoadedBillLineNotificationSource): BillLineFlexData {
  if (loaded.sourceType === 'purchase_bill') {
    return {
      balance: loaded.detail.payableBalance,
      branchName: loaded.detail.branchName,
      channelName: '',
      date: loaded.detail.date,
      documentNo: loaded.detail.docNo,
      items: loaded.detail.productSummaries.map((item) => ({
        productName: item.productName,
        qty: item.qty,
        unit: item.unit,
      })),
      partyName: loaded.detail.supplierName,
      salesName: loaded.detail.salesName,
      settledAmount: Math.max(
        loaded.detail.paidAmount,
        loaded.detail.totalAmount - loaded.detail.payableBalance,
      ),
      sourceType: loaded.sourceType,
      totalAmount: loaded.detail.totalAmount,
      warehouseName: loaded.detail.warehouseName,
    }
  }

  return {
    balance: loaded.detail.receivableBalance,
    branchName: loaded.detail.branchName,
    channelName: loaded.detail.channelName,
    date: loaded.detail.date,
    documentNo: loaded.detail.docNo,
    items: loaded.detail.items.map((item) => ({
      productName: item.productName,
      qty: item.qty,
      unit: item.unit,
    })),
    partyName: loaded.detail.customerName,
    salesName: loaded.detail.salesName,
    settledAmount: Math.max(
      loaded.detail.receivedAmount,
      loaded.detail.totalAmount - loaded.detail.receivableBalance,
    ),
    sourceType: loaded.sourceType,
    totalAmount: loaded.detail.totalAmount,
    warehouseName: loaded.detail.warehouseName,
  }
}

function detailUrl(origin: string, loaded: LoadedBillLineNotificationSource) {
  const path = loaded.sourceType === 'purchase_bill' ? '/purchase/bills/' : '/sales/bills/'
  return `${origin.replace(/\/+$/, '')}${path}${encodeURIComponent(loaded.detail.docNo)}`
}

async function lineChannelAccessToken() {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
  })
  return setting?.value || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
}

export type NotifyBillLineResult = {
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

export async function notifyBillLine(
  sourceType: BillLineNotificationSourceType,
  documentNo: string,
  options: {
    customMessage?: string
    origin: string
    retryKey?: string
    targetId: string
  },
): Promise<NotifyBillLineResult> {
  const loaded = await loadBillLineNotificationSource(sourceType, documentNo)
  if (!loaded) {
    return { status: 404, error: `ไม่พบเอกสาร ${documentNo}` }
  }

  const token = await lineChannelAccessToken()
  const flexMessage = buildBillLineFlexMessage(flexData(loaded), detailUrl(options.origin, loaded))
  const customMessage = options.customMessage?.trim()
  const messages = customMessage
    ? [{ type: 'text', text: customMessage.slice(0, 5_000) }, flexMessage]
    : [flexMessage]
  const pushResult = await sendLinePush(
    options.targetId,
    messages,
    token,
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
