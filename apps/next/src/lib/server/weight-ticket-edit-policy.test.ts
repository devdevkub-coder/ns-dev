import { describe, expect, it } from 'vitest'
import { canEditWeightTicket } from './weight-tickets'

const noUsage = {
  purchaseCount: 0,
  purchaseDocNos: [],
  salesCount: 0,
  salesDocNos: [],
}

describe('weight ticket edit policy', () => {
  it('allows WTI edits while draft or received before Purchase Bill usage', () => {
    expect(canEditWeightTicket({ docType: 'WTI', status: 'draft' }, noUsage)).toBe(true)
    expect(canEditWeightTicket({ docType: 'WTI', status: 'received' }, noUsage)).toBe(true)
    expect(canEditWeightTicket({ docType: 'WTI', status: 'received' }, { ...noUsage, purchaseCount: 1 })).toBe(false)
    expect(canEditWeightTicket({ docType: 'WTI', status: 'cancelled' }, noUsage)).toBe(false)
  })

  it('allows an unbilled delivered WTO edit for the pending-out replacement flow', () => {
    expect(canEditWeightTicket({ docType: 'WTO', status: 'draft' }, noUsage)).toBe(true)
    expect(canEditWeightTicket({ docType: 'WTO', status: 'delivered' }, noUsage)).toBe(true)
    expect(canEditWeightTicket({ docType: 'WTO', status: 'cancelled' }, noUsage)).toBe(false)
  })

  it('blocks edits after the ticket is used in a downstream bill', () => {
    expect(canEditWeightTicket({ docType: 'WTO', status: 'delivered' }, { ...noUsage, salesCount: 1 })).toBe(false)
  })
})
