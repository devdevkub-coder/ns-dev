import { describe, expect, it } from 'vitest'
import { parseProductionOrdersQuery } from './production-orders-query'

describe('parseProductionOrdersQuery', () => {
  it('parses an outward branch code from the request query', () => {
    const query = parseProductionOrdersQuery(new URLSearchParams({
      branchCode: ' BKK ',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    }))

    expect(query.branchCode).toBe('BKK')
    expect(query.dateFrom).toBe('2026-07-01')
    expect(query.dateTo).toBe('2026-07-31')
  })

  it('ignores an empty branch code', () => {
    expect(parseProductionOrdersQuery(new URLSearchParams({ branchCode: '   ' })).branchCode).toBe('')
  })

  it('keeps pagination and sort values inside the supported contract', () => {
    const query = parseProductionOrdersQuery(new URLSearchParams({
      direction: 'asc',
      page: '-2',
      pageSize: '500',
      search: '  PO-2607  ',
      docNo: ' PO2607-0001 ',
      include: 'detail',
      sort: 'unknown-field',
    }))

    expect(query.direction).toBe('asc')
    expect(query.page).toBe(1)
    expect(query.pageSize).toBe(100)
    expect(query.search).toBe('PO-2607')
    expect(query.docNo).toBe('PO2607-0001')
    expect(query.includeDetail).toBe(true)
    expect(query.sort).toBe('docNo')
  })

  it('drops invalid dates and unsupported statuses instead of passing them to Prisma', () => {
    const query = parseProductionOrdersQuery(new URLSearchParams({
      dateFrom: '2026-02-30',
      dateTo: 'not-a-date',
      direction: 'sideways',
      status: 'Unknown',
    }))

    expect(query.dateFrom).toBe('')
    expect(query.dateTo).toBe('')
    expect(query.direction).toBe('desc')
    expect(query.statuses).toEqual([])
  })

  it('parses repeated and comma-separated statuses as a validated multi-select filter', () => {
    const params = new URLSearchParams('status=Open&status=Completed%2CCancelled&status=Unknown&status=Open')

    expect(parseProductionOrdersQuery(params).statuses).toEqual(['Open', 'Completed', 'Cancelled'])
  })
})
