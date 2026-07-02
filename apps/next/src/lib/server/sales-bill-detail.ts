import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { salesBillLineFactsForBills } from '@/lib/server/sales-bill-line-facts'
import type { Prisma } from '../../../generated/prisma/client'

export type SalesBillDetail = {
  billDate: string
  branchId: string
  branchName: string
  channelName: string
  createdBy: string
  customerAddress: string
  customerAdvanceDocNo: string
  customerCode: string
  customerName: string
  customerTaxId: string
  date: string
  deliveryDocNos: string[]
  discount: number
  docNo: string
  dueDate: string
  exportOrderNo: string
  hasVat: boolean
  items: Array<{
    amount: number
    deliveryLineId: string
    deliverySummaryId: string
    deliveryTicketDocNo: string
    deliveryVehicleNo: string
    deductWeight: number
    discount: number
    grossWeight: number
    lineNo: number
    matchedCogs: number
    netWeight: number
    note: string
    poSellDocNo: string
    price: number
    productCode: string
    productId: string
    productName: string
    qty: number
    sourceDeductWeight: number
    sourceGrossWeight: number
    sourceLineCount: number
    sourceNetWeight: number
    sourceProductCode: string
    sourceProductName: string
    sourceLabel: string
    sourceType: string
    tradingSourceDocNo: string
    tradingSourceLineNo: number | null
    unitCostSnapshot: number | null
    unit: string
  }>
  note: string
  paidAmount: number
  receivableBalance: number
  readModelWarning: string
  receivedAmount: number
  salesName: string
  status: string
  statusLabel: string
  sourceUsageFacts: Array<{
    amount: number
    createdAt: string
    docNo: string
    id: string
    lineNo: number | null
    productName: string
    qty: number
    status: string
    title: string
    type: string
    unit: string
  }>
  stockReturnOptions: Array<{
    pendingOutKey: string
    pendingQty: number
    productCode: string
    productName: string
    sourceLineNo: number | null
    warehouseName: string
    weightTicketDocNo: string
  }>
  subtotal: number
  timeline: Array<{
    action: string
    actor: string
    createdAt: string
    details: string[]
    id: string
    status: string
    statusLabel: string
    title: string
    tone: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate'
    transitionText: string
  }>
  totalAmount: number
  transactionMode: string
  vatAmount: number
  vatInvoiceDate: string
  vatInvoiceIssued: boolean
  vatInvoiceNo: string
  vatType: string
  warehouseName: string
}

type SalesBillDetailRow = Prisma.sales_billsGetPayload<{
  include: {
    branches: true
    customers: true
    sales_channels: true
    warehouses: true
  }
}>

type SalesBillLineFact = Prisma.sales_bill_linesGetPayload<{
  include: {
    sales_bill_po_sell_allocations: {
      include: {
        po_sells: {
          select: {
            doc_no: true
          }
        }
      }
    }
    sales_bill_source_allocations: true
  }
}>

function salesBillStatusLabel(status: string | null | undefined) {
  switch (String(status ?? '').toLowerCase()) {
    case 'unreceived':
      return 'ยังไม่รับเงิน'
    case 'partial':
      return 'รับเงินบางส่วน'
    case 'received':
    case 'paid':
      return 'รับเงินครบแล้ว'
    case 'cancelled':
    case 'canceled':
      return 'ยกเลิก'
    default:
      return status ?? '-'
  }
}

function salesBillHistoryActionLabel(action: string | null | undefined) {
  switch (String(action ?? '').toLowerCase()) {
    case 'created':
      return 'สร้างบิลขาย'
    case 'customer_receipt_allocated':
      return 'รับเงิน'
    case 'customer_receipt_cancelled':
      return 'ยกเลิกรับเงิน'
    case 'allocation_corrected':
      return 'แก้ Trading allocation'
    case 'cancelled':
      return 'ยกเลิกบิล'
    case 'status_synced':
      return 'ปรับสถานะ'
    default:
      return 'อัปเดตสถานะบิล'
  }
}

