export type ReceiptMetricRow = {
  bookAmountThb: number
  bookNetCashInThb: number
  fee?: number
  status?: string
  withholdingTax?: number
}

type MoneyAccountFilterRow = {
  accountId?: string
  accountName: string
  accountSplits?: Array<{ accountId: string }>
}

type ReceiptMetricSummary = {
  bookAmountThb: number
  bookNetCashInThb: number
  fee: number
  withholdingTax: number
}

export function summarizeActiveReceiptRows(rows: ReceiptMetricRow[]) {
  return rows.reduce<ReceiptMetricSummary>((summary, row) => {
    if (row.status === 'cancelled') return summary

    summary.bookAmountThb += row.bookAmountThb
    summary.fee += row.fee ?? 0
    summary.bookNetCashInThb += row.bookNetCashInThb
    summary.withholdingTax += row.withholdingTax ?? 0
    return summary
  }, { bookAmountThb: 0, bookNetCashInThb: 0, fee: 0, withholdingTax: 0 })
}

export function matchesMoneyAccountFilter(row: MoneyAccountFilterRow, accountFilter: string) {
  return !accountFilter
    || row.accountId === accountFilter
    || row.accountName === accountFilter
    || Boolean(row.accountSplits?.some((split) => split.accountId === accountFilter))
}
