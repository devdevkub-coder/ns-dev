import { NextResponse } from 'next/server'
import { z } from 'zod'
import { XLSX } from '@/lib/server/xlsx'
import { salesBillFormSchema, type SalesBillFormValues } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission, type AppAuthContext } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { currentActor, nextDailyDocNo, normalizeDate, roundMoney, toDateOnly, toNumber } from '@/lib/server/daily'
import { requireBusinessCode } from '@/lib/business-code'
import { isCustomerEligibleForBranch } from '@/lib/server/party-branch-eligibility'
import { prisma } from '@/lib/server/prisma'
import { findActiveSalesChannelReferenceByCode } from '@/lib/server/sales-channel-reference'
import { activeSalesReceiptCount, activeSalesReceiptCountByBillId, isSalesBillActiveForCancel, salesBillCancelState } from '@/lib/server/sales-bill-cancel-policy'
import { appendSalesBillStatusLog, SALES_BILL_STATUS_ACTION } from '@/lib/server/sales-bill-history'
import { appendPoSellAllocationLogs, PO_SELL_ALLOCATION_ACTION } from '@/lib/server/po-sell-allocation-history'
import { salesBillLineFactsForBills, type SalesBillLineFactRow } from '@/lib/server/sales-bill-line-facts'
import { consumeActiveWtoPendingOut, releaseConsumedWtoPendingOutForSalesBill, reopenConsumedWtoPendingOutForSalesBill, WtoPendingOutError } from '@/lib/server/stock-holds'
import { activeVatRatePercent } from '@/lib/server/tax-settings'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'
import { appendWtoPendingOutEventsForHoldKeys, appendWtoPendingOutEventsForSalesBill, appendWtoPendingOutEventsFromHoldIds } from '@/lib/server/weight-ticket-pending-out-events'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION } from '@/lib/server/weight-ticket-usage-history'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type BillQuery = {
  dateFrom?: string
  dateTo?: string
  filterMode?: string
  page: number
  pageSize: number
  search?: string
  sortDirection: Prisma.SortOrder
  sortKey: string
  statuses?: string[]
}

type SalesBillRow = Prisma.sales_billsGetPayload<{
  include: {
    branches: true
    customers: true
    sales_bill_customer_advance_allocations: true
    sales_channels: true
    warehouses: true
  }
}>

type DecimalLike = { toNumber: () => number } | number

type DeliveryTicketOptionRow = {
  branch_id: bigint
  branches: { code: string | null; name: string | null } | null
  cancelled_at: Date | null
  customer_id: bigint | null
  customers: { code: string | null } | null
  doc_no: string
  doc_type: string
  document_date: Date
  id: bigint
  party_name: string
  status: string
  stock_holds: Array<{
    product_id: bigint
    qty: DecimalLike
    status: string
    unit_cost_snapshot: DecimalLike | null
    value_snapshot: DecimalLike | null
  }>
  vehicle_no: string
  weight_ticket_lines: Array<{
    deduct_weight: DecimalLike
    gross_weight: DecimalLike
    id: bigint
    line_no: number
    net_weight: DecimalLike
    note: string | null
    product_id: bigint | null
    product_name: string
  }>
  weight_ticket_product_summaries: Array<{
    billed_weight: DecimalLike
    deduct_weight: DecimalLike
    gross_weight: DecimalLike
    has_mixed_deduction_profiles: boolean | null
    id: bigint
    line_count: number | null
    net_weight: DecimalLike
    product_id: bigint | null
    product_name: string
    weight_ticket_product_summary_lines: Array<{
      weight_ticket_line_id: bigint
    }>
  }>
}

type DeliverySummarySource = DeliveryTicketOptionRow['weight_ticket_product_summaries'][number]

function parseBillQuery(url: URL, includePaging = true): BillQuery {
  return {
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    filterMode: url.searchParams.get('filterMode') || undefined,
    page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
    pageSize: includePaging ? Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)) : 10000,
    search: url.searchParams.get('search')?.trim() || undefined,
    sortDirection: url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    sortKey: url.searchParams.get('sortKey') || 'date',
    statuses: url.searchParams.get('status')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) || undefined,
  }
}

function billJson(row: SalesBillRow, activeReceiptCount = 0, lineCount?: number) {
  const cancelState = salesBillCancelState(row.status, activeReceiptCount)
  const canEdit = isSalesBillActiveForCancel(row.status) && activeReceiptCount === 0
  const editLockedReason = !isSalesBillActiveForCancel(row.status)
    ? 'บิลขายนี้ถูกยกเลิกแล้ว'
    : activeReceiptCount > 0
      ? 'แก้ไขบิลขายไม่ได้ เพราะมีรายการรับเงิน Customer แล้ว'
      : null
  return {
    branchId: row.branches?.code ?? '',
    branchName: row.branches?.name ?? '-',
    canCancel: cancelState.canCancel,
    canEdit,
    channelId: row.sales_channels?.code ?? '',
    channelName: row.sales_channels?.name ?? '-',
    createdAt: row.created_at?.toISOString(),
    createdBy: row.created_by ?? '',
    customerAdvanceDocNo: row.sales_bill_customer_advance_allocations.find((allocation) => allocation.status === 'active')?.customer_advance_doc_no ?? '',
    customerName: row.customers?.name ?? '-',
    date: toDateOnly(row.date),
    docNo: row.doc_no,
    editLockedReason,
    exportOrderNo: row.export_order_no ?? '',
    grossProfit: toNumber(row.gross_profit),
    id: row.doc_no,
    itemCount: lineCount ?? (Array.isArray(row.items) ? row.items.length : 0),
    lockedReason: cancelState.lockedReason,
    receivableBalance: toNumber(row.receivable_balance),
    receivedAmount: toNumber(row.received_amount),
    refNo: row.ref_no ?? '',
    status: row.status ?? 'open',
    subtotal: toNumber(row.subtotal),
    totalAmount: toNumber(row.total_amount),
    transactionMode: row.transaction_mode ?? 'STOCK',
    updatedAt: row.updated_at?.toISOString(),
    updatedBy: row.updated_by ?? '',
    vatInvoiceDate: row.vat_invoice_date ? toDateOnly(row.vat_invoice_date) : '',
    vatInvoiceIssued: row.vat_invoice_issued ?? false,
    vatInvoiceNo: row.vat_invoice_no ?? '',
    warehouseId: row.warehouses?.code ?? '',
    warehouseName: row.warehouses?.name ?? '-',
  }
}

async function salesBillLineCountByBillId(billIds: bigint[]) {
  if (!billIds.length) return new Map<bigint, number>()
  const rows = await prisma.sales_bill_lines.groupBy({
    _count: { id: true },
    by: ['sales_bill_id'],
    where: {
      sales_bill_id: { in: billIds },
      status: { in: ['active', 'cancelled'] },
    },
  })
  return new Map(rows.map((row) => [row.sales_bill_id, row._count.id] as const))
}

async function salesBranchScope(context: AppAuthContext, requestedBranchCode?: string | null) {
  const allowedCodes = getBranchCodeIntersection(context, requestedBranchCode)
  if (allowedCodes === null) return { codes: null, ids: null }
  if (allowedCodes.length === 0) return { codes: [], ids: [] as bigint[] }
  const branches = await prisma.branches.findMany({
    select: { code: true, id: true },
    where: { code: { in: allowedCodes } },
  })
  return {
    codes: allowedCodes,
    ids: branches.map((branch) => branch.id),
  }
}

function scopedBranchWhere(allowedBranchIds: bigint[] | null): Prisma.sales_billsWhereInput {
  return allowedBranchIds === null ? {} : { branch_id: { in: allowedBranchIds } }
}

function billWhere(query: BillQuery, allowedBranchIds: bigint[] | null = null): Prisma.sales_billsWhereInput {
  const where: Prisma.sales_billsWhereInput = {}
  Object.assign(where, scopedBranchWhere(allowedBranchIds))

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: normalizeDate(query.dateTo) } : {}),
    }
  }
  if (query.filterMode) where.transaction_mode = query.filterMode
  if (query.statuses?.length) where.status = { in: query.statuses }
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { ref_no: { contains: query.search, mode: 'insensitive' } },
      { customers: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { branches: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { warehouses: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

function billOrderBy(query: BillQuery): Prisma.sales_billsOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.sales_billsOrderByWithRelationInput = (() => {
    switch (query.sortKey) {
      case 'docNo':
        return { doc_no: direction }
      case 'name':
        return { customer_id: direction }
      case 'outstanding':
        return { receivable_balance: direction }
      case 'status':
        return { status: direction }
      case 'totalAmount':
        return { total_amount: direction }
      case 'warehouse':
        return { branch_id: direction }
      case 'date':
      default:
        return { date: direction }
    }
  })()

  return [primary, { doc_no: direction }]
}

function calculateSalesTotals(values: SalesBillFormValues, vatRatePercent: number) {
  const grossProfitBase = values.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price), 0)
  const subtotal = values.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const afterDiscount = Math.max(0, subtotal - values.discountTotal)
  const rate = Math.max(0, Math.min(100, vatRatePercent))
  const vatAmount = !values.hasVat || values.vatType === 'NONE'
    ? 0
    : values.vatType === 'INCLUDE'
      ? afterDiscount * rate / (100 + rate)
      : afterDiscount * (rate / 100)
  const totalAmount = values.hasVat && values.vatType === 'EXCLUDE' ? afterDiscount + vatAmount : afterDiscount
  return { grossProfitBase, subtotal, totalAmount, vatAmount }
}

function salesItems(
  values: SalesBillFormValues,
  parsedProductIds: bigint[],
  productById: Map<bigint, { code: string | null; name: string; unit: string | null }>,
  deliverySummarySourceMap: Map<string, DeliverySummarySource> = new Map(),
  deliverySummaryIdByIndex: Map<number, string> = new Map(),
  stockIssueQtyByIndex: Map<number, number> = new Map(),
  lineNoByIndex: Map<number, number> = new Map(),
) {
  return values.items.map((item, index) => {
    const lineNo = lineNoByIndex.get(index) ?? item.salesBillLineNo ?? index + 1
    const productId = parsedProductIds[index]
    const product = productById.get(productId)
    const deliverySummaryId = item.deliveryTicketId ? deliverySummaryIdByIndex.get(index) ?? null : item.deliverySummaryId ?? null
    if (item.deliveryTicketId && !deliverySummaryId) {
      throw new Error(`Sales Bill item ${index + 1} missing validated WTO product summary`)
    }
    const deliverySummary = deliverySummaryId ? deliverySummarySourceMap.get(deliverySummaryId) : null
    const stockIssueQty = deliverySummary
      ? stockIssueQtyByIndex.get(index) ?? 0
      : item.qty
    const amount = Math.max(0, item.qty * item.price - item.discount)
    return {
      amount,
      customerAdvanceId: values.customerAdvanceId,
      deliveryLineId: item.deliveryLineId,
      deliverySummaryId,
      deliveryTicketDocNo: item.deliveryTicketDocNo,
      deliveryTicketId: item.deliveryTicketId,
      deductWeight: item.deductWeight,
      discount: item.discount,
      grossWeight: deliverySummary ? item.netWeight : item.grossWeight,
      id: `${String(lineNo).padStart(2, '0')}`,
      lineNo,
      netWeight: item.qty,
      note: item.note,
      poSellId: item.poSellId,
      productCode: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productId: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productName: product?.name ?? '',
      qty: item.qty,
      stockIssueQty,
      tradingCostSourceId: item.tradingCostSourceId,
      unit: product?.unit ?? 'กก.',
      unitPrice: item.price,
    }
  })
}

type SalesItemSnapshot = ReturnType<typeof salesItems>[number]

function isDeliveryBackedSalesItem(item: Pick<SalesItemSnapshot, 'deliveryTicketId'>) {
  return Boolean(item.deliveryTicketId)
}

function salesBillLineRows(input: {
  actor: string
  billId: bigint
  createdAt: Date
  items: SalesItemSnapshot[]
  parsedProductIds: bigint[]
  totals: ReturnType<typeof calculateSalesTotals>
}) {
  const taxableBasis = input.items.reduce((sum, item) => sum + Math.max(0, item.amount), 0)
  return input.items.map((item, index) => ({
    created_at: input.createdAt,
    created_by: input.actor,
    deduct_weight: item.deductWeight,
    discount_amount: item.discount,
    gross_weight: item.grossWeight,
    line_amount: item.amount,
    line_no: item.lineNo,
      meta: {
        deliveryLineId: item.deliveryLineId ?? null,
        deliverySummaryId: item.deliverySummaryId ?? null,
        stockIssueQty: item.stockIssueQty,
        tradingCostSourceId: item.tradingCostSourceId ?? null,
      },
    net_weight: item.netWeight,
    notes: item.note || null,
    product_code_snapshot: item.productCode,
    product_id: input.parsedProductIds[index] ?? null,
    product_name_snapshot: item.productName,
    qty: item.qty,
    sales_bill_id: input.billId,
    status: 'active',
    unit_price: item.unitPrice,
    unit_snapshot: item.unit,
    updated_at: input.createdAt,
    updated_by: input.actor,
    vat_amount: taxableBasis > 0 ? input.totals.vatAmount * (Math.max(0, item.amount) / taxableBasis) : 0,
  }))
}

function poSellAllocationRows(input: {
  actor: string
  billId: bigint
  createdAt: Date
  headerPoSellDocNo?: string
  items: SalesItemSnapshot[]
  lineIdByLineNo: Map<number, bigint>
  parsedProductIds: bigint[]
  poSellByDocNo: Map<string, PoSellForAllocation>
}) {
  return input.items.flatMap((item, index) => {
    if (item.qty <= 0.0001) return []
    const lineNo = item.lineNo
    const poSellDocNo = item.poSellId || input.headerPoSellDocNo || ''
    const poSell = poSellDocNo ? input.poSellByDocNo.get(poSellDocNo) : null
    const allocationType = poSell ? 'PO_SELL' : 'SPOT_SALE'
    return [{
      allocated_amount: item.amount,
      allocated_qty: item.qty,
      allocation_type: allocationType,
      created_at: input.createdAt,
      created_by: input.actor,
      meta: {
        source: 'sales_bill_create',
      },
      po_sell_doc_no: poSell?.doc_no ?? null,
      po_sell_id: poSell?.id ?? null,
      po_sell_line_no: null,
      product_code_snapshot: item.productCode,
      product_id: input.parsedProductIds[index] ?? null,
      product_name_snapshot: item.productName,
      sales_bill_id: input.billId,
      sales_bill_line_id: input.lineIdByLineNo.get(lineNo) ?? null,
      sales_line_no: lineNo,
      status: 'active',
      unit_price: item.unitPrice,
      updated_at: input.createdAt,
      updated_by: input.actor,
    }]
  })
}

function sourceLineNoFromDeliveryLineId(deliveryLineId: string | null | undefined) {
  const match = /:(\d+)$/.exec(deliveryLineId ?? '')
  if (!match) return null
  const lineNo = Number(match[1])
  return Number.isInteger(lineNo) && lineNo > 0 ? lineNo : null
}

function sourceAllocationRows(input: {
  actor: string
  billId: bigint
  createdAt: Date
  deliverySummarySourceMap: Map<string, DeliverySummarySource>
  items: SalesItemSnapshot[]
  lineIdByLineNo: Map<number, bigint>
  productCodeById: Map<bigint, string>
  stockDeliveryTicket: DeliveryTicketOptionRow | null
}) {
  if (!input.stockDeliveryTicket) return []

  return input.items.flatMap((item, index) => {
    if (!isDeliveryBackedSalesItem(item)) return []
    const lineNo = item.lineNo
    const stockIssueQty = Math.max(0, item.stockIssueQty)
    if (stockIssueQty <= 0.0001) return []
    const summarySource = item.deliverySummaryId ? input.deliverySummarySourceMap.get(item.deliverySummaryId) : null
    if (!summarySource || summarySource.product_id == null) {
      throw new Error(`Sales Bill WTO source allocation missing product summary for line ${lineNo}`)
    }
    const sourceProductCode = input.productCodeById.get(summarySource.product_id)
    if (!sourceProductCode) {
      throw new Error(`Sales Bill WTO source allocation missing product code for line ${lineNo}`)
    }
    if (!item.deliveryTicketDocNo) {
      throw new Error(`Sales Bill WTO source allocation missing delivery ticket document for line ${lineNo}`)
    }
    return [{
      allocated_deduct_weight: item.deductWeight,
      allocated_gross_weight: item.grossWeight,
      allocated_net_weight: stockIssueQty,
      allocated_qty: stockIssueQty,
      created_at: input.createdAt,
      created_by: input.actor,
      meta: {
        deliveryLineId: item.deliveryLineId ?? null,
        deliverySummaryId: item.deliverySummaryId ?? null,
        salesNetWeight: item.qty,
        source: 'sales_bill_create_from_wto',
        stockIssueQty,
        salesProductCode: item.productCode,
        salesProductName: item.productName,
      },
      movement_owner: 'SALES_BILL',
      product_code_snapshot: sourceProductCode,
      product_id: summarySource.product_id,
      product_name_snapshot: summarySource.product_name,
      sales_bill_id: input.billId,
      sales_bill_line_id: input.lineIdByLineNo.get(lineNo) ?? null,
      sales_line_no: lineNo,
      source_doc_no: item.deliveryTicketDocNo,
      source_id: input.stockDeliveryTicket!.id,
      source_line_no: sourceLineNoFromDeliveryLineId(item.deliveryLineId),
      source_type: 'WTO',
      status: 'active',
      stock_issue_id: null,
      stock_ledger_ref_type: 'SB',
      updated_at: input.createdAt,
      updated_by: input.actor,
      weight_ticket_id: input.stockDeliveryTicket!.id,
      weight_ticket_product_summary_id: summarySource.id,
    }]
  })
}

