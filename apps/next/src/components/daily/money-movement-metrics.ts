export type ReceiptMetricRow = {
  amount: number
  fee?: number
  netAmount: number
  status?: string
  withholdingTax?: number
}

type MoneyAccountFilterRow = {
  accountId?: string
  accountName: string
  accountSplits?: Array<{ accountId: string }>
}

type ReceiptMetricSummary = {
  amount: number
  fee: number
  netAmount: number
  withholdingTax: number
}

export function summarizeActiveReceiptRows(rows: ReceiptMetricRow[]) {
  return rows.reduce<ReceiptMetricSummary>((summary, row) => {
    if (row.status === 'cancelled') return summary

    summary.amount += row.amount
    summary.fee += row.fee ?? 0
    summary.netAmount += row.netAmount
    summary.withholdingTax += row.withholdingTax ?? 0
    return summary
  }, { amount: 0, fee: 0, netAmount: 0, withholdingTax: 0 })
}

export function matchesMoneyAccountFilter(row: MoneyAccountFilterRow, accountFilter: string) {
  return !accountFilter
    || row.accountId === accountFilter
    || row.accountName === accountFilter
    || Boolean(row.accountSplits?.some((split) => split.accountId === accountFilter))
}
