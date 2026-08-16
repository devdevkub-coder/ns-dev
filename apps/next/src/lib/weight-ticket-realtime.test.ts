import { describe, expect, it } from 'vitest'
import { isWeightTicketChangeEvent, mergeWeightTicketChangeEvents, weightTicketRealtimeChannel } from './weight-ticket-realtime'

describe('weight-ticket realtime contract', () => {
  it('uses branch-scoped channel names', () => {
    expect(weightTicketRealtimeChannel('branch/01')).toBe('weight-ticket-updates:branch%2F01')
  })

  it('rejects malformed or spoofed payloads', () => {
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: '2026-08-06T10:00:00.000Z', lineIds: ['101', '102'] })).toBe(true)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: '2026-08-06T10:00:00.000Z', imageChanged: true })).toBe(true)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'deleted_lines', documentNo: 'WTI-001', updatedAt: '2026-08-06T10:00:00.000Z', deletedLineIds: ['101'] })).toBe(true)
    expect(isWeightTicketChangeEvent({
      branchId: '1',
      changeType: 'updated',
      documentNo: 'WTI-001',
      updatedAt: '2026-08-06T10:00:00.000Z',
      lineIds: ['101'],
      deletedLineIds: ['102'],
      changedHeaderFields: ['remark', 'vehicleNo'],
    })).toBe(true)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: '2026-08-06T10:00:00.000Z', lineIds: [123] })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'spoofed', documentNo: 'WTI-001', updatedAt: null })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: 'not-a-date' })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '', changeType: 'updated', documentNo: 'WTI-001', updatedAt: null })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: null, imageChanged: 'yes' })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'updated', documentNo: 'WTI-001', updatedAt: null, changedHeaderFields: ['status'] })).toBe(false)
    expect(isWeightTicketChangeEvent({ branchId: '1', changeType: 'deleted_lines', documentNo: 'WTI-001', updatedAt: null, lineIds: ['101'], deletedLineIds: ['102'] })).toBe(false)
  })

  it('merges queued events without broadcasting unrelated duplicate line ids', () => {
    expect(mergeWeightTicketChangeEvents({
      branchId: '1',
      changeType: 'updated',
      documentNo: 'WTI-001',
      updatedAt: '2026-08-06T10:00:00.000Z',
      lineIds: ['101', '102'],
      changedHeaderFields: ['remark'],
    }, {
      branchId: '1',
      changeType: 'updated',
      documentNo: 'WTI-001',
      updatedAt: '2026-08-06T10:01:00.000Z',
      lineIds: ['102', '103'],
      deletedLineIds: ['104'],
      changedHeaderFields: ['vehicleNo'],
      imageChanged: true,
    })).toEqual({
      branchId: '1',
      changeType: 'updated',
      documentNo: 'WTI-001',
      updatedAt: '2026-08-06T10:01:00.000Z',
      lineIds: ['101', '102', '103'],
      deletedLineIds: ['104'],
      changedHeaderFields: ['remark', 'vehicleNo'],
      imageChanged: true,
    })
  })
})
