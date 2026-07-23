import {
  summarizeProductionMetrics,
  summarizeProductionOutputProducts,
  type ProductionOrderMetric,
} from '@/lib/server/production-reports'
import { loadProductionDashboardRows, loadProductionDashboardWip } from '@/lib/server/production-dashboard-query'

export type ProductionDashboardFilters = {
  allowedBranchIds: bigint[] | null
  dateFrom: string
  dateTo: string
}

export type ProductionDashboardPayload = ReturnType<typeof buildProductionDashboardPayload>

export function buildProductionDashboardPayload(rows: ProductionOrderMetric[], totalWipQty: number) {
  const summary = summarizeProductionMetrics(rows)
  const byStatus = Object.values(rows.reduce<Record<string, { count: number; status: string }>>((acc, row) => {
    acc[row.status] ??= { count: 0, status: row.status }
    acc[row.status].count += 1
    return acc
  }, {}))
  const topProducts = summarizeProductionOutputProducts(rows)
    .map((item) => ({ ...item, avgCost: item.unitCost }))
    .slice(0, 10)

  const abnormal = rows.reduce((acc, row) => {
    const normalLossQty = row.inputQty * row.normalLossPercent / 100
    const abnormalLossQty = Math.max(0, row.lossQty - normalLossQty)
    const abnormalLossValue = abnormalLossQty * row.rmCostPerKg
    if (row.inputQty > 0 && row.lossPct > row.normalLossPercent) acc.abnormalOrderCount += 1
    acc.abnormalLossQty += abnormalLossQty
    acc.abnormalLossValue += abnormalLossValue
    return acc
  }, { abnormalLossQty: 0, abnormalLossValue: 0, abnormalOrderCount: 0 })

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

  const machineUtil = Object.values(rows.reduce<Record<string, { batches: number; cost: number; id: string; name: string; qty: number }>>((acc, row) => {
    const id = row.machineId ?? `name:${row.machineName}`
    acc[id] ??= { batches: 0, cost: 0, id: row.machineId ?? '', name: row.machineName, qty: 0 }
    row.outputProducts.forEach((output) => {
      acc[id].batches += 1
      acc[id].qty += output.qty
      acc[id].cost += output.cost
    })
    return acc
  }, {})).filter((item) => item.batches > 0).sort((a, b) => b.qty - a.qty)

  return {
    daily,
    machineUtil,
    monthly,
    rows: rows.slice(0, 20),
    summary: { ...summary, ...abnormal, totalWipQty },
    byStatus,
    topProducts,
  }
}

export async function loadProductionDashboard(filters: ProductionDashboardFilters): Promise<ProductionDashboardPayload> {
  const [rows, totalWipQty] = await Promise.all([
    loadProductionDashboardRows({
      allowedBranchIds: filters.allowedBranchIds,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
    loadProductionDashboardWip({ allowedBranchIds: filters.allowedBranchIds }),
  ])

  return buildProductionDashboardPayload(rows, totalWipQty)
}
