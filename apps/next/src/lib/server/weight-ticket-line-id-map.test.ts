import { describe, expect, it } from 'vitest'

import {
  assignWeightTicketLotSequences,
  buildWeightTicketLineIdMap,
  mergeWeightTicketSectionLines,
  mergeWeightTicketSectionLinesByChangeSet,
  resolveWeightTicketDeleteClientIds,
  resolveWeightTicketLineClientIds,
  selectWeightTicketRemoteDeletedChangedLineIds,
  selectWeightTicketRemovedLineIds,
  selectWeightTicketUnresolvedChangedLineIds,
} from './weight-tickets'

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

describe('resolveWeightTicketLineClientIds', () => {
  it('reuses a persisted client identity for a retried new line and its relations', () => {
    const resolved = resolveWeightTicketLineClientIds([
      { id: 'client-lot', parentId: 'client-product', impuritySourceLineId: undefined },
      { id: 'client-product', parentId: undefined, impuritySourceLineId: undefined },
    ], new Map([
      ['client-lot', '1002'],
      ['client-product', '1001'],
    ]))

    expect(resolved.lines).toEqual([
      { id: '1002', parentId: '1001', impuritySourceLineId: undefined },
      { id: '1001', parentId: undefined, impuritySourceLineId: undefined },
    ])
    expect(resolved.lineIdMap).toEqual({ 'client-lot': '1002', 'client-product': '1001' })
  })

  it('leaves lines without a durable client identity unchanged', () => {
    expect(resolveWeightTicketLineClientIds(
      [{ id: '1001', parentId: undefined, impuritySourceLineId: undefined }],
      new Map(),
    ).lines).toEqual([{ id: '1001', parentId: undefined, impuritySourceLineId: undefined }])
  })
})

describe('resolveWeightTicketDeleteClientIds', () => {
  it('maps a retried delete from a client UUID to the persisted line id', () => {
    expect(resolveWeightTicketDeleteClientIds(
      ['client-lot'],
      { 'client-lot': 3 },
      new Map([['client-lot', '1002']]),
    )).toEqual({
      deletedLineIds: ['1002'],
      collaborationBaseLineVersions: { '1002': 3 },
    })
  })

  it('keeps an already persisted id unchanged when no client mapping exists', () => {
    expect(resolveWeightTicketDeleteClientIds(
      ['1002'],
      { '1002': 3 },
      new Map(),
    )).toEqual({
      deletedLineIds: ['1002'],
      collaborationBaseLineVersions: { '1002': 3 },
    })
  })
})

describe('assignWeightTicketLotSequences', () => {
  it('preserves existing sequence, assigns only physical lots, and never reuses deleted numbers', async () => {
    const tx = {
      weight_ticket_lines: {
        aggregate: async () => ({ _max: { lot_seq: 4 } }),
      },
    } as never

    await expect(assignWeightTicketLotSequences(tx, 1n, [
      { data: { deduction_mode: 'none', name: 'existing' }, existingLotSeq: 2 },
      { data: { deduction_mode: 'kg', name: 'impurity' } },
      { data: { deduction_mode: 'none', name: 'new' } },
    ])).resolves.toEqual([
      { deduction_mode: 'none', name: 'existing', lot_seq: 2 },
      { deduction_mode: 'kg', name: 'impurity', lot_seq: null },
      { deduction_mode: 'none', name: 'new', lot_seq: 5 },
    ])
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

describe('mergeWeightTicketSectionLinesByChangeSet', () => {
  it('keeps a remote lot added after the local baseline while applying the local lot change', () => {
    expect(mergeWeightTicketSectionLinesByChangeSet(
      [
        { id: '101', name: 'A lot 1 current' },
        { id: '102', name: 'A lot 2 current' },
        { id: '103', name: 'A lot 3 added by another user' },
        { id: '201', name: 'B lot 1 current' },
      ],
      [
        { id: '101', name: 'A lot 1 edited locally' },
        { id: '102', name: 'A lot 2 current from stale form' },
        { id: 'client-a-3', name: 'A lot 3 added locally' },
      ],
      new Set(['101', '102', '103']),
      new Set(['101', '102']),
      new Set(['101', 'client-a-3']),
      new Set(),
    )).toEqual([
      { id: '101', name: 'A lot 1 edited locally' },
      { id: '102', name: 'A lot 2 current' },
      { id: 'client-a-3', name: 'A lot 3 added locally' },
      { id: '103', name: 'A lot 3 added by another user' },
      { id: '201', name: 'B lot 1 current' },
    ])
  })

  it('uses the latest request for the same persisted lot and removes only its explicit deletion', () => {
    expect(mergeWeightTicketSectionLinesByChangeSet(
      [
        { id: '101', name: 'A lot 1 current' },
        { id: '102', name: 'A lot 2 current' },
        { id: '201', name: 'B lot 1 current' },
      ],
      [
        { id: '101', name: 'A lot 1 latest request' },
        { id: '102', name: 'A lot 2 stale request' },
      ],
      new Set(['101', '102']),
      new Set(['101', '102']),
      new Set(['101']),
      new Set(['102']),
    )).toEqual([
      { id: '101', name: 'A lot 1 latest request' },
      { id: '201', name: 'B lot 1 current' },
    ])
  })

  it('does not recreate a baseline lot deleted remotely before the section save', () => {
    expect(mergeWeightTicketSectionLinesByChangeSet(
      [
        { id: '201', name: 'B lot 1 current' },
      ],
      [
        { id: '101', name: 'A lot 1 stale local edit' },
        { id: '102', name: 'A lot 2 new local lot' },
      ],
      new Set(['101', '102']),
      new Set(['101']),
      new Set(['101', '102']),
      new Set(),
    )).toEqual([
      { id: '201', name: 'B lot 1 current' },
      { id: '102', name: 'A lot 2 new local lot' },
    ])
  })
})

describe('selectWeightTicketUnresolvedChangedLineIds', () => {
  it('treats a baseline line deleted by another user as an LWW no-op', () => {
    expect(selectWeightTicketUnresolvedChangedLineIds(
      new Set(['101', 'client-new']),
      new Set(),
      new Set(['101']),
      { 'client-new': '1001' },
    )).toEqual([])
  })

  it('fails closed for an unmapped client line that was not in the baseline', () => {
    expect(selectWeightTicketUnresolvedChangedLineIds(
      new Set(['client-new']),
      new Set(),
      new Set(),
      {},
    )).toEqual(['client-new'])
  })
})

describe('selectWeightTicketRemoteDeletedChangedLineIds', () => {
  it('marks a missing persisted baseline line as a remote delete', () => {
    expect(selectWeightTicketRemoteDeletedChangedLineIds(
      ['101', 'client-new'],
      new Set(['101']),
      new Set(['201']),
    )).toEqual(new Set(['101']))
  })

  it('does not treat a new client line or a current line as deleted', () => {
    expect(selectWeightTicketRemoteDeletedChangedLineIds(
      ['101', 'client-new'],
      new Set(['101']),
      new Set(['101']),
    )).toEqual(new Set())
    expect(selectWeightTicketRemoteDeletedChangedLineIds(
      ['client-new'],
      new Set(['101']),
      new Set(['101']),
    )).toEqual(new Set())
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
