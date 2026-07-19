import { describe, expect, it } from 'vitest'

import {
  buildCostPoolExportHref,
  buildCostPoolQueryString,
  COST_POOL_DEFAULT_FILTERS,
  COST_POOL_GROUP_COLUMN_STORAGE_KEY,
  COST_POOL_GROUP_TABLE_COLUMN_COUNT,
  COST_POOL_LOT_COLUMN_STORAGE_KEY,
  COST_POOL_LOT_TABLE_COLUMN_COUNT,
  costPoolGroupColumns,
  costPoolLotColumns,
} from './cost-pool-page-config'

describe('Cost Pool page configuration', () => {
  it('keeps the screen and XLSX export on the same single-value filter contract', () => {
    expect(buildCostPoolQueryString(COST_POOL_DEFAULT_FILTERS)).toBe('availableOnly=true')

    const queryString = buildCostPoolQueryString({
      availableOnly: false,
      costType: 'Production',
      fromDate: '2026-07-01',
      productId: 'CU-01',
      search: '  POB-001  ',
      sort: 'Expensive',
      sourceType: 'PO_Buy',
      status: 'Partial',
      toDate: '2026-07-12',
    })

    expect(Object.fromEntries(new URLSearchParams(queryString))).toEqual({
      availableOnly: 'false',
      costType: 'Production',
      from: '2026-07-01',
      productId: 'CU-01',
      q: 'POB-001',
      sort: 'Expensive',
      sourceType: 'PO_Buy',
      status: 'Partial',
      to: '2026-07-12',
    })

    const exportParams = new URL(buildCostPoolExportHref(queryString), 'http://localhost').searchParams
    expect(exportParams.get('format')).toBe('xlsx')
    exportParams.delete('format')
    expect(exportParams.toString()).toBe(queryString)
  })

  it('keeps grouped and lot tables on separate persisted, non-collapsing layouts', () => {
    expect(COST_POOL_GROUP_COLUMN_STORAGE_KEY).not.toBe(COST_POOL_LOT_COLUMN_STORAGE_KEY)
    expect(COST_POOL_GROUP_TABLE_COLUMN_COUNT).toBe(costPoolGroupColumns.length)
    expect(COST_POOL_LOT_TABLE_COLUMN_COUNT).toBe(costPoolLotColumns.length)
    expect(COST_POOL_GROUP_TABLE_COLUMN_COUNT).toBe(7)
    expect(COST_POOL_LOT_TABLE_COLUMN_COUNT).toBe(10)

    for (const columns of [costPoolGroupColumns, costPoolLotColumns]) {
      expect(new Set(columns.map((column) => column.key)).size).toBe(columns.length)
      expect(columns.every((column) => column.defaultWidth >= (column.minWidth ?? 80))).toBe(true)
    }
  })
})
