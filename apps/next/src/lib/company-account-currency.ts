export type CompanyAccountCurrencyBalance = {
  currency: string
  openingBalance: number
}

export function buildCompanyAccountCurrencyBalances(values: {
  accountGroup: string
  additionalBalances: Array<{ currency: string; openingBalance: number | null }>
  isFcd: boolean
  openingBalance: number | null
  primaryCurrency: string | null
}) {
  const primaryCurrency = String(values.primaryCurrency ?? '').trim().toUpperCase()
  if (!primaryCurrency) throw new Error('เลือกสกุลเงินหลัก')

  const requestedAdditionalBalances = values.accountGroup === 'bank' && values.isFcd
    ? values.additionalBalances
    : []
  if (requestedAdditionalBalances.some((entry) => !String(entry.currency ?? '').trim())) {
    throw new Error('เลือกสกุลเงินเพิ่มเติมให้ครบทุกแถว')
  }
  const additionalBalances = requestedAdditionalBalances.map((entry) => ({
      currency: String(entry.currency ?? '').trim().toUpperCase(),
      openingBalance: entry.openingBalance ?? 0,
    }))
  const requested: CompanyAccountCurrencyBalance[] = [
    { currency: primaryCurrency, openingBalance: values.openingBalance ?? 0 },
    ...additionalBalances,
  ]
  const unique = Array.from(new Map(requested.map((entry) => [entry.currency, entry])).values())

  if (unique.length !== requested.length) throw new Error('สกุลเงินหลักและสกุลเงินเพิ่มเติมต้องไม่ซ้ำกัน')
  if (unique.some((entry) => entry.openingBalance < 0)) throw new Error('ยอดตั้งต้นบัญชีต้องไม่ติดลบ')
  if (values.accountGroup === 'bank' && values.isFcd && unique.length < 2) {
    throw new Error('บัญชี FCD ต้องมีสกุลเงินเพิ่มเติมอย่างน้อย 1 สกุล')
  }

  return unique
}
