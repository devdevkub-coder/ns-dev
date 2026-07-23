import { describe, expect, it } from 'vitest'
import { assertExistingWtiLinesComplete, type WtiLineValidationRow, WtiDraftOperationError } from './wti-draft'

function validLine(overrides: Partial<WtiLineValidationRow> = {}): WtiLineValidationRow {
  return {
    container_deduction_weight: 5,
    deduction_mode: 'none',
    deduction_value: 0,
    gross_weight: 100,
    image_names: ['wti-line-image.jpg'],
    impurity_id: null,
    impurity_name: null,
    line_no: 1,
    parent_line_no: null,
    ...overrides,
  }
}

describe('WTI add-line validation gate', () => {
  it('allows adding a line when all existing lines are complete', () => {
    expect(() => assertExistingWtiLinesComplete([validLine()])).not.toThrow()
  })

  const incompleteCases: Array<[string, Partial<WtiLineValidationRow>, string]> = [
    ['gross weight', { gross_weight: 0 }, 'ต้องกรอกน้ำหนักรวม'],
    ['container deduction', { container_deduction_weight: 101 }, 'หักภาชนะต้องไม่เกินน้ำหนักรวม'],
    ['evidence image', { image_names: [] }, 'ต้องแนบรูปภาพ'],
  ]

  it.each(incompleteCases)('blocks an incomplete existing line (%s)', (_caseName, overrides, message) => {
    expect(() => assertExistingWtiLinesComplete([validLine(overrides)])).toThrow(WtiDraftOperationError)
    expect(() => assertExistingWtiLinesComplete([validLine(overrides)])).toThrow(message)
  })

  it('validates impurity rows before allowing another line', () => {
    expect(() => assertExistingWtiLinesComplete([validLine({
      deduction_mode: 'kg',
      deduction_value: 0,
      impurity_id: 42n,
      parent_line_no: 1,
    })])).toThrow('ต้องกรอกน้ำหนักหักสิ่งเจือปน')
  })
})
