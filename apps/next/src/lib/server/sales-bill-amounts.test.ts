import { describe, expect, it } from 'vitest'
import { salesBillGrossProfitAmount, salesBillRevenueAmount } from './sales-bill-amounts'

describe('sales bill management amounts', () => {
  it('uses the pre-VAT revenue basis shared with P&L', () => {
    const bill = { cogs_amount: 600, total_amount: 1070, total_cost: 600, vat_amount: 70 }

    expect(salesBillRevenueAmount(bill)).toBe(1000)
    expect(salesBillGrossProfitAmount(bill)).toBe(400)
  })
})
