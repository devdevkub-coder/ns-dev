'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import type { SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { isCostPoolEligibleMetalGroup, stockAdjustReasonLabel, stockAdjustReasonOptions, statusConvertFormSchema, stockConvertFormSchema, stockAdjustFormSchema } from '@/lib/stock'
import type { StatusConvertFormValues, StockAdjustFormValues, StockConvertFormValues, StockCostPoolOption, StockOption } from '@/lib/stock'
import { z } from 'zod'
import { ApiError } from '@/lib/api-client'

type Mode = 'adjust' | 'convert' | 'status-convert'
type Payload = {
  reasonOptions?: string[]
  reference: { branches: StockOption[]; costPoolEntries?: StockCostPoolOption[]; customers?: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: Array<Record<string, string | number | boolean | null>>
}
type OperationColumn = {
  cellClassName?: string
  headerClassName?: string
  key: string
  label: string
  sortable?: boolean
}
type SortDirection = 'asc' | 'desc'
type StatusConvertSortKey =
  | 'createdAt'
  | 'createdBy'
  | 'date'
  | 'locationDisplay'
  | 'lotNo'
  | 'note'
  | 'productDisplay'
  | 'qty'
  | 'refNo'
  | 'status'
  | 'statusFlow'
  | 'unitCost'
  | 'value'

const OPERATION_PAGE_SIZES = [10, 20, 50, 100]

const CONVERT_SOURCE_TYPE_LABELS: Record<string, string> = {
  Manual: 'กำหนดเอง',
  'Auto (FIFO)': 'อัตโนมัติ FIFO',
  'Auto (LIFO)': 'อัตโนมัติ LIFO',
  'Auto (HIGHEST_COST)': 'อัตโนมัติ ต้นทุนสูงสุด',
  'Auto (LOWEST_COST)': 'อัตโนมัติ ต้นทุนต่ำสุด',
  Legacy: 'ข้อมูลเดิม',
}

const CONVERT_COST_STATUS_LABELS: Record<string, string> = {
  allocated: '✓ จัดสรรครบ',
  pending_cost: '⏳ รอต้นทุน',
  partial: '📋 จัดสรรบางส่วน',
}

const CONVERT_STATUS_LABELS: Record<string, string> = {
  posted: 'ลงรายการแล้ว',
  reversed: 'ย้อนกลับแล้ว',
}

const CONVERT_TARGET_COST_POLICY_LABELS: Record<string, string> = {
  SOURCE_MATCHED: 'ตามต้นทุนแหล่งเดิม',
  CUSTOM_UNIT_COST: 'กำหนดเอง',
}

const CONVERT_ALLOCATION_STATUS_LABELS: Record<string, string> = {
  active: 'ใช้งานอยู่',
  reversed: 'ย้อนกลับแล้ว',
}

const CONVERT_POOL_STATUS_LABELS: Record<string, string> = {
  Available: 'พร้อมใช้',
  'Partially Used': 'ใช้บางส่วน',
  'Fully Used': 'ใช้ครบแล้ว',
  Released: 'คืนแล้ว',
  Cancelled: 'ยกเลิก',
}

function displayConvertLabel(labels: Record<string, string>, value: string) {
  return labels[value] ?? (value || '-')
}

type StockAdjustSnapshot = {
  adjustType: 'NONE' | 'LOSS' | 'GAIN'
  countedQty: number
  diffQty: number
  onHoldQty: number
  priceSource: string
  readyQty: number
  systemQty: number
  totalValue: number
  unitPricePerKg: number
}

type StockConvertDetailLine = {
  allocationStatus: string
  lineNo: number
  qty: number
  reversedAt: string | null
  sourceLotNo: string | null
  sourcePoolId: string | null
  sourceProduct: string
  sourceRefNo: string | null
  sourceType: string | null
  targetLotNo: string | null
  targetPoolId: string | null
  targetPoolStatus: string | null
  targetProduct: string
  totalCost: number
  unitCost: number
}

type StockConvertDetail = {
  allocationMethod: string
  branchWarehouse: string
  date: string
  lines: StockConvertDetailLine[]
  lossQty: number
  notes: string | null
  reason: string | null
  refNo: string
  sourceLotNo: string | null
  sourceQty: number
  sourceUnitCost: number
  status: string
  targetCostPolicy: string
  targetCostReason: string | null
  targetCostVariance: number
  targetLotNo: string | null
  targetQty: number
  targetUnitCost: number
}

const config = {
  adjust: {
    accent: 'from-amber-600 to-orange-600',
    api: '/api/stock/adjust',
    title: 'Stock Count Adjustment / ปรับสต๊อกจากการนับจริง',
  },
  convert: {
    accent: 'from-cyan-700 to-teal-700',
    api: '/api/stock/convert',
    title: 'ปรับเกรดสินค้า / Grade Adjustment',
  },
  'status-convert': {
    accent: 'from-purple-700 to-pink-700',
    api: '/api/stock/status-convert',
    title: 'ปรับสถานะสินค้า / Status Convert',
  },
} satisfies Record<Mode, { accent: string; api: string; title: string }>

const statusConvertColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'date', defaultWidth: 130, minWidth: 110 },
  { key: 'refNo', defaultWidth: 150, minWidth: 120 },
  { key: 'productDisplay', defaultWidth: 220, minWidth: 180 },
  { key: 'locationDisplay', defaultWidth: 180, minWidth: 140 },
  { key: 'qty', defaultWidth: 120, minWidth: 90 },
  { key: 'unitCost', defaultWidth: 150, minWidth: 110 },
  { key: 'value', defaultWidth: 130, minWidth: 100 },
  { key: 'statusFlow', defaultWidth: 140, minWidth: 110 },
  { key: 'note', defaultWidth: 140, minWidth: 110 },
  { key: 'status', defaultWidth: 100, minWidth: 80 },
  { key: 'createdBy', defaultWidth: 120, minWidth: 90 },
  { key: 'createdAt', defaultWidth: 160, minWidth: 130 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const convertColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'sourceType', defaultWidth: 160, minWidth: 140 },
  { key: 'refNo', defaultWidth: 170, minWidth: 145 },
  { key: 'date', defaultWidth: 130, minWidth: 110 },
  { key: 'branchWarehouse', defaultWidth: 160, minWidth: 130 },
  { key: 'sourceProduct', defaultWidth: 220, minWidth: 180 },
  { key: 'sourceQty', defaultWidth: 120, minWidth: 90 },
  { key: 'unitCost', defaultWidth: 155, minWidth: 140 },
  { key: 'targetProduct', defaultWidth: 220, minWidth: 180 },
  { key: 'targetQty', defaultWidth: 120, minWidth: 90 },
  { key: 'targetUnitCost', defaultWidth: 155, minWidth: 140 },
  { key: 'lossQty', defaultWidth: 130, minWidth: 120 },
  { key: 'costStatus', defaultWidth: 175, minWidth: 160 },
  { key: 'status', defaultWidth: 155, minWidth: 145 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const adjustColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 130, minWidth: 110 },
  { key: 'branchWarehouse', defaultWidth: 160, minWidth: 130 },
  { key: 'productName', defaultWidth: 220, minWidth: 180 },
  { key: 'outputCategory', defaultWidth: 120, minWidth: 90 },
  { key: 'systemQty', defaultWidth: 120, minWidth: 90 },
  { key: 'onHoldQty', defaultWidth: 100, minWidth: 80 },
  { key: 'readyQty', defaultWidth: 100, minWidth: 80 },
  { key: 'countedQty', defaultWidth: 100, minWidth: 80 },
  { key: 'diffQty', defaultWidth: 100, minWidth: 80 },
  { key: 'adjustType', defaultWidth: 110, minWidth: 90 },
  { key: 'unitPricePerKg', defaultWidth: 110, minWidth: 80 },
  { key: 'totalValue', defaultWidth: 140, minWidth: 110 },
  { key: 'reason', defaultWidth: 140, minWidth: 110 },
  { key: 'createdAt', defaultWidth: 160, minWidth: 130 },
  { key: 'updatedBy', defaultWidth: 120, minWidth: 90 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const detailColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'line', defaultWidth: 70, minWidth: 60 },
  { key: 'sourcePool', defaultWidth: 145, minWidth: 130 },
  { key: 'sourceProduct', defaultWidth: 175, minWidth: 150 },
  { key: 'targetPool', defaultWidth: 145, minWidth: 130 },
  { key: 'targetProduct', defaultWidth: 175, minWidth: 150 },
  { key: 'qty', defaultWidth: 90, minWidth: 80 },
  { key: 'unitCost', defaultWidth: 85, minWidth: 80 },
  { key: 'cost', defaultWidth: 100, minWidth: 90 },
  { key: 'status', defaultWidth: 90 },
]

