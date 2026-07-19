import { describe, expect, it } from 'vitest'
import {
  decimalString,
  parseProfitCostFilter,
  parseProfitCostTableQuery,
} from './profit-cost-report-contract'

describe('profit-cost-report contract', () => {
  it('parses internal IDs, dates, and optional report dimensions without coercing business codes', () => {
    expect(parseProfitCostFilter(new URLSearchParams({
      branchId: '12',
      customerId: '34',
      from: '2026-07-01',
      productId: '56',
      purchaseChannelId: '78',
      salesChannelId: '90',
      supplierId: '123',
      to: '2026-07-31',
    }))).toEqual({
      branchId: 12n,
      customerId: 34n,
      from: '2026-07-01',
      productId: 56n,
      purchaseChannelId: 78n,
      salesChannelId: 90n,
      supplierId: 123n,
      to: '2026-07-31',
    })

    expect(() => parseProfitCostFilter(new URLSearchParams({
      branchId: 'B01',
      from: '2026-07-01',
      to: '2026-07-31',
    }))).toThrow('branchId')
  })

  it('rejects missing or inverted date ranges', () => {
    expect(() => parseProfitCostFilter(new URLSearchParams({
      from: '2026-07-31',
      to: '2026-07-01',
    }))).toThrow('from')

    expect(() => parseProfitCostFilter(new URLSearchParams({
      to: '2026-07-31',
    }))).toThrow('from')
  })

  it('accepts only canonical page sizes and endpoint sort allowlists', () => {
    expect(parseProfitCostTableQuery(new URLSearchParams({
      from: '2026-07-01',
      page: '2',
      pageSize: '25',
      sortBy: 'gp',
      sortDirection: 'asc',
      to: '2026-07-31',
    }), ['gp', 'revenue'] as const)).toMatchObject({
      page: 2,
      pageSize: 25,
      sortBy: 'gp',
      sortDirection: 'asc',
    })

    expect(() => parseProfitCostTableQuery(new URLSearchParams({
      from: '2026-07-01',
      pageSize: '999',
      sortBy: 'gp',
      to: '2026-07-31',
    }), ['gp'] as const)).toThrow('pageSize')

    expect(() => parseProfitCostTableQuery(new URLSearchParams({
      from: '2026-07-01',
      sortBy: 'sql_injection',
      to: '2026-07-31',
    }), ['gp'] as const)).toThrow('sortBy')
  })

  it('keeps PostgreSQL numeric values as decimal strings at the API boundary', () => {
    expect(decimalString('8881.600')).toBe('8881.600')
    expect(decimalString('-0.25')).toBe('-0.25')
    expect(() => decimalString(8881.6)).toThrow('decimal')
    expect(() => decimalString('1,000.00')).toThrow('decimal')
  })
})
