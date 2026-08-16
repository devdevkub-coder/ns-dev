export type WorkingCapitalFormulaInput = {
  ap: number
  ar: number
  beginningInventory: number
  cogs: number
  endingInventory: number
  periodDays: number
  purchases: number
  revenue: number
}

export function calculateWorkingCapitalDays(input: WorkingCapitalFormulaInput) {
  const periodDays = Math.max(1, input.periodDays)
  const averageInventory = (input.beginningInventory + input.endingInventory) / 2
  const dailyRevenue = input.revenue / periodDays
  const dailyCogs = input.cogs / periodDays
  const dailyPurchases = input.purchases / periodDays
  const arDays = dailyRevenue > 0 ? input.ar / dailyRevenue : 0
  const invDays = dailyCogs > 0 ? averageInventory / dailyCogs : 0
  const apDays = dailyPurchases > 0 ? input.ap / dailyPurchases : 0

  return {
    apDays,
    arDays,
    averageInventory,
    ccc: arDays + invDays - apDays,
    invDays,
  }
}
