import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function pct(margin: number, revenue: number) {
  return revenue > 0 ? (margin / revenue) * 100 : 0
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const dateWhere = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }

    const [deals, salesBills] = await Promise.all([
      prisma.trading_deals.findMany({
        take: 10000,
        where: {
          ...(from || to ? { date: dateWhere } : {}),
          NOT: { status: { in: ['cancelled', 'Cancelled'] } },
        },
      }),
      prisma.sales_bills.findMany({
        take: 10000,
        where: {
          ...(from || to ? { date: dateWhere } : {}),
          NOT: { status: { in: ['cancelled', 'Cancelled'] } },
        },
      }),
    ])

    const dealRevenue = deals.reduce((sum, row) => sum + toNumber(row.matched_sales_amount), 0)
    const dealCost = deals.reduce((sum, row) => sum + toNumber(row.matched_purchase_amount), 0)
    const dealMargin = dealRevenue - dealCost

    const stockRevenue = salesBills.reduce((sum, row) => sum + toNumber(row.total_amount), 0)
    const stockCost = salesBills.reduce((sum, row) => sum + (toNumber(row.cogs_amount) || toNumber(row.total_cost)), 0)
    const stockMargin = stockRevenue - stockCost

    return NextResponse.json({
      dealTotals: {
        cost: dealCost,
        margin: dealMargin,
        marginPct: pct(dealMargin, dealRevenue),
        revenue: dealRevenue,
        rows: deals.length,
      },
      diff: {
        cost: stockCost - dealCost,
        margin: stockMargin - dealMargin,
        revenue: stockRevenue - dealRevenue,
      },
      notes: [
        'Deal side reads matched sales/purchase amounts from trading_deals.',
        'Stock side reads sales_bills total_amount and cogs_amount/total_cost where available.',
      ],
      stockTotals: {
        cost: stockCost,
        margin: stockMargin,
        marginPct: pct(stockMargin, stockRevenue),
        revenue: stockRevenue,
        rows: salesBills.length,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Compare Margin ไม่ได้', 500)
  }
}
