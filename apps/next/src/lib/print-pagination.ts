export const STANDARD_PRINT_ROWS_PER_PAGE = 15

// Daily PMT/RCP reports reserve the first page for the report header and two
// rows of summary cards. Keep the first table slice smaller so the report
// remains a single physical A4 landscape page before normal continuation pages
// use the standard table capacity.
export const PAYMENT_DAILY_REPORT_FIRST_PAGE_ROWS = 8

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

export function paginatePaymentDailyReportItems<T>(items: readonly T[]): StandardPrintPage<T>[] {
  const firstPageItems = items.slice(0, PAYMENT_DAILY_REPORT_FIRST_PAGE_ROWS)
  const remainingItems = items.slice(PAYMENT_DAILY_REPORT_FIRST_PAGE_ROWS)
  const continuationPageCount = Math.ceil(remainingItems.length / STANDARD_PRINT_ROWS_PER_PAGE)
  const pageItems = [
    firstPageItems,
    ...Array.from({ length: continuationPageCount }, (_, pageIndex) =>
      remainingItems.slice(pageIndex * STANDARD_PRINT_ROWS_PER_PAGE, (pageIndex + 1) * STANDARD_PRINT_ROWS_PER_PAGE),
    ),
  ]
  const totalPages = Math.max(1, pageItems.length)

  return pageItems.map((itemsForPage, pageIndex) => {
    const pageCapacity = pageIndex === 0 ? PAYMENT_DAILY_REPORT_FIRST_PAGE_ROWS : STANDARD_PRINT_ROWS_PER_PAGE
    const startIndex = pageIndex === 0
      ? 0
      : PAYMENT_DAILY_REPORT_FIRST_PAGE_ROWS + (pageIndex - 1) * STANDARD_PRINT_ROWS_PER_PAGE

    return {
      emptyRowCount: pageCapacity - itemsForPage.length,
      isFinalPage: pageIndex === totalPages - 1,
      items: itemsForPage,
      pageNo: pageIndex + 1,
      startIndex,
      totalPages,
    }
  })
}
