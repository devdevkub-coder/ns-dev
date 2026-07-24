import { describe, expect, it } from 'vitest'
import { createProductionOutputSchema, updateProductionOrderActionSchema } from './production-orders'

describe('production write contracts', () => {
  it('defaults completion confirmation to false', () => {
    expect(updateProductionOrderActionSchema.parse({ action: 'complete' })).toEqual({
      action: 'complete',
      confirmCloseWithWip: false,
    })
  })

  it('allows a loss-only production result when WIP is consumed', () => {
    const parsed = createProductionOutputSchema.parse({
      date: '2026-07-24',
      lossQty: 10,
      sourceWipLines: [{ productCode: 'SKU001', qty: 10, sourceWarehouseCode: 'RM-SK', stockCategory: 'RM' }],
    })
    expect(parsed.lines).toEqual([])
    expect(parsed.lossQty).toBe(10)
  })

  it('rejects duplicate WIP source rows in one output request', () => {
    expect(() => createProductionOutputSchema.parse({
      date: '2026-07-24',
      lines: [{ categoryCode: 'FG', destinationWarehouseCode: 'FG-SK', netQty: 10, productCode: 'SKU001' }],
      sourceWipLines: [
        { productCode: 'SKU001', qty: 5, sourceWarehouseCode: 'RM-SK', stockCategory: 'RM' },
        { productCode: 'SKU001', qty: 5, sourceWarehouseCode: 'RM-SK', stockCategory: 'RM' },
      ],
    })).toThrow('วัตถุดิบใน WIP แหล่งเดียวกันซ้ำกันไม่ได้')
  })
})
