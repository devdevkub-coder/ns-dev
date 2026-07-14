import { describe, expect, it } from 'vitest'

import { matchesMoneyAccountFilter, summarizeActiveReceiptRows } from './money-movement-metrics'

describe('summarizeActiveReceiptRows', () => {
  it('excludes cancelled receipts from every financial total', () => {
    const summary = summarizeActiveReceiptRows([
      { amount: 53_500, fee: 500, netAmount: 52_500, status: 'completed', withholdingTax: 500 },
      { amount: 121_637.6, fee: 0, netAmount: 121_637.6, status: 'completed', withholdingTax: 0 },
      { amount: 8_743.27, fee: 100, netAmount: 8_543.27, status: 'cancelled', withholdingTax: 100 },
    ])

    expect(summary.amount).toBeCloseTo(175_137.6)
    expect(summary.fee).toBeCloseTo(500)
    expect(summary.netAmount).toBeCloseTo(174_137.6)
    expect(summary.withholdingTax).toBeCloseTo(500)
  })
})

describe('matchesMoneyAccountFilter', () => {
  it('matches a secondary account in a split receipt', () => {
    expect(matchesMoneyAccountFilter({
      accountId: 'ACC-PRIMARY',
      accountName: 'บัญชีหลัก',
      accountSplits: [
        { accountId: 'ACC-PRIMARY' },
        { accountId: 'ACC-SECONDARY' },
      ],
    }, 'ACC-SECONDARY')).toBe(true)
  })
})
