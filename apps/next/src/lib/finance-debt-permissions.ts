export const FINANCE_DEBT_PAGE_PERMISSIONS = {
  accountsPayable: 'finance.debt_ap.view',
  accountsReceivable: 'finance.debt_ar.view',
  bankStatement: 'finance.debt_bank.view',
  cashPosition: 'finance.debt_cash_position.view',
  payments: 'finance.debt_payments.view',
  receipts: 'finance.debt_receipts.view',
  tradingMatching: 'finance.debt_trading_matching.view',
  transactionLedger: 'finance.transaction_ledger.view',
  transfers: 'finance.debt_transfers.view',
} as const

export type FinanceDebtPagePermissionCode = (typeof FINANCE_DEBT_PAGE_PERMISSIONS)[keyof typeof FINANCE_DEBT_PAGE_PERMISSIONS]
