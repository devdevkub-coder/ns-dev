import { describe, expect, it } from 'vitest'
import { planningKpi } from './stock-planning-kpi'

function plan(overrides: { rows?: number; shortage?: number } = {}) {
  const rowCount = overrides.rows ?? 0
  return {
    rows: Array.from({ length: rowCount }, (_, index) => ({ enough: index < rowCount - 1 })),
    shortage: overrides.shortage ?? 0,
  }
}

describe('planningKpi', () => {
  it('counts products (not PO Sell lines) with pending sell', () => {
    // One product with TWO open PO Sell lines must still count once.
    const kpi = planningKpi([plan({ rows: 2 }), plan({ rows: 1 })])
    expect(kpi.sellCount).toBe(2)
    expect(kpi.readyCount + kpi.shortCount).toBe(2)
  })

  it('marks a product พร้อมส่ง only when every line is covered', () => {
    const kpi = planningKpi([plan({ rows: 2, shortage: 0 })])
    expect(kpi.sellCount).toBe(1)
    expect(kpi.readyCount).toBe(1)
    expect(kpi.shortCount).toBe(0)
  })

  it('marks a product ขาด when any line is short', () => {
    const kpi = planningKpi([plan({ rows: 2, shortage: 500 })])
    expect(kpi.sellCount).toBe(1)
    expect(kpi.readyCount).toBe(0)
    expect(kpi.shortCount).toBe(1)
  })

  it('excludes products without any PO Sell from the sell counts', () => {
    const kpi = planningKpi([plan(), plan({ rows: 1 })])
    expect(kpi.sellCount).toBe(1)
    expect(kpi.readyCount + kpi.shortCount).toBe(1)
  })

  it('sums shortage kg only for short products', () => {
    const kpi = planningKpi([
      plan({ rows: 1, shortage: 1000 }),
      plan({ rows: 1, shortage: 500.5 }),
      plan({ rows: 1, shortage: 0 }),
    ])
    expect(kpi.shortageKg).toBe(1500.5)
  })

  it('keeps ready + short equal to the sell count in mixed datasets', () => {
    const kpi = planningKpi([
      plan({ rows: 3, shortage: 0 }),
      plan({ rows: 1, shortage: 120 }),
      plan({ rows: 2, shortage: 0 }),
      plan({ rows: 1, shortage: 0.001 }),
      plan(),
    ])
    expect(kpi.sellCount).toBe(4)
    expect(kpi.readyCount).toBe(3)
    expect(kpi.shortCount).toBe(1)
    expect(kpi.readyCount + kpi.shortCount).toBe(kpi.sellCount)
  })
})
