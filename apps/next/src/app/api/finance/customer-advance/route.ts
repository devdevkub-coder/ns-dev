import type { Prisma } from '../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type CustomerAdvanceQuery = {
  customerId: string | null
  from: string | null
  page: number
  pageSize: number
  q: string | null
  sortDirection: 'asc' | 'desc'
  status: string | null
  to: string | null
}

function parseQuery(url: URL): CustomerAdvanceQuery {
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '50')
  return {
    customerId: url.searchParams.get('customerId') || null,
    from: url.searchParams.get('from') || null,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 500) : 50,
    q: url.searchParams.get('q') || null,
    sortDirection: url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    status: url.searchParams.get('status') || null,
    to: url.searchParams.get('to') || null,
  }
}

function statementWhere(query: CustomerAdvanceQuery): Prisma.bank_statementWhereInput {
  return {
    ref_type: 'CADV',
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

function extractCustomerName(description: string) {
  const normalized = description.trim()
  if (!normalized) return '-'
  const withoutPrefix = normalized.replace(/^Advance\s+จาก\s+/i, '').replace(/^รับเงินล่วงหน้า\s+Customer\s*/i, '')
  return withoutPrefix.replace(/\s+\([^)]*\)\s*$/, '').trim() || normalized
}

function statusFor(remaining: number, used: number) {
  if (remaining <= 0.01) return 'Fully Used'
  if (used > 0.01) return 'Partially Used'
  return 'Open'
}

async function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Customer Advance')
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

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const query = parseQuery(url)
    const search = query.q?.trim().toLowerCase()

    const [bankRows, customers] = await Promise.all([
      prisma.bank_statement.findMany({
        include: {
          accounts: { select: { account_no: true, bank_name: true, code: true, currency: true, id: true, name: true } },
        },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
        take: 10000,
        where: statementWhere(query),
      }),
      prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      }),
    ])

    const customerByCode = new Map(
      customers.map((customer) => [requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`), customer] as const),
    )
    const allRows = bankRows.map((row) => {
      const description = row.description ?? row.desc ?? ''
      const customerNameFromText = extractCustomerName(description)
      const customer = customerByCode.get(String(row.ref_id ?? '').trim())
      const amountThb = toNumber(row.amount_in)
      const usedAmount = 0
      const remainingAmount = Math.max(0, amountThb - usedAmount)
      const status = statusFor(remainingAmount, usedAmount)
      return {
        accountId: row.accounts?.code ?? '',
        accountName: row.accounts?.name ?? '-',
        accountNo: row.accounts?.account_no ?? '',
        amount: amountThb,
        amountThb,
        bankName: row.accounts?.bank_name ?? '',
        currency: row.accounts?.currency ?? 'THB',
        customerCode: customer?.code ?? '',
        customerId: customer?.code ?? '',
        customerName: customer?.name ?? customerNameFromText,
        date: toDateOnly(row.date),
        description,
        docNo: row.ref_no ?? row.doc_no,
        fxRate: 1,
        id: row.doc_no,
        remainingAmount,
        source: 'bank_statement' as const,
        status,
        usedAmount,
      }
    }).filter((row) => !query.customerId || row.customerId === query.customerId)
      .filter((row) => !query.status || row.status === query.status)
      .filter((row) => !search || `${row.docNo} ${row.customerCode} ${row.customerName} ${row.accountName} ${row.description}`.toLowerCase().includes(search))

    allRows.sort((left, right) => (left.date.localeCompare(right.date) || stringifyBusinessValue(left.docNo).localeCompare(stringifyBusinessValue(right.docNo))) * (query.sortDirection === 'asc' ? 1 : -1))

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(allRows.map((row) => ({
        Account: row.accountName,
        Amount: row.amount,
        AmountTHB: row.amountThb,
        Currency: row.currency,
        Customer: row.customerName,
        Date: row.date,
        DocNo: row.docNo,
        Remaining: row.remainingAmount,
        Status: row.status,
        Used: row.usedAmount,
      }))), `finance_customer_advance_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const start = (query.page - 1) * query.pageSize
    const totalRows = allRows.length
    const activeRows = allRows.filter((row) => row.status === 'Open' || row.status === 'Partially Used')

    return NextResponse.json({
      filters: {
        customers: customers.map((customer) => {
          const code = requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`)
          return { active: customer.active, code, id: code, name: customer.name }
        }),
        statuses: ['Open', 'Partially Used', 'Fully Used', 'Cancelled'],
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)),
        totalRows,
      },
      rows: allRows.slice(start, start + query.pageSize),
      schemaState: {
        allocationSource: 'missing_table',
        missingTables: ['customer_advances', 'advance_allocations'],
        sourceTable: 'bank_statement',
      },
      summary: {
        activeCount: activeRows.length,
        sourceRows: allRows.length,
        totalAdvanceThb: allRows.reduce((sum, row) => sum + row.amountThb, 0),
        totalRemainingThb: allRows.reduce((sum, row) => sum + row.remainingAmount, 0),
        totalUsedThb: allRows.reduce((sum, row) => sum + row.usedAmount, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Customer Advance ไม่ได้', 500)
  }
}
