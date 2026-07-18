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

    const filterRow = (row: any) => {
      const matchStatus = !status || status === 'all' || row.allocationStatus === status
      const matchCategory = !category || category === 'all' || row.metalGroup === category
      const matchSearch = !q || `${row.docNo} ${row.customerName} ${row.productId} ${row.productName} ${row.metalGroup}`.toLowerCase().includes(q)
      return matchStatus && matchCategory && matchSearch
    }

    const filteredBillRows = (payload.waitingRows || []).filter(filterRow)
    const filteredPoRows = (payload.waitingPoSellRows || []).filter(filterRow)
    const filteredProductionRows = (payload.waitingProductionRows || []).filter(filterRow)

    const allFilteredRows = [...filteredPoRows, ...filteredBillRows, ...filteredProductionRows]

    const byCategory = new Map<string, { count: number; partial: number; qty: number; revenue: number }>()
    allFilteredRows.forEach((row) => {
      const current = byCategory.get(row.metalGroup) ?? { count: 0, partial: 0, qty: 0, revenue: 0 }
      current.count += 1
      if (row.allocationStatus === 'partially_allocated') current.partial += 1
      current.qty += row.remainingQty
      current.revenue += row.revenuePending
      byCategory.set(row.metalGroup, current)
    })

    const categoriesList = Array.from(new Set([
      ...(payload.waitingRows || []).map((row) => row.metalGroup),
      ...(payload.waitingPoSellRows || []).map((row) => row.metalGroup),
      ...(payload.waitingProductionRows || []).map((row) => row.metalGroup)
    ])).sort()

    return NextResponse.json({
      filters: {
        categories: categoriesList,
        statuses: ['pending_allocation', 'partially_allocated'],
      },
      po: {
        rows: filteredPoRows,
        count: filteredPoRows.length,
      },
      bill: {
        rows: filteredBillRows,
        count: filteredBillRows.length,
      },
      production: {
        rows: filteredProductionRows,
        count: filteredProductionRows.length,
      },
      summary: {
        byCategory: Array.from(byCategory.entries()).map(([name, values]) => ({ name, ...values })),
        count: allFilteredRows.length,
        fullyPending: allFilteredRows.filter((row) => row.allocationStatus === 'pending_allocation').length,
        partial: allFilteredRows.filter((row) => row.allocationStatus === 'partially_allocated').length,
        totalQty: allFilteredRows.reduce((sum, row) => sum + row.remainingQty, 0),
        totalRevenue: allFilteredRows.reduce((sum, row) => sum + row.revenuePending, 0),
      },
      writeDeferred: true,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Waiting Allocations ไม่ได้', 500)
  }
}
