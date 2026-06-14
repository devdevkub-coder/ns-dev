import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireBusinessCode } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type PurchaseItem = {
  amount?: number | string
  netAmount?: number | string
  netWeight?: number | string
  productCode?: string
  productName?: string
  qty?: number | string
  total?: number | string
  totalAmount?: number | string
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function itemTotals(items: unknown): { amount: number; qty: number } {
  if (!Array.isArray(items)) return { amount: 0, qty: 0 }
  let amount = 0
  let qty = 0
  items
    .filter((item): item is PurchaseItem => typeof item === 'object' && item !== null)
    .forEach((item) => {
      amount += jsonNumber(item.netAmount ?? item.amount ?? item.totalAmount ?? item.total)
      qty += jsonNumber(item.netWeight ?? item.qty)
    })
  return { amount, qty }
}

function itemProductName(item: PurchaseItem) {
  return item.productName ?? item.productCode ?? 'ไม่ระบุสินค้า'
}

function inYearMonth(date: Date, year: string | null, month: string | null) {
  const value = toDateOnly(date)
  if (year && value.slice(0, 4) !== year) return false
  if (month && value.slice(5, 7) !== month.padStart(2, '0')) return false
  return true
}

function yearMonthDateWhere(year: string, month: string | null) {
  const normalizedMonth = month?.padStart(2, '0')
  const from = new Date(`${year}-${normalizedMonth ?? '01'}-01T00:00:00.000Z`)
  const to = normalizedMonth
    ? new Date(Date.UTC(Number(year), Number(normalizedMonth), 0, 23, 59, 59, 999))
    : new Date(`${year}-12-31T23:59:59.999Z`)
  return { gte: from, lte: to }
}

function buildWorkbook(rows: Array<Record<string, string | number>>, sheetName: string) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')

    const url = new URL(request.url)
    const year = url.searchParams.get('year') || String(new Date().getFullYear())
    const month = url.searchParams.get('month')
    const supplierId = url.searchParams.get('supplierId')
    const detailId = url.searchParams.get('detailId')
    const search = url.searchParams.get('q')?.trim().toLowerCase()
    const supplier = supplierId ? await findActiveSupplierReferenceByCodeOrId(supplierId) : null
    const detailSupplier = detailId ? await findActiveSupplierReferenceByCodeOrId(detailId) : null

    const [suppliers, bills, payments, weightTickets, gradeAdjustments] = await Promise.all([
      prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], where: { active: { not: false } } }),
      prisma.purchase_bills.findMany({
        include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } } },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: { status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] }, ...(supplier ? { supplier_id: supplier.id } : {}) },
      }),
      prisma.payments.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' }, ...(supplier ? { supplier_id: supplier.id } : {}) },
      }),
      prisma.weight_tickets.findMany({
        include: { weight_ticket_lines: true, weight_ticket_product_summaries: true },
        orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: {
          cancelled_at: null,
          doc_type: 'WTI',
          document_date: yearMonthDateWhere(year, month),
          ...(supplier ? { supplier_id: supplier.id } : {}),
        },
      }),
      prisma.grade_adjustments.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { date: yearMonthDateWhere(year, month), reversed_at: null, status: { not: 'cancelled' } },
      }),
    ])

    const supplierRows = suppliers.map((supplier) => {
      const supplierBills = bills.filter((bill) => bill.supplier_id === supplier.id && inYearMonth(bill.date, year, month))
      const supplierPayments = payments.filter((payment) => payment.supplier_id === supplier.id && inYearMonth(payment.date, year, month))
      const supplierTickets = weightTickets.filter((ticket) => ticket.supplier_id === supplier.id && inYearMonth(ticket.document_date, year, month))
      const ticketTotals = supplierTickets.reduce((sum, ticket) => {
        const summaryNet = ticket.weight_ticket_product_summaries.reduce((total, summary) => total + toNumber(summary.net_weight), 0)
        const summaryBilled = ticket.weight_ticket_product_summaries.reduce((total, summary) => total + toNumber(summary.billed_weight), 0)
        return {
          billedWeight: sum.billedWeight + summaryBilled,
          deductWeight: sum.deductWeight + toNumber(ticket.deduct_weight),
          grossWeight: sum.grossWeight + toNumber(ticket.gross_weight),
          netWeight: sum.netWeight + (summaryNet || toNumber(ticket.net_weight)),
        }
      }, { billedWeight: 0, deductWeight: 0, grossWeight: 0, netWeight: 0 })
      const supplierProductIds = new Set(supplierTickets.flatMap((ticket) => ticket.weight_ticket_product_summaries.map((summary) => String(summary.product_id))))
      const gradeAdjustmentCount = gradeAdjustments.filter((row) => [row.product_id, row.source_product_id, row.target_product_id].some((id) => id != null && supplierProductIds.has(String(id)))).length
      const purchase = supplierBills.reduce<{ amount: number; payable: number; qty: number }>((sum, bill) => {
        const item = itemTotals(purchaseBillItemRows(bill))
        const amount = item.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        return {
          amount: sum.amount + amount,
          payable: sum.payable + toNumber(bill.payable_balance),
          qty: sum.qty + item.qty,
        }
      }, { amount: 0, payable: 0, qty: 0 })
      const paidAmount = supplierPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)

      return {
        avgBuy: purchase.qty > 0 ? purchase.amount / purchase.qty : 0,
        billCount: supplierBills.length,
        code: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        deliveryCompletionPct: ticketTotals.netWeight > 0 ? (ticketTotals.billedWeight / ticketTotals.netWeight) * 100 : 0,
        deductionPct: ticketTotals.grossWeight > 0 ? (ticketTotals.deductWeight / ticketTotals.grossWeight) * 100 : 0,
        gradeAdjustmentCount,
        id: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        paidAmount,
        paidPct: paidAmount + purchase.payable > 0 ? (paidAmount / (paidAmount + purchase.payable)) * 100 : 0,
        payable: purchase.payable,
        paymentCount: supplierPayments.length,
        purchaseAmount: purchase.amount,
        qty: purchase.qty,
        supplierName: supplier.name,
        wtiCount: supplierTickets.length,
      }
    }).filter((row) => row.billCount > 0 || row.qty > 0 || row.payable > 0 || row.wtiCount > 0 || row.gradeAdjustmentCount > 0)
      .filter((row) => !search || `${row.code} ${row.supplierName}`.toLowerCase().includes(search))
      .sort((left, right) => right.purchaseAmount - left.purchaseAmount)

    const productMap = new Map<string, { amount: number; bills: Set<string>; productName: string; qty: number; suppliers: Set<bigint> }>()
    bills
      .filter((bill) => inYearMonth(bill.date, year, month))
      .forEach((bill) => {
        purchaseBillItemRows(bill)
          .forEach((item) => {
            const productName = itemProductName(item)
            const current = productMap.get(productName) ?? { amount: 0, bills: new Set<string>(), productName, qty: 0, suppliers: new Set<bigint>() }
            current.amount += jsonNumber(item.netAmount ?? item.amount ?? item.totalAmount ?? item.total)
            current.qty += jsonNumber(item.netWeight ?? item.qty)
            current.bills.add(bill.doc_no)
            if (bill.supplier_id != null) current.suppliers.add(bill.supplier_id)
            productMap.set(productName, current)
          })
      })
    const byProduct = Array.from(productMap.values())
      .map((row) => ({
        amount: row.amount,
        avgBuy: row.qty > 0 ? row.amount / row.qty : 0,
        billCount: row.bills.size,
        productName: row.productName,
        qty: row.qty,
        suppliers: row.suppliers.size,
      }))
      .sort((left, right) => right.amount - left.amount)

    const monthly = Array.from({ length: 12 }, (_, index) => {
      const monthKey = String(index + 1).padStart(2, '0')
      const monthBills = bills.filter((bill) => inYearMonth(bill.date, year, monthKey))
      return monthBills.reduce<{ amount: number; month: string; qty: number }>((sum, bill) => {
        const item = itemTotals(purchaseBillItemRows(bill))
        const amount = item.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        return {
          amount: sum.amount + amount,
          month: monthKey,
          qty: sum.qty + item.qty,
        }
      }, { amount: 0, month: monthKey, qty: 0 })
    })

    const detail = detailSupplier ? (() => {
      const detailBills = bills.filter((bill) => bill.supplier_id === detailSupplier.id && inYearMonth(bill.date, year, month))
      const detailPayments = payments.filter((payment) => payment.supplier_id === detailSupplier.id && inYearMonth(payment.date, year, month))
      const detailTickets = weightTickets.filter((ticket) => ticket.supplier_id === detailSupplier.id && inYearMonth(ticket.document_date, year, month))
      const detailYearBills = bills.filter((bill) => bill.supplier_id === detailSupplier.id && inYearMonth(bill.date, year, null))
      const detailYearPayments = payments.filter((payment) => payment.supplier_id === detailSupplier.id && inYearMonth(payment.date, year, null))
      const detailProductMap = new Map<string, { amount: number; bills: Set<string>; productName: string; qty: number }>()
      const detailProductIds = new Set(detailTickets.flatMap((ticket) => ticket.weight_ticket_product_summaries.map((summary) => String(summary.product_id))))
      const detailGradeAdjustments = gradeAdjustments.filter((row) => [row.product_id, row.source_product_id, row.target_product_id].some((id) => id != null && detailProductIds.has(String(id)))).slice(0, 30)
      const detailTicketTotals = detailTickets.reduce((sum, ticket) => ({
        billedWeight: sum.billedWeight + ticket.weight_ticket_product_summaries.reduce((total, summary) => total + toNumber(summary.billed_weight), 0),
        deductWeight: sum.deductWeight + toNumber(ticket.deduct_weight),
        grossWeight: sum.grossWeight + toNumber(ticket.gross_weight),
        netWeight: sum.netWeight + (ticket.weight_ticket_product_summaries.reduce((total, summary) => total + toNumber(summary.net_weight), 0) || toNumber(ticket.net_weight)),
      }), { billedWeight: 0, deductWeight: 0, grossWeight: 0, netWeight: 0 })

      detailBills.forEach((bill) => {
        purchaseBillItemRows(bill).forEach((item) => {
          const productName = itemProductName(item)
          const current = detailProductMap.get(productName) ?? { amount: 0, bills: new Set<string>(), productName, qty: 0 }
          current.amount += jsonNumber(item.netAmount ?? item.amount ?? item.totalAmount ?? item.total)
          current.qty += jsonNumber(item.netWeight ?? item.qty)
          current.bills.add(bill.doc_no)
          detailProductMap.set(productName, current)
        })
      })

      return {
        bills: detailBills.slice(0, 50).map((bill) => {
          const item = itemTotals(purchaseBillItemRows(bill))
          const amount = item.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
          return {
            amount,
            avgBuy: item.qty > 0 ? amount / item.qty : 0,
            date: toDateOnly(bill.date),
            docNo: bill.doc_no,
            href: `/purchase/bills/${encodeURIComponent(bill.doc_no)}`,
            paidAmount: toNumber(bill.paid_amount),
            payable: toNumber(bill.payable_balance),
            qty: item.qty,
            status: bill.status ?? '-',
          }
        }),
        payments: detailPayments.slice(0, 50).map((payment) => ({
          amount: toNumber(payment.amount),
          date: toDateOnly(payment.date),
          docNo: payment.doc_no,
          method: payment.method ?? '-',
          netAmount: toNumber(payment.net_amount),
          status: payment.status ?? '-',
        })),
        monthly: Array.from({ length: 12 }, (_, index) => {
          const monthKey = String(index + 1).padStart(2, '0')
          const monthBills = detailYearBills.filter((bill) => inYearMonth(bill.date, year, monthKey))
          const monthPayments = detailYearPayments.filter((payment) => inYearMonth(payment.date, year, monthKey))
          const paidAmount = monthPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
          return monthBills.reduce<{
            billCount: number
            month: string
            paidAmount: number
            payable: number
            paymentCount: number
            purchaseAmount: number
            qty: number
          }>((sum, bill) => {
            const item = itemTotals(purchaseBillItemRows(bill))
            const amount = item.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
            return {
              billCount: sum.billCount + 1,
              month: monthKey,
              paidAmount,
              payable: sum.payable + toNumber(bill.payable_balance),
              paymentCount: monthPayments.length,
              purchaseAmount: sum.purchaseAmount + amount,
              qty: sum.qty + item.qty,
            }
          }, {
            billCount: 0,
            month: monthKey,
            paidAmount,
            payable: 0,
            paymentCount: monthPayments.length,
            purchaseAmount: 0,
            qty: 0,
          })
        }),
        qualitySignals: {
          deliveryCompletionPct: detailTicketTotals.netWeight > 0 ? (detailTicketTotals.billedWeight / detailTicketTotals.netWeight) * 100 : 0,
          deductionPct: detailTicketTotals.grossWeight > 0 ? (detailTicketTotals.deductWeight / detailTicketTotals.grossWeight) * 100 : 0,
          gradeAdjustmentCount: detailGradeAdjustments.length,
          paymentReliabilityPct: detailBills.reduce((sum, bill) => sum + toNumber(bill.payable_balance), 0) + detailPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0) > 0
            ? detailPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0) / (detailPayments.reduce((sum, payment) => sum + toNumber(payment.amount), 0) + detailBills.reduce((sum, bill) => sum + toNumber(bill.payable_balance), 0)) * 100
            : 0,
          returnSignalStatus: 'ยังไม่มี purchase return source table ใน schema ปัจจุบัน',
          wtiCount: detailTickets.length,
        },
        gradeAdjustments: detailGradeAdjustments.map((row) => ({
          date: toDateOnly(row.date),
          docNo: row.doc_no,
          qtyDiff: toNumber(row.qty_diff),
          reason: row.reason ?? row.notes ?? '-',
          status: row.status,
          valueDiff: toNumber(row.value_diff),
        })),
        products: Array.from(detailProductMap.values()).map((row) => ({
          amount: row.amount,
          avgBuy: row.qty > 0 ? row.amount / row.qty : 0,
          billCount: row.bills.size,
          productName: row.productName,
          qty: row.qty,
        })).sort((left, right) => right.amount - left.amount).slice(0, 30),
        supplier: { code: detailSupplier.code, id: detailSupplier.code, name: detailSupplier.name },
        weightTickets: detailTickets.slice(0, 50).map((ticket) => ({
          billedWeight: ticket.weight_ticket_product_summaries.reduce((sum, summary) => sum + toNumber(summary.billed_weight), 0),
          date: toDateOnly(ticket.document_date),
          deductWeight: toNumber(ticket.deduct_weight),
          docNo: ticket.doc_no,
          grossWeight: toNumber(ticket.gross_weight),
          netWeight: ticket.weight_ticket_product_summaries.reduce((sum, summary) => sum + toNumber(summary.net_weight), 0) || toNumber(ticket.net_weight),
          remainingWeight: ticket.weight_ticket_product_summaries.reduce((sum, summary) => sum + toNumber(summary.remaining_weight), 0),
          status: ticket.status,
        })),
      }
    })() : null

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(supplierRows.map((row) => ({
        AvgBuy: row.avgBuy,
        Bills: row.billCount,
        Code: row.code,
        DeliveryCompletionPct: row.deliveryCompletionPct,
        DeductionPct: row.deductionPct,
        GradeAdjustments: row.gradeAdjustmentCount,
        Paid: row.paidAmount,
        PaidPct: row.paidPct,
        Payable: row.payable,
        PurchaseAmount: row.purchaseAmount,
        Qty: row.qty,
        Supplier: row.supplierName,
        WTI: row.wtiCount,
      })), 'Supplier Tracking'), `tracking_supplier_${year}${month ? `_${month}` : ''}.xlsx`)
    }

    return NextResponse.json({
      byProduct,
      detail,
      filters: {
        suppliers: suppliers.map((row) => ({ active: row.active, code: row.code, id: requireBusinessCode(row.code, `ผู้ขาย ${row.id}`), name: row.name })),
      },
      monthly,
      rows: supplierRows,
      summary: {
        paidAmount: supplierRows.reduce((sum, row) => sum + row.paidAmount, 0),
        payable: supplierRows.reduce((sum, row) => sum + row.payable, 0),
        purchaseAmount: supplierRows.reduce((sum, row) => sum + row.purchaseAmount, 0),
        qty: supplierRows.reduce((sum, row) => sum + row.qty, 0),
        suppliers: supplierRows.length,
      },
      year,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Supplier Tracking ไม่ได้', 500)
  }
}
