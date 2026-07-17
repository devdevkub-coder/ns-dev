import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  bankGroupBy: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    accounts: { findMany: mocks.accountFindMany },
    bank_statement: { groupBy: mocks.bankGroupBy },
  },
}))

import { buildFinanceCashPosition, summarizeFinanceCashAccounts } from './finance-accounting-cash-position'

describe('summarizeFinanceCashAccounts', () => {
  it('keeps THB liquidity separate from FCD and measures OD per account', () => {
    const result = summarizeFinanceCashAccounts([
      { bank: null, bankName: null, balance: 500, currency: 'THB', name: 'เงินสดย่อย', odLimit: 0, type: 'cash' },
      { bank: 'KBANK', bankName: null, balance: 1_000, currency: 'THB', name: 'กระแสรายวัน', odLimit: 0, type: 'bank' },
      { bank: 'SCB', bankName: null, balance: -300, currency: 'THB', name: 'OD 1', odLimit: 1_000, type: 'bank' },
      { bank: 'KTB', bankName: null, balance: 200, currency: 'THB', name: 'OD 2', odLimit: 500, type: 'OD' },
      { bank: 'BBL', bankName: null, balance: 40, currency: 'USD', name: 'Current account', odLimit: 0, type: 'bank' },
    ])

    expect(result).toMatchObject({
      balance: 1_700,
      bankBalance: 1_200,
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
        bank: 'KBANK',
        bank_name: null,
        currency: 'THB',
        id: 1n,
        name: 'Main',
        od_limit: 0,
        opening_balance: 100,
        type: 'bank',
      },
      {
        bank: 'BBL',
        bank_name: null,
        currency: 'USD',
        id: 2n,
        name: 'FCD',
        od_limit: 0,
        opening_balance: 50,
        type: 'bank',
      },
    ])
    mocks.bankGroupBy.mockResolvedValue([
      { _sum: { amount_in: 25, amount_out: 5 }, account_id: 1n },
      { _sum: { amount_in: 999, amount_out: 0 }, account_id: 2n },
    ])
  })

  it('uses a bounded account groupBy without a silent row cap', async () => {
    const result = await buildFinanceCashPosition({ asOf: new Date('2026-07-17T00:00:00.000Z'), branchIds: [7n] })

    expect(mocks.accountFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, branch_id: { in: [7n] } },
    }))

    expect(mocks.bankGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['account_id'],
      where: expect.objectContaining({
        account_id: { in: [1n, 2n] },
        date: { lte: new Date('2026-07-17T16:59:59.999Z') },
      }),
    }))
    expect(mocks.bankGroupBy.mock.calls[0]?.[0]).not.toHaveProperty('take')
    expect(result.balance).toBe(120)
    expect(result.fcdBalances).toEqual([{ currency: 'USD', value: 50 }])
  })
})
