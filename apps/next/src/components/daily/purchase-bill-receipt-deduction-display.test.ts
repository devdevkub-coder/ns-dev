import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const purchaseRouteSource = readFileSync(
  fileURLToPath(new URL('../../app/api/purchase/bills/route.ts', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')
const pageSource = readFileSync(
  fileURLToPath(new URL('./TransactionBillsPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')

describe('purchase bill receipt deduction display', () => {
  it('shows the combined container and impurity deduction from the WTI summary', () => {
    expect(purchaseRouteSource).toContain('totalDeductWeight: toNumber(summary.container_deduction_weight) + toNumber(summary.deduct_weight)')
    expect(pageSource).toContain('totalDeductWeight: number')
    expect(pageSource).toContain('formatMoney(sourceSummary?.totalDeductWeight ?? sourceSummary?.deductWeight ?? item.deductWeight)')
  })
})
