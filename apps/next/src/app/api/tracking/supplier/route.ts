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

    const [suppliers, bills, payments] = await Promise.all([
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
    ])

    const supplierRows = suppliers.map((supplier) => {
      const supplierBills = bills.filter((bill) => bill.supplier_id === supplier.id && inYearMonth(bill.date, year, month))
      const supplierPayments = payments.filter((payment) => payment.supplier_id === supplier.id && inYearMonth(payment.date, year, month))
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
        id: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
        paidAmount,
        paidPct: paidAmount + purchase.payable > 0 ? (paidAmount / (paidAmount + purchase.payable)) * 100 : 0,
        payable: purchase.payable,
        paymentCount: supplierPayments.length,
        purchaseAmount: purchase.amount,
        qty: purchase.qty,
        supplierName: supplier.name,
      }
    }).filter((row) => row.billCount > 0 || row.qty > 0 || row.payable > 0)
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
      const detailProductMap = new Map<string, { amount: number; bills: Set<string>; productName: string; qty: number }>()

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
        products: Array.from(detailProductMap.values()).map((row) => ({
          amount: row.amount,
          avgBuy: row.qty > 0 ? row.amount / row.qty : 0,
          billCount: row.bills.size,
          productName: row.productName,
          qty: row.qty,
        })).sort((left, right) => right.amount - left.amount).slice(0, 30),
        supplier: { code: detailSupplier.code, id: detailSupplier.code, name: detailSupplier.name },
      }
    })() : null

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(supplierRows.map((row) => ({
        AvgBuy: row.avgBuy,
        Bills: row.billCount,
        Code: row.code,
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
