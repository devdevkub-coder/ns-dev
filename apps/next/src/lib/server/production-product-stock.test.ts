import { describe, expect, it } from 'vitest'
import { productionStockLedgerWhere, productionStockStatus } from './production-orders'

describe('production stock source-of-truth contract', () => {
  it('uses explicit RM/FG output categories', () => {
    const where = productionStockLedgerWhere({ branchId: 1n, productId: 2n, warehouseIds: [3n] })

    expect(where.output_category).toEqual({ in: ['RM', 'FG'] })
    expect(productionStockStatus(null)).toBe('')
  })

  it('normalizes explicit output categories', () => {
    expect(productionStockStatus(' fg ')).toBe('FG')
  })
})
