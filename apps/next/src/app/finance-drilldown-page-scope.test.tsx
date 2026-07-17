import { describe, expect, it } from 'vitest'
import AssetOverviewPage from './finance-accounting/asset-overview/page'
import CashFlowStatementPage from './finance-accounting/cash-flow-statement/page'
import AccountsPayablePage from './finance/ap/page'
import AccountsReceivablePage from './finance/ar/page'
import BankStatementPage from './finance/bank/page'

describe('finance drilldown page scope', () => {
  it('hydrates Cash Flow Statement filters from URL search params', async () => {
    const element = await CashFlowStatementPage({
      searchParams: Promise.resolve({ branchId: ['bkk', 'CNX'], from: '2026-06-01', to: '2026-06-30' }),
    })

    expect(element.props.initialFilters).toEqual({
      branchId: 'BKK',
      from: '2026-06-01',
      to: '2026-06-30',
    })
  })

  it('hydrates Asset Overview filters from URL search params', async () => {
    const element = await AssetOverviewPage({
      searchParams: Promise.resolve({ asOf: '2026-07-17', branchId: ['bkk', 'CNX'] }),
    })

    expect(element.props.initialFilters).toEqual({
      asOf: '2026-07-17',
      branchId: 'BKK',
    })
  })

  it('hydrates AR filters from URL search params', async () => {
    const element = await AccountsReceivablePage({
      searchParams: Promise.resolve({ branchId: 'bkk', from: ['2026-06-01', '2026-01-01'], to: '2026-06-30' }),
    })

    expect(element.props.initialFilters).toEqual({
      branchId: 'BKK',
      from: '2026-06-01',
      to: '2026-06-30',
    })
  })

  it('hydrates AP filters from URL search params', async () => {
    const element = await AccountsPayablePage({
      searchParams: Promise.resolve({ branchId: 'bkk', from: '2026-06-01', to: ['2026-06-30', '2026-12-31'] }),
    })

    expect(element.props.initialFilters).toEqual({
      branchId: 'BKK',
      from: '2026-06-01',
      to: '2026-06-30',
    })
  })

  it('hydrates only supported Bank Statement date filters and ignores branchId', async () => {
    const element = await BankStatementPage({
      searchParams: Promise.resolve({ branchId: 'BKK', from: '2026-06-01', to: '2026-06-30' }),
    })

    expect(element.props.initialFilters).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    })
    expect(element.props.initialFilters).not.toHaveProperty('branchId')
  })
})
