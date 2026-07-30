import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  bankGroupBy: vi.fn(),
  fcdLedgerGroupBy: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    accounts: { findMany: mocks.accountFindMany },
    bank_statement: { groupBy: mocks.bankGroupBy },
    fcd_ledger_entries: { groupBy: mocks.fcdLedgerGroupBy },
  },
}))

import { buildFinanceCashPosition, summarizeFinanceCashAccounts } from './finance-accounting-cash-position'

describe('summarizeFinanceCashAccounts', () => {
  it('uses persisted book THB for liquidity and keeps native FCD as a separate audit projection', () => {
    const result = summarizeFinanceCashAccounts([
      { accountGroup: 'cash', balance: 500, isFcd: false, name: 'เงินสดย่อย', odLimit: 0 },
      { accountGroup: 'bank', balance: 1_000, isFcd: false, name: 'กระแสรายวัน', odLimit: 0 },
      { accountGroup: 'bank', balance: -300, isFcd: false, name: 'OD 1', odLimit: 1_000 },
      { accountGroup: 'bank', balance: 200, isFcd: false, name: 'OD 2', odLimit: 500 },
      { accountGroup: 'bank', balance: 1_480, isFcd: true, name: 'FCD USD', odLimit: 0 },
    ], [{ currency: 'USD', value: 40 }])

    expect(result).toMatchObject({
      balance: 3_180,
      bankBalance: 2_680,
      cashBalance: 500,
      odAvailable: 1_200,
      odLimit: 1_500,
      odUsed: 300,
    })
    expect(result.fcdBalances).toEqual([{ currency: 'USD', value: 40 }])
  })
})

describe('buildFinanceCashPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.accountFindMany.mockResolvedValue([
      {
        active: true,
        account_currency_balances: [{ currency_code: 'THB' }],
        account_group: 'bank',
        account_no: '001',
        bank: null,
        bank_account_type: 'savings',
        bank_name: null,
        branches: { code: 'B01', id: 7n, name: 'Branch 1' },
        code: 'ACC01-001',
        currency: 'THB',
        id: 1n,
        name: 'Main',
        od_limit: 0,
        is_fcd: false,
        opening_balance: 0,
        subtype: 'savings',
        type: 'bank',
      },
      {
        active: true,
        account_currency_balances: [{ currency_code: 'THB' }, { currency_code: 'USD' }],
        account_group: 'bank',
        account_no: '002',
        bank: null,
        bank_account_type: 'current',
        bank_name: null,
        branches: { code: 'B01', id: 7n, name: 'Branch 1' },
        code: 'ACC01-002',
        currency: 'THB',
        id: 2n,
        name: 'FCD',
        od_limit: 0,
        is_fcd: true,
        opening_balance: 0,
        subtype: 'current',
        type: 'bank',
      },
    ])
    mocks.bankGroupBy.mockResolvedValue([
      { _sum: { amount_in: 25, amount_out: 5 }, account_id: 1n },
      { _sum: { amount_in: 999, amount_out: 0 }, account_id: 2n },
    ])
    mocks.fcdLedgerGroupBy.mockResolvedValue([
      { _sum: { native_amount_in: 50, native_amount_out: 0 }, currency_code: 'USD' },
    ])
  })

  it('uses a bounded account groupBy without a silent row cap', async () => {
    const result = await buildFinanceCashPosition({ asOf: new Date('2026-07-17T00:00:00.000Z'), branchIds: [7n] })

    expect(mocks.accountFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true },
    }))

    expect(mocks.bankGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['account_id'],
      where: expect.objectContaining({
        account_id: { in: [1n, 2n] },
        date: { lte: new Date('2026-07-17T16:59:59.999Z') },
      }),
    }))
    expect(mocks.bankGroupBy.mock.calls[0]?.[0]).not.toHaveProperty('take')
    expect(result.balance).toBe(1_019)
    expect(result.fcdBalances).toEqual([{ currency: 'USD', value: 50 }])
  })
})
