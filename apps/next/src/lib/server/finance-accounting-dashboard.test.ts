import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findActiveBranchReferenceByCodeOrId: vi.fn(),
  findManyBranches: vi.fn(),
}))

vi.mock('@/lib/server/branch-reference', () => ({
  findActiveBranchReferenceByCodeOrId: mocks.findActiveBranchReferenceByCodeOrId,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    branches: { findMany: mocks.findManyBranches },
  },
}))

import * as dashboard from './finance-accounting-dashboard'

beforeEach(() => {
  vi.clearAllMocks()
})

type Insight = {
  detail: string
  title: string
  type: 'danger' | 'ok' | 'warn'
  value: number | string
}

type InsightBuilder = (input: {
  ap: number
  ar: number
  avgDailyOut: number
  cashAndBank: number
  cashIn30: number
  cashIn7: number
  cashNeed30: number
  cashNeed7: number
  inventory: number
  loan: number
  netProfitBeforeTax: number
  operatingCashFlow: number
}) => Insight[]

function insightBuilder() {
  return (dashboard as typeof dashboard & {
    buildFinancialDashboardInsights?: InsightBuilder
  }).buildFinancialDashboardInsights
}

type CashPositionBuilder = (input: {
  bankBalance: number
  cashBalance: number
  odLimit: number
  odUsed: number
}) => {
  cashAndBank: number
  fcdBalance: number
  odAvailable: number
}

function cashPositionBuilder() {
  return (dashboard as typeof dashboard & {
    buildCashPositionSummary?: CashPositionBuilder
  }).buildCashPositionSummary
}

type CashAccountClassifier = (account: {
  bank: string | null
  bank_name: string | null
  currency: string | null
  name: string
  type: string
}) => 'BANK' | 'CASH' | 'FCD' | 'OD'

function cashAccountClassifier() {
  return (dashboard as typeof dashboard & {
    classifyFinancialCashAccount?: CashAccountClassifier
  }).classifyFinancialCashAccount
}

type CashAccountsSummarizer = (accounts: Array<{
  balance: number
  bank: string | null
  bank_name: string | null
  currency: string | null
  name: string
  odLimit: number
  type: string
}>) => {
  bankBalance: number
  cashAndBank: number
  fcdBalances: Array<{ currency: string; value: number }>
  odLimit: number
  odUsed: number
}

function cashAccountsSummarizer() {
  return (dashboard as typeof dashboard & {
    summarizeFinancialCashAccounts?: CashAccountsSummarizer
  }).summarizeFinancialCashAccounts
}

type DateScopeBuilder = (value: Date) => {
  asOf: Date
  currentMonthStart: Date
}

type AccountBalanceBuilder = (account: {
  bank: string | null
  bank_name: string | null
  currency: string | null
  movement: number
  name: string
  openingBalance: number
  type: string
}) => number

function accountBalanceBuilder() {
  return (dashboard as typeof dashboard & {
    financialDashboardAccountBalance?: AccountBalanceBuilder
  }).financialDashboardAccountBalance
}

function dateScopeBuilder() {
  return (dashboard as typeof dashboard & {
    financialDashboardDateScope?: DateScopeBuilder
  }).financialDashboardDateScope
}

describe('resolveDashboardBranchScope', () => {
  it('rejects an unknown selected branch instead of falling back to the all-branch aggregate', async () => {
    mocks.findActiveBranchReferenceByCodeOrId.mockResolvedValue(null)
    mocks.findManyBranches.mockResolvedValue([{ code: 'B01', id: 1n, name: 'Branch 1' }])

    await expect(dashboard.resolveDashboardBranchScope({
      allowedBranchCodes: null,
      asOf: new Date('2026-07-17T00:00:00.000Z'),
      branchId: 'MISSING',
    })).rejects.toThrow('ไม่พบสาขาที่ใช้งาน: MISSING')
  })
})

describe('summarizeFinancialCashAccounts', () => {
  it('keeps FCD by currency and counts a positive OD balance as bank cash', () => {
    const summarizeAccounts = cashAccountsSummarizer()
    expect(summarizeAccounts).toBeTypeOf('function')
    const account = (values: Partial<Parameters<CashAccountsSummarizer>[0][number]>) => ({
      balance: 0,
      bank: null,
      bank_name: null,
      currency: 'THB',
      name: 'Bank account',
      odLimit: 0,
      type: 'bank',
      ...values,
    })

    const result = summarizeAccounts?.([
      account({ balance: 100, currency: 'USD' }),
      account({ balance: 25, currency: 'USD' }),
      account({ balance: 200, currency: 'EUR' }),
      account({ balance: 10, currency: null, name: 'FCD legacy A' }),
      account({ balance: 20, currency: null, name: 'FCD legacy B' }),
      account({ balance: 50, name: 'OD positive', odLimit: 500, type: 'OD' }),
      account({ balance: -100, name: 'OD used', odLimit: 500, type: 'OD' }),
      account({ balance: 300 }),
    ])

    expect(result).toMatchObject({
      bankBalance: 350,
      cashAndBank: 350,
      odLimit: 1_000,
      odUsed: 100,
    })
    expect(result?.fcdBalances).toEqual(expect.arrayContaining([
      { currency: 'EUR', value: 200 },
      { currency: 'USD', value: 125 },
      { currency: 'ไม่ระบุสกุล (FCD legacy A)', value: 10 },
      { currency: 'ไม่ระบุสกุล (FCD legacy B)', value: 20 },
    ]))
    expect(result?.fcdBalances).not.toContainEqual({ currency: 'ไม่ระบุสกุล', value: 30 })
  })
})

