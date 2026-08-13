import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManyExpenses: vi.fn(),
  findManyPayments: vi.fn(),
  findManyPurchaseBills: vi.fn(),
  findManyReceipts: vi.fn(),
  findManySalesBills: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    expenses: { findMany: mocks.findManyExpenses },
    payments: { findMany: mocks.findManyPayments },
    purchase_bills: { findMany: mocks.findManyPurchaseBills },
    receipts: { findMany: mocks.findManyReceipts },
    sales_bills: { findMany: mocks.findManySalesBills },
  },
}))

import { buildBusinessCalendar } from './main-calendars'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findManyPurchaseBills.mockResolvedValue([])
  mocks.findManyExpenses.mockResolvedValue([])
  mocks.findManyReceipts.mockResolvedValue([])
  mocks.findManyPayments.mockResolvedValue([])
})

function salesBill(overrides: Record<string, unknown>) {
  return {
    cogs_amount: 0,
    date: new Date(Date.UTC(2026, 6, 5)),
    doc_no: 'SB-TEST',
    gross_profit: 0,
    id: 1n,
    items: [{ qty: 10 }],
    receivable_balance: 0,
    status: 'unreceived',
    total_amount: 0,
    total_cost: 0,
    ...overrides,
  }
}

describe('buildBusinessCalendar', () => {
  it('keeps stored 0 COGS/GP as-is instead of inflating GP to the full sale amount', async () => {
    mocks.findManySalesBills.mockResolvedValue([
      // TRADING bill imported without any cost allocation: stored 0 COGS and 0 GP.
      salesBill({ doc_no: 'IV6907052', total_amount: 1000, receivable_balance: 1000 }),
      // STOCK bill with a real matched cost.
      salesBill({
        cogs_amount: 800,
        doc_no: 'SB-MATCHED',
        gross_profit: 1200,
        receivable_balance: 2000,
        total_amount: 2000,
        total_cost: 800,
      }),
    ])

    const calendar = await buildBusinessCalendar('2026-07')
    const day = calendar.days.find((row) => row.date === '2026-07-05')!

    expect(day.saleAmount).toBe(3000)
    expect(day.cogs).toBe(800)
    // The unmatched bill must contribute 0 GP, not its full 1000 revenue.
    expect(day.gp).toBe(1200)
    expect(day.saleDocs).toEqual([
      { amount: 1000, cogs: 0, docNo: 'IV6907052', gp: 0, id: 'IV6907052', qty: 10 },
      { amount: 2000, cogs: 800, docNo: 'SB-MATCHED', gp: 1200, id: 'SB-MATCHED', qty: 10 },
    ])
  })

  it('falls back to revenue minus cogs only when gross_profit was never stored (null)', async () => {
    mocks.findManySalesBills.mockResolvedValue([
      // Legacy bill: gross_profit null but total_cost stored.
      salesBill({
        cogs_amount: null,
        doc_no: 'SB-LEGACY',
        gross_profit: null,
        receivable_balance: 500,
        total_amount: 500,
        total_cost: 300,
      }),
    ])

    const calendar = await buildBusinessCalendar('2026-07')
    const day = calendar.days.find((row) => row.date === '2026-07-05')!

    expect(day.cogs).toBe(300)
    expect(day.gp).toBe(200)
    expect(day.saleDocs[0]).toMatchObject({ cogs: 300, gp: 200 })
  })

  it('aggregates summary from the same non-inflated values', async () => {
    mocks.findManySalesBills.mockResolvedValue([
      salesBill({ doc_no: 'IV6907052', total_amount: 1000, receivable_balance: 1000 }),
      salesBill({
        cogs_amount: 800,
        doc_no: 'SB-MATCHED',
        gross_profit: 1200,
        receivable_balance: 2000,
        total_amount: 2000,
        total_cost: 800,
      }),
    ])

    const calendar = await buildBusinessCalendar('2026-07')

    expect(calendar.summary.saleAmount).toBe(3000)
    expect(calendar.summary.cogs).toBe(800)
    expect(calendar.summary.gp).toBe(1200)
  })
})
