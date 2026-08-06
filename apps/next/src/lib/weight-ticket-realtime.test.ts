import { describe, expect, it } from 'vitest'
import { isWeightTicketChangeEvent, weightTicketRealtimeChannel } from './weight-ticket-realtime'

describe('weight-ticket realtime contract', () => {
  it('uses branch-scoped channel names', () => {
    expect(weightTicketRealtimeChannel('branch/01')).toBe('weight-ticket-updates:branch%2F01')
  })

  it('rejects malformed or spoofed payloads', () => {
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: '2026-08-06T10:00:00.000Z' })).toBe(true)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'spoofed', documentNo: 'WTI-001', updatedAt: null })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: 'not-a-date' })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '', changeType: 'updated', documentNo: 'WTI-001', updatedAt: null })).toBe(false)
  })
})
