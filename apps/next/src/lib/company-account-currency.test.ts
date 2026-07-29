import { describe, expect, it } from 'vitest'
import { buildCompanyAccountCurrencyBalances } from '@/lib/company-account-currency'

describe('company account currency contract', () => {
  it('defaults are not enforced as a THB-only contract', () => {
    expect(buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [],
      isFcd: false,
      openingBalance: 250,
      primaryCurrency: 'USD',
    })).toEqual([{ currency: 'USD', openingBalance: 250 }])
  })

  it('allows an FCD account whose currency set does not contain THB', () => {
    expect(buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [{ currency: 'EUR', openingBalance: 50 }],
      isFcd: true,
      openingBalance: 100,
      primaryCurrency: 'USD',
    })).toEqual([
      { currency: 'USD', openingBalance: 100 },
      { currency: 'EUR', openingBalance: 50 },
    ])
  })

  it('rejects an additional currency that duplicates the primary currency', () => {
    expect(() => buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [{ currency: 'USD', openingBalance: 50 }],
      isFcd: true,
      openingBalance: 100,
      primaryCurrency: 'USD',
    })).toThrow('สกุลเงินหลักและสกุลเงินเพิ่มเติมต้องไม่ซ้ำกัน')
  })

  it('rejects an incomplete additional-currency row', () => {
    expect(() => buildCompanyAccountCurrencyBalances({
      accountGroup: 'bank',
      additionalBalances: [{ currency: '', openingBalance: null }],
      isFcd: true,
      openingBalance: 100,
      primaryCurrency: 'USD',
    })).toThrow('เลือกสกุลเงินเพิ่มเติมให้ครบทุกแถว')
  })
})
