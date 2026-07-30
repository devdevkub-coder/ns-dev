import { describe, expect, it } from 'vitest'
import { buildCompanyAccountCurrencyBalances } from '@/lib/company-account-currency'

describe('company account currency contract', () => {
  it('does not enforce THB as the primary currency', () => {
    expect(buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [],
      isFcd: false,
      primaryCurrency: 'USD',
    })).toEqual([{ currency: 'USD' }])
  })

  it('allows an FCD account whose currency set does not contain THB', () => {
    expect(buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [{ currency: 'EUR' }],
      isFcd: true,
      primaryCurrency: 'USD',
    })).toEqual([
      { currency: 'USD' },
      { currency: 'EUR' },
    ])
  })

  it('rejects an additional currency that duplicates the primary currency', () => {
    expect(() => buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [{ currency: 'USD' }],
      isFcd: true,
      primaryCurrency: 'USD',
    })).toThrow('สกุลเงินหลักและสกุลเงินเพิ่มเติมต้องไม่ซ้ำกัน')
  })

  it('rejects an incomplete additional-currency row', () => {
    expect(() => buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [{ currency: '' }],
      isFcd: true,
      primaryCurrency: 'USD',
    })).toThrow('เลือกสกุลเงินเพิ่มเติมให้ครบทุกแถว')
  })
})
