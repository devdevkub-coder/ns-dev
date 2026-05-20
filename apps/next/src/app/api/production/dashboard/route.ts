import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { loadProductionMetrics, summarizeProductionMetrics } from '@/lib/server/production-reports'

export const runtime = 'nodejs'

function defaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.operations.view')
    const url = new URL(request.url)
    const fallback = defaultRange()
    const rows = await loadProductionMetrics({
      dateFrom: url.searchParams.get('dateFrom') || fallback.dateFrom,
      dateTo: url.searchParams.get('dateTo') || fallback.dateTo,
    })
    const summary = summarizeProductionMetrics(rows)
    const byStatus = Object.values(rows.reduce<Record<string, { count: number; status: string }>>((acc, row) => {
      acc[row.status] ??= { count: 0, status: row.status }
      acc[row.status].count += 1
      return acc
    }, {}))
    const topProducts = Object.values(rows.reduce<Record<string, { avgCost: number; batches: number; code: string; cost: number; name: string; qty: number }>>((acc, row) => {
      acc[row.productName] ??= { avgCost: 0, batches: 0, code: row.productCode, cost: 0, name: row.productName, qty: 0 }
      acc[row.productName].batches += 1
      acc[row.productName].qty += row.outputQty
      acc[row.productName].cost += row.outputValue
      return acc
    }, {})).map((item) => ({ ...item, avgCost: item.qty > 0 ? item.cost / item.qty : 0 })).sort((a, b) => b.qty - a.qty).slice(0, 10)

    const daily = Object.values(rows.reduce<Record<string, { inputQty: number; lossQty: number; outputQty: number; date: string }>>((acc, row) => {
      acc[row.date] ??= { date: row.date, inputQty: 0, lossQty: 0, outputQty: 0 }
      acc[row.date].inputQty += row.inputQty
      acc[row.date].outputQty += row.outputQty
      acc[row.date].lossQty += row.lossQty
      return acc
    }, {})).sort((a, b) => a.date.localeCompare(b.date))

    const monthly = Object.values(rows.reduce<Record<string, { inputQty: number; outputQty: number; month: string }>>((acc, row) => {
      const month = row.date.slice(0, 7)
      acc[month] ??= { inputQty: 0, month, outputQty: 0 }
      acc[month].inputQty += row.inputQty
      acc[month].outputQty += row.outputQty
      return acc
    }, {})).sort((a, b) => a.month.localeCompare(b.month)).slice(-12)

    const machineUtil = Object.values(rows.reduce<Record<string, { batches: number; name: string; qty: number }>>((acc, row) => {
      acc[row.machineName] ??= { batches: 0, name: row.machineName, qty: 0 }
      acc[row.machineName].batches += 1
      acc[row.machineName].qty += row.outputQty
      return acc
    }, {})).sort((a, b) => b.qty - a.qty)

    const allWipRows = await loadProductionMetrics()
    const totalWipQty = allWipRows
      .filter((row) => !['Closed', 'Completed', 'Cancelled'].includes(row.status))
      .reduce((sum, row) => sum + row.wipQty, 0)

    return NextResponse.json({ daily, machineUtil, monthly, rows: rows.slice(0, 20), summary: { ...summary, totalWipQty }, byStatus, topProducts })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Production Dashboard ไม่ได้', 500)
  }
}
