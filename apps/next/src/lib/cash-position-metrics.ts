export function calculateCashPositionMetrics(input: { cashTotal: number; bankTotal: number; fcdTotal: number; arTotal: number; apTotal: number }) {
  const availableToday = input.cashTotal + input.bankTotal + input.fcdTotal
  return {
    availableToday,
    netWorkingCapital: availableToday + input.arTotal - input.apTotal,
  }
}
