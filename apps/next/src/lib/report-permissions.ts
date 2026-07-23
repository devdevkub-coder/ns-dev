/**
 * View permissions for the standalone pages in Dashboard & Reports.
 * Keep these codes stable: they are persisted in app_permissions and assigned
 * to roles through Supabase migrations.
 */
export const REPORT_PAGE_PERMISSIONS = {
  ownerDaily: 'reports.owner_daily.view',
  dailyReport: 'reports.daily_report.view',
  analyticsDashboard: 'reports.analytics_dashboard.view',
  dashboardOverview: 'reports.dashboard.view',
  profitCostAnalysis: 'reports.profit_cost.view',
  salesPlan: 'reports.sales_plan.view',
  salesPlanAnalysis: 'reports.sales_plan_analysis.view',
  salesTracking: 'reports.sales_tracking.view',
  cashFlowCalendar: 'reports.cash_flow_calendar.view',
  businessCalendar: 'reports.business_calendar.view',
  cashOthersSummary: 'reports.cash_others_summary.view',
  expenseDashboard: 'reports.expense_dashboard.view',
  tradingDashboard: 'reports.trading_dashboard.view',
  poOutstanding: 'reports.po_outstanding.view',
  reportsIndex: 'reports.reports_index.view',
} as const

export type ReportPagePermission = (typeof REPORT_PAGE_PERMISSIONS)[keyof typeof REPORT_PAGE_PERMISSIONS]