function salesBillHistoryTone(action: string | null | undefined): SalesBillDetail['timeline'][number]['tone'] {
  switch (String(action ?? '').toLowerCase()) {
    case 'created':
      return 'blue'
    case 'customer_receipt_allocated':
      return 'emerald'
    case 'allocation_corrected':
    case 'status_synced':
      return 'amber'
    case 'customer_receipt_cancelled':
    case 'cancelled':
      return 'rose'
    default:
      return 'slate'
  }
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function historyMetaValue(meta: unknown, key: string) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  return (meta as Record<string, unknown>)[key]
}

function sourceUsageStatusLabel(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'active') return 'active'
  if (normalized === 'cancelled') return 'cancelled'
  if (normalized === 'reversed') return 'reversed'
  return status || '-'
}

function customerAddress(customer: SalesBillDetailRow['customers']) {
  if (!customer) return ''
  const structured = [
    customer.address_no,
    customer.address_moo ? `หมู่ ${customer.address_moo}` : null,
    customer.address_village,
    customer.address_road,
    customer.address_subdistrict ? `ต.${customer.address_subdistrict}` : null,
    customer.address_district ? `อ.${customer.address_district}` : null,
    customer.address_province ? `จ.${customer.address_province}` : null,
    customer.address_postal_code,
  ].filter(Boolean).join(' ')
  return customer.address || customer.address_line1 || structured
}

function jsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function jsonString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function tradingSourceInfo(
  transactionMode: string | null,
  lineNo: number,
  tradingFactByLineNo: Map<number, Prisma.trading_allocation_factsGetPayload<{
    include: {
      purchase_bills: { select: { doc_no: true } }
      trading_cost_sources: { select: { source_no: true; source_type: true } }
    }
  }>>,
) {
  const tradingFact = transactionMode === 'TRADING' ? tradingFactByLineNo.get(lineNo) ?? null : null
  const sourceDocNo = tradingFact?.source_doc_no ?? tradingFact?.trading_cost_sources?.source_no ?? tradingFact?.purchase_bills?.doc_no ?? ''
  const sourceLineNo = tradingFact?.source_line_no ?? null
  const rawSourceType = String(tradingFact?.source_type ?? '').toUpperCase()
  const sourcePrefix = rawSourceType === 'TRADING_COST_SOURCE'
    ? 'Cost Source'
    : rawSourceType === 'TRADING_PURCHASE_BILL'
      ? 'Trading PB'
      : 'Cost'
  const label = transactionMode === 'TRADING'
    ? tradingFact
      ? `${sourcePrefix} ${sourceDocNo}${sourceLineNo ? `:${sourceLineNo}` : ''}`
      : 'รอ Trading allocation'
    : ''
  const sourceType = transactionMode === 'TRADING'
    ? tradingFact
      ? rawSourceType === 'TRADING_COST_SOURCE'
        ? 'Trading Cost Source Allocation'
        : rawSourceType === 'TRADING_PURCHASE_BILL'
          ? 'Trading PB Allocation'
          : 'Trading Allocation'
      : 'Pending Trading Allocation'
    : ''
  return {
    label,
    matchedCogs: toNumber(tradingFact?.matched_cogs),
    sourceDocNo,
    sourceLineNo,
    sourceType,
  }
}

