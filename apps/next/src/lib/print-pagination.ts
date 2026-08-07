export const STANDARD_PRINT_ROWS_PER_PAGE = 15

export type StandardPrintPage<T> = {
  emptyRowCount: number
  isFinalPage: boolean
  items: T[]
  pageNo: number
  startIndex: number
  totalPages: number
}

export function paginateStandardPrintItems<T>(items: readonly T[]): StandardPrintPage<T>[] {
  const totalPages = Math.max(1, Math.ceil(items.length / STANDARD_PRINT_ROWS_PER_PAGE))

  return Array.from({ length: totalPages }, (_, pageIndex) => {
    const startIndex = pageIndex * STANDARD_PRINT_ROWS_PER_PAGE
    const pageItems = items.slice(startIndex, startIndex + STANDARD_PRINT_ROWS_PER_PAGE)
    return {
      emptyRowCount: STANDARD_PRINT_ROWS_PER_PAGE - pageItems.length,
      isFinalPage: pageIndex === totalPages - 1,
      items: pageItems,
      pageNo: pageIndex + 1,
      startIndex,
      totalPages,
    }
  })
}
