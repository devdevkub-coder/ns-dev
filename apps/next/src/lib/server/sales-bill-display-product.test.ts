import { describe, expect, it } from 'vitest'
import { salesBillDisplayProductName, salesBillProductPresentation } from './sales-bill-display-product'

describe('sales bill display product', () => {
  it('stores a selected sales label separately while retaining the WTO source product', () => {
    expect(salesBillProductPresentation(
      { code: 'SKU040', name: 'อลูมิเนียมหนารวม' },
      { code: 'SKU041', name: 'อลูมิเนียมคัดเกรด' },
    )).toEqual({
      salesDisplayProductCode: 'SKU041',
      salesDisplayProductName: 'อลูมิเนียมคัดเกรด',
      sourceProductCode: 'SKU040',
      sourceProductName: 'อลูมิเนียมหนารวม',
    })
  })

  it('uses the source product name when no sales-specific label was selected', () => {
    expect(salesBillDisplayProductName({}, 'อลูมิเนียมหนารวม')).toBe('อลูมิเนียมหนารวม')
    expect(salesBillDisplayProductName(
      { salesDisplayProductName: 'อลูมิเนียมคัดเกรด' },
      'อลูมิเนียมหนารวม',
    )).toBe('อลูมิเนียมคัดเกรด')
  })
})
