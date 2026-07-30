import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = resolve(process.cwd())

const thbBankStatementReaders = [
  'src/lib/server/daily-report-dashboard.ts',
  'src/lib/server/finance-accounting-cash-position.ts',
  'src/lib/server/finance-accounting-cashflow-planning.ts',
  'src/lib/server/finance-accounting-statements.ts',
  'src/lib/server/main-calendars.ts',
  'src/lib/server/main-dashboards.ts',
  'src/lib/server/owner-daily-dashboard.ts',
]

const dashboardCashReaders = [
  'src/lib/server/daily-report-dashboard.ts',
  'src/lib/server/main-calendars.ts',
  'src/lib/server/main-dashboards.ts',
  'src/lib/server/owner-daily-dashboard.ts',
]

const apReaders = [
  'src/app/api/finance/ap/route.ts',
  'src/components/purchase-flow/AccountsPayablePageClient.tsx',
]

const directFactConsumerKind = {
  'src/app/api/admin/transaction-ledger/route.ts': 'thb-reader',
  'src/app/api/finance/bank/route.ts': 'thb-reader',
  'src/app/api/finance/customer-advance/route.ts': 'thb-reader',
  'src/app/api/finance/foreign/bank-reconciliation/route.ts': 'foreign-audit-reader',
  'src/app/api/finance/foreign/fx-gain-loss-report/route.ts': 'foreign-audit-reader',
  'src/app/api/finance/supplier-advance/route.ts': 'thb-reader',
  'src/app/api/purchase/payment-history/route.ts': 'thb-reader',
  'src/app/api/purchase/payments/cancel/route.ts': 'transactional-writer',
  'src/app/api/purchase/payments/route.ts': 'transactional-writer',
  'src/app/api/sales/receipts/route.ts': 'transactional-writer',
  'src/app/api/tracking/customer/route.ts': 'legacy-receipt-reader',
  'src/lib/server/customer-receipt-line-notification.ts': 'foreign-audit-reader',
  'src/lib/server/customer-receipts.ts': 'transactional-writer',
  'src/lib/server/daily-report-dashboard.ts': 'thb-reader',
  'src/lib/server/daily.ts': 'transactional-writer',
  'src/lib/server/fcd-posting-reconciliation.ts': 'transactional-writer',
  'src/lib/server/finance-accounting-cash-position.ts': 'thb-reader',
  'src/lib/server/finance-accounting-cashflow-planning.ts': 'thb-reader',
  'src/lib/server/finance-accounting-statements.ts': 'thb-reader',
  'src/lib/server/finance-accounting-tax.ts': 'receipt-book-reader',
  'src/lib/server/finance-accounting-working-capital.ts': 'receipt-fee-reader',
  'src/lib/server/main-calendars.ts': 'thb-reader',
  'src/lib/server/main-dashboards.ts': 'thb-reader',
  'src/lib/server/owner-daily-dashboard.ts': 'thb-reader',
} as const

const accountCurrencyConsumers = [
  'src/app/api/master-data/accounts/route.ts',
  'src/lib/server/fcd-conversion-posting.ts',
  'src/lib/server/fcd-receipt-posting.ts',
  'src/lib/server/fcd-revaluation-posting.ts',
  'src/lib/server/reference-master-cache.ts',
]

const relatedFactConsumerKind = {
  'src/app/api/finance/ar/route.ts': 'foreign-audit-reader',
  'src/app/api/master-data/accounts/route.ts': 'account-master',
  'src/app/api/sales/receipts/route.ts': 'transactional-writer',
  'src/lib/server/fcd-conversion-posting.ts': 'transactional-writer',
  'src/lib/server/fcd-receipt-posting.ts': 'transactional-writer',
  'src/lib/server/fcd-revaluation-posting.ts': 'transactional-writer',
  'src/lib/server/reference-master-cache.ts': 'reference-reader',
  'src/lib/server/sales-bill-cancel-policy.ts': 'receipt-status-reader',
} as const

function source(path: string) {
  return readFileSync(resolve(appRoot, path), 'utf8')
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return ['.ts', '.tsx'].includes(extname(entry.name)) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')
      ? [relative(appRoot, fullPath)]
      : []
  })
}

