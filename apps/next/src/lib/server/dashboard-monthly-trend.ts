export type DashboardMonthlyTrend = {
  cogs: number
  expense: number
  gp: number
  label: string
  purchase: number
  sales: number
}

type MonthlyTrendInput = {
  historical: Array<{ amount: number; categoryId: string | null; metricType: string | null; month: string }>
  liveExpenses: Array<{ amount: number; month: string }>
  livePurchases: Array<{ amount: number; month: string }>
  liveSales: Array<{ amount: number; cogs: number; grossProfit: number; month: string }>
}

export function buildDashboardMonthlyTrend(input: MonthlyTrendInput): DashboardMonthlyTrend[] {
  const monthlyTrendMap = new Map<string, DashboardMonthlyTrend>()
  const ensureMonth = (label: string) => {
    const current = monthlyTrendMap.get(label) ?? { cogs: 0, expense: 0, gp: 0, label, purchase: 0, sales: 0 }
    monthlyTrendMap.set(label, current)
    return current
  }

  input.livePurchases.forEach((row) => { ensureMonth(row.month).purchase += row.amount })
  input.liveSales.forEach((row) => {
    const month = ensureMonth(row.month)
    month.sales += row.amount
    month.cogs += row.cogs
    month.gp += row.grossProfit
  })
  input.liveExpenses.forEach((row) => { ensureMonth(row.month).expense += row.amount })
  input.historical.forEach((row) => {
    const month = ensureMonth(row.month)
    if (row.metricType === 'pnl' && row.categoryId === 'revenue') month.sales += row.amount
    if (row.metricType === 'pnl' && row.categoryId === 'cogs') {
      month.cogs += row.amount
      month.purchase += row.amount
      month.gp -= row.amount
    }
    if (row.metricType === 'expense') month.expense += row.amount
  })

  return Array.from(monthlyTrendMap.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-6)
}
