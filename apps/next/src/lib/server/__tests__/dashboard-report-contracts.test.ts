import { describe, expect, it } from 'vitest'
import { assertOwnerDailyPayload } from '@/lib/server/dashboard-report-contracts'

describe('dashboard report contracts', () => {
  it('accepts an owner payload without unrelated report sections', () => {
    expect(() => assertOwnerDailyPayload({
      filters: { date: '2026-07-18', from: '2026-07-01', to: '2026-07-18' },
      ownerDaily: { actualActivity: {}, cashPlan: {}, due: {}, expensesToday: [], loanToday: [], pending: {} },
      sourceState: { limitations: [], writeActionsEnabled: false },
    })).not.toThrow()
  })

  it('rejects a payload with an unrelated dashboard section', () => {
    expect(() => assertOwnerDailyPayload({ dashboard: {}, filters: {}, ownerDaily: {}, sourceState: {} })).toThrow()
  })
})
