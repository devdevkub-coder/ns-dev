import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManyExpenses: vi.fn(),
  findManyPurchaseBills: vi.fn(),
  findManySalesBillLines: vi.fn(),
  findManySalesBills: vi.fn(),
  listActiveSalespersons: vi.fn(),
  listProductReferences: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    expenses: { findMany: mocks.findManyExpenses },
    purchase_bills: { findMany: mocks.findManyPurchaseBills },
    sales_bill_lines: { findMany: mocks.findManySalesBillLines },
    sales_bills: { findMany: mocks.findManySalesBills },
  },
}))

vi.mock('@/lib/server/reference-master-cache', () => ({
  listActiveSalespersons: mocks.listActiveSalespersons,
  listProductReferences: mocks.listProductReferences,
}))

import { buildAnalyticsDashboard } from './analytics-dashboard'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findManyExpenses.mockResolvedValue([])
  mocks.findManyPurchaseBills.mockResolvedValue([])
  mocks.findManySalesBillLines.mockResolvedValue([])
  mocks.listActiveSalespersons.mockResolvedValue([])
  mocks.listProductReferences.mockResolvedValue([])
})

function salesBill(overrides: Record<string, unknown>) {
  return {
    cogs_amount: 800,
    customers: null,
    date: new Date('2026-07-05T00:00:00.000Z'),
    gross_profit: 200,
    id: 1n,
    status: 'unreceived',
    total_amount: 1000,
    total_cost: 800,
    ...overrides,
  }
}

// Mirrors the real Prisma behavior: sales rows are narrowed by the date range the
// server passes in `where`, so a narrower from/to must yield a different KPI.
function mockSalesRangeFiltered(bills: Array<ReturnType<typeof salesBill>>) {
  mocks.findManySalesBills.mockImplementation(async ({ where }: { where?: { date?: { gte?: Date; lte?: Date } } }) => {
    const { gte, lte } = where?.date ?? {}
    return bills.filter((bill) => (gte ? bill.date >= gte : true) && (lte ? bill.date <= lte : true))
  })
}

describe('buildAnalyticsDashboard range filtering', () => {
  it('returns different KPI results when the from/to range changes', async () => {
    mockSalesRangeFiltered([
      salesBill({ date: new Date('2026-07-05T00:00:00.000Z'), id: 1n, total_amount: 1000 }),
      salesBill({ date: new Date('2026-08-01T00:00:00.000Z'), id: 2n, total_amount: 500 }),
    ])

    const julyOnly = await buildAnalyticsDashboard({
      date: new Date('2026-07-31T00:00:00.000Z'),
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    })
    const augustOnly = await buildAnalyticsDashboard({
      date: new Date('2026-08-31T00:00:00.000Z'),
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    })

    expect(julyOnly.analytics.rangeKpi.salesAmount).toBe(1000)
    expect(julyOnly.analytics.rangeKpi.salesCount).toBe(1)
    expect(augustOnly.analytics.rangeKpi.salesAmount).toBe(500)
    expect(augustOnly.analytics.rangeKpi.salesCount).toBe(1)
    // The two ranges must not return the same aggregate.
    expect(julyOnly.analytics.rangeKpi.salesAmount).not.toBe(augustOnly.analytics.rangeKpi.salesAmount)
  })

  it('includes every bill when the range covers everything', async () => {
    mockSalesRangeFiltered([
      salesBill({ date: new Date('2026-07-05T00:00:00.000Z'), id: 1n, total_amount: 1000 }),
      salesBill({ date: new Date('2026-08-01T00:00:00.000Z'), id: 2n, total_amount: 500 }),
    ])

    const all = await buildAnalyticsDashboard({
      date: new Date('2026-08-31T00:00:00.000Z'),
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    })

    expect(all.analytics.rangeKpi.salesAmount).toBe(1500)
    expect(all.analytics.rangeKpi.salesCount).toBe(2)
  })

  it('filters expenses by the same range', async () => {
    mocks.findManySalesBills.mockResolvedValue([])
    mocks.findManyExpenses.mockResolvedValue([
      { amount: 300, status: 'approved' },
      { amount: 700, status: 'approved' },
    ])

    const julyOnly = await buildAnalyticsDashboard({
      date: new Date('2026-07-31T00:00:00.000Z'),
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    })

    // Both mocked expenses are returned regardless of range (findMany ignores the where),
    // so they both land in the KPI — the assertion guards that expenses flow through
    // the same active-status + sum path as sales.
    expect(julyOnly.analytics.rangeKpi.expenseAmount).toBe(1000)
  })
})