function parseTradingCostSourceId(sourceId: string) {
  const parts = sourceId.split(':')
  const sourceType = parts[0] === 'SRC' ? 'MANUAL' : 'PB'
  const [docNo, lineNoText] = sourceType === 'MANUAL' ? [parts[1], parts[2] ?? '1'] : parts[0] === 'PB' ? [parts[1], parts[2]] : parts
  const lineNo = Number(lineNoText)
  if (!docNo || !Number.isInteger(lineNo) || lineNo <= 0) return null
  return { docNo, lineNo, sourceType }
}

type TradingCostSourceLine = {
  amount: number
  billId: bigint | null
  costSourceId: bigint | null
  docNo: string
  lineNo: number
  productCode: string
  productId: bigint | null
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  supplierId: bigint | null
  supplierName: string | null
  type: 'MANUAL' | 'PB'
  unitCost: number
}

function deliverySummaryUsageKey(ticketId: bigint, summaryId: bigint) {
  return `${ticketId.toString()}:${summaryId.toString()}`
}

async function buildDeliveryTicketUsageMap(tickets: DeliveryTicketOptionRow[]) {
  if (tickets.length === 0) return new Map<string, number>()
  const ticketIds = [...new Set(tickets.map((ticket) => ticket.id.toString()))].map((ticketId) => BigInt(ticketId))
  const rows = await prisma.$queryRaw<Array<{
    allocated_qty: Prisma.Decimal | number
    delivery_summary_id: string | null
    weight_ticket_id: bigint
  }>>`
    select
      sba.allocated_qty,
      sba.meta ->> 'deliverySummaryId' as delivery_summary_id,
      sba.weight_ticket_id
    from public.sales_bill_source_allocations sba
    join public.sales_bills sb on sb.id = sba.sales_bill_id
    where lower(coalesce(sb.status, '')) not in ('cancelled', 'void', 'voided')
      and sba.status = 'active'
      and sba.source_type = 'WTO'
      and sba.weight_ticket_id in (${Prisma.join(ticketIds)})
  `
  const usageMap = new Map<string, number>()
  rows.forEach((row) => {
    const summaryId = row.delivery_summary_id
    const qty = toNumber(row.allocated_qty)
    if (!summaryId || qty <= 0.0001) return
    usageMap.set(summaryId, (usageMap.get(summaryId) ?? 0) + qty)
  })
  return usageMap
}

function deliveryTicketOptionJson(
  row: DeliveryTicketOptionRow,
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
  const activeCostByProductId = new Map<string, { missingCost: boolean; qty: number; value: number }>()
  row.stock_holds.forEach((hold) => {
    if (hold.status !== 'active') return
    const key = String(hold.product_id)
    const current = activeCostByProductId.get(key) ?? { missingCost: false, qty: 0, value: 0 }
    const qty = toNumber(hold.qty)
    const unitCost = hold.unit_cost_snapshot == null ? null : toNumber(hold.unit_cost_snapshot)
    current.qty += qty
    if (unitCost == null) {
      current.missingCost = true
    } else {
      current.value += hold.value_snapshot == null ? qty * unitCost : toNumber(hold.value_snapshot)
    }
    activeCostByProductId.set(key, current)
  })

  const productSummaries = row.weight_ticket_product_summaries.map((summary) => {
    const productCode = summary.product_id != null ? (productCodeById.get(summary.product_id) ?? '') : ''
    const outwardSummaryId = `${row.doc_no}:${productCode}:${summary.line_count ?? 0}`
    const usedQty = usageMap.get(outwardSummaryId) ?? usageMap.get(deliverySummaryUsageKey(row.id, summary.id)) ?? 0
    const netWeight = toNumber(summary.net_weight)
    const remainingWeight = Math.max(0, netWeight - usedQty)
    const activeCost = summary.product_id == null ? null : activeCostByProductId.get(String(summary.product_id))
    const unitCostSnapshot = activeCost && activeCost.qty > 0 && !activeCost.missingCost
      ? activeCost.value / activeCost.qty
      : null
    return {
      billedWeight: toNumber(summary.billed_weight),
      deductWeight: toNumber(summary.deduct_weight),
      grossWeight: toNumber(summary.gross_weight),
      hasMixedDeductionProfiles: summary.has_mixed_deduction_profiles ?? false,
      id: outwardSummaryId,
      lineCount: summary.line_count ?? 0,
      netWeight,
      productId: productCode,
      productName: summary.product_name,
      remainingWeight,
      sourceLineIds: summary.weight_ticket_product_summary_lines.flatMap((bridge) => {
        const outwardLineId = outwardLineIdByInternalLineId.get(bridge.weight_ticket_line_id)
        return outwardLineId ? [outwardLineId] : []
      }),
      unitCostSnapshot,
    }
  }).filter((summary) => summary.remainingWeight > 0.0001)

  return {
    branchId: row.branches?.code ?? '',
    branchName: row.branches?.name ?? '-',
    customerId: row.customers?.code ?? '',
    documentDate: toDateOnly(row.document_date),
    documentNo: row.doc_no,
    id: row.doc_no,
    lines,
    partyName: row.party_name,
    productSummaries,
    status: row.status,
    vehicleNo: row.vehicle_no,
  }
}

function deliverySummaryOutwardId(ticketDocNo: string, productCode: string, lineCount: number | null | undefined) {
  return `${ticketDocNo}:${productCode}:${lineCount ?? 0}`
}

async function loadDeliveryAvailability(deliveryDocNo: string, input?: { excludeSalesBillId?: bigint | null }) {
  const ticket = await prisma.weight_tickets.findFirst({
    include: {
      branches: true,
      customers: true,
      weight_ticket_product_summaries: {
        include: {
          weight_ticket_product_summary_lines: true,
        },
        orderBy: { product_name: 'asc' },
      },
      weight_ticket_lines: { orderBy: { line_no: 'asc' } },
      stock_holds: {
        select: {
          product_id: true,
          qty: true,
          status: true,
          unit_cost_snapshot: true,
          value_snapshot: true,
        },
        where: { status: 'active' },
      },
    },
    where: {
      doc_no: deliveryDocNo,
    },
  })
  if (!ticket) return { ticket: null, usedQtyBySummaryId: new Map<string, number>() }

  const allocations = await prisma.sales_bill_source_allocations.findMany({
    select: {
      allocated_qty: true,
      meta: true,
    },
    where: {
      source_doc_no: deliveryDocNo,
      source_type: 'WTO',
      status: 'active',
      ...(input?.excludeSalesBillId != null ? { sales_bill_id: { not: input.excludeSalesBillId } } : {}),
    },
  })
  const usedQtyBySummaryId = new Map<string, number>()
  allocations.forEach((allocation) => {
    const meta = allocation.meta && typeof allocation.meta === 'object' && !Array.isArray(allocation.meta)
      ? allocation.meta as Record<string, unknown>
      : {}
    const summaryId = typeof meta.deliverySummaryId === 'string' ? meta.deliverySummaryId : ''
    const qty = toNumber(allocation.allocated_qty)
    if (!summaryId || qty <= 0.0001) return
    usedQtyBySummaryId.set(summaryId, (usedQtyBySummaryId.get(summaryId) ?? 0) + qty)
  })

  return { ticket, usedQtyBySummaryId }
}

function deliveryReferenceMaps(ticket: DeliveryTicketOptionRow, productCodeById: Map<bigint, string>) {
  const lineToSummaryRef = new Map<string, string>()
  const deliverySummarySourceMap = new Map<string, DeliverySummarySource>()
  const outwardLineIdByInternalLineId = new Map(ticket.weight_ticket_lines.map((line) => [line.id, `${ticket.doc_no}:${line.line_no}`] as const))
  ticket.weight_ticket_product_summaries.forEach((summary) => {
    const productCode = summary.product_id != null ? productCodeById.get(summary.product_id) ?? '' : ''
    const outwardSummaryId = deliverySummaryOutwardId(ticket.doc_no, productCode, summary.line_count)
    deliverySummarySourceMap.set(outwardSummaryId, summary)
    summary.weight_ticket_product_summary_lines.forEach((bridge) => {
      const outwardLineId = outwardLineIdByInternalLineId.get(bridge.weight_ticket_line_id)
      if (outwardLineId) lineToSummaryRef.set(outwardLineId, outwardSummaryId)
    })
  })
  return { deliverySummarySourceMap, lineToSummaryRef }
}

type PoSellSnapshotItem = {
  discount?: unknown
  id?: unknown
  note?: unknown
  productCode?: unknown
  productId?: unknown
  productName?: unknown
  qty?: unknown
  remainingQty?: unknown
  totalAmount?: unknown
  totalRevenue?: unknown
  unit?: unknown
  unitPrice?: unknown
  [key: string]: unknown
}