describe('financialDashboardDateScope', () => {
  it('uses the Bangkok business month at a UTC month boundary', () => {
    const buildDateScope = dateScopeBuilder()
    expect(buildDateScope).toBeTypeOf('function')

    const scope = buildDateScope?.(new Date('2026-06-30T17:00:00.000Z'))
    expect(scope?.asOf.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(scope?.currentMonthStart.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })
})

describe('financialDashboardAccountBalance', () => {
  it('does not treat THB statement movement as foreign-currency movement', () => {
    const buildBalance = accountBalanceBuilder()
    expect(buildBalance).toBeTypeOf('function')
    const account = {
      bank: null,
      bank_name: null,
      movement: 500,
      name: 'Current account',
      openingBalance: 100,
      type: 'bank',
    }

    expect(buildBalance?.({ ...account, currency: 'USD' })).toBe(100)
    expect(buildBalance?.({ ...account, currency: 'THB' })).toBe(600)
  })
})

describe('classifyFinancialCashAccount', () => {
  it('classifies a foreign-currency account as FCD even without FCD in its name', () => {
    const classifyAccount = cashAccountClassifier()
    expect(classifyAccount).toBeTypeOf('function')
    expect(classifyAccount?.({ bank: 'Example Bank', bank_name: null, currency: 'USD', name: 'Current account', type: 'bank' })).toBe('FCD')
    expect(classifyAccount?.({ bank: 'Example Bank', bank_name: null, currency: 'USD', name: 'OD account', type: 'OD' })).toBe('FCD')
  })
})

describe('buildCashPositionSummary', () => {
  it('returns only THB cash, bank, and OD totals', () => {
    const buildCashPosition = cashPositionBuilder()
    expect(buildCashPosition).toBeTypeOf('function')

    expect(buildCashPosition?.({
      bankBalance: 200,
      cashBalance: 100,
      odLimit: 500,
      odUsed: 125,
    })).toMatchObject({
      cashAndBank: 300,
      odAvailable: 375,
    })
  })
})

describe('buildFinancialDashboardInsights', () => {
  it('formats finite runway and money without leaking floating-point residue', () => {
    const buildInsights = insightBuilder()
    expect(buildInsights).toBeTypeOf('function')

    const insights = buildInsights?.({
      ap: 3_635_079.85,
      ar: 491_792.55689999997,
      avgDailyOut: 73_880.01,
      cashAndBank: 1_015_706_533.81,
      cashIn30: 491_792.56,
      cashIn7: 491_792.56,
      cashNeed30: 3_635_079.85,
      cashNeed7: 3_635_079.85,
      inventory: 4_073_825.78,
      loan: 0,
      netProfitBeforeTax: 68_086.06389067823,
      operatingCashFlow: -1_255_960.1,
    }) ?? []

    expect(insights.find((item) => item.title === 'เงินสดพอจ่ายกี่วัน')?.value).toBe('มากกว่า 999 วัน')
    expect(insights.find((item) => item.title === 'สภาพคล่อง 7 วัน')?.value).toBe(1_012_563_246.52)
    expect(insights.find((item) => item.title === 'เงินจมในสินค้าคงคลัง')?.detail).toBe('0.40% ของเงินสดและธนาคาร')
    expect(insights.find((item) => item.title === 'เงินจมในสินค้าคงคลัง')?.value).toBe('0.40%')
    expect(insights.find((item) => item.title === 'กำไรก่อนภาษีเทียบ OCF')?.value).toBe(1_324_046.16)
    expect(insights.map((item) => item.detail).join(' ')).not.toMatch(/\.\d{3,}/)
  })

  it('does not claim infinite runway when there is no daily-out basis', () => {
    const buildInsights = insightBuilder()
    expect(buildInsights).toBeTypeOf('function')

    const insights = buildInsights?.({
      ap: 0,
      ar: 0,
      avgDailyOut: 0,
      cashAndBank: 100,
      cashIn30: 0,
      cashIn7: 0,
      cashNeed30: 0,
      cashNeed7: 0,
      inventory: 0,
      loan: 0,
      netProfitBeforeTax: 0,
      operatingCashFlow: 0,
    }) ?? []

    expect(insights.find((item) => item.title === 'เงินสดพอจ่ายกี่วัน')?.value).toBe('ยังคำนวณไม่ได้')
  })

  it('does not report a healthy stock-to-cash ratio without a positive cash basis', () => {
    const buildInsights = insightBuilder()
    expect(buildInsights).toBeTypeOf('function')

    const insights = buildInsights?.({
      ap: 0,
      ar: 0,
      avgDailyOut: 0,
      cashAndBank: 0,
      cashIn30: 0,
      cashIn7: 0,
      cashNeed30: 0,
      cashNeed7: 0,
      inventory: 100,
      loan: 0,
      netProfitBeforeTax: 0,
      operatingCashFlow: 0,
    }) ?? []
    const stockInsight = insights.find((item) => item.title === 'เงินจมในสินค้าคงคลัง')

    expect(stockInsight).toMatchObject({
      detail: 'ไม่มีฐานเงินสดและธนาคารสำหรับคำนวณสัดส่วน',
      type: 'warn',
      value: 'ยังคำนวณไม่ได้',
    })
  })

  it('warns when positive profit materially exceeds operating cash flow', () => {
    const buildInsights = insightBuilder()
    expect(buildInsights).toBeTypeOf('function')

    const insights = buildInsights?.({
      ap: 0,
      ar: 0,
      avgDailyOut: 1,
      cashAndBank: 100,
      cashIn30: 0,
      cashIn7: 0,
      cashNeed30: 0,
      cashNeed7: 0,
      inventory: 0,
      loan: 0,
      netProfitBeforeTax: 1_000_000,
      operatingCashFlow: 1,
    }) ?? []

    expect(insights.find((item) => item.title === 'กำไรก่อนภาษีเทียบ OCF')?.type).toBe('warn')
  })
})
