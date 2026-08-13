import { describe, expect, it } from 'vitest'

import { buildExpenseSummary, buildLegacyExpenseDashboard } from './DailyExpensePageClient'
import type { ExpenseRow } from './DailyExpensePageClient'

function row(overrides: Partial<ExpenseRow> & { date: string; status: ExpenseRow['status']; netAmount: number; amount?: number }): ExpenseRow {
  return {
    accountId: '',
    accountName: '-',
    amount: overrides.amount ?? overrides.netAmount,
    branchId: '',
    categoryId: '',
    categoryName: '',
    date: overrides.date,
    description: '',
    docNo: overrides.docNo ?? 'EXP-001',
    dueDate: null,
    hasVat: false,
    hasWht: false,
    id: overrides.id ?? overrides.docNo ?? 'EXP-001',
    lines: [],
    netAmount: overrides.netAmount,
    payee: overrides.payee ?? '',
    refDocNo: '',
    status: overrides.status,
    vat: 0,
    wht: 0,
    supplierId: '',
    bankFee: 0,
    discount: 0,
    paymentAction: 'submit_approval',
    supplierPaymentDestinationId: '',
    taxInvoiceNo: '',
    notes: '',
  }
}

const thisMonth = new Date().toISOString().slice(0, 7)

describe('expense aggregates exclude cancelled documents', () => {
  it('ค่าใช้จ่ายเดือนนี้ ไม่นับใบที่ยกเลิกแล้ว (cancelled)', () => {
    const summary = buildExpenseSummary([
      row({ date: `${thisMonth}-05`, docNo: 'EXP-CANCEL', netAmount: 2675, status: 'cancelled' }),
      row({ date: `${thisMonth}-06`, docNo: 'EXP-ACTIVE', netAmount: 4950, status: 'paid' }),
    ])
    expect(summary.monthlyCount).toBe(1)
    expect(summary.monthlyTotal).toBe(4950)
  })

  it('ทั้งเดือนมีแต่ใบที่ยกเลิก -> ยอดเดือนนี้เป็น 0', () => {
    const summary = buildExpenseSummary([
      row({ date: `${thisMonth}-05`, docNo: 'EXP-CANCEL', netAmount: 2675, status: 'cancelled' }),
    ])
    expect(summary.monthlyCount).toBe(0)
    expect(summary.monthlyTotal).toBe(0)
  })

  it('trend เดือนนี้ ไม่รวมใบที่ยกเลิก', () => {
    const summary = buildExpenseSummary([
      row({ date: `${thisMonth}-05`, docNo: 'EXP-CANCEL', netAmount: 2675, status: 'cancelled' }),
      row({ date: `${thisMonth}-06`, docNo: 'EXP-ACTIVE', netAmount: 4950, status: 'approved' }),
    ])
    const trend = summary.trend.find((item) => item.month === thisMonth)
    expect(trend?.total).toBe(4950)
  })

  it('dashboard ยอดใช้จ่ายเดือนนี้ (amount+vat) ไม่รวมใบที่ยกเลิก', () => {
    const dashboard = buildLegacyExpenseDashboard(
      [
        row({ date: `${thisMonth}-05`, docNo: 'EXP-CANCEL', amount: 2675, netAmount: 2675, status: 'cancelled' }),
        row({ date: `${thisMonth}-06`, docNo: 'EXP-ACTIVE', amount: 5000, netAmount: 4950, status: 'paid' }),
      ],
      [],
      6,
    )
    expect(dashboard.latest).toBe(5000)
    expect(dashboard.total).toBe(5000)
  })
})
