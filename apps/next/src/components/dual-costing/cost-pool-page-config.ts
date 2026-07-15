import type { ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

export type CostPoolFilterState = {
  availableOnly: boolean
  costType: string
  fromDate: string
  productId: string
  search: string
  sort: string
  sourceType: string
  status: string
  toDate: string
}

export const COST_POOL_DEFAULT_FILTERS: CostPoolFilterState = {
  availableOnly: true,
  costType: 'all',
  fromDate: '',
  productId: '',
  search: '',
  sort: 'FIFO',
  sourceType: 'all',
  status: 'all',
  toDate: '',
}

export function buildCostPoolQueryString(filters: CostPoolFilterState) {
  const params = new URLSearchParams()
  params.set('availableOnly', String(filters.availableOnly))
  if (filters.costType !== 'all') params.set('costType', filters.costType)
  if (filters.fromDate) params.set('from', filters.fromDate)
  if (filters.productId) params.set('productId', filters.productId)
  if (filters.search.trim()) params.set('q', filters.search.trim())
  if (filters.sort !== 'FIFO') params.set('sort', filters.sort)
  if (filters.sourceType !== 'all') params.set('sourceType', filters.sourceType)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.toDate) params.set('to', filters.toDate)
  return params.toString()
}

export function buildCostPoolExportHref(queryString: string) {
  const params = new URLSearchParams(queryString)
  params.set('format', 'xlsx')
  return `/api/dual-costing/cost-pool?${params.toString()}`
}

export type CostPoolGroupSortKey = 'availableQty' | 'availableValue' | 'avgUnitCost' | 'originalQty' | 'productName' | 'usedQty'
export type CostPoolGroupColumnKey = CostPoolGroupSortKey | 'action'

export const COST_POOL_GROUP_COLUMN_STORAGE_KEY = 'dual-costing.cost-pool.groups.v1'

export const costPoolGroupColumns: Array<ResizableColumnDefinition<CostPoolGroupColumnKey>> = [
  { key: 'productName', defaultWidth: 260, minWidth: 200 },
  { key: 'originalQty', defaultWidth: 180, minWidth: 160 },
  { key: 'usedQty', defaultWidth: 160, minWidth: 140 },
  { key: 'availableQty', defaultWidth: 190, minWidth: 170 },
  { key: 'avgUnitCost', defaultWidth: 150, minWidth: 140 },
  { key: 'availableValue', defaultWidth: 190, minWidth: 170 },
  { key: 'action', defaultWidth: 130, minWidth: 130 },
]

export const COST_POOL_GROUP_TABLE_COLUMN_COUNT = costPoolGroupColumns.length

export type CostPoolLotColumnKey = 'availableQty' | 'availableValue' | 'branchName' | 'counterparty' | 'date' | 'qty' | 'sourceNo' | 'sourceType' | 'status' | 'unitCost' | 'usedQty'

export const COST_POOL_LOT_COLUMN_STORAGE_KEY = 'dual-costing.cost-pool.lots.v1'

export const costPoolLotColumns: Array<ResizableColumnDefinition<CostPoolLotColumnKey>> = [
  { key: 'sourceType', defaultWidth: 140, minWidth: 120 },
  { key: 'sourceNo', defaultWidth: 190, minWidth: 170 },
  { key: 'date', defaultWidth: 140, minWidth: 125 },
  { key: 'branchName', defaultWidth: 150, minWidth: 130 },
  { key: 'counterparty', defaultWidth: 220, minWidth: 180 },
  { key: 'qty', defaultWidth: 150, minWidth: 130 },
  { key: 'usedQty', defaultWidth: 140, minWidth: 120 },
  { key: 'availableQty', defaultWidth: 180, minWidth: 160 },
  { key: 'unitCost', defaultWidth: 160, minWidth: 140 },
  { key: 'availableValue', defaultWidth: 180, minWidth: 160 },
  { key: 'status', defaultWidth: 160, minWidth: 150 },
]

export const COST_POOL_LOT_TABLE_COLUMN_COUNT = costPoolLotColumns.length