export function StockOperationPageClient({ mode }: { mode: Mode }) {
  const meta = config[mode]
  const pathname = usePathname()
  const [data, setData] = useState<Payload>({ reference: { branches: [], products: [], warehouses: [] }, rows: [] })
  const [error, setError] = useState<string | null>(null)
  const [adjustBranchFilter, setAdjustBranchFilter] = useState('')
  const [adjustTypeFilter, setAdjustTypeFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [fromDateFilter, setFromDateFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [costStatusFilter, setCostStatusFilter] = useState('')
  const [documentStatusFilter, setDocumentStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sourceTypeFilter, setSourceTypeFilter] = useState('')
  const [toDateFilter, setToDateFilter] = useState('')
  const [statusConvertPage, setStatusConvertPage] = useState(1)
  const [statusConvertPageSize, setStatusConvertPageSize] = useState(20)
  const [adjustPage, setAdjustPage] = useState(1)
  const [adjustPageSize, setAdjustPageSize] = useState(20)
  const [convertPage, setConvertPage] = useState(1)
  const [convertPageSize, setConvertPageSize] = useState(20)

  // States for Stock Adjust (NSERP-66)
  const [adjustProductFilter, setAdjustProductFilter] = useState('')
  const [adjustCategoryFilter, setAdjustCategoryFilter] = useState('')
  const [adjustWarehouseFilter, setAdjustWarehouseFilter] = useState('')
  const [adjustReasonFilter, setAdjustReasonFilter] = useState('')

  // States for Status Convert (NSERP-65)
  const [statusProductFilter, setStatusProductFilter] = useState('')
  const [statusCategoryFilter, setStatusCategoryFilter] = useState('')
  const [statusWarehouseFilter, setStatusWarehouseFilter] = useState('')
  const [statusFromDateFilter, setStatusFromDateFilter] = useState('')
  const [statusToDateFilter, setStatusToDateFilter] = useState('')
  const [statusFlowFilter, setStatusFlowFilter] = useState('')

  const adjustProductSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data.reference?.products ?? [])
      .filter((option) => option.active !== false)
      .map((option) => ({
        id: option.code || option.id,
        label: option.code ? `${option.code} - ${option.name}` : option.name,
        searchText: `${option.code ?? ''} ${option.name}`.toLowerCase(),
      }))
  }, [data.reference?.products])

  const categoryOptions = useMemo(() => {
    const groups = (data.reference?.products ?? []).map(p => p.metalGroup).filter(Boolean) as string[]
    return [...new Set(groups)]
  }, [data.reference?.products])

  const warehouseOptions = useMemo(() => {
    return data.reference?.warehouses ?? []
  }, [data.reference?.warehouses])

  const reasonOptions = useMemo(() => {
    return data.reasonOptions ?? stockAdjustReasonOptions
  }, [data.reasonOptions])
  const [operationSortDirection, setOperationSortDirection] = useState<SortDirection>('desc')
  const [operationSortKey, setOperationSortKey] = useState('date')
  const [statusConvertSortDirection, setStatusConvertSortDirection] = useState<SortDirection>('desc')
  const [statusConvertSortKey, setStatusConvertSortKey] = useState<StatusConvertSortKey>('date')
  const [convertDetail, setConvertDetail] = useState<StockConvertDetail | null>(null)
  const [adjustDetail, setAdjustDetail] = useState<Record<string, string | number | boolean | null> | null>(null)

  const statusConvertResize = useResizableColumns('stock.operation.status-convert.v7', statusConvertColumns)
  const convertResize = useResizableColumns('stock.operation.convert.v7', convertColumns)
  const adjustResize = useResizableColumns('stock.operation.adjust.v5', adjustColumns)
  const columnResize = mode === 'status-convert' ? statusConvertResize : mode === 'convert' ? convertResize : adjustResize
  const [isConvertDetailLoading, setIsConvertDetailLoading] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>(meta.api))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [meta.api])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (window.location.search.includes('new=1')) setFormOpen(true)
  }, [])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.rows
      .filter((row) => !query || Object.values(row).join(' ').toLowerCase().includes(query))
      .filter((row) => mode !== 'convert' || !sourceTypeFilter || row.sourceType === sourceTypeFilter)
      .filter((row) => mode !== 'convert' || !costStatusFilter || row.costStatus === costStatusFilter)
      .filter((row) => mode !== 'convert' || !documentStatusFilter || row.status === documentStatusFilter)
      // Stock Adjust Filters (NSERP-66)
      .filter((row) => mode !== 'adjust' || !adjustBranchFilter || row.branchId === adjustBranchFilter)
      .filter((row) => mode !== 'adjust' || !adjustTypeFilter || row.adjustType === adjustTypeFilter)
      .filter((row) => mode !== 'adjust' || !fromDateFilter || String(row.date ?? '') >= fromDateFilter)
      .filter((row) => mode !== 'adjust' || !toDateFilter || String(row.date ?? '') <= toDateFilter)
      .filter((row) => mode !== 'adjust' || !adjustProductFilter || row.productId === adjustProductFilter || row.productCode === adjustProductFilter)
      .filter((row) => mode !== 'adjust' || !adjustCategoryFilter || row.metalGroup === adjustCategoryFilter)
      .filter((row) => mode !== 'adjust' || !adjustWarehouseFilter || row.warehouseId === adjustWarehouseFilter)
      .filter((row) => mode !== 'adjust' || !adjustReasonFilter || row.reason === adjustReasonFilter)
      // Status Convert Filters (NSERP-65)
      .filter((row) => mode !== 'status-convert' || !statusProductFilter || row.productId === statusProductFilter || row.productCode === statusProductFilter)
      .filter((row) => mode !== 'status-convert' || !statusCategoryFilter || row.metalGroup === statusCategoryFilter)
      .filter((row) => mode !== 'status-convert' || !statusWarehouseFilter || row.warehouseId === statusWarehouseFilter)
      .filter((row) => mode !== 'status-convert' || !statusFromDateFilter || String(row.date ?? '') >= statusFromDateFilter)
      .filter((row) => mode !== 'status-convert' || !statusToDateFilter || String(row.date ?? '') <= statusToDateFilter)
      .filter((row) => {
        if (mode !== 'status-convert' || !statusFlowFilter) return true
        if (statusFlowFilter === 'RM-FG') return row.statusFrom === 'RM' && row.statusTo === 'FG'
        if (statusFlowFilter === 'FG-RM') return row.statusFrom === 'FG' && row.statusTo === 'RM'
        if (statusFlowFilter === 'RM-WIP') return row.statusFrom === 'RM' && row.statusTo === 'WIP'
        if (statusFlowFilter === 'WIP-FG') return row.statusFrom === 'WIP' && row.statusTo === 'FG'
        return true
      })
  }, [
    adjustBranchFilter,
    adjustTypeFilter,
    costStatusFilter,
    data.rows,
    documentStatusFilter,
    fromDateFilter,
    mode,
    search,
    sourceTypeFilter,
    toDateFilter,
    adjustProductFilter,
    adjustCategoryFilter,
    adjustWarehouseFilter,
    adjustReasonFilter,
    statusProductFilter,
    statusCategoryFilter,
    statusWarehouseFilter,
    statusFromDateFilter,
    statusToDateFilter,
    statusFlowFilter,
  ])

  useEffect(() => {
    if (mode === 'status-convert') setStatusConvertPage(1)
    if (mode === 'adjust') setAdjustPage(1)
    if (mode === 'convert') setConvertPage(1)
  }, [
    mode,
    rows.length,
    search,
    adjustBranchFilter,
    adjustTypeFilter,
    fromDateFilter,
    toDateFilter,
    adjustProductFilter,
    adjustCategoryFilter,
    adjustWarehouseFilter,
    adjustReasonFilter,
    statusProductFilter,
    statusCategoryFilter,
    statusWarehouseFilter,
    statusFromDateFilter,
    statusToDateFilter,
    statusFlowFilter,
    sourceTypeFilter,
    costStatusFilter,
    documentStatusFilter,
  ])

  const statusConvertSortedRows = useMemo(() => {
    if (mode !== 'status-convert') return rows
    return [...rows].sort((left, right) => compareStatusConvertRows(left, right, statusConvertSortKey, statusConvertSortDirection))
  }, [mode, rows, statusConvertSortDirection, statusConvertSortKey])

  const operationSortedRows = useMemo(() => {
    if (mode === 'status-convert') return rows
    return [...rows].sort((left, right) => compareOperationRows(left, right, operationSortKey, operationSortDirection))
  }, [mode, operationSortDirection, operationSortKey, rows])

  const statusConvertTotalPages = useMemo(() => {
    if (mode !== 'status-convert') return 1
    return Math.max(1, Math.ceil(statusConvertSortedRows.length / statusConvertPageSize))
  }, [mode, statusConvertPageSize, statusConvertSortedRows.length])

  const adjustTotalPages = useMemo(() => {
    if (mode !== 'adjust') return 1
    return Math.max(1, Math.ceil(operationSortedRows.length / adjustPageSize))
  }, [adjustPageSize, mode, operationSortedRows.length])

  const convertTotalPages = useMemo(() => {
    if (mode !== 'convert') return 1
    return Math.max(1, Math.ceil(operationSortedRows.length / convertPageSize))
  }, [convertPageSize, mode, operationSortedRows.length])

  useEffect(() => {
    if (mode !== 'status-convert') return
    setStatusConvertPage((currentPage) => Math.min(currentPage, statusConvertTotalPages))
  }, [mode, statusConvertTotalPages])

  useEffect(() => {
    if (mode !== 'adjust') return
    setAdjustPage((currentPage) => Math.min(currentPage, adjustTotalPages))
  }, [adjustTotalPages, mode])

  useEffect(() => {
    if (mode !== 'convert') return
    setConvertPage((currentPage) => Math.min(currentPage, convertTotalPages))
  }, [convertTotalPages, mode])

  const visibleRows = useMemo(() => {
    if (mode === 'adjust') {
      const startIndex = (adjustPage - 1) * adjustPageSize
      return operationSortedRows.slice(startIndex, startIndex + adjustPageSize)
    }
    if (mode === 'convert') {
      const startIndex = (convertPage - 1) * convertPageSize
      return operationSortedRows.slice(startIndex, startIndex + convertPageSize)
    }
    if (mode !== 'status-convert') return operationSortedRows
    const startIndex = (statusConvertPage - 1) * statusConvertPageSize
    return statusConvertSortedRows.slice(startIndex, startIndex + statusConvertPageSize)
  }, [adjustPage, adjustPageSize, convertPage, convertPageSize, mode, operationSortedRows, statusConvertPage, statusConvertPageSize, statusConvertSortedRows])

  const hasFilters = useMemo(() => {
    if (mode === 'convert') return Boolean(search.trim() || sourceTypeFilter || costStatusFilter || documentStatusFilter)
    if (mode === 'adjust') return Boolean(search.trim() || adjustBranchFilter || adjustTypeFilter || fromDateFilter || toDateFilter || adjustProductFilter || adjustCategoryFilter || adjustWarehouseFilter || adjustReasonFilter)
    if (mode === 'status-convert') return Boolean(search.trim() || statusProductFilter || statusCategoryFilter || statusWarehouseFilter || statusFromDateFilter || statusToDateFilter || statusFlowFilter)
    return Boolean(search.trim())
  }, [
    mode,
    search,
    sourceTypeFilter,
    costStatusFilter,
    documentStatusFilter,
    adjustBranchFilter,
    adjustTypeFilter,
    fromDateFilter,
    toDateFilter,
    adjustProductFilter,
    adjustCategoryFilter,
    adjustWarehouseFilter,
    adjustReasonFilter,
    statusProductFilter,
    statusCategoryFilter,
    statusWarehouseFilter,
    statusFromDateFilter,
    statusToDateFilter,
    statusFlowFilter,
  ])

  const resetFilters = useCallback(() => {
    setSearch('')
    setSourceTypeFilter('')
    setCostStatusFilter('')
    setDocumentStatusFilter('')
    setAdjustBranchFilter('')
    setAdjustTypeFilter('')
    setFromDateFilter('')
    setToDateFilter('')
    setAdjustProductFilter('')
    setAdjustCategoryFilter('')
    setAdjustWarehouseFilter('')
    setAdjustReasonFilter('')
    setStatusProductFilter('')
    setStatusCategoryFilter('')
    setStatusWarehouseFilter('')
    setStatusFromDateFilter('')
    setStatusToDateFilter('')
    setStatusFlowFilter('')
  }, [])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    if (window.location.search.includes('new=1')) window.history.replaceState(null, '', pathname)
  }, [pathname])

  function toggleStatusConvertSort(nextKey: StatusConvertSortKey) {
    if (statusConvertSortKey === nextKey) {
      setStatusConvertSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
      return
    }
    setStatusConvertSortKey(nextKey)
    setStatusConvertSortDirection(nextKey === 'date' ? 'desc' : 'asc')
  }

  function toggleOperationSort(nextKey: string) {
    if (operationSortKey === nextKey) {
      setOperationSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
      return
    }
    setOperationSortKey(nextKey)
    setOperationSortDirection(nextKey === 'date' || nextKey === 'createdAt' ? 'desc' : 'asc')
  }

  async function submit(values: StatusConvertFormValues | StockConvertFormValues | StockAdjustFormValues) {
    setError(null)
    setIsSaving(true)
    try {
      if (mode === 'status-convert') {
        statusConvertFormSchema.parse(values)
      } else if (mode === 'convert') {
        stockConvertFormSchema.parse(values)
      } else if (mode === 'adjust') {
        stockAdjustFormSchema.parse(values)
      }

      await dailyFetchJson(meta.api, { body: JSON.stringify(values), method: 'POST' })
      closeForm()
      await loadData()
    } catch (caught) {
      if (caught instanceof z.ZodError) {
        const messages = caught.errors.map((err) => err.message)
        setError(messages.join('\n'))
      } else if (caught instanceof ApiError && caught.code === 'VALIDATION_ERROR' && caught.fieldErrors) {
        const messages = Object.entries(caught.fieldErrors)
          .map(([_, errs]) => errs?.join(', '))
          .filter(Boolean)
        setError(messages.length > 0 ? messages.join('\n') : caught.message)
      } else {
        setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่ได้')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function reverseConvert(refNo: string) {
    if (!window.confirm(`Reverse Grade Adjustment ${refNo} ?`)) return
    setError(null)
    setIsSaving(true)
    try {
      await dailyFetchJson(meta.api, { body: JSON.stringify({ action: 'reverse', refNo }), method: 'PATCH' })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reverse ไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  async function reverseStatusConvert(refNo: string) {
    const note = window.prompt(`Reverse Status Convert ${refNo}\nกรอกเหตุผลการ reverse`)
    if (note === null) return
    setError(null)
    setIsSaving(true)
    try {
      await dailyFetchJson(meta.api, { body: JSON.stringify({ action: 'reverse', note, refNo }), method: 'PATCH' })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reverse ไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  async function correctAdjust(row: Record<string, string | number | boolean | null>) {
    const docNo = String(row.docNo ?? row.id ?? '')
    if (!docNo) return
    const countedText = window.prompt(`แก้ไข Stock Count ${docNo}\nกรอกจำนวนนับจริงใหม่`, String(row.countedQty ?? '0'))
    if (countedText === null) return
    const countedQty = Number(countedText)
    if (!Number.isFinite(countedQty) || countedQty < 0) {
      window.alert('นับจริงต้องเป็นตัวเลขและไม่ติดลบ')
      return
    }
    const reasonText = window.prompt(`เลือกเหตุผลโดยใส่หมายเลข:\n${stockAdjustReasonOptions.map((reason, index) => `${index + 1}. ${stockAdjustReasonLabel(reason)}`).join('\n')}`, '1')
    if (reasonText === null) return
    const reasonIndex = Number(reasonText) - 1
    const reason = stockAdjustReasonOptions[reasonIndex]
    if (!reason) {
      window.alert('เหตุผลไม่ถูกต้อง')
      return
    }
    const remark = window.prompt('หมายเหตุเพิ่มเติม (เว้นว่างได้)', '') ?? ''
    setError(null)
    setIsSaving(true)
    try {
      await dailyFetchJson(meta.api, { body: JSON.stringify({ countedQty, docNo, reason, remark }), method: 'PATCH' })
      setAdjustDetail(null)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'แก้ไขปรับสต๊อกไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  async function openConvertDetail(refNo: string) {
    setError(null)
    setIsConvertDetailLoading(true)
    try {
      const payload = await dailyFetchJson<{ detail: StockConvertDetail }>(`${meta.api}?detail=${encodeURIComponent(refNo)}`)
      setConvertDetail(payload.detail)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดปรับเกรดไม่ได้')
    } finally {
      setIsConvertDetailLoading(false)
    }
  }

  function exportConvertDetail(refNo: string) {
    const link = document.createElement('a')
    link.href = `${meta.api}?detail=${encodeURIComponent(refNo)}&format=xlsx`
    link.download = `stock-convert-${refNo}-allocation.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <SummaryCards mode={mode} rows={rows} />
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={mode === 'convert' ? 'ค้นหาเลขที่/สินค้าออก/สินค้าเข้า/อ้างอิง...' : mode === 'adjust' ? 'ค้นหา doc/สินค้า/เหตุผล...' : 'ค้นหาเลขที่/วันที่/สินค้า/เหตุผล...'}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {mode === 'convert' ? (
            <>
              <Select className="h-9 w-auto" value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
                <option value="">ทุกวิธีจัดสรร</option>
                {Object.entries(CONVERT_SOURCE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </>
          ) : mode === 'adjust' ? (
            <>
              <Select className="h-9 w-auto" value={adjustBranchFilter} onChange={(event) => setAdjustBranchFilter(event.target.value)}>
                <option value="">ทุกสาขา</option>
                {data.reference.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Select>
              <div className="w-[200px]">
                <SearchCombobox
                  inputClassName="h-9 text-sm"
                  inputId="adjust-product-filter"
                  label="สินค้า"
                  hideLabel={true}
                  placeholder="เลือกสินค้า..."
                  options={adjustProductSearchOptions}
                  value={adjustProductFilter}
                  onChange={setAdjustProductFilter}
                />
              </div>
              <Select className="h-9 w-auto" value={adjustCategoryFilter} onChange={(event) => setAdjustCategoryFilter(event.target.value)}>
                <option value="">ทุกหมวด</option>
                {categoryOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </Select>
              <Select className="h-9 w-auto" value={adjustWarehouseFilter} onChange={(event) => setAdjustWarehouseFilter(event.target.value)}>
                <option value="">ทุกคลัง</option>
                {warehouseOptions.map(wh => <option key={wh.code ?? ''} value={wh.code ?? ''}>{wh.name}</option>)}
              </Select>
              <Select className="h-9 w-auto" value={adjustReasonFilter} onChange={(event) => setAdjustReasonFilter(event.target.value)}>
                <option value="">ทุกเหตุผล</option>
                {reasonOptions.map(r => <option key={r} value={r}>{stockAdjustReasonLabel(r)}</option>)}
              </Select>
              <DatePickerInput className="w-[130px] h-9" title="จากวันที่" value={fromDateFilter} onChange={setFromDateFilter} />
              <DatePickerInput className="w-[130px] h-9" title="ถึงวันที่" value={toDateFilter} onChange={setToDateFilter} />
            </>
          ) : mode === 'status-convert' ? (
            <>
              <div className="w-[200px]">
                <SearchCombobox
                  inputClassName="h-9 text-sm"
                  inputId="status-product-filter"
                  label="สินค้า"
                  hideLabel={true}
                  placeholder="เลือกสินค้า..."
                  options={adjustProductSearchOptions}
                  value={statusProductFilter}
                  onChange={setStatusProductFilter}
                />
              </div>
              <Select className="h-9 w-auto" value={statusCategoryFilter} onChange={(event) => setStatusCategoryFilter(event.target.value)}>
                <option value="">ทุกหมวด</option>
                {categoryOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </Select>
              <Select className="h-9 w-auto" value={statusWarehouseFilter} onChange={(event) => setStatusWarehouseFilter(event.target.value)}>
                <option value="">ทุกคลัง</option>
                {warehouseOptions.map(wh => <option key={wh.code ?? ''} value={wh.code ?? ''}>{wh.name}</option>)}
              </Select>
              <DatePickerInput className="w-[130px] h-9" title="จากวันที่" value={statusFromDateFilter} onChange={setStatusFromDateFilter} />
              <DatePickerInput className="w-[130px] h-9" title="ถึงวันที่" value={statusToDateFilter} onChange={setStatusToDateFilter} />
            </>
          ) : null}

          {hasFilters ? (
            <button className="h-9 rounded-md border border-slate-300 bg-slate-100 px-3 text-xs hover:bg-slate-200" type="button" onClick={resetFilters}>
              ✕ ล้าง
            </button>
          ) : null}

        </div>
        <div className="mt-2 grid w-full grid-cols-1 gap-2 border-t border-slate-100 pt-2 xl:grid-cols-[minmax(0,1fr)_auto]">
          {mode === 'convert' ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">สถานะต้นทุน:</span>
                <SegmentedButton active={!costStatusFilter} label="ทุกสถานะ" onClick={() => setCostStatusFilter('')} />
                {Object.entries(CONVERT_COST_STATUS_LABELS).map(([value, label]) => (
                  <SegmentedButton active={costStatusFilter === value} key={value} label={label} onClick={() => setCostStatusFilter(value)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">สถานะเอกสาร:</span>
                <SegmentedButton active={!documentStatusFilter} label="ทุกสถานะ" onClick={() => setDocumentStatusFilter('')} />
                {Object.entries(CONVERT_STATUS_LABELS).map(([value, label]) => (
                  <SegmentedButton active={documentStatusFilter === value} key={value} label={label} onClick={() => setDocumentStatusFilter(value)} />
                ))}
              </div>
            </div>
          ) : mode === 'adjust' ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">ประเภท:</span>
                <SegmentedButton active={!adjustTypeFilter} label="ทั้งหมด" onClick={() => setAdjustTypeFilter('')} />
                <SegmentedButton active={adjustTypeFilter === 'LOSS'} label="นับขาด" onClick={() => setAdjustTypeFilter('LOSS')} />
                <SegmentedButton active={adjustTypeFilter === 'GAIN'} label="นับเกิน" onClick={() => setAdjustTypeFilter('GAIN')} />
            </div>
          ) : mode === 'status-convert' ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">เส้นทางสถานะ:</span>
                <SegmentedButton active={!statusFlowFilter} label="ทั้งหมด" onClick={() => setStatusFlowFilter('')} />
                <SegmentedButton active={statusFlowFilter === 'RM-FG'} label="RM → FG" onClick={() => setStatusFlowFilter('RM-FG')} />
                <SegmentedButton active={statusFlowFilter === 'FG-RM'} label="FG → RM" onClick={() => setStatusFlowFilter('FG-RM')} />
                <SegmentedButton active={statusFlowFilter === 'RM-WIP'} label="RM → WIP" onClick={() => setStatusFlowFilter('RM-WIP')} />
                <SegmentedButton active={statusFlowFilter === 'WIP-FG'} label="WIP → FG" onClick={() => setStatusFlowFilter('WIP-FG')} />
            </div>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <a className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-normal text-white transition-colors hover:bg-blue-700" href={`${pathname}?new=1`}>
              {mode === 'convert' ? '+ ปรับเกรดใหม่' : mode === 'adjust' ? '+ ปรับสต๊อกใหม่' : '+ ปรับสถานะใหม่'}
            </a>
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex gap-2 items-center">
          <input
            className="min-w-[150px] flex-1 rounded-md border border-slate-300 px-3 h-9 text-sm"
            placeholder="ค้นหาด่วน..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {hasFilters ? '(มี)' : ''}
          </button>
        </div>
        {mode === 'adjust' ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">ประเภท:</span>
            <SegmentedButton active={!adjustTypeFilter} label="ทั้งหมด" onClick={() => setAdjustTypeFilter('')} />
            <SegmentedButton active={adjustTypeFilter === 'LOSS'} label="นับขาด" onClick={() => setAdjustTypeFilter('LOSS')} />
            <SegmentedButton active={adjustTypeFilter === 'GAIN'} label="นับเกิน" onClick={() => setAdjustTypeFilter('GAIN')} />
          </div>
        ) : null}
        {mode === 'status-convert' ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 overflow-x-auto">
            <span className="text-xs text-slate-500 shrink-0">เส้นทาง:</span>
            <SegmentedButton active={!statusFlowFilter} label="ทั้งหมด" onClick={() => setStatusFlowFilter('')} />
            <SegmentedButton active={statusFlowFilter === 'RM-FG'} label="RM→FG" onClick={() => setStatusFlowFilter('RM-FG')} />
            <SegmentedButton active={statusFlowFilter === 'FG-RM'} label="FG→RM" onClick={() => setStatusFlowFilter('FG-RM')} />
            <SegmentedButton active={statusFlowFilter === 'RM-WIP'} label="RM→WIP" onClick={() => setStatusFlowFilter('RM-WIP')} />
            <SegmentedButton active={statusFlowFilter === 'WIP-FG'} label="WIP→FG" onClick={() => setStatusFlowFilter('WIP-FG')} />
          </div>
        ) : null}
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองรายการ"
          onClose={() => setShowMobileFilters(false)}
          bodyClassName="text-sm"
          footer={(
            <>
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  resetFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </>
          )}
        >
              {mode === 'convert' ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">วิธีจัดสรร</span>
                    <Select className="h-9 w-full" value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
                      <option value="">ทุกวิธีจัดสรร</option>
                      {Object.entries(CONVERT_SOURCE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                  </label>
                  <div className="space-y-2">
                    <span className="block text-xs text-slate-500">สถานะต้นทุน:</span>
                    <div className="flex flex-wrap gap-2">
                      <SegmentedButton active={!costStatusFilter} label="ทุกสถานะ" onClick={() => setCostStatusFilter('')} />
                      {Object.entries(CONVERT_COST_STATUS_LABELS).map(([value, label]) => (
                        <SegmentedButton active={costStatusFilter === value} key={value} label={label} onClick={() => setCostStatusFilter(value)} />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="block text-xs text-slate-500">สถานะเอกสาร:</span>
                    <div className="flex flex-wrap gap-2">
                      <SegmentedButton active={!documentStatusFilter} label="ทุกสถานะ" onClick={() => setDocumentStatusFilter('')} />
                      {Object.entries(CONVERT_STATUS_LABELS).map(([value, label]) => (
                        <SegmentedButton active={documentStatusFilter === value} key={value} label={label} onClick={() => setDocumentStatusFilter(value)} />
                      ))}
                    </div>
                  </div>
                </>
              ) : mode === 'adjust' ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
                    <Select className="h-9 w-full" value={adjustBranchFilter} onChange={(event) => setAdjustBranchFilter(event.target.value)}>
                      <option value="">ทุกสาขา</option>
                      {data.reference.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </Select>
                  </label>
                  <div className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">สินค้า</span>
                    <SearchCombobox
                      hideLabel
                      inputClassName="h-9 text-sm"
                      inputId="stock-adjust-product-filter-mobile"
                      label="สินค้า"
                      options={[
                        { id: '', label: 'ทุกสินค้า' },
                        ...data.reference.products.filter((product) => product.active !== false).map((product) => ({ id: product.code || product.id, label: product.code ? `${product.code} - ${product.name}` : product.name })),
                      ]}
                      placeholder="ค้นหาสินค้า"
                      value={adjustProductFilter}
                      onChange={setAdjustProductFilter}
                    />
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">หมวดสินค้า</span>
                    <Select className="h-9 w-full" value={adjustCategoryFilter} onChange={(event) => setAdjustCategoryFilter(event.target.value)}>
                      <option value="">ทุกหมวด</option>
                      {categoryOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">คลังสินค้า</span>
                    <Select className="h-9 w-full" value={adjustWarehouseFilter} onChange={(event) => setAdjustWarehouseFilter(event.target.value)}>
                      <option value="">ทุกคลัง</option>
                      {warehouseOptions.map(wh => <option key={wh.code ?? ''} value={wh.code ?? ''}>{wh.name}</option>)}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">เหตุผล</span>
                    <Select className="h-9 w-full" value={adjustReasonFilter} onChange={(event) => setAdjustReasonFilter(event.target.value)}>
                      <option value="">ทุกเหตุผล</option>
                      {reasonOptions.map(r => <option key={r} value={r}>{stockAdjustReasonLabel(r)}</option>)}
                    </Select>
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงวันที่</span>
                    <div className="flex items-center gap-2">
                      <DatePickerInput className="flex-1" value={fromDateFilter} onChange={setFromDateFilter} />
                      <span className="text-slate-400">→</span>
                      <DatePickerInput className="flex-1" value={toDateFilter} onChange={setToDateFilter} />
                    </div>
                  </div>
                </>
              ) : mode === 'status-convert' ? (
                <>
                  <div className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">สินค้า</span>
                    <SearchCombobox
                      hideLabel
                      inputClassName="h-9 text-sm"
                      inputId="stock-status-product-filter-mobile"
                      label="สินค้า"
                      options={[
                        { id: '', label: 'ทุกสินค้า' },
                        ...data.reference.products.filter((product) => product.active !== false).map((product) => ({ id: product.code || product.id, label: product.code ? `${product.code} - ${product.name}` : product.name })),
                      ]}
                      placeholder="ค้นหาสินค้า"
                      value={statusProductFilter}
                      onChange={setStatusProductFilter}
                    />
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">หมวดสินค้า</span>
                    <Select className="h-9 w-full" value={statusCategoryFilter} onChange={(event) => setStatusCategoryFilter(event.target.value)}>
                      <option value="">ทุกหมวด</option>
                      {categoryOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">คลังสินค้า</span>
                    <Select className="h-9 w-full" value={statusWarehouseFilter} onChange={(event) => setStatusWarehouseFilter(event.target.value)}>
                      <option value="">ทุกคลัง</option>
                      {warehouseOptions.map(wh => <option key={wh.code ?? ''} value={wh.code ?? ''}>{wh.name}</option>)}
                    </Select>
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงวันที่</span>
                    <div className="flex items-center gap-2">
                      <DatePickerInput className="flex-1" value={statusFromDateFilter} onChange={setStatusFromDateFilter} />
                      <span className="text-slate-400">→</span>
                      <DatePickerInput className="flex-1" value={statusToDateFilter} onChange={setStatusToDateFilter} />
                    </div>
                  </div>
                </>
              ) : null}
        </MobileFilterSheet>
      ) : null}

      {/* FAB for Mobile Creation */}
      <a
        aria-label="สร้างรายการใหม่"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 lg:hidden"
        href={`${pathname}?new=1`}
      >
        <Plus className="h-6 w-6" />
      </a>
      {mode === 'status-convert' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
          <span>พบทั้งหมด {rows.length} รายการ</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {columnResize.hasCustomWidths ? (
              <button
                className="hidden lg:inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={columnResize.resetColumnWidths}
              >
                คืนค่าเดิมตาราง
              </button>
            ) : null}
            <PageSizeDropdown options={OPERATION_PAGE_SIZES} value={statusConvertPageSize} onChange={(size) => {
              setStatusConvertPageSize(size)
              setStatusConvertPage(1)
            }} />
            <button
              className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={statusConvertPage <= 1}
              type="button"
              onClick={() => setStatusConvertPage((currentPage) => Math.max(1, currentPage - 1))}
            >
              ก่อนหน้า
            </button>
            <span className="px-1">หน้า {statusConvertPage} / {statusConvertTotalPages}</span>
            <button
              className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={statusConvertPage >= statusConvertTotalPages}
              type="button"
              onClick={() => setStatusConvertPage((currentPage) => Math.min(statusConvertTotalPages, currentPage + 1))}
            >
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}
      {mode === 'adjust' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
          <span>
            พบทั้งหมด {rows.length} รายการ
            {rows.length > 0 ? `  แสดง ${(adjustPage - 1) * adjustPageSize + 1}-${Math.min(adjustPage * adjustPageSize, rows.length)}` : ''}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {columnResize.hasCustomWidths ? (
              <button
                className="hidden lg:inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={columnResize.resetColumnWidths}
              >
                คืนค่าเดิมตาราง
              </button>
            ) : null}
            <PageSizeDropdown options={OPERATION_PAGE_SIZES} value={adjustPageSize} onChange={(size) => {
              setAdjustPageSize(size)
              setAdjustPage(1)
            }} />
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={adjustPage <= 1}
              type="button"
              onClick={() => setAdjustPage((currentPage) => Math.max(1, currentPage - 1))}
            >
              ก่อนหน้า
            </button>
            <span className="px-1 text-sm font-normal text-slate-600">หน้า {adjustPage} / {adjustTotalPages}</span>
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={adjustPage >= adjustTotalPages}
              type="button"
              onClick={() => setAdjustPage((currentPage) => Math.min(adjustTotalPages, currentPage + 1))}
            >
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}
      {mode === 'convert' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
          <span>
            พบทั้งหมด {rows.length} รายการ
            {rows.length > 0 ? `  แสดง ${(convertPage - 1) * convertPageSize + 1}-${Math.min(convertPage * convertPageSize, rows.length)}` : ''}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {columnResize.hasCustomWidths ? (
              <button
                className="hidden lg:inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={columnResize.resetColumnWidths}
              >
                คืนค่าเดิมตาราง
              </button>
            ) : null}
            <PageSizeDropdown options={OPERATION_PAGE_SIZES} value={convertPageSize} onChange={(size) => {
              setConvertPageSize(size)
              setConvertPage(1)
            }} />
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={convertPage <= 1}
              type="button"
              onClick={() => setConvertPage((currentPage) => Math.max(1, currentPage - 1))}
            >
              ก่อนหน้า
            </button>
            <span className="px-1 text-sm font-normal text-slate-600">หน้า {convertPage} / {convertTotalPages}</span>
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={convertPage >= convertTotalPages}
              type="button"
              onClick={() => setConvertPage((currentPage) => Math.min(convertTotalPages, currentPage + 1))}
            >
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open && isSaving) return
          if (!open) closeForm()
          else setFormOpen(true)
        }}
      >
        <DialogContent
          className={`flex max-h-[92vh] flex-col overflow-hidden rounded-md border-0 bg-slate-900 !p-0 shadow-2xl outline-none focus:outline-none ${mode === 'convert' || mode === 'adjust' ? 'max-w-5xl' : 'max-w-3xl'}`}
          data-combobox-portal-root="true"
          fallbackTitle={meta.title}
          hideClose
        >
          <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-5 py-4 text-white">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-bold text-white">{meta.title}</DialogTitle>
                <DialogDescription className="truncate text-xs text-slate-300">{descriptionFor(mode)}</DialogDescription>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  className="h-9 rounded-md border border-emerald-600 bg-emerald-600 px-5 text-sm font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 disabled:opacity-60"
                  disabled={isSaving}
                  form="stock-operation-form"
                  type="submit"
                >
                  บันทึก
                </button>
                <button
                  className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700 disabled:opacity-60"
                  disabled={isSaving}
                  type="button"
                  onClick={closeForm}
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </DialogHeader>
          {mode === 'status-convert' ? <StatusConvertForm isSaving={isSaving} error={error} reference={data.reference} onCancel={closeForm} onSubmit={submit} /> : null}
          {mode === 'convert' ? <ConvertForm isSaving={isSaving} error={error} reference={data.reference} onCancel={closeForm} onSubmit={submit} /> : null}
          {mode === 'adjust' ? <AdjustForm isSaving={isSaving} error={error} reference={data.reference} onCancel={closeForm} onSubmit={submit} /> : null}
        </DialogContent>
      </Dialog>
      <OperationTable
        columnResize={columnResize}
        isLoading={isLoading}
        mode={mode}
        rows={visibleRows}
        sortDirection={mode === 'status-convert' ? statusConvertSortDirection : operationSortDirection}
        sortKey={mode === 'status-convert' ? statusConvertSortKey : operationSortKey}
        onConvertDetail={mode === 'convert' ? openConvertDetail : undefined}
        onAdjustDetail={mode === 'adjust' ? setAdjustDetail : undefined}
        onAdjustCorrect={mode === 'adjust' ? correctAdjust : undefined}
        onSortChange={mode === 'status-convert' ? (key) => toggleStatusConvertSort(key as StatusConvertSortKey) : mode === 'adjust' || mode === 'convert' ? toggleOperationSort : undefined}
        onConvertReverse={mode === 'convert' ? reverseConvert : undefined}
        onStatusConvertReverse={mode === 'status-convert' ? reverseStatusConvert : undefined}
      />

      {convertDetail ? (
        <ConvertDetailModal
          detail={convertDetail}
          isLoading={isConvertDetailLoading}
          onClose={() => setConvertDetail(null)}
          onExport={() => exportConvertDetail(convertDetail.refNo)}
        />
      ) : null}
      {adjustDetail ? (
        <AdjustDetailModal
          detail={adjustDetail}
          onClose={() => setAdjustDetail(null)}
          onCorrect={mode === 'adjust' ? correctAdjust : undefined}
        />
      ) : null}
    </section>
  )
}

function descriptionFor(mode: Mode) {
  if (mode === 'status-convert') return 'แปลง stock bucket RM ↔ FG ของสินค้าเดิม · ลดต้นทางเพิ่มปลายทางทันที · ใช้ source WAC และบันทึก Stock Ledger 2 ฝั่ง'
  if (mode === 'convert') return 'ตัดสินค้าต้นทางจาก Cost Pool ด้วย FIFO/LIFO/Cost/Manual แล้วเพิ่มสินค้าปลายทางกลับเข้า Cost Pool เป็น Regrade'
  return 'หาของไม่เจอ · สต๊อกตัด 0 แล้ว แต่ในระบบยังมี · นับเกินระบบ — Quick Adjust ทีละ row · กระทบ stock value/WAC'
}

function SummaryCards({ mode, rows }: { mode: Mode; rows: Payload['rows'] }) {
  if (mode === 'convert') {
    const posted = rows.filter((row) => row.status === 'posted').length
    const pendingCost = rows.filter((row) => row.costStatus === 'pending_cost').length
    const manualCount = rows.filter((row) => row.sourceType === 'Manual').length
    const autoCount = rows.filter((row) => String(row.sourceType ?? '').startsWith('Auto')).length
    const reversed = rows.filter((row) => row.status === 'reversed').length
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-5 text-sm">
        <Metric emoji="✅" iconBg="bg-emerald-100 text-emerald-700" label="ลงรายการแล้ว" value={String(posted)} valueClassName="text-emerald-700" />
        <Metric emoji="⏳" iconBg="bg-amber-100 text-amber-700" label="รอต้นทุน" value={String(pendingCost)} valueClassName="text-amber-700" />
        <Metric emoji="📝" iconBg="bg-blue-100 text-blue-700" label="กำหนดเอง" value={String(manualCount)} valueClassName="text-blue-700" />
        <Metric emoji="🏭" iconBg="bg-purple-100 text-purple-700" label="Cost Pool อัตโนมัติ" value={String(autoCount)} valueClassName="text-purple-700" />
        <Metric emoji="🔄" iconBg="bg-slate-100 text-slate-500" label="ย้อนกลับแล้ว" value={String(reversed)} valueClassName="text-slate-500" className="col-span-2 md:col-span-1" />
      </div>
    )
  }
  if (mode === 'adjust') {
    const lossRows = rows.filter((row) => Number(row.diffQty ?? 0) < 0)
    const gainRows = rows.filter((row) => Number(row.diffQty ?? 0) > 0)
    const lossQty = lossRows.reduce((sum, row) => sum + Math.abs(Number(row.diffQty ?? 0)), 0)
    const gainQty = gainRows.reduce((sum, row) => sum + Number(row.diffQty ?? 0), 0)
    const lossValue = lossRows.reduce((sum, row) => sum + signedAdjustValue(row), 0)
    const gainValue = gainRows.reduce((sum, row) => sum + signedAdjustValue(row), 0)
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4 text-sm">
        <Metric emoji="📉" iconBg="bg-red-100 text-red-700" label="นับขาด (LOSS)" value={`-${formatMoney(lossQty)} กก.`} valueClassName="text-red-600" />
        <Metric emoji="💸" iconBg="bg-red-100 text-red-700" label="มูลค่าขาด (รวม)" value={formatMoney(lossValue)} valueClassName="text-red-600" />
        <Metric emoji="📈" iconBg="bg-emerald-100 text-emerald-700" label="นับเกิน (GAIN)" value={`+${formatMoney(gainQty)} กก.`} valueClassName="text-emerald-700" />
        <Metric emoji="💰" iconBg="bg-emerald-100 text-emerald-700" label="มูลค่าเกิน (รวม)" value={formatMoney(gainValue)} valueClassName="text-emerald-700" />
      </div>
    )
  }
  return null
}

function OperationTable({
  columnResize,
  isLoading,
  mode,
  onAdjustCorrect,
  onAdjustDetail,
  onConvertDetail,
  onConvertReverse,
  onStatusConvertReverse,
  onSortChange,
  rows,
  sortDirection,
  sortKey,
}: {
  columnResize: ReturnType<typeof useResizableColumns<string>>
  isLoading: boolean
  mode: Mode
  onAdjustCorrect?: (row: Record<string, string | number | boolean | null>) => void
  onAdjustDetail?: (row: Record<string, string | number | boolean | null>) => void
  onConvertDetail?: (refNo: string) => void
  onConvertReverse?: (refNo: string) => void
  onStatusConvertReverse?: (refNo: string) => void
  onSortChange?: (key: string) => void
  rows: Payload['rows']
  sortDirection?: SortDirection
  sortKey?: string
}) {
  const columns = columnsFor(mode)
  const desktopTableScrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (isLoading) return
    const frameId = window.requestAnimationFrame(() => {
      if (desktopTableScrollRef.current) desktopTableScrollRef.current.scrollLeft = 0
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [isLoading, mode, rows])

  return (
    <>
      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block space-y-3 lg:hidden">
        {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.map((row, index) => {
          const id = String(row.id ?? index)
          const date = String(row.date ?? '')
          const refNo = String(row.refNo ?? row.docNo ?? '')

          if (mode === 'adjust') {
            const diffQty = Number(row.diffQty ?? 0)
            const adjustType = String(row.adjustType ?? '')
            const value = signedAdjustValue(row)
            const countedQty = Number(row.countedQty ?? 0)
            const systemQty = Number(row.systemQty ?? 0)

            return (
              <div
                key={id}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50"
                role="button"
                tabIndex={0}
                onClick={() => onAdjustDetail?.(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onAdjustDetail?.(row)
                }}
              >
                <div className="mb-2 flex items-start justify-between">
                  <span className="font-bold text-slate-800">{refNo}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${adjustType === 'LOSS' ? 'bg-red-100 text-red-700' : adjustType === 'GAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    <span className={`size-1.5 rounded-full ${adjustType === 'LOSS' ? 'bg-red-500' : adjustType === 'GAIN' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {adjustType === 'LOSS' ? 'นับขาด' : adjustType === 'GAIN' ? 'นับเกิน' : '-'}
                  </span>
                </div>
                <div className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</div>
                <div className="my-3 space-y-1 text-xs text-slate-600">
                  <div><span className="font-semibold">สินค้า:</span> {formatCell(row.productName)}</div>
                  <div><span className="font-semibold">สาขา/คลัง:</span> {formatCell(row.branchWarehouse)}</div>
                  {row.reason ? <div><span className="font-semibold">เหตุผล:</span> {stockAdjustReasonLabel(String(row.reason))}</div> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <div className="text-slate-400">ระบบ / นับจริง</div>
                    <div className="font-semibold text-slate-800">{formatMoney(systemQty)} / {formatMoney(countedQty)} กก.</div>
                  </div>
                  <div>
                    <div className="text-slate-400">ส่วนต่าง</div>
                    <div className={`font-semibold ${diffQty < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(diffQty)} กก.</div>
                  </div>
                  <div>
                    <div className="text-slate-400">ราคา/กก.</div>
                    <div className="font-semibold text-slate-800">{formatMoney(Number(row.unitPricePerKg ?? 0))} บาท</div>
                  </div>
                  <div>
                    <div className="text-slate-400">มูลค่ารวม</div>
                    <div className={`font-semibold ${value < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(value)} บาท</div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <TableActionButton
                    disabled={!row.canEdit || !onAdjustCorrect}
                    mobileLabel
                    menu={<TableActionMenuItem disabled={!row.canEdit || !onAdjustCorrect} onSelect={() => onAdjustCorrect?.(row)}>แก้ไข</TableActionMenuItem>}
                    onClick={(event) => event.stopPropagation()}
                    title={row.canEdit ? 'แก้ไขได้ภายใน 7 วัน' : 'หมดช่วงแก้ไข 7 วันแล้ว'}
                  />
                </div>
              </div>
            )
          }

          if (mode === 'convert') {
            const status = String(row.status ?? '')
            const costStatus = String(row.costStatus ?? '')
            const costStatusLabel = displayConvertLabel(CONVERT_COST_STATUS_LABELS, costStatus)
            const costStatusColor = costStatus === 'allocated' ? 'bg-emerald-100 text-emerald-700' : costStatus === 'pending_cost' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            const statusColor = status === 'posted' ? 'bg-emerald-100 text-emerald-700' : status === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
            const sourceType = String(row.sourceType ?? 'Manual')
            const sourceTypeColor = sourceType.startsWith('Auto') ? 'bg-purple-100 text-purple-700' : sourceType === 'Legacy' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'

            return (
              <div key={id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
                <div className="mb-2 flex items-start justify-between">
                  <span className="font-bold text-slate-800">{refNo}</span>
                  <div className="flex gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sourceTypeColor}`}>{displayConvertLabel(CONVERT_SOURCE_TYPE_LABELS, sourceType)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor}`}>{displayConvertLabel(CONVERT_STATUS_LABELS, status || 'posted')}</span>
                  </div>
                </div>
                <div className="text-xs text-slate-500">{formatDateDisplay(date)}</div>
                <div className="my-3 space-y-1 text-xs text-slate-600">
                  <div><span className="font-semibold text-red-600">สินค้าออก:</span> {formatCell(row.sourceProduct)}</div>
                  <div><span className="font-semibold text-emerald-700">สินค้าเข้า:</span> {formatCell(row.targetProduct)}</div>
                  <div><span className="font-semibold">สาขา / คลัง:</span> {formatCell(row.branchWarehouse)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <div className="text-slate-400">จำนวนออก</div>
                    <div className="font-semibold text-red-700">{formatMoney(Number(row.sourceQty ?? 0))} กก. (@{formatMoney(Number(row.unitCost ?? 0))})</div>
                  </div>
                  <div>
                    <div className="text-slate-400">จำนวนเข้า</div>
                    <div className="font-semibold text-emerald-700">{formatMoney(Number(row.targetQty ?? 0))} กก. (@{formatMoney(Number(row.targetUnitCost ?? 0))})</div>
                  </div>
                  <div>
                    <div className="text-slate-400">สูญเสีย / สถานะต้นทุน</div>
                    <div className="font-semibold text-slate-800">
                      {formatMoney(Number(row.lossQty ?? 0))} กก. / <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-semibold ${costStatusColor}`}>{costStatusLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-1">
                  <TableActionButton mobileLabel menu={(
                    <>
                      <TableActionMenuItem disabled={!onConvertDetail} onSelect={() => onConvertDetail?.(refNo)}>รายละเอียด</TableActionMenuItem>
                      <TableActionMenuItem disabled={status === 'reversed' || !onConvertReverse} onSelect={() => onConvertReverse?.(refNo)}>ย้อนกลับ</TableActionMenuItem>
                    </>
                  )} />
                </div>
              </div>
            )
          }

          if (mode === 'status-convert') {
            const status = String(row.status ?? 'posted')

            return (
              <div key={id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
                <div className="mb-2 flex items-start justify-between">
                  <span className="font-bold text-slate-800">{refNo}</span>
                  <StatusText status={status} />
                </div>
                <div className="text-xs text-slate-500">{formatDateDisplay(date)}</div>
                <div className="my-3 space-y-1 text-xs text-slate-600">
                  <div><span className="font-semibold">สินค้า:</span> <b>{formatCell(row.productCode)}</b> - {formatCell(row.productName)}</div>
                  <div><span className="font-semibold">สาขา/คลัง:</span> {formatCell(row.branchName)} / {formatCell(row.warehouseName)} → {formatCell(row.targetWarehouseName)}</div>
                  <div>
                    <span className="font-semibold">การเปลี่ยนสถานะ:</span>{' '}
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{formatCell(row.statusFrom)}</span>
                    <span className="mx-1 text-amber-600">→</span>
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">{formatCell(row.statusTo)}</span>
                  </div>
                  {row.note ? <div><span className="font-semibold">เหตุผล:</span> {String(row.note)}</div> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <div className="text-slate-400">น้ำหนัก / ต้นทุน</div>
                    <div className="font-semibold text-purple-700">{formatMoney(Number(row.qty ?? 0))} กก. (@{formatMoney(Number(row.unitCost ?? 0))})</div>
                  </div>
                  <div>
                    <div className="text-slate-400">มูลค่ารวม</div>
                    <div className="font-semibold text-slate-800">{formatMoney(Number(row.value ?? 0))} บาท</div>
                  </div>
                  <div>
                    <div className="text-slate-400">ผู้ทำ / วันที่สร้างรายการ</div>
                    <div className="font-semibold text-slate-600">{formatCell(row.createdBy)} ({formatDateTime(row.createdAt)})</div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <TableActionButton
                    disabled={status === 'reversed' || !onStatusConvertReverse}
                    mobileLabel
                    menu={<TableActionMenuItem disabled={status === 'reversed' || !onStatusConvertReverse} onSelect={() => onStatusConvertReverse?.(refNo)}>ย้อนกลับ</TableActionMenuItem>}
                  />
                </div>
              </div>
            )
          }

          return null
        })}
        {!isLoading && !rows.length ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow">{emptyTextFor(mode)}</div> : null}
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div key={`${mode}-${isLoading ? 'loading' : 'ready'}`} ref={desktopTableScrollRef} className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>
              {columns.map((column) => (
                <ResizableTableHead
                  key={column.key}
                  activeSortKey={column.sortable ? sortKey : undefined}
                  direction={column.sortable ? sortDirection : undefined}
                  label={column.label}
                  align={column.headerClassName?.includes('text-right') ? 'right' : column.headerClassName?.includes('text-center') ? 'center' : 'left'}
                  resizeProps={columnResize.getResizeHandleProps(column.key, column.label)}
                  sortKey={column.sortable ? column.key : undefined}
                  onSort={column.sortable ? onSortChange : undefined}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={columns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row, index) => (
              <tr key={String(row.id ?? index)} className={`hover:bg-slate-50 transition-colors ${mode === 'adjust' ? 'cursor-pointer' : ''}`} onClick={mode === 'adjust' ? () => onAdjustDetail?.(row) : undefined}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-3 align-top text-slate-700 ${column.key === 'action' || column.key === 'status' || column.key === 'costStatus' ? 'overflow-visible whitespace-nowrap' : 'overflow-hidden truncate'} ${column.cellClassName ?? ''}`}
                  >
                    {formatOperationCell(mode, row, column.key, onConvertReverse, onConvertDetail, onStatusConvertReverse, onAdjustCorrect)}
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && !rows.length ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={columns.length}>{emptyTextFor(mode)}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  )
}

function emptyTextFor(mode: Mode) {
  if (mode === 'convert') return 'ยังไม่มีรายการปรับเกรด'
  if (mode === 'status-convert') return 'ยังไม่เคยปรับสถานะ — กดปุ่ม "+ ปรับสถานะใหม่"'
  return 'ยังไม่มีรายการ'
}

function SegmentedButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function StatusText({ status }: { status: string }) {
  const isReversed = status === 'reversed'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isReversed ? 'text-slate-500' : 'text-emerald-700'}`}>
      <span className={`size-1.5 rounded-full ${isReversed ? 'bg-slate-400' : 'bg-emerald-500'}`} />
      {displayConvertLabel(CONVERT_STATUS_LABELS, status || 'posted')}
    </span>
  )
}

function columnsFor(mode: Mode): OperationColumn[] {
  if (mode === 'status-convert') return [
    { key: 'date', label: 'วันที่เอกสาร', sortable: true },
    { key: 'refNo', label: 'เลขที่', sortable: true },
    { key: 'productDisplay', label: 'สินค้า', sortable: true },
    { key: 'locationDisplay', label: 'สาขา/คลัง', sortable: true },
    { key: 'qty', label: 'จำนวน (กก.)', cellClassName: 'text-right font-semibold text-purple-700 tabular-nums', headerClassName: 'text-right', sortable: true },
    { key: 'unitCost', label: 'ต้นทุน (บาท/กก.)', cellClassName: 'text-right text-slate-600 tabular-nums', headerClassName: 'text-right', sortable: true },
    { key: 'value', label: 'มูลค่า', cellClassName: 'text-right text-slate-600 tabular-nums', headerClassName: 'text-right', sortable: true },
    { key: 'statusFlow', label: 'เปลี่ยนสถานะ', cellClassName: 'text-center', headerClassName: 'text-center', sortable: true },
    { key: 'note', label: 'เหตุผล', sortable: true },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-center', headerClassName: 'text-center', sortable: true },
    { key: 'createdBy', label: 'ผู้ทำรายการ', sortable: true },
    { key: 'createdAt', label: 'วันที่สร้างรายการ', sortable: true },
    { key: 'action', label: 'จัดการ', cellClassName: 'text-center', headerClassName: 'text-center' },
  ]
  if (mode === 'convert') return [
    { key: 'sourceType', label: 'วิธีจัดสรร', cellClassName: 'text-left', headerClassName: 'text-left', sortable: true },
    { key: 'refNo', label: 'เลขที่ / อ้างอิง', cellClassName: 'whitespace-nowrap text-right', headerClassName: 'text-right', sortable: true },
    { key: 'date', label: 'วันที่เอกสาร', cellClassName: 'whitespace-nowrap text-right', headerClassName: 'text-right', sortable: true },
    { key: 'branchWarehouse', label: 'สาขา / คลัง', cellClassName: 'whitespace-nowrap text-right', headerClassName: 'text-right', sortable: true },
    { key: 'sourceProduct', label: 'สินค้าออก', cellClassName: 'text-right', headerClassName: 'text-right', sortable: true },
    { key: 'sourceQty', label: 'จำนวนออก', cellClassName: 'whitespace-nowrap text-right font-mono tabular-nums text-red-700', headerClassName: 'text-right', sortable: true },
    { key: 'unitCost', label: 'ต้นทุน/กก. ออก', cellClassName: 'whitespace-nowrap text-right font-mono tabular-nums', headerClassName: 'text-right', sortable: true },
    { key: 'targetProduct', label: 'สินค้าเข้า', cellClassName: 'text-right', headerClassName: 'text-right', sortable: true },
    { key: 'targetQty', label: 'จำนวนเข้า', cellClassName: 'whitespace-nowrap text-right font-mono tabular-nums text-emerald-700', headerClassName: 'text-right', sortable: true },
    { key: 'targetUnitCost', label: 'ต้นทุน/กก. เข้า', cellClassName: 'whitespace-nowrap text-right font-mono tabular-nums', headerClassName: 'text-right', sortable: true },
    { key: 'lossQty', label: 'สูญเสีย', cellClassName: 'whitespace-nowrap text-right font-mono tabular-nums', headerClassName: 'text-right', sortable: true },
    { key: 'costStatus', label: 'สถานะต้นทุน', cellClassName: 'text-right', headerClassName: 'text-right', sortable: true },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-right', headerClassName: 'text-right', sortable: true },
    { key: 'action', label: 'จัดการ', cellClassName: 'text-right', headerClassName: 'text-right' },
  ]
  if (mode === 'adjust') return [
    { key: 'docNo', label: 'เลขที่เอกสาร', sortable: true },
    { key: 'date', label: 'วันที่เอกสาร', sortable: true },
    { key: 'branchWarehouse', label: 'สาขา/คลัง', sortable: true },
    { key: 'productName', label: 'สินค้า', sortable: true },
    { key: 'outputCategory', label: 'ประเภทคลัง', sortable: true },
    { key: 'systemQty', label: 'ยอดในระบบ', cellClassName: 'text-right font-mono', headerClassName: 'text-right', sortable: true },
    { key: 'onHoldQty', label: 'จองไว้', cellClassName: 'text-right font-mono text-amber-700', headerClassName: 'text-right', sortable: true },
    { key: 'readyQty', label: 'พร้อมใช้', cellClassName: 'text-right font-mono text-emerald-700', headerClassName: 'text-right', sortable: true },
    { key: 'countedQty', label: 'นับจริง', cellClassName: 'text-right font-mono', headerClassName: 'text-right', sortable: true },
    { key: 'diffQty', label: 'ส่วนต่าง', cellClassName: 'text-right font-mono', headerClassName: 'text-right', sortable: true },
    { key: 'adjustType', label: 'ประเภท', sortable: true },
    { key: 'unitPricePerKg', label: 'ราคา/กก.', cellClassName: 'text-right font-mono', headerClassName: 'text-right', sortable: true },
    { key: 'totalValue', label: 'มูลค่ารวม (บาท)', cellClassName: 'text-right font-mono', headerClassName: 'text-right', sortable: true },
    { key: 'reason', label: 'เหตุผล', sortable: true },
    { key: 'createdAt', label: 'วันที่สร้างรายการ', sortable: true },
    { key: 'updatedBy', label: 'แก้ไขโดย', sortable: true },
    { key: 'action', label: 'จัดการ', cellClassName: 'text-center', headerClassName: 'text-center' },
  ]
  return []
}

function formatCell(value: unknown) {
  if (typeof value === 'number') return formatMoney(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '-')
}

function formatDateTime(value: string | number | boolean | null | undefined) {
  if (!value) return '-'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function normalizeSortValue(value: string | number | boolean | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return String(value ?? '').trim().toLowerCase()
}

function statusConvertSortValue(row: Record<string, string | number | boolean | null>, key: StatusConvertSortKey) {
  if (key === 'productDisplay') return `${String(row.productCode ?? '')} ${String(row.productName ?? '')}`.trim().toLowerCase()
  if (key === 'locationDisplay') return `${String(row.branchName ?? '')} ${String(row.warehouseName ?? '')} ${String(row.targetWarehouseName ?? '')}`.trim().toLowerCase()
  if (key === 'statusFlow') return `${String(row.statusFrom ?? '')} ${String(row.statusTo ?? '')}`.trim().toLowerCase()
  if (key === 'note') return normalizeSortValue(row.note ?? row.reason)
  return normalizeSortValue(row[key])
}

function compareStatusConvertRows(
  left: Record<string, string | number | boolean | null>,
  right: Record<string, string | number | boolean | null>,
  key: StatusConvertSortKey,
  direction: SortDirection,
) {
  const leftValue = statusConvertSortValue(left, key)
  const rightValue = statusConvertSortValue(right, key)
  let result = 0
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    result = leftValue - rightValue
  } else {
    result = String(leftValue).localeCompare(String(rightValue), 'th')
  }
  if (result === 0) {
    result = String(left.id ?? '').localeCompare(String(right.id ?? ''), 'th')
  }
  return direction === 'asc' ? result : result * -1
}

function operationSortValue(row: Record<string, string | number | boolean | null>, key: string) {
  if (key === 'totalValue') return signedAdjustValue(row)
  return normalizeSortValue(row[key])
}

function compareOperationRows(
  left: Record<string, string | number | boolean | null>,
  right: Record<string, string | number | boolean | null>,
  key: string,
  direction: SortDirection,
) {
  const leftValue = operationSortValue(left, key)
  const rightValue = operationSortValue(right, key)
  let result = 0
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    result = leftValue - rightValue
  } else {
    result = String(leftValue).localeCompare(String(rightValue), 'th')
  }
  if (result === 0) {
    result = String(left.id ?? left.docNo ?? left.refNo ?? '').localeCompare(String(right.id ?? right.docNo ?? right.refNo ?? ''), 'th')
  }
  return direction === 'asc' ? result : result * -1
}

function formatOperationCell(mode: Mode, row: Record<string, string | number | boolean | null>, key: string, onConvertReverse?: (refNo: string) => void, onConvertDetail?: (refNo: string) => void, onStatusConvertReverse?: (refNo: string) => void, onAdjustCorrect?: (row: Record<string, string | number | boolean | null>) => void) {
  if (mode === 'status-convert') {
    if (key === 'productDisplay') return <><b>{formatCell(row.productCode)}</b><div className="text-xs text-slate-500">{formatCell(row.productName)}</div></>
    if (key === 'locationDisplay') return <span className="text-xs">{formatCell(row.branchName)}<br />{formatCell(row.warehouseName)} → {formatCell(row.targetWarehouseName)}</span>
    if (key === 'statusFlow') return <><span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{formatCell(row.statusFrom)}</span><span className="mx-1 text-amber-600">→</span><span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{formatCell(row.statusTo)}</span></>
    if (key === 'createdAt') return formatDateTime(row.createdAt)
    if (key === 'status') {
      const status = String(row.status ?? 'posted')
      return <StatusText status={status} />
    }
    if (key === 'action') {
      const status = String(row.status ?? 'posted')
      const refNo = String(row.refNo ?? row.id ?? '')
      return <TableActionButton
        aria-label={`จัดการ ${refNo}`}
        menu={<TableActionMenuItem disabled={status === 'reversed' || !onStatusConvertReverse} onSelect={() => onStatusConvertReverse?.(refNo)}>ย้อนกลับ</TableActionMenuItem>}
      />
    }
  }
  if (mode === 'convert') {
    if (key === 'action') {
      const status = String(row.status ?? '')
      const refNo = String(row.refNo ?? row.id ?? '')
      return <TableActionButton
        aria-label={`จัดการ ${refNo}`}
        menu={(
          <>
            <TableActionMenuItem disabled={!onConvertDetail} onSelect={() => onConvertDetail?.(refNo)}>รายละเอียด</TableActionMenuItem>
            <TableActionMenuItem disabled={status === 'reversed' || !onConvertReverse} onSelect={() => onConvertReverse?.(refNo)}>ย้อนกลับ</TableActionMenuItem>
          </>
        )}
      />
    }
    if (key === 'costStatus') {
      const value = String(row[key] ?? '')
      const label = displayConvertLabel(CONVERT_COST_STATUS_LABELS, value)
      const color = value === 'allocated' ? 'bg-emerald-100 text-emerald-700' : value === 'pending_cost' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
      return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      const color = value === 'posted' ? 'bg-emerald-100 text-emerald-700' : value === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
      return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{displayConvertLabel(CONVERT_STATUS_LABELS, value)}</span>
    }
    if (key === 'sourceType') {
      const value = String(row[key] ?? 'Manual')
      const color = value.startsWith('Auto') ? 'bg-purple-100 text-purple-700' : value === 'Legacy' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{displayConvertLabel(CONVERT_SOURCE_TYPE_LABELS, value)}</span>
    }
  }
  if (mode === 'adjust') {
    if (key === 'action') {
      return <TableActionButton
        aria-label={`จัดการ ${String(row.docNo ?? row.id ?? '')}`}
        disabled={!row.canEdit || !onAdjustCorrect}
        menu={<TableActionMenuItem disabled={!row.canEdit || !onAdjustCorrect} onSelect={() => onAdjustCorrect?.(row)}>แก้ไข</TableActionMenuItem>}
        onClick={(event) => event.stopPropagation()}
        title={row.canEdit ? 'แก้ไขได้ภายใน 7 วัน' : 'หมดช่วงแก้ไข 7 วันแล้ว'}
      />
    }
    if (key === 'createdAt') return formatDateTime(row.createdAt)
    if (key === 'adjustType') {
      const value = String(row[key] ?? '')
      const color = value === 'LOSS' ? 'bg-red-100 text-red-700' : value === 'GAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      const dotColor = value === 'LOSS' ? 'bg-red-500' : value === 'GAIN' ? 'bg-emerald-500' : 'bg-slate-400'
      const label = value === 'LOSS' ? 'นับขาด' : value === 'GAIN' ? 'นับเกิน' : '-'
      return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}><span className={`size-1.5 rounded-full ${dotColor}`} />{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{value || 'posted'}</span>
    }
    if (key === 'outputCategory') {
      return formatCell(row[key])
    }
    if (key === 'reason') return stockAdjustReasonLabel(String(row[key] ?? ''))
    if (key === 'diffQty') {
      const value = Number(row[key] ?? 0)
      return <span className={value < 0 ? 'font-mono text-red-600' : value > 0 ? 'font-mono text-emerald-700' : 'font-mono text-slate-500'}>{formatMoney(value)}</span>
    }
    if (key === 'totalValue') {
      const value = signedAdjustValue(row)
      return <span className={value < 0 ? 'font-mono text-red-600' : value > 0 ? 'font-mono text-emerald-700' : 'font-mono text-slate-500'}>{formatMoney(value)}</span>
    }
  }
  return formatCell(row[key])
}

function signedAdjustValue(row: Record<string, string | number | boolean | null>) {
  const rawValue = Number(row.totalValue ?? row.valueNote ?? 0)
  if (String(row.adjustType ?? '') === 'LOSS' && rawValue > 0) return rawValue * -1
  return rawValue
}

function AdjustDetailModal({
  detail,
  onClose,
  onCorrect,
}: {
  detail: Record<string, string | number | boolean | null>
  onClose: () => void
  onCorrect?: (row: Record<string, string | number | boolean | null>) => void
}) {
  const adjustType = String(detail.adjustType ?? '')
  const diffQty = Number(detail.diffQty ?? 0)
  const totalValue = signedAdjustValue(detail)
  const canEdit = Boolean(detail.canEdit)
  const statusLabel = adjustType === 'LOSS' ? 'นับขาด' : adjustType === 'GAIN' ? 'นับเกิน' : 'ไม่มีส่วนต่าง'
  const statusClass = adjustType === 'LOSS' ? 'bg-red-100 text-red-700' : adjustType === 'GAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
  const dotClass = adjustType === 'LOSS' ? 'bg-red-500' : adjustType === 'GAIN' ? 'bg-emerald-500' : 'bg-slate-400'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-10">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border-0 bg-slate-900 shadow-2xl outline-none">
        <div data-ns-dialog-header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">รายละเอียดปรับสต๊อก · {formatCell(detail.docNo)}</h3>
            <p className="mt-1 text-xs">{formatDateDisplay(String(detail.date ?? ''))} · {formatCell(detail.branchWarehouse)} · {formatCell(detail.status)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <span className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${statusClass}`}>
              <span className={`size-1.5 rounded-full ${dotClass}`} />
              {statusLabel}
            </span>
            <button
              className="h-9 rounded-md border border-slate-700 bg-slate-800 px-4 text-sm font-normal text-white hover:bg-slate-700 disabled:opacity-60"
              disabled={!canEdit || !onCorrect}
              title={canEdit ? 'แก้ไขได้ภายใน 7 วัน' : 'หมดช่วงแก้ไข 7 วันแล้ว'}
              type="button"
              onClick={() => onCorrect?.(detail)}
            >
              แก้ไข
            </button>
            <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={onClose}>ปิด</button>
          </div>
        </div>
        <div className="overflow-y-auto bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="ยอดในระบบ" value={`${formatMoney(Number(detail.systemQty ?? 0))} กก.`} />
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="นับจริง" value={`${formatMoney(Number(detail.countedQty ?? 0))} กก.`} />
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="ส่วนต่าง" value={`${formatMoney(diffQty)} กก.`} valueClassName={diffQty < 0 ? 'text-red-600' : diffQty > 0 ? 'text-emerald-700' : 'text-slate-900'} />
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="มูลค่ารวม (บาท)" value={formatMoney(totalValue)} valueClassName={totalValue < 0 ? 'text-red-600' : totalValue > 0 ? 'text-emerald-700' : 'text-slate-900'} />
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="จองไว้" value={`${formatMoney(Number(detail.onHoldQty ?? 0))} กก.`} valueClassName="text-amber-700" />
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="พร้อมใช้" value={`${formatMoney(Number(detail.readyQty ?? 0))} กก.`} valueClassName="text-emerald-700" />
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="ราคา/กก." value={formatMoney(Number(detail.unitPricePerKg ?? 0))} />
            <Metric cardClassName="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" label="ประเภทคลัง" value={formatCell(detail.outputCategory)} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-bold text-slate-800">สินค้าและคลัง</h4>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <DetailField label="สินค้า" value={`${formatCell(detail.productCode)} ${formatCell(detail.productName)}`} />
                <DetailField label="Lot" value={formatCell(detail.lotNo)} />
                <DetailField label="สาขา" value={formatCell(detail.branchName)} />
                <DetailField label="คลัง" value={formatCell(detail.warehouseName)} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-bold text-slate-800">เหตุผลและ audit</h4>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <DetailField label="เหตุผล" value={stockAdjustReasonLabel(String(detail.reason ?? ''))} />
                <DetailField label="หมายเหตุ" value={formatCell(detail.remark)} />
                <DetailField label="สร้างโดย" value={formatCell(detail.createdBy)} />
                <DetailField label="วันที่สร้างรายการ" value={formatDateTime(detail.createdAt)} />
                <DetailField label="แก้ไขโดย" value={formatCell(detail.updatedBy)} />
                <DetailField label="แก้ไขล่าสุด" value={formatDateTime(detail.updatedAt)} />
                <DetailField label="แก้ไขได้ถึง" value={formatDateTime(detail.editableUntil)} />
                <DetailField label="นโยบายบัญชี" value={formatCell(detail.policy)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-800">{value || '-'}</div>
    </div>
  )
}

function ConvertDetailModal({ detail, isLoading, onClose, onExport }: { detail: StockConvertDetail; isLoading: boolean; onClose: () => void; onExport: () => void }) {
  const columnResize = useResizableColumns('stock.operation.detail-modal.v6', detailColumns)
  const totalQty = detail.lines.reduce((sum, line) => sum + line.qty, 0)
  const totalCost = detail.lines.reduce((sum, line) => sum + line.totalCost, 0)
  const hasNotes = Boolean(detail.reason || detail.notes || detail.targetCostReason)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        hideClose
        aria-labelledby="stock-convert-detail-title"
        className="left-0 top-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-slate-900 !p-0 outline-none sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md"
      >
        <DialogHeader className="shrink-0 rounded-none bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white sm:p-4 sm:rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <DialogTitle id="stock-convert-detail-title" className="truncate text-base text-white sm:text-lg">
                รายละเอียดการจัดสรรต้นทุน · {detail.refNo}
              </DialogTitle>
              <DialogDescription className="truncate text-slate-300">
                {detail.date} · {detail.branchWarehouse || '-'} · {displayConvertLabel(CONVERT_STATUS_LABELS, detail.status)}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 justify-end gap-2">
              <button className="h-10 rounded-md border border-emerald-600 bg-emerald-600 px-3 text-sm font-normal text-white transition-colors hover:border-emerald-700 hover:bg-emerald-700 disabled:opacity-50 sm:h-9 sm:px-4" disabled={isLoading} type="button" onClick={onExport}>ส่งออก Excel</button>
              <button className="h-10 rounded-md border border-rose-600 bg-rose-600 px-3 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700 sm:h-9 sm:px-4" type="button" onClick={onClose}>ปิด</button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50">
          <div className="grid grid-cols-2 gap-2.5 border-b border-slate-100 p-4 sm:gap-4 lg:grid-cols-4">
            <Metric label="น้ำหนักออก" value={`${formatMoney(detail.sourceQty)} กก.`} />
            <Metric label="น้ำหนักเข้า" value={`${formatMoney(detail.targetQty)} กก.`} />
            <Metric label="น้ำหนักสูญเสีย" value={`${formatMoney(detail.lossQty)} กก.`} />
            <Metric label="น้ำหนักที่จัดสรร" value={`${formatMoney(totalQty)} กก.`} />
            <Metric label="ต้นทุนที่จัดสรร" value={`${formatMoney(totalCost)} บาท`} />
            <Metric label="นโยบายต้นทุน" value={displayConvertLabel(CONVERT_TARGET_COST_POLICY_LABELS, detail.targetCostPolicy)} />
            <Metric label="ต้นทุนปลายทาง" value={`${formatMoney(detail.targetUnitCost)} บาท/กก.`} />
            <Metric label="ส่วนต่างต้นทุน" value={`${formatMoney(detail.targetCostVariance)} บาท`} />
          </div>

          <div className="space-y-3 p-4">
            <h4 className="text-sm font-bold text-slate-800">รายการจัดสรรต้นทุน</h4>

            <div className="space-y-3 md:hidden">
              {detail.lines.map((line) => (
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={`${line.lineNo}-${line.sourcePoolId ?? 'source'}-mobile`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-slate-800">รายการ {line.lineNo}</div>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${line.allocationStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {displayConvertLabel(CONVERT_ALLOCATION_STATUS_LABELS, line.allocationStatus)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">Cost Pool ต้นทาง</div>
                      <div className="mt-0.5 font-semibold text-slate-800">{line.sourceRefNo ?? line.sourceType ?? '-'}</div>
                      <div className="text-xs text-slate-400">Pool {line.sourcePoolId ?? '-'}{line.sourceLotNo ? ` · ล็อต ${line.sourceLotNo}` : ''}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Cost Pool ปลายทาง</div>
                      <div className="mt-0.5 font-semibold text-slate-800">Pool {line.targetPoolId ?? '-'}</div>
                      <div className="text-xs text-slate-400">{displayConvertLabel(CONVERT_POOL_STATUS_LABELS, line.targetPoolStatus ?? '')}{line.targetLotNo ? ` · ล็อต ${line.targetLotNo}` : ''}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">สินค้าต้นทาง</div>
                      <div className="mt-0.5 font-medium text-slate-700">{line.sourceProduct}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">สินค้าปลายทาง</div>
                      <div className="mt-0.5 font-medium text-slate-700">{line.targetProduct}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">จำนวน</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-800">{formatMoney(line.qty)} กก.</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">ต้นทุน</div>
                      <div className="mt-0.5 font-mono font-semibold text-slate-800">{formatMoney(line.unitCost)} บาท/กก.</div>
                      <div className="text-xs text-slate-500">รวม {formatMoney(line.totalCost)} บาท</div>
                    </div>
                  </div>
                </article>
              ))}
              {!detail.lines.length ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">ไม่พบรายการจัดสรรสำหรับเอกสารนี้</div> : null}
            </div>

            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm md:block">
              {columnResize.hasCustomWidths ? (
                <div className="flex justify-end border-b border-slate-100 bg-slate-50 p-2">
                  <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
                    คืนค่าเดิมตาราง
                  </button>
                </div>
              ) : null}
              <table className="ns-table w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {detailColumns.map((col) => (
                    <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <tr>
                    <ResizableTableHead label="ลำดับ" resizeProps={columnResize.getResizeHandleProps('line', 'ลำดับ')} />
                    <ResizableTableHead label="Cost Pool ต้นทาง" resizeProps={columnResize.getResizeHandleProps('sourcePool', 'Cost Pool ต้นทาง')} />
                    <ResizableTableHead label="สินค้าต้นทาง" resizeProps={columnResize.getResizeHandleProps('sourceProduct', 'สินค้าต้นทาง')} />
                    <ResizableTableHead label="Cost Pool ปลายทาง" resizeProps={columnResize.getResizeHandleProps('targetPool', 'Cost Pool ปลายทาง')} />
                    <ResizableTableHead label="สินค้าปลายทาง" resizeProps={columnResize.getResizeHandleProps('targetProduct', 'สินค้าปลายทาง')} />
                    <ResizableTableHead align="right" label="จำนวน" resizeProps={columnResize.getResizeHandleProps('qty', 'จำนวน')} />
                    <ResizableTableHead align="right" label="ต้นทุน/กก." resizeProps={columnResize.getResizeHandleProps('unitCost', 'ต้นทุน/กก.')} />
                    <ResizableTableHead align="right" label="ต้นทุนรวม" resizeProps={columnResize.getResizeHandleProps('cost', 'ต้นทุนรวม')} />
                    <ResizableTableHead align="center" label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {detail.lines.map((line) => (
                    <tr key={`${line.lineNo}-${line.sourcePoolId ?? 'source'}`} className="transition-colors hover:bg-slate-50">
                      <td className="overflow-hidden truncate px-3 py-3 align-top font-mono text-slate-700">{line.lineNo}</td>
                      <td className="overflow-hidden truncate px-3 py-3 align-top text-slate-700">
                        <div>{line.sourceRefNo ?? line.sourceType ?? '-'}</div>
                        <div className="mt-0.5 text-xs text-slate-400">Pool {line.sourcePoolId ?? '-'}{line.sourceLotNo ? ` · ล็อต ${line.sourceLotNo}` : ''}</div>
                      </td>
                      <td className="overflow-hidden truncate px-3 py-3 align-top text-slate-700">{line.sourceProduct}</td>
                      <td className="overflow-hidden truncate px-3 py-3 align-top text-slate-700">
                        <div>Pool {line.targetPoolId ?? '-'}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{displayConvertLabel(CONVERT_POOL_STATUS_LABELS, line.targetPoolStatus ?? '')}{line.targetLotNo ? ` · ล็อต ${line.targetLotNo}` : ''}</div>
                      </td>
                      <td className="overflow-hidden truncate px-3 py-3 align-top text-slate-700">{line.targetProduct}</td>
                      <td className="overflow-hidden truncate px-3 py-3 text-right align-top font-mono text-slate-700">{formatMoney(line.qty)}</td>
                      <td className="overflow-hidden truncate px-3 py-3 text-right align-top font-mono text-slate-700">{formatMoney(line.unitCost)}</td>
                      <td className="overflow-hidden truncate px-3 py-3 text-right align-top font-mono text-slate-700">{formatMoney(line.totalCost)}</td>
                      <td className="overflow-hidden truncate px-3 py-3 text-center align-top">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${line.allocationStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          {displayConvertLabel(CONVERT_ALLOCATION_STATUS_LABELS, line.allocationStatus)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!detail.lines.length ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={9}>ไม่พบรายการจัดสรรสำหรับเอกสารนี้</td></tr> : null}
                </tbody>
              </table>
            </div>

            {hasNotes ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">เหตุผลและหมายเหตุ</h4>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  {detail.reason ? <div><div className="text-xs text-slate-500">เหตุผลการปรับเกรด</div><div className="mt-0.5 break-words text-slate-700">{detail.reason}</div></div> : null}
                  {detail.notes ? <div><div className="text-xs text-slate-500">หมายเหตุ</div><div className="mt-0.5 break-words text-slate-700">{detail.notes}</div></div> : null}
                  {detail.targetCostReason ? <div><div className="text-xs text-slate-500">เหตุผลการกำหนดต้นทุนเอง</div><div className="mt-0.5 break-words text-slate-700">{detail.targetCostReason}</div></div> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Metric({
  emoji,
  label,
  value,
  valueClassName = 'text-slate-900',
  className = '',
}: {
  cardClassName?: string
  emoji?: string
  iconBg?: string
  label: string
  labelClassName?: string
  value: string
  valueClassName?: string
  className?: string
}) {
  const tone = valueClassName.includes('emerald') ? 'emerald' : valueClassName.includes('amber') ? 'amber' : valueClassName.includes('red') ? 'red' : valueClassName.includes('blue') ? 'blue' : 'slate'
  return <SharedKpiCard className={className} icon={emoji} label={label} tone={tone} value={value} />
}

function Field(props: { disabled?: boolean; label: string; onChange: (value: string) => void; type?: string; value: string }) {
  const isNumberField = props.type === 'number'
  return (
    <label className="block text-xs font-semibold text-slate-600" data-manual-required={props.label.trim().endsWith('*') ? 'true' : undefined}>
      {props.label}
      {props.type === 'date' ? (
        <DatePickerInput className="mt-1 h-9 w-full font-normal" value={props.value} onChange={props.onChange} />
      ) : (
        <input
          className={`mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${isNumberField ? '[appearance:textfield] text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' : ''}`}
          disabled={props.disabled}
          inputMode={isNumberField ? 'decimal' : undefined}
          min={isNumberField ? 0 : undefined}
          step={isNumberField ? 'any' : undefined}
          type={props.type ?? 'text'}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </label>
  )
}

function BaseDateDoc<T extends { date: string; docNo?: string | null }>({ setValues, values }: { setValues: (values: T) => void; values: T }) {
  return <>
    <Field label="วันที่" type="date" value={values.date} onChange={(date) => setValues({ ...values, date })} />
  </>
}

function StockSelectField(props: { disabled?: boolean; label: string; onChange: (value: string) => void; options: StockOption[]; placeholder?: string; value: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {props.label}
      <Select
        className="mt-1 h-10 w-full"
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">{props.placeholder ?? 'เลือก'}</option>
        {props.options.filter((option) => option.active !== false).map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}
      </Select>
    </label>
  )
}

function BranchWarehouseFields({ branchId, reference, setBranchId, setWarehouseId, warehouseId }: { branchId: string; reference: Payload['reference']; setBranchId: (value: string) => void; setWarehouseId: (value: string) => void; warehouseId: string }) {
  const activeBranches = reference.branches.filter((option) => option.active !== false)
  const activeWarehouses = reference.warehouses.filter((option) => option.active !== false && (!branchId || option.branchId === branchId))
  return <>
    <label className="block text-xs font-semibold text-slate-600">
      สาขา
      <Select
        className="mt-1 h-10 w-full"
        disabled={!activeBranches.length}
        value={branchId}
        onChange={(event) => setBranchId(event.target.value)}
      >
        <option value="">{activeBranches.length ? 'เลือกสาขา' : 'กำลังโหลดสาขา...'}</option>
        {activeBranches.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}
      </Select>
    </label>
    <label className="block text-xs font-semibold text-slate-600">
      คลัง
      <Select
        className="mt-1 h-10 w-full"
        disabled={!branchId}
        value={warehouseId}
        onChange={(event) => setWarehouseId(event.target.value)}
      >
        <option value="">{branchId ? 'เลือกคลัง' : 'เลือกสาขาก่อน'}</option>
        {activeWarehouses.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </Select>
    </label>
  </>
}

function StatusConvertForm(props: { isSaving: boolean; error?: string | null; onCancel: () => void; onSubmit: (values: StatusConvertFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StatusConvertFormValues>({ branchId: '', date: todayDateInput(), docNo: null, fromStatus: 'RM', lotNo: null, notes: null, productId: '', qty: 0, reason: '', toStatus: 'FG', warehouseId: '', targetWarehouseId: '' })
  const activeBranches = props.reference.branches.filter((option) => option.active !== false)
  const activeWarehouses = props.reference.warehouses.filter((option) => option.active !== false && (!values.branchId || option.branchId === values.branchId))

  const [productStock, setProductStock] = useState<ProductStockPayload | null>(null)
  const [productStockError, setProductStockError] = useState<string | null>(null)
  const [isStockPreviewLoading, setIsStockPreviewLoading] = useState(false)

  useEffect(() => {
    const productCode = props.reference.products.find(p => p.id === values.productId)?.code
    const branchCode = props.reference.branches.find(b => b.id === values.branchId)?.code
    
    if (!branchCode || !productCode) {
      setProductStock(null)
      setProductStockError(null)
      setIsStockPreviewLoading(false)
      return
    }

    let cancelled = false
    async function loadProductStock() {
      setIsStockPreviewLoading(true)
      setProductStockError(null)
      try {
        const params = new URLSearchParams({
          branchCode: branchCode ?? '',
          productCode: productCode ?? '',
          warehouseCode: '',
        })
        const payload = await dailyFetchJson<ProductStockPayload>(`/api/production/orders/product-stock?${params.toString()}`)
        if (!cancelled) setProductStock(payload)
      } catch (caught) {
        if (cancelled) return
        setProductStock(null)
        setProductStockError(caught instanceof Error ? caught.message : 'โหลดสต๊อกสินค้าไม่ได้')
      } finally {
        if (!cancelled) setIsStockPreviewLoading(false)
      }
    }
    void loadProductStock()
    return () => { cancelled = true }
  }, [values.productId, values.branchId, props.reference.products, props.reference.branches])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return props.reference.products
      .filter((option) => option.active !== false)
      .map((option) => ({
        id: option.id,
        label: option.code ? `${option.code} - ${option.name}` : option.name,
        searchText: `${option.code ?? ''} ${option.name}`.toLowerCase(),
      }))
  }, [props.reference.products])

  return <FormShell isSaving={props.isSaving} error={props.error} onCancel={props.onCancel} onSubmit={() => props.onSubmit(values)}>
    <div className="md:col-span-2 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:grid-cols-2">
      <div className="w-full">
        <SearchCombobox
          inputId="status-convert-product-search"
          label="สินค้า *"
          options={productSearchOptions}
          placeholder="พิมพ์รหัส/ชื่อสินค้า..."
          value={values.productId}
          onChange={(productId) => setValues({ ...values, productId })}
        />
      </div>
      {/* สาขา */}
      <label className="block text-xs font-semibold text-slate-600">
        สาขา
        <Select
          className="mt-1.5 h-10 w-full"
          disabled={!activeBranches.length}
          value={values.branchId}
          onChange={(event) => setValues({ ...values, branchId: event.target.value, warehouseId: '', targetWarehouseId: '' })}
        >
          <option value="">{activeBranches.length ? 'เลือกสาขา' : 'กำลังโหลดสาขา...'}</option>
          {activeBranches.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}
        </Select>
      </label>

      {/* คลังต้นทาง */}
      <label className="block text-xs font-semibold text-slate-600">
        คลังต้นทาง
        <Select
          className="mt-1.5 h-10 w-full"
          disabled={!values.branchId}
          value={values.warehouseId}
          onChange={(event) => setValues({ ...values, warehouseId: event.target.value })}
        >
          <option value="">{values.branchId ? 'เลือกคลังต้นทาง' : 'เลือกสาขาก่อน'}</option>
          {activeWarehouses.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
      </label>

      {/* คลังปลายทาง */}
      <label className="block text-xs font-semibold text-slate-600">
        คลังปลายทาง
        <Select
          className="mt-1.5 h-10 w-full"
          disabled={!values.branchId}
          value={values.targetWarehouseId}
          onChange={(event) => setValues({ ...values, targetWarehouseId: event.target.value })}
        >
          <option value="">{values.branchId ? 'เลือกคลังปลายทาง' : 'เลือกสาขาก่อน'}</option>
          {activeWarehouses.filter((option) => option.id !== values.warehouseId).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
      </label>

      <Field label="น้ำหนัก (กก.)" type="number" value={String(values.qty)} onChange={(qty) => setValues({ ...values, qty: Number(qty) })} />
      <div className="md:col-span-2">
        <Field label="เหตุผล *" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
      </div>
      <div className="md:col-span-2">
        <ProductStockPreview
          destinationWarehouseName=""
          error={productStockError}
          isLoading={isStockPreviewLoading}
          isReady={Boolean(values.branchId && values.productId)}
          stock={productStock}
        />
      </div>
    </div>
  </FormShell>
}

function sortCostPoolEntries(left: StockCostPoolOption, right: StockCostPoolOption, method: StockConvertFormValues['allocationMethod']) {
  if (method === 'LIFO') return right.date.localeCompare(left.date) || Number(right.id) - Number(left.id)
  if (method === 'HIGHEST_COST') return right.unitCost - left.unitCost || left.date.localeCompare(right.date) || Number(left.id) - Number(right.id)
  if (method === 'LOWEST_COST') return left.unitCost - right.unitCost || left.date.localeCompare(right.date) || Number(left.id) - Number(right.id)
  return left.date.localeCompare(right.date) || Number(left.id) - Number(right.id)
}

function previewCostPoolAllocation(entries: StockCostPoolOption[], sourceQty: number) {
  let remainingQty = Math.max(0, Number(sourceQty) || 0)
  const rows: Array<{ entry: StockCostPoolOption; qty: number }> = []
  for (const entry of entries) {
    if (remainingQty <= 0) break
    const qty = Math.min(entry.availableQty, remainingQty)
    if (qty > 0) rows.push({ entry, qty })
    remainingQty -= qty
  }
  return { rows, shortageQty: Math.max(0, remainingQty) }
}

function CostPoolPreview({
  entries,
  manualAllocations,
  method,
  onManualChange,
  previewRows,
  shortageQty,
  sourceQty,
}: {
  entries: StockCostPoolOption[]
  manualAllocations: StockConvertFormValues['manualAllocations']
  method: StockConvertFormValues['allocationMethod']
  onManualChange: (poolEntryId: string, qty: number) => void
  previewRows: Array<{ entry: StockCostPoolOption; qty: number }>
  shortageQty: number
  sourceQty: number
}) {
  const selectedById = new Map(manualAllocations.map((line) => [line.poolEntryId, line.qty]))
  const totalQty = previewRows.reduce((sum, line) => sum + line.qty, 0)
  const totalValue = previewRows.reduce((sum, line) => sum + line.qty * line.entry.unitCost, 0)
  return (
    <div className="rounded-xl border border-red-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-red-700">Cost Pool Lots</div>
        <div className="text-xs text-slate-500">
          เลือก {formatMoney(totalQty)} / {formatMoney(sourceQty || 0)} กก. · {formatMoney(totalValue)} ฿
        </div>
      </div>
      {shortageQty > 0 ? <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">Cost Pool ไม่พอ ขาด {formatMoney(shortageQty)} กก.</div> : null}
      {method === 'MANUAL' ? (
        <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100">
          <table className="ns-table w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-right">Available</th>
                <th className="p-2 text-right">฿/กก.</th>
                <th className="p-2 text-right">ตัด</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <div className="font-semibold text-slate-700">{entry.sourceRefNo ?? entry.sourceType}</div>
                    <div className="text-slate-500">{entry.date}{entry.lotNo ? ` · Lot ${entry.lotNo}` : ''}</div>
                  </td>
                  <td className="p-3 text-right font-mono">{formatMoney(entry.availableQty)}</td>
                  <td className="p-3 text-right font-mono">{formatMoney(entry.unitCost)}</td>
                  <td className="p-3 text-right">
                    <input
                      className="h-9 w-24 rounded-md border border-slate-300 px-2 text-right font-mono"
                      min="0"
                      step="0.001"
                      type="number"
                      value={String(selectedById.get(entry.id) ?? 0)}
                      onChange={(event) => onManualChange(entry.id, Math.min(entry.availableQty, Math.max(0, Number(event.target.value) || 0)))}
                    />
                  </td>
                </tr>
              ))}
              {!entries.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={4}>ไม่พบ Cost Pool ที่ตรงกับ source</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-md border border-slate-100">
          <table className="ns-table w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-right">ตัด</th>
                <th className="p-2 text-right">฿/กก.</th>
                <th className="p-2 text-right">มูลค่า</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((line) => (
                <tr key={line.entry.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <div className="font-semibold text-slate-700">{line.entry.sourceRefNo ?? line.entry.sourceType}</div>
                    <div className="text-slate-500">{line.entry.date}{line.entry.lotNo ? ` · Lot ${line.entry.lotNo}` : ''}</div>
                  </td>
                  <td className="p-3 text-right font-mono">{formatMoney(line.qty)}</td>
                  <td className="p-3 text-right font-mono">{formatMoney(line.entry.unitCost)}</td>
                  <td className="p-3 text-right font-mono">{formatMoney(line.qty * line.entry.unitCost)}</td>
                </tr>
              ))}
              {!previewRows.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={4}>เลือกสินค้า/สาขา/คลังและน้ำหนักเพื่อ preview Cost Pool</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ConvertForm(props: { isSaving: boolean; error?: string | null; onCancel: () => void; onSubmit: (values: StockConvertFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StockConvertFormValues>({
    allocationMethod: 'FIFO',
    branchId: '',
    date: todayDateInput(),
    docNo: null,
    lotNo: null,
    manualAllocations: [],
    notes: null,
    reason: null,
    sourceProductId: '',
    sourceQty: 0,
    targetCostPolicy: 'SOURCE_MATCHED',
    targetLotNo: null,
    targetProductId: '',
    targetQty: 0,
    targetUnitCost: null,
    targetUnitCostReason: null,
    warehouseId: '',
  })
  const [productStock, setProductStock] = useState<ProductStockPayload | null>(null)
  const [productStockError, setProductStockError] = useState<string | null>(null)
  const [isStockPreviewLoading, setIsStockPreviewLoading] = useState(false)
  const sourceProduct = props.reference.products.find((item) => item.id === values.sourceProductId)
  const lossQty = Math.max(0, Number(values.sourceQty) - Number(values.targetQty))
  const yieldPct = Number(values.sourceQty) > 0 ? (Number(values.targetQty) / Number(values.sourceQty)) * 100 : 0
  const usesCostPool = isCostPoolEligibleMetalGroup(sourceProduct?.metalGroup)
  const sourceCostPoolEntries = useMemo(() => {
    const entries = props.reference.costPoolEntries ?? []
    return entries
      .filter((entry) => !values.branchId || entry.branchId === values.branchId)
      .filter((entry) => !values.sourceProductId || entry.productId === values.sourceProductId)
      .filter((entry) => !values.lotNo || entry.lotNo === values.lotNo)
      .filter((entry) => entry.availableQty > 0)
      .sort((left, right) => sortCostPoolEntries(left, right, values.allocationMethod))
  }, [props.reference.costPoolEntries, values.allocationMethod, values.branchId, values.lotNo, values.sourceProductId])
  const autoPreview = useMemo(() => previewCostPoolAllocation(sourceCostPoolEntries, Number(values.sourceQty)), [sourceCostPoolEntries, values.sourceQty])
  const manualTotalQty = values.manualAllocations.reduce((sum, line) => sum + Number(line.qty || 0), 0)
  const costPreviewRows = values.allocationMethod === 'MANUAL'
    ? values.manualAllocations
        .map((line) => {
          const pool = sourceCostPoolEntries.find((entry) => entry.id === line.poolEntryId)
          return pool ? { entry: pool, qty: Number(line.qty || 0) } : null
        })
        .filter((line): line is { entry: StockCostPoolOption; qty: number } => Boolean(line))
    : autoPreview.rows
  const previewValue = costPreviewRows.reduce((sum, line) => sum + line.qty * line.entry.unitCost, 0)
  const previewUnitCost = usesCostPool && Number(values.sourceQty) > 0 ? previewValue / Number(values.sourceQty) : null
  const targetUnitCost = values.targetCostPolicy === 'CUSTOM_UNIT_COST'
    ? Number(values.targetUnitCost || 0)
    : previewUnitCost
  const targetValue = targetUnitCost === null ? null : Number(values.targetQty || 0) * targetUnitCost
  const costVariance = usesCostPool && targetValue !== null ? targetValue - previewValue : null

  function updateManualAllocation(poolEntryId: string, qty: number) {
    const existing = values.manualAllocations.filter((line) => line.poolEntryId !== poolEntryId)
    setValues({ ...values, manualAllocations: qty > 0 ? [...existing, { poolEntryId, qty }] : existing })
  }

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return props.reference.products
      .filter((option) => option.active !== false)
      .map((option) => ({
        id: option.id,
        label: option.code ? `${option.code} - ${option.name}` : option.name,
        searchText: `${option.code ?? ''} ${option.name}`.toLowerCase(),
      }))
  }, [props.reference.products])

  useEffect(() => {
    const productCode = props.reference.products.find((product) => product.id === values.sourceProductId)?.code
    const branchCode = props.reference.branches.find((branch) => branch.id === values.branchId)?.code

    if (!branchCode || !productCode) {
      setProductStock(null)
      setProductStockError(null)
      setIsStockPreviewLoading(false)
      return
    }

    let cancelled = false
    async function loadProductStock() {
      setIsStockPreviewLoading(true)
      setProductStockError(null)
      try {
        const params = new URLSearchParams({
          branchCode: branchCode ?? '',
          productCode: productCode ?? '',
          warehouseCode: '',
        })
        const payload = await dailyFetchJson<ProductStockPayload>(`/api/production/orders/product-stock?${params.toString()}`)
        if (!cancelled) setProductStock(payload)
      } catch (caught) {
        if (cancelled) return
        setProductStock(null)
        setProductStockError(caught instanceof Error ? caught.message : 'โหลดสต๊อกสินค้าไม่ได้')
      } finally {
        if (!cancelled) setIsStockPreviewLoading(false)
      }
    }

    void loadProductStock()
    return () => { cancelled = true }
  }, [props.reference.branches, props.reference.products, values.branchId, values.sourceProductId])

  return <FormShell isSaving={props.isSaving} error={props.error} onCancel={props.onCancel} onSubmit={() => props.onSubmit(values)}>
    <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid gap-4 md:grid-cols-2 animate-fade-in">
      <BaseDateDoc values={values} setValues={setValues} />
      <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
    </div>
    <div className="rounded-md border border-red-200 bg-red-50/40 p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-red-700">Source (ออก)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="w-full">
          <SearchCombobox
            inputId="stock-convert-source-product"
            label="สินค้าต้นทาง *"
            options={productSearchOptions}
            placeholder="พิมพ์รหัส/ชื่อสินค้า..."
            value={values.sourceProductId}
            onChange={(sourceProductId) => setValues({ ...values, sourceProductId })}
          />
        </div>
        <Field label="น้ำหนักต้นทาง (กก.)" type="number" value={String(values.sourceQty)} onChange={(sourceQty) => setValues({ ...values, sourceQty: Number(sourceQty) })} />
        {usesCostPool ? (
          <>
            <label className="block text-sm font-medium md:col-span-2">วิธีตัดต้นทุน
              <Select
                className="mt-1.5 h-10 w-full"
                value={values.allocationMethod}
                onChange={(event) => setValues({ ...values, allocationMethod: event.target.value as StockConvertFormValues['allocationMethod'], manualAllocations: [] })}
              >
                <option value="FIFO">FIFO (มาก่อน-ออกก่อน)</option>
                <option value="LIFO">LIFO (มาหลัง-ออกก่อน)</option>
                <option value="HIGHEST_COST">Highest Cost (ต้นทุนสูงก่อน)</option>
                <option value="LOWEST_COST">Lowest Cost (ต้นทุนต่ำก่อน)</option>
                <option value="MANUAL">Manual (เลือก lot เอง)</option>
              </Select>
            </label>
            <div className="md:col-span-2">
              <CostPoolPreview
                entries={sourceCostPoolEntries}
                manualAllocations={values.manualAllocations}
                method={values.allocationMethod}
                previewRows={costPreviewRows}
                shortageQty={values.allocationMethod === 'MANUAL' ? Math.max(0, Number(values.sourceQty) - manualTotalQty) : autoPreview.shortageQty}
                sourceQty={Number(values.sourceQty)}
                onManualChange={updateManualAllocation}
              />
            </div>
          </>
        ) : null}
        <div className="md:col-span-2">
          <ProductStockPreview
            destinationWarehouseName=""
            error={productStockError}
            heading="ข้อมูล Stock ปัจจุบันของสินค้าที่จะปรับเกรดสินค้า"
            isLoading={isStockPreviewLoading}
            isReady={Boolean(values.branchId && values.sourceProductId)}
            stock={productStock}
          />
        </div>
      </div>
    </div>
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-emerald-700">Target (เข้า)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="w-full">
          <SearchCombobox
            inputId="stock-convert-target-product"
            label="สินค้าปลายทาง *"
            options={productSearchOptions}
            placeholder="พิมพ์รหัส/ชื่อสินค้า..."
            value={values.targetProductId}
            onChange={(targetProductId) => setValues({ ...values, targetProductId })}
          />
        </div>
        <Field label="น้ำหนักปลายทาง (กก.)" type="number" value={String(values.targetQty)} onChange={(targetQty) => setValues({ ...values, targetQty: Number(targetQty) })} />
        <label className="block text-sm font-medium md:col-span-2">Target Cost Policy
          <Select
            className="mt-1.5 h-10 w-full"
            value={values.targetCostPolicy}
            onChange={(event) => setValues({ ...values, targetCostPolicy: event.target.value as StockConvertFormValues['targetCostPolicy'], targetUnitCost: null, targetUnitCostReason: null })}
          >
            <option value="SOURCE_MATCHED">Source matched cost (default)</option>
            <option value="CUSTOM_UNIT_COST">กำหนดต้นทุนต่อหน่วยเอง</option>
          </Select>
        </label>
        {values.targetCostPolicy === 'CUSTOM_UNIT_COST' ? (
          <>
            <Field label="Custom target ฿/กก." type="number" value={String(values.targetUnitCost ?? '')} onChange={(targetUnitCostValue) => setValues({ ...values, targetUnitCost: Number(targetUnitCostValue) })} />
            <Field label="เหตุผล override ต้นทุน" value={values.targetUnitCostReason ?? ''} onChange={(targetUnitCostReason) => setValues({ ...values, targetUnitCostReason })} />
          </>
        ) : null}
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-slate-700">Loss / Yield / Cost Flow</div>
      <div className="grid gap-4 md:grid-cols-3">
        <ReadOnlyBox label="Loss" value={`${formatMoney(lossQty)} กก.`} />
        <ReadOnlyBox label="Yield" value={`${formatMoney(yieldPct)}%`} />
        <ReadOnlyBox label="Allocation" value={usesCostPool ? `${values.allocationMethod} · ${formatMoney(previewUnitCost ?? 0)} ฿/กก.` : 'ไม่ใช้ Cost Pool'} />
        <ReadOnlyBox label="Target Cost" value={targetUnitCost === null ? 'คำนวณจากต้นทุน stock ตอนบันทึก' : `${values.targetCostPolicy} · ${formatMoney(targetUnitCost)} ฿/กก.`} />
        <ReadOnlyBox label="Target Value" value={targetValue === null ? '-' : formatMoney(targetValue)} />
        <ReadOnlyBox label="Cost Variance" value={costVariance === null ? '-' : formatMoney(costVariance)} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="เหตุผล" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
        <Field label="หมายเหตุ" value={values.notes ?? ''} onChange={(notes) => setValues({ ...values, notes })} />
      </div>
    </div>
  </FormShell>
}

function AdjustForm(props: { isSaving: boolean; error?: string | null; onCancel: () => void; onSubmit: (values: StockAdjustFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StockAdjustFormValues>({ branchId: '', countedQty: 0, date: todayDateInput(), docNo: null, lotNo: null, productId: '', reason: stockAdjustReasonOptions[0], remark: null, status: 'RM', systemQty: 0, warehouseId: '' })
  const [snapshot, setSnapshot] = useState<StockAdjustSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false)
  const reasonOptions = props.reference ? stockAdjustReasonOptions : stockAdjustReasonOptions
  const snapshotReady = Boolean(values.branchId && values.warehouseId && values.productId && values.status && values.date)

  useEffect(() => {
    if (!snapshotReady) {
      setSnapshot(null)
      setSnapshotError(null)
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams({
      branchId: values.branchId,
      countedQty: String(values.countedQty),
      date: values.date,
      productId: values.productId,
      snapshot: '1',
      status: values.status,
      warehouseId: values.warehouseId,
    })
    if (values.lotNo) params.set('lotNo', values.lotNo)
    setIsSnapshotLoading(true)
    setSnapshotError(null)
    dailyFetchJson<{ snapshot: StockAdjustSnapshot }>(`/api/stock/adjust?${params.toString()}`, { signal: controller.signal })
      .then((payload) => {
        setSnapshot(payload.snapshot)
        setValues((currentValues) => ({ ...currentValues, systemQty: payload.snapshot.systemQty, totalValue: payload.snapshot.totalValue, unitPricePerKg: payload.snapshot.unitPricePerKg }))
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setSnapshot(null)
        setSnapshotError(caught instanceof Error ? caught.message : 'โหลด stock snapshot ไม่ได้')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSnapshotLoading(false)
      })
    return () => controller.abort()
  }, [snapshotReady, values.branchId, values.countedQty, values.date, values.lotNo, values.productId, values.status, values.warehouseId])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return props.reference.products
      .filter((option) => option.active !== false)
      .map((option) => ({
        id: option.id,
        label: option.code ? `${option.code} - ${option.name}` : option.name,
        searchText: `${option.code ?? ''} ${option.name}`.toLowerCase(),
      }))
  }, [props.reference.products])

  const totalValue = snapshot?.totalValue ?? values.totalValue ?? 0
  const diffQty = snapshot?.diffQty ?? 0

  return <FormShell isSaving={props.isSaving} error={props.error} onCancel={props.onCancel} onSubmit={() => props.onSubmit(values)}>
    <div className="grid gap-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm md:col-span-2 md:grid-cols-2">
      <div className="md:col-span-2 border-b border-slate-100 pb-2">
        <h4 className="text-sm font-bold text-slate-800">ข้อมูลการนับจริง</h4>
      </div>
      <BaseDateDoc values={values} setValues={setValues} />
      <div className="w-full">
        <SearchCombobox
          inputId="stock-adjust-product"
          label="สินค้า *"
          options={productSearchOptions}
          placeholder="พิมพ์รหัส/ชื่อสินค้า..."
          value={values.productId}
          onChange={(productId) => setValues({ ...values, productId })}
        />
      </div>
      <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
      <Field label="นับจริง" type="number" value={String(values.countedQty)} onChange={(countedQty) => setValues({ ...values, countedQty: Number(countedQty) })} />

      <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-700">Stock Snapshot</div>
          <div className={`rounded-md px-2 py-1 text-xs font-semibold ${diffQty < 0 ? 'bg-red-50 text-red-700' : diffQty > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            ส่วนต่าง {formatMoney(diffQty)} กก.
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <ReadOnlyBox label="ยอดในระบบ" value={isSnapshotLoading ? 'กำลังโหลด' : `${formatMoney(snapshot?.systemQty ?? values.systemQty)} กก.`} />
          <ReadOnlyBox label="จองไว้" value={`${formatMoney(snapshot?.onHoldQty ?? 0)} กก.`} />
          <ReadOnlyBox label="พร้อมใช้" value={`${formatMoney(snapshot?.readyQty ?? 0)} กก.`} />
          <ReadOnlyBox label="ราคา/กก." value={formatMoney(snapshot?.unitPricePerKg ?? values.unitPricePerKg ?? 0)} />
          <ReadOnlyBox label="มูลค่ารวม" value={formatMoney(totalValue)} valueClassName={totalValue < 0 ? 'text-red-600' : totalValue > 0 ? 'text-emerald-700' : 'text-slate-800'} />
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {snapshotError ? <span className="font-semibold text-red-700">{snapshotError}</span> : <>แหล่งราคา: {snapshot?.priceSource ?? '-'}</>}
        </div>
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-semibold text-slate-600">
          เหตุผล <span className="text-red-600">*</span>
          <Select className="mt-1 h-10 w-full" value={values.reason} onChange={(event) => setValues({ ...values, reason: event.target.value as StockAdjustFormValues['reason'] })}>
            {reasonOptions.map((reason) => <option key={reason} value={reason}>{stockAdjustReasonLabel(reason)}</option>)}
          </Select>
        </label>
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-semibold text-slate-600">
          หมายเหตุ
          <textarea
            className="mt-1 min-h-20 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-slate-900"
            value={values.remark ?? ''}
            onChange={(event) => setValues({ ...values, remark: event.target.value })}
          />
        </label>
      </div>
    </div>
  </FormShell>
}

function ReadOnlyBox({ label, value, valueClassName = 'text-slate-800' }: { label: string; value: string; valueClassName?: string }) {
  return <div className="rounded-md border border-slate-200 bg-white px-3 py-2"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-sm font-semibold ${valueClassName}`}>{value}</div></div>
}

function FormShell({ children, error, onSubmit }: { children: React.ReactNode; isSaving: boolean; error?: string | null; onCancel: () => void; onSubmit: () => void }) {
  return (
    <form className="flex-1 flex flex-col overflow-hidden" id="stock-operation-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 sm:p-5">
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 whitespace-pre-line">
            {error}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
      </div>
    </form>
  )
}

function statusOptions(): StockOption[] {
  return [{ active: true, id: 'RM', name: 'RM' }, { active: true, id: 'FG', name: 'FG' }]
}

interface ProductStockPayload {
  productCode: string
  productName: string
  branchCode: string
  rows: Array<{
    warehouseCode: string
    warehouseName: string
    status: string
    qty: number
    avgCost: number
    value: number
  }>
}

function ProductStockPreview({
  destinationWarehouseName,
  error,
  heading = 'ข้อมูล Stock ปัจจุบันของสินค้า',
  isLoading,
  isReady,
  stock,
}: {
  destinationWarehouseName: string
  error: string | null
  heading?: string
  isLoading: boolean
  isReady: boolean
  stock: ProductStockPayload | null
}) {
  if (!isReady) return null
  if (isLoading) return <div className="rounded-md bg-slate-50 p-4 text-center text-xs text-slate-500">กำลังดึงข้อมูล Stock...</div>
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-semibold">โหลดสต๊อกล้มเหลว: {error}</div>
  if (!stock) return null

  return (
    <div className="rounded-md border border-indigo-100 bg-indigo-50/50 p-4 space-y-2 text-left">
      <h5 className="font-bold text-indigo-800 text-xs flex items-center gap-1.5">
        📦 {heading}: <span className="font-normal text-slate-600">{stock.productName} ({stock.productCode})</span>
      </h5>
      
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-md bg-white border border-indigo-100">
        <table className="ns-table w-full text-xs">
          <thead className="bg-indigo-50 text-indigo-700">
            <tr>
              <th className="p-2 text-left">สาขา / คลัง</th>
              <th className="p-2 text-center">ประเภท</th>
              <th className="p-2 text-right">จำนวนคงเหลือ (กก.)</th>
              <th className="p-2 text-right">ราคาเฉลี่ย/กก.</th>
              <th className="p-2 text-right">รวมมูลค่า</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-50/50">
            {stock.rows.map((row, index) => (
              <tr key={index} className="hover:bg-indigo-50/10">
                <td className="p-3 font-medium text-slate-700">{stock.branchCode} / {row.warehouseCode || destinationWarehouseName}</td>
                <td className="p-3 text-center"><span className="rounded bg-slate-100 px-1 py-0.5 text-xs font-bold text-slate-600">{row.status}</span></td>
                <td className="p-3 text-right font-bold text-slate-900 tabular-nums">{formatMoney(row.qty)}</td>
                <td className="p-3 text-right text-slate-500 tabular-nums">{formatMoney(row.avgCost)}</td>
                <td className="p-3 text-right font-bold text-indigo-700 tabular-nums">{formatMoney(row.value)}</td>
              </tr>
            ))}
            {stock.rows.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-slate-400 font-semibold" colSpan={5}>
                  ไม่มีของในคลังนี้ (เป็นศูนย์)
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block md:hidden divide-y divide-indigo-100/60 bg-white rounded-md border border-indigo-100 overflow-hidden shadow-sm">
        {stock.rows.map((row, index) => (
          <div key={index} className="p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-700">{stock.branchCode} / {row.warehouseCode || destinationWarehouseName}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600">{row.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center py-1.5 bg-indigo-50/30 rounded-md">
              <div>
                <span className="text-xs text-slate-400 block">คงเหลือ (กก.)</span>
                <span className="font-bold text-slate-900 tabular-nums">{formatMoney(row.qty)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">เฉลี่ย/กก.</span>
                <span className="font-medium text-slate-500 tabular-nums">{formatMoney(row.avgCost)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">รวมมูลค่า</span>
                <span className="font-bold text-indigo-700 tabular-nums">{formatMoney(row.value)}</span>
              </div>
            </div>
          </div>
        ))}
        {stock.rows.length === 0 ? (
          <div className="p-4 text-center text-slate-400 font-semibold text-xs">
            ไม่มีของในคลังนี้ (เป็นศูนย์)
          </div>
        ) : null}
      </div>
    </div>
  )
}
