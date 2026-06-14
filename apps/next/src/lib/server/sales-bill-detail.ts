import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
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
  hasVat: boolean
  items: Array<{
    amount: number
    deliveryLineId: string
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
    sourceLabel: string
    sourceType: string
    tradingSourceDocNo: string
    tradingSourceLineNo: number | null
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
  subtotal: number
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

function snapshotString(item: unknown, key: string) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
  const value = (item as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function snapshotNumber(item: unknown, key: string) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 0
  const value = (item as Record<string, unknown>)[key]
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function itemSnapshots(items: Prisma.JsonValue | null | undefined) {
  return Array.isArray(items) ? items.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : []
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
    const sourceType = input.bill.transaction_mode === 'TRADING'
      ? tradingSource.sourceType
      : Array.from(new Set([
        ...sourceAllocations.map((allocation) => {
          if (allocation.source_type === 'WTO') return allocation.movement_owner === 'SALES_BILL' ? 'WTO stock-out source' : 'WTO source'
          if (allocation.source_type === 'PSALE') return allocation.movement_owner === 'PSALE' ? 'PSALE stock-out source' : 'PSALE source'
          return allocation.source_type
        }),
        ...poAllocations.map((allocation) => allocation.allocation_type === 'PO_SELL' ? 'PO Sell' : 'Spot Sale'),
      ])).join(' / ')

    return {
      amount: toNumber(line.line_amount),
      deliveryLineId: firstSourceAllocation?.source_line_no != null ? String(firstSourceAllocation.source_line_no) : '',
      deliveryTicketDocNo,
      deliveryVehicleNo: input.vehicleByDeliveryDocNo.get(deliveryTicketDocNo) ?? '',
      deductWeight: toNumber(line.deduct_weight),
      discount: toNumber(line.discount_amount),
      grossWeight: toNumber(line.gross_weight),
      lineNo: line.line_no,
      matchedCogs: tradingSource.matchedCogs,
      netWeight: toNumber(line.net_weight) || toNumber(line.qty),
      note: line.notes ?? '',
      poSellDocNo,
      price: toNumber(line.unit_price),
      productCode: line.product_code_snapshot,
      productId: line.product_code_snapshot,
      productName: line.product_name_snapshot || '-',
      qty: toNumber(line.qty),
      sourceLabel: sourceParts.filter(Boolean).join(' / '),
      sourceType,
      tradingSourceDocNo: tradingSource.sourceDocNo,
      tradingSourceLineNo: tradingSource.sourceLineNo,
      unit: line.unit_snapshot || 'กก.',
    }
  })
}

function buildSnapshotItems(input: {
  bill: SalesBillDetailRow
  snapshots: unknown[]
  tradingFactByLineNo: Map<number, Prisma.trading_allocation_factsGetPayload<{
    include: {
      purchase_bills: { select: { doc_no: true } }
      trading_cost_sources: { select: { source_no: true; source_type: true } }
    }
  }>>
  vehicleByDeliveryDocNo: Map<string, string>
}): SalesBillDetail['items'] {
  return input.snapshots.map((item, index) => {
    const lineNo = index + 1
    const deliveryTicketDocNo = snapshotString(item, 'deliveryTicketDocNo')
    const tradingSource = tradingSourceInfo(input.bill.transaction_mode, lineNo, input.tradingFactByLineNo)
    const sourceParts = input.bill.transaction_mode === 'TRADING'
      ? [tradingSource.label, 'รอ sales allocation facts']
      : ['รอ migration allocation facts']
    return {
      amount: snapshotNumber(item, 'amount'),
      deliveryLineId: snapshotString(item, 'deliveryLineId'),
      deliveryTicketDocNo,
      deliveryVehicleNo: input.vehicleByDeliveryDocNo.get(deliveryTicketDocNo) ?? '',
      deductWeight: snapshotNumber(item, 'deductWeight'),
      discount: snapshotNumber(item, 'discount'),
      grossWeight: snapshotNumber(item, 'grossWeight'),
      lineNo,
      matchedCogs: tradingSource.matchedCogs,
      netWeight: snapshotNumber(item, 'netWeight') || snapshotNumber(item, 'qty'),
      note: snapshotString(item, 'note'),
      poSellDocNo: '',
      price: snapshotNumber(item, 'unitPrice') || snapshotNumber(item, 'price'),
      productCode: snapshotString(item, 'productCode'),
      productId: snapshotString(item, 'productId'),
      productName: snapshotString(item, 'productName') || '-',
      qty: snapshotNumber(item, 'qty'),
      sourceLabel: sourceParts.filter(Boolean).join(' / '),
      sourceType: input.bill.transaction_mode === 'TRADING' ? tradingSource.sourceType : 'Migration Gap',
      tradingSourceDocNo: tradingSource.sourceDocNo,
      tradingSourceLineNo: tradingSource.sourceLineNo,
      unit: snapshotString(item, 'unit') || 'กก.',
    }
  })
}