function buildDurableItems(input: {
  bill: SalesBillDetailRow
  lineFacts: SalesBillLineFact[]
  poSellDocNoSet: Set<string>
  stockUnitCostByLineNo: Map<number, number | null>
  deliverySummaryById: Map<string, {
    deductWeight: number
    grossWeight: number
    lineCount: number
    netWeight: number
    productCode: string
    productName: string
  }>
  tradingFactByLineNo: Map<number, Prisma.trading_allocation_factsGetPayload<{
    include: {
      purchase_bills: { select: { doc_no: true } }
      trading_cost_sources: { select: { source_no: true; source_type: true } }
    }
  }>>
  vehicleByDeliveryDocNo: Map<string, string>
}): SalesBillDetail['items'] {
  return input.lineFacts.map((line) => {
    const sourceAllocations = line.sales_bill_source_allocations
    const poAllocations = line.sales_bill_po_sell_allocations
    const firstSourceAllocation = sourceAllocations[0] ?? null
    const wtoSource = sourceAllocations.find((allocation) => allocation.source_type === 'WTO') ?? null
    const poSellDocNo = poAllocations
      .filter((allocation) => allocation.allocation_type === 'PO_SELL')
      .map((allocation) => allocation.po_sell_doc_no ?? allocation.po_sells?.doc_no ?? '')
      .find((value) => input.poSellDocNoSet.has(value)) ?? ''
    const poSourceLabels = poAllocations.map((allocation) => {
      if (allocation.allocation_type === 'PO_SELL') return `PO Sell ${allocation.po_sell_doc_no ?? allocation.po_sells?.doc_no ?? '-'}`
      return 'Spot Sale'
    })
    const salesSourceLabels = Array.from(new Set(poSourceLabels.length ? poSourceLabels : ['Spot Sale']))
    const stockSourceLabel = firstSourceAllocation && firstSourceAllocation.source_type !== 'WTO'
      ? `${firstSourceAllocation.source_type} ${firstSourceAllocation.source_doc_no}`
      : ''
    const tradingSource = tradingSourceInfo(input.bill.transaction_mode, line.line_no, input.tradingFactByLineNo)
    const sourceParts = input.bill.transaction_mode === 'TRADING'
      ? [tradingSource.label, ...salesSourceLabels]
      : [stockSourceLabel, ...salesSourceLabels]
    const deliveryTicketDocNo = wtoSource?.source_doc_no ?? ''
    const wtoMeta = jsonObject(wtoSource?.meta)
    const deliveryLineId = jsonString(wtoMeta.deliveryLineId)
    const deliverySummaryId = jsonString(wtoMeta.deliverySummaryId)
    const sourceSummaryKey = wtoSource?.weight_ticket_product_summary_id != null
      ? String(wtoSource.weight_ticket_product_summary_id)
      : ''
    const sourceSummary = sourceSummaryKey ? input.deliverySummaryById.get(sourceSummaryKey) ?? null : null
    const sourceType = input.bill.transaction_mode === 'TRADING'
      ? tradingSource.sourceType
      : Array.from(new Set([
        ...sourceAllocations.map((allocation) => {
          if (allocation.source_type === 'WTO') return allocation.movement_owner === 'SALES_BILL' ? 'WTO stock-out source' : 'WTO source'
          return allocation.source_type
        }),
        ...poAllocations.map((allocation) => allocation.allocation_type === 'PO_SELL' ? 'PO Sell' : 'Spot Sale'),
      ])).join(' / ')
    const sourceProductCode = sourceSummary?.productCode || wtoSource?.product_code_snapshot || line.product_code_snapshot
    const sourceProductName = sourceSummary?.productName || wtoSource?.product_name_snapshot || line.product_name_snapshot || '-'
    const soldWeight = input.bill.transaction_mode === 'STOCK'
      ? toNumber(line.gross_weight) || toNumber(line.net_weight) || toNumber(line.qty)
      : toNumber(line.net_weight) || toNumber(line.qty)

    return {
      amount: toNumber(line.line_amount),
      deliveryLineId,
      deliverySummaryId,
      deliveryTicketDocNo,
      deliveryVehicleNo: input.vehicleByDeliveryDocNo.get(deliveryTicketDocNo) ?? '',
      deductWeight: toNumber(line.deduct_weight),
      discount: toNumber(line.discount_amount),
      grossWeight: input.bill.transaction_mode === 'STOCK' ? soldWeight : toNumber(line.gross_weight),
      lineNo: line.line_no,
      matchedCogs: tradingSource.matchedCogs,
      netWeight: soldWeight,
      note: line.notes ?? '',
      poSellDocNo,
      price: toNumber(line.unit_price),
      productCode: line.product_code_snapshot,
      productId: line.product_code_snapshot,
      productName: line.product_name_snapshot || '-',
      qty: toNumber(line.qty),
      sourceDeductWeight: sourceSummary?.deductWeight ?? toNumber(line.deduct_weight),
      sourceGrossWeight: sourceSummary?.grossWeight ?? toNumber(line.gross_weight),
      sourceLineCount: sourceSummary?.lineCount ?? 1,
      sourceNetWeight: sourceSummary?.netWeight ?? (toNumber(line.net_weight) || toNumber(line.qty)),
      sourceProductCode,
      sourceProductName,
      sourceLabel: sourceParts.filter(Boolean).join(' / '),
      sourceType,
      tradingSourceDocNo: tradingSource.sourceDocNo,
      tradingSourceLineNo: tradingSource.sourceLineNo,
      unitCostSnapshot: input.stockUnitCostByLineNo.get(line.line_no) ?? null,
      unit: line.unit_snapshot || 'กก.',
    }
  })
}

