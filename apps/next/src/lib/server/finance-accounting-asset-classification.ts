export type AssetClassification = 'current' | 'non_current' | 'unclassified'

export type OperationalAssetSource = 'accounts_receivable' | 'cash_bank' | 'fixed_asset' | 'inventory' | 'prepayment' | 'unknown'

export const MONEY_TOLERANCE = 0.01

export function classifyOperationalAssetSource(source: OperationalAssetSource): AssetClassification {
  if (['accounts_receivable', 'cash_bank', 'inventory', 'prepayment'].includes(source)) return 'current'
  if (source === 'fixed_asset') return 'non_current'
  return 'unclassified'
}

export function roundMoney(value: number, fractionDigits = 2) {
  const factor = 10 ** fractionDigits
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor
}

export function isMoneyBalanced(left: number, right: number, tolerance = MONEY_TOLERANCE) {
  return Math.abs(left - right) <= tolerance
}

export function sumClassifiedAssets(rows: Array<{ amount: number; source: OperationalAssetSource }>) {
  return rows.reduce<Record<AssetClassification, number>>((totals, row) => {
    const classification = classifyOperationalAssetSource(row.source)
    totals[classification] += row.amount
    return totals
  }, { current: 0, non_current: 0, unclassified: 0 })
}