function directFactReaders() {
  return sourceFiles(resolve(appRoot, 'src'))
    .filter((path) => /\.(customer_receipts|receipts|bank_statement|account_currency_balances)\.(findMany|findUnique|findFirst|groupBy|aggregate|count)\(/.test(source(path)))
    .sort()
}

function relatedFactReaders() {
  return sourceFiles(resolve(appRoot, 'src'))
    .filter((path) => /\b(customer_receipts|account_currency_balances)\s*:/.test(source(path)))
    .sort()
}

describe('FCD consumer contract', () => {
  it('keeps legacy THB reports on Bank Statement amount_in/amount_out, not FCD audit values', () => {
    for (const path of thbBankStatementReaders) {
      const content = source(path)

      expect(content, path).toMatch(/amount_in|amount_out/)
      expect(content, path).not.toMatch(/book_amount_in|book_amount_out/)
    }
  })

  it('does not reintroduce Account Master opening balances into cash readers', () => {
    for (const path of thbBankStatementReaders) {
      expect(source(path), path).not.toMatch(/opening_balance/)
    }
  })

  it('counts a receipt cash event only from Bank Statement in dashboard read models', () => {
    for (const path of dashboardCashReaders) {
      const content = source(path)
      const cashReaderContent = path === 'src/lib/server/main-calendars.ts'
        ? content.slice(content.indexOf('export async function buildCashFlowCalendar'), content.indexOf('export async function buildBusinessCalendar'))
        : content
      expect(cashReaderContent, path).toMatch(/bank_statement/)
      expect(cashReaderContent, path).not.toMatch(/customer_receipts|\breceipts\b|fcd_ledger_entries/)
    }

    const cashPosition = source('src/lib/server/finance-accounting-cash-position.ts')
    expect(cashPosition).toContain('cashAndBank: balance')
    expect(cashPosition).toContain('fcdBalances: fcdBalances')
    expect(cashPosition).toContain('included in cashAndBank')
  })

  it('keeps AP isolated from Customer Receipt foreign-settlement facts', () => {
    for (const path of apReaders) {
      const content = source(path)

      expect(content, path).not.toMatch(/customer_receipt|receipt_currency|received_native_amount|settlement_fx_difference/)
    }
    expect(source(apReaders[0]!)).toContain('purchase_bills')
  })

  it('requires every direct financial-fact reader to declare its THB, foreign audit, or transactional contract', () => {
    expect(directFactReaders()).toEqual(Object.keys(directFactConsumerKind).sort())
  })

  it('keeps classified THB readers on persisted THB facts and keeps foreign audit readers explicit', () => {
    for (const [path, kind] of Object.entries(directFactConsumerKind)) {
      const content = source(path)
      if (kind === 'thb-reader') {
        expect(content, path).toMatch(/amount_in|amount_out/)
        expect(content, path).not.toMatch(/book_amount_in|book_amount_out/)
      }
      if (kind === 'receipt-book-reader') {
        expect(content, path).toContain('settlement_book_amount')
      }
      if (kind === 'receipt-fee-reader') {
        expect(content, path).toContain('bank_fee_total')
      }
      if (kind === 'foreign-audit-reader') {
        expect(content, path).toMatch(/movement_currency_code|receipt_currency_code|native_amount|book_amount|book_fx_rate/)
      }
    }
  })

  it('allows account-currency rows only in account master/reference or FCD posting services', () => {
    const discovered = sourceFiles(resolve(appRoot, 'src'))
      .filter((path) => /account_currency_balances/.test(source(path)))
      .filter((path) => !path.endsWith('fcd-consumer-contract.test.ts'))
      .sort()

    expect(discovered).toEqual(accountCurrencyConsumers.slice().sort())
  })

  it('requires relational receipt and account-currency consumers to declare their contract too', () => {
    expect(relatedFactReaders()).toEqual(Object.keys(relatedFactConsumerKind).sort())
  })

  it('does not allow Advance readers to invent a currency or FX rate', () => {
    for (const path of ['src/app/api/finance/customer-advance/route.ts', 'src/app/api/finance/supplier-advance/route.ts']) {
      const content = source(path)
      expect(content, path).toContain('movement_currency_code')
      expect(content, path).toContain('book_fx_rate')
      expect(content, path).not.toMatch(/currency:\s*row\.accounts\?\.currency\s*\?\?\s*['\"]THB['\"]/)
      expect(content, path).not.toMatch(/fxRate:\s*1\b/)
    }
  })
})
