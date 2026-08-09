import { describe, expect, it } from 'vitest'
import {
  paginatePurchaseBillPrintRows,
  parsePurchaseBillRemark,
  purchaseBillRowSegmentKey,
  type PurchaseBillPrintMeasurements,
} from './purchase-bill-print-layout'

function measurements(
  rowHeights: Array<number | Record<string, number>>,
  overrides: Partial<PurchaseBillPrintMeasurements> = {},
): PurchaseBillPrintMeasurements {
  const segmentHeights: Record<string, number> = {}
  rowHeights.forEach((height, rowIndex) => {
    if (typeof height === 'number') {
      segmentHeights[purchaseBillRowSegmentKey(rowIndex, 0, 0)] = height
      return
    }
    Object.entries(height).forEach(([range, rangeHeight]) => {
      const [start, end] = range.split(':').map(Number)
      segmentHeights[purchaseBillRowSegmentKey(rowIndex, start, end)] = rangeHeight
    })
  })

  return {
    continuationEndHeight: 150,
    emptyRowMinimumHeight: 18,
    finalEndHeight: 250,
    pageContentHeight: 1_000,
    segmentHeights,
    tableHeaderHeight: 50,
    topHeight: 100,
    ...overrides,
  }
}

describe('purchase bill print layout', () => {
  it('normalizes numbered REMARK entries without merging their text', () => {
    expect(parsePurchaseBillRemark('- 1. อลูมิเนียม 6 กก. ซื้อเป็นกระทะดำ\n- 2. อลูมิเนียม 6.50 กก. ซื้อเป็นก้ามเบรค\n- 3. อลูมิเนียม 12.50 กก.'))
      .toEqual({
        kind: 'numbered',
        items: [
          'อลูมิเนียม 6 กก. ซื้อเป็นกระทะดำ',
          'อลูมิเนียม 6.50 กก. ซื้อเป็นก้ามเบรค',
          'อลูมิเนียม 12.50 กก.',
        ],
      })
  })

  it('keeps an ordinary single note as plain text', () => {
    expect(parsePurchaseBillRemark('หมายเหตุธรรมดา')).toEqual({
      kind: 'plain',
      text: 'หมายเหตุธรรมดา',
    })
  })

  it('normalizes an inline numbered source while preserving decimal values', () => {
    expect(parsePurchaseBillRemark('- 1. สินค้าอื่น 6.50 กก. - 2. สินค้าอื่น 12.50 กก.'))
      .toEqual({
        kind: 'numbered',
        items: ['สินค้าอื่น 6.50 กก.', 'สินค้าอื่น 12.50 กก.'],
      })
  })

  it.each([
    '- 1. ข้อหนึ่ง - 2. ',
    '- 1. ข้อหนึ่ง - 2. - 3. ข้อสาม',
  ])('preserves malformed numbered REMARK text instead of dropping an empty item: %s', (note) => {
    expect(parsePurchaseBillRemark(note)).toEqual({ kind: 'plain', text: note.trim() })
  })

  it.each([
    { count: 0, expectedPages: 1 },
    { count: 1, expectedPages: 1 },
    { count: 15, expectedPages: 1 },
    { count: 16, expectedPages: 2 },
    { count: 30, expectedPages: 2 },
    { count: 31, expectedPages: 3 },
  ])('uses measured height with a maximum of 15 rows for $count items', ({ count, expectedPages }) => {
    const notes = Array.from({ length: count }, () => '')
    const plan = paginatePurchaseBillPrintRows(notes, measurements(notes.map(() => 40)))

    expect(plan).toHaveLength(expectedPages)
    expect(plan.every((page) => page.rows.length <= 15)).toBe(true)
    expect(plan.flatMap((page) => page.rows.map((row) => row.sourceIndex)))
      .toEqual(Array.from({ length: count }, (_, index) => index))
    expect(plan.at(-1)?.isFinalPage).toBe(true)
  })

  it('moves a whole row to the final page when the reserved signature area would be hit', () => {
    const plan = paginatePurchaseBillPrintRows(
      ['', '', ''],
      measurements([200, 200, 250]),
    )

    expect(plan.map((page) => page.rows.map((row) => row.sourceIndex))).toEqual([[0, 1], [2]])
    expect(plan[0]?.isFinalPage).toBe(false)
    expect(plan[1]?.isFinalPage).toBe(true)
  })

  it.each([
    { remainingHeight: 0.51, expected: [] },
    { remainingHeight: 17.99, expected: [] },
    { remainingHeight: 18, expected: [18] },
    { remainingHeight: 18.01, expected: [18.01] },
  ])('adds a filler row only when the remaining $remainingHeight px can hold its measured minimum', ({ remainingHeight, expected }) => {
    const plan = paginatePurchaseBillPrintRows(
      [''],
      measurements([600 - remainingHeight]),
    )

    const fillerRows = plan[0]?.emptyRowHeights ?? []
    expect(fillerRows).toHaveLength(expected.length)
    if (expected[0] !== undefined) expect(fillerRows[0]).toBeCloseTo(expected[0], 5)
  })

  it('splits an over-height row only between numbered REMARK entries', () => {
    const note = '- 1. ข้อหนึ่ง\n- 2. ข้อสอง\n- 3. ข้อสาม'
    const plan = paginatePurchaseBillPrintRows(
      [note],
      measurements([{
        '0:1': 250,
        '0:2': 500,
        '0:3': 800,
        '1:2': 220,
        '1:3': 420,
        '2:3': 200,
      }]),
    )

    expect(plan).toHaveLength(2)
    expect(plan[0]?.rows).toEqual([expect.objectContaining({
      remarkEnd: 2,
      remarkStart: 0,
      showValues: true,
      sourceIndex: 0,
    })])
    expect(plan[1]?.rows).toEqual([expect.objectContaining({
      remarkEnd: 3,
      remarkStart: 2,
      showValues: false,
      sourceIndex: 0,
    })])
  })

  it('fails instead of cutting an ordinary note in the middle', () => {
    expect(() => paginatePurchaseBillPrintRows(
      ['ข้อความเดียวที่สูงเกินหน้า'],
      measurements([700]),
    )).toThrow('ไม่สามารถแบ่งรายการที่ 1 โดยไม่ตัดกลางข้อความ')
  })
})
