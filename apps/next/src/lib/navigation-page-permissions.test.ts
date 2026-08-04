import { describe, expect, it } from 'vitest'
import { canAccessPath, permissionCodesForPath, permissionForPath } from './navigation'
import { REPORT_PAGE_PERMISSIONS } from './report-permissions'
import { FINANCE_DEBT_PAGE_PERMISSIONS } from './finance-debt-permissions'
import { SUPPLIER_PAGE_PERMISSIONS } from './supplier-page-permissions'
import { MASTER_DATA_PAGE_PERMISSIONS } from './master-data-page-permissions'

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

describe('Supplier page permissions', () => {
  it('uses the supplier page permission for its options API', () => {
    expect(permissionForPath('/master-data/suppliers')).toBe(SUPPLIER_PAGE_PERMISSIONS.view)
    expect(permissionForPath('/api/master-data/suppliers/options')).toBe(SUPPLIER_PAGE_PERMISSIONS.view)
    expect(permissionForPath('/api/master-data/customers/options')).toBe(MASTER_DATA_PAGE_PERMISSIONS.customers.view)
    expect(permissionForPath('/api/master-data/products/options')).toBe(MASTER_DATA_PAGE_PERMISSIONS.products.view)
    expect(permissionForPath('/api/master-data/impurities')).toBe(MASTER_DATA_PAGE_PERMISSIONS.impurities.view)
    expect(permissionForPath('/api/master-data/impurities/IMP-001')).toBe(MASTER_DATA_PAGE_PERMISSIONS.impurities.status)
    expect(permissionForPath('/api/master-data/product-types/PT001')).toBe('master.product_types.status')
    expect(permissionForPath('/api/master-data/product-units/U001')).toBe('master.product_units.status')
    expect(permissionForPath('/api/master-data/salespersons')).toBe(MASTER_DATA_PAGE_PERMISSIONS.salespersons.view)
    expect(permissionForPath('/api/master-data/salespersons/SA001')).toBe(MASTER_DATA_PAGE_PERMISSIONS.salespersons.update)
    expect(permissionForPath('/api/master-data/salespersons/SA001/status')).toBe(MASTER_DATA_PAGE_PERMISSIONS.salespersons.status)
    expect(permissionForPath('/api/daily/bill-swap-history')).toBe('purchase.bills.view')
    expect(permissionForPath('/api/purchase/payments/cancel')).toBe('purchase.bills.pay')
    expect(permissionForPath('/api/purchase/payments/cancel-approved')).toBe('purchase.bills.pay')
  })

  it('allows customer and supplier forms to share the Thai address lookup API', () => {
    expect(permissionForPath('/api/master-data/thai-address')).toBe(MASTER_DATA_PAGE_PERMISSIONS.customers.view)
    expect(permissionCodesForPath('/api/master-data/thai-address')).toEqual([
      MASTER_DATA_PAGE_PERMISSIONS.customers.view,
      SUPPLIER_PAGE_PERMISSIONS.view,
    ])
  })
})

describe('Sorting and production department boundaries', () => {
  const sortingPermissions = [
    'daily.weight_tickets.view',
    'daily.weight_tickets.create',
    'daily.weight_tickets.update',
    'daily.weight_tickets.confirm',
    'daily.weight_tickets.cancel',
    'daily.weight_tickets.share',
  ]
  const productionPermissions = [
    ...sortingPermissions,
    'production.operations.view',
    'production.orders.view',
    'production.orders.create',
    'production.orders.input',
    'production.orders.input_return',
    'production.orders.output',
    'production.orders.reverse',
    'production.orders.complete',
    'production.orders.cancel',
    'production.orders.export',
    'production.reports.view',
  ]

  it('maps production product stock to the production-order permission', () => {
    expect(permissionCodesForPath('/api/production/orders/product-stock')).toEqual(['production.orders.view'])
    expect(canAccessPath('/api/production/orders/product-stock', { permissions: productionPermissions })).toBe(true)
    expect(canAccessPath('/api/production/orders/product-stock', { permissions: sortingPermissions })).toBe(false)
  })

  it('keeps stock menus outside both department role contracts', () => {
    for (const path of ['/stock/balance', '/stock/ledger', '/stock/transfer', '/stock/adjust', '/stock/convert', '/stock/status-convert']) {
      expect(permissionCodesForPath(path)).toEqual(['stock.ledger.view'])
      expect(canAccessPath(path, { permissions: sortingPermissions })).toBe(false)
      expect(canAccessPath(path, { permissions: productionPermissions })).toBe(false)
    }
  })

  it('keeps purchase and sales bills outside both department role contracts', () => {
    for (const path of ['/purchase/bills', '/sales/bills']) {
      expect(canAccessPath(path, { permissions: sortingPermissions })).toBe(false)
      expect(canAccessPath(path, { permissions: productionPermissions })).toBe(false)
    }
  })
})
