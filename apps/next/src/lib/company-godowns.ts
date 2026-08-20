export interface GodownItem {
  id: string | number
  code: string
  name: string
  branchId?: string
  branchName?: string
  inCharge?: string
  targetSortKg?: number
  targetBaleCount?: number
  active: boolean
  createdAt?: string
  updatedAt?: string
}

const FULL_STORAGE_KEY = 'ns-erp-company-godowns'
const NAMES_STORAGE_KEY = 'ns-erp-company-godown-names'

export function readCompanyGodowns(): GodownItem[] {
  if (typeof window === 'undefined') return []
  try {
    const values: unknown = JSON.parse(window.localStorage.getItem(FULL_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(values)) return []
    return values.filter((value): value is GodownItem => (
      typeof value === 'object'
      && value !== null
      && typeof (value as GodownItem).name === 'string'
      && typeof (value as GodownItem).active === 'boolean'
    ))
  } catch {
    return []
  }
}

export function writeCompanyGodowns(items: GodownItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FULL_STORAGE_KEY, JSON.stringify(items))
    window.localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(items.map((item) => item.name)))
  } catch {
    // Storage may be unavailable; API remains the source of truth online.
  }
}
