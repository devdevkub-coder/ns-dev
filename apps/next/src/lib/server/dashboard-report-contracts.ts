export type DashboardReportFilters = {
  date: string
  from: string
  to: string
}

export type DashboardReportSourceState = {
  limitations: string[]
  writeActionsEnabled: false
}

export type OwnerDailyPayload = {
  filters: DashboardReportFilters
  ownerDaily: {
    actualActivity: { cashIn: number; cashOut: number; expenseOut: number; fgQty: number; fgValue: number; net: number; paymentOut: number }
    cashPlan: { available: number; expectedIn: number; expectedOut: number; gap: number }
    due: {
      ap: { amount: number; docNo: string; due: string; id: string; name: string }[]
      ar: { amount: number; daysOverdue: number; docNo: string; due: string; id: string; name: string }[]
    }
    expensesToday: { amount: number; docNo: string; id: string; payee: string; title: string }[]
    loanToday: { amount: number; contractNo: string; due: string; id: string; installmentNo: number }[]
    pending: Record<string, number>
  }
  sourceState: DashboardReportSourceState
}

export type DailyReportPayload = {
  filters: DashboardReportFilters
  dailyReport: {
    analytics: {
      bySalesperson: { amount: number; bills: number; id: string; name: string; qty: number; suppliers: number }[]
      dailyTrend: { label: string; purchase: number; sales: number }[]
      groupSummary: { amount: number; group: string; qty: number }[]
      rangeKpi: Record<string, number>
      topCustomers: { amount: number; bills: number; gp: number; gpPct: number; id: string; name: string; qty: number }[]
      topProductsIn: { amount: number; code: string; group: string; id: string; name: string; qty: number }[]
      topProductsOut: { amount: number; code: string; group: string; id: string; name: string; qty: number }[]
      topSuppliers: { amount: number; bills: number; id: string; name: string; qty: number }[]
    }
    cashMovement: {
      accounts: { cashIn: number; cashOut: number; name: string; type: string }[]
      byType: { cashIn: number; cashOut: number; label: string }[]
      cashIn: number
      cashOut: number
      net: number
    }
    expenseByCategory: { amount: number; count: number; name: string }[]
    expenseRows: { amount: number; category: string; docNo: string; payee: string }[]
    groupBreakdown: { buyAmt: number; buyQty: number; group: string; products: { buyAmt: number; buyQty: number; productCode: string; productId: string; productName: string; sellAmt: number; sellQty: number }[]; sellAmt: number; sellQty: number }[]
    purchaseBills: { amount: number; docNo: string; name: string; qty: number }[]
    salesBills: { amount: number; docNo: string; name: string; qty: number }[]
    summary: Record<string, number>
  }
  sourceState: DashboardReportSourceState
}

export type AnalyticsDashboardPayload = {
  filters: DashboardReportFilters
  analytics: DailyReportPayload['dailyReport']['analytics']
  sourceState: DashboardReportSourceState
}

const ownerKeys = new Set(['filters', 'ownerDaily', 'sourceState'])

export function assertOwnerDailyPayload(value: unknown): asserts value is OwnerDailyPayload {
  assertExactKeys(value, ownerKeys)
}

function assertExactKeys(value: unknown, allowed: Set<string>): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid dashboard report payload')
  const keys = Object.keys(value)
  if (keys.some((key) => !allowed.has(key))) throw new Error('Invalid dashboard report payload')
}
