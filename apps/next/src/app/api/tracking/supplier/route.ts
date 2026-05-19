import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
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

    const [suppliers, bills, payments] = await Promise.all([
      prisma.suppliers.findMany({ orderBy: [{ name: 'asc' }], where: { active: { not: false } } }),
      prisma.purchase_bills.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' } },
      }),
      prisma.payments.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' } },
      }),
    ])

    const supplierRows = suppliers.map((supplier) => {
      const supplierBills = bills.filter((bill) => bill.supplier_id === supplier.id && inYearMonth(bill.date, year, month))
      const supplierPayments = payments.filter((payment) => payment.supplier_id === supplier.id && inYearMonth(payment.date, year, month))
      const purchase = supplierBills.reduce<{ amount: number; payable: number; qty: number }>((sum, bill) => {
        const item = itemTotals(bill.items)
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
        code: supplier.code ?? '',
        id: supplier.id,
        paidAmount,
        paidPct: paidAmount + purchase.payable > 0 ? (paidAmount / (paidAmount + purchase.payable)) * 100 : 0,
        payable: purchase.payable,
        paymentCount: supplierPayments.length,
        purchaseAmount: purchase.amount,
        qty: purchase.qty,
        supplierName: supplier.name,
      }
    }).filter((row) => row.billCount > 0 || row.qty > 0 || row.payable > 0).sort((left, right) => right.purchaseAmount - left.purchaseAmount)

    const productMap = new Map<string, { amount: number; bills: Set<string>; productName: string; qty: number; suppliers: Set<string> }>()
    bills
      .filter((bill) => inYearMonth(bill.date, year, month))
      .forEach((bill) => {
        if (!Array.isArray(bill.items)) return
        bill.items
          .filter((item): item is PurchaseItem => typeof item === 'object' && item !== null)
          .forEach((item) => {
            const productName = itemProductName(item)
            const current = productMap.get(productName) ?? { amount: 0, bills: new Set<string>(), productName, qty: 0, suppliers: new Set<string>() }
            current.amount += jsonNumber(item.netAmount ?? item.amount ?? item.totalAmount ?? item.total)
            current.qty += jsonNumber(item.netWeight ?? item.qty)
            current.bills.add(bill.id)
            if (bill.supplier_id) current.suppliers.add(bill.supplier_id)
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
        const item = itemTotals(bill.items)
        const amount = item.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        return {
          amount: sum.amount + amount,
          month: monthKey,
          qty: sum.qty + item.qty,
        }
      }, { amount: 0, month: monthKey, qty: 0 })
    })

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