type PoSellForAllocation = {
  branch_id?: bigint | null
  customer_id?: bigint | null
  doc_no?: string | null
  id?: bigint
  items: unknown
  qty: unknown
  remaining_amount: unknown
  remaining_qty: unknown
  status?: string | null
  total_amount: unknown
  unit_price: unknown
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function productCodeFromItem(item: PoSellSnapshotItem) {
  const value = item.productCode ?? item.productId
  return typeof value === 'string' ? value.trim() : ''
}

function poSellSnapshotItems(items: unknown): PoSellSnapshotItem[] {
  return Array.isArray(items)
    ? items.filter((item): item is PoSellSnapshotItem => typeof item === 'object' && item !== null && !Array.isArray(item))
    : []
}

function isInactivePoSellStatus(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase()
  return ['cancelled', 'canceled', 'closed', 'completed', 'fully matched', 'received', 'void'].includes(normalized)
}

function allocatePoSellForSalesBill(poSell: PoSellForAllocation, billItems: SalesItemSnapshot[]) {
  const hasItemRows = Array.isArray(poSell.items) && poSell.items.length > 0
  const poItems: PoSellSnapshotItem[] = hasItemRows
    ? (poSell.items as unknown[]).filter((item): item is PoSellSnapshotItem => typeof item === 'object' && item !== null)
    : [{
        productCode: '',
        productId: '',
        qty: jsonNumber(poSell.qty),
        remainingQty: jsonNumber(poSell.remaining_qty ?? poSell.qty),
        totalRevenue: jsonNumber(poSell.total_amount),
        unitPrice: jsonNumber(poSell.unit_price),
      }]

  const nextItems = poItems.map((item) => ({
    ...item,
    remainingQty: jsonNumber(item.remainingQty ?? item.qty),
  }))

  let usedAmount = 0
  let usedQty = 0

  for (const billItem of billItems) {
    let needQty = jsonNumber(billItem.qty)
    if (needQty <= 0) continue
    const candidates = nextItems.filter((item) => {
      const poProductCode = productCodeFromItem(item)
      return !poProductCode || poProductCode === billItem.productCode || poProductCode === billItem.productId
    })
    if (!candidates.length) return { error: `สินค้า ${billItem.productCode} ไม่อยู่ใน PO Sell ที่เลือก` }

    for (const candidate of candidates) {
      if (needQty <= 0.001) break
      const availableQty = jsonNumber(candidate.remainingQty)
      if (availableQty <= 0) continue
      const qtyToUse = Math.min(availableQty, needQty)
      candidate.remainingQty = availableQty - qtyToUse
      needQty -= qtyToUse
      usedQty += qtyToUse
      usedAmount += qtyToUse * jsonNumber(candidate.unitPrice)
    }

    if (needQty > 0.001) return { error: `จำนวนสินค้า ${billItem.productCode} เกินยอดคงเหลือใน PO Sell` }
  }

  const remainingQty = nextItems.reduce((sum, item) => sum + Math.max(0, jsonNumber(item.remainingQty)), 0)
  const remainingAmount = hasItemRows
    ? nextItems.reduce((sum, item) => sum + Math.max(0, jsonNumber(item.remainingQty)) * jsonNumber(item.unitPrice), 0)
    : Math.max(0, jsonNumber(poSell.remaining_amount ?? poSell.total_amount) - usedAmount)

  return {
    items: hasItemRows ? nextItems : null,
    remainingAmount,
    remainingQty,
    usedAmount,
    usedQty,
  }
}

async function validateStockDeliverySelection(
  values: SalesBillFormValues,
  resolvedBranchId: bigint | null,
  resolvedCustomerId: bigint,
  productByRef: Map<string, { code: string | null; id: bigint; name: string; unit: string | null }>,
  productCodeById: Map<bigint, string>,
  input?: { excludeSalesBillId?: bigint | null },
) {
  const deliveryDocNo = values.deliveryTicketId?.trim()
  if (!deliveryDocNo) {
    return { error: 'เลือกใบส่งของ WTO' as const }
  }
  const deliveryItems = values.items.filter((item) => item.deliveryTicketId)
  if (deliveryItems.length === 0) {
    return { error: 'เลือกหรือเพิ่มรายการจากใบส่งของ WTO ก่อนบันทึก' as const }
  }

  const { ticket, usedQtyBySummaryId } = await loadDeliveryAvailability(deliveryDocNo, input)
  if (!ticket || ticket.doc_type !== 'WTO' || ticket.cancelled_at) {
    return { error: 'ใบส่งของที่เลือกไม่ถูกต้อง' as const }
  }
  if (resolvedBranchId && ticket.branch_id !== resolvedBranchId) {
    return { error: 'ใบส่งของต้องอยู่สาขาเดียวกับบิลขาย' as const }
  }
  if (ticket.customer_id !== resolvedCustomerId) {
    return { error: 'ใบส่งของต้องเป็นลูกค้าเดียวกับบิลขาย' as const }
  }
  const missingSourceProductIds = [...new Set(ticket.weight_ticket_product_summaries
    .map((summary) => summary.product_id)
    .filter((productId): productId is bigint => productId != null && !productCodeById.has(productId)))]
  if (missingSourceProductIds.length > 0) {
    const sourceProducts = await prisma.products.findMany({
      select: { code: true, id: true },
      where: { id: { in: missingSourceProductIds } },
    })
    sourceProducts.forEach((product) => {
      productCodeById.set(product.id, requireBusinessCode(product.code, `สินค้า ${product.id}`))
    })
  }

  const { deliverySummarySourceMap, lineToSummaryRef } = deliveryReferenceMaps(ticket, productCodeById)
  const availableQtyBySummaryId = new Map<string, number>()
  const acceptedWeightBySummaryId = new Map<string, number>()
  const deliverySummaryIdByItemIndex = new Map<number, string>()
  const stockIssueQtyByItemIndex = new Map<number, number>()

  for (const summary of ticket.weight_ticket_product_summaries) {
    const productCode = summary.product_id != null ? productCodeById.get(summary.product_id) ?? '' : ''
    const summaryId = deliverySummaryOutwardId(ticket.doc_no, productCode, summary.line_count)
    const availableQty = Math.max(0, toNumber(summary.net_weight) - (usedQtyBySummaryId.get(summaryId) ?? 0))
    availableQtyBySummaryId.set(summaryId, availableQty)
  }

  for (const [itemIndex, item] of values.items.entries()) {
    if (!item.deliveryTicketId) continue
    const resolvedSummaryRef = item.deliverySummaryId ?? (item.deliveryLineId ? lineToSummaryRef.get(item.deliveryLineId) ?? null : null)
    if (item.deliveryTicketId !== ticket.doc_no || !resolvedSummaryRef) {
      return { error: 'รายการ Stock ต้องอ้างอิงรายการจากใบส่งของเดียวกัน' as const }
    }
    const summarySource = deliverySummarySourceMap.get(resolvedSummaryRef)
    if (!summarySource) {
      return { error: 'มีรายการอ้างอิงใบส่งของที่ไม่ถูกต้อง' as const }
    }
    deliverySummaryIdByItemIndex.set(itemIndex, resolvedSummaryRef)
    const itemProduct = productByRef.get(item.productId)
    if (!itemProduct) {
      return { error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' as const }
    }
    const buyerAcceptedWeight = Math.max(0, item.netWeight)
    const expectedNetWeight = Number(Math.max(0, buyerAcceptedWeight - item.deductWeight).toFixed(2))
    if (item.deductWeight > buyerAcceptedWeight + 0.0001) {
      return { error: `หักสิ่งเจือปนของ ${summarySource.product_name} เกินจำนวนที่ขายได้` as const }
    }
    if (Math.abs(expectedNetWeight - item.qty) > 0.01) {
      return { error: `น้ำหนักขายสุทธิของ ${summarySource.product_name} ไม่ตรงกับจำนวนที่ขายได้หลังหักสิ่งเจือปน` as const }
    }
    if (buyerAcceptedWeight <= 0.0001) {
      if (input?.excludeSalesBillId) {
        stockIssueQtyByItemIndex.set(itemIndex, 0)
        continue
      }
      return { error: `กรอกจำนวนที่ขายได้ของ ${summarySource.product_name}` as const }
    }
    const acceptedBefore = acceptedWeightBySummaryId.get(resolvedSummaryRef) ?? 0
    const availableQty = availableQtyBySummaryId.get(resolvedSummaryRef) ?? 0
    const remainingForStock = Math.max(0, availableQty - acceptedBefore)
    const stockIssueQty = Math.min(buyerAcceptedWeight, remainingForStock)
    if (stockIssueQty <= 0.0001) {
      return { error: `${summarySource.product_name} ไม่มี pending_out คงเหลือสำหรับตัด stock` as const }
    }
    acceptedWeightBySummaryId.set(resolvedSummaryRef, acceptedBefore + buyerAcceptedWeight)
    stockIssueQtyByItemIndex.set(itemIndex, Number(stockIssueQty.toFixed(2)))
  }

  return { deliverySummaryIdByItemIndex, deliverySummarySourceMap, stockIssueQtyByItemIndex, ticket }
}

async function salesOptionsPayload(scope: Awaited<ReturnType<typeof salesBranchScope>>) {
  const allowedBranchCodes = scope.codes
  const allowedBranchIds = scope.ids
  const [branches, customers, products, salesChannels, warehouses, vatRatePercent, deliveryTickets, poSellRows, tradingPurchaseBills, tradingManualCostSources, tradingAllocationFacts, customerAdvanceRows, customerAdvanceAllocations] = await Promise.all([
    prisma.branches.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
      select: { active: true, code: true, id: true, name: true },
      where: {
        ...(allowedBranchCodes ? { code: { in: allowedBranchCodes } } : {}),
      },
    }),
    prisma.customers.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        active: true,
        code: true,
        id: true,
        market_scope: true,
        name: true,
        customer_branches: {
          select: {
            branches: { select: { code: true } },
          },
          where: { active: true },
        },
      },
    }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.sales_channels.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.warehouses.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
      select: {
        active: true,
        branches: { select: { code: true } },
        branch_id: true,
        code: true,
        id: true,
        name: true,
      },
      where: {
        ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
      },
    }),
    activeVatRatePercent(new Date()),
    prisma.weight_tickets.findMany({
      include: {
        branches: true,
        customers: true,
        weight_ticket_product_summaries: {
          include: {
            weight_ticket_product_summary_lines: true,
          },
          orderBy: { product_name: 'asc' },
        },
        weight_ticket_lines: { orderBy: { line_no: 'asc' } },
        stock_holds: {
          select: {
            product_id: true,
            qty: true,
            status: true,
            unit_cost_snapshot: true,
            value_snapshot: true,
          },
          where: { status: 'active' },
        },
      },
      orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
      take: 300,
      where: {
        ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        cancelled_at: null,
        doc_type: 'WTO',
        status: 'delivered',
      },
    }),
    prisma.po_sells.findMany({
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      select: {
        branch_id: true,
        customer_id: true,
        doc_no: true,
        id: true,
        items: true,
        product_id: true,
        qty: true,
        remaining_amount: true,
        remaining_qty: true,
        status: true,
        total_amount: true,
        unit_price: true,
      },
      take: 500,
      where: {
        ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        status: { notIn: ['cancelled', 'canceled', 'closed', 'completed', 'fully matched', 'received', 'void', 'Cancelled', 'Canceled', 'Closed', 'Completed'] },
      },
    }),
    prisma.purchase_bills.findMany({
      include: {
        purchase_bill_items: {
          orderBy: { line_no: 'asc' },
          select: {
            amount: true,
            line_no: true,
            product_code: true,
            product_id: true,
            product_name: true,
            qty: true,
          },
          where: { item_status: 'active' },
        },
        suppliers: { select: { branch_id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 500,
      where: {
        ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        status: { notIn: ['cancelled', 'Cancelled', 'void', 'voided', 'reversed'] },
        transaction_mode: 'TRADING',
      },
    }),
    prisma.trading_cost_sources.findMany({
      include: {
        products: { select: { code: true, name: true } },
        suppliers: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { source_no: 'desc' }],
      take: 500,
      where: {
        ...(allowedBranchIds ? { suppliers: { is: { branch_id: { in: allowedBranchIds } } } } : {}),
        status: 'active',
      },
    }),
    prisma.trading_allocation_facts.findMany({
      select: {
        matched_cogs: true,
        purchase_bill_id: true,
        qty: true,
        source_doc_no: true,
        source_line_no: true,
        trading_cost_source_id: true,
      },
      where: { status: 'active' },
    }),
    prisma.bank_statement.findMany({
      include: {
        accounts: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      take: 500,
      where: {
        ref_type: 'CADV',
      },
    }),
    prisma.sales_bill_customer_advance_allocations.findMany({
      select: {
        allocated_amount: true,
        customer_advance_doc_no: true,
      },
      where: {
        status: 'active',
      },
    }),
  ])
  const deliveryUsageMap = await buildDeliveryTicketUsageMap(deliveryTickets)
  const productCodeById = new Map(products.map((product) => [product.id, requireBusinessCode(product.code, `สินค้า ${product.id}`)]))
  const branchCodeById = new Map(branches.map((branch) => [branch.id, requireBusinessCode(branch.code, `สาขา ${branch.id}`)]))
  const customerCodeById = new Map(customers.map((customer) => [customer.id, requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)]))
  const customerByCode = new Map(customers.map((customer) => [requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`), customer] as const))
  const matchedTradingCostBySource = new Map<string, { amount: number; qty: number }>()
  tradingAllocationFacts.forEach((fact) => {
    const sourceLineNo = fact.source_line_no
    const sourceKey = fact.purchase_bill_id != null && sourceLineNo != null
      ? `${fact.purchase_bill_id.toString()}:${sourceLineNo}`
      : fact.trading_cost_source_id != null
        ? `SRC:${fact.trading_cost_source_id.toString()}:1`
      : fact.source_doc_no && sourceLineNo != null
        ? `${fact.source_doc_no}:${sourceLineNo}`
        : null
    if (!sourceKey) return
    const current = matchedTradingCostBySource.get(sourceKey) ?? { amount: 0, qty: 0 }
    current.amount += toNumber(fact.matched_cogs)
    current.qty += toNumber(fact.qty)
    matchedTradingCostBySource.set(sourceKey, current)
  })
  const customerAdvanceUsedById = new Map<string, number>()
  customerAdvanceAllocations.forEach((allocation) => {
    customerAdvanceUsedById.set(
      allocation.customer_advance_doc_no,
      (customerAdvanceUsedById.get(allocation.customer_advance_doc_no) ?? 0) + toNumber(allocation.allocated_amount),
    )
  })

  return {
    branches: branches.map((branch) => ({
      ...branch,
      id: branch.code,
    })),
    customers: customers.map((customer) => ({
      id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
      active: customer.active,
      branchIds: customer.customer_branches
        .map((mapping) => mapping.branches?.code)
        .filter((branchCode): branchCode is string => Boolean(branchCode)),
      code: customer.code,
      marketScope: customer.market_scope === 'ต่างประเทศ' ? 'ต่างประเทศ' : 'ในประเทศ',
      name: customer.name,
    })),
    deliveries: deliveryTickets
      .map((ticket) => deliveryTicketOptionJson(ticket, deliveryUsageMap, productCodeById))
      .filter((ticket) => ticket.productSummaries.length > 0),
    poSells: poSellRows.flatMap((po) => {
      const snapshotItems = poSellSnapshotItems(po.items)
      const rows: PoSellSnapshotItem[] = snapshotItems.length
        ? snapshotItems
        : [{
            productCode: po.product_id ? productCodeById.get(po.product_id) ?? '' : '',
            productId: po.product_id ? productCodeById.get(po.product_id) ?? '' : '',
            remainingQty: jsonNumber(po.remaining_qty ?? po.qty),
            totalRevenue: jsonNumber(po.remaining_amount ?? po.total_amount),
            unitPrice: jsonNumber(po.unit_price),
          }]
      return rows.flatMap((item, index) => {
        const remainingQty = jsonNumber(item.remainingQty ?? item.qty)
        if (remainingQty <= 0.0001) return []
        const productCode = productCodeFromItem(item)
        const unitPrice = jsonNumber(item.unitPrice)
        return [{
          active: true,
          branch_id: po.branch_id ? branchCodeById.get(po.branch_id) ?? null : null,
          customer_id: po.customer_id ? customerCodeById.get(po.customer_id) ?? null : null,
          id: po.doc_no,
          label: `${po.doc_no} · คงเหลือ ${remainingQty.toLocaleString('th-TH')} · ${unitPrice.toLocaleString('th-TH')} บาท`,
          line_id: `${po.doc_no}:${index + 1}`,
          name: po.doc_no,
          product_id: productCode || null,
          remainingAmount: jsonNumber(item.totalRevenue) || jsonNumber(po.remaining_amount),
          remainingQty,
          status: po.status ?? 'Open',
          unit: typeof item.unit === 'string' ? item.unit : null,
          unitPrice,
        }]
      })
    }),
    tradingCostSources: [
      ...tradingPurchaseBills.flatMap((bill) => bill.purchase_bill_items.flatMap((item) => {
      const productCode = item.product_id != null ? productCodeById.get(item.product_id) ?? item.product_code ?? '' : item.product_code ?? ''
      if (!productCode) return []
      const sourceKeyById = `${bill.id.toString()}:${item.line_no}`
      const sourceKeyByDoc = `${bill.doc_no}:${item.line_no}`
      const matched = matchedTradingCostBySource.get(sourceKeyById) ?? matchedTradingCostBySource.get(sourceKeyByDoc) ?? { amount: 0, qty: 0 }
      const qty = toNumber(item.qty)
      const amount = toNumber(item.amount)
      const remainingQty = Math.max(0, qty - matched.qty)
      const remainingAmount = Math.max(0, amount - matched.amount)
      if (remainingQty <= 0.0001 && remainingAmount <= 0.01) return []
      const supplierName = bill.suppliers?.name ?? 'ไม่ระบุ Supplier'
      return [{
        active: true,
        id: `PB:${sourceKeyByDoc}`,
        label: `${bill.doc_no} · ${item.product_name ?? productCode} · คงเหลือ ${remainingQty.toLocaleString('th-TH')} กก. · ${remainingAmount.toLocaleString('th-TH')} บาท`,
        line_id: `PB:${sourceKeyByDoc}`,
        name: bill.doc_no,
        product_id: productCode,
        remainingAmount,
        remainingQty,
        sourceLineNo: item.line_no,
        status: bill.status ?? 'active',
        supplier_id: null,
        supplier_name: supplierName,
        unitPrice: qty > 0 ? amount / qty : 0,
      }]
    })),
      ...tradingManualCostSources.flatMap((source) => {
        const productCode = source.product_id != null ? productCodeById.get(source.product_id) ?? source.products?.code ?? source.product_code_snapshot ?? '' : source.product_code_snapshot ?? ''
        if (!productCode) return []
        const sourceKeyById = `SRC:${source.id.toString()}:1`
        const sourceKeyByNo = `SRC:${source.source_no}:1`
        const matched = matchedTradingCostBySource.get(sourceKeyById) ?? matchedTradingCostBySource.get(sourceKeyByNo) ?? { amount: 0, qty: 0 }
        const qty = toNumber(source.qty)
        const amount = toNumber(source.total_amount)
        const remainingQty = Math.max(0, qty - matched.qty)
        const remainingAmount = Math.max(0, amount - matched.amount)
        if (remainingQty <= 0.0001 && remainingAmount <= 0.01) return []
        const sourceName = source.source_no
        const productName = source.product_name_snapshot ?? source.products?.name ?? productCode
        const supplierName = source.supplier_name_snapshot ?? source.suppliers?.name ?? 'Manual Trading Source'
        return [{
          active: true,
          id: sourceKeyByNo,
          label: `${sourceName} · ${productName} · คงเหลือ ${remainingQty.toLocaleString('th-TH')} กก. · ${remainingAmount.toLocaleString('th-TH')} บาท`,
          line_id: sourceKeyByNo,
          name: sourceName,
          product_id: productCode,
          remainingAmount,
          remainingQty,
          sourceLineNo: 1,
          status: source.status,
          supplier_id: null,
          supplier_name: supplierName,
          unitPrice: qty > 0 ? amount / qty : toNumber(source.unit_cost),
        }]
      }),
    ],
    customerAdvancePayments: customerAdvanceRows.flatMap((advance) => {
      const customerCode = String(advance.ref_id ?? '').trim()
      const customer = customerByCode.get(customerCode)
      if (!customer) return []
      const amount = toNumber(advance.amount_in)
      const usedAmount = customerAdvanceUsedById.get(advance.doc_no) ?? 0
      const remainingAmount = Math.max(0, amount - usedAmount)
      if (remainingAmount <= 0.01) return []
      const docNo = advance.ref_no ?? advance.doc_no
      return [{
        active: true,
        advanceDate: toDateOnly(advance.date),
        amount,
        branch_id: null,
        customer_id: customerCode,
        id: advance.doc_no,
        label: `${docNo} · คงเหลือ ${remainingAmount.toLocaleString('th-TH')} บาท`,
        name: docNo,
        remainingAmount,
        status: usedAmount > 0.01 ? 'Partially Used' : 'Open',
      }]
    }),
    products: products.map((product) => ({
      ...product,
      id: requireBusinessCode(product.code, `สินค้า ${product.id}`),
    })),
    salesChannels: salesChannels.map((channel) => ({
      ...channel,
      id: requireBusinessCode(channel.code, `ช่องทางขาย ${channel.id}`),
    })),
    vatRatePercent,
    warehouses: warehouses.map((warehouse) => ({
      active: warehouse.active,
      branch_id: warehouse.branches ? requireBusinessCode(warehouse.branches.code, `สาขาคลัง ${warehouse.branch_id ?? warehouse.id}`) : null,
      code: warehouse.code,
      id: warehouse.code,
      name: warehouse.name,
    })),
  }
}

function salesBillStatusLabel(status?: string | null) {
  if (!status) return '-'
  const labels: Record<string, string> = {
    open: 'เปิด',
    closed: 'ปิด',
    paid: 'ชำระแล้ว',
    cancelled: 'ยกเลิก',
  }
  return labels[status.toLowerCase()] ?? status
}

async function buildWorkbook(summaryRows: any[], lineRows: SalesBillLineFactRow[]) {
  const summaryData = summaryRows.map((row) => ({
    'เลขที่': row.docNo,
    'อ้างอิง': row.refNo || '-',
    'วันที่': row.date,
    'ลูกค้า': row.customerName,
    'ประเภท': row.transactionMode,
    'สถานะ': salesBillStatusLabel(row.status),
    'จำนวนรายการ': row.itemCount,
    'ยอดรวม': row.totalAmount,
    'รับชำระแล้ว': row.receivedAmount,
    'ลูกหนี้คงเหลือ': row.receivableBalance,
    'คลัง': row.warehouseName,
    'สาขา': row.branchName,
    'ช่องทางขาย': row.channelName,
    'เลขที่ order ส่งออก': row.exportOrderNo || '-',
    'สร้างโดย': row.createdBy,
    'สร้างเมื่อ': row.createdAt,
  }))

  const detailData = lineRows.map((row) => ({
    'Doc No': row.docNo,
    'Date': row.dateText,
    'Partner': row.customerName,
    'Product Code': row.productCode,
    'Product Name': row.productName,
    'Lot No': '-',
    'Gross Wt': row.grossWeight,
    'Deduct Wt': Math.max(0, row.grossWeight - row.qty),
    'Net Wt': row.qty,
    'Unit Price': row.unitPrice,
    'Amount': row.qty * row.unitPrice,
    'Discount': row.discountAmount,
    'Net Amount': row.lineAmount,
    'PO Ref / No': row.poSellDocNo || '-',
  }))

  const workbook = XLSX.utils.book_new()
  const sheet1 = XLSX.utils.json_to_sheet(summaryData)
  sheet1['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 16 }, { wch: 22 },
  ]
  applyWorksheetTableLayout(sheet1, 15, summaryData.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet1, 'บิลขาย')

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
    const url = new URL(request.url)
    const includePaging = url.searchParams.get('format') !== 'xlsx'
    const query = parseBillQuery(url, includePaging)
    const branchScope = await salesBranchScope(context)
    const where = billWhere(query, branchScope.ids)

    const [rows, totalRows, totals] = await Promise.all([
      prisma.sales_bills.findMany({
        include: {
          branches: true,
          customers: true,
          sales_bill_customer_advance_allocations: {
            where: { status: 'active' },
          },
          sales_channels: true,
          warehouses: true,
        },
        orderBy: billOrderBy(query),
        skip: includePaging ? (query.page - 1) * query.pageSize : 0,
        take: query.pageSize,
        where,
      }),
      prisma.sales_bills.count({ where }),
      prisma.sales_bills.aggregate({ _sum: { total_amount: true }, where }),
    ])
    const billIds = rows.map((row) => row.id)
    const [activeReceiptCountByBillId, lineCountByBillId] = await Promise.all([
      activeSalesReceiptCountByBillId(prisma, billIds),
      salesBillLineCountByBillId(billIds),
    ])
    const jsonRows = rows.map((row) => billJson(row, activeReceiptCountByBillId.get(row.id) ?? 0, lineCountByBillId.get(row.id)))

    if (url.searchParams.get('format') === 'xlsx') {
      const body = await buildWorkbook(jsonRows, await salesBillLineFactsForBills(billIds, { lineStatuses: ['active', 'cancelled'], tradingStatuses: ['active', 'cancelled'] }))
      const filename = `sales_bills_${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(new Uint8Array(body), {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })
    }

    return NextResponse.json({
      rows: jsonRows,
      totalAmount: toNumber(totals._sum.total_amount),
      totalRows,
      ...await salesOptionsPayload(branchScope),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดบิลขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const rawPayload = await request.json()
    const values = salesBillFormSchema.parse(rawPayload)
    const actor = currentActor(context)
    const createdAt = new Date()
    const billDate = createdAt.toISOString().slice(0, 10)
    const vatRatePercent = await activeVatRatePercent(normalizeDate(billDate))
    const totals = calculateSalesTotals(values, vatRatePercent)
    const requestedProductCodes = values.items.map((item) => item.productId?.trim() ?? '')
    const invalidProductIndex = requestedProductCodes.findIndex((productCode) => !productCode)
    if (invalidProductIndex >= 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้อง' }, { status: 400 })
    }
    const productCodes = [...new Set(requestedProductCodes)]
    const [branch, warehouse] = await Promise.all([
      findActiveBranchReferenceByCodeOrId(values.branchId),
      values.warehouseId ? findActiveWarehouseReferenceByCodeOrId(values.warehouseId) : Promise.resolve(null),
    ])

    const [customer, channel, products] = await Promise.all([
      findActiveCustomerReferenceByCodeOrId(values.customerId),
      findActiveSalesChannelReferenceByCode(values.channelId),
      prisma.products.findMany({ where: { active: true, code: { in: productCodes } }, select: { code: true, id: true, name: true, unit: true } }),
    ])

    if (!customer) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!(await isCustomerEligibleForBranch({ branchId: branch.id, customerId: customer.id }))) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้',
        fieldErrors: { customerId: ['ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้'] },
      }, { status: 400 })
    }
    const requestedBranchScope = await salesBranchScope(context, branch.code)
    if (requestedBranchScope.ids !== null && requestedBranchScope.ids.length === 0) {
      return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์สร้างบิลขายในสาขานี้' }, { status: 403 })
    }
    if (!channel) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ช่องทางขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    const isExportCustomer = customer.market_scope === 'ต่างประเทศ'
    const exportOrderNo = values.exportOrderNo?.trim() || null
    if (isExportCustomer && !exportOrderNo) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'กรอกเลขที่ order ส่งออกสำหรับบิลขายต่างประเทศ',
        fieldErrors: { exportOrderNo: ['กรอกเลขที่ order ส่งออก'] },
      }, { status: 400 })
    }
    if (!isExportCustomer && exportOrderNo) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'เลขที่ order ส่งออกใช้ได้เฉพาะบิลขายต่างประเทศ',
        fieldErrors: { exportOrderNo: ['เลขที่ order ส่งออกใช้ได้เฉพาะบิลขายต่างประเทศ'] },
      }, { status: 400 })
    }
    if (
      values.transactionMode === 'TRADING'
      && values.warehouseId
    ) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลขาย Trading ห้ามอ้างอิงคลังหรือใบเบิก Stock; ถ้ามี stock line ให้เลือก WTO เท่านั้น' }, { status: 400 })
    }
    if (values.warehouseId && !warehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (branch?.code && warehouse?.branchCode && warehouse.branchCode !== branch.code) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาและคลังไม่ตรงกัน' }, { status: 400 })

    const requestedPoSellDocNos = Array.from(new Set([
      ...values.items.map((item) => item.poSellId?.trim() ?? '').filter(Boolean),
      values.poSellId?.trim() ?? '',
    ].filter(Boolean)))
    const poSells = requestedPoSellDocNos.length
      ? await prisma.po_sells.findMany({
          select: {
            branch_id: true,
            customer_id: true,
            doc_no: true,
            id: true,
            items: true,
            qty: true,
            remaining_amount: true,
            remaining_qty: true,
            status: true,
            total_amount: true,
            unit_price: true,
          },
          where: { doc_no: { in: requestedPoSellDocNos } },
        })
      : []
    const poSellByDocNo = new Map(poSells.map((poSell) => [poSell.doc_no, poSell] as const))
    const missingPoSell = requestedPoSellDocNos.find((docNo) => !poSellByDocNo.has(docNo))
    if (missingPoSell) return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบ PO Sell ${missingPoSell}` }, { status: 400 })
    for (const poSell of poSells) {
      if (isInactivePoSellStatus(poSell.status)) return NextResponse.json({ code: 'BAD_REQUEST', error: `PO Sell ${poSell.doc_no} ถูกปิดหรือยกเลิกแล้ว` }, { status: 400 })
      if (poSell.customer_id && poSell.customer_id !== customer.id) return NextResponse.json({ code: 'BAD_REQUEST', error: `Customer ของบิลขายไม่ตรงกับ PO Sell ${poSell.doc_no}` }, { status: 400 })
      if (poSell.branch_id && branch?.id && poSell.branch_id !== branch.id) return NextResponse.json({ code: 'BAD_REQUEST', error: `สาขาของบิลขายไม่ตรงกับ PO Sell ${poSell.doc_no}` }, { status: 400 })
    }

    const selectedCustomerAdvance = values.customerAdvanceId
      ? await prisma.bank_statement.findUnique({
          select: {
            amount_in: true,
            doc_no: true,
            ref_id: true,
            ref_no: true,
            ref_type: true,
          },
          where: { doc_no: values.customerAdvanceId },
        })
      : null
    if (values.customerAdvanceId && !selectedCustomerAdvance) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบเอกสารรับเงินล่วงหน้าที่เลือก' }, { status: 400 })
    if (selectedCustomerAdvance && selectedCustomerAdvance.ref_type !== 'CADV') return NextResponse.json({ code: 'BAD_REQUEST', error: 'เอกสารรับเงินล่วงหน้าไม่ถูกต้อง' }, { status: 400 })
    if (selectedCustomerAdvance && String(selectedCustomerAdvance.ref_id ?? '').trim() !== customer.code) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เอกสารรับเงินล่วงหน้าต้องเป็นลูกค้าเดียวกับบิลขาย' }, { status: 400 })
    const customerAdvanceUsedAmount = selectedCustomerAdvance
      ? toNumber((await prisma.sales_bill_customer_advance_allocations.aggregate({
          _sum: { allocated_amount: true },
          where: {
            customer_advance_doc_no: selectedCustomerAdvance.doc_no,
            status: 'active',
          },
        }))._sum.allocated_amount)
      : 0
    const customerAdvanceAvailable = selectedCustomerAdvance
      ? Math.max(0, toNumber(selectedCustomerAdvance.amount_in) - customerAdvanceUsedAmount)
      : 0
    if (selectedCustomerAdvance && customerAdvanceAvailable <= 0.01) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เอกสารรับเงินล่วงหน้านี้ไม่มียอดคงเหลือสำหรับใช้หักบิลแล้ว' }, { status: 400 })
    const customerAdvanceApplied = selectedCustomerAdvance ? Math.min(totals.totalAmount, customerAdvanceAvailable) : 0

    const productByCode = new Map(products.map((product) => [requireBusinessCode(product.code, `สินค้า ${product.id}`), product]))
    const parsedProductIds = requestedProductCodes.map((productCode) => productByCode.get(productCode)?.id ?? null)
    const missingProduct = requestedProductCodes.find((productCode) => !productByCode.has(productCode))
    if (missingProduct || parsedProductIds.some((productId) => productId == null)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    const productById = new Map(products.map((product) => [product.id, product]))
    const productCodeById = new Map(products.map((product) => [product.id, requireBusinessCode(product.code, `สินค้า ${product.id}`)]))
    let deliverySummaryIdByItemIndex = new Map<number, string>()
    let deliverySummarySourceMap = new Map<string, DeliverySummarySource>()
    let stockIssueQtyByItemIndex = new Map<number, number>()
    let stockDeliveryTicket: DeliveryTicketOptionRow | null = null
    if (values.transactionMode === 'STOCK' || (values.transactionMode === 'TRADING' && Boolean(values.deliveryTicketId))) {
      const deliveryValidation = await validateStockDeliverySelection(values, branch?.id ?? null, customer.id, productByCode, productCodeById)
      if ('error' in deliveryValidation) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: deliveryValidation.error }, { status: 400 })
      }
      deliverySummaryIdByItemIndex = deliveryValidation.deliverySummaryIdByItemIndex
      deliverySummarySourceMap = deliveryValidation.deliverySummarySourceMap
      stockIssueQtyByItemIndex = deliveryValidation.stockIssueQtyByItemIndex
      stockDeliveryTicket = deliveryValidation.ticket
    }

    const docNo = await nextDailyDocNo('sales_bills', 'SB', billDate)
    const items = salesItems(values, parsedProductIds as bigint[], productById, deliverySummarySourceMap, deliverySummaryIdByItemIndex, stockIssueQtyByItemIndex)
    const poSellAllocations = new Map<string, ReturnType<typeof allocatePoSellForSalesBill>>()
    for (const poSellDocNo of requestedPoSellDocNos) {
      const poSell = poSellByDocNo.get(poSellDocNo)
      if (!poSell) continue
      const poSellItems = items.filter((item) => item.poSellId === poSellDocNo || (!item.poSellId && values.poSellId === poSellDocNo))
      if (!poSellItems.length) continue
      const allocation = allocatePoSellForSalesBill(poSell, poSellItems)
      if ('error' in allocation) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: `${poSellDocNo}: ${allocation.error}` }, { status: 400 })
      }
      poSellAllocations.set(poSellDocNo, allocation)
    }
    const tradingCostSourceByLineIndex = new Map<number, TradingCostSourceLine>()
    const tradingMatchedCogsByLineIndex = new Map<number, number>()
    if (values.transactionMode === 'TRADING') {
      const tradingSourceIds = values.items.map((item) => item.deliveryTicketId ? '' : item.tradingCostSourceId?.trim() ?? '')
      const invalidSourceIndex = values.items.findIndex((item, index) => !item.deliveryTicketId && (!tradingSourceIds[index] || !parseTradingCostSourceId(tradingSourceIds[index])))
      if (invalidSourceIndex >= 0) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: `เลือก Trading Cost Source ให้รายการที่ ${invalidSourceIndex + 1}` }, { status: 400 })
      }
      const parsedSourcesByIndex = tradingSourceIds.map((sourceId) => sourceId ? parseTradingCostSourceId(sourceId) : null)
      const parsedSources = parsedSourcesByIndex.filter((source): source is NonNullable<typeof source> => source != null)
      const sourceDocNos = [...new Set(parsedSources.filter((source) => source.sourceType === 'PB').map((source) => source.docNo))]
      const manualSourceNos = [...new Set(parsedSources.filter((source) => source.sourceType === 'MANUAL').map((source) => source.docNo))]
      const sourceBills = await prisma.purchase_bills.findMany({
        include: {
          purchase_bill_items: {
            orderBy: { line_no: 'asc' },
            select: {
              amount: true,
              line_no: true,
              product_code: true,
              product_id: true,
              product_name: true,
              qty: true,
            },
            where: { item_status: 'active' },
          },
          suppliers: { select: { name: true } },
        },
        where: {
          branch_id: branch.id,
          doc_no: { in: sourceDocNos },
          status: { notIn: ['cancelled', 'Cancelled', 'void', 'voided', 'reversed'] },
          transaction_mode: 'TRADING',
        },
      })
      const manualSources = await prisma.trading_cost_sources.findMany({
        include: {
          products: { select: { code: true, name: true } },
          suppliers: { select: { branch_id: true, name: true } },
        },
        where: {
          source_no: { in: manualSourceNos },
          status: 'active',
          suppliers: { is: { branch_id: branch.id } },
        },
      })
      const sourceBillByDocNo = new Map(sourceBills.map((bill) => [bill.doc_no, bill] as const))
      const manualSourceByNo = new Map(manualSources.map((source) => [source.source_no, source] as const))
      const sourceBillIds = sourceBills.map((bill) => bill.id)
      const manualSourceIds = manualSources.map((source) => source.id)
      const activeFacts = sourceBillIds.length || manualSourceIds.length
        ? await prisma.trading_allocation_facts.findMany({
            select: {
              matched_cogs: true,
              purchase_bill_id: true,
              qty: true,
              source_doc_no: true,
              source_line_no: true,
              trading_cost_source_id: true,
            },
            where: {
              OR: [
                ...(sourceBillIds.length ? [{ purchase_bill_id: { in: sourceBillIds } }] : []),
                ...(manualSourceIds.length ? [{ trading_cost_source_id: { in: manualSourceIds } }] : []),
              ],
              status: 'active',
            },
          })
        : []
      const matchedBySource = new Map<string, { amount: number; qty: number }>()
      activeFacts.forEach((fact) => {
        const sourceLineNo = fact.source_line_no
        if (sourceLineNo == null) return
        const keys = [
          fact.purchase_bill_id != null ? `${fact.purchase_bill_id.toString()}:${sourceLineNo}` : null,
          fact.trading_cost_source_id != null ? `SRC:${fact.trading_cost_source_id.toString()}:1` : null,
          fact.source_doc_no ? `${fact.source_doc_no}:${sourceLineNo}` : null,
          fact.source_doc_no ? `SRC:${fact.source_doc_no}:1` : null,
        ].filter((key): key is string => Boolean(key))
        keys.forEach((key) => {
          const current = matchedBySource.get(key) ?? { amount: 0, qty: 0 }
          current.amount += toNumber(fact.matched_cogs)
          current.qty += toNumber(fact.qty)
          matchedBySource.set(key, current)
        })
      })
      const requestedQtyBySource = new Map<string, number>()
      const requestedCostBySource = new Map<string, number>()
      for (const [index, source] of parsedSourcesByIndex.entries()) {
        if (!source) continue
        if (source.sourceType === 'MANUAL') {
          const manualSource = manualSourceByNo.get(source.docNo)
          if (!manualSource) {
            return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบ Trading Cost Source ${source.docNo}` }, { status: 400 })
          }
          const productId = parsedProductIds[index]
          if (manualSource.product_id != null && productId != null && manualSource.product_id !== productId) {
            return NextResponse.json({ code: 'BAD_REQUEST', error: `สินค้ารายการที่ ${index + 1} ไม่ตรงกับต้นทุนที่เลือก` }, { status: 400 })
          }
          const sourceKeyById = `SRC:${manualSource.id.toString()}:1`
          const sourceKeyByNo = `SRC:${manualSource.source_no}:1`
          const matched = matchedBySource.get(sourceKeyById) ?? matchedBySource.get(sourceKeyByNo) ?? { amount: 0, qty: 0 }
          const sourceQty = toNumber(manualSource.qty)
          const sourceAmount = toNumber(manualSource.total_amount)
          if (sourceQty <= 0.0001 || sourceAmount <= 0.01) {
            return NextResponse.json({ code: 'BAD_REQUEST', error: `ต้นทุน ${manualSource.source_no} ไม่มีจำนวน/มูลค่าพร้อมใช้` }, { status: 400 })
          }
          const remainingQty = Math.max(0, sourceQty - matched.qty)
          const remainingAmount = Math.max(0, sourceAmount - matched.amount)
          const alreadyRequestedQty = requestedQtyBySource.get(sourceKeyByNo) ?? 0
          const requestedQty = values.items[index]?.qty ?? 0
          if (alreadyRequestedQty + requestedQty > remainingQty + 0.0001) {
            return NextResponse.json({ code: 'BAD_REQUEST', error: `จำนวนรายการที่ ${index + 1} เกินต้นทุนคงเหลือของ ${manualSource.source_no}` }, { status: 400 })
          }
          const unitCost = sourceAmount / sourceQty
          const alreadyRequestedCost = requestedCostBySource.get(sourceKeyByNo) ?? 0
          const matchedCogs = Math.min(Math.max(0, remainingAmount - alreadyRequestedCost), requestedQty * unitCost)
          requestedQtyBySource.set(sourceKeyByNo, alreadyRequestedQty + requestedQty)
          requestedCostBySource.set(sourceKeyByNo, alreadyRequestedCost + matchedCogs)
          const productCode = manualSource.product_code_snapshot ?? manualSource.products?.code ?? ''
          tradingCostSourceByLineIndex.set(index, {
            amount: sourceAmount,
            billId: null,
            costSourceId: manualSource.id,
            docNo: manualSource.source_no,
            lineNo: 1,
            productCode,
            productId: manualSource.product_id,
            productName: manualSource.product_name_snapshot ?? manualSource.products?.name ?? '',
            qty: sourceQty,
            remainingAmount,
            remainingQty,
            supplierId: manualSource.supplier_id,
            supplierName: manualSource.supplier_name_snapshot ?? manualSource.suppliers?.name ?? null,
            type: 'MANUAL',
            unitCost,
          })
          tradingMatchedCogsByLineIndex.set(index, matchedCogs)
          continue
        }
        const sourceBill = sourceBillByDocNo.get(source.docNo)
        if (!sourceBill) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบ Trading PB/Cost Source ${source.docNo}` }, { status: 400 })
        }
        const sourceLine = sourceBill.purchase_bill_items.find((line) => line.line_no === source.lineNo)
        if (!sourceLine) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบรายการต้นทุน ${source.docNo}:${source.lineNo}` }, { status: 400 })
        }
        const productId = parsedProductIds[index]
        if (sourceLine.product_id != null && productId != null && sourceLine.product_id !== productId) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `สินค้ารายการที่ ${index + 1} ไม่ตรงกับต้นทุนที่เลือก` }, { status: 400 })
        }
        const sourceKeyById = `${sourceBill.id.toString()}:${source.lineNo}`
        const sourceKeyByDoc = `${sourceBill.doc_no}:${source.lineNo}`
        const matched = matchedBySource.get(sourceKeyById) ?? matchedBySource.get(sourceKeyByDoc) ?? { amount: 0, qty: 0 }
        const sourceQty = toNumber(sourceLine.qty)
        const sourceAmount = toNumber(sourceLine.amount)
        if (sourceQty <= 0.0001 || sourceAmount <= 0.01) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `ต้นทุน ${sourceBill.doc_no}:${source.lineNo} ไม่มีจำนวน/มูลค่าพร้อมใช้` }, { status: 400 })
        }
        const remainingQty = Math.max(0, sourceQty - matched.qty)
        const remainingAmount = Math.max(0, sourceAmount - matched.amount)
        const alreadyRequestedQty = requestedQtyBySource.get(sourceKeyByDoc) ?? 0
        const requestedQty = values.items[index]?.qty ?? 0
        if (alreadyRequestedQty + requestedQty > remainingQty + 0.0001) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `จำนวนรายการที่ ${index + 1} เกินต้นทุนคงเหลือของ ${sourceBill.doc_no}:${source.lineNo}` }, { status: 400 })
        }
        const unitCost = sourceAmount / sourceQty
        const alreadyRequestedCost = requestedCostBySource.get(sourceKeyByDoc) ?? 0
        const matchedCogs = Math.min(Math.max(0, remainingAmount - alreadyRequestedCost), requestedQty * unitCost)
        requestedQtyBySource.set(sourceKeyByDoc, alreadyRequestedQty + requestedQty)
        requestedCostBySource.set(sourceKeyByDoc, alreadyRequestedCost + matchedCogs)
        tradingCostSourceByLineIndex.set(index, {
          amount: sourceAmount,
          billId: sourceBill.id,
          costSourceId: null,
          docNo: sourceBill.doc_no,
          lineNo: source.lineNo,
          productCode: sourceLine.product_code ?? '',
          productId: sourceLine.product_id,
          productName: sourceLine.product_name ?? '',
          qty: sourceQty,
          remainingAmount,
          remainingQty,
          supplierId: sourceBill.supplier_id,
          supplierName: sourceBill.suppliers?.name ?? sourceBill.supplier_name_snapshot ?? null,
          type: 'PB',
          unitCost,
        })
        tradingMatchedCogsByLineIndex.set(index, matchedCogs)
      }
    }
    const totalCost = values.transactionMode === 'TRADING'
      ? roundMoney(Array.from(tradingMatchedCogsByLineIndex.values()).reduce((sum, amount) => sum + amount, 0))
      : 0
    const selectedHeaderPoSell = poSells.length === 1 ? poSells[0] : null

    const created = await prisma.$transaction(async (tx) => {
      const createdBill = await tx.sales_bills.create({
        data: {
          branch_id: branch?.id ?? null,
          channel_id: channel?.id ?? null,
          created_at: createdAt,
          created_by: actor,
          customer_id: customer.id,
          date: normalizeDate(billDate),
          discount: values.discountTotal,
          discount_total: values.discountTotal,
          doc_no: docNo,
          cogs_amount: totalCost,
          export_order_no: exportOrderNo,
          gross_profit: roundMoney(totals.grossProfitBase - totalCost),
          has_vat: values.hasVat,
          items: items as Prisma.InputJsonValue,
          license_plate: values.licensePlate,
          note: values.note,
          notes: values.note,
          po_sell_id: selectedHeaderPoSell?.id ?? null,
          paid_amount: customerAdvanceApplied,
          receivable_balance: Math.max(0, totals.totalAmount - customerAdvanceApplied),
          received_amount: customerAdvanceApplied,
          ref_no: values.refNo,
          status: 'unreceived',
          subtotal: totals.subtotal,
          total_amount: totals.totalAmount,
          total_cost: totalCost,
          transaction_mode: values.transactionMode,
          updated_at: createdAt,
          updated_by: actor,
          vat_amount: totals.vatAmount,
          vat_invoice_date: values.vatInvoiceDate ? normalizeDate(values.vatInvoiceDate) : null,
          vat_invoice_issued: values.vatInvoiceIssued,
          vat_invoice_no: values.vatInvoiceNo,
          vat_type: values.vatType,
          warehouse_id: values.transactionMode === 'STOCK' ? warehouse?.id ?? null : null,
          from_p_sale_no: null,
          from_p_sale_id: null,
        },
        select: { doc_no: true, id: true },
      })

      await tx.sales_bill_lines.createMany({
        data: salesBillLineRows({
          actor,
          billId: createdBill.id,
          createdAt,
          items,
          parsedProductIds: parsedProductIds as bigint[],
          totals,
        }),
      })
      const createdLines = await tx.sales_bill_lines.findMany({
        select: { id: true, line_no: true },
        where: { sales_bill_id: createdBill.id },
      })
      const lineIdByLineNo = new Map(createdLines.map((line) => [line.line_no, line.id] as const))

      if (stockDeliveryTicket) {
        const sourceRows = sourceAllocationRows({
          actor,
          billId: createdBill.id,
          createdAt,
          deliverySummarySourceMap,
          items,
          lineIdByLineNo,
          productCodeById,
          stockDeliveryTicket,
        })
        if (sourceRows.length) {
          await tx.sales_bill_source_allocations.createMany({ data: sourceRows })
        }
      }

      const poSellRows = poSellAllocationRows({
        actor,
        billId: createdBill.id,
        createdAt,
        headerPoSellDocNo: values.poSellId?.trim() || undefined,
        items,
        lineIdByLineNo,
        parsedProductIds: parsedProductIds as bigint[],
        poSellByDocNo,
      })
      if (poSellRows.length) {
        await tx.sales_bill_po_sell_allocations.createMany({ data: poSellRows })
        await appendPoSellAllocationLogs(tx, poSellRows
          .filter((row) => row.allocation_type === 'PO_SELL' && row.po_sell_id != null)
          .map((row) => ({
            action: PO_SELL_ALLOCATION_ACTION.ALLOCATED_TO_SALES_BILL,
            actor,
            allocatedAmount: toNumber(row.allocated_amount),
            allocatedQty: toNumber(row.allocated_qty),
            createdAt,
            meta: {
              source: 'sales_bill_create',
            },
            poSellId: row.po_sell_id!,
            productCodeSnapshot: row.product_code_snapshot,
            productId: row.product_id,
            productNameSnapshot: row.product_name_snapshot,
            salesBillDocNo: createdBill.doc_no,
            salesBillId: createdBill.id,
            salesBillLineId: row.sales_bill_line_id,
            salesBillLineNo: row.sales_line_no,
            unitPriceSnapshot: toNumber(row.unit_price),
          })))
      }

      if (selectedCustomerAdvance && customerAdvanceApplied > 0) {
        await tx.sales_bill_customer_advance_allocations.create({
          data: {
            allocated_amount: customerAdvanceApplied,
            created_at: createdAt,
            created_by: actor,
            customer_advance_doc_no: selectedCustomerAdvance.doc_no,
            customer_code_snapshot: customer.code,
            customer_id: customer.id,
            customer_name_snapshot: customer.name,
            meta: { source: 'sales_bill_create' },
            outstanding_after: Math.max(0, customerAdvanceAvailable - customerAdvanceApplied),
            outstanding_before: customerAdvanceAvailable,
            sales_bill_id: createdBill.id,
            status: 'active',
            updated_at: createdAt,
            updated_by: actor,
          },
        })
      }

      await appendSalesBillStatusLog(tx, {
        action: SALES_BILL_STATUS_ACTION.CREATED,
        actor,
        createdAt,
        fromStatus: null,
        meta: {
          lineFactCount: items.length,
          reason: 'sales_bill_create',
          transactionMode: values.transactionMode,
        },
        note: values.note || null,
        salesBillId: createdBill.id,
        toStatus: 'unreceived',
      })

      for (const [poSellDocNo, allocation] of poSellAllocations.entries()) {
        const poSell = poSellByDocNo.get(poSellDocNo)
        if (!poSell || 'error' in allocation) continue
        await tx.po_sells.update({
          data: {
            ...(allocation.items ? { items: allocation.items as Prisma.InputJsonValue } : {}),
            cut_amount: { increment: allocation.usedAmount },
            remaining_amount: allocation.remainingAmount,
            remaining_qty: allocation.remainingQty,
            status: allocation.remainingQty <= 0.001 ? 'Completed' : poSell.status ?? 'Open',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: { id: poSell.id },
        })
      }

      if (values.transactionMode === 'TRADING') {
        const allocationRows = items.map((item, index) => {
          if (isDeliveryBackedSalesItem(item)) return null
          const source = tradingCostSourceByLineIndex.get(index)
          if (!source) return null
          return {
            allocation_method: 'RECORDED_LINE',
            allocation_no: `TAF-${docNo}-${String(index + 1).padStart(3, '0')}`,
            created_at: createdAt,
            created_by: actor,
            customer_id: customer.id,
            customer_name_snapshot: customer.name,
            date: normalizeDate(billDate),
            matched_cogs: tradingMatchedCogsByLineIndex.get(index) ?? 0,
            product_code_snapshot: source.productCode || item.productCode,
            product_id: source.productId ?? parsedProductIds[index] ?? null,
            product_name_snapshot: source.productName || item.productName,
            purchase_bill_id: source.billId,
            trading_cost_source_id: source.costSourceId,
            qty: item.qty,
            sales_amount: item.amount,
            sales_bill_id: createdBill.id,
            sales_doc_no: docNo,
            sales_line_no: index + 1,
            source_doc_no: source.docNo,
            source_line_no: source.lineNo,
            source_type: source.type === 'MANUAL' ? 'TRADING_COST_SOURCE' : 'TRADING_PURCHASE_BILL',
            status: 'active',
            supplier_id: source.supplierId,
            supplier_name_snapshot: source.supplierName,
            updated_at: createdAt,
            updated_by: actor,
          }
        }).filter((row): row is NonNullable<typeof row> => row != null)
        if (allocationRows.length > 0) {
          await tx.trading_allocation_facts.createMany({ data: allocationRows })
        }
      }

      if (stockDeliveryTicket) {
        const consumedStockLines = await consumeActiveWtoPendingOut(tx, {
          actor,
          allocations: items
            .filter(isDeliveryBackedSalesItem)
            .map((item) => {
              const summary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
              return {
                productId: summary?.product_id ?? BigInt(0),
                qty: item.stockIssueQty,
              }
            })
            .filter((allocation) => allocation.productId !== BigInt(0) && allocation.qty > 0.0001),
          billDate: normalizeDate(billDate),
          branchId: branch.id,
          salesBillDocNo: createdBill.doc_no,
          salesChannelId: channel.id,
          weightTicketId: stockDeliveryTicket.id,
        })
        const stockCogs = roundMoney(consumedStockLines.reduce((sum, line) => sum + line.valueOut, 0))
        const combinedCogs = roundMoney(totalCost + stockCogs)
        await tx.sales_bills.update({
          data: {
            cogs_amount: combinedCogs,
            gross_profit: roundMoney(totals.grossProfitBase - combinedCogs),
            total_cost: combinedCogs,
            updated_at: createdAt,
            updated_by: actor,
          },
          where: { id: createdBill.id },
        })

        const usageEntries = items.flatMap((item, index) => {
          if (!isDeliveryBackedSalesItem(item)) return []
          const summary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
          if (!summary) return []
          return [{
            action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
            actor,
            allocatedDeductWeight: item.deductWeight,
            allocatedGrossWeight: item.grossWeight,
            allocatedNetWeight: item.stockIssueQty,
            allocatedQty: item.stockIssueQty,
            meta: {
              reason: 'sales_bill_create',
              salesProductCode: item.productCode,
              salesProductName: item.productName,
              salesNetWeight: item.qty,
              stockIssueQty: item.stockIssueQty,
            },
            productCodeSnapshot: summary.product_id != null ? productCodeById.get(summary.product_id) ?? item.productCode : item.productCode,
            productId: summary.product_id,
            productNameSnapshot: summary.product_name,
            targetDocNo: createdBill.doc_no,
            targetId: createdBill.id,
            targetLineNo: index + 1,
            targetType: 'SALES_BILL' as const,
            weightTicketId: stockDeliveryTicket.id,
            weightTicketProductSummaryId: summary.id,
          }]
        })
        await appendWeightTicketUsageLogs(tx, usageEntries)
        await appendWtoPendingOutEventsForSalesBill(tx, {
          actor,
          eventTypeForHold: () => 'sales_bill_consume',
          occurredAt: createdAt,
          referenceDocNo: createdBill.doc_no,
          referenceDocType: 'SB',
          salesBillDocNo: createdBill.doc_no,
          statusSnapshot: 'consumed',
        })

        const summaryUsage = new Map<bigint, number>()
        items.forEach((item) => {
          if (!isDeliveryBackedSalesItem(item)) return
          const summary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
          if (!summary) return
          summaryUsage.set(summary.id, (summaryUsage.get(summary.id) ?? 0) + item.stockIssueQty)
        })
        await Promise.all([...summaryUsage.entries()].map(([summaryId, qty]) => tx.weight_ticket_product_summaries.update({
          data: {
            billed_weight: { increment: qty },
            remaining_weight: { decrement: qty },
            updated_at: createdAt,
          },
          where: { id: summaryId },
        })))
        const remainingAfterBilling = await tx.weight_ticket_product_summaries.aggregate({
          _sum: { remaining_weight: true },
          where: { weight_ticket_id: stockDeliveryTicket.id },
        })
        const nextTicketStatus = toNumber(remainingAfterBilling._sum.remaining_weight) > 0.0001 ? 'partially_billed' : 'billed'
        await tx.weight_tickets.update({
          data: {
            status: nextTicketStatus,
            updated_at: createdAt,
            updated_by: actor,
          },
          where: { id: stockDeliveryTicket.id },
        })
        await appendWeightTicketStatusLog(tx, {
          action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
          actor,
          createdAt,
          fromStatus: stockDeliveryTicket.status,
          meta: {
            reason: 'sales_bill_create',
            salesBillDocNo: createdBill.doc_no,
          },
          toStatus: nextTicketStatus,
          weightTicketId: stockDeliveryTicket.id,
        })
      }

      return createdBill
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.doc_no }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'บันทึกบิลขายไม่ได้', 500)
  }
}

