import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

const apReaders = [
  'src/app/api/finance/ap/route.ts',
  'src/components/purchase-flow/AccountsPayablePageClient.tsx',
]

function source(path: string) {
  return readFileSync(resolve(appRoot, path), 'utf8')
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

  it('keeps AP isolated from Customer Receipt foreign-settlement facts', () => {
    for (const path of apReaders) {
      const content = source(path)

      expect(content, path).not.toMatch(/customer_receipt|receipt_currency|received_native_amount|settlement_fx_difference/)
    }
    expect(source(apReaders[0]!)).toContain('purchase_bills')
  })
})
