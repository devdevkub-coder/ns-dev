import { describe, expect, it } from 'vitest'

import { nextSortState, sortRows } from './stock-planning-sort'

describe('stock planning sort state', () => {
  it('starts ascending and toggles the active column direction', () => {
    expect(nextSortState({ direction: 'asc', key: null }, 'product')).toEqual({
      direction: 'asc',
      key: 'product',
    })
    expect(nextSortState({ direction: 'asc', key: 'product' }, 'product')).toEqual({
      direction: 'desc',
      key: 'product',
    })
    expect(nextSortState({ direction: 'desc', key: 'product' }, 'shortage')).toEqual({
      direction: 'asc',
      key: 'shortage',
    })
  })

  it('sorts the complete row set in either direction without mutating the source', () => {
    const source = [
      { id: 'third', shortage: 30 },
      { id: 'first', shortage: 10 },
      { id: 'second', shortage: 20 },
    ]

    expect(sortRows(source, { direction: 'asc', key: 'shortage' }, (row) => row.shortage).map((row) => row.id)).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(sortRows(source, { direction: 'desc', key: 'shortage' }, (row) => row.shortage).map((row) => row.id)).toEqual([
      'third',
      'second',
      'first',
    ])
    expect(source.map((row) => row.id)).toEqual(['third', 'first', 'second'])
  })

  it('preserves the business-default order until the user chooses a sort column', () => {
    const source = [
      { id: 'urgent', urgency: 0 },
      { id: 'enough', urgency: 4 },
    ]

    expect(sortRows(source, { direction: 'asc', key: null }, (row) => row.urgency)).toBe(source)
  })
})
