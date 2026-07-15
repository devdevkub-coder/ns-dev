import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { XLSX } from '@/lib/server/xlsx'
import { parseInternalBigIntId, requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { purchaseBillCancelSchema, purchaseBillFormSchema, type PurchaseBillFormValues } from '@/lib/purchase-bill'
import {
  PURCHASE_BILL_CANCELLED_STATUSES,
  PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS,
  isPurchaseBillCancelledStatus,
} from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import {
  appendSupplierAdvanceAllocationLogs,
  SUPPLIER_ADVANCE_ALLOCATION_ACTION,
  SUPPLIER_ADVANCE_STATUS_ACTION,
} from '@/lib/server/advance-payment-history'
import { summarizeAdvancePaymentApprovalStatus } from '@/lib/server/advance-payments'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { appendPoBuyAllocationLogs, PO_BUY_ALLOCATION_ACTION, PO_BUY_STATUS, reconcilePoBuys } from '@/lib/server/po-buy-reconciliation'
import { isSupplierEligibleForBranch } from '@/lib/server/party-branch-eligibility'
import { appendPurchaseBillStatusLog, createInitialPurchaseBillStatusLog, PURCHASE_BILL_STATUS_ACTION } from '@/lib/server/purchase-bill-history'
import { syncPurchaseBillCostPoolEntries } from '@/lib/server/purchase-cost-pool'
import { prisma } from '@/lib/server/prisma'
import { refreshPurchaseBillSettlement, refreshSupplierAdvancePaymentAllocation } from '@/lib/server/purchase-bill-settlement'
import { enqueueAndExecuteNotification } from '@/lib/server/line-notification-jobs'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { appendPurchaseBillStockReversal } from '@/lib/server/stock-ledger-reversal'
import { activeVatRatePercent } from '@/lib/server/tax-settings'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION, type WeightTicketUsageAction } from '@/lib/server/weight-ticket-usage-history'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type PurchaseBillRow = Prisma.purchase_billsGetPayload<{
  include: {
    branches: true
    purchase_bill_items: true
    supplier_advance_allocations: {
      include: {
        supplier_advance_payments: {
          select: {
            doc_no: true
            id: true
          }
        }
      }
    }
    suppliers: true
    warehouses: true
  }
}>

const weightTicketOptionSelect = {
  branch_id: true,
  branches: true,
  cancelled_at: true,
  deduct_weight: true,
  doc_no: true,
  doc_type: true,
  document_date: true,
  gross_weight: true,
  id: true,
  net_weight: true,
  party_name: true,
  status: true,
  supplier_id: true,
  suppliers: true,
  vehicle_no: true,
  weight_ticket_product_summaries: {
    include: {
      weight_ticket_product_summary_lines: true,
    },
    orderBy: {
      product_name: 'asc',
    },
  },
  weight_ticket_lines: {
    orderBy: {
      line_no: 'asc',
    },
  },
} as const

type WeightTicketOptionRow = Prisma.weight_ticketsGetPayload<{
  select: typeof weightTicketOptionSelect
}>

type BillQuery = {
  branchId?: string
  dateFrom?: string
  dateTo?: string
  filterMode?: string
  filterSource?: string
  page: number
  pageSize: number
  search?: string
  sortDirection: Prisma.SortOrder
  sortKey: string
  statuses?: string[]
}

type PurchasePaymentWorkflowStatus =
  | 'pending_approval'
  | 'pending_payment'
  | 'partial_paid'
  | 'paid'
  | 'cancelled'
  | typeof PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS

const LOCKED_PURCHASE_PAYMENT_APPROVAL_STATUSES = ['approved', 'paid'] as const
const PURCHASE_BILL_ACTIVE_ITEM_STATUS = 'active'
const PURCHASE_BILL_SUPERSEDED_ITEM_STATUS = 'superseded'
const PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS = 'active'
const PURCHASE_BILL_RELEASED_ALLOCATION_STATUS = 'released'

type ProductRefRow = {
  code: string
  id: bigint
  name: string
  unit: string | null
}

type PurchaseBillWarehouseRefRow = {
  active: boolean | null
  branch_id: bigint | null
  code: string
  id: bigint
  name: string
  type: string | null
}

type SupplierBranchMappingRow = {
  branch_code: string | null
  supplier_id: bigint
}

type PoBuyRefRow = {
  doc_no: string
  id: bigint
  items: Prisma.JsonValue | null
  product_id: bigint | null
  remaining_amount: Prisma.Decimal | null
  remaining_qty: Prisma.Decimal | null
  status: string | null
  supplier_id: bigint | null
  unit_price: Prisma.Decimal | null
}

type ReceiptSummarySource = {
  deduct_weight: Prisma.Decimal | null
  gross_weight: Prisma.Decimal | null
  id: bigint
  net_weight: Prisma.Decimal | null
  weight_ticket_id: bigint
}

