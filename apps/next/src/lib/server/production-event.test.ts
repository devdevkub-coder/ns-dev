import { describe, expect, it } from 'vitest'

import { assertProductionOrderDocumentNo, createProductionEventRef, formatProductionInputEvent, formatProductionOutputRound, productionEventKinds } from './production-event'

describe('production event identity contract', () => {
  it('accepts a branch-coded PO document number', () => {
    expect(assertProductionOrderDocumentNo('po012607-0001')).toBe('PO012607-0001')
  })

  it('formats output rounds under the PO document', () => {
    expect(formatProductionOutputRound('PO012607-0001', 1)).toBe('PO012607-0001/01')
    expect(formatProductionOutputRound('PO012607-0001', 2)).toBe('PO012607-0001/02')
  })

  it('keeps the PO as the ledger document reference and the event id as identity', () => {
    expect(createProductionEventRef('PO012607-0001', productionEventKinds.output, '42', 2)).toEqual({
      displayNo: 'PO012607-0001/02',
      documentNo: 'PO012607-0001',
      eventId: '42',
      kind: 'output',
    })
  })

  it('names a material issue event under the PO without a PI document number', () => {
    expect(formatProductionInputEvent('PO012607-0001', 'event-1')).toBe('PO012607-0001/IN/event-1')
  })

  it('does not create an independent PI or PO2 document label', () => {
    const input = createProductionEventRef('PO012607-0001', productionEventKinds.input, '17')
    const returned = createProductionEventRef('PO012607-0001', productionEventKinds.inputReturn, '18')
    expect(input.displayNo).toBe('PO012607-0001')
    expect(returned.displayNo).toBe('PO012607-0001')
    expect(input.displayNo).not.toMatch(/^(PI|PO2)/)
    expect(returned.displayNo).not.toMatch(/^(PI|PO2)/)
  })

  it('rejects invalid PO, event, and round values', () => {
    expect(() => assertProductionOrderDocumentNo('PO-0001')).toThrow()
    expect(() => formatProductionOutputRound('PO012607-0001', 0)).toThrow()
    expect(() => createProductionEventRef('PO012607-0001', productionEventKinds.output, '42')).toThrow()
    expect(() => createProductionEventRef('PO012607-0001', productionEventKinds.input, ' ')).toThrow()
  })
})
