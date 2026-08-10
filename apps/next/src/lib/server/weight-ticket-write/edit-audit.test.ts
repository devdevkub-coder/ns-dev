import { describe, expect, it } from 'vitest'
import { shouldAppendWeightTicketEditTimeline, weightTicketImageReferencesFingerprint } from './edit-audit'

describe('weight-ticket edit timeline boundary', () => {
  it('does not append an edit event when the save has no business changes', () => {
    expect(shouldAppendWeightTicketEditTimeline([], false)).toBe(false)
  })

  it('appends an edit event when a business change exists', () => {
    expect(shouldAppendWeightTicketEditTimeline([
      { after: 'ใหม่', before: 'เดิม', field: 'หมายเหตุ', scope: 'เอกสาร' },
    ], false)).toBe(true)
  })

  it('keeps pending-out side effects traceable even without document field changes', () => {
    expect(shouldAppendWeightTicketEditTimeline([], true)).toBe(true)
  })

  it('detects an image replacement when the number of images stays the same', () => {
    expect(weightTicketImageReferencesFingerprint(['old.jpg']))
      .not.toBe(weightTicketImageReferencesFingerprint(['new.jpg']))
  })
})
