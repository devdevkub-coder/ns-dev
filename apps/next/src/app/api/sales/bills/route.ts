import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type BillQuery = {
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  search?: string
  sortDirection: Prisma.SortOrder
  sortKey: string
}

function parseBillQuery(url: URL): BillQuery {
  return {
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
    pageSize: Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)),
    search: url.searchParams.get('search')?.trim() || undefined,
    sortDirection: url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    sortKey: url.searchParams.get('sortKey') || 'date',
  }
}

function billWhere(query: BillQuery): Prisma.sales_billsWhereInput {
  const where: Prisma.sales_billsWhereInput = {}

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: normalizeDate(query.dateTo) } : {}),
    }
  }
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { ref_no: { contains: query.search, mode: 'insensitive' } },
      { customers: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { branches: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { warehouses: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

function billOrderBy(query: BillQuery): Prisma.sales_billsOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.sales_billsOrderByWithRelationInput = (() => {
    switch (query.sortKey) {
      case 'docNo':
        return { doc_no: direction }
      case 'name':
        return { customer_id: direction }
      case 'outstanding':
        return { receivable_balance: direction }
      case 'status':
        return { status: direction }
      case 'totalAmount':
        return { total_amount: direction }
      case 'warehouse':
        return { branch_id: direction }
      case 'date':
      default:
        return { date: direction }
    }
  })()

  return [primary, { doc_no: direction }]
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const query = parseBillQuery(new URL(request.url))
    const where = billWhere(query)

    const [rows, totalRows, totals] = await Promise.all([
      prisma.sales_bills.findMany({
        include: {
          branches: true,
          customers: true,
          sales_channels: true,
          warehouses: true,
        },
        orderBy: billOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.sales_bills.count({ where }),
      prisma.sales_bills.aggregate({ _sum: { total_amount: true }, where }),
    ])

    return NextResponse.json({
      rows: rows.map((row) => ({
        branchName: row.branches?.name ?? '-',
        channelName: row.sales_channels?.name ?? '-',
        customerName: row.customers?.name ?? row.customer_id ?? '-',
        date: toDateOnly(row.date),
        docNo: row.doc_no,
        grossProfit: toNumber(row.gross_profit),
        id: row.id,
        itemCount: Array.isArray(row.items) ? row.items.length : 0,
        receivableBalance: toNumber(row.receivable_balance),
        receivedAmount: toNumber(row.received_amount),
        status: row.status ?? 'open',
        totalAmount: toNumber(row.total_amount),
        warehouseName: row.warehouses?.name ?? '-',
      })),
      totalAmount: toNumber(totals._sum.total_amount),
      totalRows,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดบิลขายไม่ได้', 500)
  }
}
