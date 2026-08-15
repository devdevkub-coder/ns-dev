import { describe, expect, it } from 'vitest'
import { weightTicketDeleteLinesSchema, weightTicketIncrementalPatchSchema, weightTicketUpdateSchema } from './weight-tickets'

const header = {
  branchId: '01',
  partyId: 'supplier-1',
  remark: '',
  vehicleImageNames: [],
  vehicleNo: 'กก-123',
  godownName: '',
}

function patch(overrides: Record<string, unknown> = {}) {
  return {
    operation: 'save_changes',
    scope: 'document',
    collaborationBaseHeader: header,
    header: {},
    lines: [],
    deletedLineIds: [],
    collaborationBaseLineIds: ['line-1'],
    collaborationBaseLineVersions: { 'line-1': 1 },
    collaborationChangedLineIds: [],
    collaborationBaseUpdatedAt: '2026-08-15T00:00:00.000Z',
    draftLineIds: [],
    ...overrides,
  }
}

function update(overrides: Record<string, unknown> = {}) {
  return {
    branchId: '01',
    collaborationBaseLineIds: [],
    collaborationBaseLineVersions: {},
    collaborationChangedLineIds: [],
    collaborationDeletedLineIds: [],
    collaborationBaseHeader: header,
    collaborationChangedHeaderFields: [],
    collaborationBaseUpdatedAt: '2026-08-15T00:00:00.000Z',
    draftLineIds: [],
    id: 'ticket-1',
    lines: [],
    partyId: 'supplier-1',
    remark: '',
    saveScope: 'header',
    type: 'WTI',
    vehicleImageNames: [],
    vehicleNo: 'กก-123',
    godownName: '',
    ...overrides,
  }
}

describe('weight-ticket incremental PATCH contract', () => {
  it('requires a complete persisted line baseline', () => {
    expect(weightTicketIncrementalPatchSchema.safeParse(patch()).success).toBe(true)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ collaborationBaseLineIds: undefined })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ collaborationBaseLineVersions: undefined })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ collaborationChangedLineIds: undefined })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ collaborationBaseLineVersions: { 'line-2': 1 } })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ collaborationBaseLineIds: ['line-1', 'line-1'] })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ collaborationBaseUpdatedAt: undefined })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ draftLineIds: undefined })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ header: undefined })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ lines: undefined })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ deletedLineIds: undefined })).success).toBe(false)
  })

  it('requires section identity for a section PATCH', () => {
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ scope: 'section' })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ scope: 'section', sectionLineIds: ['line-1'] })).success).toBe(true)
  })

  it('requires a baseline version for every deleted line', () => {
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({
      deletedLineIds: ['line-2'],
    })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({
      deletedLineIds: ['line-1'],
      collaborationBaseLineVersions: {},
    })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({
      deletedLineIds: ['line-1'],
    })).success).toBe(true)
    expect(weightTicketDeleteLinesSchema.safeParse({
      operation: 'delete_lines',
      deletedLineIds: ['line-1'],
      collaborationBaseLineVersions: {},
      collaborationBaseUpdatedAt: '2026-08-15T00:00:00.000Z',
    }).success).toBe(false)
    expect(weightTicketDeleteLinesSchema.safeParse({
      operation: 'delete_lines',
      deletedLineIds: ['line-1'],
      collaborationBaseLineVersions: { 'line-1': 1 },
      collaborationBaseUpdatedAt: '2026-08-15T00:00:00.000Z',
    }).success).toBe(true)
    expect(weightTicketDeleteLinesSchema.safeParse({
      operation: 'delete_lines',
      deletedLineIds: ['line-1'],
      collaborationBaseLineVersions: { 'line-1': 1 },
    }).success).toBe(false)
  })
})

describe('weight-ticket existing update contract', () => {
  it('requires immutable collaboration identity and timestamp for PUT', () => {
    expect(weightTicketUpdateSchema.safeParse(update()).success).toBe(true)
    expect(weightTicketUpdateSchema.safeParse(update({ collaborationBaseLineIds: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ collaborationBaseLineVersions: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ collaborationChangedLineIds: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ collaborationDeletedLineIds: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ collaborationBaseHeader: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ collaborationChangedHeaderFields: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ collaborationBaseUpdatedAt: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ draftLineIds: undefined })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({ id: '' })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({
      collaborationBaseLineIds: ['line-1', 'line-1'],
      collaborationBaseLineVersions: { 'line-1': 1 },
    })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({
      collaborationBaseLineIds: ['line-1'],
      collaborationBaseLineVersions: {},
    })).success).toBe(false)
    expect(weightTicketUpdateSchema.safeParse(update({
      collaborationBaseLineIds: ['line-1'],
      collaborationBaseLineVersions: { 'line-1': 1 },
      collaborationDeletedLineIds: ['line-2'],
    })).success).toBe(false)
  })
})
