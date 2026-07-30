export const FINANCE_MONEY_POLICY = {
  calculationScale: 2,
  displayScale: 2,
  fxRateScale: 3,
} as const

export function roundFinanceCalculationAmount(value: number) {
  if (!Number.isFinite(value)) throw new Error('จำนวนเงินต้องเป็นตัวเลขที่ถูกต้อง')
  return Number(value.toFixed(FINANCE_MONEY_POLICY.calculationScale))
}

export function roundFinanceFxRate(value: number) {
  if (!Number.isFinite(value)) throw new Error('อัตราแลกเปลี่ยนต้องเป็นตัวเลขที่ถูกต้อง')
  return Number(value.toFixed(FINANCE_MONEY_POLICY.fxRateScale))
}
