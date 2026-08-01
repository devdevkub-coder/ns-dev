export type CustomerReceiptSettlementLine = {
  discountAmount: number
  receiptAmount: number
  withholdingTaxAmount: number
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateCustomerReceiptCashRequired(
  outstandingArAmount: number,
  discountAmount: number,
  withholdingTaxAmount: number,
) {
  return roundMoney(Math.max(0, outstandingArAmount - discountAmount - withholdingTaxAmount))
}

export function calculateCustomerReceiptSettlement<T extends CustomerReceiptSettlementLine>(
  lines: T[],
  settlementBookAmount: number,
) {
  const cashRequiredAmount = roundMoney(lines.reduce((sum, line) => sum + line.receiptAmount, 0))
  const discountAmount = roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0))
  const withholdingTaxAmount = roundMoney(lines.reduce((sum, line) => sum + line.withholdingTaxAmount, 0))
  const availableSettlement = roundMoney(Math.max(0, settlementBookAmount))

  let appliedLines = lines
  if (cashRequiredAmount > 0 && availableSettlement > 0 && cashRequiredAmount > availableSettlement) {
    let remainingCash = availableSettlement
    appliedLines = lines.map((line, index) => {
      const receiptAmount = index === lines.length - 1
        ? remainingCash
        : roundMoney(availableSettlement * line.receiptAmount / cashRequiredAmount)
      remainingCash = roundMoney(remainingCash - receiptAmount)
      return { ...line, receiptAmount: Math.max(0, receiptAmount) }
    })
  }

  const cashAppliedAmount = roundMoney(appliedLines.reduce((sum, line) => sum + line.receiptAmount, 0))
  const arSettledAmount = roundMoney(cashAppliedAmount + discountAmount + withholdingTaxAmount)
  const settlementFxGain = roundMoney(Math.max(0, availableSettlement - cashAppliedAmount))

  return {
    arSettledAmount,
    cashAppliedAmount,
    cashRequiredAmount,
    discountAmount,
    lines: appliedLines,
    settlementFxGain,
    withholdingTaxAmount,
  }
}
