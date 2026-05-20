import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildDualCostingManagement } from '@/lib/server/dual-costing-management'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const status = url.searchParams.get('status')
    const category = url.searchParams.get('category')

    const payload = await buildDualCostingManagement()
    const rows = payload.waitingRows
      .filter((row) => !status || status === 'all' || row.allocationStatus === status)
      .filter((row) => !category || category === 'all' || row.metalGroup === category)
      .filter((row) => !q || `${row.docNo} ${row.customerName} ${row.productName} ${row.metalGroup}`.toLowerCase().includes(q))

    const byCategory = new Map<string, { count: number; qty: number; revenue: number }>()
    rows.forEach((row) => {
      const current = byCategory.get(row.metalGroup) ?? { count: 0, qty: 0, revenue: 0 }
      current.count += 1
      current.qty += row.remainingQty
      current.revenue += row.revenuePending
      byCategory.set(row.metalGroup, current)
    })

    return NextResponse.json({
      filters: {
        categories: Array.from(new Set(payload.waitingRows.map((row) => row.metalGroup))).sort(),
        statuses: ['pending_allocation', 'partially_allocated'],
      },
      rows,
      summary: {
        byCategory: Array.from(byCategory.entries()).map(([name, values]) => ({ name, ...values })),
        count: rows.length,
        fullyPending: rows.filter((row) => row.allocationStatus === 'pending_allocation').length,
        partial: rows.filter((row) => row.allocationStatus === 'partially_allocated').length,
        totalQty: rows.reduce((sum, row) => sum + row.remainingQty, 0),
        totalRevenue: rows.reduce((sum, row) => sum + row.revenuePending, 0),
      },
      writeDeferred: true,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Waiting Allocations ไม่ได้', 500)
  }
}
