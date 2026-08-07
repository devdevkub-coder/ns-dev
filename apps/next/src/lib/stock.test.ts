import { describe, expect, it } from 'vitest'

import { buildGradeAdjustmentSourceLedgerLines, gradeAdjustmentDocumentPrefix, isVisibleStockBalanceTotal, nextGradeAdjustmentDocumentNo, stockStatusSchema } from './stock'

describe('stock balance matrix visibility', () => {
  const emptyBalance = { awaitingBillQty: 0, onHoldQty: 0, qty: 0, value: 0 }

  it('hides a product when multiple source rows aggregate to zero', () => {
    expect(isVisibleStockBalanceTotal([
      { ...emptyBalance, qty: 10, value: 100 },
      { ...emptyBalance, qty: -10, value: -100 },
    ])).toBe(false)
  })

  it('keeps a standalone negative product visible', () => {
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, qty: -20 }])).toBe(true)
  })

  it('keeps positive stock that is fully on hold visible', () => {
    expect(isVisibleStockBalanceTotal([
      { awaitingBillQty: 0, onHoldQty: 25, qty: 25, value: 2_500 },
    ])).toBe(true)
  })

  it('keeps zero-quantity products with value or pending work visible', () => {
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, value: 20 }])).toBe(true)
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, awaitingBillQty: 20 }])).toBe(true)
    expect(isVisibleStockBalanceTotal([{ ...emptyBalance, onHoldQty: 20 }])).toBe(true)
  })

  it('does not use ready quantity to decide visibility', () => {
    const readyOnlyBalance = { ...emptyBalance, readyQty: 20 }
    expect(isVisibleStockBalanceTotal([readyOnlyBalance])).toBe(false)
  })
})

describe('grade adjustment ledger bucket contract', () => {
  it('builds the branch/year/month document prefix and four-digit sequence', () => {
    const prefix = gradeAdjustmentDocumentPrefix('01', '2026-08-07')
    expect(prefix).toBe('GA012608-')
    expect(nextGradeAdjustmentDocumentNo(prefix, null)).toBe('GA012608-0001')
    expect(nextGradeAdjustmentDocumentNo(prefix, 'GA012608-0001')).toBe('GA012608-0002')
  })

  it('writes one source-out line for non-Cost Pool products', () => {
    expect(buildGradeAdjustmentSourceLedgerLines({
      allocations: [],
      sourceLotNo: null,
      sourceQty: 6,
      sourceUnitCost: 65.45,
      usesCostPool: false,
    })).toEqual([{ lotNo: null, qty: 6, unitCost: 65.45 }])
  })

  it('keeps one source-out line per Cost Pool allocation', () => {
    expect(buildGradeAdjustmentSourceLedgerLines({
      allocations: [{ lotNo: 'L1', qty: 4, unitCost: 60 }, { lotNo: 'L2', qty: 2, unitCost: 70 }],
      sourceLotNo: null,
      sourceQty: 6,
      sourceUnitCost: 63.33,
      usesCostPool: true,
    })).toEqual([{ lotNo: 'L1', qty: 4, unitCost: 60 }, { lotNo: 'L2', qty: 2, unitCost: 70 }])
  })

  it('accepts warehouse stock categories used by required stock ledger fields', () => {
    expect(stockStatusSchema.parse('RM')).toBe('RM')
    expect(stockStatusSchema.parse('WIP')).toBe('WIP')
    expect(stockStatusSchema.parse('FG')).toBe('FG')
  })

  it('rejects a missing or malformed warehouse category instead of writing null output_category', () => {
    expect(stockStatusSchema.safeParse(null).success).toBe(false)
    expect(stockStatusSchema.safeParse('RM-SK').success).toBe(false)
  })
})
