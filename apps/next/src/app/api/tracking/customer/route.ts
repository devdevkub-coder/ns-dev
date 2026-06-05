import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type SalesItem = {
  amount?: number | string
  netAmount?: number | string
  netWeight?: number | string
  qty?: number | string
  total?: number | string
  weight?: number | string
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
    .filter((item): item is SalesItem => typeof item === 'object' && item !== null)
    .forEach((item) => {
      amount += jsonNumber(item.netAmount ?? item.amount ?? item.total)
      qty += jsonNumber(item.netWeight ?? item.weight ?? item.qty)
    })
  return { amount, qty }
}

function inYearMonth(date: Date, year: string | null, month: string | null) {
  const value = toDateOnly(date)
  if (year && value.slice(0, 4) !== year) return false
  if (month && value.slice(5, 7) !== month.padStart(2, '0')) return false
  return true
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Customer Tracking')
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
    const customerId = url.searchParams.get('customerId')
    const customer = customerId ? await findActiveCustomerReferenceByCodeOrId(customerId) : null
    const search = url.searchParams.get('q')?.trim().toLowerCase()

    const [customers, bills, receipts] = await Promise.all([
      prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, credit_limit: true, id: true, name: true },
        where: { active: { not: false }, ...(customer ? { id: customer.id } : {}) },
      }),
      prisma.sales_bills.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' }, ...(customer ? { customer_id: customer.id } : {}) },
      }),
      prisma.receipts.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' }, ...(customer ? { customer_id: customer.id } : {}) },
      }),
    ])

    const receivedByBill = new Map<bigint, number>()
    receipts.forEach((receipt) => {
      if (!receipt.bill_id) return
      const amount = toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount)
      receivedByBill.set(receipt.bill_id, (receivedByBill.get(receipt.bill_id) ?? 0) + amount)
    })

    const rows = customers.map((customer) => {
      const customerBills = bills.filter((bill) => bill.customer_id === customer.id && inYearMonth(bill.date, year, month))
      const customerReceipts = receipts.filter((receipt) => receipt.customer_id === customer.id && inYearMonth(receipt.date, year, month))
      const totals = customerBills.reduce((sum, bill) => {
        const item = itemTotals(bill.items)
        const revenue = item.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        const received = receivedByBill.get(bill.id) ?? toNumber(bill.received_amount)
        return {
          billCount: sum.billCount + 1,
          cogs: sum.cogs + toNumber(bill.cogs_amount ?? bill.total_cost),
          gp: sum.gp + toNumber(bill.gross_profit),
          qty: sum.qty + item.qty,
          receivable: sum.receivable + Math.max(0, toNumber(bill.total_amount) - received),
          revenue: sum.revenue + revenue,
        }
      }, { billCount: 0, cogs: 0, gp: 0, qty: 0, receivable: 0, revenue: 0 })
      const receivedAmount = customerReceipts.reduce((sum, receipt) => sum + toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount), 0)
      const gp = totals.gp || totals.revenue - totals.cogs
      return {
        avgSell: totals.qty > 0 ? totals.revenue / totals.qty : 0,
        billCount: totals.billCount,
        cogs: totals.cogs,
        code: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
        creditLimit: toNumber(customer.credit_limit),
        customerName: customer.name,
        gp,
        gpPct: totals.revenue > 0 ? (gp / totals.revenue) * 100 : 0,
        id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
        profitPerKg: totals.qty > 0 ? gp / totals.qty : 0,
        qty: totals.qty,
        receivable: totals.receivable,
        receiptCount: customerReceipts.length,
        receivedAmount,
        revenue: totals.revenue,
      }
    }).filter((row) => row.billCount > 0 || row.revenue > 0 || row.receivable > 0)
      .filter((row) => !search || `${row.code} ${row.customerName}`.toLowerCase().includes(search))
      .sort((left, right) => right.revenue - left.revenue)

    const monthly = Array.from({ length: 12 }, (_, index) => {
      const monthKey = String(index + 1).padStart(2, '0')
      const monthBills = bills.filter((bill) => inYearMonth(bill.date, year, monthKey))
      return monthBills.reduce<{ gp: number; month: string; qty: number; revenue: number }>((sum, bill) => {
        const item = itemTotals(bill.items)
        const revenue = item.amount || toNumber(bill.subtotal) || toNumber(bill.total_amount)
        return {
          gp: sum.gp + (toNumber(bill.gross_profit) || revenue - toNumber(bill.cogs_amount ?? bill.total_cost)),
          month: monthKey,
          qty: sum.qty + item.qty,
          revenue: sum.revenue + revenue,
        }
      }, { gp: 0, month: monthKey, qty: 0, revenue: 0 })
    })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows.map((row) => ({
        AvgSell: row.avgSell,
        Bills: row.billCount,
        COGS: row.cogs,
        Code: row.code,
        Customer: row.customerName,
        GP: row.gp,
        GPPct: row.gpPct,
        Qty: row.qty,
        Receivable: row.receivable,
        Received: row.receivedAmount,
        Revenue: row.revenue,
      }))), `tracking_customer_${year}${month ? `_${month}` : ''}.xlsx`)
    }

    return NextResponse.json({
      filters: {
        customers: customers.map((customer) => {
          const code = requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)
          return { active: customer.active, code, id: code, name: customer.name }
        }),
      },
      monthly,
      rows,
      summary: {
        cogs: rows.reduce((sum, row) => sum + row.cogs, 0),
        customers: rows.length,
        gp: rows.reduce((sum, row) => sum + row.gp, 0),
        qty: rows.reduce((sum, row) => sum + row.qty, 0),
        receivable: rows.reduce((sum, row) => sum + row.receivable, 0),
        receivedAmount: rows.reduce((sum, row) => sum + row.receivedAmount, 0),
        revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      },
      year,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Customer Tracking ไม่ได้', 500)
  }
}