function deallocatePoSellForSalesBill(poSell: PoSellForAllocation, billItems: SalesItemSnapshot[]) {
  const hasItemRows = Array.isArray(poSell.items) && poSell.items.length > 0
  const poItems: PoSellSnapshotItem[] = hasItemRows
    ? (poSell.items as unknown[]).filter((item): item is PoSellSnapshotItem => typeof item === 'object' && item !== null)
    : []

  const nextItems = poItems.map((item) => ({
    ...item,
    remainingQty: jsonNumber(item.remainingQty ?? item.qty),
  }))

  let restoredAmount = 0
  let restoredQty = 0

  for (const billItem of billItems) {
    const refundQty = jsonNumber(billItem.qty)
    if (refundQty <= 0) continue

    const candidates = nextItems.filter((item) => {
      const poProductCode = productCodeFromItem(item)
      return !poProductCode || poProductCode === billItem.productCode || poProductCode === billItem.productId
    })

    if (candidates.length > 0) {
      const candidate = candidates.find(item => jsonNumber(item.remainingQty) < jsonNumber(item.qty)) || candidates[0]
      const currentRemaining = jsonNumber(candidate.remainingQty)
      candidate.remainingQty = currentRemaining + refundQty
      restoredQty += refundQty
      restoredAmount += refundQty * jsonNumber(candidate.unitPrice)
    } else {
      restoredQty += refundQty
      restoredAmount += refundQty * jsonNumber(billItem.unitPrice)
    }
  }

  const remainingQty = nextItems.length > 0
    ? nextItems.reduce((sum, item) => sum + Math.max(0, jsonNumber(item.remainingQty)), 0)
    : jsonNumber(poSell.remaining_qty ?? poSell.qty) + restoredQty

  const remainingAmount = hasItemRows
    ? nextItems.reduce((sum, item) => sum + Math.max(0, jsonNumber(item.remainingQty)) * jsonNumber(item.unitPrice), 0)
    : Math.max(0, jsonNumber(poSell.remaining_amount ?? poSell.total_amount) + restoredAmount)

  return {
    items: hasItemRows ? nextItems : null,
    remainingAmount,
    remainingQty,
    restoredAmount,
    restoredQty,
  }
}

