export type SalesPlanLmeConfig = {
  fxRate: number
  kgPerContainer: number
  liveFetchNote: string
  lmeAluminumUSD: number
  lmeBrassUSD: number
  lmeCopperUSD: number
  source: 'manual' | 'live' | 'mixed'
  updatedAt: string
  updatedBy: string
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) ? value : fallback
}

export async function getSalesPlanLmeConfig(): Promise<SalesPlanLmeConfig> {
  return {
    fxRate: envNumber('SALES_PLAN_FX_RATE', 36.5),
    kgPerContainer: envNumber('SALES_PLAN_KG_PER_CONTAINER', 25000),
    liveFetchNote: process.env.SALES_PLAN_LME_NOTE || 'Manual LME fallback from server defaults.',
    lmeAluminumUSD: envNumber('SALES_PLAN_LME_ALUMINUM_USD', 2200),
    lmeBrassUSD: envNumber('SALES_PLAN_LME_BRASS_USD', 6500),
    lmeCopperUSD: envNumber('SALES_PLAN_LME_COPPER_USD', 8500),
    source: 'manual',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  }
}
