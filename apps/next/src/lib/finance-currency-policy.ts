export type FinanceCurrencyPolicy = {
  functionalCurrencyCode: string
}

function requireNonBlank(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label}ของ policy ไม่ถูกต้อง`)
  return value.trim()
}

export function requireSingleFinanceCurrencyPolicy(rows: FinanceCurrencyPolicy[]) {
  if (rows.length === 0) throw new Error('ยังไม่ได้ตั้งค่า policy สกุลเงินการเงิน')
  if (rows.length > 1) throw new Error('พบ policy สกุลเงินการเงินมากกว่าหนึ่งรายการ')

  const policy = rows[0]
  return {
    functionalCurrencyCode: requireNonBlank(policy.functionalCurrencyCode, 'functional currency '),
  }
}
