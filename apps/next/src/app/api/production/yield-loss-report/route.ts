import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { loadProductionMetrics, summarizeProductionMetrics } from '@/lib/server/production-reports'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'production.reports.view')
    const url = new URL(request.url)
    const rows = (await loadProductionMetrics({
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
    })).map((row) => {
      const unitCost = row.inputQty > 0 ? row.inputCost / row.inputQty : 0
      const normalLossQty = row.inputQty * row.normalLossPercent / 100
      const expectedOutputQty = row.inputQty - normalLossQty
      const abnormalLossQty = Math.max(0, row.lossQty - normalLossQty)
      const yieldGainQty = Math.max(0, row.outputQty - expectedOutputQty)
      const abnormalLossValue = abnormalLossQty * unitCost
      const yieldGainValue = yieldGainQty * unitCost
      return { ...row, abnormalLossQty, abnormalLossValue, expectedOutputQty, netPnL: yieldGainValue - abnormalLossValue, normalLossQty, unitCost, yieldGainQty, yieldGainValue }
    })
    return NextResponse.json({
      rows,
      summary: {
        ...summarizeProductionMetrics(rows),
        abnormalLossValue: rows.reduce((sum, row) => sum + row.abnormalLossValue, 0),
        netPnL: rows.reduce((sum, row) => sum + row.netPnL, 0),
        yieldGainValue: rows.reduce((sum, row) => sum + row.yieldGainValue, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Yield/Loss Report ไม่ได้', 500)
  }
}
