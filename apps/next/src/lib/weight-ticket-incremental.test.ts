import { describe, expect, it } from 'vitest'
import { weightTicketDeleteLinesSchema, weightTicketIncrementalPatchSchema } from './weight-tickets'

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
    collaborationBaseUpdatedAt: null,
    draftLineIds: [],
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
  })

  it('requires section identity for a section PATCH', () => {
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ scope: 'section' })).success).toBe(false)
    expect(weightTicketIncrementalPatchSchema.safeParse(patch({ scope: 'section', sectionLineIds: ['line-1'] })).success).toBe(true)
  })

  it('requires a baseline version for every deleted line', () => {
    expect(weightTicketDeleteLinesSchema.safeParse({
      operation: 'delete_lines',
      deletedLineIds: ['line-1'],
      collaborationBaseLineVersions: {},
    }).success).toBe(false)
    expect(weightTicketDeleteLinesSchema.safeParse({
      operation: 'delete_lines',
      deletedLineIds: ['line-1'],
      collaborationBaseLineVersions: { 'line-1': 1 },
    }).success).toBe(true)
  })
})
