import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { requiresWeightTicketOpenBillPermission, WEIGHT_TICKET_OPEN_BILL_PERMISSION } from './weight-ticket-open-bill-permissions'

const purchaseBillsRoute = readFileSync(new URL('../../app/api/purchase/bills/route.ts', import.meta.url), 'utf8')
const salesBillsRoute = readFileSync(new URL('../../app/api/sales/bills/route.ts', import.meta.url), 'utf8')

describe('weight-ticket bill opening permission boundary', () => {
  it('requires open_bill for stock bills and explicit WTI/WTO sources, but not manual trading bills', () => {
    expect(requiresWeightTicketOpenBillPermission({ hasWeightTicketSource: false, transactionMode: 'STOCK' })).toBe(true)
    expect(requiresWeightTicketOpenBillPermission({ hasWeightTicketSource: true, transactionMode: 'TRADING' })).toBe(true)
    expect(requiresWeightTicketOpenBillPermission({ hasWeightTicketSource: false, transactionMode: 'TRADING' })).toBe(false)
  })

  it('enforces the same permission in both bill creation routes', () => {
    expect(purchaseBillsRoute).toContain('requiresWeightTicketOpenBillPermission')
    expect(purchaseBillsRoute).toContain(`WEIGHT_TICKET_OPEN_BILL_PERMISSION`)
    expect(salesBillsRoute).toContain('requiresWeightTicketOpenBillPermission')
    expect(salesBillsRoute).toContain(`WEIGHT_TICKET_OPEN_BILL_PERMISSION`)
  })
})
