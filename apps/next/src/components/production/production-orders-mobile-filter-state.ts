export type ProductionOrderMobileFilterState = {
  branchCode: string
  dateFrom: string
  dateTo: string
  direction: 'asc' | 'desc'
  sort: string
  statuses: string[]
}

export function createMobileFilterDraft(applied: ProductionOrderMobileFilterState): ProductionOrderMobileFilterState {
  return { ...applied, statuses: [...applied.statuses] }
}

export function updateMobileFilterDraft(
  draft: ProductionOrderMobileFilterState,
  patch: Partial<ProductionOrderMobileFilterState>,
): ProductionOrderMobileFilterState {
  return {
    ...draft,
    ...patch,
    statuses: patch.statuses ? [...patch.statuses] : [...draft.statuses],
  }
}

export function applyMobileFilterDraft(draft: ProductionOrderMobileFilterState): ProductionOrderMobileFilterState {
  return { ...draft, statuses: [...draft.statuses] }
}

export function toggleProductionOrderStatus(current: string[], status: string): string[] {
  if (!status) return []
  return current.includes(status)
    ? current.filter((value) => value !== status)
    : [...current, status]
}
