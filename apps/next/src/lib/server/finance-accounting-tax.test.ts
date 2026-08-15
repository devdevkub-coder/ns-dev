import { describe, expect, it } from 'vitest'
import { isSalesVatApplicable } from './finance-accounting-tax'

describe('sales VAT classification', () => {
  it('keeps NONE documents outside the VAT base even when the legacy flag is inconsistent', () => {
    expect(isSalesVatApplicable({ has_vat: true, vat_type: 'NONE' })).toBe(false)
  })

  it('treats explicit INCLUDE and EXCLUDE documents as taxable', () => {
    expect(isSalesVatApplicable({ has_vat: false, vat_type: 'include' })).toBe(true)
    expect(isSalesVatApplicable({ has_vat: false, vat_type: 'EXCLUDE' })).toBe(true)
  })

  it('uses has_vat only when the document has no explicit VAT type', () => {
    expect(isSalesVatApplicable({ has_vat: true, vat_type: null })).toBe(true)
    expect(isSalesVatApplicable({ has_vat: false, vat_type: null })).toBe(false)
  })
})
