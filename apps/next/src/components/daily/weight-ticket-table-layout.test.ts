import { describe, expect, it } from 'vitest'

import {
  WEIGHT_TICKET_COLUMN_STORAGE_KEY,
  WEIGHT_TICKET_TABLE_COLUMN_COUNT,
  weightTicketColumns,
} from './weight-ticket-table-layout'

describe('weight ticket table layout', () => {
  it('uses balanced defaults that preserve readable content with moderate horizontal overflow', () => {
    expect(weightTicketColumns.map(({ defaultWidth, key }) => [key, defaultWidth])).toEqual([
      ['documentNo', 145],
      ['createdAt', 135],
      ['partyName', 200],
      ['branch', 120],
      ['vehicleNo', 110],
      ['netWeight', 135],
      ['containerDeductionWeight', 150],
      ['status', 130],
      ['updatedAt', 145],
      ['action', 72],
    ])
    expect(weightTicketColumns.reduce((sum, column) => sum + column.defaultWidth, 0)).toBe(1342)
    expect(weightTicketColumns.find((column) => column.key === 'action')).toMatchObject({ defaultWidth: 72, maxWidth: 88, minWidth: 64 })
    expect(weightTicketColumns.every((column) => column.defaultWidth >= (column.minWidth ?? 80))).toBe(true)
  })

  it('keeps table state and full-row spans aligned with the new layout contract', () => {
    expect(WEIGHT_TICKET_COLUMN_STORAGE_KEY).toBe('daily.weight-ticket-list.v2')
    expect(WEIGHT_TICKET_TABLE_COLUMN_COUNT).toBe(weightTicketColumns.length)
    expect(WEIGHT_TICKET_TABLE_COLUMN_COUNT).toBe(10)
  })
})
