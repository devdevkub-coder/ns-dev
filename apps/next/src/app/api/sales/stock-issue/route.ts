import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type StockIssueQuery = {
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  search?: string
  sortDirection: Prisma.SortOrder
  sortKey: string
}

function parseStockIssueQuery(url: URL): StockIssueQuery {
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

function stockIssueWhere(query: StockIssueQuery): Prisma.stock_issuesWhereInput {
  const where: Prisma.stock_issuesWhereInput = {}

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: normalizeDate(query.dateTo) } : {}),
    }
  }
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { customers: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { branches: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { warehouses: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

function stockIssueOrderBy(query: StockIssueQuery): Prisma.stock_issuesOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.stock_issuesOrderByWithRelationInput = (() => {
    switch (query.sortKey) {
      case 'docNo':
        return { doc_no: direction }
      case 'name':
        return { customer_id: direction }
      case 'status':
        return { status: direction }
      case 'totalAmount':
        return { total_est_amount: direction }
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
    requirePermission(context, 'stock.ledger.view')
    const query = parseStockIssueQuery(new URL(request.url))
    const where = stockIssueWhere(query)

    const [rows, totalRows, totals] = await Promise.all([
      prisma.stock_issues.findMany({
        include: {
          branches: true,
          customers: true,
          warehouses: true,
        },
        orderBy: stockIssueOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.stock_issues.count({ where }),
      prisma.stock_issues.aggregate({ _sum: { total_est_amount: true }, where }),
    ])

    return NextResponse.json({
      rows: rows.map((row) => ({
        branchName: row.branches?.name ?? '-',
        convertedToBillId: row.converted_to_bill_id ?? '',
        customerName: row.customers?.name ?? row.customer_id ?? '-',
        date: toDateOnly(row.date),
        docNo: row.doc_no,
        id: row.id,
        itemCount: Array.isArray(row.items) ? row.items.length : 0,
        status: row.status ?? 'pending',
        totalCost: toNumber(row.total_cost),
        totalEstAmount: toNumber(row.total_est_amount),
        warehouseName: row.warehouses?.name ?? '-',
      })),
      totalAmount: toNumber(totals._sum.total_est_amount),
      totalRows,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดเบิกออกรอบิลไม่ได้', 500)
  }
}