function branchBillCode(branchCode: string | null | undefined) {
  const digits = String(branchCode ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(2, '0').slice(-2) : null
}

function bangkokDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(value)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

async function resolveProductsByCodeOrId(productRefs: string[]) {
  const uniqueRefs = [...new Set(productRefs.filter(Boolean))]
  if (uniqueRefs.length === 0) return []
  const bigintIds = uniqueRefs.map((ref) => parseInternalBigIntId(ref)).filter((value): value is bigint => value != null)
  return prisma.products.findMany({
    select: { code: true, id: true, name: true, unit: true },
    where: {
      active: true,
      OR: [
        { code: { in: uniqueRefs } },
        ...(bigintIds.length > 0 ? [{ id: { in: bigintIds } }] : []),
      ],
    },
  })
}

async function resolvePoBuysByDocNo(poRefs: string[]) {
  const uniqueRefs = [...new Set(poRefs.filter(Boolean))]
  if (uniqueRefs.length === 0) return []
  return prisma.po_buys.findMany({
    where: {
      doc_no: { in: uniqueRefs },
    },
  })
}

async function resolvePurchaseBillByDocNoOrId(idOrDocNo: string) {
  const internalId = parseInternalBigIntId(idOrDocNo)
  return prisma.purchase_bills.findFirst({
    where: {
      OR: [
        { doc_no: idOrDocNo },
        ...(internalId != null ? [{ id: internalId }] : []),
      ],
    },
  })
}

function createProductRefMap(products: ProductRefRow[]) {
  const map = new Map<string, ProductRefRow>()
  products.forEach((product) => {
    map.set(product.code, product)
  })
  return map
}

function createPoBuyRefMap(poBuys: PoBuyRefRow[]) {
  const map = new Map<string, PoBuyRefRow>()
  poBuys.forEach((po) => {
    map.set(po.doc_no, po)
  })
  return map
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function poBuyItemRows(poBuy: PoBuyRefRow) {
  return Array.isArray(poBuy.items)
    ? (poBuy.items as unknown[]).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : []
}

function poBuyItemProductId(poBuy: PoBuyRefRow, item: Record<string, unknown>) {
  const rawInternalId = item.productIdInternal
  const productId = parseInternalBigIntId(
    typeof rawInternalId === 'number'
      ? BigInt(rawInternalId)
      : typeof rawInternalId === 'string' || typeof rawInternalId === 'bigint'
        ? rawInternalId
        : null,
  )
  if (!productId) {
    throw new Error(`PO Buy ${poBuy.doc_no} มีรายการสินค้าที่ไม่มี productIdInternal สำหรับตัดบิลรับซื้อ`)
  }
  return productId
}

function poBuyRemainingQtyForProduct(poBuy: PoBuyRefRow, productId: bigint) {
  const items = poBuyItemRows(poBuy)
  if (items.length === 0) {
    return poBuy.product_id === productId ? toNumber(poBuy.remaining_qty) : 0
  }
  return items.reduce((sum, item) => poBuyItemProductId(poBuy, item) === productId
    ? sum + jsonNumber(item.remainingQty)
    : sum, 0)
}

function poBuyIncludesProduct(poBuy: PoBuyRefRow, productId: bigint) {
  const items = poBuyItemRows(poBuy)
  if (items.length === 0) {
    return poBuy.product_id === productId
  }
  return items.some((item) => poBuyItemProductId(poBuy, item) === productId)
}

function poBuyUnitPriceForProduct(poBuy: PoBuyRefRow, productId: bigint) {
  const items = poBuyItemRows(poBuy)
  const item = items.find((row) => poBuyItemProductId(poBuy, row) === productId)
  return item ? jsonNumber(item.unitPrice ?? poBuy.unit_price) : toNumber(poBuy.unit_price)
}

function remainingPoBuyProductItems(poBuy: PoBuyRefRow) {
  const items = poBuyItemRows(poBuy)
  if (items.length === 0) {
    return poBuy.product_id != null && toNumber(poBuy.remaining_qty) > 0.0001
      ? [{ productId: poBuy.product_id, remainingQty: toNumber(poBuy.remaining_qty), unitPrice: toNumber(poBuy.unit_price) }]
      : []
  }
  const byProduct = new Map<string, { productId: bigint; remainingQty: number; unitPrice: number }>()
  for (const item of items) {
    const remainingQty = jsonNumber(item.remainingQty)
    if (remainingQty <= 0.0001) continue
    const productId = poBuyItemProductId(poBuy, item)
    const key = productId.toString()
    const existing = byProduct.get(key)
    if (existing) {
      existing.remainingQty += remainingQty
    } else {
      byProduct.set(key, {
        productId,
        remainingQty,
        unitPrice: jsonNumber(item.unitPrice ?? poBuy.unit_price),
      })
    }
  }
  return [...byProduct.values()]
}

function billItemJson(row: PurchaseBillRow['purchase_bill_items'][number]) {
  const snapshot = row.source_snapshot && typeof row.source_snapshot === 'object'
    ? row.source_snapshot as Record<string, unknown>
    : {}
  return {
    amount: toNumber(row.amount),
    deductWeight: toNumber(row.deduct_weight),
    discount: toNumber(row.discount),
    displayName: row.display_name,
    grossWeight: toNumber(row.gross_weight),
    lotNo: row.lot_no,
    note: row.note,
    poBuyId: typeof snapshot.poBuyId === 'string' ? snapshot.poBuyId : '',
    price: toNumber(row.price),
    productCode: row.product_code ?? '',
    productId: typeof snapshot.productId === 'string' ? snapshot.productId : (row.product_code ?? ''),
    productName: row.product_name ?? '-',
    qty: toNumber(row.qty),
    receiptLineId: typeof snapshot.receiptLineId === 'string' ? snapshot.receiptLineId : null,
    receiptLineIds: Array.isArray(snapshot.receiptLineIds)
      ? snapshot.receiptLineIds.filter((value): value is string => typeof value === 'string')
      : [],
    receiptSummaryId: typeof snapshot.receiptSummaryId === 'string' ? snapshot.receiptSummaryId : null,
    receiptTicketDocNo: typeof snapshot.receiptTicketDocNo === 'string' ? snapshot.receiptTicketDocNo : null,
    receiptTicketId: typeof snapshot.receiptTicketId === 'string' ? snapshot.receiptTicketId : null,
    salesPrice: toNumber(row.sales_price),
    unit: row.unit ?? 'กก.',
  }
}

function billItemsJson(row: PurchaseBillRow) {
  return row.purchase_bill_items.map(billItemJson)
}

function billJson(row: PurchaseBillRow, paymentDocNos: string[] = []) {
  const items = billItemsJson(row)
  const receiptDocNos = [...new Set(items
    .map((item) => item.receiptTicketDocNo)
    .filter((value): value is string => Boolean(value)))]
  const activeAdvanceAllocation = row.supplier_advance_allocations.find((allocation) => allocation.status === 'active') ?? null
  return {
    advanceAllocatedAmount: activeAdvanceAllocation ? toNumber(activeAdvanceAllocation.allocated_total_amount ?? activeAdvanceAllocation.allocated_amount) : 0,
    advanceConsumedAmount: activeAdvanceAllocation ? toNumber(activeAdvanceAllocation.allocated_amount) : 0,
    advancePaymentDocNo: activeAdvanceAllocation?.supplier_advance_payments?.doc_no ?? '',
    advancePaymentId: activeAdvanceAllocation?.supplier_advance_payments?.doc_no ?? '',
    branchId: row.branches?.code ?? '',
    branchName: row.branches?.name ?? '-',
    createdAt: row.date?.toISOString() ?? '',
    createdBy: row.created_by ?? '-',
    date: row.date ? toDateOnly(row.date) : '',
    discountTotal: toNumber(row.discount_total ?? row.discount),
    docNo: row.doc_no,
    hasVat: row.has_vat ?? false,
    id: row.doc_no,
    items,
    itemCount: items.length,
    note: row.note ?? row.notes ?? '',
    paidAmount: toNumber(row.paid_amount),
    paymentDocNos,
    payableBalance: toNumber(row.payable_balance),
    poBuyId: items[0]?.poBuyId ?? '',
    purchaseSource: row.purchase_source ?? 'SPOT_BUY',
    receiptDocNos,
    refNo: row.ref_no ?? '',
    salesId: stringifyBusinessValue(row.sales_id),
    status: row.status ?? 'unpaid',
    supplierId: row.suppliers?.code ?? '',
    supplierName: row.supplier_name_snapshot ?? '-',
    totalAmount: toNumber(row.total_amount),
    transactionMode: row.transaction_mode ?? 'STOCK',
    updatedAt: row.updated_at?.toISOString() ?? '',
    updatedBy: row.updated_by ?? '',
    vatInvoiceNo: row.vat_invoice_no ?? '',
    vatInvoiceDate: row.vat_invoice_date ? toDateOnly(row.vat_invoice_date) : '',
    vatInvoiceReceived: row.vat_invoice_received ?? false,
    vatRatePercent: toNumber(row.vat_rate_percent) ?? 7,
    warehouseId: row.warehouses?.code ?? '',
    warehouseName: row.warehouses?.name ?? '-',
  }
}

function calculateTotals(values: PurchaseBillFormValues, vatRatePercent: number) {
  const subtotal = values.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const afterDiscount = Math.max(0, subtotal - values.discountTotal)
  const rate = Math.max(0, Math.min(100, vatRatePercent))
  const vatAmount = !values.hasVat || values.vatType === 'NONE'
    ? 0
    : values.vatType === 'INCLUDE'
      ? afterDiscount * rate / (100 + rate)
      : afterDiscount * (rate / 100)
  const totalAmount = values.hasVat && values.vatType === 'EXCLUDE' ? afterDiscount + vatAmount : afterDiscount
  const taxableBaseAmount = values.hasVat && values.vatType === 'INCLUDE' ? Math.max(0, afterDiscount - vatAmount) : afterDiscount

  return { afterDiscount, subtotal, taxableBaseAmount, totalAmount, vatAmount }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function buildBillItems(
  values: PurchaseBillFormValues,
  productByRef: Map<string, ProductRefRow>,
  poBuyByRef: Map<string, PoBuyRefRow>,
  receiptSummarySourceMap: Map<string, ReceiptSummarySource> = new Map(),
) {
  return values.items.map((item) => {
    const product = productByRef.get(item.productId)
    const poBuy = item.poBuyId ? poBuyByRef.get(item.poBuyId) : null
    const price = poBuy && product ? poBuyUnitPriceForProduct(poBuy, product.id) : item.price
    const amount = Math.max(0, item.qty * price - item.discount)
    const receiptSummary = item.receiptSummaryId ? receiptSummarySourceMap.get(item.receiptSummaryId) : null
    const receiptSummaryNetWeight = receiptSummary ? toNumber(receiptSummary.net_weight) : 0
    const receiptRatio = receiptSummary && receiptSummaryNetWeight > 0 ? item.qty / receiptSummaryNetWeight : 0
    const grossWeight = receiptSummary && receiptRatio > 0
      ? toNumber(receiptSummary.gross_weight) * receiptRatio
      : item.grossWeight
    const deductWeight = receiptSummary && receiptRatio > 0
      ? toNumber(receiptSummary.deduct_weight) * receiptRatio
      : item.deductWeight
    return {
      amount,
      deductWeight,
      discount: item.discount,
      displayName: item.displayName,
      grossWeight,
      itemStatus: 'RM',
      lotNo: item.lotNo,
      note: item.note,
      poBuyId: item.poBuyId,
      poBuyIdInternal: poBuy?.id ?? null,
      price,
      productCode: product?.code ?? '',
      productId: item.productId,
      productIdInternal: product?.id ?? null,
      productName: product?.name ?? item.displayName ?? '-',
      qty: item.qty,
      receiptLineId: item.receiptLineId,
      receiptLineIds: item.receiptLineIds,
      receiptSummaryId: item.receiptSummaryId,
      receiptTicketDocNo: item.receiptTicketDocNo,
      receiptTicketId: item.receiptTicketId,
      salesPrice: item.salesPrice,
      unit: product?.unit ?? 'กก.',
    }
  })
}

async function createPurchaseBillItems(
  tx: Prisma.TransactionClient,
  billId: bigint,
  items: ReturnType<typeof buildBillItems>,
  itemVersion = 1,
) {
  const itemRows = []
  for (const [index, item] of items.entries()) {
    const created = await tx.purchase_bill_items.create({
      data: {
        amount: item.amount,
        deduct_weight: item.deductWeight,
        discount: item.discount,
        display_name: item.displayName,
        gross_weight: item.grossWeight,
        item_status: PURCHASE_BILL_ACTIVE_ITEM_STATUS,
        item_version: itemVersion,
        line_no: index + 1,
        lot_no: item.lotNo,
        note: item.note,
        po_buy_id: item.poBuyIdInternal,
        price: item.price,
        product_code: item.productCode,
        product_id: item.productIdInternal,
        product_name: item.productName,
        purchase_bill_id: billId,
        qty: item.qty,
        sales_price: item.salesPrice,
        source_snapshot: {
          grossWeight: item.grossWeight,
          itemStatus: item.itemStatus,
          itemVersion,
          poBuyId: item.poBuyId,
          productId: item.productId,
          productName: item.productName,
          qty: item.qty,
          receiptLineId: item.receiptLineId ?? null,
          receiptLineIds: item.receiptLineIds ?? [],
          receiptSummaryId: item.receiptSummaryId ?? null,
          receiptTicketDocNo: item.receiptTicketDocNo ?? null,
          receiptTicketId: item.receiptTicketId ?? null,
        } as Prisma.InputJsonValue,
        unit: item.unit,
      },
    })
    itemRows.push(created)
  }
  return itemRows
}

async function nextPurchaseBillItemVersion(tx: Prisma.TransactionClient, billId: bigint) {
  const current = await tx.purchase_bill_items.aggregate({
    _max: { item_version: true },
    where: { purchase_bill_id: billId },
  })
  return (current._max.item_version ?? 0) + 1
}

async function releasePurchaseBillAllocations(
  tx: Prisma.TransactionClient,
  billId: bigint,
  params: {
    actor: string
    releasedAt: Date
    reason: string
  },
) {
  await Promise.all([
    tx.purchase_bill_receipt_allocations.updateMany({
      data: {
        allocation_status: PURCHASE_BILL_RELEASED_ALLOCATION_STATUS,
        released_at: params.releasedAt,
        released_by: params.actor,
        release_reason: params.reason,
      },
      where: {
        allocation_status: PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS,
        purchase_bill_id: billId,
      },
    }),
    tx.purchase_bill_po_allocations.updateMany({
      data: {
        allocation_status: PURCHASE_BILL_RELEASED_ALLOCATION_STATUS,
        released_at: params.releasedAt,
        released_by: params.actor,
        release_reason: params.reason,
      },
      where: {
        allocation_status: PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS,
        purchase_bill_id: billId,
      },
    }),
  ])
}

async function supersedePurchaseBillItems(
  tx: Prisma.TransactionClient,
  billId: bigint,
  params: {
    actor: string
    supersededAt: Date
    reason: string
  },
) {
  await tx.purchase_bill_items.updateMany({
    data: {
      item_status: PURCHASE_BILL_SUPERSEDED_ITEM_STATUS,
      superseded_at: params.supersededAt,
      superseded_by: params.actor,
      superseded_reason: params.reason,
      updated_at: params.supersededAt,
    },
    where: {
      item_status: PURCHASE_BILL_ACTIVE_ITEM_STATUS,
      purchase_bill_id: billId,
    },
  })
}

function buildPurchaseBillReceiptAllocationRows(
  billId: bigint,
  itemRows: Awaited<ReturnType<typeof createPurchaseBillItems>>,
  summaryByRef: Map<string, ReceiptSummarySource>,
  actor: string,
) {
  return itemRows.flatMap((item) => {
    const snapshot = item.source_snapshot && typeof item.source_snapshot === 'object'
      ? item.source_snapshot as Record<string, unknown>
      : {}
    const summaryRef = typeof snapshot.receiptSummaryId === 'string' ? snapshot.receiptSummaryId : null
    if (!summaryRef) return []
    const summary = summaryByRef.get(summaryRef)
    if (!summary) return []
    const allocatedQty = toNumber(item.qty)
    const netWeight = toNumber(summary.net_weight)
    const ratio = netWeight > 0 ? allocatedQty / netWeight : 0
    return [{
      allocated_deduct_weight: toNumber(summary.deduct_weight) * ratio,
      allocated_gross_weight: toNumber(summary.gross_weight) * ratio,
      allocated_qty: allocatedQty,
      created_by: actor,
      purchase_bill_id: billId,
      purchase_bill_item_id: item.id,
      weight_ticket_id: summary.weight_ticket_id,
      weight_ticket_product_summary_id: summary.id,
    }]
  })
}

function buildPurchaseBillPoAllocationRows(
  billId: bigint,
  itemRows: Awaited<ReturnType<typeof createPurchaseBillItems>>,
  actor: string,
) {
  return itemRows.flatMap((item) => {
    if (!item.po_buy_id) return []
    return [{
      allocated_amount: toNumber(item.amount),
      allocated_qty: toNumber(item.qty),
      created_by: actor,
      po_buy_id: item.po_buy_id,
      purchase_bill_id: billId,
      purchase_bill_item_id: item.id,
      unit_price_snapshot: toNumber(item.price),
    }]
  })
}

type PoBuyAllocationLogSource = {
  allocatedAmount: number
  allocatedQty: number
  productCodeSnapshot: string | null
  productId: bigint | null
  productNameSnapshot: string | null
  purchaseBillDocNo: string
  purchaseBillId: bigint
  purchaseBillItemId: bigint
  purchaseBillLineNo: number
  poBuyId: bigint
  unitPriceSnapshot: number
}

function poBuyAllocationLogSourceKey(source: PoBuyAllocationLogSource) {
  return [
    stringifyBusinessValue(source.poBuyId),
    source.purchaseBillLineNo,
    source.productCodeSnapshot ?? '',
    source.productId ? stringifyBusinessValue(source.productId) : '',
  ].join(':')
}

function samePoBuyAllocationLogSource(left: PoBuyAllocationLogSource, right: PoBuyAllocationLogSource) {
  return Math.abs(left.allocatedAmount - right.allocatedAmount) <= 0.0001
    && Math.abs(left.allocatedQty - right.allocatedQty) <= 0.0001
    && Math.abs(left.unitPriceSnapshot - right.unitPriceSnapshot) <= 0.0001
    && left.productCodeSnapshot === right.productCodeSnapshot
    && left.productNameSnapshot === right.productNameSnapshot
}

function diffPoBuyAllocationLogSources(
  beforeSources: PoBuyAllocationLogSource[],
  afterSources: PoBuyAllocationLogSource[],
) {
  const beforeByKey = new Map(beforeSources.map((source) => [poBuyAllocationLogSourceKey(source), source] as const))
  const afterByKey = new Map(afterSources.map((source) => [poBuyAllocationLogSourceKey(source), source] as const))
  const released: PoBuyAllocationLogSource[] = []
  const allocated: PoBuyAllocationLogSource[] = []

  beforeByKey.forEach((before, key) => {
    const after = afterByKey.get(key)
    if (!after || !samePoBuyAllocationLogSource(before, after)) released.push(before)
  })
  afterByKey.forEach((after, key) => {
    const before = beforeByKey.get(key)
    if (!before || !samePoBuyAllocationLogSource(before, after)) allocated.push(after)
  })

  return { allocated, released }
}

function buildPoBuyAllocationLogSourcesFromRows(
  purchaseBillDocNo: string,
  poAllocationRows: ReturnType<typeof buildPurchaseBillPoAllocationRows>,
  itemRows: Awaited<ReturnType<typeof createPurchaseBillItems>>,
) {
  const itemById = new Map(itemRows.map((item) => [item.id, item] as const))
  return poAllocationRows.flatMap((row): PoBuyAllocationLogSource[] => {
    const item = itemById.get(row.purchase_bill_item_id)
    if (!item) return []
    return [{
      allocatedAmount: toNumber(row.allocated_amount),
      allocatedQty: toNumber(row.allocated_qty),
      poBuyId: row.po_buy_id,
      productCodeSnapshot: item.product_code ?? null,
      productId: item.product_id ?? null,
      productNameSnapshot: item.product_name ?? null,
      purchaseBillDocNo,
      purchaseBillId: row.purchase_bill_id,
      purchaseBillItemId: row.purchase_bill_item_id,
      purchaseBillLineNo: item.line_no,
      unitPriceSnapshot: toNumber(row.unit_price_snapshot),
    }]
  })
}

async function loadCurrentPoBuyAllocationLogSources(tx: Prisma.TransactionClient, purchaseBillId: bigint) {
  const rows = await tx.purchase_bill_po_allocations.findMany({
    include: {
      purchase_bills: { select: { doc_no: true, id: true } },
      purchase_bill_items: {
        select: {
          line_no: true,
          product_code: true,
          product_id: true,
          product_name: true,
        },
      },
    },
    where: {
      allocation_status: PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS,
      purchase_bill_id: purchaseBillId,
    },
  })

  return rows.map((row): PoBuyAllocationLogSource => ({
    allocatedAmount: toNumber(row.allocated_amount),
    allocatedQty: toNumber(row.allocated_qty),
    poBuyId: row.po_buy_id,
    productCodeSnapshot: row.purchase_bill_items.product_code ?? null,
    productId: row.purchase_bill_items.product_id ?? null,
    productNameSnapshot: row.purchase_bill_items.product_name ?? null,
    purchaseBillDocNo: row.purchase_bills.doc_no,
    purchaseBillId: row.purchase_bill_id,
    purchaseBillItemId: row.purchase_bill_item_id,
    purchaseBillLineNo: row.purchase_bill_items.line_no,
    unitPriceSnapshot: toNumber(row.unit_price_snapshot),
  }))
}

async function appendPoBuyAllocationLogSources(
  tx: Prisma.TransactionClient,
  sources: PoBuyAllocationLogSource[],
  params: {
    action: typeof PO_BUY_ALLOCATION_ACTION[keyof typeof PO_BUY_ALLOCATION_ACTION]
    actor: string
    meta: Prisma.InputJsonValue
    note?: string | null
  },
) {
  await appendPoBuyAllocationLogs(tx, sources.map((source) => ({
    action: params.action,
    actor: params.actor,
    allocatedAmount: source.allocatedAmount,
    allocatedQty: source.allocatedQty,
    meta: params.meta,
    note: params.note ?? null,
    poBuyId: source.poBuyId,
    productCodeSnapshot: source.productCodeSnapshot,
    productId: source.productId,
    productNameSnapshot: source.productNameSnapshot,
    purchaseBillDocNo: source.purchaseBillDocNo,
    purchaseBillId: source.purchaseBillId,
    purchaseBillItemId: source.purchaseBillItemId,
    purchaseBillLineNo: source.purchaseBillLineNo,
    unitPriceSnapshot: source.unitPriceSnapshot,
  })))
}

type WeightTicketUsageLogSource = {
  allocatedDeductWeight: number
  allocatedGrossWeight: number
  allocatedNetWeight: number
  allocatedQty: number
  productCodeSnapshot: string | null
  productId: bigint | null
  productNameSnapshot: string | null
  purchaseBillDocNo: string
  purchaseBillId: bigint
  purchaseBillItemId: bigint
  purchaseBillLineNo: number
  weightTicketId: bigint
  weightTicketProductSummaryId: bigint
}

function weightTicketUsageLogSourceKey(source: WeightTicketUsageLogSource) {
  return [
    stringifyBusinessValue(source.weightTicketProductSummaryId),
    source.purchaseBillLineNo,
    source.productCodeSnapshot ?? '',
    source.productId ? stringifyBusinessValue(source.productId) : '',
  ].join(':')
}

function sameWeightTicketUsageLogSource(left: WeightTicketUsageLogSource, right: WeightTicketUsageLogSource) {
  return Math.abs(left.allocatedDeductWeight - right.allocatedDeductWeight) <= 0.0001
    && Math.abs(left.allocatedGrossWeight - right.allocatedGrossWeight) <= 0.0001
    && Math.abs(left.allocatedNetWeight - right.allocatedNetWeight) <= 0.0001
    && Math.abs(left.allocatedQty - right.allocatedQty) <= 0.0001
    && left.productCodeSnapshot === right.productCodeSnapshot
    && left.productNameSnapshot === right.productNameSnapshot
}

function diffWeightTicketUsageLogSources(
  beforeSources: WeightTicketUsageLogSource[],
  afterSources: WeightTicketUsageLogSource[],
) {
  const beforeByKey = new Map(beforeSources.map((source) => [weightTicketUsageLogSourceKey(source), source] as const))
  const afterByKey = new Map(afterSources.map((source) => [weightTicketUsageLogSourceKey(source), source] as const))
  const released: WeightTicketUsageLogSource[] = []
  const allocated: WeightTicketUsageLogSource[] = []

  beforeByKey.forEach((before, key) => {
    const after = afterByKey.get(key)
    if (!after || !sameWeightTicketUsageLogSource(before, after)) released.push(before)
  })
  afterByKey.forEach((after, key) => {
    const before = beforeByKey.get(key)
    if (!before || !sameWeightTicketUsageLogSource(before, after)) allocated.push(after)
  })

  return { allocated, released }
}

function buildWeightTicketUsageLogSourcesFromRows(
  purchaseBillDocNo: string,
  receiptAllocationRows: ReturnType<typeof buildPurchaseBillReceiptAllocationRows>,
  itemRows: Awaited<ReturnType<typeof createPurchaseBillItems>>,
) {
  const itemById = new Map(itemRows.map((item) => [item.id, item] as const))
  return receiptAllocationRows.flatMap((row): WeightTicketUsageLogSource[] => {
    const item = itemById.get(row.purchase_bill_item_id)
    if (!item) return []
    return [{
      allocatedDeductWeight: toNumber(row.allocated_deduct_weight),
      allocatedGrossWeight: toNumber(row.allocated_gross_weight),
      allocatedNetWeight: toNumber(row.allocated_qty),
      allocatedQty: toNumber(row.allocated_qty),
      productCodeSnapshot: item.product_code ?? null,
      productId: item.product_id ?? null,
      productNameSnapshot: item.product_name ?? null,
      purchaseBillDocNo,
      purchaseBillId: row.purchase_bill_id,
      purchaseBillItemId: row.purchase_bill_item_id,
      purchaseBillLineNo: item.line_no,
      weightTicketId: row.weight_ticket_id,
      weightTicketProductSummaryId: row.weight_ticket_product_summary_id,
    }]
  })
}

async function loadCurrentWeightTicketUsageLogSources(tx: Prisma.TransactionClient, purchaseBillId: bigint) {
  const rows = await tx.purchase_bill_receipt_allocations.findMany({
    include: {
      purchase_bills: { select: { doc_no: true, id: true } },
      purchase_bill_items: {
        select: {
          line_no: true,
          product_code: true,
          product_id: true,
          product_name: true,
        },
      },
    },
    where: {
      allocation_status: PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS,
      purchase_bill_id: purchaseBillId,
    },
  })

  return rows.map((row): WeightTicketUsageLogSource => ({
    allocatedDeductWeight: toNumber(row.allocated_deduct_weight),
    allocatedGrossWeight: toNumber(row.allocated_gross_weight),
    allocatedNetWeight: toNumber(row.allocated_qty),
    allocatedQty: toNumber(row.allocated_qty),
    productCodeSnapshot: row.purchase_bill_items.product_code ?? null,
    productId: row.purchase_bill_items.product_id ?? null,
    productNameSnapshot: row.purchase_bill_items.product_name ?? null,
    purchaseBillDocNo: row.purchase_bills.doc_no,
    purchaseBillId: row.purchase_bill_id,
    purchaseBillItemId: row.purchase_bill_item_id,
    purchaseBillLineNo: row.purchase_bill_items.line_no,
    weightTicketId: row.weight_ticket_id,
    weightTicketProductSummaryId: row.weight_ticket_product_summary_id,
  }))
}

async function appendWeightTicketUsageLogSourceChanges(
  tx: Prisma.TransactionClient,
  changes: Array<{
    action: WeightTicketUsageAction
    actor: string
    meta: Prisma.InputJsonValue
    note?: string | null
    source: WeightTicketUsageLogSource
  }>,
) {
  await appendWeightTicketUsageLogs(tx, changes.map(({ action, actor, meta, note, source }) => ({
    action,
    actor,
    allocatedDeductWeight: source.allocatedDeductWeight,
    allocatedGrossWeight: source.allocatedGrossWeight,
    allocatedNetWeight: source.allocatedNetWeight,
    allocatedQty: source.allocatedQty,
    meta,
    note: note ?? null,
    productCodeSnapshot: source.productCodeSnapshot,
    productId: source.productId,
    productNameSnapshot: source.productNameSnapshot,
    purchaseBillId: source.purchaseBillId,
    purchaseBillItemId: source.purchaseBillItemId,
    targetDocNo: source.purchaseBillDocNo,
    targetId: source.purchaseBillId,
    targetLineNo: source.purchaseBillLineNo,
    targetType: 'PURCHASE_BILL',
    weightTicketId: source.weightTicketId,
    weightTicketProductSummaryId: source.weightTicketProductSummaryId,
  })))
}

function billItemCreateRows(billId: string, items: ReturnType<typeof buildBillItems>) {
  return items.map((item, index) => ({
    amount: item.amount,
    deduct_weight: item.deductWeight,
    discount: item.discount,
    display_name: item.displayName,
    gross_weight: item.grossWeight,
    id: `${billId}-ITEM-${String(index + 1).padStart(4, '0')}`,
    line_no: index + 1,
    lot_no: item.lotNo,
    note: item.note,
      po_buy_id: item.poBuyId,
      price: item.price,
      product_code: item.productCode,
      product_id: item.productId,
      product_name: item.productName,
    purchase_bill_id: billId,
      qty: item.qty,
      sales_price: item.salesPrice,
      source_snapshot: {
        grossWeight: item.grossWeight,
        itemStatus: item.itemStatus,
        poBuyId: item.poBuyId,
        productId: item.productId,
        productName: item.productName,
        qty: item.qty,
        receiptLineId: item.receiptLineId ?? null,
        receiptLineIds: item.receiptLineIds ?? [],
        receiptSummaryId: item.receiptSummaryId ?? null,
        receiptTicketDocNo: item.receiptTicketDocNo ?? null,
        receiptTicketId: item.receiptTicketId ?? null,
      } as Prisma.InputJsonValue,
      unit: item.unit,
  }))
}

async function validateAdvancePaymentSelection(
  tx: Prisma.TransactionClient,
  values: Pick<PurchaseBillFormValues, 'advancePaymentId'>,
  branchId: bigint,
  supplierId: bigint,
  billTotals: { subtotalAmount: number; totalAmount: number; vatAmount: number },
  billId?: bigint,
) {
  if (!values.advancePaymentId) return null

  const advancePayment = await tx.supplier_advance_payments.findFirst({
    select: {
      amount: true,
      branch_id: true,
      cancelled_at: true,
      doc_no: true,
      id: true,
      status: true,
      subtotal_amount: true,
      supplier_id: true,
      total_amount: true,
      vat_amount: true,
      vat_type: true,
    },
    where: {
      doc_no: values.advancePaymentId,
    },
  })
  if (!advancePayment || advancePayment.cancelled_at) {
    throw new Error('ไม่พบเอกสาร ADV ที่ต้องการใช้หักบิล')
  }
  if (advancePayment.branch_id !== branchId) {
    throw new Error('เอกสาร ADV ต้องอยู่สาขาเดียวกับบิลรับซื้อ')
  }
  if (advancePayment.supplier_id !== supplierId) {
    throw new Error('เอกสาร ADV ต้องเป็นผู้ขายเดียวกับบิลรับซื้อ')
  }
  if (!['partially_paid', 'paid', 'partially_allocated', 'allocated'].includes(advancePayment.status)) {
    throw new Error('เอกสาร ADV นี้ยังไม่พร้อมใช้หักบิล')
  }

  const allocations = await tx.supplier_advance_allocations.findMany({
    select: { allocated_amount: true, allocated_subtotal_amount: true, purchase_bill_id: true, status: true },
    where: {
      advance_payment_id: advancePayment.id,
      status: 'active',
    },
  })

  const allocatedToOtherBills = allocations.reduce((sum, allocation) => (
    allocation.purchase_bill_id === billId ? sum : sum + (toNumber(allocation.allocated_subtotal_amount) || toNumber(allocation.allocated_amount))
  ), 0)
  const approvalSummary = await summarizeAdvancePaymentApprovalStatus(tx, advancePayment.id)
  const grossAmount = toNumber(advancePayment.total_amount) || toNumber(advancePayment.amount)
  const subtotalAmount = toNumber(advancePayment.subtotal_amount) || grossAmount
  const paidCapacity = grossAmount > 0
    ? Math.min(subtotalAmount, approvalSummary.settledAmount * subtotalAmount / grossAmount)
    : Math.min(subtotalAmount, approvalSummary.settledAmount)
  const availableAmount = Math.max(0, paidCapacity - allocatedToOtherBills)
  if (availableAmount <= 0.01) {
    throw new Error('เอกสาร ADV นี้ไม่มียอดคงเหลือสำหรับใช้หักบิลแล้ว')
  }

  const vatAmount = toNumber(advancePayment.vat_amount)
  const hasVat = advancePayment.vat_type !== 'NONE' && vatAmount > 0.01
  if (billTotals.subtotalAmount <= 0.01) {
    throw new Error('บิลซื้อไม่มียอดก่อน VAT ให้หัก ADV')
  }

  return {
    availableAmount,
    docNo: advancePayment.doc_no,
    hasVat,
    id: advancePayment.id,
    subtotalAmount,
    vatAmount,
  }
}

function buildAdvanceAllocationAmounts(
  advancePayment: NonNullable<Awaited<ReturnType<typeof validateAdvancePaymentSelection>>>,
  billTotals: { subtotalAmount: number; totalAmount: number; vatAmount: number },
) {
  const advanceBaseCapacity = advancePayment.hasVat
    ? roundMoney(advancePayment.availableAmount * (advancePayment.subtotalAmount / Math.max(advancePayment.subtotalAmount + advancePayment.vatAmount, 0.000001)))
    : roundMoney(advancePayment.availableAmount)
  const allocatedSubtotalAmount = roundMoney(Math.min(advanceBaseCapacity, billTotals.subtotalAmount))
  if (allocatedSubtotalAmount <= 0.01) {
    throw new Error('ยอด VAT ของ ADV ไม่สามารถหักกับบิลซื้อนี้ได้')
  }

  const billVatRatio = billTotals.subtotalAmount > 0
    ? billTotals.vatAmount / Math.max(billTotals.subtotalAmount, 0.000001)
    : 0
  const allocatedVatAmount = roundMoney(allocatedSubtotalAmount * billVatRatio)
  const allocatedAdvanceAmount = advancePayment.hasVat
    ? roundMoney(allocatedSubtotalAmount * ((advancePayment.subtotalAmount + advancePayment.vatAmount) / Math.max(advancePayment.subtotalAmount, 0.000001)))
    : allocatedSubtotalAmount
  const allocatedTotalAmount = roundMoney(Math.min(
    billTotals.totalAmount,
    allocatedSubtotalAmount + allocatedVatAmount,
  ))

  return {
    allocatedAdvanceAmount,
    allocatedSubtotalAmount,
    allocatedTotalAmount,
    allocatedVatAmount,
  }
}

async function resetPurchaseBillAdvanceAllocation(
  tx: Prisma.TransactionClient,
  billId: bigint,
  actor: string,
  reason: string,
) {
  const activeAllocations = await tx.supplier_advance_allocations.findMany({
    select: {
      advance_payment_id: true,
      allocated_amount: true,
      allocation_key: true,
      id: true,
      purchase_bill_id: true,
      purchase_bills: {
        select: { doc_no: true },
      },
    },
    where: {
      purchase_bill_id: billId,
      status: 'active',
    },
  })
  if (activeAllocations.length === 0) return

  const now = new Date()
  await tx.supplier_advance_allocations.updateMany({
    data: {
      status: 'voided',
      updated_at: now,
      void_reason: reason,
      voided_at: now,
      voided_by: actor,
    },
    where: {
      purchase_bill_id: billId,
      status: 'active',
    },
  })
  await appendSupplierAdvanceAllocationLogs(tx, activeAllocations.map((allocation) => ({
    action: SUPPLIER_ADVANCE_ALLOCATION_ACTION.RELEASED_FROM_PURCHASE_BILL,
    actor,
    allocatedAmount: toNumber(allocation.allocated_amount),
    allocationId: allocation.id,
    allocationKey: allocation.allocation_key,
    advancePaymentId: allocation.advance_payment_id,
    createdAt: now,
    meta: { reason },
    note: reason,
    purchaseBillDocNo: allocation.purchase_bills.doc_no,
    purchaseBillId: allocation.purchase_bill_id,
  })))

  const advanceIds = [...new Set(activeAllocations.map((allocation) => allocation.advance_payment_id))]
  for (const advanceId of advanceIds) {
    await refreshSupplierAdvancePaymentAllocation(tx, advanceId, actor, {
      action: SUPPLIER_ADVANCE_STATUS_ACTION.ALLOCATION_RELEASED,
      meta: { reason },
      note: reason,
    })
  }
}

async function applyPurchaseBillAdvanceAllocation(
  tx: Prisma.TransactionClient,
  params: {
    actor: string
    billId: bigint
    branchId: bigint
    billDocNo: string
    maxAmount: number
    maxSubtotalAmount: number
    maxVatAmount: number
    supplierId: bigint
    values: Pick<PurchaseBillFormValues, 'advancePaymentId'>
  },
) {
  await resetPurchaseBillAdvanceAllocation(tx, params.billId, params.actor, 'เปลี่ยนการอ้างอิงเอกสาร ADV ในบิลรับซื้อ')
  if (!params.values.advancePaymentId || params.maxAmount <= 0.01) return 0

  const billTotals = {
    subtotalAmount: params.maxSubtotalAmount,
    totalAmount: params.maxAmount,
    vatAmount: params.maxVatAmount,
  }
  const advancePayment = await validateAdvancePaymentSelection(tx, params.values, params.branchId, params.supplierId, billTotals, params.billId)
  if (!advancePayment) return 0

  const allocationAmounts = buildAdvanceAllocationAmounts(advancePayment, billTotals)
  if (allocationAmounts.allocatedTotalAmount <= 0.01) return 0

  const allocation = await tx.supplier_advance_allocations.create({
    data: {
      advance_payment_id: advancePayment.id,
      allocated_amount: allocationAmounts.allocatedAdvanceAmount,
      allocated_subtotal_amount: allocationAmounts.allocatedSubtotalAmount,
      allocated_total_amount: allocationAmounts.allocatedTotalAmount,
      allocated_vat_amount: allocationAmounts.allocatedVatAmount,
      allocated_at: new Date(),
      allocated_by: params.actor,
      purchase_bill_id: params.billId,
      status: 'active',
      updated_at: new Date(),
    },
    select: {
      allocation_key: true,
      id: true,
    },
  })
  await appendSupplierAdvanceAllocationLogs(tx, [{
    action: SUPPLIER_ADVANCE_ALLOCATION_ACTION.ALLOCATED_TO_PURCHASE_BILL,
    actor: params.actor,
    allocatedAmount: allocationAmounts.allocatedAdvanceAmount,
    allocationId: allocation.id,
    allocationKey: allocation.allocation_key,
    advancePaymentId: advancePayment.id,
    meta: {
      allocatedSubtotalAmount: allocationAmounts.allocatedSubtotalAmount,
      allocatedTotalAmount: allocationAmounts.allocatedTotalAmount,
      allocatedVatAmount: allocationAmounts.allocatedVatAmount,
      reason: 'purchase_bill_save',
    },
    purchaseBillDocNo: params.billDocNo,
    purchaseBillId: params.billId,
  }])

  await refreshSupplierAdvancePaymentAllocation(tx, advancePayment.id, params.actor)
  return allocationAmounts.allocatedTotalAmount
}

function receiptSummaryUsageKey(ticketId: bigint | string, summaryId: bigint | string) {
  return `${stringifyBusinessValue(ticketId)}::${stringifyBusinessValue(summaryId)}`
}

function receiptLineOutwardId(ticketDocNo: string, lineNo: number) {
  return `${ticketDocNo}:${lineNo}`
}

function receiptSummaryOutwardId(ticketDocNo: string, productCode: string, lineCount: number | null | undefined) {
  return `${ticketDocNo}:${productCode}:${lineCount ?? 0}`
}

async function buildWeightTicketUsageMap(tickets: WeightTicketOptionRow[]) {
  if (tickets.length === 0) return new Map<string, number>()
  const ticketIds = tickets.map((ticket) => ticket.id)
  const rows = await prisma.purchase_bill_receipt_allocations.findMany({
    select: {
      allocated_qty: true,
      weight_ticket_id: true,
      weight_ticket_product_summary_id: true,
    },
    where: {
      allocation_status: PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS,
      weight_ticket_id: { in: ticketIds },
      purchase_bills: {
        status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] },
      },
    },
  })
  const usageMap = new Map<string, number>()
  rows.forEach((row) => {
    const key = receiptSummaryUsageKey(row.weight_ticket_id, row.weight_ticket_product_summary_id)
    usageMap.set(key, (usageMap.get(key) ?? 0) + toNumber(row.allocated_qty))
  })
  return usageMap
}

function derivePurchaseSource(items: Array<{ poBuyId?: string | null }>, fallback: PurchaseBillFormValues['purchaseSource']) {
  const poCount = items.filter((item) => Boolean(item.poBuyId)).length
  if (poCount === 0) return 'SPOT_BUY' as const
  if (poCount === items.length) return 'PO_RECEIPT' as const
  return fallback === 'MIXED' || poCount > 0 ? 'MIXED' as const : 'SPOT_BUY' as const
}

async function loadReceiptAvailability(ticketDocNo: string, excludeBillId?: bigint) {
  const ticket = await prisma.weight_tickets.findUnique({
    select: weightTicketOptionSelect,
    where: { doc_no: ticketDocNo },
  })
  if (!ticket) return { ticket: null, usedQtyBySummaryId: new Map<string, number>() }

  const bills = await prisma.purchase_bill_receipt_allocations.findMany({
    select: {
      allocated_qty: true,
      purchase_bill_id: true,
      weight_ticket_product_summary_id: true,
    },
    where: {
      allocation_status: PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS,
      weight_ticket_id: ticket.id,
      purchase_bills: {
        status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] },
      },
    },
  })

  const usedQtyBySummaryId = new Map<string, number>()
  bills.forEach((row) => {
    if (excludeBillId && row.purchase_bill_id === excludeBillId) return
    const key = stringifyBusinessValue(row.weight_ticket_product_summary_id)
    usedQtyBySummaryId.set(key, (usedQtyBySummaryId.get(key) ?? 0) + toNumber(row.allocated_qty))
  })

  return { ticket, usedQtyBySummaryId }
}

