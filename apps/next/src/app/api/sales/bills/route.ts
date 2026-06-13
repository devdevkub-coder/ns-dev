import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { salesBillFormSchema, type SalesBillFormValues } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { currentActor, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { findActiveSalesChannelReferenceByCode } from '@/lib/server/sales-channel-reference'
import { activeSalesReceiptCountByBillId, salesBillCancelState } from '@/lib/server/sales-bill-cancel-policy'
import { appendStockIssueStatusLog, STOCK_ISSUE_STATUS_ACTION } from '@/lib/server/stock-issue-history'
import { consumeActiveWtoStockHolds, WtoStockHoldError } from '@/lib/server/stock-holds'
import { activeVatRatePercent } from '@/lib/server/tax-settings'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION } from '@/lib/server/weight-ticket-usage-history'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

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
    sales_channels: true
    warehouses: true
  }
}>

type DeliveryTicketOptionRow = Prisma.weight_ticketsGetPayload<{
  include: {
    branches: true
    customers: true
    weight_ticket_product_summaries: {
      include: {
        weight_ticket_product_summary_lines: true
      }
      orderBy: {
        product_name: 'asc'
      }
    }
    weight_ticket_lines: {
      orderBy: {
        line_no: 'asc'
      }
    }
  }
}>

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

