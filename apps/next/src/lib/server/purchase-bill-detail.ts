import { PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS } from '@/lib/purchase-bill-status'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../generated/prisma/client'

export type PurchaseBillDetailTimelineEvent = {
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
}

export type PurchaseBillDetail = {
  advanceAllocatedAmount: number
  advancePaymentDocNo: string
  allocationRows: Array<{
    amount: number
    deductWeight: number
    grossWeight: number
    lineId: string
    lineNo: number
    note: string
    poDocNo: string | null
    price: number
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptSummaryLabel: string
    receiptTicketDocNo: string
    receiptVehicleNo: string
    sourceLabel: string
    sourceType: string
    unit: string
  }>
  branchId: string
  branchName: string
  createdBy: string
  date: string
  discount: number
  docNo: string
  licensePlate: string
  note: string
  paidAmount: number
  payableBalance: number
  productSummaries: Array<{
    amount: number
    deductWeight: number
    grossWeight: number
    lineCount: number
    poDocNos: string[]
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptDocNos: string[]
    sourceKinds: string[]
    unit: string
  }>
  receiptDocNos: string[]
  status: string
  statusLabel: string
  subtotal: number
  supplierAddress: string
  supplierCode: string
  supplierTaxId: string
  supplierName: string
  timeline: PurchaseBillDetailTimelineEvent[]
  totalAmount: number
  transactionMode: string
  vatAmount: number
  vatInvoiceDate: string
  vatInvoiceNo: string
  vatInvoiceReceived: boolean
  warehouseName: string
  refNo: string
  salesName: string
}

type PurchaseBillDetailRow = Prisma.purchase_billsGetPayload<{
  include: {
    branches: true
    purchase_bill_status_logs: {
      orderBy: Array<{ created_at: 'asc' } | { id: 'asc' }>
    }
    purchase_bill_items: {
      include: {
        po_buys: {
          select: {
            doc_no: true
          }
        }
        purchase_bill_po_allocations: {
          include: {
            po_buys: {
              select: {
                doc_no: true
              }
            }
          }
        }
        purchase_bill_receipt_allocations: {
          include: {
            weight_ticket_product_summaries: {
              select: {
                line_count: true
                container_deduction_weight: true
                net_weight: true
                product_name: true
                weight_ticket_product_summary_lines: {
                  include: {
                    weight_ticket_lines: {
                      select: {
                        line_no: true,
                        note: true,
                      },
                    },
                  },
                  orderBy: {
                    weight_ticket_lines: {
                      line_no: 'asc',
                    },
                  },
                },
              }
            }
            weight_tickets: {
              select: {
                doc_no: true
                document_date: true
                vehicle_no: true
              }
            }
          }
        }
      }
      orderBy: {
        line_no: 'asc'
      }
      where: {
        item_status: 'active'
      }
    }
    supplier_advance_allocations: {
      include: {
        supplier_advance_payments: {
          select: {
            doc_no: true
          }
        }
      }
    }
    suppliers: true
    warehouses: true
  }
}>

function purchaseBillStatusLabel(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'unpaid') return 'ยังไม่ชำระเงิน'
  if (normalized === 'partial') return 'ชำระเงินบางส่วน'
  if (normalized === 'paid') return 'เสร็จสิ้น'
  if (normalized === 'cancelled') return 'ยกเลิก'
  if (normalized === PURCHASE_BILL_SUPPLIER_SWAP_CANCELLED_STATUS) return 'ยกเลิก/เปลี่ยน Supplier'
  return status ?? '-'
}

function purchaseBillHistoryActionLabel(action: string | null | undefined) {
  switch (String(action ?? '').toLowerCase()) {
    case 'created':
      return 'สร้างบิลรับซื้อ'
    case 'edited':
      return 'แก้ไขบิลรับซื้อ'
    case 'payment_recorded':
      return 'บันทึกการชำระเงิน'
    case 'payment_reversed':
      return 'ยกเลิกการชำระเงิน'
    case 'cancelled':
      return 'ยกเลิกบิล'
    case 'supplier_swap_cancelled':
      return 'ยกเลิกบิลจากการเปลี่ยน Supplier'
    default:
      return 'อัปเดตสถานะบิล'
  }
}

