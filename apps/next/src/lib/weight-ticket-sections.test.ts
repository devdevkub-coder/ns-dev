import { describe, expect, it } from 'vitest'
import { getWeightTicketLotLineIds, getWeightTicketSectionLineIds } from './weight-ticket-sections'

describe('getWeightTicketSectionLineIds', () => {
  it('groups a product parent with lots and nested impurity lines', () => {
    const lines = [
      { id: 'product-a', parentId: undefined },
      { id: 'lot-a-2', parentId: 'product-a' },
      { id: 'impurity-a-2', parentId: 'lot-a-2' },
      { id: 'product-b', parentId: undefined },
      { id: 'lot-b-2', parentId: 'product-b' },
    ]

    expect(getWeightTicketSectionLineIds(lines, 'product-a')).toEqual(['product-a', 'lot-a-2', 'impurity-a-2'])
    expect(getWeightTicketSectionLineIds(lines, 'lot-a-2')).toEqual(['product-a', 'lot-a-2', 'impurity-a-2'])
    expect(getWeightTicketSectionLineIds(lines, 'product-b')).toEqual(['product-b', 'lot-b-2'])
  })

  it('does not allow an invalid parent reference to absorb another section', () => {
    const lines = [
      { id: 'product-a', parentId: undefined },
      { id: 'orphan', parentId: 'missing' },
    ]

    expect(getWeightTicketSectionLineIds(lines, 'product-a')).toEqual(['product-a'])
    expect(getWeightTicketSectionLineIds(lines, 'orphan')).toEqual(['orphan'])
  })

  it('keeps a lot save scoped to the lot and its impurity children', () => {
    const lines = [
      { id: 'product-a', parentId: undefined },
      { id: 'lot-a-1', parentId: 'product-a' },
      { id: 'impurity-a-1', parentId: 'lot-a-1' },
      { id: 'lot-a-2', parentId: 'product-a' },
    ]

    expect(getWeightTicketLotLineIds(lines, 'lot-a-1')).toEqual(['lot-a-1', 'impurity-a-1'])
  })
})
