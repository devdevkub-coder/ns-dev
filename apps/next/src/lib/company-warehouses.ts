export interface WarehouseItem {
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

const FULL_STORAGE_KEY = 'ns-erp-company-warehouses'
const NAMES_STORAGE_KEY = 'ns-erp-company-warehouse-names'

export function readCompanyWarehouses(): WarehouseItem[] {
  if (typeof window === 'undefined') return []
  try {
    const values: unknown = JSON.parse(window.localStorage.getItem(FULL_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(values)) return []
    return values.filter((value): value is WarehouseItem => (
      typeof value === 'object'
      && value !== null
      && typeof (value as WarehouseItem).name === 'string'
      && typeof (value as WarehouseItem).active === 'boolean'
    ))
  } catch {
    return []
  }
}

/**
 * Persist warehouse rows locally. Writes the full rows under a dedicated key
 * and keeps the legacy names-only key in sync so the weight-ticket godown
 * selector keeps working offline.
 */
export function writeCompanyWarehouses(items: WarehouseItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FULL_STORAGE_KEY, JSON.stringify(items))
    window.localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(items.map((item) => item.name)))
  } catch {
    // Storage may be unavailable; API remains the source of truth online.
  }
}
