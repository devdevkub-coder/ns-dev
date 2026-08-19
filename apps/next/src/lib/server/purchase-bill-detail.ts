import { purchaseBillStatusText, requirePurchaseBillStatus } from '@/lib/purchase-bill-status'
import { supplierAdvanceVatTypeLabel } from '@/lib/purchase-advance'
import { actorDisplayName, resolveActorDisplayNames } from '@/lib/server/actor-display-names'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { receiptLineOutwardId, receiptSummaryOutwardId } from '@/lib/purchase-bill-receipt-reference'
import type { PurchaseBillFormValues } from '@/lib/purchase-bill'
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
  advanceConsumedAmount: number
  advanceAllocatedSubtotalAmount: number
  advanceAllocatedVatAmount: number
  advancePaymentDocNo: string
  advancePaymentInvoiceNo: string
  advancePaymentVatType: string
  advancePaymentVatTypeLabel: string
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
    receiptTicketDocNo: string | null
    receiptVehicleNo: string
    sourceLabel: string
    sourceType: string
    unit: string
  }>
  editForm: PurchaseBillFormValues
  branchId: string
  branchName: string
  createdBy: string
  date: string
  discount: number
  docNo: string
  hasVat: boolean
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
  updatedAt: string
  vatAmount: number
  vatInvoiceDate: string
  vatInvoiceNo: string
  vatInvoiceReceived: boolean
  vatRatePercent: number
  vatType: string
  warehouseName: string
  refNo: string
  salesName: string
  supplierBankAccounts?: Array<{
    accountName: string
    accountNo: string
    bankName: string
    branchCode: string
    code: string
    isPrimary: boolean
    paymentMethod: string
  }>
}

