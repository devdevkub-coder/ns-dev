import { describe, expect, it } from 'vitest'
import { buildProfitLeakDonutSegments, formatProfitLeakCount } from './profit-leak-display'

describe('Profit Leak display helpers', () => {
  it('does not create donut segments when the source total is zero or unavailable', () => {
    expect(buildProfitLeakDonutSegments([100], 0)).toEqual([])
    expect(buildProfitLeakDonutSegments([100], undefined)).toEqual([])
  })

  it('scales donut segments from the source total when it is positive', () => {
    expect(buildProfitLeakDonutSegments([25, 75], 100)).toEqual([
      { dash: 110, offset: 0, value: 25 },
      { dash: 330, offset: 110, value: 75 },
    ])
  })

  it('marks count metrics as item counts so they are not confused with money', () => {
    expect(formatProfitLeakCount(10)).toBe('10 รายการ')
  })
})
