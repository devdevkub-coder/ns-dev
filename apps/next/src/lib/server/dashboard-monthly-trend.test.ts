import { describe, expect, it } from 'vitest'
import { buildDashboardMonthlyTrend } from './dashboard-monthly-trend'

describe('buildDashboardMonthlyTrend', () => {
  it('keeps historical revenue out of monthly COGS', () => {
    const [month] = buildDashboardMonthlyTrend({
      historical: [
        { amount: 781_991.2, categoryId: 'revenue', metricType: 'pnl', month: '2026-08' },
        { amount: 100, categoryId: 'cogs', metricType: 'pnl', month: '2026-08' },
      ],
      liveExpenses: [],
      livePurchases: [],
      liveSales: [{ amount: 1_000, cogs: 400, grossProfit: 600, month: '2026-08' }],
    })

    expect(month).toMatchObject({ cogs: 500, sales: 782_991.2, expense: 0 })
  })
})
