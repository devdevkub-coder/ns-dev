const COMPANY_WAREHOUSE_NAMES_STORAGE_KEY = 'ns-erp-company-warehouse-names'

export function readCompanyWarehouseNames(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const values: unknown = JSON.parse(window.localStorage.getItem(COMPANY_WAREHOUSE_NAMES_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(values)) return []
    return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
  } catch {
    return []
  }
}
