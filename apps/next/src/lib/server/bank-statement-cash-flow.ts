export const BANK_STATEMENT_CASH_FLOW_CATEGORY = {
  INTERNAL_TRANSFER: 'internal_transfer',
  OPERATIONAL_RECEIPT: 'OP_IN_CUST_RECEIPT',
  OPERATIONAL_EXPENSE: 'OP_OUT_EXPENSE',
  OPERATIONAL_INTEREST: 'OP_OUT_INTEREST',
  OPERATIONAL_SUPPLIER: 'OP_OUT_SUPPLIER',
} as const

export const BANK_STATEMENT_SOURCE_EVENT_TYPE = {
  CUSTOMER_RECEIPT_FCD_REVERSAL: 'customer_receipt_fcd_reversal',
  CUSTOMER_RECEIPT_FCD_SETTLEMENT: 'customer_receipt_fcd_settlement',
  FCD_CONVERSION_DESTINATION: 'fcd_conversion_destination',
  FCD_CONVERSION_REVERSAL_DESTINATION: 'fcd_conversion_reversal_destination',
  FCD_CONVERSION_REVERSAL_SOURCE: 'fcd_conversion_reversal_source',
  FCD_CONVERSION_SOURCE: 'fcd_conversion_source',
  FCD_REVALUATION: 'fcd_revaluation',
  FCD_REVALUATION_REVERSAL: 'fcd_revaluation_reversal',
  INTERNAL_TRANSFER_DESTINATION: 'internal_transfer_destination',
  INTERNAL_TRANSFER_SOURCE: 'internal_transfer_source',
} as const

type BankStatementCashFlowRow = {
  cash_flow_category: string | null
  source_event_type?: string | null
}

export function hasBankStatementCashFlowCategory(
  row: BankStatementCashFlowRow,
  category: string,
) {
  return row.cash_flow_category === category
}

export function isInternalBankStatementTransfer(row: BankStatementCashFlowRow) {
  if (hasBankStatementCashFlowCategory(row, BANK_STATEMENT_CASH_FLOW_CATEGORY.INTERNAL_TRANSFER)) return true
  return new Set<string>([
    BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_DESTINATION,
    BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_REVERSAL_DESTINATION,
    BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_REVERSAL_SOURCE,
    BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_SOURCE,
    BANK_STATEMENT_SOURCE_EVENT_TYPE.INTERNAL_TRANSFER_DESTINATION,
    BANK_STATEMENT_SOURCE_EVENT_TYPE.INTERNAL_TRANSFER_SOURCE,
  ]).has(row.source_event_type ?? '')
}

export function isOperatingBankStatementCashFlow(row: BankStatementCashFlowRow) {
  return row.cash_flow_category?.startsWith('OP_') === true
}