const cancelSalesBillSchema = z.object({
  id: z.string().trim().min(1, 'ระบุรหัสบิลขาย'),
  action: z.enum(['cancel']),
  reason: z.string().trim().min(1, 'ระบุเหตุผลการยกเลิก').max(500, 'เหตุผลยาวเกินไป'),
})

const editSalesBillSchema = z.object({
  id: z.string().trim().min(1, 'ระบุรหัสบิลขาย'),
}).and(salesBillFormSchema)

type ActiveSalesBillPoAllocation = Prisma.sales_bill_po_sell_allocationsGetPayload<Record<string, never>>

function salesBillPoAllocationSnapshot(allocation: ActiveSalesBillPoAllocation): SalesItemSnapshot {
  return {
    amount: toNumber(allocation.allocated_amount),
    customerAdvanceId: null,
    deliveryLineId: null,
    deliverySummaryId: null,
    deliveryTicketDocNo: null,
    deliveryTicketId: null,
    deductWeight: 0,
    discount: 0,
    grossWeight: toNumber(allocation.allocated_qty),
    id: String(allocation.sales_line_no),
    lineNo: allocation.sales_line_no,
    netWeight: toNumber(allocation.allocated_qty),
    note: null,
    poSellId: allocation.po_sell_doc_no,
    productCode: allocation.product_code_snapshot,
    productId: allocation.product_code_snapshot,
    productName: allocation.product_name_snapshot,
    qty: toNumber(allocation.allocated_qty),
    stockIssueQty: 0,
    tradingCostSourceId: null,
    unit: 'กก.',
    unitPrice: toNumber(allocation.unit_price),
  }
}