function billJson(row: SalesBillRow, activeReceiptCount = 0) {
  const cancelState = salesBillCancelState(row.status, activeReceiptCount)
  return {
    branchId: row.branches?.code ?? '',
    branchName: row.branches?.name ?? '-',
    canCancel: cancelState.canCancel,
    channelId: row.sales_channels?.code ?? '',
    channelName: row.sales_channels?.name ?? '-',
    createdAt: row.created_at?.toISOString(),
    createdBy: row.created_by ?? '',
    customerName: row.customers?.name ?? '-',
    date: toDateOnly(row.date),
    docNo: row.doc_no,
    grossProfit: toNumber(row.gross_profit),
    id: row.doc_no,
    itemCount: Array.isArray(row.items) ? row.items.length : 0,
    lockedReason: cancelState.lockedReason,
    receivableBalance: toNumber(row.receivable_balance),
    receivedAmount: toNumber(row.received_amount),
    refNo: row.ref_no ?? '',
    status: row.status ?? 'open',
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

function billWhere(query: BillQuery): Prisma.sales_billsWhereInput {
  const where: Prisma.sales_billsWhereInput = {}

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
  const subtotal = values.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const afterDiscount = Math.max(0, subtotal - values.discountTotal)
  const rate = Math.max(0, Math.min(100, vatRatePercent))
  const vatAmount = !values.hasVat || values.vatType === 'NONE'
    ? 0
    : values.vatType === 'INCLUDE'
      ? afterDiscount * rate / (100 + rate)
      : afterDiscount * (rate / 100)
  const totalAmount = values.hasVat && values.vatType === 'EXCLUDE' ? afterDiscount + vatAmount : afterDiscount
  return { subtotal, totalAmount, vatAmount }
}

function customerAdvanceIdFromBillItems(items: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    if (typeof record.customerAdvanceId === 'string' && record.customerAdvanceId) return record.customerAdvanceId
  }
  return null
}

function salesItems(
  values: SalesBillFormValues,
  parsedProductIds: bigint[],
  productById: Map<bigint, { code: string | null; name: string; unit: string | null }>,
  deliverySummarySourceMap: Map<string, DeliverySummarySource> = new Map(),
) {
  return values.items.map((item, index) => {
    const productId = parsedProductIds[index]
    const product = productById.get(productId)
    const deliverySummary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
    const deliverySummaryNetWeight = deliverySummary ? toNumber(deliverySummary.net_weight) : 0
    const deliveryRatio = deliverySummary && deliverySummaryNetWeight > 0 ? item.qty / deliverySummaryNetWeight : 0
    const grossWeight = deliverySummary && deliveryRatio > 0
      ? toNumber(deliverySummary.gross_weight) * deliveryRatio
      : item.grossWeight
    const deductWeight = deliverySummary && deliveryRatio > 0
      ? toNumber(deliverySummary.deduct_weight) * deliveryRatio
      : item.deductWeight
    const amount = Math.max(0, item.qty * item.price - item.discount)
    return {
      amount,
      customerAdvanceId: values.customerAdvanceId,
      deliveryLineId: item.deliveryLineId,
      deliverySummaryId: item.deliverySummaryId,
      deliveryTicketDocNo: item.deliveryTicketDocNo,
      deliveryTicketId: item.deliveryTicketId,
      deductWeight,
      discount: item.discount,
      grossWeight,
      id: `${String(index + 1).padStart(2, '0')}`,
      netWeight: item.qty,
      note: item.note,
      poSellId: item.poSellId,
      productCode: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productId: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productName: product?.name ?? '',
      qty: item.qty,
      unit: product?.unit ?? 'กก.',
      unitPrice: item.price,
    }
  })
}

type SalesItemSnapshot = ReturnType<typeof salesItems>[number]

function deliverySummaryUsageKey(ticketId: bigint, summaryId: bigint) {
  return `${ticketId.toString()}:${summaryId.toString()}`
}

async function buildDeliveryTicketUsageMap(tickets: DeliveryTicketOptionRow[]) {
  if (tickets.length === 0) return new Map<string, number>()
  const ticketDocNos = new Set(tickets.map((ticket) => ticket.doc_no))
  const rows = await prisma.sales_bills.findMany({
    select: {
      items: true,
      status: true,
    },
    where: {
      status: { notIn: ['cancelled', 'Cancelled', 'void', 'voided'] },
    },
  })
  const usageMap = new Map<string, number>()
  rows.forEach((row) => {
    if (!Array.isArray(row.items)) return
    row.items.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return
      const record = item as Record<string, unknown>
      const ticketDocNo = typeof record.deliveryTicketId === 'string' ? record.deliveryTicketId : null
      const summaryId = typeof record.deliverySummaryId === 'string' ? record.deliverySummaryId : null
      const qty = Number(record.qty ?? 0)
      if (!ticketDocNo || !summaryId || !ticketDocNos.has(ticketDocNo) || !Number.isFinite(qty) || qty <= 0) return
      usageMap.set(summaryId, (usageMap.get(summaryId) ?? 0) + qty)
    })
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

  const productSummaries = row.weight_ticket_product_summaries.map((summary) => {
    const productCode = summary.product_id != null ? (productCodeById.get(summary.product_id) ?? '') : ''
    const outwardSummaryId = `${row.doc_no}:${productCode}:${summary.line_count ?? 0}`
    const usedQty = usageMap.get(outwardSummaryId) ?? usageMap.get(deliverySummaryUsageKey(row.id, summary.id)) ?? 0
    const netWeight = toNumber(summary.net_weight)
    const remainingWeight = Math.max(0, netWeight - usedQty)
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

async function loadDeliveryAvailability(deliveryDocNo: string) {
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
    },
    where: {
      doc_no: deliveryDocNo,
    },
  })
  if (!ticket) return { ticket: null, usedQtyBySummaryId: new Map<string, number>() }

  const rows = await prisma.sales_bills.findMany({
    select: {
      items: true,
    },
    where: {
      status: { notIn: ['cancelled', 'Cancelled', 'void', 'voided'] },
    },
  })
  const usedQtyBySummaryId = new Map<string, number>()
  rows.forEach((row) => {
    if (!Array.isArray(row.items)) return
    row.items.forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return
      const record = item as Record<string, unknown>
      const ticketDocNo = typeof record.deliveryTicketId === 'string' ? record.deliveryTicketId : ''
      const summaryId = typeof record.deliverySummaryId === 'string' ? record.deliverySummaryId : ''
      const qty = jsonNumber(record.qty)
      if (ticketDocNo !== ticket.doc_no || !summaryId || qty <= 0) return
      usedQtyBySummaryId.set(summaryId, (usedQtyBySummaryId.get(summaryId) ?? 0) + qty)
    })
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
) {
  const deliveryDocNo = values.deliveryTicketId?.trim()
  if (!deliveryDocNo) {
    return { error: 'เลือกใบส่งของ WTO' as const }
  }

  const { ticket, usedQtyBySummaryId } = await loadDeliveryAvailability(deliveryDocNo)
  if (!ticket || ticket.doc_type !== 'WTO' || ticket.cancelled_at) {
    return { error: 'ใบส่งของที่เลือกไม่ถูกต้อง' as const }
  }
  if (resolvedBranchId && ticket.branch_id !== resolvedBranchId) {
    return { error: 'ใบส่งของต้องอยู่สาขาเดียวกับบิลขาย' as const }
  }
  if (ticket.customer_id !== resolvedCustomerId) {
    return { error: 'ใบส่งของต้องเป็นลูกค้าเดียวกับบิลขาย' as const }
  }

  const { deliverySummarySourceMap, lineToSummaryRef } = deliveryReferenceMaps(ticket, productCodeById)
  const requestedQtyBySummaryId = new Map<string, number>()

  for (const item of values.items) {
    const resolvedSummaryRef = item.deliverySummaryId ?? (item.deliveryLineId ? lineToSummaryRef.get(item.deliveryLineId) ?? null : null)
    if (item.deliveryTicketId !== ticket.doc_no || !resolvedSummaryRef) {
      return { error: 'รายการ Stock ต้องอ้างอิงรายการจากใบส่งของเดียวกัน' as const }
    }
    const summarySource = deliverySummarySourceMap.get(resolvedSummaryRef)
    if (!summarySource) {
      return { error: 'มีรายการอ้างอิงใบส่งของที่ไม่ถูกต้อง' as const }
    }
    const itemProduct = productByRef.get(item.productId)
    if (!itemProduct) {
      return { error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' as const }
    }
    if (summarySource.product_id !== itemProduct.id) {
      return { error: 'สินค้าในบิลไม่ตรงกับสินค้าในใบส่งของ' as const }
    }
    requestedQtyBySummaryId.set(resolvedSummaryRef, (requestedQtyBySummaryId.get(resolvedSummaryRef) ?? 0) + item.qty)
  }

  for (const summary of ticket.weight_ticket_product_summaries) {
    const productCode = summary.product_id != null ? productCodeById.get(summary.product_id) ?? '' : ''
    const summaryId = deliverySummaryOutwardId(ticket.doc_no, productCode, summary.line_count)
    const availableQty = Math.max(0, toNumber(summary.net_weight) - (usedQtyBySummaryId.get(summaryId) ?? 0))
    const requestedQty = requestedQtyBySummaryId.get(summaryId) ?? 0
    if (requestedQty > availableQty + 0.0001) {
      return { error: `จำนวนเกินน้ำหนักคงเหลือของ ${summary.product_name}` as const }
    }
    if (availableQty > 0.0001 && requestedQty < availableQty - 0.0001) {
      const remainingQty = Math.max(0, availableQty - requestedQty).toLocaleString('th-TH', { maximumFractionDigits: 2 })
      return { error: `ใบส่งของต้องจัดสรรให้ครบก่อนบันทึก: ${summary.product_name} ยังเหลือ ${remainingQty} กก.` as const }
    }
  }

  return { deliverySummarySourceMap, ticket }
}

async function salesOptionsPayload() {
  const [branches, customers, products, salesChannels, warehouses, vatRatePercent, deliveryTickets, poSellRows, customerAdvanceRows, salesBillsWithAdvance] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.customers.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
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
      },
      orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
      take: 300,
      where: {
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
        status: { notIn: ['cancelled', 'canceled', 'closed', 'completed', 'fully matched', 'received', 'void', 'Cancelled', 'Canceled', 'Closed', 'Completed'] },
      },
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
    prisma.sales_bills.findMany({
      select: {
        items: true,
        paid_amount: true,
        status: true,
      },
      where: {
        status: { notIn: ['cancelled', 'Cancelled', 'void', 'voided'] },
      },
    }),
  ])
  const deliveryUsageMap = await buildDeliveryTicketUsageMap(deliveryTickets)
  const productCodeById = new Map(products.map((product) => [product.id, requireBusinessCode(product.code, `สินค้า ${product.id}`)]))
  const branchCodeById = new Map(branches.map((branch) => [branch.id, requireBusinessCode(branch.code, `สาขา ${branch.id}`)]))
  const customerCodeById = new Map(customers.map((customer) => [customer.id, requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)]))
  const customerByCode = new Map(customers.map((customer) => [requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`), customer] as const))
  const customerAdvanceUsedById = new Map<string, number>()
  salesBillsWithAdvance.forEach((bill) => {
    const advanceId = customerAdvanceIdFromBillItems(bill.items)
    if (!advanceId) return
    customerAdvanceUsedById.set(advanceId, (customerAdvanceUsedById.get(advanceId) ?? 0) + toNumber(bill.paid_amount))
  })

  return {
    branches: branches.map((branch) => ({
      ...branch,
      id: branch.code,
    })),
    customers: customers.map((customer) => ({
      ...customer,
      id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
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

function buildWorkbook(rows: ReturnType<typeof billJson>[]) {
  const dataRows = rows.map((row) => ({
    'เลขที่': row.docNo,
    'เลขที่อ้างอิง': row.refNo,
    'วันที่': row.date,
    'ลูกค้า': row.customerName,
    'สาขา/คลัง': row.warehouseName,
    'ประเภท': row.transactionMode,
    'สถานะ': row.status,
    'จำนวนรายการ': row.itemCount,
    'ยอดรวม': row.totalAmount,
    'รับแล้ว': row.receivedAmount,
    'ค้างรับ': row.receivableBalance,
    'Gross Profit': row.grossProfit,
    'อัพเดตโดย': row.updatedBy || row.createdBy,
    'อัพเดตเมื่อ': row.updatedAt || row.createdAt,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  sheet['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 },
  ]
  applyWorksheetTableLayout(sheet, 14, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'บิลขาย')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const url = new URL(request.url)
    const includePaging = url.searchParams.get('format') !== 'xlsx'
    const query = parseBillQuery(url, includePaging)
    const where = billWhere(query)

    const [rows, totalRows, totals] = await Promise.all([
      prisma.sales_bills.findMany({
        include: {
          branches: true,
          customers: true,
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
    const activeReceiptCountByBillId = await activeSalesReceiptCountByBillId(prisma, rows.map((row) => row.id))
    const jsonRows = rows.map((row) => billJson(row, activeReceiptCountByBillId.get(row.id) ?? 0))

    if (url.searchParams.get('format') === 'xlsx') {
      const body = buildWorkbook(jsonRows)
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
      ...await salesOptionsPayload(),
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

    const values = salesBillFormSchema.parse(await request.json())
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
    if (!channel) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ช่องทางขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
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
      ? (await prisma.sales_bills.findMany({
          select: {
            items: true,
            paid_amount: true,
          },
          where: {
            status: { notIn: ['cancelled', 'Cancelled', 'void', 'voided'] },
          },
        })).reduce((sum, bill) => customerAdvanceIdFromBillItems(bill.items) === selectedCustomerAdvance.doc_no ? sum + toNumber(bill.paid_amount) : sum, 0)
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
    let deliverySummarySourceMap = new Map<string, DeliverySummarySource>()
    let stockDeliveryTicket: DeliveryTicketOptionRow | null = null
    const fromPsaleNo = values.fromPsaleNo?.trim()
    if (values.pendingStockIssueId && fromPsaleNo) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกต้นทางเบิกออกได้ทีละรายการเท่านั้น' }, { status: 400 })
    }
    const pendingStockIssue = values.pendingStockIssueId
      ? await prisma.stock_issues.findFirst({
          select: {
            branch_id: true,
            customer_id: true,
            doc_no: true,
            id: true,
            items: true,
            status: true,
          },
          where: { doc_no: values.pendingStockIssueId },
        })
      : null
    if (values.pendingStockIssueId && !pendingStockIssue) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบรายการเบิกออกรอบิลที่เลือก' }, { status: 400 })
    }
    if (pendingStockIssue) {
      if ((pendingStockIssue.status ?? 'pending') !== 'pending') {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'รายการเบิกออกรอบิลนี้ถูกเปิดบิลหรือยกเลิกแล้ว' }, { status: 400 })
      }
      if (pendingStockIssue.branch_id && pendingStockIssue.branch_id !== branch.id) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาของบิลขายไม่ตรงกับรายการเบิกออกรอบิล' }, { status: 400 })
      }
      if (pendingStockIssue.customer_id && pendingStockIssue.customer_id !== customer.id) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าของบิลขายไม่ตรงกับรายการเบิกออกรอบิล' }, { status: 400 })
      }
      const pendingItems = Array.isArray(pendingStockIssue.items) ? pendingStockIssue.items : []
      const pendingQtyByProduct = new Map<string, number>()
      pendingItems.forEach((item) => {
        if (!item || typeof item !== 'object') return
        const record = item as Record<string, unknown>
        const productCode = String(record.productCode ?? record.productId ?? '').trim()
        const qty = typeof record.qty === 'number' ? record.qty : Number(record.qty ?? 0)
        if (!productCode || !Number.isFinite(qty)) return
        pendingQtyByProduct.set(productCode, (pendingQtyByProduct.get(productCode) ?? 0) + qty)
      })
      const requestedQtyByProduct = new Map<string, number>()
      values.items.forEach((item) => {
        requestedQtyByProduct.set(item.productId, (requestedQtyByProduct.get(item.productId) ?? 0) + item.qty)
      })
      for (const [productCode, requestedQty] of requestedQtyByProduct) {
        const pendingQty = pendingQtyByProduct.get(productCode) ?? 0
        if (requestedQty > pendingQty + 0.0001) {
          return NextResponse.json({ code: 'BAD_REQUEST', error: `สินค้า ${productCode} มากกว่าจำนวนที่เบิกออกรอบิลไว้` }, { status: 400 })
        }
      }
    }
    let stockIssue: { doc_no: string; id: bigint; status: string | null } | null = null
    if (fromPsaleNo) {
      stockIssue = await prisma.stock_issues.findFirst({
        select: { doc_no: true, id: true, status: true },
        where: { doc_no: fromPsaleNo },
      })
      if (!stockIssue) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบใบเบิกออก ${fromPsaleNo}` }, { status: 400 })
      }
      if (stockIssue.status !== 'pending') {
        return NextResponse.json({ code: 'BAD_REQUEST', error: `ใบเบิกออก ${fromPsaleNo} ไม่ได้อยู่ในสถานะรอเปิดบิล` }, { status: 400 })
      }
    }

    if (values.transactionMode === 'STOCK' && !pendingStockIssue && !stockIssue) {
      const deliveryValidation = await validateStockDeliverySelection(values, branch?.id ?? null, customer.id, productByCode, productCodeById)
      if ('error' in deliveryValidation) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: deliveryValidation.error }, { status: 400 })
      }
      deliverySummarySourceMap = deliveryValidation.deliverySummarySourceMap
      stockDeliveryTicket = deliveryValidation.ticket
    }
    const sourceStockIssue = pendingStockIssue ?? stockIssue

    const docNo = await nextDailyDocNo('sales_bills', 'SB', billDate)
    const items = salesItems(values, parsedProductIds as bigint[], productById, deliverySummarySourceMap)
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
    const totalCost = 0
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
          gross_profit: totals.totalAmount - totalCost,
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
          warehouse_id: warehouse?.id ?? null,
          from_p_sale_no: sourceStockIssue?.doc_no ?? null,
          from_p_sale_id: sourceStockIssue?.id ?? null,
        },
        select: { doc_no: true, id: true },
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

      if (values.transactionMode === 'STOCK' && pendingStockIssue) {
        await tx.stock_issues.update({
          data: {
            converted_to_bill_id: createdBill.id,
            status: 'converted',
          },
          where: { id: pendingStockIssue.id },
        })
        await appendStockIssueStatusLog(tx, {
          action: STOCK_ISSUE_STATUS_ACTION.CONVERTED,
          actor,
          fromStatus: pendingStockIssue.status ?? 'pending',
          meta: {
            reason: 'sales_bill_create_from_pending_sale',
            salesBillDocNo: createdBill.doc_no,
          },
          note: values.note || null,
          stockIssueId: pendingStockIssue.id,
          toStatus: 'converted',
        })
      }

      if (values.transactionMode === 'STOCK' && stockDeliveryTicket && !sourceStockIssue) {
        await consumeActiveWtoStockHolds(tx, {
          actor,
          billDate: normalizeDate(billDate),
          branchId: branch.id,
          salesBillDocNo: createdBill.doc_no,
          salesChannelId: channel.id,
          weightTicketId: stockDeliveryTicket.id,
        })

        const usageEntries = items.flatMap((item, index) => {
          const summary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
          if (!summary) return []
          return [{
            action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
            actor,
            allocatedDeductWeight: item.deductWeight,
            allocatedGrossWeight: item.grossWeight,
            allocatedNetWeight: item.qty,
            allocatedQty: item.qty,
            meta: { reason: 'sales_bill_create' },
            productCodeSnapshot: item.productCode,
            productId: item.productId ? productByCode.get(item.productId)?.id ?? null : null,
            productNameSnapshot: item.productName,
            targetDocNo: createdBill.doc_no,
            targetId: createdBill.id,
            targetLineNo: index + 1,
            targetType: 'SALES_BILL' as const,
            weightTicketId: stockDeliveryTicket.id,
            weightTicketProductSummaryId: summary.id,
          }]
        })
        await appendWeightTicketUsageLogs(tx, usageEntries)

        const summaryUsage = new Map<bigint, number>()
        items.forEach((item) => {
          const summary = item.deliverySummaryId ? deliverySummarySourceMap.get(item.deliverySummaryId) : null
          if (!summary) return
          summaryUsage.set(summary.id, (summaryUsage.get(summary.id) ?? 0) + item.qty)
        })
        await Promise.all([...summaryUsage.entries()].map(([summaryId, qty]) => tx.weight_ticket_product_summaries.update({
          data: {
            billed_weight: { increment: qty },
            remaining_weight: { decrement: qty },
            updated_at: createdAt,
          },
          where: { id: summaryId },
        })))
        await tx.weight_tickets.update({
          data: {
            status: 'billed',
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
          toStatus: 'billed',
          weightTicketId: stockDeliveryTicket.id,
        })
      }

      if (stockIssue) {
        await tx.stock_issues.update({
          data: {
            status: 'billed',
            converted_to_bill_id: createdBill.id,
          },
          where: { id: stockIssue.id },
        })
      }

      return createdBill
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.doc_no }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoStockHoldError) {
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

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const raw = await request.json()
    const { id, action, reason } = cancelSalesBillSchema.parse(raw)
    const actor = currentActor(context)

    const bill = await prisma.sales_bills.findFirst({
      where: { doc_no: id }
    })
    if (!bill) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลขาย' }, { status: 404 })
    }
    if (bill.status === 'cancelled') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลนี้ถูกยกเลิกแล้ว' }, { status: 400 })
    }

    const activeReceiptsCount = await prisma.receipts.count({
      where: {
        bill_id: bill.id,
        NOT: { status: { in: ['cancelled', 'void', 'ยกเลิก', 'Void', 'Cancelled'] } }
      }
    })
    if (activeReceiptsCount > 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยกเลิกบิลไม่ได้ เนื่องจากมีการชำระเงินแล้ว' }, { status: 400 })
    }

    const createdAt = new Date()
    const billItems = Array.isArray(bill.items) ? (bill.items as unknown[] as SalesItemSnapshot[]) : []
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

      // 3. Revert stock changes / stock issues depending on origin
      if (bill.from_p_sale_id != null) {
        await tx.stock_issues.update({
          data: {
            status: 'pending',
            converted_to_bill_id: null,
          },
          where: { id: bill.from_p_sale_id },
        })
      } else {
        // Delete stock_ledger entries
        await tx.stock_ledger.deleteMany({
          where: {
            ref_type: 'SB',
            ref_id: bill.doc_no,
          },
        })

        // Restore consumed WTO holds
        await tx.stock_holds.updateMany({
          data: {
            consumed_at: null,
            consumed_by: null,
            consumed_by_ref_no: null,
            consumed_by_ref_type: null,
            status: 'active',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: {
            consumed_by_ref_no: bill.doc_no,
            consumed_by_ref_type: 'SB',
            status: 'consumed',
          },
        })

        // Revert Weight Tickets status & release usage logs
        const usageLogs = await tx.weight_ticket_usage_logs.findMany({
          where: {
            target_id: bill.id,
            target_type: 'SALES_BILL',
            action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
          },
        })

        if (usageLogs.length > 0) {
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
