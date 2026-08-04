import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const salesOptionsRoute = readFileSync(new URL('../app/api/sales/bills/options/route.ts', import.meta.url), 'utf8')
const purchaseOptionsRoute = readFileSync(new URL('../app/api/purchase/bills/options/route.ts', import.meta.url), 'utf8')

describe('bill options permission boundary', () => {
  it('uses the sales bill view permission for sales options', () => {
    expect(salesOptionsRoute).toContain("requirePermission(context, 'sales.bills.view')")
    expect(salesOptionsRoute).not.toContain("requirePermission(context, 'finance.cash.view')")
  })

  it('uses the purchase bill view permission for purchase options', () => {
    expect(purchaseOptionsRoute).toContain("requirePermission(context, 'purchase.bills.view')")
    expect(purchaseOptionsRoute).not.toContain("requirePermission(context, 'finance.cash.view')")
  })
})