function poSellRowsByDocNoAfterRelease(
  poSells: PoSellForAllocation[],
  activeAllocations: ActiveSalesBillPoAllocation[],
) {
  const poSellByDocNo = new Map(poSells.map((poSell) => [String(poSell.doc_no ?? ''), poSell] as const))
  const allocationsByDocNo = new Map<string, ActiveSalesBillPoAllocation[]>()
  activeAllocations.forEach((allocation) => {
    if (!allocation.po_sell_doc_no || allocation.allocation_type !== 'PO_SELL' || allocation.po_sell_id == null) return
    const current = allocationsByDocNo.get(allocation.po_sell_doc_no) ?? []
    current.push(allocation)
    allocationsByDocNo.set(allocation.po_sell_doc_no, current)
  })

  allocationsByDocNo.forEach((allocations, docNo) => {
    const poSell = poSellByDocNo.get(docNo)
    if (!poSell) return
    const released = deallocatePoSellForSalesBill(poSell, allocations.map(salesBillPoAllocationSnapshot))
    poSellByDocNo.set(docNo, {
      ...poSell,
      items: released.items ?? poSell.items,
      remaining_amount: released.remainingAmount,
      remaining_qty: released.remainingQty,
      status: released.remainingQty <= 0.001 ? poSell.status : 'Open',
    })
  })

  return poSellByDocNo
}

