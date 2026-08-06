import { describe, expect, it } from 'vitest'
import { buildWeightTicketDetailUrl } from './weight-ticket-share'
import { canPrintWeightTicket, canShareWeightTicket } from './weight-tickets'

describe('weight-ticket print action', () => {
  it('does not allow printing draft or cancelled tickets', () => {
    expect(canPrintWeightTicket('draft')).toBe(false)
    expect(canPrintWeightTicket('cancelled')).toBe(false)
  })

  it('allows printing confirmed tickets', () => {
    expect(canPrintWeightTicket('received')).toBe(true)
    expect(canPrintWeightTicket('delivered')).toBe(true)
    expect(canPrintWeightTicket('partially_billed')).toBe(true)
    expect(canPrintWeightTicket('billed')).toBe(true)
  })

  it('does not allow sharing draft or cancelled tickets', () => {
    expect(canShareWeightTicket('draft')).toBe(false)
    expect(canShareWeightTicket('cancelled')).toBe(false)
    expect(canShareWeightTicket('received')).toBe(true)
    expect(canShareWeightTicket('partially_billed')).toBe(true)
    expect(canShareWeightTicket('billed')).toBe(true)
  })

  it('builds typed modal deep links for both ticket types', () => {
    expect(buildWeightTicketDetailUrl('WTI-1', 'WTI')).toBe('/daily/weight-ticket-list?detail=WTI-1&type=WTI')
    expect(buildWeightTicketDetailUrl('WTO-1', 'WTO')).toBe('/daily/weight-ticket-list?detail=WTO-1&type=WTO')
  })
})
