import { describe, expect, it } from 'vitest'
import { permissionCodesForPath, permissionForPath } from './navigation'
import { REPORT_PAGE_PERMISSIONS } from './report-permissions'
import { FINANCE_DEBT_PAGE_PERMISSIONS } from './finance-debt-permissions'

describe('Dashboard & Reports page permissions', () => {
  it('maps each main page to its own view permission', () => {
    expect(permissionForPath('/owner-daily')).toBe(REPORT_PAGE_PERMISSIONS.ownerDaily)
    expect(permissionForPath('/daily-report')).toBe(REPORT_PAGE_PERMISSIONS.dailyReport)
    expect(permissionForPath('/dashboard-overview')).toBe(REPORT_PAGE_PERMISSIONS.dashboardOverview)
    expect(permissionForPath('/profit-cost-analysis')).toBe(REPORT_PAGE_PERMISSIONS.profitCostAnalysis)
    expect(permissionForPath('/sales-plan')).toBe(REPORT_PAGE_PERMISSIONS.salesPlan)
    expect(permissionForPath('/sales-plan-analysis')).toBe(REPORT_PAGE_PERMISSIONS.salesPlanAnalysis)
    expect(permissionForPath('/sales-commission')).toBe(REPORT_PAGE_PERMISSIONS.salesTracking)
    expect(permissionForPath('/cash-flow-calendar')).toBe(REPORT_PAGE_PERMISSIONS.cashFlowCalendar)
    expect(permissionForPath('/business-calendar')).toBe(REPORT_PAGE_PERMISSIONS.businessCalendar)
    expect(permissionForPath('/cash-others-summary')).toBe(REPORT_PAGE_PERMISSIONS.cashOthersSummary)
  })

  it('uses the same page permission at the API boundary', () => {
    expect(permissionForPath('/api/owner-daily')).toBe(REPORT_PAGE_PERMISSIONS.ownerDaily)
    expect(permissionForPath('/api/daily-report')).toBe(REPORT_PAGE_PERMISSIONS.dailyReport)
    expect(permissionForPath('/api/sales-plan-analysis')).toBe(REPORT_PAGE_PERMISSIONS.salesPlanAnalysis)
    expect(permissionForPath('/api/profit-cost-analysis')).toBe(REPORT_PAGE_PERMISSIONS.profitCostAnalysis)
  })
})

describe('Finance & Debt page permissions', () => {
  it('maps each finance & debt page to its own view permission', () => {
    expect(permissionForPath('/trading/matching')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.tradingMatching)
    expect(permissionForPath('/purchase/payments')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.payments)
    expect(permissionForPath('/sales/receipts')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.receipts)
    expect(permissionForPath('/daily/transfer')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.transfers)
    expect(permissionForPath('/finance/ar')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.accountsReceivable)
    expect(permissionForPath('/finance/ap')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.accountsPayable)
    expect(permissionForPath('/finance/bank')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.bankStatement)
    expect(permissionForPath('/finance/cash-position')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.cashPosition)
  })

  it('uses the same page permission at the finance API boundary', () => {
    expect(permissionForPath('/api/purchase/payment-history')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.payments)
    expect(permissionForPath('/api/purchase/payments')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.payments)
    expect(permissionForPath('/api/sales/receipts')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.receipts)
    expect(permissionForPath('/api/daily/transfers')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.transfers)
    expect(permissionForPath('/api/finance/ar')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.accountsReceivable)
    expect(permissionForPath('/api/finance/ap')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.accountsPayable)
    expect(permissionForPath('/api/finance/bank')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.bankStatement)
    expect(permissionForPath('/api/finance/cash-position')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.cashPosition)
    expect(permissionForPath('/api/trading/matching')).toBe(FINANCE_DEBT_PAGE_PERMISSIONS.tradingMatching)
  })
})

describe('Reports menu page permissions', () => {
  it('maps the four report pages to independent view permissions', () => {
    expect(permissionForPath('/daily/expense-dashboard')).toBe(REPORT_PAGE_PERMISSIONS.expenseDashboard)
    expect(permissionForPath('/trading/dashboard')).toBe(REPORT_PAGE_PERMISSIONS.tradingDashboard)
    expect(permissionForPath('/po-reports/outstanding')).toBe(REPORT_PAGE_PERMISSIONS.poOutstanding)
    expect(permissionForPath('/reports')).toBe(REPORT_PAGE_PERMISSIONS.reportsIndex)
  })

  it('keeps the shared expense read API available to either expense page permission', () => {
    expect(permissionCodesForPath('/api/daily/expenses')).toEqual([
      'daily.expenses.view',
      REPORT_PAGE_PERMISSIONS.expenseDashboard,
    ])
  })
})

describe('Transaction Ledger page permissions', () => {
  it('uses an independent permission for the page and API', () => {
    expect(permissionCodesForPath('/admin/transaction-ledger')).toEqual([FINANCE_DEBT_PAGE_PERMISSIONS.transactionLedger])
    expect(permissionCodesForPath('/api/admin/transaction-ledger')).toEqual([FINANCE_DEBT_PAGE_PERMISSIONS.transactionLedger])
  })
})
