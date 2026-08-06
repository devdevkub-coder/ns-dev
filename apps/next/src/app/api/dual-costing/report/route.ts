import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildDualCostingManagement } from '@/lib/server/dual-costing-management'

export const runtime = 'nodejs'

function pct(grossProfit: number, revenue: number) {
  return revenue > 0 ? (grossProfit / revenue) * 100 : 0
}

function toDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function defaultReportRange(date = new Date()) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  return { from: toDateOnly(first), to: toDateOnly(date) }
}

function targetTypeLabel(targetType: string) {
  if (targetType === 'PO_SELL') return 'PO Sell'
  if (targetType === 'SPOT_SELL') return 'Spot Sell'
  return targetType || '-'
}

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const payload = await buildDualCostingManagement()
    const fallback = defaultReportRange()
    const params = request.nextUrl.searchParams
    const from = params.get('from') || fallback.from
    const to = params.get('to') || fallback.to

    const activeLedgerRows = payload.ledgerRows
      .filter((row) => row.status === 'approved')
      .filter((row) => row.date >= from && row.date <= to)
    const waitingRows = payload.waitingRows
      .filter((row) => row.date >= from && row.date <= to)

    const byCategory = new Map<string, { allocatedQty: number; cost: number; gp: number; pendingQty: number; pendingRevenue: number; revenue: number; rows: number }>()
    const detailByCategory = new Map<string, {
      allocatedRows: Array<{
        allocatedQty: number
        cost: number
        costPoolNo: string
        date: string
        gp: number
        gpPct: number
        id: string
        matchId: string
        productName: string
        revenue: number
        saleDocNo: string
        sourceNo: string
        targetType: string
      }>
      pendingRows: Array<{
        customerName: string
        date: string
        docNo: string
        pendingQty: number
        pendingRevenue: number
        productName: string
        unitPrice: number
      }>
    }>()
    const ensureCategory = (category: string) => {
      const key = category || '-'
      const current = byCategory.get(key) ?? { allocatedQty: 0, cost: 0, gp: 0, pendingQty: 0, pendingRevenue: 0, revenue: 0, rows: 0 }
      byCategory.set(key, current)
      return current
    }
    const ensureDetail = (category: string) => {
      const key = category || '-'
      const current = detailByCategory.get(key) ?? { allocatedRows: [], pendingRows: [] }
      detailByCategory.set(key, current)
      return current
    }

    activeLedgerRows.forEach((row) => {
      const current = ensureCategory(row.productCategory)
      current.allocatedQty += row.allocatedQty
      current.cost += row.totalCost
      current.gp += row.grossProfit
      current.revenue += row.allocatedRevenue
      current.rows += 1

      const detail = ensureDetail(row.productCategory)
      detail.allocatedRows.push({
        allocatedQty: row.allocatedQty,
        cost: row.totalCost,
        costPoolNo: row.costPoolNo,
        date: row.date,
        gp: row.grossProfit,
        gpPct: row.gpPct,
        id: row.id,
        matchId: row.matchId,
        productName: row.productName,
        revenue: row.allocatedRevenue,
        saleDocNo: row.saleDocNo,
        sourceNo: row.sourceNo,
        targetType: targetTypeLabel(row.targetType),
      })
    })

    waitingRows.forEach((row) => {
      const current = ensureCategory(row.metalGroup)
      current.pendingQty += row.remainingQty
      current.pendingRevenue += row.revenuePending

      const detail = ensureDetail(row.metalGroup)
      detail.pendingRows.push({
        customerName: row.customerName,
        date: row.date,
        docNo: row.docNo,
        pendingQty: row.remainingQty,
        pendingRevenue: row.revenuePending,
        productName: row.productName,
        unitPrice: row.unitPrice,
      })
    })

    const poRows = activeLedgerRows.filter((row) => row.targetType === 'PO_SELL')
    const spotRows = activeLedgerRows.filter((row) => row.targetType === 'SPOT_SELL')
    const sumRows = (rows: typeof activeLedgerRows) => {
      const revenue = rows.reduce((sum, row) => sum + row.allocatedRevenue, 0)
      const cost = rows.reduce((sum, row) => sum + row.totalCost, 0)
      const gp = revenue - cost
      const qty = rows.reduce((sum, row) => sum + row.allocatedQty, 0)
      return { cost, count: rows.length, gp, gpPct: pct(gp, revenue), qty, revenue }
    }

    return NextResponse.json({
      filters: {
        dateFrom: from,
        dateTo: to,
      },
      report: {
        byCategory: Array.from(byCategory.entries()).map(([category, values]) => ({
          category,
          ...values,
          detail: detailByCategory.get(category) ?? { allocatedRows: [], pendingRows: [] },
          gpPct: pct(values.gp, values.revenue),
        })),
        po: sumRows(poRows),
        spotAllocated: sumRows(spotRows),
        total: sumRows(activeLedgerRows),
        waiting: {
          count: waitingRows.length,
          qty: waitingRows.reduce((sum, row) => sum + row.remainingQty, 0),
          revenue: waitingRows.reduce((sum, row) => sum + row.revenuePending, 0),
        },
      },
      writeDeferred: true,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Dual Costing Report ไม่ได้', 500)
  }
}
