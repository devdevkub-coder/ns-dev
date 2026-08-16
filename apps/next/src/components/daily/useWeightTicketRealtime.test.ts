import { describe, expect, it } from 'vitest'

import { shouldWarnWeightTicketRealtimeStatus } from './useWeightTicketRealtime'

describe('useWeightTicketRealtime status logging', () => {
  it('does not warn for CLOSED after cleanup', () => {
    expect(shouldWarnWeightTicketRealtimeStatus('CLOSED', true)).toBe(false)
  })

  it('does not warn for a subscribed channel', () => {
    expect(shouldWarnWeightTicketRealtimeStatus('SUBSCRIBED')).toBe(false)
  })

  it('warns for failed subscription statuses', () => {
    expect(shouldWarnWeightTicketRealtimeStatus('CLOSED')).toBe(true)
    expect(shouldWarnWeightTicketRealtimeStatus('CHANNEL_ERROR')).toBe(true)
    expect(shouldWarnWeightTicketRealtimeStatus('TIMED_OUT')).toBe(true)
  })
})
