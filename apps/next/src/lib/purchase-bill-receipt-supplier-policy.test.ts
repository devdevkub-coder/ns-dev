import { describe, expect, it } from 'vitest'
import { isPurchaseBillReceiptSupplierAllowed } from './purchase-bill-receipt-supplier-policy'

describe('purchase bill receipt supplier policy', () => {
  const ticketId = 101n
  const otherTicketId = 202n
  const supplierId = 1n
  const differentSupplierId = 2n

  it('requires matching suppliers when creating a purchase bill', () => {
    const policy = { mode: 'required' } as const

    expect(isPurchaseBillReceiptSupplierAllowed({ policy, resolvedSupplierId: supplierId, ticketId, ticketSupplierId: supplierId })).toBe(true)
    expect(isPurchaseBillReceiptSupplierAllowed({ policy, resolvedSupplierId: supplierId, ticketId, ticketSupplierId: differentSupplierId })).toBe(false)
  })

  it('allows a changed supplier only for a WTI already linked to the purchase bill', () => {
    const policy = { mode: 'allow-linked-ticket-ids', ticketIds: new Set([ticketId]) } as const

    expect(isPurchaseBillReceiptSupplierAllowed({ policy, resolvedSupplierId: supplierId, ticketId, ticketSupplierId: differentSupplierId })).toBe(true)
    expect(isPurchaseBillReceiptSupplierAllowed({ policy, resolvedSupplierId: supplierId, ticketId: otherTicketId, ticketSupplierId: differentSupplierId })).toBe(false)
  })
})
