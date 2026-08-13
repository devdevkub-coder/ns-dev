export type PlanningKpi = {
  readyCount: number
  sellCount: number
  shortCount: number
  shortageKg: number
}

type PlanningKpiPlan = {
  rows: Array<{ enough: boolean }>
  shortage: number
}

/**
 * KPI cards on /stock/planning count PRODUCTS, the same granularity as the
 * overview table — never PO Sell lines. Counting lines (one row per open
 * PO Sell line) lets the KPI disagree with the table as soon as a single
 * product has several open lines.
 *
 * A product counts as "พร้อมส่ง" only when every one of its PO Sell lines
 * is covered by stock (shortage <= 0.01); otherwise it counts as "ขาด".
 * Products without any PO Sell line are excluded from all three counts.
 */
export function planningKpi(plans: PlanningKpiPlan[]): PlanningKpi {
  const sellPlans = plans.filter((plan) => plan.rows.length > 0)
  const readyCount = sellPlans.filter((plan) => plan.shortage <= 0.01).length
  const shortCount = sellPlans.filter((plan) => plan.shortage > 0.01).length
  const shortageKg = plans
    .filter((plan) => plan.shortage > 0.01)
    .reduce((sum, plan) => sum + plan.shortage, 0)

  return {
    readyCount,
    sellCount: sellPlans.length,
    shortCount,
    shortageKg,
  }
}
