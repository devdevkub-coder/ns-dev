import { describe, expect, it } from 'vitest'
import { calculateCashPositionMetrics } from './cash-position-metrics'

describe('calculateCashPositionMetrics', () => {
  it('keeps AR out of cash available today while including it in net working capital', () => {
    expect(calculateCashPositionMetrics({ cashTotal: 2_380_000, bankTotal: 0, fcdTotal: 0, arTotal: 99_500_000, apTotal: 73_280_000 })).toEqual({
      availableToday: 2_380_000,
      netWorkingCapital: 28_600_000,
    })
  })

  it('does not add OD availability to cash available today', () => {
    expect(calculateCashPositionMetrics({ cashTotal: 2_380_000, bankTotal: 0, fcdTotal: 0, arTotal: 0, apTotal: 0 }).availableToday).toBe(2_380_000)
  })
})
