import { describe, expect, it } from 'vitest'
import { paginateStandardPrintItems, STANDARD_PRINT_ROWS_PER_PAGE } from './print-pagination'

describe('standard print pagination', () => {
  it.each([
    { count: 0, emptyRows: [15], pages: 1 },
    { count: 1, emptyRows: [14], pages: 1 },
    { count: 15, emptyRows: [0], pages: 1 },
    { count: 16, emptyRows: [0, 14], pages: 2 },
    { count: 30, emptyRows: [0, 0], pages: 2 },
    { count: 31, emptyRows: [0, 0, 14], pages: 3 },
    { count: 46, emptyRows: [0, 0, 0, 14], pages: 4 },
  ])('splits $count rows into $pages A4 pages', ({ count, emptyRows, pages }) => {
    const result = paginateStandardPrintItems(Array.from({ length: count }, (_, index) => index + 1))

    expect(STANDARD_PRINT_ROWS_PER_PAGE).toBe(15)
    expect(result).toHaveLength(pages)
    expect(result.map((page) => page.emptyRowCount)).toEqual(emptyRows)
    expect(result.flatMap((page) => page.items)).toEqual(Array.from({ length: count }, (_, index) => index + 1))
    expect(result.map((page) => page.startIndex)).toEqual(Array.from({ length: pages }, (_, index) => index * 15))
    expect(result.map((page) => page.isFinalPage)).toEqual(Array.from({ length: pages }, (_, index) => index === pages - 1))
  })
})
