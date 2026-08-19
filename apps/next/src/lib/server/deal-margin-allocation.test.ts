import { describe, expect, it } from 'vitest'
import { indexDealMarginAllocations } from './deal-margin-allocation'

function allocation(overrides: Partial<Parameters<typeof indexDealMarginAllocations>[0][number]> = {}) {
  return {
    allocationNo: 'ALLOC-001',
    billKey: 'BILL-001',
    salesDocNo: 'SB-001',
    date: '2026-08-19',
    channel: 'Trading Deal',
    salesLineNo: 1,
    matchedCost: 100,
    matchedQty: 10,
    ...overrides,
  }
}

describe('deal margin allocation index', () => {
  it('indexes one allocation per sales line without aggregating it', () => {
    const result = indexDealMarginAllocations([allocation()])

    expect(result.allocationByLine.get('BILL-001:1')).toEqual({
      allocationNo: 'ALLOC-001',
      matchedCost: 100,
      matchedQty: 10,
      salesDocNo: 'SB-001',
      salesLineNo: 1,
    })
  })

  it('fails when one sales line has more than one active allocation', () => {
    expect(() => indexDealMarginAllocations([
      allocation(),
      allocation({ allocationNo: 'ALLOC-002', matchedCost: 200, matchedQty: 20 }),
    ])).toThrow('พบ Allocation ซ้ำใน Sales Bill SB-001, Sales Line 1')
  })

  it('keeps allocations without a sales line as unlinked data', () => {
    const result = indexDealMarginAllocations([allocation({ salesLineNo: null })])

    expect(result.allocationByLine.size).toBe(0)
    expect(result.unlinkedAllocations).toEqual([expect.objectContaining({
      allocationNo: 'ALLOC-001',
      salesDocNo: 'SB-001',
      matchedCost: 100,
      matchedQty: 10,
    })])
  })
})