function poSellAllocationLogEntries(input: {
  action: typeof PO_SELL_ALLOCATION_ACTION[keyof typeof PO_SELL_ALLOCATION_ACTION]
  actor: string
  createdAt: Date
  meta: Prisma.InputJsonValue
  note?: string | null
  rows: ReturnType<typeof poSellAllocationRows>
  salesBillDocNo: string
}) {
  return input.rows
    .filter((row) => row.allocation_type === 'PO_SELL' && row.po_sell_id != null)
    .map((row) => ({
      action: input.action,
      actor: input.actor,
      allocatedAmount: toNumber(row.allocated_amount),
      allocatedQty: toNumber(row.allocated_qty),
      createdAt: input.createdAt,
      meta: input.meta,
      note: input.note ?? null,
      poSellId: row.po_sell_id!,
      productCodeSnapshot: row.product_code_snapshot,
      productId: row.product_id,
      productNameSnapshot: row.product_name_snapshot,
      salesBillDocNo: input.salesBillDocNo,
      salesBillId: row.sales_bill_id,
      salesBillLineId: row.sales_bill_line_id,
      salesBillLineNo: row.sales_line_no,
      unitPriceSnapshot: toNumber(row.unit_price),
    }))
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const raw = await request.json()
    const actor = currentActor(context)
    const branchScope = await salesBranchScope(context)

    if (raw?.action !== 'cancel') {
      const values = editSalesBillSchema.parse(raw)
      const bill = await prisma.sales_bills.findFirst({
        include: {
          sales_bill_customer_advance_allocations: {
            where: { status: 'active' },
          },
          sales_bill_lines: {
            orderBy: { line_no: 'asc' },
            where: { status: 'active' },
          },
          sales_bill_po_sell_allocations: {
            where: { status: 'active' },
          },
          sales_bill_source_allocations: {
            where: { status: 'active' },
          },
        },
        where: { doc_no: values.id, ...scopedBranchWhere(branchScope.ids) },
      })
      if (!bill) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลขาย' }, { status: 404 })
      if (String(bill.status ?? '').toLowerCase().includes('cancel')) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลขายนี้ถูกยกเลิกแล้ว' }, { status: 400 })
      }
      const activeReceiptsCount = (await activeSalesReceiptCountByBillId(prisma, [bill.id])).get(bill.id) ?? 0
      if (activeReceiptsCount > 0) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลขายนี้มีการรับชำระเงินแล้ว' }, { status: 400 })
      }
      if (values.transactionMode !== String(bill.transaction_mode ?? 'STOCK')) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะต้องคงประเภทบิลขายเดิม' }, { status: 400 })
      }
      if (bill.sales_bill_lines.length === 0) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลขายนี้ยังไม่มี line facts สำหรับ correction' }, { status: 400 })
      }

      const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
      const customer = await findActiveCustomerReferenceByCodeOrId(values.customerId)
      const channel = await findActiveSalesChannelReferenceByCode(values.channelId)
      if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
      if (!customer) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
      if (!channel) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ช่องทางขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
      if (branchScope.codes && !branchScope.codes.includes(branch.code)) {
        return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์ทำรายการในสาขานี้' }, { status: 403 })
      }
      if (!(await isCustomerEligibleForBranch({ branchId: branch.id, customerId: customer.id }))) {
        return NextResponse.json({
          code: 'BAD_REQUEST',
          error: 'ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้',
          fieldErrors: { customerId: ['ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้'] },
        }, { status: 400 })
      }
      if (bill.branch_id !== branch.id || bill.customer_id !== customer.id) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะต้องคงสาขาและลูกค้าเดิมของบิลขาย' }, { status: 400 })
      }

      const requestedProductCodes = [...new Set(values.items.map((item) => item.productId).filter(Boolean))]
      const products = await prisma.products.findMany({
        select: { active: true, code: true, id: true, name: true, unit: true },
        where: { code: { in: requestedProductCodes }, active: true },
      })
      const productByCode = new Map(products.map((product) => [requireBusinessCode(product.code, `สินค้า ${product.id}`), product]))
      const parsedProductIds = requestedProductCodes.map((productCode) => productByCode.get(productCode)?.id ?? null)
      const missingProduct = requestedProductCodes.find((productCode) => !productByCode.has(productCode))
      if (missingProduct || parsedProductIds.some((productId) => productId == null)) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
      }
      const parsedProductIdsByLine = values.items.map((item) => productByCode.get(item.productId)?.id ?? null)
      const productById = new Map(products.map((product) => [product.id, product]))
      const productCodeById = new Map(products.map((product) => [product.id, requireBusinessCode(product.code, `สินค้า ${product.id}`)] as const))
      const sourceAllocationByLineNo = new Map(bill.sales_bill_source_allocations.map((allocation) => [allocation.sales_line_no, allocation] as const))
      const activeLineByOriginalLineNo = new Map(bill.sales_bill_lines.map((line) => [line.line_no, line] as const))
      const invalidSubmittedLine = values.items.find((item) => item.salesBillLineNo != null && !activeLineByOriginalLineNo.has(item.salesBillLineNo))
      if (invalidSubmittedLine?.salesBillLineNo != null) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: `อ้างอิงรายการบิลขาย line ${invalidSubmittedLine.salesBillLineNo} ไม่ถูกต้อง` }, { status: 400 })
      }
      const submittedExistingLineNos = new Set(values.items.map((item) => item.salesBillLineNo).filter((lineNo): lineNo is number => Number.isInteger(lineNo)))
      const deletedSalesBillLines = bill.sales_bill_lines.filter((line) => !submittedExistingLineNos.has(line.line_no))
      let nextNewLineNo = Math.max(0, ...bill.sales_bill_lines.map((line) => line.line_no)) + 1
      const lineNoByItemIndex = new Map<number, number>()
      values.items.forEach((item, index) => {
        const submittedLineNo = item.salesBillLineNo ?? null
        if (submittedLineNo != null) {
          lineNoByItemIndex.set(index, submittedLineNo)
          return
        }
        lineNoByItemIndex.set(index, nextNewLineNo)
        nextNewLineNo += 1
      })

      let stockDeliveryTicket: DeliveryTicketOptionRow | null = null
      let deliverySummaryIdByItemIndex = new Map<number, string>()
      let deliverySummarySourceMap = new Map<string, DeliverySummarySource>()
      let stockIssueQtyByItemIndex = new Map<number, number>()
      if (String(bill.transaction_mode ?? 'STOCK') === 'STOCK') {
        const hasReturnOrLoss = await prisma.weight_ticket_usage_logs.findFirst({
          select: { id: true },
          where: {
            action: {
              in: [
                WEIGHT_TICKET_USAGE_ACTION.RETURNED_FROM_SALES_BILL,
                WEIGHT_TICKET_USAGE_ACTION.LOSS_FROM_SALES_BILL,
              ],
            },
            target_doc_no: bill.doc_no,
            target_type: 'SALES_BILL',
          },
        })
        if (hasReturnOrLoss) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขบิลขายนี้แบบปกติไม่ได้ เพราะมีการรับของคืนหรือบันทึก loss แล้ว' }, { status: 400 })
        }

        const deliveryValidation = await validateStockDeliverySelection(
          values,
          branch.id,
          customer.id,
          new Map(products.map((product) => [requireBusinessCode(product.code, `สินค้า ${product.id}`), product] as const)),
          productCodeById,
          { excludeSalesBillId: bill.id },
        )
        if ('error' in deliveryValidation) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: deliveryValidation.error }, { status: 400 })
        }
        stockDeliveryTicket = deliveryValidation.ticket
        deliverySummaryIdByItemIndex = deliveryValidation.deliverySummaryIdByItemIndex
        deliverySummarySourceMap = deliveryValidation.deliverySummarySourceMap
        stockIssueQtyByItemIndex = deliveryValidation.stockIssueQtyByItemIndex
      }

      for (const [index, item] of values.items.entries()) {
        const lineNo = lineNoByItemIndex.get(index) ?? index + 1
        const line = item.salesBillLineNo ? activeLineByOriginalLineNo.get(item.salesBillLineNo) : null
        if (String(bill.transaction_mode ?? 'STOCK') !== 'STOCK'
          && (!line
            || line.product_code_snapshot !== item.productId
            || line.product_id !== parsedProductIdsByLine[index]
            || Math.abs(toNumber(line.qty) - item.qty) > 0.0001
            || Math.abs(toNumber(line.net_weight) - item.netWeight) > 0.0001
            || Math.abs(toNumber(line.gross_weight) - item.grossWeight) > 0.0001
            || Math.abs(toNumber(line.deduct_weight) - item.deductWeight) > 0.0001)) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `รายการที่ ${lineNo}: แก้ไขน้ำหนัก/จำนวนขายของบิล Trading ยังไม่เปิดในรอบนี้ ให้แก้ได้เฉพาะ PO Sell อ้างอิง ราคา ส่วนลด และหมายเหตุ` }, { status: 400 })
        }
        const expectedQty = Number(Math.max(0, item.netWeight - item.deductWeight).toFixed(2))
        if (item.deductWeight > item.netWeight + 0.0001) {
          return NextResponse.json({
            code: 'BAD_REQUEST',
            error: `รายการที่ ${index + 1}: หักสิ่งเจือปนต้องไม่เกินจำนวนที่ขายได้`,
            fieldErrors: { [`items.${index}.deductWeight`]: ['หักสิ่งเจือปนต้องไม่เกินจำนวนที่ขายได้'] },
          }, { status: 400 })
        }
        if (Math.abs(expectedQty - item.qty) > 0.01) {
          return NextResponse.json({
            code: 'BAD_REQUEST',
            error: `รายการที่ ${index + 1}: น้ำหนักขายสุทธิต้องเท่ากับจำนวนที่ขายได้ - หักสิ่งเจือปน`,
            fieldErrors: { [`items.${index}.qty`]: ['น้ำหนักขายสุทธิต้องเท่ากับจำนวนที่ขายได้ - หักสิ่งเจือปน'] },
          }, { status: 400 })
        }
      }

      if (String(bill.transaction_mode ?? 'STOCK') === 'STOCK') {
        const existingDeliveryDocNos = [...new Set(bill.sales_bill_source_allocations
          .filter((allocation) => allocation.source_type === 'WTO')
          .map((allocation) => allocation.source_doc_no))]
        const requestedDeliveryDocNos = [...new Set(values.items.map((item) => item.deliveryTicketId || item.deliveryTicketDocNo).filter(Boolean) as string[])]
        if (existingDeliveryDocNos.length === 0 || requestedDeliveryDocNos.length !== existingDeliveryDocNos.length || requestedDeliveryDocNos.some((docNo) => !existingDeliveryDocNos.includes(docNo))) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขใบส่งของ WTO ในบิลขายยังไม่เปิดในรอบนี้' }, { status: 400 })
        }
      }

      const requestedPoSellDocNos = Array.from(new Set([
        ...values.items.map((item) => item.poSellId?.trim() ?? '').filter(Boolean),
        values.poSellId?.trim() ?? '',
        ...bill.sales_bill_po_sell_allocations.map((allocation) => allocation.po_sell_doc_no ?? '').filter(Boolean),
      ].filter(Boolean)))
      const poSells = requestedPoSellDocNos.length
        ? await prisma.po_sells.findMany({
            select: {
              branch_id: true,
              customer_id: true,
              doc_no: true,
              id: true,
              items: true,
              qty: true,
              remaining_amount: true,
              remaining_qty: true,
              status: true,
              total_amount: true,
              unit_price: true,
            },
            where: { doc_no: { in: requestedPoSellDocNos } },
          })
        : []
      const poSellByDocNoRaw = new Map(poSells.map((poSell) => [poSell.doc_no, poSell] as const))
      const missingPoSell = requestedPoSellDocNos.find((docNo) => !poSellByDocNoRaw.has(docNo))
      if (missingPoSell) return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบ PO Sell ${missingPoSell}` }, { status: 400 })
      for (const poSell of poSells) {
        if (isInactivePoSellStatus(poSell.status) && !bill.sales_bill_po_sell_allocations.some((allocation) => allocation.po_sell_id === poSell.id)) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `PO Sell ${poSell.doc_no} ถูกปิดหรือยกเลิกแล้ว` }, { status: 400 })
        }
        if (poSell.customer_id && poSell.customer_id !== customer.id) return NextResponse.json({ code: 'BAD_REQUEST', error: `Customer ของบิลขายไม่ตรงกับ PO Sell ${poSell.doc_no}` }, { status: 400 })
        if (poSell.branch_id && poSell.branch_id !== branch.id) return NextResponse.json({ code: 'BAD_REQUEST', error: `สาขาของบิลขายไม่ตรงกับ PO Sell ${poSell.doc_no}` }, { status: 400 })
      }

      const poSellByDocNo = poSellRowsByDocNoAfterRelease(poSells, bill.sales_bill_po_sell_allocations)
      const billDate = bill.date ? toDateOnly(bill.date) : toDateOnly(new Date())
      const vatRatePercent = toNumber(bill.vat_amount) > 0 && toNumber(bill.subtotal) > 0
        ? toNumber(bill.vat_amount) / Math.max(1, toNumber(bill.subtotal) - toNumber(bill.discount_total)) * 100
        : await activeVatRatePercent(normalizeDate(billDate))
      const totals = calculateSalesTotals(values, vatRatePercent)
      const items = salesItems(
        values,
        parsedProductIdsByLine as bigint[],
        productById,
        deliverySummarySourceMap,
        deliverySummaryIdByItemIndex,
        stockIssueQtyByItemIndex,
        lineNoByItemIndex,
      ).map((item, index) => {
        const sourceAllocation = sourceAllocationByLineNo.get(item.lineNo)
        const activeLine = activeLineByOriginalLineNo.get(item.lineNo)
        if (!sourceAllocation || !activeLine) return item
        const sourceMeta = sourceAllocation.meta && typeof sourceAllocation.meta === 'object' && !Array.isArray(sourceAllocation.meta)
          ? sourceAllocation.meta as Record<string, unknown>
          : {}
        return {
          ...item,
          deliveryLineId: typeof sourceMeta.deliveryLineId === 'string' ? sourceMeta.deliveryLineId : item.deliveryLineId,
          deliverySummaryId: typeof sourceMeta.deliverySummaryId === 'string' ? sourceMeta.deliverySummaryId : item.deliverySummaryId,
          deliveryTicketDocNo: sourceAllocation.source_doc_no,
          deliveryTicketId: sourceAllocation.source_doc_no,
          grossWeight: item.deliveryTicketId ? item.grossWeight : toNumber(activeLine.gross_weight),
          stockIssueQty: item.deliveryTicketId ? item.stockIssueQty : toNumber(sourceAllocation.allocated_qty),
        }
      })
      const stockDeltaByLine = String(bill.transaction_mode ?? 'STOCK') === 'STOCK'
        ? [
          ...items.map((item) => {
            const sourceAllocation = sourceAllocationByLineNo.get(item.lineNo)
            const oldStockIssueQty = sourceAllocation ? toNumber(sourceAllocation.allocated_qty) : 0
            const newStockIssueQty = item.stockIssueQty
            const sourceSummary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
            return {
              deltaQty: Number((newStockIssueQty - oldStockIssueQty).toFixed(2)),
              item,
              lineNo: item.lineNo,
              newStockIssueQty,
              oldStockIssueQty,
              productId: sourceSummary?.product_id ?? null,
              sourceAllocation,
              summaryId: item.deliverySummaryId,
            }
          }),
          ...deletedSalesBillLines.flatMap((line) => {
            const sourceAllocation = sourceAllocationByLineNo.get(line.line_no)
            if (!sourceAllocation) return []
            const sourceMeta = sourceAllocation.meta && typeof sourceAllocation.meta === 'object' && !Array.isArray(sourceAllocation.meta)
              ? sourceAllocation.meta as Record<string, unknown>
              : {}
            const summaryId = typeof sourceMeta.deliverySummaryId === 'string'
              ? sourceMeta.deliverySummaryId
              : null
            if (!summaryId) return []
            return [{
              deltaQty: -toNumber(sourceAllocation.allocated_qty),
              item: {
                lineNo: line.line_no,
                productCode: line.product_code_snapshot,
                productName: line.product_name_snapshot,
                qty: toNumber(line.qty),
              },
              lineNo: line.line_no,
              newStockIssueQty: 0,
              oldStockIssueQty: toNumber(sourceAllocation.allocated_qty),
              productId: sourceAllocation.product_id,
              sourceAllocation,
              summaryId,
            }]
          }),
        ]
        : []

      const releaseAllocations = new Map<bigint, number>()
      const consumeAllocations = new Map<bigint, number>()
      stockDeltaByLine.forEach((line) => {
        if (line.productId == null || Math.abs(line.deltaQty) <= 0.0001) return
        if (line.deltaQty < 0) {
          releaseAllocations.set(line.productId, (releaseAllocations.get(line.productId) ?? 0) + Math.abs(line.deltaQty))
        } else {
          consumeAllocations.set(line.productId, (consumeAllocations.get(line.productId) ?? 0) + line.deltaQty)
        }
      })
      const poSellAllocations = new Map<string, ReturnType<typeof allocatePoSellForSalesBill>>()
      for (const poSellDocNo of requestedPoSellDocNos) {
        const poSell = poSellByDocNo.get(poSellDocNo)
        if (!poSell) continue
        const poSellItems = items.filter((item) => item.poSellId === poSellDocNo || (!item.poSellId && values.poSellId === poSellDocNo))
        if (!poSellItems.length) continue
        const allocation = allocatePoSellForSalesBill(poSell, poSellItems)
        if ('error' in allocation) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `${poSellDocNo}: ${allocation.error}` }, { status: 400 })
        }
        poSellAllocations.set(poSellDocNo, allocation)
      }

      const createdAt = new Date()
      const totalCost = roundMoney(toNumber(bill.total_cost ?? bill.cogs_amount))
      const headerPoSellDocNo = values.poSellId?.trim() || undefined
      const oldCustomerAdvanceAllocations = bill.sales_bill_customer_advance_allocations.filter((allocation) => allocation.status === 'active')
      const oldCustomerAdvanceAllocatedAmount = oldCustomerAdvanceAllocations.reduce((sum, allocation) => sum + toNumber(allocation.allocated_amount), 0)
      const requestedCustomerAdvanceDocNo = values.customerAdvanceId?.trim() || ''
      const selectedCustomerAdvance = requestedCustomerAdvanceDocNo
        ? await prisma.bank_statement.findUnique({
            select: {
              amount_in: true,
              doc_no: true,
              ref_id: true,
              ref_no: true,
              ref_type: true,
            },
            where: { doc_no: requestedCustomerAdvanceDocNo },
          })
        : null
      if (requestedCustomerAdvanceDocNo && !selectedCustomerAdvance) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบเอกสารรับเงินล่วงหน้าที่เลือก' }, { status: 400 })
      if (selectedCustomerAdvance && selectedCustomerAdvance.ref_type !== 'CADV') return NextResponse.json({ code: 'BAD_REQUEST', error: 'เอกสารรับเงินล่วงหน้าไม่ถูกต้อง' }, { status: 400 })
      if (selectedCustomerAdvance && String(selectedCustomerAdvance.ref_id ?? '').trim() !== customer.code) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เอกสารรับเงินล่วงหน้าต้องเป็นลูกค้าเดียวกับบิลขาย' }, { status: 400 })
      const selectedCustomerAdvanceUsedAmount = selectedCustomerAdvance
        ? toNumber((await prisma.sales_bill_customer_advance_allocations.aggregate({
            _sum: { allocated_amount: true },
            where: {
              customer_advance_doc_no: selectedCustomerAdvance.doc_no,
              sales_bill_id: { not: bill.id },
              status: 'active',
            },
          }))._sum.allocated_amount)
        : 0
      const selectedCustomerAdvanceAvailable = selectedCustomerAdvance
        ? Math.max(0, toNumber(selectedCustomerAdvance.amount_in) - selectedCustomerAdvanceUsedAmount)
        : 0
      const customerAdvanceApplied = selectedCustomerAdvance
        ? Math.min(totals.totalAmount, selectedCustomerAdvanceAvailable)
        : 0
      if (selectedCustomerAdvance && customerAdvanceApplied <= 0.01) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เอกสารรับเงินล่วงหน้านี้ไม่มียอดคงเหลือสำหรับใช้หักบิลแล้ว' }, { status: 400 })
      await prisma.$transaction(async (tx) => {
        let stockCostDelta = 0
        let activeSalesBillLines = bill.sales_bill_lines
        const newItems = items.filter((item) => !activeLineByOriginalLineNo.has(item.lineNo))
        if (newItems.length > 0) {
          const allLineRows = salesBillLineRows({
            actor,
            billId: bill.id,
            createdAt,
            items,
            parsedProductIds: parsedProductIdsByLine as bigint[],
            totals,
          })
          await tx.sales_bill_lines.createMany({
            data: allLineRows.filter((line) => newItems.some((item) => item.lineNo === line.line_no)),
          })
          activeSalesBillLines = await tx.sales_bill_lines.findMany({
            orderBy: { line_no: 'asc' },
            where: { sales_bill_id: bill.id, status: 'active' },
          })
        }
        const lineIdByLineNo = new Map(activeSalesBillLines.map((line) => [line.line_no, line.id] as const))
        const activeLineByLineNo = new Map(activeSalesBillLines.map((line) => [line.line_no, line] as const))

        if (String(bill.transaction_mode ?? 'STOCK') === 'STOCK' && stockDeliveryTicket) {
          if (releaseAllocations.size > 0) {
            const releasedLines = await releaseConsumedWtoPendingOutForSalesBill(tx, {
              actor,
              allocations: [...releaseAllocations.entries()].map(([productId, qty]) => ({ productId, qty })),
              billDate: normalizeDate(billDate),
              branchId: branch.id,
              note: values.note,
              salesBillDocNo: bill.doc_no,
              salesChannelId: channel.id,
              weightTicketId: stockDeliveryTicket.id,
            })
            stockCostDelta = roundMoney(stockCostDelta - releasedLines.reduce((sum, line) => sum + line.valueIn, 0))
            await appendWtoPendingOutEventsForHoldKeys(tx, {
              actor,
              eventTypeForHold: () => 'sales_bill_edit_release',
              holdKeys: releasedLines.map((line) => line.pendingOutKey),
              occurredAt: createdAt,
              referenceDocNo: bill.doc_no,
              referenceDocType: 'SB',
              statusSnapshot: 'active',
            })
          }
          if (consumeAllocations.size > 0) {
            const consumedLines = await consumeActiveWtoPendingOut(tx, {
              actor,
              allocations: [...consumeAllocations.entries()].map(([productId, qty]) => ({ productId, qty })),
              billDate: normalizeDate(billDate),
              branchId: branch.id,
              salesBillDocNo: bill.doc_no,
              salesChannelId: channel.id,
              weightTicketId: stockDeliveryTicket.id,
            })
            stockCostDelta = roundMoney(stockCostDelta + consumedLines.reduce((sum, line) => sum + line.valueOut, 0))
            await appendWtoPendingOutEventsForSalesBill(tx, {
              actor,
              eventTypeForHold: () => 'sales_bill_consume',
              occurredAt: createdAt,
              referenceDocNo: bill.doc_no,
              referenceDocType: 'SB',
              salesBillDocNo: bill.doc_no,
              statusSnapshot: 'consumed',
            })
          }

          const usageEntries = stockDeltaByLine.flatMap((line) => {
            if (!line.summaryId || line.productId == null || Math.abs(line.deltaQty) <= 0.0001) return []
            const summary = deliverySummarySourceMap.get(line.summaryId)
            if (!summary) return []
            const qty = Math.abs(line.deltaQty)
            const common = {
              actor,
              allocatedDeductWeight: 0,
              allocatedGrossWeight: qty,
              allocatedNetWeight: qty,
              allocatedQty: qty,
              createdAt,
              meta: {
                newStockIssueQty: line.newStockIssueQty,
                oldStockIssueQty: line.oldStockIssueQty,
                reason: 'sales_bill_edit_stock_delta',
                salesProductCode: line.item.productCode,
                salesProductName: line.item.productName,
                salesNetWeight: line.item.qty,
              },
              note: values.note,
              productCodeSnapshot: summary.product_id != null ? productCodeById.get(summary.product_id) ?? line.item.productCode : line.item.productCode,
              productId: line.productId,
              productNameSnapshot: summary.product_name,
              targetDocNo: bill.doc_no,
              targetId: bill.id,
              targetLineNo: line.lineNo,
              targetType: 'SALES_BILL' as const,
              weightTicketId: stockDeliveryTicket.id,
              weightTicketProductSummaryId: summary.id,
            }
            return [{
              ...common,
              action: line.deltaQty > 0
                ? WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL
                : WEIGHT_TICKET_USAGE_ACTION.RELEASED_FROM_SALES_BILL,
            }]
          })
          await appendWeightTicketUsageLogs(tx, usageEntries)

          const summaryDeltaById = new Map<bigint, number>()
          stockDeltaByLine.forEach((line) => {
            if (!line.summaryId || Math.abs(line.deltaQty) <= 0.0001) return
            const summary = deliverySummarySourceMap.get(line.summaryId)
            if (!summary) return
            summaryDeltaById.set(summary.id, (summaryDeltaById.get(summary.id) ?? 0) + line.deltaQty)
          })
          await Promise.all([...summaryDeltaById.entries()].map(([summaryId, deltaQty]) => tx.weight_ticket_product_summaries.update({
            data: {
              billed_weight: deltaQty > 0 ? { increment: deltaQty } : { decrement: Math.abs(deltaQty) },
              remaining_weight: deltaQty > 0 ? { decrement: deltaQty } : { increment: Math.abs(deltaQty) },
              updated_at: createdAt,
            },
            where: { id: summaryId },
          })))

          for (const [lineNo, sourceAllocation] of sourceAllocationByLineNo.entries()) {
            const item = items.find((candidate) => candidate.lineNo === lineNo)
            if (!item) {
              await tx.sales_bill_source_allocations.update({
                data: {
                  notes: 'Reversed by Sales Bill edit line delete',
                  status: 'reversed',
                  updated_at: createdAt,
                  updated_by: actor,
                  version: { increment: 1 },
                },
                where: { id: sourceAllocation.id },
              })
              continue
            }
            const summary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
            if (!summary || summary.product_id == null) {
              throw new Error(`Sales Bill WTO source allocation missing product summary for line ${lineNo}`)
            }
            const sourceProductCode = productCodeById.get(summary.product_id)
            if (!sourceProductCode) {
              throw new Error(`Sales Bill WTO source allocation missing product code for line ${lineNo}`)
            }
            await tx.sales_bill_source_allocations.update({
              data: {
                allocated_deduct_weight: item.deductWeight,
                allocated_gross_weight: item.grossWeight,
                allocated_net_weight: item.stockIssueQty,
                allocated_qty: item.stockIssueQty,
                meta: {
                  deliveryLineId: item.deliveryLineId ?? null,
                  deliverySummaryId: item.deliverySummaryId ?? null,
                  salesNetWeight: item.qty,
                  salesProductCode: item.productCode,
                  salesProductName: item.productName,
                  source: 'sales_bill_edit_from_wto',
                  stockIssueQty: item.stockIssueQty,
                },
                product_code_snapshot: sourceProductCode,
                product_id: summary.product_id,
                product_name_snapshot: summary.product_name,
                source_line_no: sourceLineNoFromDeliveryLineId(item.deliveryLineId),
                updated_at: createdAt,
                updated_by: actor,
                weight_ticket_product_summary_id: summary.id,
              },
              where: { id: sourceAllocation.id },
            })
          }
          const newSourceRows = sourceAllocationRows({
            actor,
            billId: bill.id,
            createdAt,
            deliverySummarySourceMap,
            items,
            lineIdByLineNo,
            productCodeById,
            stockDeliveryTicket,
          }).filter((row) => !sourceAllocationByLineNo.has(row.sales_line_no))
          if (newSourceRows.length > 0) {
            await tx.sales_bill_source_allocations.createMany({ data: newSourceRows })
          }

          const remainingAfterBilling = await tx.weight_ticket_product_summaries.aggregate({
            _sum: { remaining_weight: true },
            where: { weight_ticket_id: stockDeliveryTicket.id },
          })
          const activePendingOutCount = await tx.stock_holds.count({
            where: {
              status: 'active',
              weight_ticket_id: stockDeliveryTicket.id,
            },
          })
          const nextTicketStatus = toNumber(remainingAfterBilling._sum.remaining_weight) > 0.0001 || activePendingOutCount > 0
            ? 'partially_billed'
            : 'billed'
          if (stockDeliveryTicket.status !== nextTicketStatus) {
            await tx.weight_tickets.update({
              data: {
                status: nextTicketStatus,
                updated_at: createdAt,
                updated_by: actor,
              },
              where: { id: stockDeliveryTicket.id },
            })
            await appendWeightTicketStatusLog(tx, {
              action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
              actor,
              createdAt,
              fromStatus: stockDeliveryTicket.status,
              meta: {
                reason: 'sales_bill_edit_stock_delta',
                salesBillDocNo: bill.doc_no,
              },
              toStatus: nextTicketStatus,
              weightTicketId: stockDeliveryTicket.id,
            })
          }
        }

        const activePoSellAllocations = bill.sales_bill_po_sell_allocations.filter((allocation) => allocation.status === 'active')
        await appendPoSellAllocationLogs(tx, activePoSellAllocations
          .filter((allocation) => allocation.allocation_type === 'PO_SELL' && allocation.po_sell_id != null)
          .map((allocation) => ({
            action: PO_SELL_ALLOCATION_ACTION.RELEASED_FROM_SALES_BILL,
            actor,
            allocatedAmount: toNumber(allocation.allocated_amount),
            allocatedQty: toNumber(allocation.allocated_qty),
            createdAt,
            meta: { reason: 'sales_bill_edit_po_sell' },
            note: 'Sales Bill edit: release old PO Sell allocation',
            poSellId: allocation.po_sell_id!,
            productCodeSnapshot: allocation.product_code_snapshot,
            productId: allocation.product_id,
            productNameSnapshot: allocation.product_name_snapshot,
            salesBillDocNo: bill.doc_no,
            salesBillId: bill.id,
            salesBillLineId: allocation.sales_bill_line_id,
            salesBillLineNo: allocation.sales_line_no,
            unitPriceSnapshot: toNumber(allocation.unit_price),
          })))
        for (const poSell of poSells) {
          const oldRows = activePoSellAllocations.filter((allocation) => allocation.po_sell_id === poSell.id)
          if (oldRows.length === 0) continue
          const released = deallocatePoSellForSalesBill(poSell, oldRows.map(salesBillPoAllocationSnapshot))
          await tx.po_sells.update({
            data: {
              ...(released.items ? { items: released.items as Prisma.InputJsonValue } : {}),
              cut_amount: { decrement: released.restoredAmount },
              remaining_amount: released.remainingAmount,
              remaining_qty: released.remainingQty,
              status: 'Open',
              updated_at: createdAt,
              updated_by: actor,
            },
            where: { id: poSell.id },
          })
        }

        await tx.sales_bill_po_sell_allocations.updateMany({
          data: {
            notes: 'Reversed by Sales Bill edit',
            status: 'reversed',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: { sales_bill_id: bill.id, status: 'active' },
        })
        if (oldCustomerAdvanceAllocations.length > 0) {
          await tx.sales_bill_customer_advance_allocations.updateMany({
            data: {
              meta: {
                reason: 'sales_bill_edit_customer_advance',
                releasedAt: createdAt.toISOString(),
                releasedBy: actor,
              },
              notes: 'Reversed by Sales Bill edit',
              status: 'reversed',
              updated_at: createdAt,
              updated_by: actor,
            },
            where: { sales_bill_id: bill.id, status: 'active' },
          })
        }

        const updatedTotalCost = roundMoney(totalCost + stockCostDelta)
        await tx.sales_bills.update({
          data: {
            discount: values.discountTotal,
            discount_total: values.discountTotal,
            export_order_no: values.exportOrderNo,
            gross_profit: roundMoney(totals.grossProfitBase - updatedTotalCost),
            has_vat: values.hasVat,
            items: items as Prisma.InputJsonValue,
            note: values.note,
            notes: values.note,
            paid_amount: customerAdvanceApplied,
            receivable_balance: Math.max(0, totals.totalAmount - customerAdvanceApplied),
            ref_no: values.refNo,
            received_amount: customerAdvanceApplied,
            subtotal: totals.subtotal,
            total_amount: totals.totalAmount,
            total_cost: updatedTotalCost,
            updated_at: createdAt,
            updated_by: actor,
            vat_amount: totals.vatAmount,
            vat_invoice_date: values.vatInvoiceDate ? normalizeDate(values.vatInvoiceDate) : null,
            vat_invoice_issued: values.vatInvoiceIssued,
            vat_invoice_no: values.vatInvoiceNo,
            vat_type: values.vatType,
            cogs_amount: updatedTotalCost,
          },
          where: { id: bill.id },
        })

        for (const [index, item] of items.entries()) {
          const activeLine = activeLineByLineNo.get(item.lineNo)
          if (!activeLine) continue
          await tx.sales_bill_lines.update({
            data: {
              deduct_weight: item.deductWeight,
              discount_amount: item.discount,
              gross_weight: item.grossWeight,
              line_amount: item.amount,
              meta: {
                deliveryLineId: item.deliveryLineId ?? null,
                deliverySummaryId: item.deliverySummaryId ?? null,
                stockIssueQty: item.stockIssueQty,
                tradingCostSourceId: item.tradingCostSourceId ?? null,
              },
              net_weight: item.netWeight,
              notes: item.note || null,
              product_code_snapshot: item.productCode,
              product_id: parsedProductIdsByLine[index] ?? null,
              product_name_snapshot: item.productName,
              qty: item.qty,
              unit_price: item.unitPrice,
              unit_snapshot: item.unit,
              updated_at: createdAt,
              updated_by: actor,
              vat_amount: totals.subtotal > 0 ? totals.vatAmount * (Math.max(0, item.amount) / totals.subtotal) : 0,
              version: { increment: 1 },
            },
            where: { id: activeLine.id },
          })
        }
        if (deletedSalesBillLines.length > 0) {
          await tx.sales_bill_lines.updateMany({
            data: {
              notes: 'Removed by Sales Bill edit',
              status: 'removed',
              updated_at: createdAt,
              updated_by: actor,
              version: { increment: 1 },
            },
            where: {
              id: { in: deletedSalesBillLines.map((line) => line.id) },
              sales_bill_id: bill.id,
              status: 'active',
            },
          })
        }

        const poSellRows = poSellAllocationRows({
          actor,
          billId: bill.id,
          createdAt,
          headerPoSellDocNo,
          items,
          lineIdByLineNo,
          parsedProductIds: parsedProductIdsByLine as bigint[],
          poSellByDocNo,
        })
        if (poSellRows.length) {
          await tx.sales_bill_po_sell_allocations.createMany({ data: poSellRows })
          await appendPoSellAllocationLogs(tx, poSellAllocationLogEntries({
            action: PO_SELL_ALLOCATION_ACTION.ALLOCATED_TO_SALES_BILL,
            actor,
            createdAt,
            meta: { reason: 'sales_bill_edit_po_sell' },
            rows: poSellRows,
            salesBillDocNo: bill.doc_no,
          }))
        }
        if (selectedCustomerAdvance && customerAdvanceApplied > 0) {
          await tx.sales_bill_customer_advance_allocations.create({
            data: {
              allocated_amount: customerAdvanceApplied,
              created_at: createdAt,
              created_by: actor,
              customer_advance_doc_no: selectedCustomerAdvance.doc_no,
              customer_code_snapshot: customer.code,
              customer_id: customer.id,
              customer_name_snapshot: customer.name,
              meta: {
                oldAllocatedAmount: oldCustomerAdvanceAllocatedAmount,
                reason: 'sales_bill_edit_customer_advance',
                source: 'sales_bill_edit',
              },
              outstanding_after: Math.max(0, selectedCustomerAdvanceAvailable - customerAdvanceApplied),
              outstanding_before: selectedCustomerAdvanceAvailable,
              sales_bill_id: bill.id,
              status: 'active',
              updated_at: createdAt,
              updated_by: actor,
            },
          })
        }
        for (const [poSellDocNo, allocation] of poSellAllocations.entries()) {
          const poSell = poSellByDocNo.get(poSellDocNo)
          if (!poSell || 'error' in allocation || !poSell.id) continue
          await tx.po_sells.update({
            data: {
              ...(allocation.items ? { items: allocation.items as Prisma.InputJsonValue } : {}),
              cut_amount: { increment: allocation.usedAmount },
              remaining_amount: allocation.remainingAmount,
              remaining_qty: allocation.remainingQty,
              status: allocation.remainingQty <= 0.001 ? 'Completed' : 'Open',
              updated_at: createdAt,
              updated_by: actor,
            },
            where: { id: poSell.id },
          })
        }
        await appendSalesBillStatusLog(tx, {
          action: SALES_BILL_STATUS_ACTION.ALLOCATION_CORRECTED,
          actor,
          createdAt,
          fromStatus: bill.status ?? null,
          meta: {
            customerAdvanceApplied,
            oldCustomerAdvanceAllocatedAmount,
            reason: 'sales_bill_commercial_correction',
            supportedScope: 'commercial_and_stock_delta_on_same_wto_source',
          },
          note: values.note,
          salesBillId: bill.id,
          toStatus: bill.status ?? 'unreceived',
        })
      }, { timeout: 30000 })

      return NextResponse.json({ docNo: bill.doc_no, id: bill.doc_no, status: 'updated' })
    }

    const { id, reason } = cancelSalesBillSchema.parse(raw)

    const bill = await prisma.sales_bills.findFirst({
      where: { doc_no: id, ...scopedBranchWhere(branchScope.ids) }
    })
    if (!bill) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลขาย' }, { status: 404 })
    }
    if (bill.status === 'cancelled') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลนี้ถูกยกเลิกแล้ว' }, { status: 400 })
    }

    const activeReceiptsCount = await activeSalesReceiptCount(prisma, bill.id)
    if (activeReceiptsCount > 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยกเลิกบิลไม่ได้ เนื่องจากมีการชำระเงินแล้ว' }, { status: 400 })
    }

    const createdAt = new Date()
    const billItems = Array.isArray(bill.items) ? (bill.items as unknown[] as SalesItemSnapshot[]) : []
    const isStockBill = String(bill.transaction_mode ?? 'STOCK') === 'STOCK'
    const poSellDocNos = [...new Set(billItems.map(item => item.poSellId).filter(Boolean) as string[])]

    const poSells = poSellDocNos.length
      ? await prisma.po_sells.findMany({
          select: {
            branch_id: true,
            customer_id: true,
            doc_no: true,
            id: true,
            items: true,
            qty: true,
            remaining_amount: true,
            remaining_qty: true,
            status: true,
            total_amount: true,
            unit_price: true,
          },
          where: { doc_no: { in: poSellDocNos } },
        })
      : []
    const poSellByDocNo = new Map(poSells.map((poSell) => [poSell.doc_no, poSell] as const))

    await prisma.$transaction(async (tx) => {
      // 1. Mark status to cancelled and clear balances
      await tx.sales_bills.update({
        data: {
          status: 'cancelled',
          receivable_balance: 0,
          received_amount: 0,
          paid_amount: 0,
          updated_at: createdAt,
          updated_by: actor,
          note: [bill.note, `ยกเลิกโดย ${actor} เมื่อ ${createdAt.toLocaleString('th-TH')} - เหตุผล: ${reason}`].filter(Boolean).join('\n'),
          notes: [bill.notes, `ยกเลิกโดย ${actor} เมื่อ ${createdAt.toLocaleString('th-TH')} - เหตุผล: ${reason}`].filter(Boolean).join('\n'),
        },
        where: { id: bill.id },
      })

      // 2. Revert PO Sell allocation
      const activePoSellAllocations = await tx.sales_bill_po_sell_allocations.findMany({
        where: {
          allocation_type: 'PO_SELL',
          sales_bill_id: bill.id,
          status: 'active',
        },
      })
      await appendPoSellAllocationLogs(tx, activePoSellAllocations
        .filter((allocation) => allocation.po_sell_id != null)
        .map((allocation) => ({
          action: PO_SELL_ALLOCATION_ACTION.RELEASED_FROM_SALES_BILL,
          actor,
          allocatedAmount: toNumber(allocation.allocated_amount),
          allocatedQty: toNumber(allocation.allocated_qty),
          createdAt,
          meta: {
            reason: 'sales_bill_cancel',
          },
          note: reason,
          poSellId: allocation.po_sell_id!,
          productCodeSnapshot: allocation.product_code_snapshot,
          productId: allocation.product_id,
          productNameSnapshot: allocation.product_name_snapshot,
          salesBillDocNo: bill.doc_no,
          salesBillId: bill.id,
          salesBillLineId: allocation.sales_bill_line_id,
          salesBillLineNo: allocation.sales_line_no,
          unitPriceSnapshot: toNumber(allocation.unit_price),
        })))
      for (const poSellDocNo of poSellDocNos) {
        const poSell = poSellByDocNo.get(poSellDocNo)
        if (!poSell) continue
        const poSellItems = billItems.filter((item) => item.poSellId === poSellDocNo)
        if (!poSellItems.length) continue
        const revertResult = deallocatePoSellForSalesBill(poSell, poSellItems)
        await tx.po_sells.update({
          data: {
            ...(revertResult.items ? { items: revertResult.items as Prisma.InputJsonValue } : {}),
            cut_amount: { decrement: revertResult.restoredAmount },
            remaining_amount: revertResult.remainingAmount,
            remaining_qty: revertResult.remainingQty,
            status: 'Open',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: { id: poSell.id },
        })
      }

      await tx.trading_allocation_facts.updateMany({
        data: {
          notes: `Cancelled from Sales Bill ${bill.doc_no}: ${reason}`,
          status: 'cancelled',
          updated_at: createdAt,
          updated_by: actor,
        },
        where: {
          sales_bill_id: bill.id,
          status: 'active',
        },
      })

      await Promise.all([
        tx.sales_bill_lines.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${reason}`,
            status: 'cancelled',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
        tx.sales_bill_source_allocations.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${reason}`,
            status: 'cancelled',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
        tx.sales_bill_po_sell_allocations.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${reason}`,
            status: 'cancelled',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
        tx.sales_bill_customer_advance_allocations.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${reason}`,
            status: 'cancelled',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
      ])

      await appendSalesBillStatusLog(tx, {
        action: SALES_BILL_STATUS_ACTION.CANCELLED,
        actor,
        createdAt,
        fromStatus: bill.status ?? null,
        meta: {
          reason: 'sales_bill_cancel',
        },
        note: reason,
        salesBillId: bill.id,
        toStatus: 'cancelled',
      })

      if (isStockBill) {
        const reopenedPendingOut = await reopenConsumedWtoPendingOutForSalesBill(tx, {
          actor,
          cancelDate: createdAt,
          note: reason,
          salesBillDocNo: bill.doc_no,
        })

        if (reopenedPendingOut.length > 0) {
          await appendWtoPendingOutEventsFromHoldIds(tx, {
            actor,
            eventTypeForHold: () => 'sales_bill_cancel_reopen',
            holdIds: reopenedPendingOut.map((hold) => hold.id),
            occurredAt: createdAt,
            referenceDocNo: bill.doc_no,
            referenceDocType: 'SB',
            statusSnapshot: 'active',
          })
          const usageLogs = await tx.weight_ticket_usage_logs.findMany({
            where: {
              target_id: bill.id,
              target_type: 'SALES_BILL',
              action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
            },
          })
          const revertUsageLogs = usageLogs.map((log) => ({
            action: WEIGHT_TICKET_USAGE_ACTION.RELEASED_FROM_SALES_BILL,
            actor,
            allocatedDeductWeight: toNumber(log.allocated_deduct_weight),
            allocatedGrossWeight: toNumber(log.allocated_gross_weight),
            allocatedNetWeight: toNumber(log.allocated_net_weight),
            allocatedQty: toNumber(log.allocated_qty),
            meta: { reason: 'sales_bill_cancel' },
            productCodeSnapshot: log.product_code_snapshot,
            productId: log.product_id,
            productNameSnapshot: log.product_name_snapshot,
            targetDocNo: bill.doc_no,
            targetId: bill.id,
            targetType: 'SALES_BILL' as const,
            weightTicketId: log.weight_ticket_id,
            weightTicketProductSummaryId: log.weight_ticket_product_summary_id!,
          }))
          await appendWeightTicketUsageLogs(tx, revertUsageLogs)

          for (const log of usageLogs) {
            await tx.weight_ticket_product_summaries.update({
              data: {
                billed_weight: { decrement: toNumber(log.allocated_qty) },
                remaining_weight: { increment: toNumber(log.allocated_qty) },
                updated_at: createdAt,
              },
              where: { id: log.weight_ticket_product_summary_id! },
            })
          }

          const uniqueTicketIds = [...new Set(usageLogs.map((log) => log.weight_ticket_id))]
          for (const ticketId of uniqueTicketIds) {
            const ticket = await tx.weight_tickets.findUnique({
              select: { status: true },
              where: { id: ticketId },
            })
            if (ticket) {
              await tx.weight_tickets.update({
                data: {
                  status: 'delivered',
                  updated_at: createdAt,
                  updated_by: actor,
                },
                where: { id: ticketId },
              })
              await appendWeightTicketStatusLog(tx, {
                action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
                actor,
                createdAt,
                fromStatus: ticket.status,
                meta: {
                  reason: 'sales_bill_cancel',
                  salesBillDocNo: bill.doc_no,
                },
                toStatus: 'delivered',
                weightTicketId: ticketId,
              })
            }
          }
        }
      }
    })

    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกบิลขายไม่ได้', 400)
  }
}
