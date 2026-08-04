import { describe, expect, it } from 'vitest'
import { productionStockReceiptCost } from './production-orders'

describe('production stock receipt cost', () => {
  it('uses the WIP production cost when the destination FG warehouse is empty', () => {
    expect(productionStockReceiptCost({ outputQty: 10, productionCost: 841.83 })).toEqual({
      totalCost: 841.83,
      unitCost: 84.183,
    })
  })

  it('does not create a unit cost for zero output quantity', () => {
    expect(productionStockReceiptCost({ outputQty: 0, productionCost: 841.83 })).toEqual({
      totalCost: 841.83,
      unitCost: 0,
    })
  })
})
