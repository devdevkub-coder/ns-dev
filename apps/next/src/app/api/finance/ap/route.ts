import type { Prisma } from '../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type ApQuery = {
  branchId: string | null
  bucket: string | null
  from: string | null
  page: number
  pageSize: number
  q: string | null
  sortDirection: 'asc' | 'desc'
  sortKey: 'date' | 'docNo' | 'dueDate' | 'payableBalance' | 'supplierName' | 'aging'
  status: string | null
  supplierId: string | null
  to: string | null
}

function ageBucket(days: number) {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '>90'
}

function parseQuery(url: URL): ApQuery {
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '50')
  const sortKey = url.searchParams.get('sortKey')
  const sortDirection = url.searchParams.get('sortDirection')

  return {
    branchId: url.searchParams.get('branchId') || null,
    bucket: url.searchParams.get('bucket') || null,
    from: url.searchParams.get('from') || null,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 500) : 50,
    q: url.searchParams.get('q') || null,
    sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
    sortKey: ['date', 'docNo', 'dueDate', 'payableBalance', 'supplierName', 'aging'].includes(sortKey ?? '') ? sortKey as ApQuery['sortKey'] : 'dueDate',
    status: url.searchParams.get('status') || null,
    supplierId: url.searchParams.get('supplierId') || null,
    to: url.searchParams.get('to') || null,
  }
}

function billWhere(query: ApQuery): Prisma.purchase_billsWhereInput {
  return {
    ...(query.branchId ? { branch_id: query.branchId } : {}),
    ...(query.supplierId ? { supplier_id: query.supplierId } : {}),
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
  XLSX.utils.book_append_sheet(workbook, sheet, 'AP Aging')
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

    const [bills, payments, suppliers, branches] = await Promise.all([
      prisma.purchase_bills.findMany({
        include: {
          branches: { select: { id: true, name: true } },
          suppliers: { select: { code: true, id: true, name: true } },
        },
        orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
        take: 10000,
        where: billWhere(query),
      }),
      prisma.payments.findMany({
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
      prisma.suppliers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.branches.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      }),
    ])

    const paidMap = new Map<string, number>()
    payments.forEach((payment) => {
      if (!payment.bill_id) return
      const total = toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
      paidMap.set(payment.bill_id, (paidMap.get(payment.bill_id) ?? 0) + total)
    })

    const today = new Date()
    const search = query.q?.trim().toLowerCase()
    const allRows = bills
      .map((bill) => {
        const totalAmount = toNumber(bill.total_amount)
        const paidAmount = paidMap.get(bill.id) ?? toNumber(bill.paid_amount)
        const payableBalance = Math.max(0, totalAmount - paidAmount)
        const creditTerm = 0
        const due = new Date(bill.date)
        due.setDate(due.getDate() + creditTerm)
        const aging = Math.floor((today.getTime() - due.getTime()) / 86400000)

        return {
          aging,
          branchId: bill.branch_id ?? '',
          branchName: bill.branches?.name ?? '-',
          bucket: ageBucket(aging),
          creditTerm,
          date: toDateOnly(bill.date),
          docNo: bill.doc_no,
          dueDate: toDateOnly(due),
          id: bill.id,
          paidAmount,
          payableBalance,
          status: bill.status ?? 'open',
          supplierCode: bill.suppliers?.code ?? '',
          supplierId: bill.supplier_id ?? '',
          supplierName: bill.suppliers?.name ?? bill.supplier_id ?? '-',
          totalAmount,
          transactionMode: bill.transaction_mode ?? 'STOCK',
        }
      })
      .filter((row) => row.payableBalance > 0.01)
      .filter((row) => !query.bucket || row.bucket === query.bucket)
      .filter((row) => !search || `${row.docNo} ${row.supplierCode} ${row.supplierName} ${row.branchName}`.toLowerCase().includes(search))

    allRows.sort((left, right) => {
      const direction = query.sortDirection === 'asc' ? 1 : -1
      const leftValue = left[query.sortKey]
      const rightValue = right[query.sortKey]
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction
      return String(leftValue).localeCompare(String(rightValue)) * direction
    })

    const supplierMap = new Map<string, {
      b30: number
      b60: number
      b90: number
      bills: number
      current: number
      gt90: number
      oldest: number
      supplierId: string
      supplierName: string
      total: number
    }>()

    allRows.forEach((row) => {
      const current = supplierMap.get(row.supplierId) ?? {
        b30: 0,
        b60: 0,
        b90: 0,
        bills: 0,
        current: 0,
        gt90: 0,
        oldest: 0,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        total: 0,
      }
      current.bills += 1
      current.total += row.payableBalance
      current.oldest = Math.max(current.oldest, row.aging)
      if (row.bucket === 'Current') current.current += row.payableBalance
      else if (row.bucket === '1-30') current.b30 += row.payableBalance
      else if (row.bucket === '31-60') current.b60 += row.payableBalance
      else if (row.bucket === '61-90') current.b90 += row.payableBalance
      else current.gt90 += row.payableBalance
      supplierMap.set(row.supplierId, current)
    })

    const bySupplier = Array.from(supplierMap.values()).sort((left, right) => right.total - left.total)
    const byBucket = ['Current', '1-30', '31-60', '61-90', '>90'].map((bucket) => ({
      bills: allRows.filter((row) => row.bucket === bucket).length,
      bucket,
      total: allRows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.payableBalance, 0),
    }))

    if (url.searchParams.get('format') === 'xlsx') {
      const workbookRows = allRows.map((row) => ({
        Aging: row.aging,
        Branch: row.branchName,
        Bucket: row.bucket,
        Date: row.date,
        DocNo: row.docNo,
        DueDate: row.dueDate,
        Paid: row.paidAmount,
        Payable: row.payableBalance,
        Status: row.status,
        Supplier: row.supplierName,
        Total: row.totalAmount,
      }))
      return xlsxResponse(buildWorkbook(workbookRows), `finance_ap_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const totalRows = allRows.length
    const start = (query.page - 1) * query.pageSize
    const rows = allRows.slice(start, start + query.pageSize)
    const statuses = Array.from(new Set(bills.map((bill) => bill.status ?? 'open'))).sort()

    return NextResponse.json({
      byBucket,
      bySupplier,
      filters: {
        branches: branches.map((row) => ({ active: row.active, code: row.code, id: row.id, name: row.name })),
        channels: [],
        statuses,
        suppliers: suppliers.map((row) => ({ active: row.active, code: row.code, id: row.id, name: row.name })),
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
        dueIn7: allRows.filter((row) => row.aging >= -7 && row.aging <= 0).reduce((sum, row) => sum + row.payableBalance, 0),
        overdue: allRows.filter((row) => row.aging > 0).reduce((sum, row) => sum + row.payableBalance, 0),
        suppliers: bySupplier.length,
        total: allRows.reduce((sum, row) => sum + row.payableBalance, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดเจ้าหนี้ AP ไม่ได้', 500)
  }
}