function receiptSummaryMapByInternalId(ticket: WeightTicketOptionRow) {
  return new Map(ticket.weight_ticket_product_summaries.map((summary) => [stringifyBusinessValue(summary.id), summary]))
}

function receiptReferenceMaps(ticket: WeightTicketOptionRow, productByRef: Map<string, ProductRefRow>) {
  const productCodeByInternalId = new Map([...productByRef.values()].map((product) => [product.id, product.code] as const))
  const lineByInternalId = new Map(ticket.weight_ticket_lines.map((line) => [line.id, line] as const))
  const lineToSummaryRef = new Map<string, string>()
  const receiptSummarySourceMap = new Map<string, ReceiptSummarySource>()

  ticket.weight_ticket_product_summaries.forEach((summary) => {
    const productCode = productCodeByInternalId.get(summary.product_id)
    if (!productCode) return
    const summaryRef = receiptSummaryOutwardId(ticket.doc_no, productCode, summary.line_count)
    receiptSummarySourceMap.set(summaryRef, {
      deduct_weight: summary.deduct_weight,
      gross_weight: summary.gross_weight,
      id: summary.id,
      net_weight: summary.net_weight,
      weight_ticket_id: summary.weight_ticket_id,
    })
    summary.weight_ticket_product_summary_lines.forEach((bridge) => {
      const line = lineByInternalId.get(bridge.weight_ticket_line_id)
      if (!line) return
      lineToSummaryRef.set(receiptLineOutwardId(ticket.doc_no, line.line_no), summaryRef)
    })
  })

  return { lineToSummaryRef, receiptSummarySourceMap }
}