export async function getSalesBillDetail(docNo: string): Promise<SalesBillDetail | null> {
  const bill: SalesBillDetailRow | null = await prisma.sales_bills.findFirst({
    include: {
      branches: true,
      customers: true,
      sales_channels: true,
      warehouses: true,
    },
    where: {
      doc_no: docNo,
    },
  })

  if (!bill) return null

  const factStatuses = ['active', 'cancelled']
  const snapshots = itemSnapshots(bill.items)
  const [lineFacts, salesperson, customerAdvanceAllocations, tradingAllocationFacts] = await Promise.all([
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
        customer_advance_doc_no: true,
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
  ])

  const hasDurableLineFacts = lineFacts.length > 0
  const deliveryDocNos = hasDurableLineFacts
    ? Array.from(new Set(lineFacts.flatMap((line) => line.sales_bill_source_allocations
      .filter((allocation) => allocation.source_type === 'WTO')
      .map((allocation) => allocation.source_doc_no)).filter(Boolean)))
    : Array.from(new Set(snapshots.map((item) => snapshotString(item, 'deliveryTicketDocNo')).filter(Boolean)))
  const poSellDocNos = hasDurableLineFacts
    ? Array.from(new Set(lineFacts.flatMap((line) => line.sales_bill_po_sell_allocations
      .map((allocation) => allocation.po_sell_doc_no ?? allocation.po_sells?.doc_no ?? '')).filter(Boolean)))
    : []

  const [deliveryTickets, poSells] = await Promise.all([
    deliveryDocNos.length
      ? prisma.weight_tickets.findMany({
          select: {
            doc_no: true,
            vehicle_no: true,
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

  const vehicleByDeliveryDocNo = new Map(deliveryTickets.map((ticket) => [ticket.doc_no, ticket.vehicle_no ?? '']))
  const poSellDocNoSet = new Set(poSells.map((poSell) => poSell.doc_no))
  const tradingFactByLineNo = new Map<number, (typeof tradingAllocationFacts)[number]>()
  tradingAllocationFacts.forEach((fact) => {
    if (fact.sales_line_no == null) return
    tradingFactByLineNo.set(fact.sales_line_no, fact)
  })
  const items = hasDurableLineFacts
    ? buildDurableItems({ bill, lineFacts, poSellDocNoSet, tradingFactByLineNo, vehicleByDeliveryDocNo })
    : buildSnapshotItems({ bill, snapshots, tradingFactByLineNo, vehicleByDeliveryDocNo })
  const readModelWarning = hasDurableLineFacts
    ? ''
    : snapshots.length > 0
      ? 'บิลนี้ยังไม่มี durable Sales Bill allocation facts จึงแสดงได้เฉพาะ snapshot พื้นฐาน และไม่เดา PO/Stock/Customer advance allocation จาก JSON'
      : ''

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
    hasVat: Boolean(bill.has_vat),
    items,
    note: bill.note ?? bill.notes ?? '',
    paidAmount: toNumber(bill.paid_amount),
    receivableBalance: toNumber(bill.receivable_balance),
    readModelWarning,
    receivedAmount: toNumber(bill.received_amount),
    salesName: salesperson?.name ?? bill.salesman ?? '-',
    status: bill.status ?? '',
    statusLabel: salesBillStatusLabel(bill.status),
    subtotal: toNumber(bill.subtotal),
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
