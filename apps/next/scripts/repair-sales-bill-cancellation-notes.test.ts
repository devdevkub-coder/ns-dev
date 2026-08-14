import { describe, expect, it } from 'vitest'
import {
  collectSalesBillCancellationNoteRepairCandidates,
  salesBillCancellationNoteRepairFingerprint,
  type RepairBill,
} from './repair-sales-bill-cancellation-notes'

function cancelledBill(overrides: Partial<RepairBill> = {}): RepairBill {
  return {
    cancel_note: 'jjj',
    doc_no: 'SB012608-0006',
    id: 6n,
    items: [{ lineNo: 1, note: null, productCode: 'SKU151' }],
    sales_bill_lines: [{
      id: 61n,
      line_no: 1,
      notes: 'Cancelled from Sales Bill SB012608-0006: jjj',
      product_code_snapshot: 'SKU151',
      status: 'cancelled',
    }],
    status: 'cancelled',
    ...overrides,
  }
}

describe('collectSalesBillCancellationNoteRepairCandidates', () => {
  it('restores NULL only for an exact system overwrite with a unique snapshot match', () => {
    const { candidates, skipped } = collectSalesBillCancellationNoteRepairCandidates([cancelledBill()])
    expect(candidates).toEqual([{
      billDocNo: 'SB012608-0006',
      billId: '6',
      currentNote: 'Cancelled from Sales Bill SB012608-0006: jjj',
      lineId: '61',
      lineNo: 1,
      productCode: 'SKU151',
      restoreNote: null,
    }])
    expect(skipped).toEqual([])
  })

  it('restores the exact snapshot note when the snapshot contains a string note', () => {
    const bill = cancelledBill({
      items: [{ lineNo: 1, note: 'หมายเหตุสินค้าเดิม', productCode: 'SKU151' }],
    })
    const { candidates } = collectSalesBillCancellationNoteRepairCandidates([bill])
    expect(candidates).toHaveLength(1)
    expect(candidates[0].restoreNote).toBe('หมายเหตุสินค้าเดิม')
  })

  it('does not select a normal business note', () => {
    const bill = cancelledBill({
      sales_bill_lines: [{
        id: 61n,
        line_no: 1,
        notes: 'หมายเหตุปกติของสินค้า',
        product_code_snapshot: 'SKU151',
        status: 'cancelled',
      }],
    })
    const { candidates, skipped } = collectSalesBillCancellationNoteRepairCandidates([bill])
    expect(candidates).toEqual([])
    expect(skipped).toEqual([])
  })

  it('does not select a similar but non-exact cancellation string', () => {
    const bill = cancelledBill({
      sales_bill_lines: [{
        id: 61n,
        line_no: 1,
        notes: 'Cancelled from Sales Bill SB012608-0006: jjj extra',
        product_code_snapshot: 'SKU151',
        status: 'cancelled',
      }],
    })
    const { candidates, skipped } = collectSalesBillCancellationNoteRepairCandidates([bill])
    expect(candidates).toEqual([])
    expect(skipped).toEqual([{ billDocNo: 'SB012608-0006', lineId: '61', reason: 'note_mismatch' }])
  })

  it('skips a missing, duplicate, or product-mismatched snapshot row', () => {
    const missing = cancelledBill({ items: [{ lineNo: 2, note: null, productCode: 'SKU151' }] })
    expect(collectSalesBillCancellationNoteRepairCandidates([missing]).candidates).toEqual([])
    expect(collectSalesBillCancellationNoteRepairCandidates([missing]).skipped).toEqual([
      { billDocNo: 'SB012608-0006', lineId: '61', reason: 'snapshot_match' },
    ])

    const duplicate = cancelledBill({
      items: [
        { lineNo: 1, note: null, productCode: 'SKU151' },
        { lineNo: 1, note: null, productCode: 'SKU151' },
      ],
    })
    expect(collectSalesBillCancellationNoteRepairCandidates([duplicate]).candidates).toEqual([])
    expect(collectSalesBillCancellationNoteRepairCandidates([duplicate]).skipped).toEqual([
      { billDocNo: 'SB012608-0006', lineId: '61', reason: 'snapshot_match' },
    ])

    const productMismatch = cancelledBill({ items: [{ lineNo: 1, note: null, productCode: 'SKU999' }] })
    expect(collectSalesBillCancellationNoteRepairCandidates([productMismatch]).candidates).toEqual([])
    expect(collectSalesBillCancellationNoteRepairCandidates([productMismatch]).skipped).toEqual([
      { billDocNo: 'SB012608-0006', lineId: '61', reason: 'snapshot_match' },
    ])
  })

  it('accepts only cancelled/canceled bill and line statuses', () => {
    const activeBill = cancelledBill({ status: 'active' })
    expect(collectSalesBillCancellationNoteRepairCandidates([activeBill]).candidates).toEqual([])

    const activeLine = cancelledBill({
      sales_bill_lines: [{
        id: 61n,
        line_no: 1,
        notes: 'Cancelled from Sales Bill SB012608-0006: jjj',
        product_code_snapshot: 'SKU151',
        status: 'active',
      }],
    })
    const activeLineResult = collectSalesBillCancellationNoteRepairCandidates([activeLine])
    expect(activeLineResult.candidates).toEqual([])
    expect(activeLineResult.skipped).toEqual([{ billDocNo: 'SB012608-0006', lineId: '61', reason: 'line_status' }])

    const canceledSpelling = cancelledBill({
      status: 'canceled',
      sales_bill_lines: [{
        id: 61n,
        line_no: 1,
        notes: 'Cancelled from Sales Bill SB012608-0006: jjj',
        product_code_snapshot: 'SKU151',
        status: 'canceled',
      }],
    })
    expect(collectSalesBillCancellationNoteRepairCandidates([canceledSpelling]).candidates).toHaveLength(1)
  })

  it('skips a snapshot row whose note is neither null nor a string', () => {
    const bill = cancelledBill({
      items: [{ lineNo: 1, note: { nested: true }, productCode: 'SKU151' }],
    })
    const result = collectSalesBillCancellationNoteRepairCandidates([bill])
    expect(result.candidates).toEqual([])
    expect(result.skipped).toEqual([{ billDocNo: 'SB012608-0006', lineId: '61', reason: 'snapshot_note' }])
  })

  it('skips a bill without a cancel note or items array', () => {
    expect(collectSalesBillCancellationNoteRepairCandidates([cancelledBill({ cancel_note: null })]).candidates).toEqual([])
    expect(collectSalesBillCancellationNoteRepairCandidates([cancelledBill({ cancel_note: '  ' })]).candidates).toEqual([])
    expect(collectSalesBillCancellationNoteRepairCandidates([cancelledBill({ items: null as unknown as unknown[] })]).candidates).toEqual([])
  })

  it('falls back to index + 1 only when the snapshot has no lineNo', () => {
    const noLineNo = cancelledBill({
      items: [{ note: null, productCode: 'SKU151' }],
    })
    expect(collectSalesBillCancellationNoteRepairCandidates([noLineNo]).candidates).toHaveLength(1)

    const malformedLineNo = cancelledBill({
      items: [{ lineNo: 'abc', note: null, productCode: 'SKU151' }],
    })
    expect(collectSalesBillCancellationNoteRepairCandidates([malformedLineNo]).candidates).toEqual([])
    expect(collectSalesBillCancellationNoteRepairCandidates([malformedLineNo]).skipped).toEqual([
      { billDocNo: 'SB012608-0006', lineId: '61', reason: 'snapshot_match' },
    ])
  })
})

describe('salesBillCancellationNoteRepairFingerprint', () => {
  it('produces the same fingerprint regardless of input order', () => {
    const billA = cancelledBill({
      cancel_note: 'ddd',
      doc_no: 'SB012608-0002',
      id: 2n,
      items: [{ lineNo: 1, note: null, productCode: 'SKU151' }],
      sales_bill_lines: [{
        id: 21n,
        line_no: 1,
        notes: 'Cancelled from Sales Bill SB012608-0002: ddd',
        product_code_snapshot: 'SKU151',
        status: 'cancelled',
      }],
    })
    const billB = cancelledBill()

    const forward = salesBillCancellationNoteRepairFingerprint(
      collectSalesBillCancellationNoteRepairCandidates([billA, billB]).candidates,
    )
    const reversed = salesBillCancellationNoteRepairFingerprint(
      collectSalesBillCancellationNoteRepairCandidates([billB, billA]).candidates,
    )
    expect(forward).toBe(reversed)
    expect(forward).toMatch(/^[a-f0-9]{64}$/)
  })
})
