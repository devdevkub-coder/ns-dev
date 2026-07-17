import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { PURCHASE_BILL_CANCELLED_STATUSES } from '@/lib/purchase-bill-status'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getAllowedBranchIds } from '@/lib/server/branch-scope'
import { listActiveSuppliers, searchActiveSuppliers } from '@/lib/server/reference-master-cache'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { addToFinancialAgingBucketTotals, computeFinancialDueAging, emptyFinancialAgingBucketTotals, financialAgingBuckets } from '@/lib/server/document-aging'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows, purchaseBillItemQty } from '@/lib/server/purchase-bill-items'
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

type NumericLike = Parameters<typeof toNumber>[0]

function paymentSettlementAmount(payment: { amount: NumericLike; discount?: NumericLike; withholding_tax?: NumericLike }) {
  return toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
}

function normalizedDateParam(value: string | null) {
  const trimmed = value?.trim()
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function inYearMonth(date: Date, year: string | null, month: string | null, dateFrom?: string | null, dateTo?: string | null) {
  const value = toDateOnly(date)
  if (year && value.slice(0, 4) !== year) return false
  if (month && value.slice(5, 7) !== month.padStart(2, '0')) return false
  if (dateFrom && value < dateFrom) return false
  if (dateTo && value > dateTo) return false
  return true
}

function yearMonthDateWhere(year: string, month: string | null, dateFrom?: string | null, dateTo?: string | null) {
  const normalizedMonth = month?.padStart(2, '0')
  const from = dateFrom
    ? new Date(`${dateFrom}T00:00:00.000Z`)
    : new Date(`${year}-${normalizedMonth ?? '01'}-01T00:00:00.000Z`)
  const to = dateTo
    ? new Date(`${dateTo}T23:59:59.999Z`)
    : normalizedMonth
    ? new Date(Date.UTC(Number(year), Number(normalizedMonth), 0, 23, 59, 59, 999))
    : new Date(`${year}-12-31T23:59:59.999Z`)
  return { gte: from, lte: to }
}

function branchScopedPurchaseBillWhere(allowedBranchIds: bigint[] | null): Prisma.purchase_billsWhereInput {
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

function branchScopedPaymentWhere(allowedBranchIds: bigint[] | null): Prisma.paymentsWhereInput {
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

function branchScopedWeightTicketWhere(allowedBranchIds: bigint[] | null): Prisma.weight_ticketsWhereInput {
  if (allowedBranchIds === null) return {}
  return { branch_id: { in: allowedBranchIds } }
}

function branchScopedGradeAdjustmentWhere(allowedBranchIds: bigint[] | null): Prisma.grade_adjustmentsWhereInput {
  if (allowedBranchIds === null) return {}
  return {
    OR: [
      { branch_id: null },
      { branch_id: { in: allowedBranchIds } },
    ],
  }
}

async function buildWorkbook(rows: Array<Record<string, string | number>>, sheetName: string) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

function purchaseItemProductOptionKey(item: any) {
  return item.product_code || item.product_name || (item.product_id ? String(item.product_id) : '')
}

function purchaseItemFilterMatches(item: any, productCategory: string | null, productId: string | null) {
  if (productCategory && item.products?.metal_group !== productCategory) return false
  if (productId && purchaseItemProductOptionKey(item) !== productId) return false
  return true
}

function ticketSummaryFilterMatches(summary: any, productCategory: string | null, productId: string | null) {
  if (productCategory && summary.products?.metal_group !== productCategory) return false
  if (productId && (summary.product_id ? String(summary.product_id) : '') !== productId) return false
  return true
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')
    const allowedBranchIds = await getAllowedBranchIds(context)

    const url = new URL(request.url)
    const year = url.searchParams.get('year') || String(new Date().getFullYear())
    const month = url.searchParams.get('month')
    const dateFrom = normalizedDateParam(url.searchParams.get('dateFrom') ?? url.searchParams.get('from'))
    const dateTo = normalizedDateParam(url.searchParams.get('dateTo') ?? url.searchParams.get('to'))
    const supplierId = url.searchParams.get('supplierId')
    const detailId = url.searchParams.get('detailId')
    const productCategory = url.searchParams.get('productCategory')?.trim() || null
    const productId = url.searchParams.get('productId')?.trim() || null
    const search = url.searchParams.get('q')?.trim().toLowerCase()
    const supplier = supplierId ? await findActiveSupplierReferenceByCodeOrId(supplierId) : null
    const detailSupplier = detailId ? await findActiveSupplierReferenceByCodeOrId(detailId) : null
    const asOfDate = new Date()

    const [suppliers, bills, payments, weightTickets, gradeAdjustments] = await Promise.all([
      (async () => {
        const rows = supplier
          ? await listActiveSuppliers()
          : search
          ? await searchActiveSuppliers(search)
          : await listActiveSuppliers()
        return supplier ? rows.filter((row) => row.id === supplier.id) : rows
      })(),
      prisma.purchase_bills.findMany({
        include: {
          purchase_bill_items: {
            include: {
              products: {
                select: {
                  metal_group: true,
                },
              },
            },
            orderBy: { line_no: 'asc' },
            where: { item_status: 'active' },
          },
        },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: { ...branchScopedPurchaseBillWhere(allowedBranchIds), status: { notIn: [...PURCHASE_BILL_CANCELLED_STATUSES] }, ...(supplier ? { supplier_id: supplier.id } : {}) },
      }),
      prisma.payments.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { ...branchScopedPaymentWhere(allowedBranchIds), NOT: { status: 'cancelled' }, ...(supplier ? { supplier_id: supplier.id } : {}) },
      }),
      prisma.weight_tickets.findMany({
        select: {
          deduct_weight: true,
          doc_no: true,
          document_date: true,
          gross_weight: true,
          net_weight: true,
          status: true,
          supplier_id: true,
          weight_ticket_product_summaries: {
            select: {
              billed_weight: true,
              net_weight: true,
              product_id: true,
              product_name: true,
              remaining_weight: true,
              products: {
                select: {
                  metal_group: true,
                },
              },
            },
          },
        },
        orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: {
          ...branchScopedWeightTicketWhere(allowedBranchIds),
          cancelled_at: null,
          doc_type: 'WTI',
          document_date: yearMonthDateWhere(year, month, dateFrom, dateTo),
          ...(supplier ? { supplier_id: supplier.id } : {}),
        },
      }),
      prisma.grade_adjustments.findMany({
        select: {
          date: true,
          doc_no: true,
          notes: true,
          product_id: true,
          qty_diff: true,
          reason: true,
          source_product_id: true,
          status: true,
          target_product_id: true,
          value_diff: true,
        },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: { ...branchScopedGradeAdjustmentWhere(allowedBranchIds), date: yearMonthDateWhere(year, month, dateFrom, dateTo), reversed_at: null, status: { not: 'cancelled' } },
      }),
    ])

    // Build filter lists for categories & products
    const filterCategorySet = new Set<string>()
    const filterProductMap = new Map<string, { category: string; code: string; id: string; name: string }>()

    bills.forEach((bill) => {
      bill.purchase_bill_items.forEach((item) => {
        const metalGroup = item.products?.metal_group
        if (metalGroup) filterCategorySet.add(metalGroup)
        const id = item.product_code || item.product_name || (item.product_id ? String(item.product_id) : '')
        if (id && !filterProductMap.has(id)) {
          filterProductMap.set(id, {
            category: metalGroup ?? '',
            code: item.product_code ?? '',
            id,
            name: item.product_name ?? '',
          })
        }
      })
    })

    weightTickets.forEach((ticket) => {
      ticket.weight_ticket_product_summaries.forEach((summary) => {
        const metalGroup = summary.products?.metal_group
        if (metalGroup) filterCategorySet.add(metalGroup)
        const id = summary.product_id ? String(summary.product_id) : ''
        if (id && !filterProductMap.has(id)) {
          filterProductMap.set(id, {
            category: metalGroup ?? '',
            code: '',
            id,
            name: summary.product_name ?? '',
          })
        }
      })
    })

    const productFilters = {
      productCategories: Array.from(filterCategorySet).sort((left, right) => left.localeCompare(right, 'th')),
      products: Array.from(filterProductMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'th')),
    }

    const hasProductFilter = Boolean(productCategory || productId)

    const scopedBills = bills.filter((bill) => {
      const matchingItems = bill.purchase_bill_items.filter((item) => purchaseItemFilterMatches(item, productCategory, productId))
      return !hasProductFilter || matchingItems.length > 0
    })

    const scopedWeightTickets = weightTickets.filter((ticket) => {
      const matchingSummaries = ticket.weight_ticket_product_summaries.filter((summary) => ticketSummaryFilterMatches(summary, productCategory, productId))
      return !hasProductFilter || matchingSummaries.length > 0
    })

    const visibleSupplierIds = new Set([
      ...scopedBills.map((row) => row.supplier_id),
      ...scopedWeightTickets.map((row) => row.supplier_id),
      ...(hasProductFilter ? [] : payments.map((row) => row.supplier_id)),
    ].filter((id): id is bigint => id != null))
    const visibleSuppliers = suppliers.filter((supplier) => visibleSupplierIds.has(supplier.id))

    const supplierRows = visibleSuppliers.map((supplier) => {
      const supplierBills = scopedBills.filter((bill) => bill.supplier_id === supplier.id && inYearMonth(bill.date, year, month, dateFrom, dateTo))
      const supplierPayments = payments.filter((payment) => payment.supplier_id === supplier.id && inYearMonth(payment.date, year, month, dateFrom, dateTo))
      const supplierTickets = scopedWeightTickets.filter((ticket) => ticket.supplier_id === supplier.id && inYearMonth(ticket.document_date, year, month, dateFrom, dateTo))
      
      const ticketTotals = supplierTickets.reduce((sum, ticket) => {
        const matchingSummaries = ticket.weight_ticket_product_summaries.filter((summary) => ticketSummaryFilterMatches(summary, productCategory, productId))
        const summaryNet = matchingSummaries.reduce((total, summary) => total + toNumber(summary.net_weight), 0)
        const summaryBilled = matchingSummaries.reduce((total, summary) => total + toNumber(summary.billed_weight), 0)
        return {
          billedWeight: sum.billedWeight + summaryBilled,
          deductWeight: sum.deductWeight + (hasProductFilter ? 0 : toNumber(ticket.deduct_weight)),
          grossWeight: sum.grossWeight + (hasProductFilter ? 0 : toNumber(ticket.gross_weight)),
          netWeight: sum.netWeight + (summaryNet || (hasProductFilter ? 0 : toNumber(ticket.net_weight))),
        }
      }, { billedWeight: 0, deductWeight: 0, grossWeight: 0, netWeight: 0 })

      const supplierProductIds = new Set(supplierTickets.flatMap((ticket) => ticket.weight_ticket_product_summaries.map((summary) => String(summary.product_id))))
      const gradeAdjustmentCount = gradeAdjustments.filter((row) => [row.product_id, row.source_product_id, row.target_product_id].some((id) => id != null && supplierProductIds.has(String(id)))).length
      
      const purchase = supplierBills.reduce<{ agingBuckets: ReturnType<typeof emptyFinancialAgingBucketTotals>; amount: number; oldestApAgeDays: number; overdueApAmount: number; overdueApBillCount: number; payable: number; qty: number }>((sum, bill) => {
        const matchingItems = bill.purchase_bill_items.filter((item) => purchaseItemFilterMatches(item, productCategory, productId))
        const itemQty = matchingItems.reduce((acc, item) => acc + toNumber(item.qty), 0)
        const itemAmount = matchingItems.reduce((acc, item) => acc + toNumber(item.amount), 0)
        const amount = hasProductFilter ? itemAmount : (itemAmount || toNumber(bill.subtotal) || toNumber(bill.total_amount))
        const qty = hasProductFilter ? itemQty : (itemQty || purchaseBillItemQty(bill))
        const payable = toNumber(bill.payable_balance)
        const aging = computeFinancialDueAging({ asOfDate, documentDate: bill.date })
        if (payable > 0) addToFinancialAgingBucketTotals(sum.agingBuckets, aging.ageBucket, payable)
        return {
          agingBuckets: sum.agingBuckets,
          amount: sum.amount + amount,
          oldestApAgeDays: payable > 0 ? Math.max(sum.oldestApAgeDays, aging.ageDays) : sum.oldestApAgeDays,
          overdueApAmount: sum.overdueApAmount + (payable > 0 && aging.ageDays > 0 ? payable : 0),
          overdueApBillCount: sum.overdueApBillCount + (payable > 0 && aging.ageDays > 0 ? 1 : 0),
          payable: sum.payable + (hasProductFilter ? 0 : payable),
          qty: sum.qty + qty,
        }
      }, { agingBuckets: emptyFinancialAgingBucketTotals(), amount: 0, oldestApAgeDays: 0, overdueApAmount: 0, overdueApBillCount: 0, payable: 0, qty: 0 })
      
      const paidAmount = supplierPayments.reduce((sum, payment) => sum + paymentSettlementAmount(payment), 0)

      const supplierYearBills = scopedBills.filter((bill) => bill.supplier_id === supplier.id && inYearMonth(bill.date, year, null, dateFrom, dateTo))
      const monthlyData = Array.from({ length: 12 }, (_, index) => {
        const monthKey = String(index + 1).padStart(2, '0')
        const monthBills = supplierYearBills.filter((bill) => inYearMonth(bill.date, year, monthKey, dateFrom, dateTo))
        const qty = monthBills.reduce((sum, bill) => {
          const matchingItems = bill.purchase_bill_items.filter((item) => purchaseItemFilterMatches(item, productCategory, productId))
          const itemQty = matchingItems.reduce((acc, item) => acc + toNumber(item.qty), 0)
          return sum + (hasProductFilter ? itemQty : (itemQty || purchaseBillItemQty(bill)))
        }, 0)
        const purchaseAmount = monthBills.reduce((sum, bill) => {
          const matchingItems = bill.purchase_bill_items.filter((item) => purchaseItemFilterMatches(item, productCategory, productId))
          const itemAmount = matchingItems.reduce((acc, item) => acc + toNumber(item.amount), 0)
          return sum + (hasProductFilter ? itemAmount : (itemAmount || toNumber(bill.subtotal) || toNumber(bill.total_amount)))
        }, 0)
        return { qty, purchaseAmount }
      })


      return {
        agingBuckets: financialAgingBuckets.map((bucket) => ({ amount: purchase.agingBuckets[bucket].amount, bucket, count: purchase.agingBuckets[bucket].count })),
        avgBuy: purchase.qty > 0 ? purchase.amount / purchase.qty : 0,
        billCount: supplierBills.length,
        code: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        deliveryCompletionPct: ticketTotals.netWeight > 0 ? (ticketTotals.billedWeight / ticketTotals.netWeight) * 100 : 0,
        deductionPct: ticketTotals.grossWeight > 0 ? (ticketTotals.deductWeight / ticketTotals.grossWeight) * 100 : 0,
        gradeAdjustmentCount,
        id: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        oldestApAgeDays: purchase.oldestApAgeDays,
        overdueApAmount: purchase.overdueApAmount,
        overdueApBillCount: purchase.overdueApBillCount,
        paidAmount,
        paidPct: paidAmount + purchase.payable > 0 ? (paidAmount / (paidAmount + purchase.payable)) * 100 : 0,
        payable: purchase.payable,
        paymentCount: supplierPayments.length,
        purchaseAmount: purchase.amount,
        qty: purchase.qty,
        supplierName: supplier.name,
        wtiCount: supplierTickets.length,
        monthlyData,
      }
    }).filter((row) => row.billCount > 0 || row.qty > 0 || row.payable > 0 || row.wtiCount > 0 || row.gradeAdjustmentCount > 0)

      .filter((row) => !search || `${row.code} ${row.supplierName}`.toLowerCase().includes(search))
      .sort((left, right) => right.purchaseAmount - left.purchaseAmount)

    const productMap = new Map<string, { amount: number; bills: Set<string>; productName: string; qty: number; suppliers: Set<bigint> }>()
    bills
      .filter((bill) => inYearMonth(bill.date, year, month, dateFrom, dateTo))
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
      const monthBills = bills.filter((bill) => inYearMonth(bill.date, year, monthKey, dateFrom, dateTo))
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

    const detail = detailSupplier && visibleSupplierIds.has(detailSupplier.id) ? (() => {
      const detailBills = bills.filter((bill) => bill.supplier_id === detailSupplier.id && inYearMonth(bill.date, year, month, dateFrom, dateTo))
      const detailPayments = payments.filter((payment) => payment.supplier_id === detailSupplier.id && inYearMonth(payment.date, year, month, dateFrom, dateTo))
      const detailTickets = weightTickets.filter((ticket) => ticket.supplier_id === detailSupplier.id && inYearMonth(ticket.document_date, year, month, dateFrom, dateTo))
      const detailYearBills = bills.filter((bill) => bill.supplier_id === detailSupplier.id && inYearMonth(bill.date, year, null, dateFrom, dateTo))
      const detailYearPayments = payments.filter((payment) => payment.supplier_id === detailSupplier.id && inYearMonth(payment.date, year, null, dateFrom, dateTo))
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
          const aging = computeFinancialDueAging({ asOfDate, documentDate: bill.date })
          return {
            ageBucket: aging.ageBucket,
            ageDays: aging.ageDays,
            amount,
            avgBuy: item.qty > 0 ? amount / item.qty : 0,
            date: toDateOnly(bill.date),
            docNo: bill.doc_no,
            dueDate: aging.referenceDate,
            href: `/purchase/bills/${encodeURIComponent(bill.doc_no)}`,
            paidAmount: toNumber(bill.paid_amount),
            payable: toNumber(bill.payable_balance),
            qty: item.qty,
            referenceDateType: aging.referenceDateType,
            status: bill.status ?? '-',
          }
        }),
        payments: detailPayments.slice(0, 50).map((payment) => ({
          amount: toNumber(payment.amount),
          date: toDateOnly(payment.date),
          docNo: payment.doc_no,
          href: `/purchase/payments?tab=history&q=${encodeURIComponent(payment.doc_no)}`,
          method: payment.method ?? '-',
          netAmount: toNumber(payment.net_amount),
          status: payment.status ?? '-',
        })),
        monthly: Array.from({ length: 12 }, (_, index) => {
          const monthKey = String(index + 1).padStart(2, '0')
          const monthBills = detailYearBills.filter((bill) => inYearMonth(bill.date, year, monthKey, dateFrom, dateTo))
          const monthPayments = detailYearPayments.filter((payment) => inYearMonth(payment.date, year, monthKey, dateFrom, dateTo))
          const paidAmount = monthPayments.reduce((sum, payment) => sum + paymentSettlementAmount(payment), 0)
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
          agingBuckets: (() => {
            const bucketTotals = emptyFinancialAgingBucketTotals()
            detailBills.forEach((bill) => {
              const payable = toNumber(bill.payable_balance)
              if (payable <= 0) return
              const aging = computeFinancialDueAging({ asOfDate, documentDate: bill.date })
              addToFinancialAgingBucketTotals(bucketTotals, aging.ageBucket, payable)
            })
            return financialAgingBuckets.map((bucket) => ({ amount: bucketTotals[bucket].amount, bucket, count: bucketTotals[bucket].count }))
          })(),
          deliveryCompletionPct: detailTicketTotals.netWeight > 0 ? (detailTicketTotals.billedWeight / detailTicketTotals.netWeight) * 100 : 0,
          deductionPct: detailTicketTotals.grossWeight > 0 ? (detailTicketTotals.deductWeight / detailTicketTotals.grossWeight) * 100 : 0,
          gradeAdjustmentCount: detailGradeAdjustments.length,
          oldestApAgeDays: detailBills.reduce((oldest, bill) => {
            const payable = toNumber(bill.payable_balance)
            if (payable <= 0) return oldest
            return Math.max(oldest, computeFinancialDueAging({ asOfDate, documentDate: bill.date }).ageDays)
          }, 0),
          overdueApAmount: detailBills.reduce((sum, bill) => {
            const payable = toNumber(bill.payable_balance)
            if (payable <= 0) return sum
            const aging = computeFinancialDueAging({ asOfDate, documentDate: bill.date })
            return sum + (aging.ageDays > 0 ? payable : 0)
          }, 0),
          overdueApBillCount: detailBills.reduce((sum, bill) => {
            const payable = toNumber(bill.payable_balance)
            if (payable <= 0) return sum
            const aging = computeFinancialDueAging({ asOfDate, documentDate: bill.date })
            return sum + (aging.ageDays > 0 ? 1 : 0)
          }, 0),
          paymentReliabilityPct: detailBills.reduce((sum, bill) => sum + toNumber(bill.payable_balance), 0) + detailPayments.reduce((sum, payment) => sum + paymentSettlementAmount(payment), 0) > 0
            ? detailPayments.reduce((sum, payment) => sum + paymentSettlementAmount(payment), 0) / (detailPayments.reduce((sum, payment) => sum + paymentSettlementAmount(payment), 0) + detailBills.reduce((sum, bill) => sum + toNumber(bill.payable_balance), 0)) * 100
            : 0,
          returnSignalStatus: 'ยังไม่มี purchase return source table ใน schema ปัจจุบัน',
          wtiCount: detailTickets.length,
        },
        gradeAdjustments: detailGradeAdjustments.map((row) => ({
          date: toDateOnly(row.date),
          docNo: row.doc_no,
          href: `/stock/convert?q=${encodeURIComponent(row.doc_no)}`,
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
          href: `/daily/weight-ticket-list/${encodeURIComponent(ticket.doc_no)}`,
          netWeight: ticket.weight_ticket_product_summaries.reduce((sum, summary) => sum + toNumber(summary.net_weight), 0) || toNumber(ticket.net_weight),
          remainingWeight: ticket.weight_ticket_product_summaries.reduce((sum, summary) => sum + toNumber(summary.remaining_weight), 0),
          status: ticket.status,
        })),
      }
    })() : null

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(supplierRows.map((row) => ({
        AvgBuy: row.avgBuy,
        Bills: row.billCount,
        Code: row.code,
        OverdueApAmount: row.overdueApAmount,
        OverdueApBills: row.overdueApBillCount,
        Paid: row.paidAmount,
        PaidPct: row.paidPct,
        Payable: row.payable,
        PurchaseAmount: row.purchaseAmount,
        Qty: row.qty,
        Supplier: row.supplierName,
      })), 'Supplier Tracking'), `tracking_supplier_${year}${month ? `_${month}` : ''}.xlsx`)
    }

    return NextResponse.json({
      byProduct,
      detail,
      filters: {
        suppliers: visibleSuppliers.map((row) => ({ active: true, code: row.code, id: requireBusinessCode(row.code, `ผู้ขาย ${row.id}`), name: row.name })),
        productCategories: productFilters.productCategories,
        products: productFilters.products,
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
