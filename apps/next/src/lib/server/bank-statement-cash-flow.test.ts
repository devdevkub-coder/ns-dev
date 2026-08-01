import { describe, expect, it } from 'vitest'
import {
  BANK_STATEMENT_CASH_FLOW_CATEGORY,
  BANK_STATEMENT_SOURCE_EVENT_TYPE,
  hasBankStatementCashFlowCategory,
  isInternalBankStatementTransfer,
  isOperatingBankStatementCashFlow,
} from './bank-statement-cash-flow'

describe('Bank Statement cash-flow classification', () => {
  it('uses the persisted category and never infers a transfer from text', () => {
    expect(isInternalBankStatementTransfer({ cash_flow_category: 'internal_transfer' })).toBe(true)
    expect(isInternalBankStatementTransfer({ cash_flow_category: 'OP_OUT_SUPPLIER' })).toBe(false)
    expect(isInternalBankStatementTransfer({ cash_flow_category: null })).toBe(false)
    expect(isInternalBankStatementTransfer({ cash_flow_category: null, source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.FCD_CONVERSION_SOURCE })).toBe(true)
    expect(isInternalBankStatementTransfer({ cash_flow_category: null, source_event_type: BANK_STATEMENT_SOURCE_EVENT_TYPE.CUSTOMER_RECEIPT_FCD_SETTLEMENT })).toBe(false)
  })

  it('recognizes only persisted operating categories', () => {
    expect(isOperatingBankStatementCashFlow({ cash_flow_category: 'OP_IN_CUST_RECEIPT' })).toBe(true)
    expect(isOperatingBankStatementCashFlow({ cash_flow_category: 'internal_transfer' })).toBe(false)
    expect(hasBankStatementCashFlowCategory({ cash_flow_category: 'OP_OUT_EXPENSE' }, BANK_STATEMENT_CASH_FLOW_CATEGORY.OPERATIONAL_EXPENSE)).toBe(true)
  })
})
