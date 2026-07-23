import {
  loadProductionMetrics,
  loadProductionTotalWipQty,
  type ProductionOrderMetric,
} from '@/lib/server/production-reports'

export type ProductionDashboardQueryFilters = {
  allowedBranchIds: bigint[] | null
  dateFrom: string
  dateTo: string
}

export async function loadProductionDashboardRows(filters: ProductionDashboardQueryFilters): Promise<ProductionOrderMetric[]> {
  return loadProductionMetrics(filters)
}

export async function loadProductionDashboardWip(filters: Pick<ProductionDashboardQueryFilters, 'allowedBranchIds'>): Promise<number> {
  return loadProductionTotalWipQty(filters)
}
