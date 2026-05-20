import type { Prisma } from '../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type ArQuery = {
  branchId: string | null
  bucket: string | null
  channelId: string | null
  customerId: string | null
  from: string | null
  page: number
  pageSize: number
  q: string | null
  sortDirection: 'asc' | 'desc'
  sortKey: 'date' | 'docNo' | 'dueDate' | 'receivableBalance' | 'customerName' | 'aging'
  status: string | null
  to: string | null
}

function ageBucket(days: number) {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '>90'
}

function parseQuery(url: URL): ArQuery {
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '50')
  const sortKey = url.searchParams.get('sortKey')
  const sortDirection = url.searchParams.get('sortDirection')

  return {
    branchId: url.searchParams.get('branchId') || null,
    bucket: url.searchParams.get('bucket') || null,
    channelId: url.searchParams.get('channelId') || null,
    customerId: url.searchParams.get('customerId') || null,
    from: url.searchParams.get('from') || null,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 500) : 50,
    q: url.searchParams.get('q') || null,
    sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
    sortKey: ['date', 'docNo', 'dueDate', 'receivableBalance', 'customerName', 'aging'].includes(sortKey ?? '') ? sortKey as ArQuery['sortKey'] : 'dueDate',
    status: url.searchParams.get('status') || null,
    to: url.searchParams.get('to') || null,
  }
}

