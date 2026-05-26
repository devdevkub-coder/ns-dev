import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
import { purchaseBillCancelSchema, purchaseBillFormSchema, type PurchaseBillFormValues } from '@/lib/purchase-bill'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { activeVatRatePercent } from '@/lib/server/tax-settings'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const STOCK_STATUS_VALUES = ['RM', 'WIP', 'FG', 'SCRAP'] as const
const PURCHASE_STOCK_WAREHOUSE_HINTS: Record<typeof STOCK_STATUS_VALUES[number], string[]> = {
  FG: ['FG', 'FINISHED', 'พร้อมขาย'],
  RM: ['RM', 'RAW', 'วัตถุดิบ'],
  SCRAP: ['SCRAP', 'เศษ', 'ของเสีย'],
  WIP: ['WIP', 'PROCESS', 'ระหว่างผลิต'],
}

type PurchaseBillRow = Prisma.purchase_billsGetPayload<{
  include: {
    branches: true
    purchase_bill_items: true
    suppliers: true
    warehouses: true
  }
}>

type WeightTicketOptionRow = Prisma.weight_ticketsGetPayload<{
  include: {
    branches: true
    suppliers: true
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

type BillQuery = {
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

function branchBillCode(branchCode: string | null | undefined) {
  const digits = String(branchCode ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(2, '0').slice(-2) : null
}

function normalizeStockStatus(value: string | null | undefined) {
  const normalized = String(value ?? 'RM').toUpperCase()
  return STOCK_STATUS_VALUES.includes(normalized as typeof STOCK_STATUS_VALUES[number])
    ? normalized as typeof STOCK_STATUS_VALUES[number]
    : 'RM'
}

function pickPurchaseStockWarehouse(rows: Array<{ code: string | null; id: string; name: string; type: string | null }>, status: typeof STOCK_STATUS_VALUES[number]) {
  const activeRows = rows.filter((row) => row.id)
  const typedWarehouse = activeRows.find((row) => normalizeStockStatus(row.type) === status && row.type)
  if (typedWarehouse) return typedWarehouse

  return activeRows.find((row) => {
    const text = `${row.code ?? ''} ${row.name}`.toUpperCase()
    return PURCHASE_STOCK_WAREHOUSE_HINTS[status].some((hint) => text.includes(hint.toUpperCase()))
  }) ?? activeRows[0] ?? null
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
    poBuyId: row.po_buy_id,
    price: toNumber(row.price),
    productCode: row.product_code ?? '',
    productId: row.product_id ?? '',
    productName: row.product_name ?? row.product_id ?? '',
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
  return {
    branchId: row.branch_id ?? '',
    branchName: row.branches?.name ?? '-',
    createdAt: row.date?.toISOString() ?? '',
    createdBy: row.created_by ?? '-',
    date: row.date ? toDateOnly(row.date) : '',
    discountTotal: toNumber(row.discount_total ?? row.discount),
    docNo: row.doc_no,
    hasVat: row.has_vat ?? false,
    id: row.id,
    items,
    itemCount: items.length,
    note: row.note ?? row.notes ?? '',
    paidAmount: toNumber(row.paid_amount),
    paymentDocNos,
    payableBalance: toNumber(row.payable_balance),
    poBuyId: row.po_buy_id ?? '',
    purchaseSource: row.purchase_source ?? 'SPOT_BUY',
    refNo: row.ref_no ?? '',
    salesId: row.sales_id ?? '',
    status: row.status ?? 'unpaid',
    supplierId: row.supplier_id ?? '',
    supplierName: row.suppliers?.name ?? row.supplier_id ?? '-',
    totalAmount: toNumber(row.total_amount),
    transactionMode: row.transaction_mode ?? 'STOCK',
    updatedAt: row.updated_at?.toISOString() ?? '',
    updatedBy: row.updated_by ?? '',
    vatInvoiceNo: row.vat_invoice_no ?? '',
    vatInvoiceDate: row.vat_invoice_date ? toDateOnly(row.vat_invoice_date) : '',
    vatInvoiceReceived: row.vat_invoice_received ?? false,
    vatRatePercent: toNumber(row.vat_rate_percent) ?? 7,
    warehouseId: row.warehouse_id ?? '',
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

  return { afterDiscount, subtotal, totalAmount, vatAmount }
}

function buildBillItems(
  values: PurchaseBillFormValues,
  productById: Map<string, { code: string; item_status: string | null; name: string; unit: string | null }>,
  poBuyById: Map<string, { unit_price: Prisma.Decimal | null }>,
) {
  return values.items.map((item) => {
    const product = productById.get(item.productId)
    const poBuy = item.poBuyId ? poBuyById.get(item.poBuyId) : null
    const price = poBuy ? toNumber(poBuy.unit_price) : item.price
    const amount = Math.max(0, item.qty * price - item.discount)
    return {
      amount,
      deductWeight: item.deductWeight,
      discount: item.discount,
      displayName: item.displayName,
      grossWeight: item.grossWeight,
      itemStatus: normalizeStockStatus(product?.item_status),
      lotNo: item.lotNo,
      note: item.note,
      poBuyId: item.poBuyId,
      price,
      productCode: product?.code ?? '',
      productId: item.productId,
      productName: product?.name ?? item.productId,
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

function buildPurchaseBillReceiptAllocationRows(
  billId: string,
  itemRows: ReturnType<typeof billItemCreateRows>,
  summaryById: Map<string, { deduct_weight: Prisma.Decimal | null; gross_weight: Prisma.Decimal | null; net_weight: Prisma.Decimal | null; weight_ticket_id: string }>,
  actor: string,
) {
  return itemRows.flatMap((item) => {
    const snapshot = item.source_snapshot && typeof item.source_snapshot === 'object'
      ? item.source_snapshot as Record<string, unknown>
      : {}
    const summaryId = typeof snapshot.receiptSummaryId === 'string' ? snapshot.receiptSummaryId : ''
    if (!summaryId) return []
    const summary = summaryById.get(summaryId)
    if (!summary) return []
    const allocatedQty = toNumber(item.qty)
    const netWeight = toNumber(summary.net_weight)
    const ratio = netWeight > 0 ? allocatedQty / netWeight : 0
    return [{
      allocated_deduct_weight: toNumber(summary.deduct_weight) * ratio,
      allocated_gross_weight: toNumber(summary.gross_weight) * ratio,
      allocated_qty: allocatedQty,
      created_by: actor,
      id: `PBRA-${randomUUID()}`,
      purchase_bill_id: billId,
      purchase_bill_item_id: item.id,
      weight_ticket_id: summary.weight_ticket_id,
      weight_ticket_product_summary_id: summaryId,
    }]
  })
}

function buildPurchaseBillPoAllocationRows(
  billId: string,
  itemRows: ReturnType<typeof billItemCreateRows>,
  actor: string,
) {
  return itemRows.flatMap((item) => {
    if (!item.po_buy_id) return []
    return [{
      allocated_amount: toNumber(item.amount),
      allocated_qty: toNumber(item.qty),
      created_by: actor,
      id: `PBPA-${randomUUID()}`,
      po_buy_id: item.po_buy_id,
      purchase_bill_id: billId,
      purchase_bill_item_id: item.id,
      unit_price_snapshot: toNumber(item.price),
    }]
  })
}

function receiptSummaryUsageKey(ticketId: string, summaryId: string) {
  return `${ticketId}::${summaryId}`
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
      weight_ticket_id: { in: ticketIds },
      purchase_bills: {
        NOT: { status: 'cancelled' },
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

async function loadReceiptAvailability(ticketId: string, excludeBillId?: string) {
  const [ticket, bills] = await Promise.all([
    prisma.weight_tickets.findUnique({
      include: {
        branches: true,
        suppliers: true,
        weight_ticket_product_summaries: {
          include: {
            weight_ticket_product_summary_lines: true,
          },
          orderBy: { product_name: 'asc' },
        },
        weight_ticket_lines: { orderBy: { line_no: 'asc' } },
      },
      where: { id: ticketId },
    }),
    prisma.purchase_bill_receipt_allocations.findMany({
      select: {
        allocated_qty: true,
        purchase_bill_id: true,
        weight_ticket_id: true,
        weight_ticket_product_summary_id: true,
      },
      where: {
        weight_ticket_id: ticketId,
        purchase_bills: {
          NOT: { status: 'cancelled' },
        },
      },
    }),
  ])

  const usageMap = new Map<string, number>()
  bills.forEach((row) => {
    if (excludeBillId && row.purchase_bill_id === excludeBillId) return
    const key = receiptSummaryUsageKey(row.weight_ticket_id, row.weight_ticket_product_summary_id)
    usageMap.set(key, (usageMap.get(key) ?? 0) + toNumber(row.allocated_qty))
  })

  return { ticket }
}

function receiptSummaryMap(ticket: NonNullable<Awaited<ReturnType<typeof loadReceiptAvailability>>['ticket']>) {
  return new Map(ticket.weight_ticket_product_summaries.map((summary) => [summary.id, summary]))
}

function extractReferencedReceiptTicketIdsFromValues(values: PurchaseBillFormValues) {
  return [...new Set(values.items.map((item) => item.receiptTicketId).filter((value): value is string => Boolean(value)))]
}

function extractReferencedReceiptTicketIdsFromBillItems(items: Array<{ source_snapshot: Prisma.JsonValue | null }>) {
  return [...new Set(items.map((item) => {
    const snapshot = item.source_snapshot && typeof item.source_snapshot === 'object'
      ? item.source_snapshot as Record<string, unknown>
      : {}
    return typeof snapshot.receiptTicketId === 'string' ? snapshot.receiptTicketId : ''
  }).filter(Boolean))]
}

async function validateStockReceiptSelection(
  values: PurchaseBillFormValues,
  poBuyById: Map<string, { product_id: string | null; remaining_qty: Prisma.Decimal | null; supplier_id: string | null }>,
  excludeBillId?: string,
) {
  if (!values.receiptTicketId) {
    return { error: 'เลือกใบรับของ' as const }
  }

  const { ticket } = await loadReceiptAvailability(values.receiptTicketId, excludeBillId)
  if (!ticket || ticket.doc_type !== 'WTI' || ticket.cancelled_at) {
    return { error: 'ใบรับของที่เลือกไม่ถูกต้อง' as const }
  }
  if (ticket.branch_id !== values.branchId) {
    return { error: 'ใบรับของต้องอยู่สาขาเดียวกับบิลรับซื้อ' as const }
  }
  if ((ticket.supplier_id ?? '') !== values.supplierId) {
    return { error: 'ใบรับของต้องเป็นผู้ขายเดียวกับบิลรับซื้อ' as const }
  }

  const summaryById = receiptSummaryMap(ticket)
  const lineToSummaryId = new Map<string, string>()
  ticket.weight_ticket_product_summaries.forEach((summary) => {
    summary.weight_ticket_product_summary_lines.forEach((bridge) => {
      lineToSummaryId.set(bridge.weight_ticket_line_id, summary.id)
    })
  })

  const requestedQtyBySummary = new Map<string, number>()
  const requestedQtyByPo = new Map<string, number>()
  for (const item of values.items) {
    const resolvedSummaryId = item.receiptSummaryId ?? (item.receiptLineId ? lineToSummaryId.get(item.receiptLineId) ?? null : null)
    if (item.receiptTicketId !== ticket.id || !resolvedSummaryId) {
      return { error: 'รายการ Stock ต้องอ้างอิงรายการจากใบรับของเดียวกัน' as const }
    }
    const summary = summaryById.get(resolvedSummaryId)
    if (!summary) {
      return { error: 'มีรายการอ้างอิงใบรับของที่ไม่ถูกต้อง' as const }
    }
    if (summary.product_id !== item.productId) {
      return { error: 'สินค้าในบิลไม่ตรงกับสินค้าในใบรับของ' as const }
    }
    if (item.poBuyId) {
      const poBuy = poBuyById.get(item.poBuyId)
      if (!poBuy) {
        return { error: 'PO Buy ที่เลือกไม่ถูกต้อง' as const }
      }
      if (poBuy.supplier_id && poBuy.supplier_id !== values.supplierId) {
        return { error: 'PO Buy ต้องเป็นผู้ขายเดียวกับบิลรับซื้อ' as const }
      }
      if (poBuy.product_id && poBuy.product_id !== item.productId) {
        return { error: 'PO Buy ต้องเป็นสินค้าเดียวกับรายการที่เลือก' as const }
      }
      requestedQtyByPo.set(item.poBuyId, (requestedQtyByPo.get(item.poBuyId) ?? 0) + item.qty)
    }
    requestedQtyBySummary.set(resolvedSummaryId, (requestedQtyBySummary.get(resolvedSummaryId) ?? 0) + item.qty)
  }

  for (const summary of ticket.weight_ticket_product_summaries) {
    const summaryId = summary.id
    const availableQty = Math.max(0, toNumber(summary.remaining_weight))
    const requestedQty = requestedQtyBySummary.get(summaryId) ?? 0
    if (requestedQty > availableQty + 0.0001) {
      return { error: `จำนวนเกินน้ำหนักคงเหลือของ ${summary.product_name}` as const }
    }
  }

  for (const [poBuyId, requestedQty] of requestedQtyByPo.entries()) {
    const poBuy = poBuyById.get(poBuyId)
    if (!poBuy) continue
    const remainingQty = toNumber(poBuy.remaining_qty)
    if (requestedQty > remainingQty + 0.0001) {
      return { error: `จำนวนเกินคงเหลือของ PO ${poBuyId}` as const }
    }
  }

  return { ticket }
}

function weightTicketOptionJson(row: WeightTicketOptionRow, usageMap: Map<string, number>) {
  const lines = row.weight_ticket_lines.map((line) => {
    const sourceNetWeight = toNumber(line.net_weight)
    return {
      deductWeight: toNumber(line.deduct_weight),
      grossWeight: toNumber(line.gross_weight),
      id: line.id,
      lineNo: line.line_no,
      netWeight: sourceNetWeight,
      note: line.note ?? '',
      productId: line.product_id,
      productName: line.product_name,
      remainingQty: sourceNetWeight,
      usedQty: 0,
    }
  })

  const productSummaries = row.weight_ticket_product_summaries.map((summary) => {
    const usedQty = usageMap.get(receiptSummaryUsageKey(row.id, summary.id)) ?? 0
    const netWeight = toNumber(summary.net_weight)
    const remainingWeight = Math.max(0, netWeight - usedQty)
    return {
      billedWeight: toNumber(summary.billed_weight),
      deductWeight: toNumber(summary.deduct_weight),
      grossWeight: toNumber(summary.gross_weight),
      hasMixedDeductionProfiles: summary.has_mixed_deduction_profiles ?? false,
      id: summary.id,
      lineCount: summary.line_count ?? 0,
      netWeight,
      productId: summary.product_id,
      productName: summary.product_name,
      remainingWeight,
      sourceLineIds: summary.weight_ticket_product_summary_lines.map((bridge) => bridge.weight_ticket_line_id),
    }
  }).filter((summary) => summary.remainingWeight > 0.0001)

  return {
    branchId: row.branch_id,
    branchName: row.branches.name,
    documentDate: toDateOnly(row.document_date),
    documentNo: row.doc_no,
    id: row.id,
    lines,
    productSummaries,
    partyName: row.party_name,
    status: row.status,
    supplierId: row.supplier_id ?? '',
    vehicleNo: row.vehicle_no,
  }
}

async function refreshWeightTicketStatuses(tx: Prisma.TransactionClient, ticketIds: string[]) {
  const uniqueTicketIds = [...new Set(ticketIds.filter(Boolean))]
  if (uniqueTicketIds.length === 0) return

  const ticketRows = await tx.weight_tickets.findMany({
    include: {
      weight_ticket_product_summaries: {
        include: {
          weight_ticket_product_summary_lines: true,
        },
        orderBy: { product_name: 'asc' },
      },
      weight_ticket_lines: {
        orderBy: { line_no: 'asc' },
      },
    },
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
      weight_ticket_id: { in: uniqueTicketIds },
      purchase_bills: {
        NOT: { status: 'cancelled' },
      },
    },
  })

  const qtyByTicketId = new Map<string, number>()
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
        updated_at: new Date(),
      },
      where: { id: ticket.id },
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
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.purchase_bills
    where doc_no like ${`PB${compactDate}-%`}
       or doc_no like ${`PB__${compactDate}-%`}
  `
  const lastNumber = rows.reduce((max, row) => {
    const running = Number(row.doc_no.split('-').at(-1))
    return Number.isFinite(running) && running > max ? running : max
  }, 0)
  const nextNumber = lastNumber + 1
  return `${startsWith}${String(nextNumber).padStart(4, '0')}`
}

async function optionsPayload() {
  const [branches, poBuys, products, salespersons, suppliers, warehouses, vatRatePercent, weightTickets] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.po_buys.findMany({
      orderBy: [{ doc_no: 'desc' }],
      select: { doc_no: true, id: true, product_id: true, remaining_amount: true, remaining_qty: true, status: true, supplier_id: true, unit_price: true },
      take: 500,
      where: { status: { notIn: ['closed', 'Closed', 'cancelled', 'Cancelled'] } },
    }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.salespersons.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.suppliers.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, id: true, name: true, sales_id: true } }),
    prisma.warehouses.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, branch_id: true, id: true, name: true } }),
    activeVatRatePercent(new Date()),
    prisma.weight_tickets.findMany({
      include: {
        branches: true,
        suppliers: true,
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
        doc_type: 'WTI',
        status: { in: ['received', 'partially_billed'] },
      },
    }),
  ])
  const usageMap = await buildWeightTicketUsageMap(weightTickets)

  return {
    branches,
    poBuys: poBuys.map((po) => ({
      active: !['closed', 'Closed', 'cancelled', 'Cancelled'].includes(po.status ?? ''),
      id: po.id,
      label: `${po.doc_no}${po.remaining_qty ? ` · คงเหลือ ${toNumber(po.remaining_qty).toLocaleString('th-TH')} กก.` : po.remaining_amount ? ` · คงเหลือ ${toNumber(po.remaining_amount).toLocaleString('th-TH')}` : ''}`,
      name: po.doc_no,
      product_id: po.product_id,
      remainingQty: toNumber(po.remaining_qty),
      supplier_id: po.supplier_id,
      unitPrice: toNumber(po.unit_price),
    })),
    products,
    receipts: weightTickets
      .map((ticket) => weightTicketOptionJson(ticket, usageMap))
      .filter((ticket) => ticket.productSummaries.length > 0),
    salespersons,
    suppliers,
    vatRatePercent,
    warehouses,
  }
}

function parseBillQuery(url: URL, includePaging = true): BillQuery {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = includePaging ? Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)) : 10000
  const sortDirection = url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc'

  return {
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

function billWhere(query: BillQuery): Prisma.purchase_billsWhereInput {
  const where: Prisma.purchase_billsWhereInput = {}

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lt: new Date(normalizeDate(query.dateTo).getTime() + 24 * 60 * 60 * 1000) } : {}),
    }
  }
  if (query.filterMode) where.transaction_mode = query.filterMode
  if (query.filterSource) where.purchase_source = query.filterSource
  if (query.statuses?.length) where.status = { in: query.statuses }
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

async function rowsPayload(query: BillQuery, includePaging = true) {
  const where = billWhere(query)
  const [rows, totalRows, totals] = await Promise.all([
    prisma.purchase_bills.findMany({
      include: {
        branches: true,
        purchase_bill_items: { orderBy: { line_no: 'asc' } },
        suppliers: true,
        warehouses: true,
      },
      orderBy: billOrderBy(query),
      skip: includePaging ? (query.page - 1) * query.pageSize : 0,
      take: includePaging ? query.pageSize : 10000,
      where,
    }),
    prisma.purchase_bills.count({ where }),
    prisma.purchase_bills.aggregate({
      _sum: { total_amount: true },
      where,
    }),
  ])
  const billIds = rows.map((row) => row.id)
  const payments = billIds.length > 0 ? await prisma.payments.findMany({
    orderBy: [{ created_at: 'asc' }],
    select: { bill_id: true, doc_no: true, status: true },
    where: {
      bill_id: { in: billIds },
      NOT: { status: 'cancelled' },
    },
  }) : []
  const paymentDocNosByBillId = new Map<string, string[]>()
  payments.forEach((payment) => {
    const billId = payment.bill_id ?? ''
    if (!billId || !payment.doc_no) return
    const current = paymentDocNosByBillId.get(billId) ?? []
    if (!current.includes(payment.doc_no)) current.push(payment.doc_no)
    paymentDocNosByBillId.set(billId, current)
  })

  return {
    rows: rows.map((row) => billJson(row, paymentDocNosByBillId.get(row.id) ?? [])),
    totalAmount: toNumber(totals._sum.total_amount),
    totalRows,
  }
}

function buildWorkbook(rows: ReturnType<typeof billJson>[]) {
  const dataRows = rows.map((row) => ({
    'เลขที่': row.docNo,
    'วันที่': row.date,
    'ผู้ขาย': row.supplierName,
    'ประเภท': row.transactionMode,
    'สถานะ': row.status,
    'จำนวนรายการ': row.itemCount,
    'ยอดรวม': row.totalAmount,
    'ค้างจ่าย': row.payableBalance,
    'สร้างโดย': row.createdBy,
    'สร้างเมื่อ': row.createdAt,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  sheet['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 },
  ]
  applyWorksheetTableLayout(sheet, 10, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'บิลรับซื้อ')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const query = parseBillQuery(url, url.searchParams.get('format') !== 'xlsx')
    const payload = await rowsPayload(query, url.searchParams.get('format') !== 'xlsx')

    if (url.searchParams.get('format') === 'xlsx') {
      const body = buildWorkbook(payload.rows)
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
      ...await optionsPayload(),
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

    const productIds = [...new Set(values.items.map((item) => item.productId))]
    const poBuyIds = [...new Set([values.poBuyId, ...values.items.map((item) => item.poBuyId)].filter(Boolean) as string[])]
    const [supplier, branch, poBuys, products] = await Promise.all([
      prisma.suppliers.findFirst({ select: { id: true, sales_id: true }, where: { active: true, id: values.supplierId } }),
      prisma.branches.findFirst({ where: { active: true, id: values.branchId } }),
      poBuyIds.length ? prisma.po_buys.findMany({ where: { id: { in: poBuyIds } } }) : Promise.resolve([]),
      prisma.products.findMany({ where: { active: true, id: { in: productIds } } }),
    ])

    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    const supplierSalesId = supplier.sales_id ?? null

    const effectiveBranch = branch
    const effectiveBranchCode = branchBillCode(effectiveBranch?.code)
    if (!effectiveBranch || !effectiveBranchCode) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกสาขาที่มีรหัสสาขา 01 หรือ 02 ก่อนบันทึกบิล' }, { status: 400 })

    const poBuyById = new Map(poBuys.map((po) => [po.id, po]))
    const missingPoBuy = poBuyIds.find((poBuyId) => !poBuyById.has(poBuyId))
    if (missingPoBuy) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy ที่เลือกไม่ถูกต้อง' }, { status: 400 })

    const productById = new Map(products.map((product) => [product.id, product]))
    const missingProduct = values.items.find((item) => !productById.has(item.productId))
    if (missingProduct) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    let receiptSummarySourceMap = new Map<string, { deduct_weight: Prisma.Decimal | null; gross_weight: Prisma.Decimal | null; net_weight: Prisma.Decimal | null; weight_ticket_id: string }>()
    if (values.transactionMode === 'STOCK') {
      const receiptValidation = await validateStockReceiptSelection(values, poBuyById)
      if ('error' in receiptValidation) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: receiptValidation.error }, { status: 400 })
      }
      receiptSummarySourceMap = new Map(receiptValidation.ticket.weight_ticket_product_summaries.map((summary) => [
        summary.id,
        {
          deduct_weight: summary.deduct_weight,
          gross_weight: summary.gross_weight,
          net_weight: summary.net_weight,
          weight_ticket_id: summary.weight_ticket_id,
        },
      ]))
    }

    const items = buildBillItems(values, productById, poBuyById)
    const purchaseSource = derivePurchaseSource(items, values.purchaseSource)
    const branchWarehouses = values.transactionMode === 'STOCK'
      ? await prisma.warehouses.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { code: true, id: true, name: true, type: true },
        where: { active: true, branch_id: effectiveBranch.id },
      })
      : []
    const warehouseByStatus = new Map(STOCK_STATUS_VALUES.map((status) => [status, pickPurchaseStockWarehouse(branchWarehouses, status)]))
    const missingWarehouseStatus = values.transactionMode === 'STOCK' ? items.find((item) => !warehouseByStatus.get(item.itemStatus))?.itemStatus : null
    if (missingWarehouseStatus) return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบคลัง ${missingWarehouseStatus} ที่เปิดใช้งานสำหรับสาขานี้` }, { status: 400 })
    const purchaseWarehouseId = values.transactionMode === 'STOCK' ? warehouseByStatus.get(items[0]?.itemStatus ?? 'RM')?.id ?? null : null

    let bill: { doc_no: string; id: string } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        bill = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('purchase_bills.doc_no'))`
          const id = `PB-${randomUUID()}`
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
              id,
              license_plate: null,
              note: values.note ?? values.notes,
              notes: values.notes,
              paid_amount: 0,
              payable_balance: totals.totalAmount,
              po_buy_id: values.poBuyId,
              purchase_source: purchaseSource,
              ref_no: values.refNo,
              sales_id: supplierSalesId,
              status: 'unpaid',
              subtotal: totals.subtotal,
              supplier_id: values.supplierId,
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

          const itemRows = billItemCreateRows(createdBill.id, items)
          await tx.purchase_bill_items.createMany({ data: itemRows })
          const receiptAllocationRows = buildPurchaseBillReceiptAllocationRows(createdBill.id, itemRows, receiptSummarySourceMap, actor)
          if (receiptAllocationRows.length > 0) {
            await tx.purchase_bill_receipt_allocations.createMany({ data: receiptAllocationRows })
          }
          const poAllocationRows = buildPurchaseBillPoAllocationRows(createdBill.id, itemRows, actor)
          if (poAllocationRows.length > 0) {
            await tx.purchase_bill_po_allocations.createMany({ data: poAllocationRows })
          }

          if (values.transactionMode === 'STOCK') {
            await tx.stock_ledger.createMany({
              data: items.map((item) => ({
                branch_id: effectiveBranch.id,
                created_by: actor,
                date: normalizeDate(billDate),
                id: `SL-PB-${randomUUID()}`,
                lot_no: item.lotNo,
                movement_type: 'รับซื้อเข้า',
                note: item.note,
                notes: values.note ?? values.notes,
                output_category: item.itemStatus,
                product_id: item.productId,
                qty_in: item.qty,
                qty_out: 0,
                ref_id: createdBill.id,
                ref_no: createdBill.doc_no,
                ref_type: 'PB',
                unit_cost: item.price,
                value_in: item.amount,
                value_out: 0,
                warehouse_id: warehouseByStatus.get(item.itemStatus)?.id ?? purchaseWarehouseId,
              })),
            })
            await refreshWeightTicketStatuses(tx, extractReferencedReceiptTicketIdsFromValues(values))
          }

          return createdBill
        })
        break
      } catch (caught) {
        if (!isDocNoConflict(caught) || attempt === 2) throw caught
      }
    }

    if (!bill) throw new Error('สร้างเลขที่บิลไม่สำเร็จ')

    return NextResponse.json({ docNo: bill.doc_no, id: bill.id })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกบิลรับซื้อไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const raw = await request.json()
    const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
    if (!id) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบบิลที่ต้องการแก้ไข' }, { status: 400 })
    if (raw?.action === 'cancel') {
      const values = purchaseBillCancelSchema.parse(raw)
      const actor = currentActor(context)
      const [existingBill, payments, existingBillItems] = await Promise.all([
        prisma.purchase_bills.findUnique({ where: { id: values.id } }),
        prisma.payments.findMany({
          select: { amount: true, discount: true, status: true, withholding_tax: true },
          where: { bill_id: values.id, NOT: { status: 'cancelled' } },
        }),
        prisma.purchase_bill_items.findMany({
          select: { source_snapshot: true },
          where: { purchase_bill_id: values.id },
        }),
      ])

      if (!existingBill) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อ' }, { status: 404 })
      if (String(existingBill.status ?? '').toLowerCase().includes('cancel')) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'บิลนี้ถูกยกเลิกแล้ว' }, { status: 400 })
      }
      const paidAmount = payments.reduce((sum, payment) => sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount), 0)
      if (paidAmount > 0) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยกเลิกไม่ได้ เพราะบิลนี้มีการชำระเงินแล้ว' }, { status: 400 })

      const cancelledAt = new Date()
      const cancelledBill = await prisma.$transaction(async (tx) => {
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
          where: { id: values.id },
        })
        await tx.stock_ledger.deleteMany({ where: { ref_id: values.id, ref_type: 'PB' } })
        await tx.purchase_bill_receipt_allocations.deleteMany({ where: { purchase_bill_id: values.id } })
        await tx.purchase_bill_po_allocations.deleteMany({ where: { purchase_bill_id: values.id } })
        await refreshWeightTicketStatuses(tx, extractReferencedReceiptTicketIdsFromBillItems(existingBillItems))
        return bill
      })

      return NextResponse.json({ docNo: cancelledBill.doc_no, id: cancelledBill.id, status: 'cancelled' })
    }

    const values = purchaseBillFormSchema.parse(raw)
    const actor = currentActor(context)

    const productIds = [...new Set(values.items.map((item) => item.productId))]
    const poBuyIds = [...new Set([values.poBuyId, ...values.items.map((item) => item.poBuyId)].filter(Boolean) as string[])]
    const [existingBill, supplier, branch, poBuys, products, payments, existingBillItems] = await Promise.all([
      prisma.purchase_bills.findUnique({ where: { id } }),
      prisma.suppliers.findFirst({ select: { id: true, sales_id: true }, where: { active: true, id: values.supplierId } }),
      prisma.branches.findFirst({ where: { active: true, id: values.branchId } }),
      poBuyIds.length ? prisma.po_buys.findMany({ where: { id: { in: poBuyIds } } }) : Promise.resolve([]),
      prisma.products.findMany({ where: { active: true, id: { in: productIds } } }),
      prisma.payments.findMany({
        select: { amount: true, discount: true, status: true, withholding_tax: true },
        where: { bill_id: id, NOT: { status: 'cancelled' } },
      }),
      prisma.purchase_bill_items.findMany({
        select: { source_snapshot: true },
        where: { purchase_bill_id: id },
      }),
    ])

    if (!existingBill) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลรับซื้อ' }, { status: 404 })
    if (String(existingBill.status ?? '').toLowerCase().includes('cancel')) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขไม่ได้ เพราะบิลนี้ถูกยกเลิกแล้ว' }, { status: 400 })
    }
    const billDate = existingBill.date ? toDateOnly(existingBill.date) : bangkokDateInput(new Date())
    const vatRatePercent = toNumber(existingBill.vat_rate_percent) ?? (await activeVatRatePercent(normalizeDate(billDate)))
    const totals = calculateTotals(values, vatRatePercent)
    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    const supplierSalesId = supplier.sales_id ?? null

    const effectiveBranch = branch
    if (!effectiveBranch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เลือกสาขาก่อนบันทึกบิล' }, { status: 400 })

    const poBuyById = new Map(poBuys.map((po) => [po.id, po]))
    const missingPoBuy = poBuyIds.find((poBuyId) => !poBuyById.has(poBuyId))
    if (missingPoBuy) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy ที่เลือกไม่ถูกต้อง' }, { status: 400 })

    const productById = new Map(products.map((product) => [product.id, product]))
    const missingProduct = values.items.find((item) => !productById.has(item.productId))
    if (missingProduct) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    let receiptSummarySourceMap = new Map<string, { deduct_weight: Prisma.Decimal | null; gross_weight: Prisma.Decimal | null; net_weight: Prisma.Decimal | null; weight_ticket_id: string }>()
    if (values.transactionMode === 'STOCK') {
      const receiptValidation = await validateStockReceiptSelection(values, poBuyById, id)
      if ('error' in receiptValidation) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: receiptValidation.error }, { status: 400 })
      }
      receiptSummarySourceMap = new Map(receiptValidation.ticket.weight_ticket_product_summaries.map((summary) => [
        summary.id,
        {
          deduct_weight: summary.deduct_weight,
          gross_weight: summary.gross_weight,
          net_weight: summary.net_weight,
          weight_ticket_id: summary.weight_ticket_id,
        },
      ]))
    }

    const items = buildBillItems(values, productById, poBuyById)
    const purchaseSource = derivePurchaseSource(items, values.purchaseSource)
    const branchWarehouses = values.transactionMode === 'STOCK'
      ? await prisma.warehouses.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { code: true, id: true, name: true, type: true },
        where: { active: true, branch_id: effectiveBranch.id },
      })
      : []
    const warehouseByStatus = new Map(STOCK_STATUS_VALUES.map((status) => [status, pickPurchaseStockWarehouse(branchWarehouses, status)]))
    const missingWarehouseStatus = values.transactionMode === 'STOCK' ? items.find((item) => !warehouseByStatus.get(item.itemStatus))?.itemStatus : null
    if (missingWarehouseStatus) return NextResponse.json({ code: 'BAD_REQUEST', error: `ไม่พบคลัง ${missingWarehouseStatus} ที่เปิดใช้งานสำหรับสาขานี้` }, { status: 400 })
    const purchaseWarehouseId = values.transactionMode === 'STOCK' ? warehouseByStatus.get(items[0]?.itemStatus ?? 'RM')?.id ?? null : null

    const paidAmount = payments.reduce((sum, payment) => sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount), 0)
    const payableBalance = Math.max(0, totals.totalAmount - paidAmount)
    const status = paidAmount <= 0 ? 'unpaid' : payableBalance <= 0.01 ? 'paid' : 'partial'

    const updatedBill = await prisma.$transaction(async (tx) => {
      const bill = await tx.purchase_bills.update({
        data: {
          branch_id: effectiveBranch.id,
          discount: values.discountTotal,
          discount_total: values.discountTotal,
          has_vat: values.hasVat,
          license_plate: null,
          note: values.note ?? values.notes,
          notes: values.notes,
          paid_amount: paidAmount,
          payable_balance: payableBalance,
          po_buy_id: values.poBuyId,
          purchase_source: purchaseSource,
          ref_no: values.refNo,
          sales_id: supplierSalesId,
          status,
          subtotal: totals.subtotal,
          supplier_id: values.supplierId,
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
        where: { id },
      })

      await tx.purchase_bill_receipt_allocations.deleteMany({ where: { purchase_bill_id: id } })
      await tx.purchase_bill_po_allocations.deleteMany({ where: { purchase_bill_id: id } })
      await tx.purchase_bill_items.deleteMany({ where: { purchase_bill_id: id } })
      const itemRows = billItemCreateRows(id, items)
      await tx.purchase_bill_items.createMany({ data: itemRows })
      const receiptAllocationRows = buildPurchaseBillReceiptAllocationRows(id, itemRows, receiptSummarySourceMap, actor)
      if (receiptAllocationRows.length > 0) {
        await tx.purchase_bill_receipt_allocations.createMany({ data: receiptAllocationRows })
      }
      const poAllocationRows = buildPurchaseBillPoAllocationRows(id, itemRows, actor)
      if (poAllocationRows.length > 0) {
        await tx.purchase_bill_po_allocations.createMany({ data: poAllocationRows })
      }

      await tx.stock_ledger.deleteMany({ where: { ref_id: id, ref_type: 'PB' } })
      if (values.transactionMode === 'STOCK') {
        await tx.stock_ledger.createMany({
          data: items.map((item) => ({
            branch_id: effectiveBranch.id,
            created_by: actor,
            date: normalizeDate(billDate),
            id: `SL-PB-${randomUUID()}`,
            lot_no: item.lotNo,
            movement_type: 'รับซื้อเข้า',
            note: item.note,
            notes: values.note ?? values.notes,
            output_category: item.itemStatus,
            product_id: item.productId,
            qty_in: item.qty,
            qty_out: 0,
            ref_id: id,
            ref_no: existingBill.doc_no,
            ref_type: 'PB',
            unit_cost: item.price,
            value_in: item.amount,
            value_out: 0,
            warehouse_id: warehouseByStatus.get(item.itemStatus)?.id ?? purchaseWarehouseId,
          })),
        })
      }

      await refreshWeightTicketStatuses(tx, [
        ...extractReferencedReceiptTicketIdsFromValues(values),
        ...extractReferencedReceiptTicketIdsFromBillItems(existingBillItems),
      ])

      return bill
    })

    return NextResponse.json({ docNo: updatedBill.doc_no, id: updatedBill.id, paidAmount, payableBalance, status })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขบิลรับซื้อไม่ได้', 400)
  }
}