function extractReferencedReceiptTicketDocNosFromBillItems(items: Array<{ source_snapshot: Prisma.JsonValue | null }>) {
  return [...new Set(items.map((item) => {
    const snapshot = item.source_snapshot && typeof item.source_snapshot === 'object'
      ? item.source_snapshot as Record<string, unknown>
      : {}
    return typeof snapshot.receiptTicketId === 'string' ? snapshot.receiptTicketId : null
  }).filter((value): value is string => Boolean(value)))]
}

async function resolveReferencedReceiptTicketIdsFromBillItems(tx: Prisma.TransactionClient, items: Array<{ source_snapshot: Prisma.JsonValue | null }>) {
  const docNos = extractReferencedReceiptTicketDocNosFromBillItems(items)
  if (docNos.length === 0) return []
  const rows = await tx.weight_tickets.findMany({
    select: { id: true },
    where: {
      doc_no: { in: docNos },
      doc_type: 'WTI',
    },
  })
  return rows.map((row) => row.id)
}

async function resolveReferencedReceiptTicketIdsFromBillItemsRead(items: Array<{ source_snapshot: Prisma.JsonValue | null }>) {
  const docNos = extractReferencedReceiptTicketDocNosFromBillItems(items)
  if (docNos.length === 0) return []
  const rows = await prisma.weight_tickets.findMany({
    select: { id: true },
    where: {
      doc_no: { in: docNos },
      doc_type: 'WTI',
    },
  })
  return rows.map((row) => row.id)
}

function extractReferencedPoBuyIdsFromBillItems(items: Array<{ po_buy_id?: bigint | null }>) {
  return [...new Set(items.map((item) => item.po_buy_id).filter((value): value is bigint => value != null))]
}

function extractReferencedPoBuyIdsFromBuiltItems(items: ReturnType<typeof buildBillItems>) {
  return [...new Set(items.map((item) => item.poBuyIdInternal).filter((value): value is bigint => value != null))]
}

async function validateStockReceiptSelection(
  values: PurchaseBillFormValues,
  resolvedBranchId: bigint,
  resolvedSupplierId: bigint,
  poBuyById: Map<string, PoBuyRefRow>,
  productByRef: Map<string, ProductRefRow>,
  excludeBillId?: bigint,
  allowSupplierMismatchTicketIds: Set<bigint> = new Set(),
) {
  const receiptTicketId = values.receiptTicketId?.trim()
  if (!receiptTicketId) {
    return { error: 'เลือกใบรับของ' as const }
  }

  const { ticket, usedQtyBySummaryId } = await loadReceiptAvailability(receiptTicketId, excludeBillId)
  if (!ticket || ticket.doc_type !== 'WTI' || ticket.cancelled_at) {
    return { error: 'ใบรับของที่เลือกไม่ถูกต้อง' as const }
  }
  if (ticket.branch_id !== resolvedBranchId) {
    return { error: 'ใบรับของต้องอยู่สาขาเดียวกับบิลรับซื้อ' as const }
  }
  if (ticket.supplier_id !== resolvedSupplierId && !allowSupplierMismatchTicketIds.has(ticket.id)) {
    return { error: 'ใบรับของต้องเป็นผู้ขายเดียวกับบิลรับซื้อ' as const }
  }

  const summaryById = receiptSummaryMapByInternalId(ticket)
  const { lineToSummaryRef, receiptSummarySourceMap } = receiptReferenceMaps(ticket, productByRef)

  const requestedQtyBySummaryId = new Map<string, number>()
  const requestedQtyByPoProduct = new Map<string, { poBuyId: string; productId: bigint; qty: number }>()
  for (const item of values.items) {
    const resolvedSummaryRef = item.receiptSummaryId ?? (item.receiptLineId ? lineToSummaryRef.get(item.receiptLineId) ?? null : null)
    if (item.receiptTicketId !== ticket.doc_no || !resolvedSummaryRef) {
      return { error: 'รายการ Stock ต้องอ้างอิงรายการจากใบรับของเดียวกัน' as const }
    }
    const summarySource = receiptSummarySourceMap.get(resolvedSummaryRef)
    if (!summarySource) {
      return { error: 'มีรายการอ้างอิงใบรับของที่ไม่ถูกต้อง' as const }
    }
    const summary = summaryById.get(stringifyBusinessValue(summarySource.id))
    if (!summary) {
      return { error: 'มีรายการอ้างอิงใบรับของที่ไม่ถูกต้อง' as const }
    }
    const itemProduct = productByRef.get(item.productId)
    if (!itemProduct) {
      return { error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' as const }
    }
    const itemProductId = itemProduct.id
    if (summary.product_id !== itemProductId) {
      return { error: 'สินค้าในบิลไม่ตรงกับสินค้าในใบรับของ' as const }
    }
    if (item.poBuyId) {
      const poBuy = poBuyById.get(item.poBuyId)
      if (!poBuy) {
        return { error: 'PO Buy ที่เลือกไม่ถูกต้อง' as const }
      }
      if (poBuy.status !== PO_BUY_STATUS.OPEN && poBuy.status !== PO_BUY_STATUS.PARTIAL) {
        return { error: 'PO Buy นี้ไม่อยู่ในสถานะที่ตัดบิลรับซื้อได้' as const }
      }
      if (poBuy.supplier_id && poBuy.supplier_id !== resolvedSupplierId) {
        return { error: 'PO Buy ต้องเป็นผู้ขายเดียวกับบิลรับซื้อ' as const }
      }
      if (!poBuyIncludesProduct(poBuy, itemProductId)) {
        return { error: 'PO Buy ต้องเป็นสินค้าเดียวกับรายการที่เลือก' as const }
      }
      const poProductKey = `${item.poBuyId}:${String(itemProductId)}`
      const current = requestedQtyByPoProduct.get(poProductKey) ?? { poBuyId: item.poBuyId, productId: itemProductId, qty: 0 }
      requestedQtyByPoProduct.set(poProductKey, { ...current, qty: current.qty + item.qty })
    }
    const summaryId = stringifyBusinessValue(summarySource.id)
    requestedQtyBySummaryId.set(summaryId, (requestedQtyBySummaryId.get(summaryId) ?? 0) + item.qty)
  }

  for (const summary of ticket.weight_ticket_product_summaries) {
    const summaryId = stringifyBusinessValue(summary.id)
    const availableQty = Math.max(0, toNumber(summary.net_weight) - (usedQtyBySummaryId.get(summaryId) ?? 0))
    const requestedQty = requestedQtyBySummaryId.get(summaryId) ?? 0
    if (requestedQty > availableQty + 0.0001) {
      return { error: `จำนวนเกินน้ำหนักคงเหลือของ ${summary.product_name}` as const }
    }
    if (availableQty > 0.0001 && requestedQty < availableQty - 0.0001) {
      const remainingQty = Math.max(0, availableQty - requestedQty).toLocaleString('th-TH', { maximumFractionDigits: 2 })
      return { error: `ใบรับของต้องจัดสรรให้ครบก่อนบันทึก: ${summary.product_name} ยังเหลือ ${remainingQty} กก.` as const }
    }
  }

  for (const { poBuyId, productId, qty: requestedQty } of requestedQtyByPoProduct.values()) {
    const poBuy = poBuyById.get(poBuyId)
    if (!poBuy) continue
    const remainingQty = poBuyRemainingQtyForProduct(poBuy, productId)
    if (requestedQty > remainingQty + 0.0001) {
      return { error: `จำนวนเกินคงเหลือของ PO ${poBuyId}` as const }
    }
  }

  return { receiptSummarySourceMap, ticket }
}

function weightTicketOptionJson(
  row: WeightTicketOptionRow,
  usageMap: Map<string, number>,
  productCodeById: Map<bigint, string>,
) {
  const outwardLineIdByInternalLineId = new Map(
    row.weight_ticket_lines.map((line) => [line.id, `${row.doc_no}:${line.line_no}`] as const),
  )
  const lines = row.weight_ticket_lines.map((line) => {
    const sourceNetWeight = toNumber(line.net_weight)
    return {
      deductWeight: toNumber(line.deduct_weight),
      grossWeight: toNumber(line.gross_weight),
      id: `${row.doc_no}:${line.line_no}`,
      lineNo: line.line_no,
      netWeight: sourceNetWeight,
      note: line.note ?? '',
      productId: line.product_id != null ? (productCodeById.get(line.product_id) ?? '') : '',
      productName: line.product_name,
      remainingQty: sourceNetWeight,
      usedQty: 0,
    }
  })

  const productSummaries = row.weight_ticket_product_summaries.map((summary) => {
    const usedQty = usageMap.get(receiptSummaryUsageKey(row.id, summary.id)) ?? 0
    const netWeight = toNumber(summary.net_weight)
    const remainingWeight = Math.max(0, netWeight - usedQty)
    const productCode = summary.product_id != null ? (productCodeById.get(summary.product_id) ?? '') : ''
    return {
      billedWeight: toNumber(summary.billed_weight),
      deductWeight: toNumber(summary.deduct_weight),
      grossWeight: toNumber(summary.gross_weight),
      hasMixedDeductionProfiles: summary.has_mixed_deduction_profiles ?? false,
      id: `${row.doc_no}:${productCode}:${summary.line_count ?? 0}`,
      lineCount: summary.line_count ?? 0,
      netWeight,
      productId: productCode,
      productName: summary.product_name,
      remainingWeight,
      sourceLineIds: summary.weight_ticket_product_summary_lines.flatMap((bridge) => {
        const outwardLineId = outwardLineIdByInternalLineId.get(bridge.weight_ticket_line_id)
        return outwardLineId ? [outwardLineId] : []
      }),
    }
  }).filter((summary) => summary.remainingWeight > 0.0001)

  return {
    branchId: row.branches?.code ?? '',
    branchName: row.branches.name,
    documentDate: toDateOnly(row.document_date),
    documentNo: row.doc_no,
    id: row.doc_no,
    lines,
    productSummaries,
    partyName: row.party_name,
    status: row.status,
    supplierId: row.suppliers?.code ?? '',
    vehicleNo: row.vehicle_no,
  }
}

type WeightTicketStatusRefreshOptions = {
  actor?: string | null
  createdAt?: Date
  note?: string | null
  reason?: string
}

async function refreshWeightTicketStatuses(
  tx: Prisma.TransactionClient,
  ticketIds: bigint[],
  options: WeightTicketStatusRefreshOptions = {},
) {
  const uniqueTicketIds = [...new Set(ticketIds)]
  if (uniqueTicketIds.length === 0) return
  const changedAt = options.createdAt ?? new Date()

  const ticketRows = await tx.weight_tickets.findMany({
    select: weightTicketOptionSelect,
    where: {
      doc_type: 'WTI',
      id: { in: uniqueTicketIds },
    },
  })

  const allocationRows = await tx.purchase_bill_receipt_allocations.findMany({
    select: {
      allocated_qty: true,
      weight_ticket_id: true,
      weight_ticket_product_summary_id: true,
    },
    where: {
      allocation_status: PURCHASE_BILL_ACTIVE_ALLOCATION_STATUS,
      weight_ticket_id: { in: uniqueTicketIds },
      purchase_bills: {
        status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] },
      },
    },
  })

  const qtyByTicketId = new Map<bigint, number>()
  const qtyBySummaryKey = new Map<string, number>()
  allocationRows.forEach((row) => {
    qtyByTicketId.set(row.weight_ticket_id, (qtyByTicketId.get(row.weight_ticket_id) ?? 0) + toNumber(row.allocated_qty))
    const summaryKey = receiptSummaryUsageKey(row.weight_ticket_id, row.weight_ticket_product_summary_id)
    qtyBySummaryKey.set(summaryKey, (qtyBySummaryKey.get(summaryKey) ?? 0) + toNumber(row.allocated_qty))
  })

  await Promise.all(ticketRows.map(async (ticket) => {
    const totalQty = ticket.weight_ticket_lines.reduce((sum, line) => sum + toNumber(line.net_weight), 0)
    const billedQty = qtyByTicketId.get(ticket.id) ?? 0
    const nextStatus = billedQty <= 0.0001
      ? 'received'
      : billedQty + 0.0001 < totalQty
        ? 'partially_billed'
        : 'billed'
    if (ticket.status === nextStatus) return
    await tx.weight_tickets.update({
      data: {
        status: nextStatus,
        updated_at: changedAt,
        updated_by: options.actor ?? undefined,
      },
      where: { id: ticket.id },
    })
    await appendWeightTicketStatusLog(tx, {
      action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
      actor: options.actor,
      createdAt: changedAt,
      fromStatus: ticket.status,
      meta: {
        billedWeight: billedQty,
        reason: options.reason ?? 'purchase_bill_allocation_refresh',
        totalWeight: totalQty,
      },
      note: options.note ?? null,
      toStatus: nextStatus,
      weightTicketId: ticket.id,
    })
  }))

  await Promise.all(ticketRows.flatMap((ticket) => ticket.weight_ticket_product_summaries.map(async (summary) => {
    const billedWeight = qtyBySummaryKey.get(receiptSummaryUsageKey(ticket.id, summary.id)) ?? 0
    const netWeight = toNumber(summary.net_weight)
    const remainingWeight = Math.max(0, netWeight - billedWeight)
    await tx.weight_ticket_product_summaries.update({
      data: {
        billed_weight: billedWeight,
        remaining_weight: remainingWeight,
        updated_at: new Date(),
      },
      where: { id: summary.id },
    })
  })))
}

function isDocNoConflict(caught: unknown) {
  if (!(caught instanceof Error) || !('code' in caught) || caught.code !== 'P2002') return false
  if (!('meta' in caught) || typeof caught.meta !== 'object' || caught.meta === null) return false
  if (!('target' in caught.meta) || !Array.isArray(caught.meta.target)) return false
  return caught.meta.target.includes('doc_no')
}

async function nextPurchaseBillDocNo(tx: Prisma.TransactionClient, date: string, branchCode: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `PB${branchCode}${compactDate}-`
  await tx.$executeRaw`
    select pg_advisory_xact_lock(hashtext(${`purchase_bills:PB${compactDate}`}))
  `
  const rows = await tx.$queryRaw<Array<{ last_number: number | bigint | null }>>`
    select coalesce(max(substring(doc_no from '-([0-9]+)$')::int), 0) as last_number
    from public.purchase_bills
    where (
      doc_no like ${`PB${compactDate}-%`}
      or doc_no like ${`PB__${compactDate}-%`}
    )
      and substring(doc_no from '-([0-9]+)$') is not null
  `
  const parsedLastNumber = Number(rows[0]?.last_number ?? 0)
  const lastNumber = Number.isFinite(parsedLastNumber) ? parsedLastNumber : 0
  const nextNumber = lastNumber + 1
  return `${startsWith}${String(nextNumber).padStart(4, '0')}`
}

function supplierSnapshotFields(supplier: {
  address: string | null
  name: string
  phone: string | null
  salesRep: string | null
  taxId: string | null
}) {
  return {
    supplier_address_snapshot: supplier.address,
    supplier_name_snapshot: supplier.name,
    supplier_phone_snapshot: supplier.phone,
    supplier_sales_rep_snapshot: supplier.salesRep,
    supplier_tax_id_snapshot: supplier.taxId,
  }
}

async function supplierBranchCodeMap(supplierIds: bigint[]) {
  const result = new Map<bigint, string[]>()
  if (supplierIds.length === 0) return result
  try {
    const rows = await prisma.$queryRaw<SupplierBranchMappingRow[]>`
      select sb.supplier_id, b.code as branch_code
      from public.supplier_branches sb
      join public.branches b on b.id = sb.branch_id
      where sb.active is true
        and sb.supplier_id in (${Prisma.join(supplierIds)})
    `
    for (const row of rows) {
      if (!row.branch_code) continue
      const current = result.get(row.supplier_id) ?? []
      current.push(row.branch_code)
      result.set(row.supplier_id, current)
    }
  } catch {
    return result
  }
  return result
}