function billWhere(query: ArQuery): Prisma.sales_billsWhereInput {
  return {
    ...(query.branchId ? { branch_id: query.branchId } : {}),
    ...(query.channelId ? { channel_id: query.channelId } : {}),
    ...(query.customerId ? { customer_id: query.customerId } : {}),
    ...(query.status ? { status: query.status } : { NOT: { status: 'cancelled' } }),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: normalizeDate(query.from) } : {}),
            ...(query.to ? { lte: normalizeDate(query.to) } : {}),
          },
        }
      : {}),
  }
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'AR Aging')
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
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const query = parseQuery(url)

    const [bills, receipts, customers, branches, channels, pendingIssues] = await Promise.all([
      prisma.sales_bills.findMany({
        include: {
          branches: { select: { id: true, name: true } },
          customers: { select: { code: true, credit_term: true, id: true, name: true } },
          sales_channels: { select: { id: true, name: true } },
        },
        orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
        take: 10000,
        where: billWhere(query),
      }),
      prisma.receipts.findMany({
        select: {
          amount: true,
          bill_id: true,
          discount: true,
          status: true,
          withholding_tax: true,
        },
        take: 10000,
        where: { NOT: { status: 'cancelled' } },
      }),
      prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.branches.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.sales_channels.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.stock_issues.findMany({
        select: { total_cost: true, total_est_amount: true },
        take: 10000,
        where: {
          ...(query.branchId ? { branch_id: query.branchId } : {}),
          status: 'pending',
        },
      }),
    ])

    const receivedMap = new Map<string, number>()
    receipts.forEach((receipt) => {
      if (!receipt.bill_id) return
      const total = toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount)
      receivedMap.set(receipt.bill_id, (receivedMap.get(receipt.bill_id) ?? 0) + total)
    })

    const today = new Date()
    const search = query.q?.trim().toLowerCase()
    const allRows = bills
      .map((bill) => {
        const totalAmount = toNumber(bill.total_amount)
        const receivedAmount = receivedMap.get(bill.id) ?? toNumber(bill.received_amount)
        const receivableBalance = Math.max(0, totalAmount - receivedAmount)
        const creditTerm = bill.credit_term ?? bill.customers?.credit_term ?? 0
        const due = bill.due_date ? new Date(bill.due_date) : new Date(bill.date)
        if (!bill.due_date) due.setDate(due.getDate() + creditTerm)
        const aging = Math.floor((today.getTime() - due.getTime()) / 86400000)

        return {
          aging,
          branchId: bill.branch_id ?? '',
          branchName: bill.branches?.name ?? '-',
          bucket: ageBucket(aging),
          channelName: bill.sales_channels?.name ?? '-',
          creditTerm,
          customerCode: bill.customers?.code ?? '',
          customerId: bill.customer_id ?? '',
          customerName: bill.customers?.name ?? bill.customer_id ?? '-',
          date: toDateOnly(bill.date),
          docNo: bill.doc_no,
          dueDate: toDateOnly(due),
          id: bill.id,
          receivableBalance,
          receivedAmount,
          status: bill.status ?? 'open',
          totalAmount,
          transactionMode: bill.transaction_mode ?? 'STOCK',
        }
      })
      .filter((row) => row.receivableBalance > 0.01)
      .filter((row) => !query.bucket || row.bucket === query.bucket)
      .filter((row) => !search || `${row.docNo} ${row.customerCode} ${row.customerName} ${row.channelName} ${row.branchName}`.toLowerCase().includes(search))

    allRows.sort((left, right) => {
      const direction = query.sortDirection === 'asc' ? 1 : -1
      const leftValue = left[query.sortKey]
      const rightValue = right[query.sortKey]
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction
      return String(leftValue).localeCompare(String(rightValue)) * direction
    })

    const customerMap = new Map<string, {
      b30: number
      b60: number
      b90: number
      bills: number
      current: number
      customerId: string
      customerName: string
      gt90: number
      oldest: number
      total: number
    }>()

    allRows.forEach((row) => {
      const current = customerMap.get(row.customerId) ?? {
        b30: 0,
        b60: 0,
        b90: 0,
        bills: 0,
        current: 0,
        customerId: row.customerId,
        customerName: row.customerName,
        gt90: 0,
        oldest: 0,
        total: 0,
      }
      current.bills += 1
      current.total += row.receivableBalance
      current.oldest = Math.max(current.oldest, row.aging)
      if (row.bucket === 'Current') current.current += row.receivableBalance
      else if (row.bucket === '1-30') current.b30 += row.receivableBalance
      else if (row.bucket === '31-60') current.b60 += row.receivableBalance
      else if (row.bucket === '61-90') current.b90 += row.receivableBalance
      else current.gt90 += row.receivableBalance
      customerMap.set(row.customerId, current)
    })

    const byCustomer = Array.from(customerMap.values()).sort((left, right) => right.total - left.total)
    const byBucket = ['Current', '1-30', '31-60', '61-90', '>90'].map((bucket) => ({
      bills: allRows.filter((row) => row.bucket === bucket).length,
      bucket,
      total: allRows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.receivableBalance, 0),
    }))

    if (url.searchParams.get('format') === 'xlsx') {
      const workbookRows = allRows.map((row) => ({
        Aging: row.aging,
        Branch: row.branchName,
        Bucket: row.bucket,
        Channel: row.channelName,
        Customer: row.customerName,
        Date: row.date,
        DocNo: row.docNo,
        DueDate: row.dueDate,
        Received: row.receivedAmount,
        Receivable: row.receivableBalance,
        Status: row.status,
        Total: row.totalAmount,
      }))
      return xlsxResponse(buildWorkbook(workbookRows), `finance_ar_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const totalRows = allRows.length
    const start = (query.page - 1) * query.pageSize
    const rows = allRows.slice(start, start + query.pageSize)
    const statuses = Array.from(new Set(bills.map((bill) => bill.status ?? 'open'))).sort()

    return NextResponse.json({
      byBucket,
      byCustomer,
      filters: {
        branches: branches.map((row) => ({ active: row.active, code: row.code, id: row.id, name: row.name })),
        channels: channels.map((row) => ({ active: row.active, code: null, id: row.id, name: row.name })),
        customers: customers.map((row) => ({ active: row.active, code: row.code, id: row.id, name: row.name })),
        statuses,
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)),
        totalRows,
      },
      rows,
      summary: {
        bills: allRows.length,
        customers: byCustomer.length,
        dueIn7: allRows.filter((row) => row.aging >= -7 && row.aging <= 0).reduce((sum, row) => sum + row.receivableBalance, 0),
        overdue: allRows.filter((row) => row.aging > 0).reduce((sum, row) => sum + row.receivableBalance, 0),
        pendingIssue: {
          cost: pendingIssues.reduce((sum, row) => sum + toNumber(row.total_cost), 0),
          count: pendingIssues.length,
          est: pendingIssues.reduce((sum, row) => sum + toNumber(row.total_est_amount), 0),
        },
        total: allRows.reduce((sum, row) => sum + row.receivableBalance, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดลูกหนี้ AR ไม่ได้', 500)
  }
}