function purchaseBillHistoryTone(action: string | null | undefined): PurchaseBillDetailTimelineEvent['tone'] {
  switch (String(action ?? '').toLowerCase()) {
    case 'created':
      return 'blue'
    case 'edited':
      return 'amber'
    case 'payment_recorded':
      return 'emerald'
    case 'payment_reversed':
    case 'cancelled':
    case 'supplier_swap_cancelled':
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

function sourceSnapshotValue(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function receiptLineRemark(receiptAllocation: PurchaseBillDetailRow['purchase_bill_items'][number]['purchase_bill_receipt_allocations']) {
  if (!receiptAllocation) return null
  const notes = receiptAllocation.weight_ticket_product_summaries.weight_ticket_product_summary_lines
    .map((bridge) => bridge.weight_ticket_lines.note?.trim() ?? '')
    .filter((note): note is string => Boolean(note))
  return Array.from(new Set(notes)).join(' / ')
}

export async function getPurchaseBillDetail(docNo: string): Promise<PurchaseBillDetail | null> {
  const bill: PurchaseBillDetailRow | null = await prisma.purchase_bills.findFirst({
    include: {
      branches: true,
      purchase_bill_status_logs: {
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      },
      purchase_bill_items: {
        include: {
          po_buys: {
            select: {
              doc_no: true,
            },
          },
          purchase_bill_po_allocations: {
            include: {
              po_buys: {
                select: {
                  doc_no: true,
                },
              },
            },
          },
          purchase_bill_receipt_allocations: {
            include: {
              weight_ticket_product_summaries: {
                select: {
                  line_count: true,
                  container_deduction_weight: true,
                  net_weight: true,
                  product_name: true,
                  weight_ticket_product_summary_lines: {
                    include: {
                      weight_ticket_lines: {
                        select: {
                          line_no: true,
                          note: true,
                        },
                      },
                    },
                    orderBy: {
                      weight_ticket_lines: {
                        line_no: 'asc',
                      },
                    },
                  },
                },
              },
              weight_tickets: {
                select: {
                  doc_no: true,
                  vehicle_no: true,
                },
              },
            },
          },
        },
        orderBy: { line_no: 'asc' },
        where: { item_status: 'active' },
      },
      suppliers: true,
      warehouses: true,
      supplier_advance_allocations: {
        include: {
          supplier_advance_payments: {
            select: {
              doc_no: true,
            },
          },
        },
      },
    },
    where: {
      doc_no: docNo,
    },
  })

  if (!bill) return null

  const allocationRows = bill.purchase_bill_items.map((item, index) => {
    const receiptAllocation = item.purchase_bill_receipt_allocations
    const poAllocation = item.purchase_bill_po_allocations
    const allocatedGrossWeight = receiptAllocation ? toNumber(receiptAllocation.allocated_gross_weight) : toNumber(item.gross_weight)
    const allocatedDeductWeight = receiptAllocation ? toNumber(receiptAllocation.allocated_deduct_weight) : toNumber(item.deduct_weight)
    const allocatedQty = receiptAllocation ? toNumber(receiptAllocation.allocated_qty) : toNumber(item.qty)
    const receiptSummary = receiptAllocation?.weight_ticket_product_summaries ?? null
    const receiptSummaryNetWeight = toNumber(receiptSummary?.net_weight)
    const allocationRatio = receiptSummary && receiptSummaryNetWeight > 0 ? allocatedQty / receiptSummaryNetWeight : 0
    const allocatedContainerDeductionWeight = receiptSummary && allocationRatio > 0
      ? toNumber(receiptSummary.container_deduction_weight) * allocationRatio
      : 0
    const billGrossWeight = Math.max(0, allocatedGrossWeight - allocatedContainerDeductionWeight)
    const receiptTicketDocNo = receiptAllocation?.weight_tickets.doc_no
      ?? sourceSnapshotValue(item.source_snapshot, 'receiptTicketDocNo')
      ?? '-'
    const receiptVehicleNo = receiptAllocation?.weight_tickets.vehicle_no ?? ''
    const lineNo = item.line_no ?? index + 1
    const remark = receiptLineRemark(receiptAllocation)
    const receiptSummaryLabel = receiptAllocation?.weight_ticket_product_summaries
      ? `รวมจาก ${receiptAllocation.weight_ticket_product_summaries.line_count ?? 0} lot · ${receiptAllocation.weight_ticket_product_summaries.product_name ?? '-'}`
      : '-'
    const poDocNo = poAllocation?.po_buys.doc_no
      ?? item.po_buys?.doc_no
      ?? sourceSnapshotValue(item.source_snapshot, 'poBuyId')
      ?? null

    return {
      amount: toNumber(item.amount),
      deductWeight: allocatedDeductWeight,
      grossWeight: billGrossWeight,
      lineId: `${bill.doc_no}:${lineNo}`,
      lineNo,
      note: receiptAllocation ? remark ?? '' : item.note ?? '',
      poDocNo,
      price: toNumber(item.price),
      productCode: item.product_code ?? '',
      productId: item.product_code ?? item.display_name ?? item.product_name ?? `${bill.doc_no}:line-${lineNo}`,
      productName: item.display_name ?? item.product_name ?? '-',
      qty: allocatedQty,
      receiptSummaryLabel,
      receiptTicketDocNo,
      receiptVehicleNo,
      sourceLabel: poDocNo ?? 'Spot Buy',
      sourceType: poDocNo ? 'PO Buy' : 'Spot Buy',
      unit: item.unit ?? 'กก.',
    }
  })

  const productSummaries = Array.from(allocationRows.reduce((map, row) => {
    const key = row.productId || row.productName
    const current = map.get(key) ?? {
      amount: 0,
      deductWeight: 0,
      grossWeight: 0,
      lineCount: 0,
      poDocNos: new Set<string>(),
      productCode: row.productCode,
      productId: row.productId,
      productName: row.productName,
      qty: 0,
      receiptDocNos: new Set<string>(),
      sourceKinds: new Set<string>(),
      unit: row.unit,
    }
    current.amount += row.amount
    current.deductWeight += row.deductWeight
    current.grossWeight += row.grossWeight
    current.lineCount += 1
    current.qty += row.qty
    current.sourceKinds.add(row.sourceType)
    if (row.poDocNo) current.poDocNos.add(row.poDocNo)
    if (row.receiptTicketDocNo && row.receiptTicketDocNo !== '-') current.receiptDocNos.add(row.receiptTicketDocNo)
    map.set(key, current)
    return map
  }, new Map<string, {
    amount: number
    deductWeight: number
    grossWeight: number
    lineCount: number
    poDocNos: Set<string>
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptDocNos: Set<string>
    sourceKinds: Set<string>
    unit: string
  }>()).values()).map((item) => ({
    ...item,
    poDocNos: Array.from(item.poDocNos),
    receiptDocNos: Array.from(item.receiptDocNos),
    sourceKinds: Array.from(item.sourceKinds),
  }))

  const timeline = bill.purchase_bill_status_logs.map((log): PurchaseBillDetailTimelineEvent => {
    const amount = historyMetaValue(log.meta, 'amount')
    const accountCode = historyMetaValue(log.meta, 'accountCode')
    const accountName = historyMetaValue(log.meta, 'accountName')
    const discount = historyMetaValue(log.meta, 'discount')
    const fee = historyMetaValue(log.meta, 'fee')
    const paymentDocNo = historyMetaValue(log.meta, 'paymentDocNo')
    const transactionMode = historyMetaValue(log.meta, 'transactionMode')
    const voucherId = historyMetaValue(log.meta, 'voucherId')
    const withholdingTax = historyMetaValue(log.meta, 'withholdingTax')
    const transitionText = log.from_status && log.from_status !== log.to_status
      ? `${purchaseBillStatusLabel(log.from_status)} -> ${purchaseBillStatusLabel(log.to_status)}`
      : purchaseBillStatusLabel(log.to_status)
    const details = [
      `สถานะ ${transitionText}`,
      `ผู้ทำ ${log.created_by ?? '-'}`,
    ]
    if (typeof paymentDocNo === 'string' && paymentDocNo) details.push(`เลขที่การชำระเงิน ${paymentDocNo}`)
    if (typeof voucherId === 'string' && voucherId) details.push(`Voucher ${voucherId}`)
    if (typeof amount === 'number') details.push(`ยอดจ่าย ${money(amount)}`)
    if (typeof withholdingTax === 'number') details.push(`WHT ${money(withholdingTax)}`)
    if (typeof discount === 'number') details.push(`ส่วนลด ${money(discount)}`)
    if (typeof fee === 'number') details.push(`Fee ${money(fee)}`)
    if ((typeof accountName === 'string' && accountName) || (typeof accountCode === 'string' && accountCode)) {
      details.push(`บัญชี ${[typeof accountCode === 'string' && accountCode ? accountCode : null, typeof accountName === 'string' && accountName ? accountName : null].filter(Boolean).join(' - ')}`)
    }
    if (typeof transactionMode === 'string' && transactionMode) details.push(`โหมด ${transactionMode}`)
    if (log.note) details.push(`หมายเหตุ ${log.note}`)
    return {
      action: log.action,
      actor: log.created_by ?? '-',
      createdAt: log.created_at.toISOString(),
      details,
      id: log.event_key ?? `purchase-bill-status:${log.id}`,
      status: log.to_status ?? '',
      statusLabel: purchaseBillStatusLabel(log.to_status),
      title: purchaseBillHistoryActionLabel(log.action),
      tone: purchaseBillHistoryTone(log.action),
      transitionText,
    }
  }).reverse()

  const receiptDocNos = Array.from(new Set(allocationRows.map((row) => row.receiptTicketDocNo).filter((value): value is string => Boolean(value && value !== '-'))))
  const activeAdvanceAllocation = bill.supplier_advance_allocations.find((allocation) => allocation.status === 'active') ?? null
  const receiptVehicleNo = allocationRows.map((row) => row.receiptVehicleNo).find(Boolean) ?? ''

  return {
    advanceAllocatedAmount: toNumber(activeAdvanceAllocation?.allocated_amount),
    advancePaymentDocNo: activeAdvanceAllocation?.supplier_advance_payments.doc_no ?? '',
    allocationRows,
    branchId: bill.branches?.code ?? '',
    branchName: bill.branches?.name ?? '-',
    createdBy: bill.created_by ?? '-',
    date: bill.date ? toDateOnly(bill.date) : '-',
    discount: toNumber(bill.discount_total ?? bill.discount),
    docNo: bill.doc_no,
    licensePlate: bill.license_plate ?? receiptVehicleNo,
    note: bill.note ?? bill.notes ?? '',
    paidAmount: toNumber(bill.paid_amount),
    payableBalance: toNumber(bill.payable_balance),
    productSummaries,
    receiptDocNos,
    status: bill.status ?? '',
    statusLabel: purchaseBillStatusLabel(bill.status),
    subtotal: toNumber(bill.subtotal),
    supplierAddress: bill.supplier_address_snapshot ?? '-',
    supplierCode: bill.suppliers?.code ?? '-',
    supplierTaxId: bill.supplier_tax_id_snapshot ?? '-',
    supplierName: bill.supplier_name_snapshot ?? '-',
    timeline,
    totalAmount: toNumber(bill.total_amount),
    transactionMode: bill.transaction_mode ?? 'STOCK',
    vatAmount: toNumber(bill.vat_amount),
    vatInvoiceDate: bill.vat_invoice_date ? toDateOnly(bill.vat_invoice_date) : '-',
    vatInvoiceNo: bill.vat_invoice_no ?? '-',
    vatInvoiceReceived: Boolean(bill.vat_invoice_received),
    warehouseName: bill.warehouses?.name ?? '-',
    refNo: bill.ref_no ?? '-',
    salesName: bill.supplier_sales_rep_snapshot ?? '-',
  }
}
