import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const receiptPosting = readFileSync(new URL('./fcd-receipt-posting.ts', import.meta.url), 'utf8')
const conversionPosting = readFileSync(new URL('./fcd-conversion-posting.ts', import.meta.url), 'utf8')
const revaluationPosting = readFileSync(new URL('./fcd-revaluation-posting.ts', import.meta.url), 'utf8')
const verifier = readFileSync(new URL('../../../scripts/verify-fcd-account-lock-concurrency.mjs', import.meta.url), 'utf8')

describe('FCD posting lock concurrency contract', () => {
  it('requires every FCD writer to acquire the account-currency transaction lock', () => {
    for (const source of [receiptPosting, conversionPosting, revaluationPosting]) {
      expect(source).toContain("import { lockFcdAccountCurrency } from '@/lib/server/fcd-balance-lock'")
      expect(source).toContain('await lockFcdAccountCurrency(tx,')
    }
  })

  it('keeps the database verifier isolated from normal runtime credentials and cleans up its fixture', () => {
    expect(verifier).toContain('FCD_LOCK_TEST_DATABASE_URL')
    expect(verifier).not.toContain('process.env.DATABASE_URL')
    expect(verifier).toContain("hashtext('fcd-account-currency')")
    expect(verifier).toContain("delete from public.accounts where id = $1")
    expect(verifier).toContain('FCD lock ไม่ serialize transaction เดียวกัน')
  })
})