async function optionsPayload(allowedBranchCodes?: string[] | null) {
  let allowedBranchIds: bigint[] | undefined = undefined
  if (allowedBranchCodes) {
    const matchingBranches = await prisma.branches.findMany({
      where: { code: { in: allowedBranchCodes } },
      select: { id: true },
    })
    allowedBranchIds = matchingBranches.map((b) => b.id)
  }

  const [advancePayments, branches, poBuys, products, salespersons, suppliers, warehouses, vatRatePercent, weightTickets] = await Promise.all([
    prisma.supplier_advance_payments.findMany({
      orderBy: [{ advance_date: 'desc' }, { doc_no: 'desc' }],
      select: {
        advance_date: true,
        advance_type: true,
        amount: true,
        branch_id: true,
        doc_no: true,
        id: true,
        invoice_no: true,
        remaining_amount: true,
        status: true,
        subtotal_amount: true,
        supplier_id: true,
        supplier_advance_allocations: {
          select: {
            allocated_amount: true,
            allocated_subtotal_amount: true,
          },
          where: {
            status: 'active',
          },
        },
        vat_amount: true,
        vat_type: true,
      },
      take: 500,
      where: {
        cancelled_at: null,
        ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
      },
    }),
    prisma.branches.findMany({
      where: {
        ...(allowedBranchCodes ? { code: { in: allowedBranchCodes } } : {}),
      },
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
      select: { active: true, code: true, id: true, name: true },
    }),
    prisma.po_buys.findMany({
      orderBy: [{ doc_no: 'desc' }],
      select: { doc_no: true, id: true, items: true, product_id: true, remaining_amount: true, remaining_qty: true, status: true, supplier_id: true, unit_price: true },
      take: 500,
      where: {
        status: { in: [PO_BUY_STATUS.OPEN, PO_BUY_STATUS.PARTIAL] },
        ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
      },
    }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.salespersons.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.suppliers.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        active: true,
        code: true,
        id: true,
        name: true,
        sales_id: true,
        sales_rep: true,
        supplier_bank_accounts: {
          include: {
            bank_names: { select: { name: true } },
          },
          where: { active: true },
          orderBy: [{ is_primary: 'desc' }, { code: 'asc' }],
        },
      },
    }),
    prisma.warehouses.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
      select: { active: true, branch_id: true, code: true, id: true, name: true, type: true },
    }),
    activeVatRatePercent(new Date()),
    prisma.weight_tickets.findMany({
      select: weightTicketOptionSelect,
      orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
      take: 300,
      where: {
        ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        cancelled_at: null,
        doc_type: 'WTI',
        status: { in: ['received', 'partially_billed'] },
      },
    }),
  ])
  const usageMap = await buildWeightTicketUsageMap(weightTickets)
  const branchCodeById = new Map(branches.map((branch) => [branch.id, branch.code]))
  const productCodeById = new Map(products.map((product) => [product.id, requireBusinessCode(product.code, `สินค้า ${product.id}`)]))
  const productNameById = new Map(products.map((product) => [product.id, product.name]))
  const salespersonCodeById = new Map(salespersons.map((salesperson) => [salesperson.id, requireBusinessCode(salesperson.code, `พนักงานขาย ${salesperson.id}`)]))
  const supplierCodeById = new Map(suppliers.map((supplier) => [supplier.id, requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`)]))
  const supplierBranchCodesBySupplierId = await supplierBranchCodeMap(suppliers.map((supplier) => supplier.id))

  return {
    advancePayments: advancePayments.map((advance) => {
      const subtotalAmount = toNumber(advance.subtotal_amount) || toNumber(advance.amount)
      const allocatedBaseAmount = advance.supplier_advance_allocations.reduce((sum, allocation) => (
        sum + (toNumber(allocation.allocated_subtotal_amount) || toNumber(allocation.allocated_amount))
      ), 0)
      const remainingBaseAmount = Math.max(0, roundMoney(subtotalAmount - allocatedBaseAmount))
      const remainingAmount = Math.min(toNumber(advance.remaining_amount), remainingBaseAmount)
      return {
        active: ['partially_paid', 'paid', 'partially_allocated', 'allocated'].includes(advance.status) && remainingAmount > 0.01,
        advanceDate: toDateOnly(advance.advance_date),
        amount: toNumber(advance.amount),
        branch_id: branchCodeById.get(advance.branch_id) ?? null,
        invoiceNo: advance.invoice_no ?? '',
        id: advance.doc_no,
        label: `${advance.doc_no} · ใช้หักได้ ${remainingAmount.toLocaleString('th-TH')} บาท`,
        name: advance.doc_no,
        remainingAmount,
        status: advance.status,
        subtotalAmount,
        supplier_id: supplierCodeById.get(advance.supplier_id) ?? null,
        vatAmount: toNumber(advance.vat_amount),
        vatType: advance.vat_type,
      }
    }),
    branches: branches.map((branch) => ({
      ...branch,
      id: requireBusinessCode(branch.code, `สาขา ${branch.id}`),
    })),
    poBuys: poBuys.flatMap((po) => {
      const remainingItems = (() => {
        try {
          return remainingPoBuyProductItems(po)
        } catch {
          return []
        }
      })()
      return remainingItems.map((remainingItem) => {
        const productCode = productCodeById.get(remainingItem.productId) ?? null
        const productName = productNameById.get(remainingItem.productId) ?? productCode ?? 'สินค้า'
        const remainingQty = remainingItem.remainingQty
        return {
          active: (po.status === PO_BUY_STATUS.OPEN || po.status === PO_BUY_STATUS.PARTIAL) && remainingQty > 0.0001,
          id: po.doc_no,
          label: `${po.doc_no} · ${productName} · คงเหลือ ${remainingQty.toLocaleString('th-TH')} กก.`,
          name: po.doc_no,
          product_id: productCode,
          remainingQty,
          supplier_id: po.supplier_id != null ? (supplierCodeById.get(po.supplier_id) ?? null) : null,
          unitPrice: remainingItem.unitPrice,
        }
      })
    }),
    products: products.map((product) => ({
      active: product.active,
      code: requireBusinessCode(product.code, `สินค้า ${product.id}`),
      id: requireBusinessCode(product.code, `สินค้า ${product.id}`),
      name: product.name,
      unit: product.unit,
    })),
    receipts: weightTickets
      .map((ticket) => weightTicketOptionJson(ticket, usageMap, productCodeById))
      .filter((ticket) => ticket.productSummaries.length > 0),
    salespersons: salespersons.map((salesperson) => ({
      ...salesperson,
      id: requireBusinessCode(salesperson.code, `พนักงานขาย ${salesperson.id}`),
    })),
    suppliers: suppliers.map((supplier) => ({
      active: supplier.active,
      bankAccounts: (supplier.supplier_bank_accounts ?? []).map((account) => ({
        accountName: account.account_name ?? '',
        accountNo: account.account_no ?? '',
        bankName: account.bank_names?.name ?? '',
        branchCode: account.branch_code ?? '',
        code: account.code,
        isPrimary: Boolean(account.is_primary),
        paymentMethod: account.payment_method ?? 'เงินโอน',
      })),
      branchIds: supplierBranchCodesBySupplierId.get(supplier.id) ?? [],
      code: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
      id: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
      name: supplier.name,
      sales_id: supplier.sales_id != null ? (salespersonCodeById.get(supplier.sales_id) ?? null) : null,
      sales_name: supplier.sales_rep,
    })),
    vatRatePercent,
    warehouses: (warehouses as PurchaseBillWarehouseRefRow[]).map((warehouse) => ({
      ...warehouse,
      branch_id: warehouse.branch_id ? (branchCodeById.get(warehouse.branch_id) ?? null) : null,
      id: requireBusinessCode(warehouse.code, `คลัง ${warehouse.id}`),
      type: warehouse.type ?? null,
    })),
  }
}

function parseBillQuery(url: URL, includePaging = true): BillQuery {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = includePaging ? Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)) : 10000
  const sortDirection = url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc'

  return {
    branchId: url.searchParams.get('branchId')?.trim().toUpperCase() || undefined,
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    filterMode: url.searchParams.get('filterMode') || undefined,
    filterSource: url.searchParams.get('filterSource') || undefined,
    page,
    pageSize,
    search: url.searchParams.get('search')?.trim() || undefined,
    sortDirection,
    sortKey: url.searchParams.get('sortKey') || 'date',
    statuses: url.searchParams.get('status')
      ?.split(',')
      .map((value) => value.trim().toLowerCase())
      .map((value) => value === 'open' ? 'unpaid' : value)
      .filter(Boolean) || undefined,
  }
}

function billWhere(query: BillQuery, allowedBranchCodes?: string[] | null): Prisma.purchase_billsWhereInput {
  const where: Prisma.purchase_billsWhereInput = {}

  if (query.branchId) {
    const codeIntersection = allowedBranchCodes
      ? (allowedBranchCodes.includes(query.branchId) ? [query.branchId] : [])
      : [query.branchId]
    where.branches = {
      is: {
        code: { in: codeIntersection },
      },
    }
  } else if (allowedBranchCodes) {
    where.branches = {
      is: {
        code: { in: allowedBranchCodes },
      },
    }
  }
  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lt: new Date(normalizeDate(query.dateTo).getTime() + 24 * 60 * 60 * 1000) } : {}),
    }
  }
  if (query.filterMode) where.transaction_mode = query.filterMode
  if (query.filterSource) where.purchase_source = query.filterSource
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { ref_no: { contains: query.search, mode: 'insensitive' } },
      { suppliers: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { branches: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { warehouses: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

function derivePurchasePaymentWorkflowStatus(params: {
  hasActiveApproval: boolean
  isCancelled: boolean
  paymentSettledAmount: number
  payableBalance: number
  status: string | null | undefined
}): PurchasePaymentWorkflowStatus {
  if (params.isCancelled) {
    return params.status === PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS
      ? PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS
      : 'cancelled'
  }
  if (params.payableBalance <= 0.01 || String(params.status ?? '').toLowerCase() === 'paid') return 'paid'
  if (params.paymentSettledAmount > 0.01) return 'partial_paid'
  if (params.hasActiveApproval) return 'pending_payment'
  return 'pending_approval'
}

function purchasePaymentWorkflowStatusLabel(status: string) {
  const labels: Record<PurchasePaymentWorkflowStatus, string> = {
    cancelled: 'ยกเลิก',
    cancelled_supplier_swap: 'ยกเลิก/เปลี่ยน Supplier',
    paid: 'เสร็จสิ้น',
    partial_paid: 'ชำระบางส่วน',
    pending_approval: 'ยังไม่อนุมัติ',
    pending_payment: 'รอจ่าย',
  }
  return labels[status as PurchasePaymentWorkflowStatus] ?? status
}

function purchasePaymentWorkflowStatusRank(status: string | null | undefined) {
  const ranks: Record<PurchasePaymentWorkflowStatus, number> = {
    pending_approval: 1,
    pending_payment: 2,
    partial_paid: 3,
    paid: 4,
    cancelled: 5,
    cancelled_supplier_swap: 5,
  }
  return ranks[String(status ?? 'pending_approval').toLowerCase() as PurchasePaymentWorkflowStatus] ?? 99
}

function purchaseBillLockedReason(params: {
  hasActiveApproval: boolean
  hasActivePayment: boolean
  isCancelled: boolean
}) {
  if (params.isCancelled) return 'บิลนี้ถูกยกเลิกแล้ว'
  if (params.hasActivePayment) return 'แก้ไข/ยกเลิกไม่ได้ เพราะบิลนี้มีรอบจ่ายเงิน PMT แล้ว'
  if (params.hasActiveApproval) return 'แก้ไข/ยกเลิกไม่ได้ เพราะมี PMA อนุมัติแล้ว'
  return null
}

function sortPurchaseBillRowsByWorkflow<T extends { docNo: string; paymentWorkflowStatus?: string }>(
  rows: T[],
  direction: Prisma.SortOrder,
) {
  return [...rows].sort((left, right) => {
    const rankDiff = purchasePaymentWorkflowStatusRank(left.paymentWorkflowStatus) - purchasePaymentWorkflowStatusRank(right.paymentWorkflowStatus)
    const docDiff = left.docNo.localeCompare(right.docNo, 'th')
    const result = rankDiff || docDiff
    return direction === 'asc' ? result : -result
  })
}

function billOrderBy(query: BillQuery): Prisma.purchase_billsOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.purchase_billsOrderByWithRelationInput = (() => {
    switch (query.sortKey) {
      case 'docNo':
        return { doc_no: direction }
      case 'refNo':
        return { ref_no: direction }
      case 'updatedBy':
        return { updated_at: direction }
      case 'name':
        return { supplier_id: direction }
      case 'outstanding':
        return { payable_balance: direction }
      case 'status':
        return { status: direction }
      case 'totalAmount':
        return { total_amount: direction }
      case 'transactionMode':
        return { transaction_mode: direction }
      case 'warehouse':
        return { branch_id: direction }
      case 'date':
      default:
        return { date: direction }
    }
  })()

  return [primary, { doc_no: direction }]
}

async function rowsPayload(
  query: BillQuery,
  allowedBranchCodes?: string[] | null,
  includePaging = true,
) {
  const where = billWhere(query, allowedBranchCodes)
  const needsWorkflowInMemory = query.sortKey === 'status' || Boolean(query.statuses?.length)
  const dbPaging = includePaging && !needsWorkflowInMemory
  const [rows, totalRowsFromDb, totalAmountFromDb] = await Promise.all([
    prisma.purchase_bills.findMany({
      include: {
        branches: true,
        purchase_bill_items: {
          orderBy: { line_no: 'asc' },
          where: { item_status: PURCHASE_BILL_ACTIVE_ITEM_STATUS },
        },
        supplier_advance_allocations: {
          include: {
            supplier_advance_payments: {
              select: { doc_no: true, id: true },
            },
          },
          orderBy: [{ allocated_at: 'desc' }],
        },
        suppliers: true,
        warehouses: true,
      },
      orderBy: billOrderBy(query),
      ...(dbPaging ? {
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      } : {}),
      where,
    }),
    dbPaging ? prisma.purchase_bills.count({ where }) : Promise.resolve(null),
    dbPaging ? prisma.purchase_bills.aggregate({ _sum: { total_amount: true }, where }) : Promise.resolve(null),
  ])
  const billIds = rows.map((row) => row.id)
  const [payments, activeApprovals] = billIds.length > 0 ? await Promise.all([
    prisma.payments.findMany({
      orderBy: [{ created_at: 'asc' }],
      select: { amount: true, bill_id: true, discount: true, doc_no: true, status: true, withholding_tax: true },
      where: {
        bill_id: { in: billIds },
        NOT: { status: 'cancelled' },
      },
    }),
    prisma.payment_approvals.findMany({
      select: { doc_no: true, source_id: true, status: true },
      where: {
        source_id: { in: billIds.map((billId) => stringifyBusinessValue(billId)) },
        source_type: 'purchase_bill',
        status: { in: [...LOCKED_PURCHASE_PAYMENT_APPROVAL_STATUSES] },
      },
    }),
  ]) : [[], []]
  const activePaymentBillIds = new Set<bigint>()
  const paymentDocNosByBillId = new Map<bigint, string[]>()
  const paymentSettledAmountByBillId = new Map<bigint, number>()
  payments.forEach((payment) => {
    const billId = payment.bill_id
    if (billId == null) return
    activePaymentBillIds.add(billId)
    const current = paymentDocNosByBillId.get(billId) ?? []
    if (payment.doc_no && !current.includes(payment.doc_no)) current.push(payment.doc_no)
    paymentDocNosByBillId.set(billId, current)
    const paymentAmount = toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
    paymentSettledAmountByBillId.set(billId, (paymentSettledAmountByBillId.get(billId) ?? 0) + paymentAmount)
  })
  const activeApprovalBillIds = new Set(activeApprovals.map((approval) => approval.source_id))
  const activeApprovalDocNosByBillId = new Map<string, string[]>()
  activeApprovals.forEach((approval) => {
    if (!approval.doc_no) return
    const current = activeApprovalDocNosByBillId.get(approval.source_id) ?? []
    if (!current.includes(approval.doc_no)) current.push(approval.doc_no)
    activeApprovalDocNosByBillId.set(approval.source_id, current)
  })

  const mappedRows = rows.map((row) => {
    const paymentDocNos = paymentDocNosByBillId.get(row.id) ?? []
    const billId = stringifyBusinessValue(row.id)
    const approvalDocNos = activeApprovalDocNosByBillId.get(billId) ?? []
    const hasActiveApproval = activeApprovalBillIds.has(billId)
    const hasActivePayment = activePaymentBillIds.has(row.id)
    const isCancelled = String(row.status ?? '').toLowerCase().includes('cancel')
    const paymentSettledAmount = paymentSettledAmountByBillId.get(row.id) ?? 0
    const payableBalance = toNumber(row.payable_balance)
    const paymentWorkflowStatus = derivePurchasePaymentWorkflowStatus({
      hasActiveApproval,
      isCancelled,
      paymentSettledAmount,
      payableBalance,
      status: row.status,
    })
    const lockedReason = purchaseBillLockedReason({
      hasActiveApproval,
      hasActivePayment,
      isCancelled,
    })
    return {
      ...billJson(row, [...approvalDocNos, ...paymentDocNos]),
      canEdit: !lockedReason,
      hasActiveApproval,
      hasActivePayment,
      lockedReason,
      paymentWorkflowStatus,
    }
  })
  const filteredRows = query.statuses?.length
    ? mappedRows.filter((row) => query.statuses?.includes(String(row.paymentWorkflowStatus ?? '').toLowerCase()))
    : mappedRows
  const sortedRows = query.sortKey === 'status'
    ? sortPurchaseBillRowsByWorkflow(filteredRows, query.sortDirection)
    : filteredRows
  const pagedRows = includePaging && needsWorkflowInMemory
    ? sortedRows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
    : sortedRows

  return {
    rows: pagedRows,
    totalAmount: totalAmountFromDb?._sum.total_amount != null
      ? toNumber(totalAmountFromDb._sum.total_amount)
      : sortedRows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0),
    totalRows: totalRowsFromDb ?? sortedRows.length,
  }
}

async function buildWorkbook(rows: Array<any>) {
  const summaryData = rows.map((row) => ({
    'เลขที่': row.docNo,
    'เลขที่ใบรับของ': row.receiptDocNos?.join(', ') || '-',
    'วันที่': row.date,
    'ผู้ขาย': row.supplierName,
    'ประเภท': row.transactionMode,
    'สถานะ': purchasePaymentWorkflowStatusLabel(row.paymentWorkflowStatus ?? row.status),
    'PMA / PMT': row.paymentDocNos?.join(', ') || '-',
    'จำนวนรายการ': row.itemCount,
    'ยอดรวม': row.totalAmount,
    'ค้างจ่าย': row.payableBalance,
    'สร้างโดย': row.createdBy,
    'สร้างเมื่อ': row.createdAt,
  }))

  const detailData: any[] = []
  rows.forEach((row) => {
    const items = row.items || []
    items.forEach((item: any) => {
      detailData.push({
        'Doc No': row.docNo,
        'Date': row.date,
        'Partner': row.supplierName,
        'Product Code': item.productCode,
        'Product Name': item.productName,
        'Lot No': item.lotNo || '-',
        'Gross Wt': item.grossWeight,
        'Deduct Wt': item.deductWeight,
        'Net Wt': item.qty,
        'Unit Price': item.price,
        'Amount': item.qty * item.price,
        'Discount': item.discount,
        'Net Amount': item.amount,
        'PO Ref / No': item.poBuyId || '-',
      })
    })
  })

  const workbook = XLSX.utils.book_new()
  const sheet1 = XLSX.utils.json_to_sheet(summaryData)
  sheet1['!cols'] = [
    { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 14 },
    { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 },
  ]
  applyWorksheetTableLayout(sheet1, 12, summaryData.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet1, 'บิลรับซื้อ')

  const sheet2 = XLSX.utils.json_to_sheet(detailData)
  sheet2['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 16 },
  ]
  applyWorksheetTableLayout(sheet2, 14, detailData.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet2, 'รายละเอียดสินค้า')

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const allowedBranchCodes = getBranchCodeIntersection(context)
    const url = new URL(request.url)
    const query = parseBillQuery(url, url.searchParams.get('format') !== 'xlsx')
    const payload = await rowsPayload(query, allowedBranchCodes, url.searchParams.get('format') !== 'xlsx')

    if (url.searchParams.get('format') === 'xlsx') {
      const body = await buildWorkbook(payload.rows)
      const filename = `purchase_bills_${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(new Uint8Array(body), {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })
    }

    return NextResponse.json({
      rows: payload.rows,
      totalAmount: payload.totalAmount,
      totalRows: payload.totalRows,
      ...await optionsPayload(allowedBranchCodes),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดบิลรับซื้อไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = purchaseBillFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const createdAt = new Date()
    const billDate = bangkokDateInput(createdAt)
    const vatRatePercent = await activeVatRatePercent(normalizeDate(billDate))
    const totals = calculateTotals(values, vatRatePercent)

    const productRefs = [...new Set(values.items.map((item) => item.productId).filter(Boolean))]
    const poBuyRefs = [...new Set([values.poBuyId, ...values.items.map((item) => item.poBuyId)].filter(Boolean) as string[])]
    const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
    const [supplier, poBuys, products, warehouse] = await Promise.all([
      findActiveSupplierReferenceByCodeOrId(values.supplierId),
      resolvePoBuysByDocNo(poBuyRefs),
      resolveProductsByCodeOrId(productRefs),
      values.warehouseId ? findActiveWarehouseReferenceByCodeOrId(values.warehouseId) : Promise.resolve(null),
    ])

    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!(await isSupplierEligibleForBranch({ branchId: branch.id, supplierId: supplier.id }))) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้',
        fieldErrors: { supplierId: ['ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้'] },
      }, { status: 400 })
    }
    const allowedBranchCodes = getBranchCodeIntersection(context)
    if (allowedBranchCodes && !allowedBranchCodes.includes(branch.code)) {
      return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์ทำรายการในสาขานี้' }, { status: 403 })
    }
    if (values.transactionMode === 'STOCK' && !warehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกคลังที่เปิดใช้งานสำหรับบิลรับซื้อ' }, { status: 400 })
    const supplierSalesId = supplier.salesId ?? null

    const effectiveBranch = branch
    const effectiveBranchCode = branchBillCode(effectiveBranch?.code)
    if (!effectiveBranch || !effectiveBranchCode) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกสาขาที่มีรหัสสาขา 01 หรือ 02 ก่อนบันทึกบิล' }, { status: 400 })
    if (values.transactionMode === 'STOCK' && warehouse?.branchCode !== effectiveBranch.code) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'คลังต้องอยู่ในสาขาเดียวกับบิลรับซื้อ' }, { status: 400 })
    }
    if (values.transactionMode === 'STOCK' && warehouse?.type?.toUpperCase() !== 'RM') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลรับซื้อ Stock ต้องใช้คลัง RM ของสาขาเท่านั้น' }, { status: 400 })
    }

    const poBuyById = createPoBuyRefMap(poBuys)
    const missingPoBuy = poBuyRefs.find((poBuyId) => !poBuyById.has(poBuyId))
    if (missingPoBuy) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy ที่เลือกไม่ถูกต้อง' }, { status: 400 })

    const productByRef = createProductRefMap(products as ProductRefRow[])
    const missingProduct = values.items.find((item) => !productByRef.has(item.productId))
    if (missingProduct) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    let receiptSummarySourceMap = new Map<string, ReceiptSummarySource>()
    let receiptTicketIdsToRefresh: bigint[] = []
    if (values.transactionMode === 'STOCK') {
      const receiptValidation = await validateStockReceiptSelection(values, effectiveBranch.id, supplier.id, poBuyById, productByRef)
      if ('error' in receiptValidation) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: receiptValidation.error }, { status: 400 })
      }
      receiptSummarySourceMap = receiptValidation.receiptSummarySourceMap
      receiptTicketIdsToRefresh = [receiptValidation.ticket.id]
    }

    const items = buildBillItems(values, productByRef, poBuyById, receiptSummarySourceMap)
    const poBuyIds = extractReferencedPoBuyIdsFromBuiltItems(items)
    if (poBuyIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await reconcilePoBuys(tx, poBuyIds)
      }, { timeout: 30000 })
    }
    const purchaseSource = derivePurchaseSource(items, values.purchaseSource)
    const purchaseWarehouseId = values.transactionMode === 'STOCK' ? warehouse?.id ?? null : null

    let bill: { doc_no: string; id: bigint } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        bill = await prisma.$transaction(async (tx) => {
          const docNo = await nextPurchaseBillDocNo(tx, billDate, effectiveBranchCode)

          const createdBill = await tx.purchase_bills.create({
            data: {
              branch_id: effectiveBranch.id,
              date: createdAt,
              created_by: actor,
              discount: values.discountTotal,
              discount_total: values.discountTotal,
              doc_no: docNo,
              has_vat: values.hasVat,
              license_plate: null,
              note: values.note ?? values.notes,
              notes: values.notes,
              paid_amount: 0,
              payable_balance: totals.totalAmount,
              po_buy_id: poBuyById.get(values.poBuyId ?? '')?.id ?? null,
              purchase_source: purchaseSource,
              ref_no: values.refNo,
              sales_id: supplierSalesId,
              status: 'unpaid',
              subtotal: totals.subtotal,
              supplier_id: supplier.id,
              ...supplierSnapshotFields(supplier),
              total_amount: totals.totalAmount,
              transaction_mode: values.transactionMode,
              updated_at: createdAt,
              updated_by: actor,
              vat_amount: totals.vatAmount,
              vat_invoice_date: values.vatInvoiceDate ? normalizeDate(values.vatInvoiceDate) : null,
              vat_invoice_no: values.vatInvoiceNo,
              vat_invoice_received: values.vatInvoiceReceived,
              vat_invoice_received_at: values.vatInvoiceReceived ? new Date() : null,
              vat_rate_percent: vatRatePercent,
              vat_type: values.vatType,
              warehouse_id: purchaseWarehouseId,
            },
            select: { doc_no: true, id: true },
          })

          const itemRows = await createPurchaseBillItems(tx, createdBill.id, items)
          const receiptAllocationRows = buildPurchaseBillReceiptAllocationRows(createdBill.id, itemRows, receiptSummarySourceMap, actor)
          if (receiptAllocationRows.length > 0) {
            await tx.purchase_bill_receipt_allocations.createMany({ data: receiptAllocationRows })
            await appendWeightTicketUsageLogSourceChanges(
              tx,
              buildWeightTicketUsageLogSourcesFromRows(createdBill.doc_no, receiptAllocationRows, itemRows).map((source) => ({
                action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_PURCHASE_BILL,
                actor,
                meta: { reason: 'purchase_bill_create' },
                source,
              })),
            )
          }
          const poAllocationRows = buildPurchaseBillPoAllocationRows(createdBill.id, itemRows, actor)
          if (poAllocationRows.length > 0) {
            await tx.purchase_bill_po_allocations.createMany({ data: poAllocationRows })
            await appendPoBuyAllocationLogSources(
              tx,
              buildPoBuyAllocationLogSourcesFromRows(createdBill.doc_no, poAllocationRows, itemRows),
              {
                action: PO_BUY_ALLOCATION_ACTION.ALLOCATED_TO_PURCHASE_BILL,
                actor,
                meta: { reason: 'purchase_bill_create' },
              },
            )
          }
          await reconcilePoBuys(tx, extractReferencedPoBuyIdsFromBuiltItems(items), { actor })
          await applyPurchaseBillAdvanceAllocation(tx, {
            actor,
            branchId: effectiveBranch.id,
            billDocNo: createdBill.doc_no,
            billId: createdBill.id,
            maxAmount: totals.totalAmount,
            maxSubtotalAmount: totals.taxableBaseAmount,
            maxVatAmount: totals.vatAmount,
            supplierId: supplier.id,
            values: { advancePaymentId: values.advancePaymentId },
          })
          const settlement = await refreshPurchaseBillSettlement(tx, createdBill.id, actor)
          await createInitialPurchaseBillStatusLog(tx, {
            actor,
            createdAt,
            meta: {
              advancePaymentDocNo: values.advancePaymentId || null,
              totalAmount: totals.totalAmount,
              transactionMode: values.transactionMode,
            },
            purchaseBillDocNo: createdBill.doc_no,
            purchaseBillId: createdBill.id,
            toStatus: settlement.status,
          })
          if (values.transactionMode === 'STOCK') {
            await tx.stock_ledger.createMany({
              data: items.map((item) => ({
                branch_id: effectiveBranch.id,
                created_by: actor,
                date: normalizeDate(billDate),
                lot_no: item.lotNo,
                movement_type: 'รับซื้อเข้า',
                note: item.note,
                notes: values.note ?? values.notes,
                output_category: item.itemStatus,
                product_id: item.productIdInternal,
                qty_in: item.qty,
                qty_out: 0,
                ref_id: createdBill.doc_no,
                ref_no: createdBill.doc_no,
                ref_type: 'PB',
                unit_cost: item.price,
                value_in: item.amount,
                value_out: 0,
                warehouse_id: purchaseWarehouseId,
              })),
            })
            await syncPurchaseBillCostPoolEntries(tx, {
              actor,
              billId: createdBill.id,
              branchId: effectiveBranch.id,
              date: normalizeDate(billDate),
              notes: values.note ?? values.notes,
              transactionMode: values.transactionMode,
              warehouseId: purchaseWarehouseId,
            })
            await refreshWeightTicketStatuses(tx, receiptTicketIdsToRefresh, {
              actor,
              reason: 'purchase_bill_create',
            })
          }

          return createdBill
        })
        break
      } catch (caught) {
        if (!isDocNoConflict(caught) || attempt === 2) throw caught
      }
    }

    if (!bill) throw new Error('สร้างเลขที่บิลไม่สำเร็จ')

    try {
      await enqueueAndExecuteNotification(
        { sourceType: 'purchase_bill', documentNo: bill.doc_no },
        { requestedBy: actor, force: false },
      )
    } catch (caught) {
      console.error('[purchase_bill] LINE notification failed', caught)
    }

    return NextResponse.json({ docNo: bill.doc_no, id: bill.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกบิลรับซื้อไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const prismaExt = prisma as typeof prisma & {
      payment_approvals: {
        count: (args: unknown) => Promise<number>
      }
    }
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const raw = await request.json()
    const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
    if (!id) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบบิลที่ต้องการแก้ไข' }, { status: 400 })
    const existingBillRef = await resolvePurchaseBillByDocNoOrId(id)
    if (!existingBillRef) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อ' }, { status: 404 })

    const allowedBranchCodes = getBranchCodeIntersection(context)
    if (existingBillRef.branch_id != null) {
      const existingBranch = await prisma.branches.findUnique({
        where: { id: existingBillRef.branch_id }
      })
      if (allowedBranchCodes && (!existingBranch || !allowedBranchCodes.includes(existingBranch.code))) {
        return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อ' }, { status: 404 })
      }
    }
    if (raw?.action === 'cancel') {
      const values = purchaseBillCancelSchema.parse(raw)
      const actor = currentActor(context)
      const [existingBill, payments, existingBillItems, activeApprovalCount] = await Promise.all([
        prisma.purchase_bills.findUnique({ where: { id: existingBillRef.id } }),
        prisma.payments.findMany({
          select: { amount: true, discount: true, status: true, withholding_tax: true },
          where: { bill_id: existingBillRef.id, NOT: { status: 'cancelled' } },
        }),
        prisma.purchase_bill_items.findMany({
          select: { po_buy_id: true, source_snapshot: true },
          where: {
            item_status: PURCHASE_BILL_ACTIVE_ITEM_STATUS,
            purchase_bill_id: existingBillRef.id,
          },
        }),
        prismaExt.payment_approvals.count({
          where: {
            source_id: stringifyBusinessValue(existingBillRef.id),
            source_type: 'purchase_bill',
            status: { in: [...LOCKED_PURCHASE_PAYMENT_APPROVAL_STATUSES] },
          },
        }),
      ])

      if (!existingBill) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อ' }, { status: 404 })
      if (String(existingBill.status ?? '').toLowerCase().includes('cancel')) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลนี้ถูกยกเลิกแล้ว' }, { status: 400 })
      }
      const paidAmount = payments.reduce((sum, payment) => sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount), 0)
      if (payments.length > 0) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยกเลิกไม่ได้ เพราะบิลนี้มีรอบจ่ายเงิน PMT แล้ว' }, { status: 400 })
      if (paidAmount > 0) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยกเลิกไม่ได้ เพราะบิลนี้มีการชำระเงินแล้ว' }, { status: 400 })
      if (activeApprovalCount > 0) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยกเลิกไม่ได้ เพราะบิลนี้ถูกอนุมัติโอนเงินแล้ว' }, { status: 400 })
      }

      const cancelledAt = new Date()
      const cancelledBill = await prisma.$transaction(async (tx) => {
        const existingPoAllocationSources = await loadCurrentPoBuyAllocationLogSources(tx, existingBillRef.id)
        const existingWeightTicketUsageSources = await loadCurrentWeightTicketUsageLogSources(tx, existingBillRef.id)
        const bill = await tx.purchase_bills.update({
          data: {
            cancel_note: values.note,
            cancelled_at: cancelledAt,
            cancelled_by: actor,
            payable_balance: 0,
            status: 'cancelled',
            updated_at: cancelledAt,
            updated_by: actor,
          },
          select: { doc_no: true, id: true },
          where: { id: existingBillRef.id },
        })
        if (String(existingBill.transaction_mode ?? 'STOCK') === 'STOCK') {
          await appendPurchaseBillStockReversal(tx, {
            actor,
            billDocNo: existingBillRef.doc_no,
            date: normalizeDate(toDateOnly(existingBill.date) || bangkokDateInput(cancelledAt)),
            movementType: 'รับซื้อเข้า-ยกเลิก',
            note: values.note,
            notes: values.note,
            reason: 'purchase_bill_cancel',
            reversalRefType: 'PB-CANCEL',
          })
        }
        await syncPurchaseBillCostPoolEntries(tx, {
          actor,
          billId: existingBillRef.id,
          branchId: existingBill.branch_id,
          date: normalizeDate(toDateOnly(existingBill.date) || bangkokDateInput(cancelledAt)),
          notes: values.note,
          transactionMode: String(existingBill.transaction_mode ?? 'STOCK'),
          warehouseId: existingBill.warehouse_id,
        })
        await appendPoBuyAllocationLogSources(tx, existingPoAllocationSources, {
          action: PO_BUY_ALLOCATION_ACTION.RELEASED_FROM_PURCHASE_BILL,
          actor,
          meta: { reason: 'purchase_bill_cancel' },
          note: values.note,
        })
        await appendWeightTicketUsageLogSourceChanges(
          tx,
          existingWeightTicketUsageSources.map((source) => ({
            action: WEIGHT_TICKET_USAGE_ACTION.RELEASED_FROM_PURCHASE_BILL,
            actor,
            meta: { reason: 'purchase_bill_cancel' },
            note: values.note,
            source,
          })),
        )
        await releasePurchaseBillAllocations(tx, existingBillRef.id, {
          actor,
          reason: 'purchase_bill_cancel',
          releasedAt: cancelledAt,
        })
        await resetPurchaseBillAdvanceAllocation(tx, existingBillRef.id, actor, 'ยกเลิกบิลรับซื้อ')
        await reconcilePoBuys(tx, extractReferencedPoBuyIdsFromBillItems(existingBillItems), { actor })
        await refreshWeightTicketStatuses(tx, await resolveReferencedReceiptTicketIdsFromBillItems(tx, existingBillItems), {
          actor,
          createdAt: cancelledAt,
          note: values.note,
          reason: 'purchase_bill_cancel',
        })
        await appendPurchaseBillStatusLog(tx, {
          action: PURCHASE_BILL_STATUS_ACTION.CANCELLED,
          actor,
          createdAt: cancelledAt,
          fromStatus: existingBill.status,
          meta: {
            reason: 'cancel_action',
          },
          note: values.note,
          purchaseBillDocNo: bill.doc_no,
          purchaseBillId: bill.id,
          toStatus: 'cancelled',
        })
        return bill
      })

      return NextResponse.json({ docNo: cancelledBill.doc_no, id: cancelledBill.doc_no, status: 'cancelled' })
    }

    if (raw?.action === 'supplier_swap') {
      const values = purchaseBillFormSchema.parse(raw)
      const actor = currentActor(context)

      const productRefs = [...new Set(values.items.map((item) => item.productId).filter(Boolean))]
      const poBuyRefs = [...new Set([values.poBuyId, ...values.items.map((item) => item.poBuyId)].filter(Boolean) as string[])]
      const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
      const [existingBill, supplier, poBuys, products, payments, existingBillItems, activeApprovalCount, warehouse] = await Promise.all([
        prisma.purchase_bills.findUnique({ where: { id: existingBillRef.id } }),
        findActiveSupplierReferenceByCodeOrId(values.supplierId),
        resolvePoBuysByDocNo(poBuyRefs),
        resolveProductsByCodeOrId(productRefs),
        prisma.payments.findMany({
          select: { amount: true, discount: true, status: true, withholding_tax: true },
          where: { bill_id: existingBillRef.id, NOT: { status: 'cancelled' } },
        }),
        prisma.purchase_bill_items.findMany({
          orderBy: { line_no: 'asc' },
          select: { amount: true, line_no: true, po_buy_id: true, price: true, qty: true, source_snapshot: true },
          where: {
            item_status: PURCHASE_BILL_ACTIVE_ITEM_STATUS,
            purchase_bill_id: existingBillRef.id,
          },
        }),
        prismaExt.payment_approvals.count({
          where: {
            source_id: stringifyBusinessValue(existingBillRef.id),
            source_type: 'purchase_bill',
            status: { in: [...LOCKED_PURCHASE_PAYMENT_APPROVAL_STATUSES] },
          },
        }),
        values.warehouseId ? findActiveWarehouseReferenceByCodeOrId(values.warehouseId) : Promise.resolve(null),
      ])

      if (!existingBill) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อ' }, { status: 404 })
      if (isPurchaseBillCancelledStatus(existingBill.status)) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ไม่ได้ เพราะบิลนี้ถูกยกเลิกแล้ว' }, { status: 400 })
      }
      const activePaidAmount = payments.reduce((sum, payment) => sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount), 0)
      if (payments.length > 0 || activePaidAmount > 0) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ไม่ได้ เพราะบิลนี้มีรอบจ่ายเงิน PMT แล้ว' }, { status: 400 })
      }
      if (activeApprovalCount > 0) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ไม่ได้ เพราะบิลนี้ถูกอนุมัติโอนเงินแล้ว ต้องยกเลิกรายการรอจ่ายก่อน' }, { status: 400 })
      }
      if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายใหม่ไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
      if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
      if (!(await isSupplierEligibleForBranch({ branchId: branch.id, supplierId: supplier.id }))) {
        return NextResponse.json({
          code: 'BAD_REQUEST',
          error: 'ผู้ขายใหม่ไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้',
          fieldErrors: { supplierId: ['ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้'] },
        }, { status: 400 })
      }
      if (allowedBranchCodes && !allowedBranchCodes.includes(branch.code)) {
        return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์ทำรายการในสาขานี้' }, { status: 403 })
      }
      if (values.poBuyId || values.items.some((item) => Boolean(item.poBuyId))) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องบังคับรายการใหม่เป็น Spot Buy ทั้งหมด ห้ามตัด PO ข้าม Supplier' }, { status: 400 })
      }
      if (branch.id !== existingBill.branch_id) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องคงสาขาเดิมของบิล' }, { status: 400 })
      }
      if (values.transactionMode !== String(existingBill.transaction_mode ?? 'STOCK')) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องคงประเภทบิลเดิม' }, { status: 400 })
      }
      if (values.transactionMode !== 'STOCK') {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier รองรับเฉพาะ PB ที่ล็อกใบรับของ WTI เดิมเท่านั้น' }, { status: 400 })
      }
      if (values.transactionMode === 'STOCK' && !warehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกคลังที่เปิดใช้งานสำหรับบิลรับซื้อ' }, { status: 400 })
      if (values.transactionMode === 'STOCK' && warehouse?.id !== existingBill.warehouse_id) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องคงคลังเดิมของบิล' }, { status: 400 })
      }

      const supplierSalesId = supplier.salesId ?? null
      const effectiveBranchCode = branchBillCode(branch.code)
      if (!effectiveBranchCode) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาต้องมีรหัสสาขา 01 หรือ 02 ก่อนบันทึกบิล' }, { status: 400 })
      const poBuyById = createPoBuyRefMap(poBuys)
      const missingPoBuy = poBuyRefs.find((poBuyId) => !poBuyById.has(poBuyId))
      if (missingPoBuy) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy ที่เลือกไม่ถูกต้อง' }, { status: 400 })

      const productByRef = createProductRefMap(products as ProductRefRow[])
      const missingProduct = values.items.find((item) => !productByRef.has(item.productId))
      if (missingProduct) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

      const originalReceiptTicketIds = await resolveReferencedReceiptTicketIdsFromBillItemsRead(existingBillItems)
      if (values.items.length !== existingBillItems.length) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องคงรายการจากใบรับของเดิม ห้ามเพิ่มหรือลบแถว' }, { status: 400 })
      }
      for (const [index, item] of values.items.entries()) {
        const originalItem = existingBillItems[index]
        const originalSnapshot = originalItem?.source_snapshot && typeof originalItem.source_snapshot === 'object'
          ? originalItem.source_snapshot as Record<string, unknown>
          : {}
        const originalReceiptSummaryId = typeof originalSnapshot.receiptSummaryId === 'string' ? originalSnapshot.receiptSummaryId : null
        if ((item.receiptSummaryId ?? null) !== originalReceiptSummaryId) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องคงสินค้า/ใบรับของเดิม ห้ามเปลี่ยน source รายการ' }, { status: 400 })
        }
        if (Math.abs(item.qty - toNumber(originalItem.qty)) > 0.0001) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องคงน้ำหนักเดิม แก้ได้เฉพาะราคา' }, { status: 400 })
        }
      }
      let receiptSummarySourceMap = new Map<string, ReceiptSummarySource>()
      let receiptTicketIdsToRefresh: bigint[] = []
      if (values.transactionMode === 'STOCK') {
        const receiptValidation = await validateStockReceiptSelection(
          values,
          branch.id,
          supplier.id,
          poBuyById,
          productByRef,
          existingBillRef.id,
          new Set(originalReceiptTicketIds),
        )
        if ('error' in receiptValidation) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: receiptValidation.error }, { status: 400 })
        }
        if (!originalReceiptTicketIds.some((ticketId) => ticketId === receiptValidation.ticket.id)) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: 'เปลี่ยน Supplier ต้องใช้ใบรับของเดิมของบิลนี้เท่านั้น' }, { status: 400 })
        }
        receiptSummarySourceMap = receiptValidation.receiptSummarySourceMap
        receiptTicketIdsToRefresh = [receiptValidation.ticket.id]
      }

      const billDate = existingBill.date ? toDateOnly(existingBill.date) : bangkokDateInput(new Date())
      const createdAt = new Date()
      const vatRatePercent = toNumber(existingBill.vat_rate_percent) ?? (await activeVatRatePercent(normalizeDate(billDate)))
      const totals = calculateTotals(values, vatRatePercent)
      const items = buildBillItems(values, productByRef, poBuyById, receiptSummarySourceMap)
      const purchaseSource = derivePurchaseSource(items, values.purchaseSource)
      const purchaseWarehouseId = values.transactionMode === 'STOCK' ? warehouse?.id ?? null : null
      const reason = `เปลี่ยน Supplier: void ${existingBill.doc_no} และสร้างบิลใหม่แทน`

      let replacementBill: { doc_no: string; id: bigint } | null = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          replacementBill = await prisma.$transaction(async (tx) => {
            const existingPoAllocationSources = await loadCurrentPoBuyAllocationLogSources(tx, existingBillRef.id)
            const existingWeightTicketUsageSources = await loadCurrentWeightTicketUsageLogSources(tx, existingBillRef.id)
            await tx.purchase_bills.update({
              data: {
                cancel_note: reason,
                cancelled_at: createdAt,
                cancelled_by: actor,
                payable_balance: 0,
                status: PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS,
                updated_at: createdAt,
                updated_by: actor,
              },
              where: { id: existingBillRef.id },
            })
            await appendPurchaseBillStockReversal(tx, {
              actor,
              billDocNo: existingBill.doc_no,
              date: normalizeDate(billDate),
              movementType: 'รับซื้อเข้า-ยกเลิก',
              note: reason,
              notes: reason,
              reason: 'purchase_bill_supplier_swap',
              reversalRefType: 'PB-CANCEL',
            })
            await syncPurchaseBillCostPoolEntries(tx, {
              actor,
              billId: existingBillRef.id,
              branchId: existingBill.branch_id,
              date: normalizeDate(billDate),
              notes: reason,
              transactionMode: String(existingBill.transaction_mode ?? 'STOCK'),
              warehouseId: existingBill.warehouse_id,
            })
            await appendPoBuyAllocationLogSources(tx, existingPoAllocationSources, {
              action: PO_BUY_ALLOCATION_ACTION.RELEASED_FROM_PURCHASE_BILL,
              actor,
              meta: { reason: 'purchase_bill_supplier_swap' },
              note: reason,
            })
            await appendWeightTicketUsageLogSourceChanges(
              tx,
              existingWeightTicketUsageSources.map((source) => ({
                action: WEIGHT_TICKET_USAGE_ACTION.RELEASED_FROM_PURCHASE_BILL,
                actor,
                meta: { reason: 'purchase_bill_supplier_swap' },
                note: reason,
                source,
              })),
            )
            await releasePurchaseBillAllocations(tx, existingBillRef.id, {
              actor,
              reason: 'purchase_bill_supplier_swap',
              releasedAt: createdAt,
            })
            await resetPurchaseBillAdvanceAllocation(tx, existingBillRef.id, actor, reason)

            const docNo = await nextPurchaseBillDocNo(tx, billDate, effectiveBranchCode)
            const createdBill = await tx.purchase_bills.create({
              data: {
                branch_id: branch.id,
                date: createdAt,
                created_by: actor,
                discount: values.discountTotal,
                discount_total: values.discountTotal,
                doc_no: docNo,
                has_vat: values.hasVat,
                license_plate: null,
                note: values.note ?? values.notes,
                notes: values.notes,
                paid_amount: 0,
                payable_balance: totals.totalAmount,
                po_buy_id: poBuyById.get(values.poBuyId ?? '')?.id ?? null,
                purchase_source: purchaseSource,
                ref_no: values.refNo,
                sales_id: supplierSalesId,
                status: 'unpaid',
                subtotal: totals.subtotal,
                supplier_id: supplier.id,
                ...supplierSnapshotFields(supplier),
                total_amount: totals.totalAmount,
                transaction_mode: values.transactionMode,
                updated_at: createdAt,
                updated_by: actor,
                vat_amount: totals.vatAmount,
                vat_invoice_date: values.vatInvoiceDate ? normalizeDate(values.vatInvoiceDate) : null,
                vat_invoice_no: values.vatInvoiceNo,
                vat_invoice_received: values.vatInvoiceReceived,
                vat_invoice_received_at: values.vatInvoiceReceived ? new Date() : null,
                vat_rate_percent: vatRatePercent,
                vat_type: values.vatType,
                warehouse_id: purchaseWarehouseId,
              },
              select: { doc_no: true, id: true },
            })

            const itemRows = await createPurchaseBillItems(tx, createdBill.id, items)
            const receiptAllocationRows = buildPurchaseBillReceiptAllocationRows(createdBill.id, itemRows, receiptSummarySourceMap, actor)
            if (receiptAllocationRows.length > 0) {
              await tx.purchase_bill_receipt_allocations.createMany({ data: receiptAllocationRows })
              await appendWeightTicketUsageLogSourceChanges(
                tx,
                buildWeightTicketUsageLogSourcesFromRows(createdBill.doc_no, receiptAllocationRows, itemRows).map((source) => ({
                  action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_PURCHASE_BILL,
                  actor,
                  meta: { reason: 'purchase_bill_supplier_swap' },
                  source,
                })),
              )
            }
            const poAllocationRows = buildPurchaseBillPoAllocationRows(createdBill.id, itemRows, actor)
            if (poAllocationRows.length > 0) {
              await tx.purchase_bill_po_allocations.createMany({ data: poAllocationRows })
              await appendPoBuyAllocationLogSources(
                tx,
                buildPoBuyAllocationLogSourcesFromRows(createdBill.doc_no, poAllocationRows, itemRows),
                {
                  action: PO_BUY_ALLOCATION_ACTION.ALLOCATED_TO_PURCHASE_BILL,
                  actor,
                  meta: { reason: 'purchase_bill_supplier_swap' },
                },
              )
            }

            await reconcilePoBuys(tx, [
              ...extractReferencedPoBuyIdsFromBuiltItems(items),
              ...extractReferencedPoBuyIdsFromBillItems(existingBillItems),
            ], { actor })
            if (values.transactionMode === 'STOCK') {
              await tx.stock_ledger.createMany({
                data: items.map((item) => ({
                  branch_id: branch.id,
                  created_by: actor,
                  date: normalizeDate(billDate),
                  lot_no: item.lotNo,
                  movement_type: 'รับซื้อเข้า',
                  note: item.note,
                  notes: values.note ?? values.notes,
                  output_category: item.itemStatus,
                  product_id: item.productIdInternal,
                  qty_in: item.qty,
                  qty_out: 0,
                  ref_id: createdBill.doc_no,
                  ref_no: createdBill.doc_no,
                  ref_type: 'PB',
                  unit_cost: item.price,
                  value_in: item.amount,
                  value_out: 0,
                  warehouse_id: purchaseWarehouseId,
                })),
              })
              await syncPurchaseBillCostPoolEntries(tx, {
                actor,
                billId: createdBill.id,
                branchId: branch.id,
                date: normalizeDate(billDate),
                notes: values.note ?? values.notes,
                transactionMode: values.transactionMode,
                warehouseId: purchaseWarehouseId,
              })
            }

            await refreshWeightTicketStatuses(tx, [
              ...receiptTicketIdsToRefresh,
              ...await resolveReferencedReceiptTicketIdsFromBillItems(tx, existingBillItems),
            ], {
              actor,
              createdAt,
              note: reason,
              reason: 'purchase_bill_supplier_swap',
            })
            await appendPurchaseBillStatusLog(tx, {
              action: PURCHASE_BILL_STATUS_ACTION.SUPPLIER_SWAP_CANCELLED,
              actor,
              createdAt,
              fromStatus: existingBill.status,
              meta: {
                replacementPurchaseBillDocNo: createdBill.doc_no,
                reason: 'supplier_swap',
              },
              note: reason,
              purchaseBillDocNo: existingBill.doc_no,
              purchaseBillId: existingBillRef.id,
              toStatus: PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS,
            })
            const settlement = await refreshPurchaseBillSettlement(tx, createdBill.id, actor)
            await createInitialPurchaseBillStatusLog(tx, {
              actor,
              createdAt,
              meta: {
                sourcePurchaseBillDocNo: existingBill.doc_no,
                supplierSwap: true,
                totalAmount: totals.totalAmount,
                transactionMode: values.transactionMode,
              },
              purchaseBillDocNo: createdBill.doc_no,
              purchaseBillId: createdBill.id,
              toStatus: settlement.status,
            })
            await tx.bill_swap_history.createMany({
              data: Array.from({ length: Math.max(existingBillItems.length, itemRows.length) }).map((_, index) => {
                const beforeItem = existingBillItems[index]
                const afterItem = itemRows[index]
                return {
                  after_amount: afterItem ? toNumber(afterItem.amount) : 0,
                  after_price: afterItem ? toNumber(afterItem.price) : 0,
                  after_supplier_id: supplier.id,
                  before_amount: beforeItem ? toNumber(beforeItem.amount) : 0,
                  before_price: beforeItem ? toNumber(beforeItem.price) : 0,
                  before_supplier_id: existingBill.supplier_id,
                  bill_id: existingBillRef.id,
                  changed_by: actor,
                  item_index: index,
                  reason: `${reason}: ${createdBill.doc_no}`,
                  swap_date: createdAt,
                }
              }),
            })
            return createdBill
          }, { timeout: 30000 })
          break
        } catch (caught) {
          if (!isDocNoConflict(caught) || attempt === 2) throw caught
        }
      }

      if (!replacementBill) throw new Error('สร้างบิลใหม่แทนไม่สำเร็จ')
      return NextResponse.json({
        docNo: replacementBill.doc_no,
        id: replacementBill.doc_no,
        replacedDocNo: existingBill.doc_no,
        status: 'supplier_swapped',
      })
    }

    const values = purchaseBillFormSchema.parse(raw)
    const actor = currentActor(context)

    const productRefs = [...new Set(values.items.map((item) => item.productId).filter(Boolean))]
    const poBuyRefs = [...new Set([values.poBuyId, ...values.items.map((item) => item.poBuyId)].filter(Boolean) as string[])]
    const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
    const [existingBill, supplier, poBuys, products, payments, existingBillItems, activeApprovalCount, warehouse] = await Promise.all([
      prisma.purchase_bills.findUnique({ where: { id: existingBillRef.id } }),
      findActiveSupplierReferenceByCodeOrId(values.supplierId),
      resolvePoBuysByDocNo(poBuyRefs),
      resolveProductsByCodeOrId(productRefs),
      prisma.payments.findMany({
        select: { amount: true, discount: true, status: true, withholding_tax: true },
        where: { bill_id: existingBillRef.id, NOT: { status: 'cancelled' } },
      }),
      prisma.purchase_bill_items.findMany({
        select: { po_buy_id: true, source_snapshot: true },
        where: {
          item_status: PURCHASE_BILL_ACTIVE_ITEM_STATUS,
          purchase_bill_id: existingBillRef.id,
        },
      }),
      prismaExt.payment_approvals.count({
        where: {
          source_id: stringifyBusinessValue(existingBillRef.id),
          source_type: 'purchase_bill',
          status: { in: [...LOCKED_PURCHASE_PAYMENT_APPROVAL_STATUSES] },
        },
      }),
      values.warehouseId ? findActiveWarehouseReferenceByCodeOrId(values.warehouseId) : Promise.resolve(null),
    ])

    if (!existingBill) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อ' }, { status: 404 })
    if (String(existingBill.status ?? '').toLowerCase().includes('cancel')) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลนี้ถูกยกเลิกแล้ว' }, { status: 400 })
    }
    const activePaidAmount = payments.reduce((sum, payment) => sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount), 0)
    if (payments.length > 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลนี้มีรอบจ่ายเงิน PMT แล้ว' }, { status: 400 })
    }
    if (activeApprovalCount > 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลนี้ถูกอนุมัติโอนเงินแล้ว ต้องยกเลิกรายการรอจ่ายก่อน' }, { status: 400 })
    }
    if (activePaidAmount > 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลนี้มีการชำระเงินแล้ว' }, { status: 400 })
    }
    if (values.transactionMode !== String(existingBill.transaction_mode ?? 'STOCK')) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะต้องคงประเภทบิลเดิมเพื่อให้ stock ledger audit ต่อเนื่อง' }, { status: 400 })
    }
    const billDate = existingBill.date ? toDateOnly(existingBill.date) : bangkokDateInput(new Date())
    const vatRatePercent = toNumber(existingBill.vat_rate_percent) ?? (await activeVatRatePercent(normalizeDate(billDate)))
    const totals = calculateTotals(values, vatRatePercent)
    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (allowedBranchCodes && !allowedBranchCodes.includes(branch.code)) {
      return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์ทำรายการในสาขาปลายทางที่เลือก' }, { status: 403 })
    }
    if (values.transactionMode === 'STOCK' && !warehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกคลังที่เปิดใช้งานสำหรับบิลรับซื้อ' }, { status: 400 })
    const supplierSalesId = supplier.salesId ?? null

    const effectiveBranch = branch
    if (!effectiveBranch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกสาขาก่อนบันทึกบิล' }, { status: 400 })
    if (values.transactionMode === 'STOCK' && warehouse?.branchCode !== effectiveBranch.code) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'คลังต้องอยู่ในสาขาเดียวกับบิลรับซื้อ' }, { status: 400 })
    }
    if (values.transactionMode === 'STOCK' && warehouse?.type?.toUpperCase() !== 'RM') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลรับซื้อ Stock ต้องใช้คลัง RM ของสาขาเท่านั้น' }, { status: 400 })
    }

    const poBuyById = createPoBuyRefMap(poBuys)
    const missingPoBuy = poBuyRefs.find((poBuyId) => !poBuyById.has(poBuyId))
    if (missingPoBuy) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy ที่เลือกไม่ถูกต้อง' }, { status: 400 })

    const productByRef = createProductRefMap(products as ProductRefRow[])
    const missingProduct = values.items.find((item) => !productByRef.has(item.productId))
    if (missingProduct) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    let receiptSummarySourceMap = new Map<string, ReceiptSummarySource>()
    let receiptTicketIdsToRefresh: bigint[] = []
    if (values.transactionMode === 'STOCK') {
      const receiptValidation = await validateStockReceiptSelection(values, effectiveBranch.id, supplier.id, poBuyById, productByRef, existingBillRef.id)
      if ('error' in receiptValidation) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: receiptValidation.error }, { status: 400 })
      }
      receiptSummarySourceMap = receiptValidation.receiptSummarySourceMap
      receiptTicketIdsToRefresh = [receiptValidation.ticket.id]
    }

    const items = buildBillItems(values, productByRef, poBuyById, receiptSummarySourceMap)
    const poBuyIds = extractReferencedPoBuyIdsFromBuiltItems(items)
    if (poBuyIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await reconcilePoBuys(tx, poBuyIds)
      }, { timeout: 30000 })
    }
    const purchaseSource = derivePurchaseSource(items, values.purchaseSource)
    const purchaseWarehouseId = values.transactionMode === 'STOCK' ? warehouse?.id ?? null : null

    const updatedBill = await prisma.$transaction(async (tx) => {
      const existingPoAllocationSources = await loadCurrentPoBuyAllocationLogSources(tx, existingBillRef.id)
      const existingWeightTicketUsageSources = await loadCurrentWeightTicketUsageLogSources(tx, existingBillRef.id)
      const bill = await tx.purchase_bills.update({
        data: {
          branch_id: effectiveBranch.id,
          discount: values.discountTotal,
          discount_total: values.discountTotal,
          has_vat: values.hasVat,
          license_plate: null,
          note: values.note ?? values.notes,
          notes: values.notes,
          paid_amount: toNumber(existingBill.paid_amount),
          payable_balance: toNumber(existingBill.payable_balance),
          po_buy_id: poBuyById.get(values.poBuyId ?? '')?.id ?? null,
          purchase_source: purchaseSource,
          ref_no: values.refNo,
          sales_id: supplierSalesId,
          status: existingBill.status,
          subtotal: totals.subtotal,
          supplier_id: supplier.id,
          ...(existingBill.supplier_id === supplier.id ? {} : supplierSnapshotFields(supplier)),
          total_amount: totals.totalAmount,
          transaction_mode: values.transactionMode,
          updated_at: new Date(),
          updated_by: actor,
          vat_amount: totals.vatAmount,
          vat_invoice_date: values.vatInvoiceDate ? normalizeDate(values.vatInvoiceDate) : null,
          vat_invoice_no: values.vatInvoiceNo,
          vat_invoice_received: values.vatInvoiceReceived,
          vat_invoice_received_at: values.vatInvoiceReceived ? new Date() : null,
          vat_rate_percent: vatRatePercent,
          vat_type: values.vatType,
          warehouse_id: purchaseWarehouseId,
        },
        select: { doc_no: true, id: true },
        where: { id: existingBillRef.id },
      })

      await releasePurchaseBillAllocations(tx, existingBillRef.id, {
        actor,
        reason: 'purchase_bill_edit',
        releasedAt: new Date(),
      })
      await supersedePurchaseBillItems(tx, existingBillRef.id, {
        actor,
        reason: 'purchase_bill_edit',
        supersededAt: new Date(),
      })
      const itemRows = await createPurchaseBillItems(tx, existingBillRef.id, items, await nextPurchaseBillItemVersion(tx, existingBillRef.id))
      const receiptAllocationRows = buildPurchaseBillReceiptAllocationRows(existingBillRef.id, itemRows, receiptSummarySourceMap, actor)
      if (receiptAllocationRows.length > 0) {
        await tx.purchase_bill_receipt_allocations.createMany({ data: receiptAllocationRows })
      }
      const nextWeightTicketUsageSources = buildWeightTicketUsageLogSourcesFromRows(bill.doc_no, receiptAllocationRows, itemRows)
      const weightTicketUsageDiff = diffWeightTicketUsageLogSources(existingWeightTicketUsageSources, nextWeightTicketUsageSources)
      await appendWeightTicketUsageLogSourceChanges(tx, [
        ...weightTicketUsageDiff.released.map((source) => ({
          action: WEIGHT_TICKET_USAGE_ACTION.RELEASED_FROM_PURCHASE_BILL,
          actor,
          meta: { reason: 'purchase_bill_edit' },
          source,
        })),
        ...weightTicketUsageDiff.allocated.map((source) => ({
          action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_PURCHASE_BILL,
          actor,
          meta: { reason: 'purchase_bill_edit' },
          source,
        })),
      ])
      const poAllocationRows = buildPurchaseBillPoAllocationRows(existingBillRef.id, itemRows, actor)
      if (poAllocationRows.length > 0) {
        await tx.purchase_bill_po_allocations.createMany({ data: poAllocationRows })
      }
      const nextPoAllocationSources = buildPoBuyAllocationLogSourcesFromRows(bill.doc_no, poAllocationRows, itemRows)
      const poAllocationDiff = diffPoBuyAllocationLogSources(existingPoAllocationSources, nextPoAllocationSources)
      await appendPoBuyAllocationLogSources(tx, poAllocationDiff.released, {
        action: PO_BUY_ALLOCATION_ACTION.RELEASED_FROM_PURCHASE_BILL,
        actor,
        meta: { reason: 'purchase_bill_edit' },
      })
      await appendPoBuyAllocationLogSources(tx, poAllocationDiff.allocated, {
        action: PO_BUY_ALLOCATION_ACTION.ALLOCATED_TO_PURCHASE_BILL,
        actor,
        meta: { reason: 'purchase_bill_edit' },
      })
        await applyPurchaseBillAdvanceAllocation(tx, {
          actor,
          branchId: effectiveBranch.id,
          billDocNo: bill.doc_no,
          billId: existingBillRef.id,
          maxAmount: totals.totalAmount,
          maxSubtotalAmount: totals.taxableBaseAmount,
          maxVatAmount: totals.vatAmount,
          supplierId: supplier.id,
          values: { advancePaymentId: values.advancePaymentId },
        })
      await reconcilePoBuys(tx, [
        ...extractReferencedPoBuyIdsFromBuiltItems(items),
        ...extractReferencedPoBuyIdsFromBillItems(existingBillItems),
      ], { actor })

      if (String(existingBill.transaction_mode ?? 'STOCK') === 'STOCK') {
        await appendPurchaseBillStockReversal(tx, {
          actor,
          billDocNo: existingBill.doc_no,
          date: normalizeDate(billDate),
          movementType: 'รับซื้อเข้า-แก้ไข',
          note: values.note ?? values.notes,
          notes: values.note ?? values.notes,
          reason: 'purchase_bill_edit',
          reversalRefType: 'PB-EDIT-REV',
        })
      }
      if (values.transactionMode === 'STOCK') {
        await tx.stock_ledger.createMany({
          data: items.map((item) => ({
            branch_id: effectiveBranch.id,
            created_by: actor,
            date: normalizeDate(billDate),
            lot_no: item.lotNo,
            movement_type: 'รับซื้อเข้า',
            note: item.note,
            notes: values.note ?? values.notes,
            output_category: item.itemStatus,
            product_id: item.productIdInternal,
            qty_in: item.qty,
            qty_out: 0,
            ref_id: existingBill.doc_no,
            ref_no: existingBill.doc_no,
            ref_type: 'PB',
            unit_cost: item.price,
            value_in: item.amount,
            value_out: 0,
            warehouse_id: purchaseWarehouseId,
          })),
        })
      }
      await syncPurchaseBillCostPoolEntries(tx, {
        actor,
        billId: existingBillRef.id,
        branchId: effectiveBranch.id,
        date: normalizeDate(billDate),
        notes: values.note ?? values.notes,
        transactionMode: values.transactionMode,
        warehouseId: purchaseWarehouseId,
      })

      await refreshWeightTicketStatuses(tx, [
        ...receiptTicketIdsToRefresh,
        ...await resolveReferencedReceiptTicketIdsFromBillItems(tx, existingBillItems),
      ], {
        actor,
        reason: 'purchase_bill_edit',
      })

      const settlement = await refreshPurchaseBillSettlement(tx, existingBillRef.id, actor)
      await appendPurchaseBillStatusLog(tx, {
        action: PURCHASE_BILL_STATUS_ACTION.EDITED,
        actor,
        fromStatus: existingBill.status,
        meta: {
          advancePaymentDocNo: values.advancePaymentId || null,
          totalAmount: totals.totalAmount,
          transactionMode: values.transactionMode,
        },
        purchaseBillDocNo: bill.doc_no,
        purchaseBillId: bill.id,
        toStatus: settlement.status,
      })
      return { ...bill, ...settlement }
    })

    return NextResponse.json({
      docNo: updatedBill.doc_no,
      id: updatedBill.doc_no,
      paidAmount: updatedBill.paidAmount,
      payableBalance: updatedBill.payableBalance,
      status: updatedBill.status,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขบิลรับซื้อไม่ได้', 400)
  }
}