type PurchaseBillDetailRow = Prisma.purchase_billsGetPayload<{
  include: {
    branches: true
    purchase_bill_status_logs: {
      orderBy: Array<{ created_at: 'asc' } | { id: 'asc' }>
    }
    purchase_bill_items: {
      include: {
        products: {
          select: {
            code: true
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
                products: {
                  select: {
                    code: true
                  }
                }
                weight_ticket_product_summary_lines: {
                  include: {
                    weight_ticket_lines: {
                      select: {
                        deduct_weight: true,
                        gross_weight: true,
                        impurity_id: true,
                        impurity_name: true,
                        impurity_source_line_no: true,
                        line_no: true,
                        note: true,
                        product_id: true,
                        product_name: true,
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
                weight_ticket_lines: {
                  select: {
                    deduct_weight: true
                    gross_weight: true
                    impurity_id: true
                    impurity_name: true
                    impurity_source_line_no: true
                    line_no: true
                    note: true
                    product_id: true
                    product_name: true
                  }
                }
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
            invoice_no: true
            vat_type: true
          }
        }
      }
    }
    suppliers: {
      include: {
        supplier_bank_accounts: {
          include: {
            bank_names: {
              select: {
                name: true
              }
            }
          }
        }
      }
    }
    warehouses: true
  }
}>

function purchaseBillStatusLabel(status: string | null | undefined) {
  return purchaseBillStatusText(status)
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
    case 'supplier_changed':
      return 'เปลี่ยน Supplier ในบิลเดิม'
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
    case 'supplier_changed':
      return 'blue'
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

function weight(value: number | null | undefined) {
  const numericValue = value ?? 0
  if (numericValue % 1 === 0) {
    return numericValue.toLocaleString('th-TH', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
  }
  return numericValue.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function cleanImpurityName(name: string | null | undefined) {
  if (!name) return ''
  return name
    .replace(/\s*\([\d.]+\s*kg\)/gi, '')
    .replace(/\s*[\d.]+\s*kg/gi, '')
    .trim()
}

function historyMetaValue(meta: unknown, key: string) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  return (meta as Record<string, unknown>)[key]
}

type PaymentAccountDisplay = {
  accountNo: string | null
  bankName: string | null
}

function paymentAccountSnapshotRows(meta: unknown): PaymentAccountDisplay[] {
  const rawRows = historyMetaValue(meta, 'paymentAccounts')
  if (!Array.isArray(rawRows)) return []
  return rawRows.flatMap((rawRow) => {
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) return []
    const row = rawRow as Record<string, unknown>
    const accountNo = typeof row.accountNo === 'string' && row.accountNo.trim() ? row.accountNo.trim() : null
    const bankName = typeof row.bankName === 'string' && row.bankName.trim() ? row.bankName.trim() : null
    return accountNo || bankName ? [{ accountNo, bankName }] : []
  })
}

function uniquePaymentAccountRows(rows: PaymentAccountDisplay[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.bankName ?? ''}|${row.accountNo ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

type PurchaseBillReceiptAllocation = PurchaseBillDetailRow['purchase_bill_items'][number]['purchase_bill_receipt_allocations']

type PurchaseBillReceiptLine = NonNullable<PurchaseBillReceiptAllocation>['weight_tickets']['weight_ticket_lines'][number]

function isImpurityLine(line: PurchaseBillReceiptLine) {
  return toNumber(line.gross_weight) === 0 && Boolean(line.impurity_name || line.impurity_id)
}

function isPurchaseFromImpurityLine(line: PurchaseBillReceiptLine) {
  return toNumber(line.gross_weight) > 0 && line.impurity_source_line_no != null
}

function findPurchaseLineForImpurity(
  impurityLine: PurchaseBillReceiptLine,
  purchaseLines: PurchaseBillReceiptLine[],
) {
  return purchaseLines.find((purchaseLine) => purchaseLine.impurity_source_line_no === impurityLine.line_no)
}

function receiptLineRemark(receiptAllocation: PurchaseBillDetailRow['purchase_bill_items'][number]['purchase_bill_receipt_allocations']) {
  if (!receiptAllocation) return null
  const summary = receiptAllocation.weight_ticket_product_summaries
  const allReceiptLines = receiptAllocation.weight_tickets.weight_ticket_lines
  const purchaseLines = allReceiptLines.filter(isPurchaseFromImpurityLine)
  const summaryLines = summary.weight_ticket_product_summary_lines.map((bridge) => bridge.weight_ticket_lines)
  const impurityLines = summary.weight_ticket_product_summary_lines
    .map((bridge) => bridge.weight_ticket_lines)
    .filter(isImpurityLine)
  const lotNotes = Array.from(new Set(summaryLines
    .filter((line) => !isImpurityLine(line) && !isPurchaseFromImpurityLine(line))
    .map((line) => line.note?.trim() ?? '')
    .filter((note): note is string => Boolean(note))))

  if (impurityLines.length > 0) {
    const impurityRemarks = impurityLines.map((line, index) => {
      const purchaseLine = findPurchaseLineForImpurity(line, purchaseLines)
      const impurityName = cleanImpurityName(line.impurity_name) || 'สิ่งเจือปน'
      const prefix = `- ${index + 1}. ${impurityName} ${weight(toNumber(line.deduct_weight))} กก.`
      return purchaseLine ? `${prefix} ซื้อเป็น ${purchaseLine.product_name}` : prefix
    })
    const noteRemarks = lotNotes.map((note, index) => `- ${impurityRemarks.length + index + 1}. ${note}`)
    return [...impurityRemarks, ...noteRemarks].join('\n')
  }

  return lotNotes.join(' / ')
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
          products: {
            select: {
              code: true,
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
                  products: {
                    select: {
                      code: true,
                    },
                  },
                  weight_ticket_product_summary_lines: {
                    include: {
                      weight_ticket_lines: {
                        select: {
                          deduct_weight: true,
                          gross_weight: true,
                          impurity_id: true,
                          impurity_name: true,
                          impurity_source_line_no: true,
                          line_no: true,
                          note: true,
                          product_id: true,
                          product_name: true,
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
                  weight_ticket_lines: {
                    orderBy: { line_no: 'asc' },
                    select: {
                      deduct_weight: true,
                      gross_weight: true,
                      impurity_id: true,
                      impurity_name: true,
                      impurity_source_line_no: true,
                      line_no: true,
                      note: true,
                      product_id: true,
                      product_name: true,
                    },
                  },
                  vehicle_no: true,
                },
              },
            },
          },
        },
        orderBy: { line_no: 'asc' },
        where: { item_status: 'active' },
      },
      suppliers: {
        include: {
          supplier_bank_accounts: {
            include: {
              bank_names: { select: { name: true } },
            },
            where: { active: true },
            orderBy: [{ is_primary: 'desc' }, { code: 'asc' }],
          },
        },
      },
      warehouses: true,
      supplier_advance_allocations: {
        include: {
          supplier_advance_payments: {
            select: {
              doc_no: true,
              invoice_no: true,
              vat_type: true,
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

  const paymentApprovalFacts = await prisma.payment_approvals.findMany({
    select: { id: true },
    where: {
      source_id: bill.id.toString(),
      source_type: 'purchase_bill',
    },
  })
  const paymentApprovalIds = paymentApprovalFacts.map((approval) => approval.id)
  const paymentAllocationConditions: Prisma.payment_allocationsWhereInput[] = [
    { source_doc_no_snapshot: bill.doc_no, source_type: 'purchase_bill' },
    ...(paymentApprovalIds.length > 0 ? [{ payment_approval_id: { in: paymentApprovalIds } }] : []),
  ]
  const paymentAllocationFacts = await prisma.payment_allocations.findMany({
    select: {
      payment_doc_no: true,
      payment_id: true,
      payment_voucher_id: true,
    },
    where: { OR: paymentAllocationConditions },
  })
  const paymentIdsFromAllocations = paymentAllocationFacts
    .map((allocation) => allocation.payment_id)
    .filter((paymentId): paymentId is bigint => paymentId != null)
  const paymentDocNosFromAllocations = paymentAllocationFacts.map((allocation) => allocation.payment_doc_no)
  const paymentVoucherIdsFromAllocations = paymentAllocationFacts
    .map((allocation) => allocation.payment_voucher_id)
    .filter((voucherId): voucherId is string => Boolean(voucherId))
  const paymentConditions: Prisma.paymentsWhereInput[] = [
    { bill_id: bill.id },
    ...(paymentIdsFromAllocations.length > 0 ? [{ id: { in: paymentIdsFromAllocations } }] : []),
    ...(paymentDocNosFromAllocations.length > 0 ? [{ doc_no: { in: paymentDocNosFromAllocations } }] : []),
    ...(paymentVoucherIdsFromAllocations.length > 0 ? [{ voucher_id: { in: paymentVoucherIdsFromAllocations } }] : []),
  ]
  const paymentFacts = await prisma.payments.findMany({
    select: {
      accounts: {
        select: {
          account_no: true,
          bank: true,
          bank_name: true,
          code: true,
          name: true,
        },
      },
      date: true,
      doc_no: true,
      id: true,
      voucher_id: true,
    },
    where: { OR: paymentConditions },
  })
  const paymentIds = paymentFacts.map((payment) => payment.id)
  const paymentDocNos = paymentFacts.map((payment) => payment.doc_no)
  const paymentVoucherIds = paymentFacts
    .map((payment) => payment.voucher_id)
    .filter((voucherId): voucherId is string => Boolean(voucherId))
  const paymentAccountSplitConditions: Prisma.payment_account_splitsWhereInput[] = [
    ...(paymentIds.length > 0 ? [{ payment_id: { in: paymentIds } }] : []),
    ...(paymentDocNos.length > 0 ? [{ payment_doc_no: { in: paymentDocNos } }] : []),
    ...(paymentVoucherIds.length > 0 ? [{ payment_voucher_id: { in: paymentVoucherIds } }] : []),
  ]
  const paymentAccountSplitFacts = await prisma.payment_account_splits.findMany({
    orderBy: [{ payment_doc_no: 'asc' }, { id: 'asc' }],
    select: {
      account_code_snapshot: true,
      account_name_snapshot: true,
      accounts: {
        select: {
          account_no: true,
          bank: true,
          bank_name: true,
          code: true,
          name: true,
        },
      },
      amount: true,
      id: true,
      payment_doc_no: true,
      payment_id: true,
      payment_voucher_id: true,
    },
    where: paymentAccountSplitConditions.length > 0
      ? { OR: paymentAccountSplitConditions }
      : { id: { in: [] } },
  })

  const allocationRows = bill.purchase_bill_items.map((item, index) => {
    const receiptAllocation = item.purchase_bill_receipt_allocations?.allocation_status === 'active'
      ? item.purchase_bill_receipt_allocations
      : null
    const poAllocation = item.purchase_bill_po_allocations?.allocation_status === 'active'
      ? item.purchase_bill_po_allocations
      : null
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
    const receiptTicketDocNo = receiptAllocation ? receiptAllocation.weight_tickets.doc_no : null
    const receiptVehicleNo = receiptAllocation?.weight_tickets.vehicle_no ?? ''
    const lineNo = item.line_no ?? index + 1
    const remark = receiptLineRemark(receiptAllocation)
    const receiptSummaryLabel = receiptAllocation?.weight_ticket_product_summaries
      ? `รวมจาก ${receiptAllocation.weight_ticket_product_summaries.line_count ?? 0} รายการ · ${receiptAllocation.weight_ticket_product_summaries.product_name ?? '-'}`
      : '-'
    const poDocNo = poAllocation?.po_buys.doc_no ?? null

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
      unit: item.unit ?? '',
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
    if (row.receiptTicketDocNo) current.receiptDocNos.add(row.receiptTicketDocNo)
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

  const actorDisplayNames = await resolveActorDisplayNames([
    bill.created_by,
    ...bill.purchase_bill_status_logs.map((log) => log.created_by),
  ])

  const timeline = bill.purchase_bill_status_logs.map((log): PurchaseBillDetailTimelineEvent => {
    const amount = historyMetaValue(log.meta, 'amount')
    const accountCode = historyMetaValue(log.meta, 'accountCode')
    const accountName = historyMetaValue(log.meta, 'accountName')
    const accountNoSnapshot = historyMetaValue(log.meta, 'accountNo')
    const bankNameSnapshot = historyMetaValue(log.meta, 'bankName')
    const discount = historyMetaValue(log.meta, 'discount')
    const fee = historyMetaValue(log.meta, 'fee')
    const paymentDateSnapshot = historyMetaValue(log.meta, 'paymentDate')
    const paymentDocNo = historyMetaValue(log.meta, 'paymentDocNo')
    const afterSupplierName = historyMetaValue(log.meta, 'afterSupplierName')
    const beforeSupplierName = historyMetaValue(log.meta, 'beforeSupplierName')
    const transactionMode = historyMetaValue(log.meta, 'transactionMode')
    const voucherId = historyMetaValue(log.meta, 'voucherId')
    const withholdingTax = historyMetaValue(log.meta, 'withholdingTax')
    const paymentFact = paymentFacts.find((payment) => (
      (typeof paymentDocNo === 'string' && paymentDocNo && payment.doc_no === paymentDocNo)
      || (typeof voucherId === 'string' && voucherId && payment.voucher_id === voucherId)
    ))
    const paymentSplitFacts = paymentFact
      ? paymentAccountSplitFacts.filter((split) => (
        split.payment_id === paymentFact.id
        || split.payment_doc_no === paymentFact.doc_no
        || (paymentFact.voucher_id != null && split.payment_voucher_id === paymentFact.voucher_id)
      ))
      : []
    const paymentAccountSnapshots = paymentAccountSnapshotRows(log.meta)
    const paymentAccountRows = uniquePaymentAccountRows(
      paymentAccountSnapshots.length > 0
        ? paymentAccountSnapshots
        : paymentSplitFacts.length > 0
          ? paymentSplitFacts.map((split) => ({
            accountNo: split.accounts?.account_no ?? null,
            bankName: split.accounts?.bank_name ?? split.accounts?.bank ?? null,
          }))
          : paymentFact?.accounts
            ? [{
              accountNo: paymentFact.accounts.account_no ?? null,
              bankName: paymentFact.accounts.bank_name ?? paymentFact.accounts.bank ?? null,
            }]
            : [],
    )
    const legacyPaymentAccountRows = uniquePaymentAccountRows([
      ...(typeof bankNameSnapshot === 'string' && bankNameSnapshot.trim() ? [{ bankName: bankNameSnapshot.trim(), accountNo: null }] : []),
      ...(typeof accountNoSnapshot === 'string' && accountNoSnapshot.trim() ? [{ bankName: null, accountNo: accountNoSnapshot.trim() }] : []),
    ])
    const displayPaymentAccountRows = uniquePaymentAccountRows([
      ...paymentAccountRows,
      ...legacyPaymentAccountRows,
    ])
    const bankNames = [...new Set(displayPaymentAccountRows.map((account) => account.bankName).filter((value): value is string => Boolean(value)))]
    const accountNos = [...new Set(displayPaymentAccountRows.map((account) => account.accountNo).filter((value): value is string => Boolean(value)))]
    const paymentDate = typeof paymentDateSnapshot === 'string' && paymentDateSnapshot
      ? paymentDateSnapshot
      : paymentFact
        ? toDateOnly(paymentFact.date)
        : null
    const bankName = bankNames.length > 0 ? bankNames.join(', ') : null
    const accountNo = accountNos.length > 0 ? accountNos.join(', ') : null
    const transitionText = log.from_status && log.from_status !== log.to_status
      ? `${purchaseBillStatusLabel(log.from_status)} -> ${purchaseBillStatusLabel(log.to_status)}`
      : purchaseBillStatusLabel(log.to_status)
    const actorName = actorDisplayName(log.created_by ?? '-', actorDisplayNames)
    const details = [
      `สถานะ ${transitionText}`,
      `ผู้ทำ ${actorName}`,
    ]
    if (typeof paymentDocNo === 'string' && paymentDocNo) details.push(`เลขที่การชำระเงิน ${paymentDocNo}`)
    if (paymentDate) details.push(`วันที่จ่ายตามเอกสาร PMT ${paymentDate}`)
    if (bankName) details.push(`ธนาคารบริษัทที่จ่ายออก ${bankName}`)
    if (accountNo) details.push(`เลขที่บัญชีบริษัทที่จ่ายออก ${accountNo}`)
    if (typeof amount === 'number') details.push(`ยอดจ่าย ${money(amount)}`)
    if (typeof withholdingTax === 'number') details.push(`WHT ${money(withholdingTax)}`)
    if (typeof discount === 'number') details.push(`ส่วนลด ${money(discount)}`)
    if (typeof fee === 'number') details.push(`Fee ${money(fee)}`)
    if ((typeof accountName === 'string' && accountName) || (typeof accountCode === 'string' && accountCode)) {
      details.push(`บัญชี ${[typeof accountCode === 'string' && accountCode ? accountCode : null, typeof accountName === 'string' && accountName ? accountName : null].filter(Boolean).join(' - ')}`)
    }
    if (typeof transactionMode === 'string' && transactionMode) details.push(`โหมด ${transactionMode}`)
    if (log.action === 'supplier_changed') {
      if (typeof beforeSupplierName === 'string' && beforeSupplierName) details.push(`Supplier เดิม ${beforeSupplierName}`)
      if (typeof afterSupplierName === 'string' && afterSupplierName) details.push(`Supplier ใหม่ ${afterSupplierName}`)
    }
    if (log.note) details.push(`หมายเหตุ ${log.note}`)
    return {
      action: log.action,
      actor: actorName,
      createdAt: log.created_at.toISOString(),
      details,
      id: log.event_key ?? `purchase-bill-status:${log.id}`,
      status: requirePurchaseBillStatus(log.to_status, bill.doc_no),
      statusLabel: purchaseBillStatusLabel(log.to_status),
      title: purchaseBillHistoryActionLabel(log.action),
      tone: purchaseBillHistoryTone(log.action),
      transitionText,
    }
  }).reverse()

  const receiptDocNos = Array.from(new Set(allocationRows.map((row) => row.receiptTicketDocNo).filter((value): value is string => Boolean(value))))
  const activeAdvanceAllocation = bill.supplier_advance_allocations.find((allocation) => allocation.status === 'active') ?? null
  const receiptVehicleNo = allocationRows.map((row) => row.receiptVehicleNo).find(Boolean) ?? ''
  const editItems = bill.purchase_bill_items.map((item) => {
    const receiptAllocation = item.purchase_bill_receipt_allocations?.allocation_status === 'active'
      ? item.purchase_bill_receipt_allocations
      : null
    const receiptTicketId = receiptAllocation?.weight_tickets.doc_no ?? null
    const receiptTicketDocNo = receiptTicketId
    const receiptSummary = receiptAllocation?.weight_ticket_product_summaries ?? null
    const receiptLineIds = receiptSummary && receiptTicketId
      ? receiptSummary.weight_ticket_product_summary_lines.map(({ weight_ticket_lines: line }) => receiptLineOutwardId(receiptTicketId, line.line_no))
      : []
    const receiptLineId = receiptLineIds[0] ?? null
    const receiptSummaryId = receiptSummary && receiptTicketId && receiptSummary.products?.code
      ? receiptSummaryOutwardId(receiptTicketId, receiptSummary.products.code, receiptSummary.line_count)
      : null
    const poAllocation = item.purchase_bill_po_allocations?.allocation_status === 'active'
      ? item.purchase_bill_po_allocations
      : null
    const poBuyId = poAllocation?.po_buys.doc_no ?? null
    const productId = item.products?.code ?? ''
    return {
      deductWeight: toNumber(item.deduct_weight),
      discount: toNumber(item.discount),
      displayName: item.display_name,
      grossWeight: toNumber(item.gross_weight),
      lineNo: item.line_no,
      lotNo: item.lot_no,
      note: item.note,
      poBuyId,
      price: toNumber(item.price),
      productId,
      qty: toNumber(item.qty),
      receiptLineId,
      receiptLineIds,
      receiptSummaryId,
      receiptTicketDocNo,
      receiptTicketId,
      salesPrice: toNumber(item.sales_price),
    }
  })
  const editForm: PurchaseBillFormValues = {
    advancePaymentId: activeAdvanceAllocation?.supplier_advance_payments.doc_no ?? null,
    branchId: bill.branches?.code ?? '',
    discountTotal: toNumber(bill.discount_total ?? bill.discount),
    hasVat: Boolean(bill.has_vat),
    items: editItems,
    note: bill.note ?? bill.notes ?? null,
    notes: bill.notes ?? bill.note ?? null,
    poBuyId: editItems.find((item) => item.poBuyId)?.poBuyId ?? null,
    purchaseChannelId: bill.purchase_channel_id?.toString() ?? null,
    purchaseSource: bill.purchase_source === 'PO_RECEIPT' || bill.purchase_source === 'MIXED' ? bill.purchase_source : 'SPOT_BUY',
    receiptTicketId: editItems.find((item) => item.receiptTicketId)?.receiptTicketId ?? null,
    refNo: bill.ref_no ?? null,
    salesId: bill.sales_id?.toString() ?? null,
    supplierId: bill.suppliers?.code ?? '',
    transactionMode: bill.transaction_mode === 'TRADING' ? 'TRADING' : 'STOCK',
    vatInvoiceDate: bill.vat_invoice_date ? toDateOnly(bill.vat_invoice_date) : null,
    vatInvoiceNo: bill.vat_invoice_no ?? null,
    vatInvoiceReceived: Boolean(bill.vat_invoice_received),
    vatType: bill.vat_type === 'EXCLUDE' || bill.vat_type === 'INCLUDE' ? bill.vat_type : 'NONE',
    warehouseId: bill.warehouses?.code ?? null,
  }

  return {
    advanceAllocatedAmount: toNumber(activeAdvanceAllocation?.allocated_total_amount ?? activeAdvanceAllocation?.allocated_amount),
    advanceConsumedAmount: toNumber(activeAdvanceAllocation?.allocated_amount),
    advanceAllocatedSubtotalAmount: toNumber(activeAdvanceAllocation?.allocated_subtotal_amount),
    advanceAllocatedVatAmount: toNumber(activeAdvanceAllocation?.allocated_vat_amount),
    advancePaymentDocNo: activeAdvanceAllocation?.supplier_advance_payments.doc_no ?? '',
    advancePaymentInvoiceNo: activeAdvanceAllocation?.supplier_advance_payments.invoice_no ?? '',
    advancePaymentVatType: activeAdvanceAllocation?.supplier_advance_payments.vat_type ?? 'NONE',
    advancePaymentVatTypeLabel: supplierAdvanceVatTypeLabel(activeAdvanceAllocation?.supplier_advance_payments.vat_type),
    allocationRows,
    editForm,
    branchId: bill.branches?.code ?? '',
    branchName: bill.branches?.name ?? '-',
    createdBy: actorDisplayName(bill.created_by ?? '-', actorDisplayNames),
    date: bill.date ? toDateOnly(bill.date) : '-',
    discount: toNumber(bill.discount_total ?? bill.discount),
    docNo: bill.doc_no,
    hasVat: Boolean(bill.has_vat),
    licensePlate: bill.license_plate ?? receiptVehicleNo,
    note: bill.note ?? bill.notes ?? '',
    paidAmount: toNumber(bill.paid_amount),
    payableBalance: toNumber(bill.payable_balance),
    productSummaries,
    receiptDocNos,
    status: requirePurchaseBillStatus(bill.status, bill.doc_no),
    statusLabel: purchaseBillStatusLabel(bill.status),
    subtotal: toNumber(bill.subtotal),
    supplierAddress: bill.supplier_address_snapshot ?? '-',
    supplierCode: bill.suppliers?.code ?? '-',
    supplierTaxId: bill.supplier_tax_id_snapshot ?? '-',
    supplierName: bill.supplier_name_snapshot ?? '-',
    timeline,
    totalAmount: toNumber(bill.total_amount),
    transactionMode: bill.transaction_mode ?? 'STOCK',
    updatedAt: bill.updated_at?.toISOString() ?? '',
    vatAmount: toNumber(bill.vat_amount),
    vatInvoiceDate: bill.vat_invoice_date ? toDateOnly(bill.vat_invoice_date) : '-',
    vatInvoiceNo: bill.vat_invoice_no ?? '-',
    vatInvoiceReceived: Boolean(bill.vat_invoice_received),
    vatRatePercent: toNumber(bill.vat_rate_percent) ?? 7,
    vatType: bill.vat_type ?? 'NONE',
    warehouseName: bill.warehouses?.name ?? '-',
    refNo: bill.ref_no ?? '-',
    salesName: bill.supplier_sales_rep_snapshot ?? '-',
    supplierBankAccounts: (bill.suppliers?.supplier_bank_accounts ?? []).map((account) => ({
      accountName: account.account_name ?? '',
      accountNo: account.account_no ?? '',
      bankName: account.bank_names?.name ?? '',
      branchCode: account.branch_code ?? '',
      code: account.code,
      isPrimary: Boolean(account.is_primary),
      paymentMethod: account.payment_method ?? 'เงินโอน',
    })),
  }
}