export async function getSalesBillDetail(
  docNo: string,
  options: { allowedBranchCodes?: string[] | null } = {},
): Promise<SalesBillDetail | null> {
  if (options.allowedBranchCodes?.length === 0) return null
  const bill: SalesBillDetailRow | null = await prisma.sales_bills.findFirst({
    include: {
      branches: true,
      customers: true,
      sales_channels: true,
      warehouses: true,
    },
    where: {
      ...(options.allowedBranchCodes ? { branches: { is: { code: { in: options.allowedBranchCodes } } } } : {}),
      doc_no: docNo,
    },
  })

  if (!bill) return null

  const factStatuses = ['active', 'cancelled']
  const [lineFacts, salesperson, customerAdvanceAllocations, tradingAllocationFacts, statusLogs, weightTicketUsageLogs, poSellAllocationLogs] = await Promise.all([
    prisma.sales_bill_lines.findMany({
      include: {
        sales_bill_po_sell_allocations: {
          include: {
            po_sells: { select: { doc_no: true } },
          },
          orderBy: [{ sales_line_no: 'asc' }, { id: 'asc' }],
          where: { status: { in: factStatuses } },
        },
        sales_bill_source_allocations: {
          orderBy: [{ sales_line_no: 'asc' }, { id: 'asc' }],
          where: { status: { in: factStatuses } },
        },
      },
      orderBy: [{ line_no: 'asc' }, { id: 'asc' }],
      where: {
        sales_bill_id: bill.id,
        status: { in: factStatuses },
      },
    }),
    bill.sales_id
      ? prisma.salespersons.findUnique({
          select: {
            name: true,
          },
          where: {
            id: bill.sales_id,
          },
        })
      : Promise.resolve(null),
    prisma.sales_bill_customer_advance_allocations.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        allocated_amount: true,
        created_at: true,
        customer_advance_doc_no: true,
        id: true,
        status: true,
      },
      where: {
        sales_bill_id: bill.id,
        status: { in: factStatuses },
      },
    }),
    bill.transaction_mode === 'TRADING'
      ? prisma.trading_allocation_facts.findMany({
          include: {
            purchase_bills: { select: { doc_no: true } },
            trading_cost_sources: { select: { source_no: true, source_type: true } },
          },
          orderBy: [{ sales_line_no: 'asc' }, { id: 'asc' }],
          where: {
            sales_bill_id: bill.id,
            status: { in: factStatuses },
          },
        })
      : Promise.resolve([]),
    prisma.sales_bill_status_logs.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: {
        sales_bill_id: bill.id,
      },
    }),
    prisma.weight_ticket_usage_logs.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: {
        target_doc_no: bill.doc_no,
        target_type: 'SALES_BILL',
      },
    }),
    prisma.po_sell_allocation_logs.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      where: {
        sales_bill_id: bill.id,
      },
    }),
  ])

  if (lineFacts.length === 0) {
    throw new Error(`บิลขาย ${bill.doc_no} ยังไม่มี durable line facts จึงเปิดหน้ารายละเอียดไม่ได้`)
  }

  const deliveryDocNos = Array.from(new Set(lineFacts.flatMap((line) => line.sales_bill_source_allocations
    .filter((allocation) => allocation.source_type === 'WTO')
    .map((allocation) => allocation.source_doc_no)).filter(Boolean)))
  const poSellDocNos = Array.from(new Set(lineFacts.flatMap((line) => line.sales_bill_po_sell_allocations
    .map((allocation) => allocation.po_sell_doc_no ?? allocation.po_sells?.doc_no ?? '')).filter(Boolean)))

  const [deliveryTickets, poSells] = await Promise.all([
    deliveryDocNos.length
      ? prisma.weight_tickets.findMany({
          select: {
            doc_no: true,
            vehicle_no: true,
            weight_ticket_product_summaries: {
              select: {
                deduct_weight: true,
                gross_weight: true,
                id: true,
                line_count: true,
                net_weight: true,
                product_name: true,
                products: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
          where: {
            doc_no: { in: deliveryDocNos },
          },
        })
      : Promise.resolve([]),
    poSellDocNos.length
      ? prisma.po_sells.findMany({
          select: {
            doc_no: true,
          },
          where: {
            doc_no: { in: poSellDocNos },
          },
        })
      : Promise.resolve([]),
  ])

  const allocatedWtoDocNos = Array.from(new Set(weightTicketUsageLogs
    .filter((log) => log.action === 'allocated_to_sales_bill')
    .map((log) => log.weight_ticket_doc_no)
    .filter(Boolean)))
  const activeReturnPendingOuts = allocatedWtoDocNos.length
    ? await prisma.stock_holds.findMany({
        include: {
          products: { select: { code: true, name: true } },
          warehouses: { select: { name: true } },
        },
        orderBy: [{ source_doc_no: 'asc' }, { source_line_no: 'asc' }, { id: 'asc' }],
        where: {
          source_doc_no: { in: allocatedWtoDocNos },
          source_type: 'WTO',
          status: 'active',
        },
      })
    : []

  const vehicleByDeliveryDocNo = new Map(deliveryTickets.map((ticket) => [ticket.doc_no, ticket.vehicle_no ?? '']))
  const deliverySummaryById = new Map<string, {
    deductWeight: number
    grossWeight: number
    lineCount: number
    netWeight: number
    productCode: string
    productName: string
  }>()
  deliveryTickets.forEach((ticket) => {
    ticket.weight_ticket_product_summaries.forEach((summary) => {
      const productCode = summary.products?.code?.trim() ?? ''
      if (!productCode) return
      deliverySummaryById.set(String(summary.id), {
        deductWeight: toNumber(summary.deduct_weight),
        grossWeight: toNumber(summary.gross_weight),
        lineCount: summary.line_count ?? 0,
        netWeight: toNumber(summary.net_weight),
        productCode,
        productName: summary.product_name ?? '-',
      })
    })
  })
  const poSellDocNoSet = new Set(poSells.map((poSell) => poSell.doc_no))
  const tradingFactByLineNo = new Map<number, (typeof tradingAllocationFacts)[number]>()
  tradingAllocationFacts.forEach((fact) => {
    if (fact.sales_line_no == null) return
    tradingFactByLineNo.set(fact.sales_line_no, fact)
  })
  const stockLineFacts = await salesBillLineFactsForBills([bill.id], {
    lineStatuses: factStatuses,
    tradingStatuses: factStatuses,
  })
  const stockCogsByLineNo = new Map(stockLineFacts.map((line) => [line.lineNo, line.cogs] as const))
  const stockUnitCostByLineNo = new Map(stockLineFacts.map((line) => {
    const qty = toNumber(line.qty) || toNumber(line.netWeight)
    return [line.lineNo, qty > 0 && line.cogs > 0 ? line.cogs / qty : null] as const
  }))
  const items = buildDurableItems({
    bill,
    deliverySummaryById,
    lineFacts,
    poSellDocNoSet,
    stockUnitCostByLineNo,
    tradingFactByLineNo,
    vehicleByDeliveryDocNo,
  })
  const allocatedUsageQtyByLineNo = new Map<number, number>()
  weightTicketUsageLogs.forEach((log) => {
    if (log.action !== 'allocated_to_sales_bill' || log.target_line_no == null) return
    const qty = toNumber(log.allocated_net_weight) || toNumber(log.allocated_qty)
    allocatedUsageQtyByLineNo.set(log.target_line_no, (allocatedUsageQtyByLineNo.get(log.target_line_no) ?? 0) + qty)
  })
  const stockCogsByUsageLogId = new Map<bigint, number>()
  weightTicketUsageLogs.forEach((log) => {
    if (log.target_line_no == null) return
    const lineCogs = stockCogsByLineNo.get(log.target_line_no) ?? 0
    if (lineCogs <= 0) return
    const lineUsageQty = allocatedUsageQtyByLineNo.get(log.target_line_no) ?? 0
    const usageQty = toNumber(log.allocated_net_weight) || toNumber(log.allocated_qty)
    if (lineUsageQty <= 0 || usageQty <= 0) return
    stockCogsByUsageLogId.set(log.id, lineCogs * (usageQty / lineUsageQty))
  })
  const timeline = statusLogs.map((log) => {
    const customerReceiptDocNo = historyMetaValue(log.meta, 'customerReceiptDocNo')
    const allocationLineNo = historyMetaValue(log.meta, 'allocationLineNo')
    const reason = historyMetaValue(log.meta, 'reason')
    const transitionText = log.from_status && log.from_status !== log.to_status
      ? `${salesBillStatusLabel(log.from_status)} -> ${salesBillStatusLabel(log.to_status)}`
      : salesBillStatusLabel(log.to_status)
    const details = [
      `สถานะ ${transitionText}`,
      `ยอดบิล ${money(toNumber(log.total_amount_snapshot))}`,
      `รับแล้ว ${money(toNumber(log.received_amount_snapshot))}`,
      `ค้างรับ ${money(toNumber(log.receivable_balance_snapshot))}`,
      `ผู้ทำ ${log.created_by ?? '-'}`,
    ]
    if (typeof customerReceiptDocNo === 'string' && customerReceiptDocNo) details.push(`ใบรับเงิน ${customerReceiptDocNo}`)
    if (typeof allocationLineNo === 'number') details.push(`Receipt allocation line ${allocationLineNo}`)
    if (typeof reason === 'string' && reason) details.push(`เหตุผล ${reason}`)
    if (log.note) details.push(`หมายเหตุ ${log.note}`)
    return {
      action: log.action,
      actor: log.created_by ?? '-',
      createdAt: log.created_at.toISOString(),
      details,
      id: log.event_key ?? `sales-bill-status:${String(log.id)}`,
      status: log.to_status ?? '',
      statusLabel: salesBillStatusLabel(log.to_status),
      title: salesBillHistoryActionLabel(log.action),
      tone: salesBillHistoryTone(log.action),
      transitionText,
    }
  }).reverse()
  const sourceUsageFacts: SalesBillDetail['sourceUsageFacts'] = [
    ...weightTicketUsageLogs.map((log) => ({
      amount: stockCogsByUsageLogId.get(log.id) ?? 0,
      createdAt: log.created_at.toISOString(),
      docNo: log.weight_ticket_doc_no,
      id: log.event_key ?? `wto-usage:${String(log.id)}`,
      lineNo: log.target_line_no,
      productName: log.product_name_snapshot ?? '-',
      qty: toNumber(log.allocated_net_weight) || toNumber(log.allocated_qty),
      status: log.action === 'released_from_sales_bill'
        ? 'cancelled'
        : log.action === 'loss_from_sales_bill'
          ? 'loss'
          : log.action === 'returned_from_sales_bill'
            ? 'returned'
            : 'active',
      title: log.action === 'released_from_sales_bill'
        ? 'คืน WTO จากบิลขาย'
        : log.action === 'loss_from_sales_bill'
          ? 'ตัดของขาดจากรับคืน WTO'
          : log.action === 'returned_from_sales_bill'
            ? 'รับของคืนจาก WTO'
            : 'ใช้ WTO ในบิลขาย',
      type: 'WTO usage log',
      unit: 'กก.',
    })),
    ...poSellAllocationLogs.map((log) => ({
      amount: toNumber(log.allocated_amount),
      createdAt: log.created_at.toISOString(),
      docNo: log.po_sell_doc_no,
      id: log.event_key ?? `po-sell-log:${String(log.id)}`,
      lineNo: log.sales_bill_line_no,
      productName: log.product_name_snapshot ?? '-',
      qty: toNumber(log.allocated_qty),
      status: log.action === 'released_from_sales_bill' ? 'cancelled' : 'active',
      title: log.action === 'released_from_sales_bill' ? 'คืน PO Sell จากบิลขาย' : 'ตัด PO Sell',
      type: 'PO Sell usage log',
      unit: 'กก.',
    })),
    ...(!poSellAllocationLogs.length ? lineFacts.flatMap((line) => line.sales_bill_po_sell_allocations.map((allocation) => ({
      amount: toNumber(allocation.allocated_amount),
      createdAt: allocation.created_at.toISOString(),
      docNo: allocation.po_sell_doc_no ?? allocation.po_sells?.doc_no ?? 'Spot Sale',
      id: `po-allocation:${String(allocation.id)}`,
      lineNo: allocation.sales_line_no,
      productName: allocation.product_name_snapshot,
      qty: toNumber(allocation.allocated_qty),
      status: sourceUsageStatusLabel(allocation.status),
      title: allocation.allocation_type === 'PO_SELL' ? 'ตัด PO Sell' : 'Spot Sale',
      type: 'Sales allocation fact',
      unit: line.unit_snapshot || 'กก.',
    }))) : []),
    ...tradingAllocationFacts.map((fact) => ({
      amount: toNumber(fact.matched_cogs),
      createdAt: fact.created_at.toISOString(),
      docNo: fact.source_doc_no ?? fact.trading_cost_sources?.source_no ?? fact.purchase_bills?.doc_no ?? '-',
      id: `trading-allocation:${String(fact.id)}`,
      lineNo: fact.sales_line_no,
      productName: fact.product_name_snapshot ?? '-',
      qty: toNumber(fact.qty),
      status: sourceUsageStatusLabel(fact.status),
      title: fact.source_type === 'TRADING_COST_SOURCE' ? 'ใช้ Trading Cost Source' : 'ใช้ Trading PB',
      type: 'Trading allocation fact',
      unit: 'กก.',
    })),
    ...customerAdvanceAllocations.map((allocation) => ({
      amount: toNumber(allocation.allocated_amount),
      createdAt: allocation.created_at.toISOString(),
      docNo: allocation.customer_advance_doc_no,
      id: `customer-advance:${String(allocation.id)}`,
      lineNo: null,
      productName: '-',
      qty: 0,
      status: sourceUsageStatusLabel(allocation.status),
      title: 'ใช้เงินล่วงหน้า Customer',
      type: 'Customer advance allocation fact',
      unit: '',
    })),
  ].sort((left, right) => {
    const dateCompare = Date.parse(right.createdAt) - Date.parse(left.createdAt)
    return dateCompare || left.id.localeCompare(right.id)
  })
  return {
    billDate: bill.bill_date ? toDateOnly(bill.bill_date) : '',
    branchId: bill.branches?.code ?? '',
    branchName: bill.branches?.name ?? '-',
    channelName: bill.sales_channels?.name ?? '-',
    createdBy: bill.created_by ?? '-',
    customerAddress: customerAddress(bill.customers),
    customerAdvanceDocNo: customerAdvanceAllocations.map((allocation) => allocation.customer_advance_doc_no).find(Boolean) ?? '',
    customerCode: bill.customers?.code ?? '-',
    customerName: bill.customers?.name ?? '-',
    customerTaxId: bill.customers?.tax_id ?? '-',
    date: bill.date ? toDateOnly(bill.date) : '-',
    deliveryDocNos,
    discount: toNumber(bill.discount_total ?? bill.discount),
    docNo: bill.doc_no,
    dueDate: bill.due_date ? toDateOnly(bill.due_date) : '',
    exportOrderNo: bill.export_order_no ?? '',
    hasVat: Boolean(bill.has_vat),
    items,
    note: bill.note ?? bill.notes ?? '',
    paidAmount: toNumber(bill.paid_amount),
    receivableBalance: toNumber(bill.receivable_balance),
    readModelWarning: '',
    receivedAmount: toNumber(bill.received_amount),
    salesName: salesperson?.name ?? bill.salesman ?? '-',
    status: bill.status ?? '',
    statusLabel: salesBillStatusLabel(bill.status),
    sourceUsageFacts,
    stockReturnOptions: activeReturnPendingOuts.map((hold) => ({
      pendingOutKey: hold.hold_key,
      pendingQty: toNumber(hold.qty),
      productCode: hold.products.code ?? '',
      productName: hold.products.name,
      sourceLineNo: hold.source_line_no,
      warehouseName: hold.warehouses.name,
      weightTicketDocNo: hold.source_doc_no,
    })),
    subtotal: toNumber(bill.subtotal),
    timeline,
    totalAmount: toNumber(bill.total_amount),
    transactionMode: bill.transaction_mode ?? 'STOCK',
    vatAmount: toNumber(bill.vat_amount),
    vatInvoiceDate: bill.vat_invoice_date ? toDateOnly(bill.vat_invoice_date) : '',
    vatInvoiceIssued: Boolean(bill.vat_invoice_issued),
    vatInvoiceNo: bill.vat_invoice_no ?? '',
    vatType: bill.vat_type ?? 'NONE',
    warehouseName: bill.warehouses?.name ?? '-',
  }
}
