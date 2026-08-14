import { describe, expect, it } from 'vitest'
import { resolveSalesBillLineCostDisplay } from './sales-bill-detail'

describe('resolveSalesBillLineCostDisplay', () => {
  it('keeps WTO Stock COGS visible inside a mixed Trading bill', () => {
    const result = resolveSalesBillLineCostDisplay({
      cogsAmount: 646.5,
      hasStockSource: true,
      hasTradingAllocation: false,
      hasWtoSource: true,
      qty: 25,
      transactionMode: 'TRADING',
    })

    expect(result.sourceKind).toBe('WTO_STOCK')
    expect(result.unitCostSnapshot).toBeCloseTo(25.86, 6)
  })

  it('keeps PB-derived Trading COGS allocated', () => {
    const result = resolveSalesBillLineCostDisplay({
      cogsAmount: 51085,
      hasStockSource: false,
      hasTradingAllocation: true,
      hasWtoSource: false,
      qty: 30050,
      transactionMode: 'TRADING',
    })

    expect(result.sourceKind).toBe('TRADING_ALLOCATED')
    expect(result.unitCostSnapshot).toBeCloseTo(1.7, 6)
  })

  it('does not turn a genuinely pending Trading line into zero cost', () => {
    expect(resolveSalesBillLineCostDisplay({
      cogsAmount: 0,
      hasStockSource: false,
      hasTradingAllocation: false,
      hasWtoSource: false,
      qty: 10,
      transactionMode: 'TRADING',
    })).toEqual({ sourceKind: 'TRADING_PENDING', unitCostSnapshot: null })
  })

  it('treats a generic Stock-owned row in a Trading header as Stock', () => {
    expect(resolveSalesBillLineCostDisplay({
      cogsAmount: 300,
      hasStockSource: true,
      hasTradingAllocation: false,
      hasWtoSource: false,
      qty: 10,
      transactionMode: 'TRADING',
    })).toEqual({ sourceKind: 'STOCK', unitCostSnapshot: 30 })
  })

  it('does not divide a cost snapshot by zero quantity', () => {
    expect(resolveSalesBillLineCostDisplay({
      cogsAmount: 100,
      hasStockSource: true,
      hasTradingAllocation: false,
      hasWtoSource: true,
      qty: 0,
      transactionMode: 'TRADING',
    }).unitCostSnapshot).toBeNull()
  })

  it('does not invent cost when the durable snapshot is absent', () => {
    expect(resolveSalesBillLineCostDisplay({
      cogsAmount: null,
      hasStockSource: true,
      hasTradingAllocation: false,
      hasWtoSource: true,
      qty: 25,
      transactionMode: 'TRADING',
    }).unitCostSnapshot).toBeNull()
  })
})
