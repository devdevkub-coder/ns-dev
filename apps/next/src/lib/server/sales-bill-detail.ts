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

  const snapshots = itemSnapshots(bill.items)
  const deliveryDocNos = Array.from(new Set(snapshots.map((item) => snapshotString(item, 'deliveryTicketDocNo')).filter(Boolean)))
  const poSellDocNos = Array.from(new Set(snapshots.map((item) => snapshotString(item, 'poSellId')).filter(Boolean)))
  const [deliveryTickets, poSells, salesperson, customerAdvance, tradingAllocationFacts] = await Promise.all([
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
      : bill.po_sell_id
        ? prisma.po_sells.findMany({
            select: {
              doc_no: true,
            },
            where: {
              id: bill.po_sell_id,
            },
          })
        : Promise.resolve([]),
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
    snapshots.map((item) => snapshotString(item, 'customerAdvanceId')).find(Boolean)
      ? prisma.bank_statement.findUnique({
          select: {
            doc_no: true,
            ref_no: true,
          },
          where: {
            doc_no: snapshots.map((item) => snapshotString(item, 'customerAdvanceId')).find(Boolean) ?? '',
          },
        })
      : Promise.resolve(null),
    bill.transaction_mode === 'TRADING'
      ? prisma.trading_allocation_facts.findMany({
          include: {
            purchase_bills: { select: { doc_no: true } },
            trading_cost_sources: { select: { source_no: true, source_type: true } },
          },
          orderBy: [{ sales_line_no: 'asc' }, { id: 'asc' }],
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        })
      : Promise.resolve([]),
  ])

  const vehicleByDeliveryDocNo = new Map(deliveryTickets.map((ticket) => [ticket.doc_no, ticket.vehicle_no ?? '']))
  const poSellDocNoSet = new Set(poSells.map((poSell) => poSell.doc_no))
  const fallbackPoSellDocNo = poSells[0]?.doc_no ?? ''
  const tradingFactByLineNo = new Map<number, (typeof tradingAllocationFacts)[number]>()
  tradingAllocationFacts.forEach((fact) => {
    if (fact.sales_line_no == null) return
    tradingFactByLineNo.set(fact.sales_line_no, fact)
  })

  const items = snapshots.map((item, index) => {
    const lineNo = index + 1
    const deliveryTicketDocNo = snapshotString(item, 'deliveryTicketDocNo')
    const snapshotPoSellDocNo = snapshotString(item, 'poSellId')
    const poSellDocNo = poSellDocNoSet.has(snapshotPoSellDocNo) ? snapshotPoSellDocNo : fallbackPoSellDocNo
    const tradingFact = bill.transaction_mode === 'TRADING' ? tradingFactByLineNo.get(lineNo) ?? null : null
    const tradingSourceDocNo = tradingFact?.source_doc_no ?? tradingFact?.trading_cost_sources?.source_no ?? tradingFact?.purchase_bills?.doc_no ?? ''
    const tradingSourceLineNo = tradingFact?.source_line_no ?? null
    const tradingSourceType = String(tradingFact?.source_type ?? '').toUpperCase()
    const tradingSourcePrefix = tradingSourceType === 'TRADING_COST_SOURCE'
      ? 'Cost Source'
      : tradingSourceType === 'TRADING_PURCHASE_BILL'
        ? 'Trading PB'
        : 'Cost'
    const tradingSourceLabel = bill.transaction_mode === 'TRADING'
      ? tradingFact
        ? `${tradingSourcePrefix} ${tradingSourceDocNo}${tradingSourceLineNo ? `:${tradingSourceLineNo}` : ''}`
        : 'รอ Trading allocation'
      : ''
    const poSellSourceLabel = poSellDocNo ? `PO Sell ${poSellDocNo}` : 'Spot Sale'
    const sourceType = bill.transaction_mode === 'TRADING'
      ? tradingFact
        ? tradingSourceType === 'TRADING_COST_SOURCE'
          ? 'Trading Cost Source Allocation'
          : tradingSourceType === 'TRADING_PURCHASE_BILL'
            ? 'Trading PB Allocation'
            : 'Trading Allocation'
        : 'Pending Trading Allocation'
      : poSellDocNo ? 'PO Sell' : 'Spot Sale'
    const sourceParts = bill.transaction_mode === 'TRADING'
      ? [tradingSourceLabel, poSellSourceLabel]
      : [poSellSourceLabel]
    return {
      amount: snapshotNumber(item, 'amount'),
      deliveryLineId: snapshotString(item, 'deliveryLineId'),
      deliveryTicketDocNo,
      deliveryVehicleNo: vehicleByDeliveryDocNo.get(deliveryTicketDocNo) ?? '',
      deductWeight: snapshotNumber(item, 'deductWeight'),
      discount: snapshotNumber(item, 'discount'),
      grossWeight: snapshotNumber(item, 'grossWeight'),
      lineNo,
      matchedCogs: toNumber(tradingFact?.matched_cogs),
      netWeight: snapshotNumber(item, 'netWeight') || snapshotNumber(item, 'qty'),
      note: snapshotString(item, 'note'),
      poSellDocNo,
      price: snapshotNumber(item, 'unitPrice') || snapshotNumber(item, 'price'),
      productCode: snapshotString(item, 'productCode'),
      productId: snapshotString(item, 'productId'),
      productName: snapshotString(item, 'productName') || '-',
      qty: snapshotNumber(item, 'qty'),
      sourceLabel: sourceParts.join(' / '),
      sourceType,
      tradingSourceDocNo,
      tradingSourceLineNo,
      unit: snapshotString(item, 'unit') || 'กก.',
    }
  })

  return {
    billDate: bill.bill_date ? toDateOnly(bill.bill_date) : '',
    branchId: bill.branches?.code ?? '',
    branchName: bill.branches?.name ?? '-',
    channelName: bill.sales_channels?.name ?? '-',
    createdBy: bill.created_by ?? '-',
    customerAddress: customerAddress(bill.customers),
    customerAdvanceDocNo: customerAdvance?.ref_no ?? customerAdvance?.doc_no ?? '',
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
