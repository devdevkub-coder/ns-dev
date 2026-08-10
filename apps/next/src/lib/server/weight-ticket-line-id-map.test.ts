import { describe, expect, it } from 'vitest'

import { buildWeightTicketLineIdMap, mergeWeightTicketSectionLines, selectWeightTicketRemovedLineIds } from './weight-tickets'

describe('buildWeightTicketLineIdMap', () => {
  it('maps each submitted client ID to the persisted line with the same line number', () => {
    expect(buildWeightTicketLineIdMap(
      [
        { clientId: 'client-parent', lineNo: 1 },
        { clientId: 'client-lot', lineNo: 2 },
      ],
      [
        { id: 102n, line_no: 2 },
        { id: 101n, line_no: 1 },
      ],
    )).toEqual({
      'client-lot': '102',
      'client-parent': '101',
    })
  })

  it('rejects an incomplete persistence result instead of returning a partial mapping', () => {
    expect(() => buildWeightTicketLineIdMap(
      [
        { clientId: 'client-parent', lineNo: 1 },
        { clientId: 'client-lot', lineNo: 2 },
      ],
      [{ id: 101n, line_no: 1 }],
    )).toThrow('ไม่พบ persisted line สำหรับรายการที่ 2')
  })
})

describe('mergeWeightTicketSectionLines', () => {
  it('replaces a later section without moving it before earlier products', () => {
    expect(mergeWeightTicketSectionLines(
      [
        { id: '101', name: 'A lot 1' },
        { id: '102', name: 'A lot 2' },
        { id: '201', name: 'B lot 1 old' },
      ],
      [
        { id: '201', name: 'B lot 1 new' },
        { id: 'client-b-2', name: 'B lot 2' },
      ],
      new Set(['201']),
    )).toEqual([
      { id: '101', name: 'A lot 1' },
      { id: '102', name: 'A lot 2' },
      { id: '201', name: 'B lot 1 new' },
      { id: 'client-b-2', name: 'B lot 2' },
    ])
  })

  it('appends a new section after all persisted products', () => {
    expect(mergeWeightTicketSectionLines(
      [{ id: '101', name: 'A lot 1' }],
      [{ id: 'client-b-1', name: 'B lot 1' }],
      new Set(),
    )).toEqual([
      { id: '101', name: 'A lot 1' },
      { id: 'client-b-1', name: 'B lot 1' },
    ])
  })
})

describe('selectWeightTicketRemovedLineIds', () => {
  it('never removes another product when saving one section without deletions', () => {
    expect(selectWeightTicketRemovedLineIds(
      [{ id: 101n }, { id: 201n }],
      {
        explicitlyDeletedLineIds: new Set(),
        incomingExistingIds: new Set([201n]),
        saveScope: 'section',
        wasInBase: () => true,
      },
    )).toEqual([])
  })

  it('removes only explicitly deleted lines during a section save', () => {
    expect(selectWeightTicketRemovedLineIds(
      [{ id: 101n }, { id: 201n }, { id: 202n }],
      {
        explicitlyDeletedLineIds: new Set(['202']),
        incomingExistingIds: new Set([201n]),
        saveScope: 'section',
        wasInBase: () => true,
      },
    )).toEqual([202n])
  })
})
