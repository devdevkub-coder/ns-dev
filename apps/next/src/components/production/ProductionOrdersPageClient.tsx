'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { ApiError } from '@/lib/api-client'
import { formatDateDisplay, sanitizeDecimalInput } from '@/lib/format'
import { ArrowDownUp, Download, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  applyMobileFilterDraft,
  createMobileFilterDraft,
  toggleProductionOrderStatus,
  updateMobileFilterDraft,
  type ProductionOrderMobileFilterState,
} from './production-orders-mobile-filter-state'

type Category = { availableForSale: boolean; code: string; name: string; stockEffect: string }
type ProductionMovementRow = {
  categoryCode?: string
  createdAt?: string | null
  date: string
  docNo: string
  id?: string
  lotNo: string
  outputType?: string
  productCode: string
  productName: string
  qty: number
  returnedQty?: number
  returnableQty?: number
  sourceWipQty?: number
  sourceWipAllocations?: Array<{ productCode: string; productName: string; qty: number; stockCategory: string; warehouseName: string }>
  notes?: string | null
  status: string
  stockStatus?: string
  totalCost: number
  unitCost: number
  warehouseCode: string
  warehouseName: string
}
type ProductionInputReturnGroup = ProductionMovementRow & {
  inputIds: string[]
  key: string
  wipAvgCost: number
}

function groupProductionInputReturnRows(rows: ProductionMovementRow[], wipGroups: ProductionWipSummaryGroup[] = []) {
  const groups = new Map<string, ProductionInputReturnGroup>()
  const wipCostByKey = new Map(wipGroups.map((group) => [`${group.productCode}|${group.stockCategory}|${group.warehouseCode}`, group.avgCost]))
  for (const row of rows) {
    if (!row.id) continue
    const key = `${row.productCode}|${row.stockStatus ?? ''}|${row.warehouseCode}`
    const current = groups.get(key)
    if (current) {
      current.inputIds.push(row.id)
      current.qty += row.qty
      current.returnedQty = (current.returnedQty ?? 0) + (row.returnedQty ?? 0)
      current.returnableQty = (current.returnableQty ?? 0) + (row.returnableQty ?? Math.max(0, row.qty - (row.returnedQty ?? 0)))
      continue
    }
    groups.set(key, {
      ...row,
      inputIds: [row.id],
      key,
      returnableQty: row.returnableQty ?? Math.max(0, row.qty - (row.returnedQty ?? 0)),
      wipAvgCost: wipCostByKey.get(key) ?? 0,
    })
  }
  return [...groups.values()]
}
type ProductionOrderHistoryRow = {
  action: string
  averageCost: number | null
  createdAt: string
  createdBy: string | null
  createdByName: string
  details: Array<{ label: string; value: string }>
  documentNo: string | null
  fromStatus: string | null
  lines: Array<{ productCode: string; productName: string; stockCategory: string; qty: number; unitCost: number; totalCost: number; warehouseName: string }>
  sourceWipLines: Array<{ productCode: string; productName: string; stockCategory: string; qty: number; unitCost: number; totalCost: number; warehouseName: string }>
  note: string | null
  lossQty: number | null
  outputQty: number | null
  productionCost: number | null
  reverseCost: number | null
  reverseQty: number | null
  reversalDocNo: string | null
  sourceWipQty: number | null
  stockReceiptValue: number | null
  totalCost: number | null
  totalQty: number | null
  toStatus: string
  warehouseNames: string[] | null
}
type ProductionWipSummary = {
  avgCost: number
  consumedWipQty: number
  inputQty: number
  groups: ProductionWipSummaryGroup[]
  wipQty: number
}
type ProductionWipSummaryGroup = {
  avgCost: number
  consumedWipQty: number
  docNos: string[]
  inputQty: number
  productCode: string
  productName: string
  stockCategory: string
  warehouseCode: string
  warehouseName: string
  wipQty: number
  wipValue: number
}
type ProductionOrderRow = {
  branchCode?: string
  branchName: string
  closedAt: string | null
  createdAt: string | null
  date: string
  startDate: string | null
  docNo: string
  id: string
  inputCost: number
  inputCount: number
  inputQty: number
  inputs: ProductionMovementRow[]
  history: ProductionOrderHistoryRow[]
  machineName?: string
  machineType?: string
  notes: string
  outputCategories: Array<{ code: string; name: string }>
  outputCount: number
  outputQty: number
  outputValue: number
  outputs: ProductionMovementRow[]
  productCode: string
  productId: string
  productName: string
  productionLineName?: string
  qtyPlanned: number
  status: string
  variance: number
  warehouseName: string
  wipSummary?: ProductionWipSummary
  wipQty: number
  wipValue: number
}
type ProductionOrdersPayload = {
  categories: Category[]
  filters: { branches: Array<{ code: string; name: string }> }
  page: number
  pageSize: number
  rows: ProductionOrderRow[]
  summary: { inputCost: number; inputQty: number; outputQty: number; outputValue: number; qtyPlanned: number; total: number; totalPages: number; variance: number; wipQty: number }
}
type Option = { code: string; id: string; name: string }
type MachineOption = Option & { type?: string | null }
type WarehouseOption = Option & { branchCode: string | null; type: string | null }
type ProductionOrderOptions = {
  branches: Option[]
  machines: MachineOption[]
  productionLines: Option[]
  productionTypes: string[]
  products: Option[]
  warehouses: WarehouseOption[]
}
type WipPayload = { consumedWipQty: number; docNo: string; inputCost: number; inputQty: number; outputQty: number; wipQty: number }
type ProductStockPayload = {
  branchCode: string
  productCode: string
  productName: string
  rows: Array<{ avgCost: number; qty: number; status: string; value: number; warehouseCode?: string; warehouseName?: string }>
  warehouseCode: string
}
type ProductionInputDraft = {
  id: string
  lotNo: string
  netQty: string
  productCode: string
  sourceWarehouseCode: string
  stockStatus: 'RM' | 'FG'
}
type ProductionOutputWipDraft = {
  id: string
  qty: string
  sourceKey: string
}
type ProductionOutputDraft = {
  categoryCode: 'FG' | 'RM'
  destinationWarehouseCode: string
  id: string
  lotNo: string
  lossQty: string
  netQty: string
  productCode: string
}
type ProductionOutputDraftPayload = {
  outputDrafts: ProductionOutputDraft[]
  outputForm: { date: string; notes: string }
  outputWipDrafts: ProductionOutputWipDraft[]
}

const emptyOptions: ProductionOrderOptions = { branches: [], machines: [], productionLines: [], productionTypes: [], products: [], warehouses: [] }
const pageSizeOptions = [10, 25]
const noMachineCode = '__none_machine__'
const noProductionLineCode = '__none_production_line__'
const stockCategoryLabel = (value?: string) => value === 'FG' ? 'FG (สินค้าสำเร็จรูป)' : value === 'RM' ? 'RM (วัตถุดิบ)' : value || '-'
const quantityInputClass = 'h-10 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
function formatMovementDateTime(value?: string | null) {
  if (!value) return '-'
  try {
    const date = new Date(value)
    return new Intl.DateTimeFormat('th-TH', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit', timeZone: 'Asia/Bangkok', year: 'numeric' }).format(date)
  } catch {
    return value
  }
}
function formatMovementDateTimeParts(value?: string | null) {
  if (!value) return { date: '-', time: '' }
  try {
    const parsed = new Date(value)
    const date = new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Bangkok', year: 'numeric' }).format(parsed)
    const time = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok', hour12: false }).format(parsed)
    return { date, time }
  } catch {
    return { date: value, time: '' }
  }
}
function sanitizeQuantityInput(event: React.FormEvent<HTMLInputElement>) {
  const sanitized = sanitizeDecimalInput(event.currentTarget.value, 2)
  if (sanitized !== event.currentTarget.value) event.currentTarget.value = sanitized
}
function formatQuantityInputOnBlur(event: React.FocusEvent<HTMLInputElement>) {
  const value = sanitizeDecimalInput(event.currentTarget.value, 2)
  if (!value) return
  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) event.currentTarget.value = numericValue.toFixed(2)
}
function preventQuantityExponent(event: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault()
}
const statusOptions = ['', 'Open', 'In Production', 'Partially Completed', 'Completed', 'Cancelled']
const sortOptions = [
  { label: 'เลขที่ใบสั่งผลิต', value: 'docNo' },
  { label: 'วันที่เริ่มผลิต', value: 'startDate' },
  { label: 'วันที่สร้างรายการ', value: 'createdAt' },
  { label: 'ปริมาณเบิก', value: 'inputQty' },
  { label: 'WIP คงเหลือ', value: 'wipQty' },
  { label: 'ปริมาณผลิต', value: 'outputQty' },
  { label: 'อัตราผลที่ได้', value: 'yield' },
  { label: 'สถานะผลิต', value: 'status' },
]

type ProductionOrderColumnKey = 'docNo' | 'startDate' | 'createdAt' | 'branch' | 'productName' | 'machine' | 'warehouseName' | 'inputQty' | 'wipQty' | 'outputQty' | 'yield' | 'status' | 'action'

const productionOrderColumns: Array<ResizableColumnDefinition<ProductionOrderColumnKey>> = [
  { key: 'docNo', defaultWidth: 130, minWidth: 100 },
  { key: 'startDate', defaultWidth: 140, minWidth: 140 },
  { key: 'createdAt', defaultWidth: 140, minWidth: 140 },
  { key: 'branch', defaultWidth: 110, minWidth: 90 },
  { key: 'productName', defaultWidth: 170, minWidth: 130 },
  { key: 'machine', defaultWidth: 130, minWidth: 100 },
  { key: 'warehouseName', defaultWidth: 130, minWidth: 100 },
  { key: 'inputQty', defaultWidth: 120, minWidth: 95 },
  { key: 'wipQty', defaultWidth: 160, minWidth: 140 },
  { key: 'outputQty', defaultWidth: 120, minWidth: 95 },
  { key: 'yield', defaultWidth: 120, minWidth: 105 },
  { key: 'status', defaultWidth: 110, minWidth: 104, maxWidth: 144 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]
const productStockColumnCount = 4
const activeSegmentClass = 'border-slate-500 bg-slate-600 text-white'
const inactiveSegmentClass = 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'

function MatchButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const className = active ? activeSegmentClass : inactiveSegmentClass
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${className}`} type="button" onClick={onClick}>{label}</button>
}

function formatDateLocal(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function statusLabel(status: string) {
  if (status === 'Open') return 'ยังไม่เริ่ม'
  if (status === 'In Production') return 'กำลังผลิต'
  if (status === 'Partially Completed') return 'เสร็จบางส่วน'
  if (status === 'Completed') return 'เสร็จสิ้น'
  if (status === 'Cancelled') return 'ยกเลิก'
  return status || 'ทุกสถานะ'
}

function productionHistoryActionLabel(action: string) {
  if (action === 'created') return 'สร้างใบสั่งผลิต'
  if (action === 'input_created') return 'เบิกวัตถุดิบ'
  if (action === 'input_returned') return 'คืนวัตถุดิบ'
  if (action === 'output_created') return 'บันทึกผลผลิต'
  if (action === 'output_reversed') return 'ยกเลิกผลผลิต'
  if (action === 'completed') return 'จบงานผลิต'
  if (action === 'cancelled') return 'ยกเลิกใบสั่งผลิต'
  return action
}

function productionHistoryToneClass(status: string) {
  if (status === 'Completed') return 'bg-emerald-500'
  if (status === 'Cancelled') return 'bg-red-500'
  if (status === 'In Production' || status === 'Partially Completed') return 'bg-blue-500'
  return 'bg-slate-400'
}

export function ProductionOrdersPageClient() {
  const [data, setData] = useState<ProductionOrdersPayload | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'detail' | null>(null)
  const [mobileFilterDraft, setMobileFilterDraft] = useState<ProductionOrderMobileFilterState | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [selectedRow, setSelectedRow] = useState<ProductionOrderRow | null>(null)
  const [sort, setSort] = useState('docNo')
  const [statuses, setStatuses] = useState<string[]>([])

  const columnResize = useResizableColumns('production.orders.v8', productionOrderColumns)

  function toggleSort(nextSortBy: string) {
    setPage(1)
    if (sort === nextSortBy) {
      setDirection((current) => current === 'desc' ? 'asc' : 'desc')
      return
    }
    setSort(nextSortBy)
    setDirection('desc')
  }

  const isAllPeriod = !dateFrom && !dateTo
  const isTodayPeriod = dateFrom === todayDateInput() && dateTo === todayDateInput()

  const expectedWeekStart = useMemo(() => {
    const today = todayDateInput()
    const d = new Date(`${today}T00:00:00`)
    d.setDate(d.getDate() - 6)
    return formatDateLocal(d)
  }, [])

  const expectedMonthStart = useMemo(() => {
    const today = todayDateInput()
    const d = new Date(`${today}T00:00:00`)
    d.setDate(1)
    return formatDateLocal(d)
  }, [])

  const isWeekPeriod = dateFrom === expectedWeekStart && dateTo === todayDateInput()
  const isMonthPeriod = dateFrom === expectedMonthStart && dateTo === todayDateInput()
  const mobileDateFrom = mobileFilterDraft?.dateFrom ?? dateFrom
  const mobileDateTo = mobileFilterDraft?.dateTo ?? dateTo
  const mobileDirection = mobileFilterDraft?.direction ?? direction
  const mobileSort = mobileFilterDraft?.sort ?? sort
  const mobileStatuses = mobileFilterDraft?.statuses ?? statuses
  const isMobileAllPeriod = !mobileDateFrom && !mobileDateTo
  const isMobileTodayPeriod = mobileDateFrom === todayDateInput() && mobileDateTo === todayDateInput()
  const isMobileWeekPeriod = mobileDateFrom === expectedWeekStart && mobileDateTo === todayDateInput()
  const isMobileMonthPeriod = mobileDateFrom === expectedMonthStart && mobileDateTo === todayDateInput()

  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const latestLoadRequestRef = useRef(0)

  const loadData = useCallback(async (pageOverride = page) => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ direction, page: String(pageOverride), pageSize: String(pageSize), sort })
      if (branchCode) params.set('branchCode', branchCode)
      if (search.trim()) params.set('search', search.trim())
      statuses.forEach((status) => params.append('status', status))
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const payload = await dailyFetchJson<ProductionOrdersPayload>(`/api/production/orders?${params.toString()}`)
      if (requestId !== latestLoadRequestRef.current) return
      setData(payload)
    } catch (caught) {
      if (requestId !== latestLoadRequestRef.current) return
      setError(caught instanceof Error ? caught.message : 'โหลดใบสั่งผลิตไม่ได้')
    } finally {
      if (requestId !== latestLoadRequestRef.current) return
      setIsLoading(false)
    }
  }, [branchCode, dateFrom, dateTo, direction, page, pageSize, search, sort, statuses])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currentRows = useMemo(() => data?.rows ?? [], [data?.rows])
  const totalPages = data?.summary.totalPages ?? 1
  const activeMobileFilterCount = (branchCode ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (statuses.length > 0 ? 1 : 0)
  const hasActiveFilters = Boolean(search.trim() || branchCode || dateFrom || dateTo || statuses.length > 0)
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ direction, format: 'xlsx', sort })
    if (branchCode) params.set('branchCode', branchCode)
    if (search.trim()) params.set('search', search.trim())
    statuses.forEach((status) => params.append('status', status))
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    return `/api/production/orders?${params.toString()}`
  }, [branchCode, dateFrom, dateTo, direction, search, sort, statuses])
  const listControls = (
    <>
      <div>
        พบทั้งหมด <span className="font-semibold text-slate-900">{data?.summary.total ?? 0}</span> รายการ
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {columnResize.hasCustomWidths ? (
          <Button
            className="h-9 font-normal hidden lg:inline-flex"
            size="sm"
            variant="outline"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </Button>
        ) : null}
        <PageSizeDropdown options={pageSizeOptions} value={pageSize} onChange={(size) => { setPageSize(size); setPage(1) }} />
        <Button className="font-normal" disabled={page <= 1} size="sm" variant="outline" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
        <span className="px-1 text-sm font-medium">หน้า {data?.page ?? page} / {totalPages}</span>
        <Button className="font-normal" disabled={page >= totalPages} size="sm" variant="outline" type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
      </div>
    </>
  )

  function clearFilters() {
    setSearch('')
    setBranchCode('')
    setStatuses([])
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function toggleAppliedStatus(status: string) {
    setStatuses((current) => toggleProductionOrderStatus(current, status))
    setPage(1)
  }

  function setPeriod(period: 'today' | 'week' | 'month' | '') {
    if (!period) {
      setDateFrom('')
      setDateTo('')
      setPage(1)
      return
    }
    const today = todayDateInput()
    const start = new Date(`${today}T00:00:00`)
    if (period === 'week') start.setDate(start.getDate() - 6)
    if (period === 'month') start.setDate(1)
    setDateFrom(formatDateLocal(start))
    setDateTo(today)
    setPage(1)
  }

  function openMobileFilters() {
    setMobileFilterDraft(createMobileFilterDraft({ branchCode, dateFrom, dateTo, direction, sort, statuses }))
    setShowMobileFilters(true)
  }

  function closeMobileFilters() {
    setMobileFilterDraft(null)
    setShowMobileFilters(false)
  }

  function updateMobileFilters(patch: Partial<ProductionOrderMobileFilterState>) {
    setMobileFilterDraft((current) => updateMobileFilterDraft(
      current ?? createMobileFilterDraft({ branchCode, dateFrom, dateTo, direction, sort, statuses }),
      patch,
    ))
  }

  function setMobilePeriod(period: 'today' | 'week' | 'month' | '') {
    if (!period) {
      updateMobileFilters({ dateFrom: '', dateTo: '' })
      return
    }
    const today = todayDateInput()
    const start = new Date(`${today}T00:00:00`)
    if (period === 'week') start.setDate(start.getDate() - 6)
    if (period === 'month') start.setDate(1)
    updateMobileFilters({ dateFrom: formatDateLocal(start), dateTo: today })
  }

  function applyMobileFilters() {
    if (!mobileFilterDraft) {
      closeMobileFilters()
      return
    }
    const nextFilters = applyMobileFilterDraft(mobileFilterDraft)
    setBranchCode(nextFilters.branchCode)
    setDateFrom(nextFilters.dateFrom)
    setDateTo(nextFilters.dateTo)
    setDirection(nextFilters.direction)
    setSort(nextFilters.sort)
    setStatuses(nextFilters.statuses)
    setPage(1)
    closeMobileFilters()
  }

  function closeModal(refresh = false) {
    setModalMode(null)
    setSelectedRow(null)
    if (refresh) {
      setPage(1)
      void loadData(1)
    }
  }

  async function refreshSelectedOrder(docNo: string) {
    const params = new URLSearchParams({ docNo, include: 'detail', pageSize: '10' })
    const payload = await dailyFetchJson<ProductionOrdersPayload>(`/api/production/orders?${params.toString()}`)
    const refreshedRow = payload.rows.find((candidate) => candidate.docNo === docNo) ?? null
    if (refreshedRow) setSelectedRow(refreshedRow)
    await loadData()
    return refreshedRow
  }

  async function openOrder(row: ProductionOrderRow) {
    setSelectedRow(row)
    setModalMode('detail')
    try {
      const payload = await dailyFetchJson<ProductionOrdersPayload>(`/api/production/orders?docNo=${encodeURIComponent(row.docNo)}&include=detail&pageSize=1`)
      const detail = payload.rows.find((candidate) => candidate.docNo === row.docNo)
      if (detail) setSelectedRow(detail)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดใบสั่งผลิตไม่ได้')
    }
  }

  return (
      <section className="space-y-4">
      {error ? <Alert tone="red" title="โหลดข้อมูลใบสั่งผลิตไม่ได้" text={error} /> : null}

      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <SharedKpiCard
          icon="⚖"
          label="WIP คงเหลือ (กก.)"
          note="รวมจากรายการในหน้าปัจจุบัน"
          tone="amber"
          value={formatMoney(data?.summary.wipQty ?? 0)}
        />
        <SharedKpiCard
          icon="↗"
          label="อัตราผลที่ได้เฉลี่ย"
          note="คำนวณจากรายการในหน้าปัจจุบัน"
          tone="emerald"
          value={`${((data?.summary.inputQty ?? 0) > 0 ? (data?.summary.outputQty ?? 0) / (data?.summary.inputQty ?? 1) * 100 : 0).toFixed(1)}%`}
        />
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block mb-3 space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="ค้นหาใบสั่งผลิต"
              className="h-9 w-full rounded-md border border-slate-300 px-3 py-2 pl-9 text-sm"
              placeholder="ค้นหาเลขที่ใบสั่งผลิต / สินค้า / หมายเหตุ..."
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            />
          </div>
          <label className="text-xs text-slate-500">วันที่สร้างรายการ:</label>
          <DatePickerInput ariaLabel="วันที่สร้างรายการตั้งแต่" className="w-[130px] !h-9 text-sm" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput ariaLabel="วันที่สร้างรายการถึง" className="w-[130px] !h-9 text-sm" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
          <Select aria-label="กรองตามสาขา" className="h-9 w-40" value={branchCode} onChange={(event) => { setBranchCode(event.target.value); setPage(1) }}>
            <option value="">ทุกสาขา</option>
            {(data?.filters.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.name}</option>)}
          </Select>
          {hasActiveFilters ? (
            <button className="h-9 rounded-md bg-slate-100 px-3 text-xs hover:bg-slate-200" type="button" onClick={clearFilters}>
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">ช่วงเวลา:</span>
              <MatchButton active={isAllPeriod} label="ทั้งหมด" onClick={() => setPeriod('')} />
              <MatchButton active={isTodayPeriod} label="วันนี้" onClick={() => setPeriod('today')} />
              <MatchButton active={isWeekPeriod} label="7 วัน" onClick={() => setPeriod('week')} />
              <MatchButton active={isMonthPeriod} label="เดือนนี้" onClick={() => setPeriod('month')} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">สถานะผลิต:</span>
              <MatchButton active={statuses.length === 0} label="ทุกสถานะ" onClick={() => toggleAppliedStatus('')} />
              <MatchButton active={statuses.includes('Open')} label="ยังไม่เริ่ม" onClick={() => toggleAppliedStatus('Open')} />
              <MatchButton active={statuses.includes('In Production')} label="กำลังผลิต" onClick={() => toggleAppliedStatus('In Production')} />
              <MatchButton active={statuses.includes('Partially Completed')} label="เสร็จบางส่วน" onClick={() => toggleAppliedStatus('Partially Completed')} />
              <MatchButton active={statuses.includes('Completed')} label="เสร็จสิ้น" onClick={() => toggleAppliedStatus('Completed')} />
              <MatchButton active={statuses.includes('Cancelled')} label="ยกเลิก" onClick={() => toggleAppliedStatus('Cancelled')} />
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button asChild className="gap-2" size="sm" variant="export">
              <a href={exportHref} title="ส่งออกได้สูงสุด 10,000 รายการตามตัวกรองปัจจุบัน">
                <Download className="size-4" />
                <span>ส่งออก Excel</span>
              </a>
            </Button>
            <button className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="button" onClick={() => setModalMode('create')}>
              <Plus className="size-4" />
              ใบสั่งผลิตใหม่
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-3 space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden animate-fade-in">
        <div className="flex gap-2 items-center">
          <div className="relative min-w-[150px] flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="ค้นหาใบสั่งผลิต"
              className="h-9 w-full rounded-md border border-slate-300 px-3 pl-9 text-sm"
              placeholder="ค้นหาใบสั่งผลิต..."
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            />
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={openMobileFilters}
          >
            ตัวกรอง {activeMobileFilterCount > 0 ? `(${activeMobileFilterCount})` : ''}
          </button>
        </div>
        <Button asChild className="w-full gap-2" size="sm" variant="export">
          <a href={exportHref} title="ส่งออกได้สูงสุด 10,000 รายการตามตัวกรองปัจจุบัน">
            <Download className="size-4" />
            <span>ส่งออก Excel</span>
          </a>
        </Button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          footer={
            <>
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  clearFilters()
                  closeMobileFilters()
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={applyMobileFilters}
              >
                ใช้ตัวกรอง
              </button>
            </>
          }
          onClose={closeMobileFilters}
          title="ตัวกรองใบสั่งผลิต"
        >
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
                <Select className="h-9 w-full" value={mobileFilterDraft?.branchCode ?? branchCode} onChange={(event) => updateMobileFilters({ branchCode: event.target.value })}>
                  <option value="">ทุกสาขา</option>
                  {(data?.filters.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.name}</option>)}
                </Select>
              </label>
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงเวลา</span>
                <div className="flex flex-wrap gap-2">
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isMobileAllPeriod ? activeSegmentClass : inactiveSegmentClass}`} type="button" onClick={() => setMobilePeriod('')}>ทั้งหมด</button>
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isMobileTodayPeriod ? activeSegmentClass : inactiveSegmentClass}`} type="button" onClick={() => setMobilePeriod('today')}>วันนี้</button>
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isMobileWeekPeriod ? activeSegmentClass : inactiveSegmentClass}`} type="button" onClick={() => setMobilePeriod('week')}>7 วัน</button>
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isMobileMonthPeriod ? activeSegmentClass : inactiveSegmentClass}`} type="button" onClick={() => setMobilePeriod('month')}>เดือนนี้</button>
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">วันที่สร้างรายการ</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput ariaLabel="วันที่สร้างรายการตั้งแต่" className="flex-1" value={mobileDateFrom} onChange={(value) => updateMobileFilters({ dateFrom: value })} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput ariaLabel="วันที่สร้างรายการถึง" className="flex-1" value={mobileDateTo} onChange={(value) => updateMobileFilters({ dateTo: value })} />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะผลิต</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      mobileStatuses.length === 0 ? activeSegmentClass : inactiveSegmentClass
                    }`}
                    type="button"
                    onClick={() => updateMobileFilters({ statuses: [] })}
                  >
                    ทุกสถานะ
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      mobileStatuses.includes('Open') ? activeSegmentClass : inactiveSegmentClass
                    }`}
                    type="button"
                    onClick={() => updateMobileFilters({ statuses: toggleProductionOrderStatus(mobileStatuses, 'Open') })}
                  >
                    ยังไม่เริ่ม
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      mobileStatuses.includes('In Production') ? activeSegmentClass : inactiveSegmentClass
                    }`}
                    type="button"
                    onClick={() => updateMobileFilters({ statuses: toggleProductionOrderStatus(mobileStatuses, 'In Production') })}
                  >
                    กำลังผลิต
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      mobileStatuses.includes('Partially Completed') ? activeSegmentClass : inactiveSegmentClass
                    }`}
                    type="button"
                    onClick={() => updateMobileFilters({ statuses: toggleProductionOrderStatus(mobileStatuses, 'Partially Completed') })}
                  >
                    เสร็จบางส่วน
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      mobileStatuses.includes('Completed') ? activeSegmentClass : inactiveSegmentClass
                    }`}
                    type="button"
                    onClick={() => updateMobileFilters({ statuses: toggleProductionOrderStatus(mobileStatuses, 'Completed') })}
                  >
                    เสร็จสิ้น
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      mobileStatuses.includes('Cancelled') ? activeSegmentClass : inactiveSegmentClass
                    }`}
                    type="button"
                    onClick={() => updateMobileFilters({ statuses: toggleProductionOrderStatus(mobileStatuses, 'Cancelled') })}
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">เรียงลำดับ</span>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Select aria-label="เรียงลำดับตาม" className="h-9 min-w-0" value={mobileSort} onChange={(event) => updateMobileFilters({ sort: event.target.value })}>
                    {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                  <button
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    type="button"
                    onClick={() => updateMobileFilters({ direction: mobileDirection === 'asc' ? 'desc' : 'asc' })}
                  >
                    {mobileDirection === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'}
                  </button>
                </div>
              </div>
        </MobileFilterSheet>
      ) : null}

      <div className="flex flex-col gap-2 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:hidden">
        {listControls}
      </div>
      <div className="hidden items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600 lg:flex">
        {listControls}
      </div>

      {isLoading ? <div className="rounded-xl bg-white p-10 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      {!isLoading ? (
        <>
          {/* Desktop Table View */}
          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
            <div className="overflow-x-auto">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {productionOrderColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                <tr>
                  <ResizableTableHead
                    activeSortKey={sort}
                    align="center"
                    direction={direction}
                    label="เลขที่ใบสั่งผลิต"
                    sortKey="docNo"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่ใบสั่งผลิต')}
                  />
                  <ResizableTableHead
                    activeSortKey={sort}
                    align="center"
                    direction={direction}
                    label="วันที่เริ่มผลิต"
                    sortKey="startDate"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('startDate', 'วันที่เริ่มผลิต')}
                  />
                  <ResizableTableHead activeSortKey={sort} align="center" direction={direction} label="วันที่สร้างรายการ" resizeProps={columnResize.getResizeHandleProps('createdAt', 'วันที่สร้างรายการ')} sortKey="createdAt" onSort={toggleSort} />
                  <ResizableTableHead align="center" label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
                  <ResizableTableHead align="center" label="สินค้าที่ผลิต" resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้าที่ผลิต')} />
                  <ResizableTableHead align="center" label="เครื่องจักร" resizeProps={columnResize.getResizeHandleProps('machine', 'เครื่องจักร')} />
                  <ResizableTableHead align="center" label="คลังรับผลผลิต" resizeProps={columnResize.getResizeHandleProps('warehouseName', 'คลังรับผลผลิต')} />
                  <ResizableTableHead activeSortKey={sort} align="right" direction={direction} label="ปริมาณเบิก (กก.)" resizeProps={columnResize.getResizeHandleProps('inputQty', 'ปริมาณเบิก (กก.)')} sortKey="inputQty" onSort={toggleSort} />
                  <ResizableTableHead activeSortKey={sort} align="right" direction={direction} label="WIP คงเหลือ (กก.)" resizeProps={columnResize.getResizeHandleProps('wipQty', 'WIP คงเหลือ (กก.)')} sortKey="wipQty" onSort={toggleSort} />
                  <ResizableTableHead activeSortKey={sort} align="right" direction={direction} label="ปริมาณผลิต (กก.)" resizeProps={columnResize.getResizeHandleProps('outputQty', 'ปริมาณผลิต (กก.)')} sortKey="outputQty" onSort={toggleSort} />
                  <ResizableTableHead activeSortKey={sort} align="right" direction={direction} label="อัตราผลที่ได้" resizeProps={columnResize.getResizeHandleProps('yield', 'อัตราผลที่ได้')} sortKey="yield" onSort={toggleSort} />
                  <ResizableTableHead
                    activeSortKey={sort}
                    align="center"
                    direction={direction}
                    label="สถานะผลิต"
                    sortKey="status"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('status', 'สถานะผลิต')}
                  />
                  <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
                </tr>
              </thead>
              <tbody>
                {currentRows.length === 0 ? (
                  <tr>
                    <td className="p-12 text-center text-slate-400" colSpan={productionOrderColumns.length}>
                      <div className="space-y-3">
                        <div>{hasActiveFilters ? 'ไม่พบใบสั่งผลิตตามเงื่อนไข' : 'ยังไม่มีใบสั่งผลิต'}</div>
                        {hasActiveFilters ? (
                          <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={clearFilters}>
                            ล้างตัวกรอง
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {currentRows.map((row) => {
                  const yieldPct = row.inputQty > 0 ? (row.outputQty / row.inputQty) * 100 : 0
                  const wipQty = Math.max(0, row.wipQty ?? 0)
                  const createdDateTime = formatMovementDateTimeParts(row.createdAt)
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => void openOrder(row)}
                    >
                      <td className="p-3 truncate text-center font-mono font-semibold text-slate-900" title={row.docNo}>{row.docNo}</td>
                      <td className="p-3 whitespace-nowrap text-center">{row.startDate ? formatDateDisplay(row.startDate) : '-'}</td>
                      <td className="p-3 whitespace-nowrap text-center text-slate-500"><span className="block">{createdDateTime.date}</span>{createdDateTime.time ? <span className="block text-xs">{createdDateTime.time}</span> : null}</td>
                      <td className="p-3 truncate text-center" title={row.branchName}>{row.branchName}</td>
                      <td className="p-3 min-w-0 text-center">
                        <div className="font-semibold text-slate-800 truncate" title={row.productName || 'ยังไม่ได้กำหนดสินค้า'}>{row.productName || 'ยังไม่ได้กำหนดสินค้า'}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">{row.productCode || row.productId || '-'}</div>
                      </td>
                      <td className="p-3 min-w-0 text-center">
                        {row.machineName ? (
                          <span className="font-medium text-slate-800 truncate" title={row.machineName}>{row.machineName}</span>
                        ) : '-'}
                      </td>
                      <td className="p-3 truncate text-center" title={row.warehouseName}>{row.warehouseName || '-'}</td>
                      <td className="p-3 text-right font-medium tabular-nums text-slate-700">{formatMoney(row.inputQty)}</td>
                      <td className="p-3 text-right font-medium tabular-nums text-slate-600">{formatMoney(wipQty)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-slate-800">{formatMoney(row.outputQty)}</td>
                      <td className="p-3 text-center font-bold tabular-nums">
                        {row.inputQty > 0 ? (
                          <span className={yieldPct >= 90 ? 'text-emerald-700' : yieldPct >= 70 ? 'text-blue-700' : 'text-amber-700'}>
                            {yieldPct.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <StatusBadge compact status={row.status} />
                      </td>
                      <td className="p-3 text-center">
                        <TableActionButton
                          label="เปิด"
                          menu={(
                            <TableActionMenuItem onSelect={() => {
                              void openOrder(row)
                            }}>
                              เปิด
                            </TableActionMenuItem>
                          )}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Mobile Grid/Card View */}
          <div className="grid grid-cols-1 gap-3 pb-16 md:grid-cols-2 lg:hidden">
            {currentRows.map((row) => (
              <OrderCard
                key={row.id}
                row={row}
                onOpen={() => void openOrder(row)}
              />
            ))}
          </div>
        </>
      ) : null}
      {!isLoading && currentRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm lg:hidden">
          <div>{hasActiveFilters ? 'ไม่พบใบสั่งผลิตตามเงื่อนไข' : 'ยังไม่มีใบสั่งผลิต'}</div>
          {hasActiveFilters ? (
            <button className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={clearFilters}>
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-transform"
          onClick={() => setModalMode('create')}
          type="button"
          aria-label="เพิ่มใบสั่งผลิต"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {modalMode ? <ProductionOrderModal mode={modalMode} row={selectedRow} onClose={closeModal} onRefreshRow={refreshSelectedOrder} /> : null}
    </section>
  )
}

export function OrderCard({ onOpen, row }: { onOpen: () => void; row: ProductionOrderRow }) {
  const yieldPct = row.inputQty > 0 ? (row.outputQty / row.inputQty) * 100 : 0
  const wipQty = Math.max(0, row.wipQty ?? 0)
  const createdDateTime = formatMovementDateTimeParts(row.createdAt)
  return (
    <article
      aria-label={`เปิดใบสั่งผลิต ${row.docNo}`}
      className={`w-full cursor-pointer overflow-hidden rounded-xl border p-3.5 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${cardClass(row.status)}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-semibold text-slate-800">{row.docNo}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{row.branchName}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-slate-500">เริ่มผลิต {row.startDate ? formatDateDisplay(row.startDate) : '-'}</div>
          <div className="mt-1"><StatusBadge status={row.status} /></div>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-200/70 pt-3">
        <div className="truncate text-sm font-bold text-slate-800">{row.productName || 'ยังไม่ได้กำหนดสินค้า'}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{row.productCode || row.productId || '-'} · {row.warehouseName}</div>
        <div className="mt-0.5 text-xs text-slate-500">สร้างรายการ <span className="block">{createdDateTime.date}</span>{createdDateTime.time ? <span className="block text-[11px]">{createdDateTime.time}</span> : null}</div>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200/70 py-2 text-center">
        <MiniMetric label="เบิก" tone="red" value={row.inputQty} />
        <MiniMetric label="งานระหว่างทำ" tone="amber" value={wipQty} />
        <MiniMetric label="ผลิต" tone="emerald" value={row.outputQty} />
      </div>
      {row.inputQty > 0 ? (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">อัตราผลที่ได้</span>
          <span className={`font-bold ${yieldPct >= 90 ? 'text-emerald-700' : yieldPct >= 70 ? 'text-blue-700' : 'text-amber-700'}`}>{yieldPct.toFixed(1)}%</span>
        </div>
      ) : null}
      {row.status === 'Completed' ? <CountdownTimer closedAt={row.closedAt} /> : null}
      <div className="mt-2.5 space-y-2 border-t border-slate-200/70 pt-2.5">
        <div className="text-xs"><span className="text-slate-500">ต้นทุนเบิก:</span><b className="ml-1 text-slate-800">{formatMoney(row.inputCost)}</b></div>
      </div>
    </article>
  )
}

function CountdownTimer({ closedAt }: { closedAt: string | null }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    if (!closedAt) return

    const update = () => {
      const closedTime = new Date(closedAt).getTime()
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      const expireTime = closedTime + sevenDaysMs
      const now = Date.now()
      const remainingMs = expireTime - now

      if (remainingMs <= 0) {
        setText('หมดเวลาแก้ไข')
        return
      }

      const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24))
      const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
      const remainingSeconds = Math.floor((remainingMs % (1000 * 60)) / 1000)

      if (remainingDays > 0) {
        setText(`เหลือเวลาแก้ไข ${remainingDays} วัน ${remainingHours} ชม. ${remainingMinutes} น. ${remainingSeconds} วิ.`)
      } else if (remainingHours > 0) {
        setText(`เหลือเวลาแก้ไข ${remainingHours} ชม. ${remainingMinutes} น. ${remainingSeconds} วิ.`)
      } else {
        setText(`เหลือเวลาแก้ไข ${remainingMinutes} น. ${remainingSeconds} วิ.`)
      }
    }

    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [closedAt])

  if (!text) return null

  const isLocked = text === 'หมดเวลาแก้ไข'

  return (
    <div className={`mb-3 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md ${isLocked ? 'bg-slate-200 text-slate-600 border border-slate-300' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
      <span className={isLocked ? '' : 'animate-pulse'}>⏱️</span> {text}
    </div>
  )
}


function ProductionOrderModal({ mode, onClose, onRefreshRow, row }: { mode: 'create' | 'detail'; onClose: (refresh?: boolean) => void; onRefreshRow: (docNo: string) => Promise<ProductionOrderRow | null>; row: ProductionOrderRow | null }) {
  const isCreate = mode === 'create'
  const [options, setOptions] = useState<ProductionOrderOptions>(emptyOptions)
  const [tab, setTab] = useState<'header' | 'input' | 'output' | 'history'>('header')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isStockPreviewLoading, setIsStockPreviewLoading] = useState(false)
  const [productStock, setProductStock] = useState<ProductStockPayload | null>(null)
  const [productStockError, setProductStockError] = useState<string | null>(null)
  const [returnInputDocNos, setReturnInputDocNos] = useState<string[]>([])
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [returnReason, setReturnReason] = useState('')
  const [wip, setWip] = useState<WipPayload | null>(null)
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})
  const [createForm, setCreateForm] = useState({
    branchCode: '',
    destinationWarehouseCode: '',
    machineCode: '',
    notes: '',
    productionLineCode: '',
    shift: 'เช้า',
    targetProductCode: '',
  })
  const [inputForm, setInputForm] = useState({ lotNo: '', netQty: '', productCode: '', sourceWarehouseCode: '', stockStatus: 'RM' })
  const [inputDrafts, setInputDrafts] = useState<ProductionInputDraft[]>([])
  const [outputForm, setOutputForm] = useState({ categoryCode: 'FG', date: todayDateInput(), destinationWarehouseCode: '', lossQty: '', lotNo: '', netQty: '', notes: '', productCode: '', sourceKey: '', sourceWipQty: '' })
  const [outputDrafts, setOutputDrafts] = useState<ProductionOutputDraft[]>([])
  const [outputQuantityWarning, setOutputQuantityWarning] = useState<{ draft: ProductionOutputDraft; totalOutputQty: number; totalSourceWipQty: number } | null>(null)
  const [outputWipDrafts, setOutputWipDrafts] = useState<ProductionOutputWipDraft[]>([])
  const outputDraftDirtyRef = useRef(false)
  const outputDraftSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const outputDraftIdRef = useRef(0)
  const [showOutputWipEntryRow, setShowOutputWipEntryRow] = useState(true)
  const inputNetQtyRef = useRef<HTMLInputElement | null>(null)
  const outputNetQtyRef = useRef<HTMLInputElement | null>(null)
  const outputLossQtyRef = useRef<HTMLInputElement | null>(null)
  const outputSourceWipQtyRef = useRef<HTMLInputElement | null>(null)

  const inputWarehouseOptions = useMemo(() => {
    if (!row?.branchCode) return []
    return options.warehouses.filter((warehouse) => warehouse.branchCode === row.branchCode && warehouse.type?.toUpperCase() !== 'WIP')
  }, [options.warehouses, row])
  const outputWarehouseOptions = useMemo(() => {
    if (!row?.branchCode) return []
    return options.warehouses.filter((warehouse) => warehouse.branchCode === row.branchCode && warehouse.type?.toUpperCase() !== 'WIP')
  }, [options.warehouses, row])
  const machineOptions = useMemo(() => [{ code: noMachineCode, id: noMachineCode, name: 'ไม่มีเครื่องจักร' }, ...options.machines], [options.machines])
  const productionLineOptions = useMemo(() => [{ code: noProductionLineCode, id: noProductionLineCode, name: 'ไม่มีไลน์ผลิต' }, ...options.productionLines], [options.productionLines])
  const rowWipQty = wip?.wipQty ?? row?.wipQty ?? Math.max(0, (row?.inputQty ?? 0) - (row?.outputQty ?? 0))
  const wipSourceOptions = useMemo(() => (row?.wipSummary?.groups ?? []).filter((group) => group.wipQty > 0).map((group) => ({
    key: `${group.productCode}|${group.stockCategory}|${group.warehouseName}`,
    label: `${group.productName} - ${group.stockCategory}`,
    productCode: group.productCode,
    productName: group.productName,
    stockCategory: group.stockCategory,
    warehouseCode: group.warehouseCode,
    warehouseName: group.warehouseName,
    qty: group.wipQty,
  })), [row?.wipSummary?.groups])
  const baseWipSummary = row?.wipSummary
  const displayWipSummary = useMemo<ProductionWipSummary | undefined>(() => {
    if (!baseWipSummary) return undefined
    const selectedQtyByKey = new Map<string, number>()
    for (const draft of outputWipDrafts) {
      selectedQtyByKey.set(draft.sourceKey, (selectedQtyByKey.get(draft.sourceKey) ?? 0) + (Number(draft.qty) || 0))
    }
    const currentQty = Number(outputForm.sourceWipQty)
    if (showOutputWipEntryRow && outputForm.sourceKey && Number.isFinite(currentQty) && currentQty > 0) {
      selectedQtyByKey.set(outputForm.sourceKey, (selectedQtyByKey.get(outputForm.sourceKey) ?? 0) + currentQty)
    }
    if (selectedQtyByKey.size === 0) return baseWipSummary
    const groups = baseWipSummary.groups.map((group) => {
      const key = `${group.productCode}|${group.stockCategory}|${group.warehouseName}`
      const selectedQty = selectedQtyByKey.get(key) ?? 0
      const wipQty = group.wipQty - selectedQty
      return { ...group, consumedWipQty: group.consumedWipQty + selectedQty, wipQty, wipValue: wipQty * group.avgCost }
    })
    const wipQty = groups.reduce((sum, group) => sum + group.wipQty, 0)
    const wipValue = groups.reduce((sum, group) => sum + group.wipValue, 0)
    return {
      ...baseWipSummary,
      consumedWipQty: baseWipSummary.consumedWipQty + [...selectedQtyByKey.values()].reduce((sum, qty) => sum + qty, 0),
      groups,
      wipQty,
      avgCost: wipQty > 0 ? wipValue / wipQty : 0,
    }
  }, [baseWipSummary, outputForm.sourceKey, outputForm.sourceWipQty, outputWipDrafts, showOutputWipEntryRow])
  const availableWipSourceOptions = useMemo(() => {
    const stagedQtyByKey = new Map<string, number>()
    for (const draft of outputWipDrafts) stagedQtyByKey.set(draft.sourceKey, (stagedQtyByKey.get(draft.sourceKey) ?? 0) + Number(draft.qty))
    if (showOutputWipEntryRow && outputForm.sourceKey) stagedQtyByKey.set(outputForm.sourceKey, (stagedQtyByKey.get(outputForm.sourceKey) ?? 0) + (Number(outputForm.sourceWipQty) || 0))
    return wipSourceOptions.filter((option) => {
      const remainingQty = option.qty - (stagedQtyByKey.get(option.key) ?? 0)
      return remainingQty > 0 || option.key === outputForm.sourceKey
    })
  }, [outputForm.sourceKey, outputForm.sourceWipQty, outputWipDrafts, showOutputWipEntryRow, wipSourceOptions])
  const isGracePeriodActive = useCallback((orderRow: ProductionOrderRow | null) => {
    if (!orderRow || orderRow.status !== 'Completed' || !orderRow.closedAt) return false
    const closedTime = new Date(orderRow.closedAt).getTime()
    const now = Date.now()
    const diffTime = now - closedTime
    const diffDays = diffTime / (1000 * 60 * 60 * 24)
    return diffDays <= 7
  }, [])
  const canWrite = row
    ? ['Open', 'In Production', 'Partially Completed'].includes(row.status) || isGracePeriodActive(row)
    : false
  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => options.products.map((product) => ({
    id: product.code,
    label: `${product.code} - ${product.name}`,
    searchText: `${product.code} ${product.name}`,
  })), [options.products])
  const returnRows = useMemo<ProductionInputReturnGroup[]>(() => {
    const sourceRows = row?.inputs.filter((input) => returnInputDocNos.includes(input.docNo) && input.status?.toLowerCase() === 'active' && input.id) ?? []
    return groupProductionInputReturnRows(sourceRows, row?.wipSummary?.groups)
  }, [returnInputDocNos, row?.inputs, row?.wipSummary?.groups])

  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const payload = await dailyFetchJson<ProductionOrderOptions>('/api/production/orders/options')
        if (cancelled) return
        setOptions(payload)
        setInputForm((current) => {
          const defaultWarehouse = payload.warehouses.find((w) => w.name === 'RM สมุทรสาคร')
          const defaultWhCode = current.sourceWarehouseCode || defaultWarehouse?.code || payload.warehouses[0]?.code || ''
          const selectedWh = payload.warehouses.find((w) => w.code === defaultWhCode)
          const inferredStatus = selectedWh?.type?.toUpperCase() === 'FG' ? 'FG' : 'RM'
          return {
            ...current,
            productCode: current.productCode || payload.products[0]?.code || '',
            sourceWarehouseCode: defaultWhCode,
            stockStatus: inferredStatus,
          }
        })
        setOutputForm((current) => ({ ...current, destinationWarehouseCode: current.destinationWarehouseCode || payload.warehouses.find((warehouse) => warehouse.branchCode === row?.branchCode && warehouse.type?.toUpperCase() !== 'WIP')?.code || '', productCode: current.productCode || payload.products[0]?.code || '' }))
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'โหลดตัวเลือกไม่ได้')
      }
    }
    void loadOptions()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!row) return
    const currentDocNo = row.docNo
    let cancelled = false
    async function loadWip() {
      try {
        const payload = await dailyFetchJson<WipPayload>(`/api/production/orders/${encodeURIComponent(currentDocNo)}/wip`)
        if (!cancelled) setWip(payload)
      } catch {
        if (!cancelled) setWip(null)
      }
    }
    void loadWip()
    return () => { cancelled = true }
  }, [row])

  useEffect(() => {
    if (isCreate || !row) return
    const currentDocNo = row.docNo
    let cancelled = false
    async function loadOutputDraft() {
      try {
        const payload = await dailyFetchJson<{ draft: ProductionOutputDraftPayload | null }>(`/api/production/orders/${encodeURIComponent(currentDocNo)}/output-draft`)
        if (cancelled || outputDraftDirtyRef.current || !payload.draft) return
        setOutputDrafts(payload.draft.outputDrafts)
        setOutputWipDrafts(payload.draft.outputWipDrafts)
        setOutputForm((form) => ({ ...form, date: payload.draft?.outputForm.date ?? form.date, notes: payload.draft?.outputForm.notes ?? form.notes }))
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'โหลดร่างผลผลิตไม่ได้')
      }
    }
    void loadOutputDraft()
    return () => { cancelled = true }
  }, [isCreate, row])

  useEffect(() => {
    if (!row || inputWarehouseOptions.length === 0) return
    if (inputWarehouseOptions.some((warehouse) => warehouse.code === inputForm.sourceWarehouseCode)) return
    setInputForm((form) => ({ ...form, sourceWarehouseCode: inputWarehouseOptions[0]?.code ?? '', stockStatus: inputWarehouseOptions[0]?.type?.toUpperCase() === 'FG' ? 'FG' : 'RM' }))
  }, [inputForm.sourceWarehouseCode, inputWarehouseOptions, row])

  useEffect(() => {
    if (!showOutputWipEntryRow) return
    if (availableWipSourceOptions.length === 0) return
    if (outputWipDrafts.length > 0) {
      if (!availableWipSourceOptions.some((option) => option.key === outputForm.sourceKey)) setOutputForm((form) => ({ ...form, sourceKey: '', sourceWipQty: '' }))
      return
    }
    if (outputForm.sourceKey && !availableWipSourceOptions.some((option) => option.key === outputForm.sourceKey)) setOutputForm((form) => ({ ...form, sourceKey: '', sourceWipQty: '' }))
  }, [availableWipSourceOptions, outputForm.sourceKey, outputWipDrafts.length, row?.productCode, showOutputWipEntryRow])

  useEffect(() => {
    let activeBranchCode = ''
    let activeProductCode = ''
    let activeWarehouseCode = ''

    if (isCreate) {
      setProductStock(null)
      setProductStockError(null)
      setIsStockPreviewLoading(false)
      return
    } else {
      if (!row) {
        setProductStock(null)
        setProductStockError(null)
        setIsStockPreviewLoading(false)
        return
      }
      const branchCode = row.branchCode
      if (!branchCode || !inputForm.productCode || !inputForm.sourceWarehouseCode) {
        setProductStock(null)
        setProductStockError(null)
        setIsStockPreviewLoading(false)
        return
      }
      activeBranchCode = branchCode
      activeProductCode = inputForm.productCode
      activeWarehouseCode = inputForm.sourceWarehouseCode
    }

    let cancelled = false
    async function loadProductStock() {
      setIsStockPreviewLoading(true)
      setProductStockError(null)
      try {
        const params = new URLSearchParams({
          branchCode: activeBranchCode,
          productCode: activeProductCode,
          warehouseCode: activeWarehouseCode,
        })
        const payload = await dailyFetchJson<ProductStockPayload>(`/api/production/orders/product-stock?${params.toString()}`)
        if (!cancelled) setProductStock(payload)
      } catch (caught) {
        if (cancelled) return
        setProductStock(null)
        setProductStockError(caught instanceof Error ? caught.message : 'โหลด stock สินค้าที่ผลิตไม่ได้')
      } finally {
        if (!cancelled) setIsStockPreviewLoading(false)
      }
    }
    void loadProductStock()
    return () => { cancelled = true }
  }, [inputForm.productCode, inputForm.sourceWarehouseCode, isCreate, row])

  async function submitCreate() {
    if (!validateCreateForm()) return
    await runAction(async () => {
      await dailyFetchJson('/api/production/orders', {
        body: JSON.stringify({
          branchCode: createForm.branchCode,
          destinationWarehouseCode: createForm.destinationWarehouseCode,
          ...(createForm.machineCode !== noMachineCode ? { machineCode: createForm.machineCode } : {}),
          ...(createForm.notes.trim() ? { notes: createForm.notes.trim() } : {}),
          ...(createForm.productionLineCode !== noProductionLineCode ? { productionLineCode: createForm.productionLineCode } : {}),
          ...(createForm.shift.trim() ? { shift: createForm.shift.trim() } : {}),
          targetProductCode: createForm.targetProductCode,
        }),
        method: 'POST',
      })
      onClose(true)
    })
  }

  function updateCreateForm(field: keyof typeof createForm, value: string) {
    setCreateForm((form) => ({ ...form, [field]: value }))
    setCreateErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function updateCreateBranch(branchCode: string) {
    const warehouses = options.warehouses.filter((w) => w.branchCode === branchCode)
    const selectableWarehouses = warehouses.filter((w) => w.type?.toUpperCase() !== 'WIP')
    const defaultFgWarehouse = selectableWarehouses.find((w) => w.type?.toUpperCase() === 'FG') || selectableWarehouses[0]
    setCreateForm((form) => ({
      ...form,
      branchCode,
      destinationWarehouseCode: defaultFgWarehouse?.code ?? '',
    }))
    setCreateErrors((current) => {
      const next = { ...current }
      delete next.branchCode
      delete next.destinationWarehouseCode
      return next
    })
  }

  function updateCreateMachine(machineCode: string) {
    setCreateForm((form) => ({ ...form, machineCode }))
    setCreateErrors((current) => {
      const next = { ...current }
      delete next.machineCode
      return next
    })
  }

  function validateCreateForm() {
    const requiredFields: Array<[keyof typeof createForm, string]> = [
      ['branchCode', 'กรุณาเลือกสาขา'],
      ['targetProductCode', 'กรุณาเลือกสินค้าที่ผลิต'],
      ['machineCode', 'กรุณาเลือกเครื่องจักร หรือ ไม่มีเครื่องจักร'],
      ['productionLineCode', 'กรุณาเลือกไลน์ผลิต หรือ ไม่มีไลน์ผลิต'],
      ['destinationWarehouseCode', 'กรุณาเลือกคลังรับผลผลิต'],
    ]
    const nextErrors: Record<string, string> = {}
    for (const [field, message] of requiredFields) {
      if (!createForm[field].trim()) nextErrors[field] = message
    }
    setCreateErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) return true
    setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
    return false
  }

  async function submitInput() {
    if (!row) return
    // The live entry row is only a staging row. Only rows already added to the table may be posted.
    const lines = inputDrafts.map(({ id: _id, ...draft }) => ({ ...draft, netQty: Number(draft.netQty) }))
    if (lines.length === 0) {
      setError('กรุณากด + เพิ่มรายการวัตถุดิบ ให้รายการปรากฏในตารางก่อนบันทึก')
      return
    }
    const invalidLine = lines.findIndex((line) => !line.productCode || !line.sourceWarehouseCode || !Number.isFinite(line.netQty) || line.netQty <= 0)
    if (invalidLine >= 0) {
      setError(`กรุณาเลือกสินค้า คลังวัตถุดิบ และระบุน้ำหนักของรายการที่ ${invalidLine + 1} ให้มากกว่า 0`)
      return
    }
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/inputs`, {
        body: JSON.stringify({ lines }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setInputDrafts([])
      setInputForm((form) => ({ ...form, lotNo: '', netQty: '' }))
      setTab('input')
    })
  }

  function addInputDraft(formElement?: HTMLFormElement) {
    const productCode = getComboboxCode(formElement, 'production-input-product', inputForm.productCode)
    const sourceWarehouseCode = readFormValue(formElement, 'production-input-source-warehouse') || inputForm.sourceWarehouseCode
    const netQtyText = readFormValue(formElement, 'production-input-net-qty') || inputNetQtyRef.current?.value.trim() || inputForm.netQty
    const netQty = Number(netQtyText)
    if (!productCode || !sourceWarehouseCode || !Number.isFinite(netQty) || netQty <= 0) {
      setError('กรุณาเลือกสินค้า คลังวัตถุดิบ และระบุน้ำหนักรายการนี้มากกว่า 0 ก่อนเพิ่มรายการ')
      return
    }
    setError(null)
    setInputDrafts((drafts) => [...drafts, {
      id: `${productCode}-${sourceWarehouseCode}-${Date.now()}`,
      lotNo: inputForm.lotNo,
      netQty: netQty.toFixed(2),
      productCode,
      sourceWarehouseCode,
      stockStatus: (inputForm.stockStatus || 'RM') as 'RM' | 'FG',
    }])
    setInputForm((form) => ({ ...form, lotNo: '', netQty: '', productCode: '' }))
  }

  function persistOutputDraft(nextOutputDrafts: ProductionOutputDraft[], nextOutputWipDrafts: ProductionOutputWipDraft[]) {
    if (!row) return
    outputDraftDirtyRef.current = true
    const payload = JSON.stringify({ outputDrafts: nextOutputDrafts, outputForm: { date: outputForm.date, notes: outputForm.notes }, outputWipDrafts: nextOutputWipDrafts })
    outputDraftSaveQueueRef.current = outputDraftSaveQueueRef.current
      .catch(() => undefined)
      .then(() => dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/output-draft`, {
        body: payload,
        method: 'PUT',
      }))
      .then(() => undefined)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'บันทึกร่างผลผลิตไม่ได้'))
  }

  async function submitOutput(formElement?: HTMLFormElement) {
    if (!row) return
    const hasOutputQty = outputDrafts.some((draft) => Number(draft.netQty) > 0)
    const lossQty = outputDrafts.reduce((sum, draft) => sum + (Number.isFinite(Number(draft.lossQty)) ? Number(draft.lossQty) : 0), 0)
    const sourceWipQtyText = readFormValue(formElement, 'production-output-source-wip-qty') || outputSourceWipQtyRef.current?.value.trim() || outputForm.sourceWipQty
    const hasCurrentSource = Boolean(outputForm.sourceKey || sourceWipQtyText)
    const selectedWipLines = [...outputWipDrafts, ...(hasCurrentSource ? [{ id: 'current', qty: sourceWipQtyText, sourceKey: outputForm.sourceKey }] : [])]
    const sourceWipLines = selectedWipLines.map((draft) => {
      const source = wipSourceOptions.find((option) => option.key === draft.sourceKey)
      return source ? { productCode: source.productCode, qty: Number(draft.qty), sourceWarehouseCode: source.warehouseCode, stockCategory: source.stockCategory } : null
    })
    const invalidWipLine = sourceWipLines.findIndex((line, index) => !line || !Number.isFinite(line.qty) || line.qty <= 0 || line.qty > (wipSourceOptions.find((option) => option.key === selectedWipLines[index]?.sourceKey)?.qty ?? 0))
    if (sourceWipLines.length === 0 || invalidWipLine >= 0 || sourceWipLines.some((line) => line === null)) {
      setError(`น้ำหนักที่ใช้ผลิตของรายการที่ ${Math.max(1, invalidWipLine + 1)} เกินคงเหลือ หรือวัตถุดิบใน WIP ไม่เพียงพอ`)
      focusOutputWipQty(invalidWipLine >= 0 ? invalidWipLine : outputWipDrafts.length)
      return
    }
    const validSourceWipLines = sourceWipLines.filter((line): line is NonNullable<typeof line> => line !== null)
    const totalSourceWipQty = validSourceWipLines.reduce((sum, line) => sum + line.qty, 0)
    if (outputDrafts.length === 0) {
      setError('กรุณาเพิ่มรายการผลผลิตหรือตัวเลขสูญเสียให้ปรากฏในตารางก่อนบันทึก')
      return
    }
    if (outputDrafts.some((draft) => Number(draft.netQty) > 0 && (!draft.productCode || !draft.destinationWarehouseCode))) {
      setError('กรุณาเลือกสินค้าที่ได้และคลังรับผลผลิตเมื่อมีผลผลิต')
      return
    }
    if (outputDrafts.some((draft) => !Number.isFinite(Number(draft.netQty)) || Number(draft.netQty) < 0 || !Number.isFinite(Number(draft.lossQty)) || Number(draft.lossQty) < 0)) {
      setError('จำนวนผลผลิตและสูญเสียต้องเป็นตัวเลขตั้งแต่ 0.00 ขึ้นไป')
      return
    }
    if (!hasOutputQty && Math.abs(totalSourceWipQty - lossQty) > 0.000001) {
      setError('กรณีไม่มีผลผลิต หรือน้ำหนักผลผลิตเป็น 0.00 น้ำหนักที่ใช้ผลิตต้องเท่ากับน้ำหนักสูญเสีย')
      return
    }
    if (!hasOutputQty && lossQty <= 0) {
      setError('กรุณาระบุน้ำหนักรวม (กก.) หรือ Loss kg อย่างน้อย 1 รายการ')
      return
    }
    await runAction(async () => {
      const lines = outputDrafts.map((draft) => ({
        categoryCode: draft.categoryCode,
        destinationWarehouseCode: draft.destinationWarehouseCode,
        lotNo: draft.lotNo || undefined,
        netQty: Number(draft.netQty),
        productCode: draft.productCode || row.productCode,
      })).filter((line) => line.netQty > 0)
      const postOutput = (confirmCostVariance: boolean) => dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/outputs`, {
        body: JSON.stringify({ confirmCostVariance, date: outputForm.date, lines, lossQty, notes: outputForm.notes || undefined, sourceWipLines: validSourceWipLines, sourceWipQty: totalSourceWipQty }),
        method: 'POST',
      })
      try {
        await postOutput(false)
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.status !== 409 || !caught.message.startsWith('ตรวจพบจำนวนต่างก่อนส่งเข้าคลัง')) throw caught
        const confirmed = window.confirm(`${caught.message}\n\nยืนยันส่งผลผลิตเข้าคลังหรือไม่?`)
        if (!confirmed) return
        await postOutput(true)
      }
      await onRefreshRow(row.docNo)
      setOutputDrafts([])
      setOutputWipDrafts([])
      setOutputForm((form) => ({ ...form, lossQty: '', lotNo: '', netQty: '', notes: '', productCode: '', sourceWipQty: '' }))
      setTab('output')
    })
  }

  function addOutputDraft(formElement?: HTMLFormElement) {
    const destinationWarehouseCode = readFormValue(formElement, 'production-output-destination-warehouse') || outputForm.destinationWarehouseCode
    const productCode = getComboboxCode(formElement, 'production-output-product', outputForm.productCode)
    const netQtyText = readFormValue(formElement, 'production-output-net-qty') || outputNetQtyRef.current?.value.trim() || outputForm.netQty
    const lossQtyText = readFormValue(formElement, 'production-output-loss-qty') || outputLossQtyRef.current?.value.trim() || outputForm.lossQty
    const netQty = Number(netQtyText)
    const lossQty = lossQtyText ? Number(lossQtyText) : 0
    if (!Number.isFinite(netQty) || netQty < 0 || !Number.isFinite(lossQty) || lossQty < 0 || (netQty <= 0 && lossQty <= 0)) {
      setError('กรุณาระบุจำนวนผลผลิตหรือสูญเสียอย่างน้อย 1 รายการ')
      return
    }
    if (netQty > 0 && (!productCode || !destinationWarehouseCode)) {
      setError('กรุณาเลือกสินค้าที่ได้และคลังรับผลผลิตก่อนเพิ่มรายการ')
      return
    }
    const draft: ProductionOutputDraft = {
      categoryCode: 'FG',
      destinationWarehouseCode,
      id: `${destinationWarehouseCode}-${++outputDraftIdRef.current}`,
      lotNo: outputForm.lotNo,
      lossQty: lossQty.toFixed(2),
      netQty: netQty.toFixed(2),
      productCode,
    }
    const sourceWipQtyText = readFormValue(formElement, 'production-output-source-wip-qty') || outputSourceWipQtyRef.current?.value.trim() || outputForm.sourceWipQty
    const totalSourceWipQty = outputWipDrafts.reduce((sum, sourceDraft) => sum + (Number(sourceDraft.qty) || 0), 0) + (Number(sourceWipQtyText) || 0)
    const totalOutputQty = outputDrafts.reduce((sum, outputDraft) => sum + (Number(outputDraft.netQty) || 0), 0) + netQty
    if (totalOutputQty > totalSourceWipQty + 0.000001) {
      setError(null)
      setOutputQuantityWarning({ draft, totalOutputQty, totalSourceWipQty })
      return
    }
    setError(null)
    appendOutputDraft(draft)
  }

  function appendOutputDraft(draft: ProductionOutputDraft) {
    outputDraftDirtyRef.current = true
    const nextOutputDrafts = [...outputDrafts, draft]
    setOutputDrafts(nextOutputDrafts)
    persistOutputDraft(nextOutputDrafts, outputWipDrafts)
    setOutputForm((form) => ({ ...form, lossQty: '', netQty: '', lotNo: '', productCode: '' }))
  }

  function removeOutputDraft(index: number) {
    outputDraftDirtyRef.current = true
    const nextOutputDrafts = outputDrafts.filter((_, draftIndex) => draftIndex !== index)
    setOutputDrafts(nextOutputDrafts)
    persistOutputDraft(nextOutputDrafts, outputWipDrafts)
    setError(null)
  }

  function addOutputWipDraft(formElement?: HTMLFormElement) {
    const sourceKey = outputForm.sourceKey
    const qtyText = readFormValue(formElement, 'production-output-source-wip-qty') || outputSourceWipQtyRef.current?.value.trim() || outputForm.sourceWipQty
    const source = wipSourceOptions.find((option) => option.key === sourceKey)
    const qty = Number(qtyText)
    if (outputWipDrafts.some((draft) => draft.sourceKey === sourceKey)) {
      setError('วัตถุดิบใน WIP แหล่งเดียวกันถูกเพิ่มแล้ว กรุณาแก้จำนวนในรายการเดิม')
      return
    }
    if (!source || !Number.isFinite(qty) || qty <= 0 || qty > source.qty) {
      setError('น้ำหนักที่ใช้ผลิตเกินคงเหลือ หรือวัตถุดิบใน WIP ไม่เพียงพอก่อนเพิ่มรายการ')
      focusOutputWipQty(outputWipDrafts.length)
      return
    }
    setError(null)
    outputDraftDirtyRef.current = true
    const nextOutputWipDrafts = [...outputWipDrafts, { id: `${sourceKey}-${++outputDraftIdRef.current}`, qty: qty.toFixed(2), sourceKey }]
    setOutputWipDrafts(nextOutputWipDrafts)
    persistOutputDraft(outputDrafts, nextOutputWipDrafts)
    setOutputForm((form) => ({ ...form, sourceKey: '', sourceWipQty: '' }))
  }

  function updateOutputWipDraft(index: number, patch: Partial<ProductionOutputWipDraft>) {
    if (patch.sourceKey && outputWipDrafts.some((draft, draftIndex) => draftIndex !== index && draft.sourceKey === patch.sourceKey)) {
      setError('วัตถุดิบใน WIP แหล่งเดียวกันถูกเพิ่มแล้ว กรุณาแก้จำนวนในรายการเดิม')
      return
    }
    const nextOutputWipDrafts = outputWipDrafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft)
    outputDraftDirtyRef.current = true
    setOutputWipDrafts(nextOutputWipDrafts)
    persistOutputDraft(outputDrafts, nextOutputWipDrafts)
  }

  function getOutputWipAvailableQty(sourceKey: string, excludedDraftId?: string) {
    const source = wipSourceOptions.find((option) => option.key === sourceKey)
    if (!source) return 0
    const stagedQty = outputWipDrafts
      .filter((draft) => draft.id !== excludedDraftId && draft.sourceKey === sourceKey)
      .reduce((sum, draft) => sum + (Number(draft.qty) || 0), 0)
    return Math.max(0, source.qty - stagedQty)
  }

  function validateOutputWipQty(value: string, maxQty: number) {
    if (value && Number(value) < 0) {
      setError('น้ำหนักที่ใช้ผลิตติดลบ หรือวัตถุดิบใน WIP ไม่เพียงพอ')
      return
    }
    if (value && Number(value) > maxQty) {
      setError(`น้ำหนักที่ใช้ผลิตเกินคงเหลือ หรือวัตถุดิบใน WIP ไม่เพียงพอ (คงเหลือ ${formatMoney(maxQty)} กก.)`)
      return
    }
    setError((current) => current?.startsWith('น้ำหนักที่ใช้ผลิตเกินคงเหลือ') || current?.startsWith('น้ำหนักที่ใช้ผลิตติดลบ') ? null : current)
  }

  function sanitizeOutputWipQtyInput(value: string) {
    return value.trim().startsWith('-') ? value.trim() : sanitizeDecimalInput(value, 2)
  }

  function focusOutputWipQty(index: number) {
    const focusInput = () => {
      const input = index === outputWipDrafts.length
        ? outputSourceWipQtyRef.current
        : document.querySelector<HTMLInputElement>(`[data-output-wip-qty-index="${index}"]`)
      if (!input) return
      input.focus({ preventScroll: true })
      input.select()
    }
    window.requestAnimationFrame(focusInput)
  }

  function removeOutputWipDraft(id: string) {
    const nextOutputWipDrafts = outputWipDrafts.filter((draft) => draft.id !== id)
    setOutputWipDrafts(nextOutputWipDrafts)
    persistOutputDraft(outputDrafts, nextOutputWipDrafts)
    setError(null)
  }

  function clearOutputWipDraft() {
    if (outputSourceWipQtyRef.current) outputSourceWipQtyRef.current.value = ''
    setOutputForm((form) => ({ ...form, sourceKey: '', sourceWipQty: '' }))
    setShowOutputWipEntryRow(false)
  }

  async function patchOrder(action: 'cancel' | 'complete') {
    if (!row) return
    const reason = action === 'cancel' ? window.prompt('เหตุผลการยกเลิก')?.trim() : undefined
    if (action === 'cancel' && !reason) return
    const confirmCloseWithWip = action === 'complete' && rowWipQty > 0.000001
      ? window.confirm(`ยังมี WIP คงเหลือ ${formatMoney(rowWipQty)} กก.\nหากยืนยันจบงาน ระบบจะคืน WIP ที่เหลือกลับคลังต้นทาง ต้องการดำเนินการต่อหรือไม่`)
      : false
    if (action === 'complete' && rowWipQty > 0.000001 && !confirmCloseWithWip) return
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}`, {
        body: JSON.stringify(action === 'complete' ? { action, confirmCloseWithWip, note: '' } : { action, reason }),
        method: 'PATCH',
      })
      await onRefreshRow(row.docNo)
    })
  }

  function openInputReturn(docNos: string[]) {
    if (!row) return
    const selectedRows = row.inputs.filter((input) => docNos.includes(input.docNo) && input.status?.toLowerCase() === 'active' && input.id)
    const groups = groupProductionInputReturnRows(selectedRows, row.wipSummary?.groups)
    setReturnInputDocNos(docNos)
    setReturnReason('')
    setReturnQuantities(Object.fromEntries(groups.map((group) => [group.key, ''])))
  }

  async function submitInputReturn() {
    if (!row || returnInputDocNos.length === 0) return
    const lines: Array<{ inputId: string; qty: number }> = []
    for (const group of returnRows) {
      let remaining = Number(returnQuantities[group.key] || 0)
      if (!Number.isFinite(remaining) || remaining < 0 || remaining > (group.returnableQty ?? 0) + 0.000001) {
        setError(`จำนวนคืนของ ${group.productName} ต้องไม่เกิน ${formatMoney(group.returnableQty ?? 0)} กก.`)
        return
      }
      for (const inputId of group.inputIds) {
        if (remaining <= 0) break
        const source = row.inputs.find((input) => input.id === inputId)
        const available = source?.returnableQty ?? 0
        const qty = Math.min(remaining, available)
        if (qty > 0) lines.push({ inputId, qty })
        remaining -= qty
      }
    }
    if (lines.length === 0) {
      setError('กรุณาระบุจำนวนที่ต้องการคืนอย่างน้อย 1 รายการ')
      return
    }
    if (!returnReason.trim()) {
      setError('กรุณาระบุเหตุผลการคืนวัตถุดิบ')
      return
    }
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/inputs/return`, {
        body: JSON.stringify({ lines, reason: returnReason.trim() }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setReturnInputDocNos([])
      setReturnQuantities({})
      setReturnReason('')
      setTab('input')
    })
  }

  async function reverseMovement(kind: 'outputs', docNo: string) {
    if (!row) return
      const reason = window.prompt('เหตุผลการยกเลิกผลผลิต')?.trim()
    if (!reason) return
    await runAction(async () => {
      const endpoint = `/api/production/orders/${encodeURIComponent(row.docNo)}/outputs/${encodeURIComponent(docNo)}/void`
      await dailyFetchJson(endpoint, {
        body: JSON.stringify({ date: todayDateInput(), reason }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setTab('output')
    })
  }

  async function runAction(action: () => Promise<void>) {
    setError(null)
    setIsSaving(true)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(false) }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-7xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 dark:bg-[#0f172a] border-0 outline-none focus:outline-none max-h-[92vh] animate-fade-in" hideClose>
        <DialogHeader className="shrink-0 rounded-none border-b border-slate-800 bg-slate-900 px-4 py-4 text-white dark:border-slate-700 dark:bg-[#0f172a] sm:px-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <DialogTitle className="font-mono text-lg font-bold text-white">{isCreate ? 'ใบสั่งผลิตใหม่' : row?.docNo ?? ''}</DialogTitle>
                {!isCreate ? <StatusBadge status={row?.status ?? '-'} /> : null}
                {!isCreate ? <DialogDescription className="min-w-0 flex-1 break-words text-sm text-slate-300">{`${row?.productName || '-'} · ${row?.branchName || '-'}`}</DialogDescription> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {isCreate ? (
                <>
                  <ModalDismissButton onClick={() => onClose(false)} />
                  <button
                    className="h-11 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:h-9"
                    disabled={isSaving}
                    type="button"
                    onClick={() => void submitCreate()}
                  >
                    {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </>
              ) : row ? (
                <>
                  {row.status !== 'Completed' && row.status !== 'Cancelled' ? (
                    <button className="h-11 rounded-md bg-emerald-600 px-4 text-sm font-normal text-white hover:bg-emerald-700 disabled:opacity-50 sm:h-9" disabled={isSaving} type="button" onClick={() => void patchOrder('complete')}>จบงาน</button>
                  ) : null}
                  {row.inputCount <= 0 && row.outputCount <= 0 && row.status !== 'Cancelled' ? (
                    <button className="h-11 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-medium text-white hover:border-rose-700 hover:bg-rose-700 disabled:opacity-50 sm:h-9" disabled={isSaving} type="button" onClick={() => void patchOrder('cancel')}>ยกเลิกใบสั่งผลิต</button>
                  ) : null}
                  <ModalDismissButton onClick={() => onClose(false)} />
                </>
              ) : null}
            </div>
          </div>
          {error ? <div className="mt-3"><Alert tone="red" title="บันทึกไม่สำเร็จ" text={error} /></div> : null}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 space-y-3 p-4">
          {!isCreate ? (
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <Metric label="วัตถุดิบเบิก (กก.)" value={formatMoney(row?.inputQty ?? 0)} tone="danger" />
              <Metric label="ต้นทุนวัตถุดิบ (บาท)" value={formatMoney(row?.inputCost ?? 0)} />
              <Metric label="วัตถุดิบระหว่างผลิต (กก.)" value={formatMoney(rowWipQty)} />
              <Metric label="ผลผลิตที่ได้ (กก.)" value={formatMoney(row?.outputQty ?? 0)} />
              <Metric label="มูลค่าผลผลิตที่ได้ (บาท)" value={formatMoney(row?.outputValue ?? 0)} />
              <Metric label="อัตราผลที่ได้" value={`${((row?.inputQty ?? 0) > 0 ? ((row?.outputQty ?? 0) / (row?.inputQty ?? 1)) * 100 : 0).toFixed(1)}%`} />
            </div>
          ) : null}

          {!isCreate ? (
            <Tabs className="gap-0" value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
              <TabsList className="w-full flex-nowrap overflow-x-auto" variant="line">
                <TabsTrigger className="min-h-11 px-4 font-semibold dark:text-slate-300 dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-white" value="header" variant="line">ข้อมูลทั่วไป</TabsTrigger>
                <TabsTrigger className="min-h-11 px-4 font-semibold dark:text-slate-300 dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-white" value="input" variant="line">วัตถุดิบเบิก ({row?.inputCount ?? 0})</TabsTrigger>
                <TabsTrigger className="min-h-11 px-4 font-semibold dark:text-slate-300 dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-white" value="output" variant="line">ผลผลิต ({row?.outputCount ?? 0})</TabsTrigger>
                <TabsTrigger className="min-h-11 px-4 font-semibold dark:text-slate-300 dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-white" value="history" variant="line">ประวัติใบสั่งผลิต</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {(isCreate || tab === 'header') ? (
            isCreate ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600"><span className="font-bold text-red-600">*</span> ช่องที่จำเป็นต้องกรอก</p>
                {/* กลุ่มที่ 1: ข้อมูลพื้นฐาน */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">ข้อมูลพื้นฐาน</h3>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <SelectField error={createErrors.branchCode} label="สาขา *" placeholder="เลือกสาขา" value={createForm.branchCode} options={options.branches} onChange={updateCreateBranch} />
                    <SearchCombobox
                      error={createErrors.targetProductCode}
                      errorKey="targetProductCode"
                      inputId="production-order-target-product"
                      label="สินค้าที่ผลิต *"
                      options={productSearchOptions}
                      placeholder="พิมพ์รหัส/ชื่อสินค้าที่ผลิต..."
                      value={createForm.targetProductCode}
                      onChange={(targetProductCode) => updateCreateForm('targetProductCode', targetProductCode)}
                    />
                    <FormField error={createErrors.shift} label="กะการผลิต *">
                      <Select className="h-10 w-full" value={createForm.shift} onChange={(event) => updateCreateForm('shift', event.target.value)}>
                        <option value="เช้า">เช้า</option>
                        <option value="บ่าย">บ่าย</option>
                      </Select>
                    </FormField>
                  </div>
                </div>

                {/* กลุ่มที่ 2: เครื่องจักร & ไลน์ผลิต */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">เครื่องจักรและไลน์ผลิต</h3>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <SelectField error={createErrors.machineCode} hideCode label="เครื่องจักร *" placeholder="เลือกเครื่องจักร" value={createForm.machineCode} options={machineOptions} onChange={updateCreateMachine} />
                    <SelectField error={createErrors.productionLineCode} hideCode label="ไลน์ผลิต *" placeholder="เลือกไลน์ผลิต" value={createForm.productionLineCode} options={productionLineOptions} onChange={(productionLineCode) => updateCreateForm('productionLineCode', productionLineCode)} />
                    <div className="md:col-span-3">
                      <FormField label="หมายเหตุ">
                        <textarea className="min-h-20 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)" value={createForm.notes} onChange={(event) => updateCreateForm('notes', event.target.value)} />
                      </FormField>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลใบสั่งผลิต</h4>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                    <ReadField label="เลขที่เอกสาร" value={row?.docNo ?? '-'} />
                    <ReadField label="วันที่เริ่มผลิต" value={row?.startDate ? formatDateDisplay(row.startDate) : '-'} />
                    <ReadField label="วันที่สร้างรายการ" value={formatMovementDateTime(row?.createdAt)} />
                    <ReadField label="สถานะผลิต" value={row?.status ? statusLabel(row.status) : '-'} />
                    <ReadField label="สินค้าเป้าหมาย" value={row?.productName ?? '-'} />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">การผลิตและคลัง</h4>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                    <ReadField label="สาขา" value={row?.branchName ?? '-'} />
                    <ReadField label="เครื่องจักร" value={row?.machineName ?? '-'} />
                    <ReadField label="คลังรับผลผลิต" value={row?.warehouseName ?? ''} />
                    <ReadField label="ไลน์ผลิต" value={row?.productionLineName ?? '-'} />
                    <ReadField label="หมายเหตุ" value={row?.notes || '-'} />
                  </div>
                </div>
              </div>
            )
          ) : null}

          {!isCreate && tab === 'input' ? (
            <MovementPanel
              actionLabel="บันทึกการเบิก"
              canWrite={canWrite}
              isSaving={isSaving}
              reversalLabel="คืนวัตถุดิบ"
              rows={row?.inputs ?? []}
              title="สรุปวัตถุดิบใน WIP"
              wipSummary={row?.wipSummary}
              wipRows={row?.inputs ?? []}
              hideDate
              hideDocument
              hideTotalValue
              hideWarehouse
              historyBeforeForm
              onGroupReturn={openInputReturn}
              onReverse={() => undefined}
              form={(
                <div className="space-y-3 text-sm">
                  <div className="md:col-span-4">
                    <ProductStockPreview
                      destinationWarehouseName={row?.warehouseName ?? ''}
                      error={productStockError}
                      isLoading={isStockPreviewLoading}
                      isReady={true}
                      stock={productStock}
                    />
                  </div>
                  {inputDrafts.length > 0 ? (
                    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-2 text-center">รายการวัตถุดิบที่เตรียมเบิก</th>
                            <th className="p-2 text-center">คลัง</th>
                            <th className="p-2 text-right">น้ำหนัก (กก.)</th>
                            <th className="w-16 p-2 text-center">จัดการ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {inputDrafts.map((draft, index) => (
                            <tr key={draft.id}>
                              <td className="p-2 text-center">
                                <span className="block font-semibold">{options.products.find((product) => product.code === draft.productCode)?.name ?? draft.productCode}</span>
                                <span className="font-mono text-[11px] text-slate-500">{draft.productCode} · {stockCategoryLabel(draft.stockStatus)}</span>
                              </td>
                              <td className="p-2 text-center">{inputWarehouseOptions.find((warehouse) => warehouse.code === draft.sourceWarehouseCode)?.name ?? draft.sourceWarehouseCode}</td>
                              <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(Number(draft.netQty))}</td>
                              <td className="p-2 text-center">
                                <button className="text-xs font-semibold text-rose-600 hover:text-rose-700" type="button" onClick={() => setInputDrafts((drafts) => drafts.filter((_, draftIndex) => draftIndex !== index))}>ลบ</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="md:col-span-2">
                      <SearchCombobox inputId="production-input-product" label="สินค้า *" options={productSearchOptions} placeholder="พิมพ์รหัส/ชื่อสินค้า..." value={inputForm.productCode} onChange={(productCode) => setInputForm((form) => ({ ...form, productCode }))} />
                    </div>
                    <SelectField
                      hideCode={true}
                      selectId="production-input-source-warehouse"
                      label="คลังวัตถุดิบที่เบิก *"
                      required
                      value={inputForm.sourceWarehouseCode}
                      options={inputWarehouseOptions}
                      onChange={(sourceWarehouseCode) => {
                        const selectedWarehouse = inputWarehouseOptions.find((w) => w.code === sourceWarehouseCode)
                        const inferredStatus = selectedWarehouse?.type?.toUpperCase() === 'FG' ? 'FG' : 'RM'
                        setInputForm((form) => ({ ...form, sourceWarehouseCode, stockStatus: inferredStatus }))
                      }}
                    />
                    <FormField label="น้ำหนักรวม (กก.) *"><input key={`input-net-${row?.inputCount ?? 0}-${inputDrafts.length}`} ref={inputNetQtyRef} id="production-input-net-qty" className={quantityInputClass} defaultValue={inputForm.netQty} inputMode="decimal" min="0" placeholder="0.00" step="0.01" type="number" required aria-required="true" onBlur={formatQuantityInputOnBlur} onInput={sanitizeQuantityInput} onKeyDown={preventQuantityExponent} /></FormField>
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-md border border-blue-600 bg-white px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50" type="button" onClick={() => addInputDraft(document.getElementById('production-input-product')?.closest('form') as HTMLFormElement | null ?? undefined)}>
                      + เพิ่มรายการวัตถุดิบ
                    </button>
                  </div>
                </div>
              )}
              onSubmit={() => void submitInput()}
            />
          ) : null}

          {!isCreate && tab === 'output' ? (
            <MovementPanel
              actionLabel="บันทึกผลผลิต"
              canWrite={canWrite}
              isSaving={isSaving}
              reversalLabel="คืนวัตถุดิบ"
              rows={row?.outputs ?? []}
              title="ผลผลิต"
              outputResult
              formTitle="ข้อมูลการผลิต"
              wipRows={row?.inputs ?? []}
              wipSummary={displayWipSummary}
              onReverse={(docNo) => void reverseMovement('outputs', docNo)}
              form={(
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <FormField label="วันที่ผลิต *"><DatePickerInput className="max-w-[16rem]" value={outputForm.date} onChange={(date) => setOutputForm((form) => ({ ...form, date }))} /></FormField>
                  <div className="space-y-2 md:col-span-3">
                    <div className="flex items-center justify-between gap-3">
                      <h5 className="text-xs font-bold text-slate-600">ตารางรายการวัตถุดิบใน WIP ที่ใช้ผลิต</h5>
                    </div>
                    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                      <table className="min-w-[760px] w-full text-xs">
                        <thead className="bg-slate-100 text-slate-600"><tr><th className="p-2 text-center">วัตถุดิบ <span className="text-red-600">*</span></th><th className="w-64 p-2 text-right">น้ำหนักที่ใช้ผลิต (กก.) <span className="text-red-600">*</span></th><th className="w-36 p-2 text-center">จัดการ</th></tr></thead>
                        <tbody className="divide-y divide-slate-200">
                          {outputWipDrafts.map((draft, index) => {
                            const source = wipSourceOptions.find((option) => option.key === draft.sourceKey)
                            const draftOptions = source && !availableWipSourceOptions.some((option) => option.key === source.key) ? [source, ...availableWipSourceOptions] : availableWipSourceOptions
                            return <tr key={draft.id}>
                              <td className="p-2"><select aria-label={`วัตถุดิบใน WIP รายการที่ ${index + 1}`} className="h-10 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 text-sm" required value={draft.sourceKey} onChange={(event) => updateOutputWipDraft(index, { sourceKey: event.target.value })}>
                                <option disabled value="">เลือกวัตถุดิบใน WIP</option>
                                {draftOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                              </select></td>
                              <td className="p-2"><input data-output-wip-qty-index={index} aria-label={`น้ำหนักที่ใช้ผลิต รายการที่ ${index + 1}`} className={quantityInputClass} inputMode="decimal" max={getOutputWipAvailableQty(draft.sourceKey, draft.id)} min="0.01" placeholder="0.00" step="0.01" type="number" value={draft.qty} required onChange={(event) => { const value = sanitizeOutputWipQtyInput(event.target.value); const max = getOutputWipAvailableQty(draft.sourceKey, draft.id); updateOutputWipDraft(index, { qty: value }); validateOutputWipQty(value, max) }} onBlur={(event) => { const value = sanitizeOutputWipQtyInput(event.target.value); updateOutputWipDraft(index, { qty: value && Number(value) >= 0 ? Number(value).toFixed(2) : value }); validateOutputWipQty(value, getOutputWipAvailableQty(draft.sourceKey, draft.id)) }} onKeyDown={preventQuantityExponent} /></td>
                              <td className="p-2 text-center"><button aria-label={`ลบวัตถุดิบใน WIP รายการที่ ${index + 1}`} className="font-semibold text-rose-600 hover:text-rose-700" type="button" onClick={() => removeOutputWipDraft(draft.id)}>ลบ</button></td>
                            </tr>
                          })}
                          {showOutputWipEntryRow ? <tr>
                            <td className="p-2">
                              <select aria-label="วัตถุดิบใน WIP" className="h-10 w-full rounded-md border border-slate-300 bg-[#FFF7CC] px-3 text-sm" required value={outputForm.sourceKey} onChange={(event) => {
                                const source = wipSourceOptions.find((option) => option.key === event.target.value)
                                setOutputForm((form) => ({ ...form, sourceKey: event.target.value, sourceWipQty: source ? source.qty.toFixed(2) : '' }))
                              }}>
                                <option disabled value="">เลือกวัตถุดิบใน WIP</option>
                                {availableWipSourceOptions.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
                              </select>
                            </td>
                            <td className="p-2"><input data-output-wip-qty-index={outputWipDrafts.length} key={`output-source-wip-${row?.outputCount ?? 0}-${outputWipDrafts.length}`} ref={outputSourceWipQtyRef} id="production-output-source-wip-qty" aria-label="น้ำหนักที่ใช้ผลิต" className={quantityInputClass} max={getOutputWipAvailableQty(outputForm.sourceKey)} min="0.01" value={outputForm.sourceWipQty ?? ''} inputMode="decimal" placeholder="0.00" step="0.01" type="number" required aria-required="true" onChange={(event) => { const value = sanitizeOutputWipQtyInput(event.target.value); const max = getOutputWipAvailableQty(outputForm.sourceKey); setOutputForm((form) => ({ ...form, sourceWipQty: value })); validateOutputWipQty(value, max) }} onBlur={(event) => { const value = sanitizeOutputWipQtyInput(event.target.value); const numericValue = Number(value); setOutputForm((form) => ({ ...form, sourceWipQty: value && Number.isFinite(numericValue) && numericValue >= 0 ? numericValue.toFixed(2) : value })); validateOutputWipQty(value, getOutputWipAvailableQty(outputForm.sourceKey)) }} onKeyDown={preventQuantityExponent} /></td>
                            <td className="p-2 text-center"><button aria-label="ล้างรายการวัตถุดิบใหม่" className="font-semibold text-rose-600 hover:text-rose-700" type="button" onClick={clearOutputWipDraft}>ลบ</button></td>
                          </tr> : null}
                          <tr>
                            <td className="p-2" colSpan={3}>
                              <button className="h-9 rounded-md border border-blue-600 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50" type="button" onClick={() => {
                                if (!showOutputWipEntryRow) {
                                  setShowOutputWipEntryRow(true)
                                  return
                                }
                                addOutputWipDraft(document.getElementById('production-output-source-wip-qty')?.closest('form') as HTMLFormElement | null ?? undefined)
                              }}>+ เพิ่มรายการ</button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <ProductionOutputDraftTable
                    notes={outputForm.notes}
                    onRemove={removeOutputDraft}
                    outputDate={outputForm.date}
                    outputDrafts={outputDrafts}
                    outputProductOptions={options.products}
                    outputWarehouseOptions={outputWarehouseOptions}
                    productName={row?.productName ?? '-'}
                    sourceWipQty={outputWipDrafts.reduce((sum, draft) => sum + (Number(draft.qty) || 0), 0)}
                  />
                  <div className="md:col-span-3 space-y-2">
                    <h5 className="text-xs font-bold text-slate-600">ตารางรายการผลผลิตที่ได้</h5>
                    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                      <table className="min-w-[920px] w-full text-xs">
                        <thead className="bg-slate-100 text-slate-600"><tr><th className="p-2 text-center">สินค้าที่ได้ <span className="text-red-600">*</span></th><th className="w-56 p-2 text-center">คลังรับผลผลิต <span className="text-red-600">*</span></th><th className="w-52 p-2 text-right">จำนวนผลผลิตที่ได้ (กก.)</th><th className="w-52 p-2 text-right">สูญเสียจากการผลิต (กก.)</th><th className="w-36 p-2 text-center">จัดการ</th></tr></thead>
                        <tbody>
                          <tr>
                            <td className="p-2"><SearchCombobox hideLabel inputId="production-output-product" label="สินค้าที่ได้ *" options={productSearchOptions} placeholder="พิมพ์รหัส/ชื่อสินค้า..." value={outputForm.productCode} onChange={(productCode) => setOutputForm((form) => ({ ...form, productCode }))} /></td>
                            <td className="p-2"><Select aria-invalid="false" id="production-output-destination-warehouse" name="production-output-destination-warehouse" className="h-10 w-full" required value={outputForm.destinationWarehouseCode} onChange={(event) => setOutputForm((form) => ({ ...form, destinationWarehouseCode: event.target.value }))}><option value="">เลือกคลังรับผลผลิต</option>{outputWarehouseOptions.map((option) => <option key={`${option.code}-${option.id}`} value={option.code}>{option.name}</option>)}</Select></td>
                            <td className="p-2"><input key={`output-net-${row?.outputCount ?? 0}-${outputDrafts.length}`} ref={outputNetQtyRef} id="production-output-net-qty" aria-label="จำนวนผลผลิตที่ได้ (กก.)" className={quantityInputClass} defaultValue={outputForm.netQty} inputMode="decimal" min="0" placeholder="0.00" step="0.01" type="number" onBlur={formatQuantityInputOnBlur} onInput={sanitizeQuantityInput} onKeyDown={preventQuantityExponent} /></td>
                            <td className="p-2"><input key={`output-loss-${row?.outputCount ?? 0}-${outputDrafts.length}`} ref={outputLossQtyRef} id="production-output-loss-qty" aria-label="สูญเสียจากการผลิต (กก.)" className={quantityInputClass} defaultValue={outputForm.lossQty} inputMode="decimal" min="0" placeholder="0.00" step="0.01" type="number" onBlur={formatQuantityInputOnBlur} onInput={sanitizeQuantityInput} onKeyDown={preventQuantityExponent} /></td>
                            <td className="p-2 text-center"><button aria-label="ล้างรายการผลผลิตใหม่" className="font-semibold text-rose-600 hover:text-rose-700" type="button" onClick={() => { if (outputNetQtyRef.current) outputNetQtyRef.current.value = ''; if (outputLossQtyRef.current) outputLossQtyRef.current.value = '' }}>ลบ</button></td>
                          </tr>
                          <tr><td className="p-2" colSpan={5}><button className="h-9 rounded-md border border-blue-600 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50" type="button" onClick={() => addOutputDraft(document.getElementById('production-output-net-qty')?.closest('form') as HTMLFormElement | null ?? undefined)}>+ เพิ่มรายการผลผลิต</button></td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <FormField label="หมายเหตุ"><textarea className="min-h-20 w-full resize-y rounded-md border px-3 py-2 text-sm border-slate-300 bg-[#FFF7CC]" value={outputForm.notes} onChange={(event) => setOutputForm((form) => ({ ...form, notes: event.target.value }))} /></FormField>
                  </div>
                </div>
              )}
              onSubmit={(formElement) => void submitOutput(formElement)}
            />
          ) : null}

          {!isCreate && tab === 'history' ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-700">ประวัติใบสั่งผลิต</h3>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"><span className="size-1.5 rounded-full bg-current" />ล่าสุด: {statusLabel(row?.status ?? '')}</span>
              </div>
              <ProductionOrderTimeline events={row?.history ?? []} />
            </section>
          ) : null}
        </div>

      </DialogContent>
      <Dialog open={returnInputDocNos.length > 0} onOpenChange={(open) => { if (!open && !isSaving) setReturnInputDocNos([]) }}>
        <DialogContent className="max-h-[90vh] max-w-5xl bg-white" hideClose>
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle>คืนวัตถุดิบ</DialogTitle>
                <DialogDescription className="mt-1">เลือกจำนวนที่จะคืนเข้าคลังต้นทาง โดยใช้ต้นทุนเฉลี่ยของ WIP ณ เวลาคืน</DialogDescription>
              </div>
              <ModalDismissButton onClick={() => setReturnInputDocNos([])} />
            </div>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto bg-slate-50 p-4">
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="ns-table min-w-full text-sm">
                <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="p-2.5 text-center">สินค้า</th>
                    <th className="p-2.5 text-center">ประเภท</th>
                    <th className="p-2.5 text-center">คลังต้นทาง</th>
                    <th className="p-2.5 text-right">เบิก (กก.)</th>
                    <th className="p-2.5 text-right">คืนแล้ว (กก.)</th>
                    <th className="p-2.5 text-right">คงเหลือคืนได้ (กก.)</th>
                    <th className="p-2.5 text-right">ต้นทุนเฉลี่ย WIP/กก.</th>
                    <th className="p-2.5 text-right">จำนวนคืน (กก.)</th>
                    <th className="p-2.5 text-right">มูลค่าที่คืน (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {returnRows.map((input) => {
                    const returnableQty = input.returnableQty ?? Math.max(0, input.qty - (input.returnedQty ?? 0))
                    const returnQty = Number(returnQuantities[input.key] || 0)
                    return (
                      <tr key={input.key}>
                        <td className="p-2.5 text-center"><span className="block font-semibold">{input.productName}</span><span className="block font-mono text-xs text-slate-400">{input.productCode}</span></td>
                        <td className="p-2.5 text-center font-semibold">{stockCategoryLabel(input.stockStatus)}</td>
                        <td className="p-2.5 text-center">{input.warehouseName}</td>
                        <td className="p-2.5 text-right tabular-nums">{formatMoney(input.qty)}</td>
                        <td className="p-2.5 text-right tabular-nums">{formatMoney(input.returnedQty ?? 0)}</td>
                        <td className="p-2.5 text-right font-semibold tabular-nums">{formatMoney(returnableQty)}</td>
                        <td className="p-2.5 text-right tabular-nums">{formatMoney(input.wipAvgCost)}</td>
                        <td className="p-2.5"><input className={quantityInputClass} inputMode="decimal" max={returnableQty} min="0" placeholder="0.00" step="0.01" type="number" value={returnQuantities[input.key] ?? ''} onChange={(event) => { const groupKey = input.key; const value = sanitizeDecimalInput(event.target.value, 2); setReturnQuantities((current) => ({ ...current, [groupKey]: value })) }} onBlur={(event) => { const groupKey = input.key; const value = sanitizeDecimalInput(event.currentTarget.value, 2); setReturnQuantities((current) => ({ ...current, [groupKey]: value ? Number(value).toFixed(2) : '' })) }} onKeyDown={preventQuantityExponent} /></td>
                        <td className="p-2.5 text-right font-semibold tabular-nums">{formatMoney(returnQty * input.wipAvgCost)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <FormField label="เหตุผลการคืนวัตถุดิบ *"><textarea className="min-h-20 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="ระบุเหตุผลการคืนวัตถุดิบ" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} /></FormField>
          </div>
          <DialogFooter>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={isSaving} type="button" onClick={() => setReturnInputDocNos([])}>ยกเลิก</button>
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={isSaving || returnRows.length === 0} type="button" onClick={() => void submitInputReturn()}>{isSaving ? 'กำลังบันทึก...' : 'บันทึกการคืน'}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={outputQuantityWarning !== null} onOpenChange={(open) => { if (!open) setOutputQuantityWarning(null) }}>
        <DialogContent className="max-w-md bg-white" hideClose>
          <DialogHeader>
            <DialogTitle>จำนวนผลผลิตเกินวัตถุดิบที่ใช้ผลิต</DialogTitle>
            <DialogDescription>จำนวนผลผลิตรวมในตารางมากกว่าน้ำหนักรวมของวัตถุดิบใน WIP ที่เลือก</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 bg-white px-5 py-4 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-4"><span>น้ำหนักวัตถุดิบที่ใช้ผลิต</span><span className="font-semibold tabular-nums">{formatMoney(outputQuantityWarning?.totalSourceWipQty ?? 0)} กก.</span></div>
            <div className="flex items-center justify-between gap-4"><span>จำนวนผลผลิตรวม</span><span className="font-semibold tabular-nums text-rose-700">{formatMoney(outputQuantityWarning?.totalOutputQty ?? 0)} กก.</span></div>
            <p className="pt-2 text-xs text-slate-500">ต้องการเพิ่มรายการนี้ต่อหรือไม่ ระบบจะตรวจสอบซ้ำอีกครั้งก่อนบันทึกผลผลิต</p>
          </div>
          <DialogFooter>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => setOutputQuantityWarning(null)}>ยกเลิก</button>
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" type="button" onClick={() => { if (outputQuantityWarning) appendOutputDraft(outputQuantityWarning.draft); setOutputQuantityWarning(null) }}>ยืนยันเพิ่มรายการ</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

function ProductionOrderTimeline({ events }: { events: ProductionOrderHistoryRow[] }) {
  const [latestFirst, setLatestFirst] = useState(true)
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({})
  const chronologicalEvents = [...events].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return leftTime - rightTime
  })
  const orderedEvents = latestFirst ? chronologicalEvents.reverse() : chronologicalEvents

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          aria-label={latestFirst ? 'เรียงเก่าสุดก่อน' : 'เรียงล่าสุดก่อน'}
          className="inline-flex size-9 items-center justify-center text-slate-500 hover:text-slate-800"
          title={latestFirst ? 'เรียงเก่าสุดก่อน' : 'เรียงล่าสุดก่อน'}
          type="button"
          onClick={() => setLatestFirst((current) => !current)}
        >
          <ArrowDownUp aria-hidden className="size-4" />
        </button>
      </div>
      {orderedEvents.map((event, index) => {
        const eventDateTime = formatMovementDateTimeParts(event.createdAt)
        const eventId = `${event.createdAt}-${event.action}-${index}`
        const isExpanded = Boolean(expandedEventIds[eventId])
        const hasInputDetails = (event.action === 'input_created' || event.action === 'input_returned') && event.totalQty != null
        return (
          <div key={eventId} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
            <div className="pt-1 text-right text-xs text-slate-500">
              <div>{eventDateTime.date}</div>
              {eventDateTime.time ? <div className="mt-1">{eventDateTime.time}</div> : null}
              <div className="mt-1 truncate">{event.createdByName}</div>
            </div>
            <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
              <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${index === 0 ? productionHistoryToneClass(event.toStatus) : 'bg-slate-300'}`} />
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">{productionHistoryActionLabel(event.action)}</div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"><span className="size-1.5 rounded-full bg-current" />{statusLabel(event.toStatus)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{event.fromStatus ? `${statusLabel(event.fromStatus)} → ` : ''}{statusLabel(event.toStatus)}</div>
              {event.details.length > 0 ? (
                <div className="mt-2 grid gap-x-4 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:grid-cols-2">
                  {event.details.map((detail) => <div key={`${detail.label}-${detail.value}`}><span className="text-slate-500">{detail.label}:</span> <span className="font-semibold text-slate-800">{detail.value}</span></div>)}
                </div>
              ) : null}
              {event.documentNo ? <div className="mt-2 text-xs font-semibold text-blue-700">เลขที่เอกสาร: {event.documentNo}</div> : null}
              {event.warehouseNames?.length ? <div className="mt-2 text-xs text-slate-600">คลังที่เบิก: {event.warehouseNames.join(', ')}</div> : null}
              {hasInputDetails ? (
                <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <div className="grid gap-1 sm:grid-cols-3">
                    <div><span className="text-slate-500">{event.action === 'input_returned' ? 'จำนวนที่คืน:' : 'จำนวนที่เบิก:'}</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.totalQty ?? 0)} กก.</span></div>
                    <div><span className="text-slate-500">{event.action === 'input_returned' ? 'ต้นทุนที่คืนจาก WIP:' : 'ต้นทุนที่เบิก:'}</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.totalCost ?? 0)} บาท</span></div>
                    <div><span className="text-slate-500">ต้นทุนเฉลี่ย:</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.averageCost ?? 0)} บาท/กก.</span></div>
                  </div>
                  {event.lines.length > 0 ? (
                    <div className="mt-2">
                      <button className="font-semibold text-blue-700 hover:underline" type="button" onClick={() => setExpandedEventIds((current) => ({ ...current, [eventId]: !current[eventId] }))}>
                        {isExpanded ? 'ซ่อนรายละเอียดรายการ' : `ดูรายละเอียด ${event.lines.length} รายการ`}
                      </button>
                      {isExpanded ? (
                        <div className="mt-2 overflow-x-auto rounded border border-slate-200">
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5 text-left">สินค้า</th><th className="px-2 py-1.5 text-center">ประเภท</th><th className="px-2 py-1.5 text-right">จำนวน (กก.)</th><th className="px-2 py-1.5 text-right">ต้นทุน/กก.</th><th className="px-2 py-1.5 text-right">ต้นทุนรวม</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {event.lines.map((line) => <tr key={`${line.productCode}-${line.warehouseName}`}><td className="px-2 py-1.5 text-left"><div className="font-semibold text-slate-700">{line.productName}</div><div className="text-slate-400">{line.productCode} · {line.warehouseName}</div></td><td className="px-2 py-1.5 text-center">{stockCategoryLabel(line.stockCategory)}</td><td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.qty)}</td><td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.unitCost)}</td><td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.totalCost)}</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {event.action === 'output_created' && (event.outputQty != null || event.lossQty != null) ? (
                <div className="mt-2 grid gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <div><span className="text-slate-500">WIP ที่ใช้:</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.sourceWipQty ?? 0)} กก.</span></div>
                  <div><span className="text-slate-500">ผลผลิต:</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.outputQty ?? 0)} กก.</span></div>
                  <div><span className="text-slate-500">สูญเสีย:</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.lossQty ?? 0)} กก.</span></div>
                  <div><span className="text-slate-500">ต้นทุนผลิต:</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.productionCost ?? 0)} บาท</span></div>
                </div>
              ) : null}
              {event.action === 'output_created' && event.sourceWipLines.length > 0 ? (
                <div className="mt-2 rounded-md border border-amber-100 bg-amber-50/40 px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">วัตถุดิบ WIP ที่ใช้</div>
                  <div className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5 text-left">สินค้า</th><th className="px-2 py-1.5 text-center">ประเภท</th><th className="px-2 py-1.5 text-center">คลังต้นทาง</th><th className="px-2 py-1.5 text-right">จำนวน (กก.)</th><th className="px-2 py-1.5 text-right">ต้นทุน/กก.</th><th className="px-2 py-1.5 text-right">ต้นทุนรวม</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {event.sourceWipLines.map((line) => <tr key={`${line.productCode}-${line.stockCategory}-${line.warehouseName}`}><td className="px-2 py-1.5 text-left"><div className="font-semibold text-slate-700">{line.productName}</div><div className="text-slate-400">{line.productCode}</div></td><td className="px-2 py-1.5 text-center">{stockCategoryLabel(line.stockCategory)}</td><td className="px-2 py-1.5 text-center">{line.warehouseName}</td><td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.qty)}</td><td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.unitCost)}</td><td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.totalCost)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {event.action === 'output_reversed' && event.reverseQty != null ? (
                <div className="mt-2 grid gap-1 rounded-md border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs text-slate-600 sm:grid-cols-3">
                  <div><span className="text-slate-500">จำนวนที่คืน WIP:</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.reverseQty)} กก.</span></div>
                  <div><span className="text-slate-500">ต้นทุนที่คืน WIP:</span> <span className="font-semibold tabular-nums text-slate-800">{formatMoney(event.reverseCost ?? 0)} บาท</span></div>
                  <div><span className="text-slate-500">รายการผลผลิต:</span> <span className="font-semibold text-blue-700">{event.documentNo ?? '-'}</span></div>
                </div>
              ) : null}
              {event.note ? <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">{event.note}</div> : null}
            </div>
          </div>
        )
      })}
      {orderedEvents.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">ยังไม่มีประวัติใบสั่งผลิต</div> : null}
    </div>
  )
}

function MovementPanel({
  actionLabel,
  canWrite,
  dateLabel,
  form,
  formTitle,
  historyBeforeForm = false,
  hideDate = false,
  hideDocument = false,
  hideTotalValue = false,
  hideWarehouse = false,
  isSaving,
  onGroupReturn,
  onReverse,
  reversalLabel,
  onSubmit,
  outputResult = false,
  rows,
  wipSummary,
  wipRows,
  title,
}: {
  actionLabel: string
  canWrite: boolean
  form: React.ReactNode
  formTitle?: string
  historyBeforeForm?: boolean
  hideDate?: boolean
  hideDocument?: boolean
  hideTotalValue?: boolean
  hideWarehouse?: boolean
  isSaving: boolean
  onGroupReturn?: (docNos: string[]) => void
  onReverse: (docNo: string) => void
  reversalLabel: string
  onSubmit: (formElement?: HTMLFormElement) => void
  outputResult?: boolean
  rows: ProductionMovementRow[]
  title: string
  dateLabel?: string
  wipSummary?: ProductionWipSummary
  wipRows?: ProductionMovementRow[]
}) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const movementColumnCount = 9 - (hideDate ? 1 : 0) - (hideDocument ? 1 : 0) - (hideTotalValue ? 1 : 0) - (hideWarehouse ? 1 : 0)
  return (
    <div className={`flex flex-col rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm ${historyBeforeForm ? 'space-y-5' : 'space-y-3'}`}>
      {outputResult ? <ProductionOutputResultTable canVoid={canWrite} onVoid={onReverse} rows={rows} /> : null}
      {wipSummary ? <WipSummaryTable canWrite={canWrite} onReverse={onGroupReturn ?? (() => undefined)} reversalLabel={reversalLabel} rows={wipRows ?? []} showActions={!outputResult} summary={wipSummary} /> : null}
      {canWrite ? (
        <form
          ref={formRef}
          noValidate
          className={`rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 ${outputResult ? 'order-3' : historyBeforeForm ? 'order-2 mt-4' : 'order-1'}`}
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(formRef.current ?? undefined)
          }}
        >
          {formTitle ? <h4 className="border-b border-slate-200 pb-2 text-sm font-bold text-slate-700">{formTitle}</h4> : null}
          {form}
          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              className="rounded-md bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? 'กำลังบันทึก...' : actionLabel}
            </button>
          </div>
        </form>
      ) : null}

      {!wipSummary && !outputResult ? <div className={`space-y-2 ${historyBeforeForm ? 'order-1' : 'order-2'}`}>
        <h4 className="px-1 text-sm font-bold text-slate-700">{title}</h4>
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="ns-table hidden min-w-full table-fixed divide-y divide-slate-200 text-sm lg:table" style={{ minWidth: 980 }}>
          <colgroup>
            {!hideDate ? <col style={{ width: 90 }} /> : null}
            {!hideDocument ? <col style={{ width: 130 }} /> : null}
            <col style={{ width: 180 }} />
            {!hideWarehouse ? <col style={{ width: 140 }} /> : null}
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            {!hideTotalValue ? <col style={{ width: 120 }} /> : null}
            <col style={{ width: 90 }} />
            <col />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>
              {!hideDate ? <th className="p-2.5 text-center">{dateLabel ?? 'วันที่/เวลา'}</th> : null}
              {!hideDocument ? <th className="p-2.5 text-center">เลขที่</th> : null}
              <th className="p-2.5 text-center">สินค้า</th>
              {!hideWarehouse ? <th className="p-2.5 text-center">คลัง</th> : null}
              <th className="p-2.5 text-right">น้ำหนัก (กก.)</th>
              <th className="p-2.5 text-right">ราคา/กก.</th>
              {!hideTotalValue ? <th className="p-2.5 text-right">รวมมูลค่า</th> : null}
              <th className="p-2.5 text-center">สถานะ</th>
              <th className="p-2.5 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, index) => {
              const isRowActive = row.status?.toLowerCase() === 'active'
              const isRowReturned = row.status?.toLowerCase() === 'returned'
              const isRowReversed = row.status?.toLowerCase() === 'reversed' || isRowReturned
              const movementDateTime = formatMovementDateTimeParts(row.createdAt ?? row.date)
              return (
                <tr key={index} className={`hover:bg-slate-50 ${isRowReversed ? 'bg-slate-50/50 text-slate-400 line-through' : ''}`}>
                  {!hideDate ? <td className="p-2.5 whitespace-nowrap text-center"><span className="block">{movementDateTime.date}</span>{movementDateTime.time ? <span className="block text-xs text-slate-500">{movementDateTime.time}</span> : null}</td> : null}
                  {!hideDocument ? <td className="p-2.5 whitespace-nowrap text-center font-mono">{row.docNo}</td> : null}
                  <td className="min-w-0 p-2.5 text-center">
                    <span className="block truncate font-semibold" title={row.productName}>{row.productName}</span>
                    <div className="truncate text-xs text-slate-400 font-mono">{row.productCode}</div>
                  </td>
                  {!hideWarehouse ? <td className="min-w-0 p-2.5 text-center">
                    <span className="block truncate" title={row.warehouseName}>{row.warehouseName}</span>
                  </td> : null}
                  <td className="p-2.5 whitespace-nowrap text-right font-medium tabular-nums">{formatMoney(row.qty)}</td>
                  <td className="p-2.5 whitespace-nowrap text-right text-slate-500 tabular-nums">{formatMoney(row.unitCost)}</td>
                  {!hideTotalValue ? <td className="p-2.5 whitespace-nowrap text-right font-semibold text-slate-800 tabular-nums">{formatMoney(row.totalCost)}</td> : null}
                  <td className="p-2.5 text-center">
                    <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${isRowActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {isRowActive ? 'ใช้งาน' : isRowReturned ? 'คืนครบแล้ว' : 'ย้อนรายการแล้ว'}
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    {canWrite && isRowActive ? (
                      <TableActionButton
                        label={reversalLabel}
                        menu={<TableActionMenuItem onSelect={() => onReverse(row.docNo)}>{reversalLabel}</TableActionMenuItem>}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="p-8 text-center text-slate-400" colSpan={movementColumnCount}>
                  ยังไม่มีรายการเคลื่อนไหว
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="block lg:hidden divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => {
            const isRowActive = row.status?.toLowerCase() === 'active'
            const isRowReturned = row.status?.toLowerCase() === 'returned'
            const isRowReversed = row.status?.toLowerCase() === 'reversed' || isRowReturned
            const movementDateTime = formatMovementDateTimeParts(row.createdAt ?? row.date)
            return (
              <div key={index} className={`p-4 space-y-3 text-base ${isRowReversed ? 'bg-slate-50/50 text-slate-400 line-through' : ''}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-bold text-slate-900 text-lg leading-tight block">{index + 1}. {row.productName}</span>
                    <span className="text-sm text-slate-500 font-mono block mt-0.5">{row.productCode}</span>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${isRowActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {isRowActive ? 'ใช้งาน' : isRowReturned ? 'คืนครบแล้ว' : 'ย้อนรายการแล้ว'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 py-2 border-t border-b border-slate-100/50 text-center text-slate-600 text-sm">
                  {!hideDate ? <div><span className="text-slate-500 font-medium">{dateLabel ?? 'วันที่/เวลา'}:</span><span className="block">{movementDateTime.date}</span>{movementDateTime.time ? <span className="block text-xs text-slate-500">{movementDateTime.time}</span> : null}</div> : null}
                  {!hideDocument ? <div><span className="text-slate-500 font-medium">เลขที่:</span> <span className="font-mono">{row.docNo}</span></div> : null}
                  {!hideWarehouse ? <div><span className="text-slate-500 font-medium">คลัง:</span> {row.warehouseName}</div> : null}
                </div>

                <div className="grid grid-cols-3 gap-2 py-2.5 bg-slate-50 rounded-md">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">น้ำหนัก (กก.)</span>
                    <span className="block text-right font-bold text-slate-950 text-sm tabular-nums">{formatMoney(row.qty)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">ราคา/กก.</span>
                    <span className="block text-right font-semibold text-slate-700 text-sm tabular-nums">{formatMoney(row.unitCost)}</span>
                  </div>
                  {!hideTotalValue ? <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">รวมมูลค่า</span>
                    <span className="block text-right font-bold text-blue-700 text-sm tabular-nums">{formatMoney(row.totalCost)}</span>
                  </div> : null}
                </div>

                {canWrite && isRowActive && (
                  <div className="flex justify-end pt-1">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 h-9 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => onReverse(row.docNo)}
                    >
                      {reversalLabel}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {rows.length === 0 ? (
            <div className="p-6 text-center text-slate-400">ยังไม่มีรายการเคลื่อนไหว</div>
          ) : null}
        </div>
        </div>
      </div> : null}
    </div>
  )
}

function WipSummaryTable({ canWrite, onReverse, reversalLabel, rows, showActions = true, summary }: { canWrite: boolean; onReverse: (docNos: string[]) => void; reversalLabel: string; rows: ProductionMovementRow[]; showActions?: boolean; summary: ProductionWipSummary }) {
  const activeDocNos = [...new Set(rows.filter((row) => row.status?.toLowerCase() === 'active').map((row) => row.docNo))]
  const showReturnActions = showActions && canWrite && activeDocNos.length > 0
  const visibleGroups = summary.groups
  return (
    <div className={`space-y-2 ${showActions ? 'order-1' : 'order-3'}`}>
      <h4 className="px-1 text-sm font-bold text-slate-700">สรุปวัตถุดิบใน WIP</h4>
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table min-w-full table-fixed divide-y divide-slate-200 text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>
              <th className="p-2.5 text-center">สินค้า</th>
              <th className="p-2.5 text-center">คลังต้นทาง</th>
              <th className="p-2.5 text-right" data-column-align="right">เบิกสุทธิ (กก.)</th>
              <th className="p-2.5 text-right" data-column-align="right">ใช้ไปผลิตแล้ว (กก.)</th>
              <th className="p-2.5 text-right" data-column-align="right">คงเหลือใน WIP (กก.)</th>
              <th className="p-2.5 text-right" data-column-align="right">มูลค่าวัตถุดิบใน WIP (บาท)</th>
              <th className="p-2.5 text-right" data-column-align="right">ต้นทุนเฉลี่ย WIP/กก.</th>
              {showReturnActions ? <th className="p-2.5 text-center">จัดการ</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => (
              <tr key={`${group.productCode}-${group.stockCategory}-${group.warehouseName}`}>
                <td className="p-2.5 text-center"><span className="block font-semibold text-slate-700">{group.productName}</span><span className="block text-xs font-mono text-slate-400">{group.productCode}</span></td>
                <td className="p-2.5 text-center text-slate-600">{group.warehouseName}</td>
                <td className="p-2.5 text-right font-semibold tabular-nums">{formatMoney(group.inputQty)}</td>
                <td className="p-2.5 text-right tabular-nums">{formatMoney(group.consumedWipQty)}</td>
                <td className={`p-2.5 text-right font-semibold tabular-nums ${group.wipQty < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatMoney(group.wipQty)}</td>
                <td className={`p-2.5 text-right tabular-nums ${group.wipQty < 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatMoney(group.wipQty * group.avgCost)}</td>
                <td className="p-2.5 text-right text-slate-600 tabular-nums">{formatMoney(group.avgCost)}</td>
                {showReturnActions ? <td className="p-2.5 text-center"><button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => onReverse(group.docNos)}>{reversalLabel}</button></td> : null}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="p-2.5 text-center text-slate-700" colSpan={2}>รวมวัตถุดิบใน WIP</td>
              <td className="p-2.5 text-right tabular-nums">{formatMoney(summary.inputQty)}</td>
              <td className="p-2.5 text-right tabular-nums">{formatMoney(summary.consumedWipQty)}</td>
              <td className={`p-2.5 text-right tabular-nums ${summary.wipQty < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatMoney(summary.wipQty)}</td>
              <td className={`p-2.5 text-right tabular-nums ${summary.wipQty < 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatMoney(summary.wipQty * summary.avgCost)}</td>
              <td className="p-2.5 text-right text-slate-600 tabular-nums">{formatMoney(summary.avgCost)}</td>
              {showReturnActions ? <td className="p-2.5" /> : null}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:hidden">
        {visibleGroups.map((group) => (
          <div key={`${group.productCode}-${group.stockCategory}-${group.warehouseName}`} className="space-y-3 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold leading-5 text-slate-800">{group.productName}</div>
                <div className="mt-0.5 font-mono text-xs text-slate-400">{group.productCode}</div>
              </div>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="text-xs font-semibold text-slate-500">คลังต้นทาง</span>
              <span className="mt-0.5 block break-words font-medium text-slate-700">{group.warehouseName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-xs font-semibold text-slate-500">เบิกสุทธิ (กก.)</div>
                <div className="mt-0.5 text-right font-semibold tabular-nums text-slate-800">{formatMoney(group.inputQty)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">มูลค่าวัตถุดิบใน WIP</div>
                <div className={`mt-0.5 text-right tabular-nums ${group.wipQty < 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatMoney(group.wipQty * group.avgCost)} บาท</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">ต้นทุนเฉลี่ย WIP/กก.</div>
                <div className="mt-0.5 text-right tabular-nums text-slate-600">{formatMoney(group.avgCost)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">คงเหลือ WIP (กก.)</div>
                <div className={`mt-0.5 text-right font-semibold tabular-nums ${group.wipQty < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatMoney(group.wipQty)}</div>
              </div>
            </div>
            {showReturnActions ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-2"><button className="min-h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => onReverse(group.docNos)}>{reversalLabel}</button></div> : null}
          </div>
        ))}
        <div className="space-y-3 bg-slate-50 p-3.5">
          <div className="font-semibold text-slate-700">รวมวัตถุดิบใน WIP</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><div className="text-xs font-semibold text-slate-500">เบิกสุทธิ</div><div className="mt-0.5 text-right tabular-nums text-slate-800">{formatMoney(summary.inputQty)}</div></div>
            <div><div className="text-xs font-semibold text-slate-500">ใช้ไปผลิตแล้ว</div><div className="mt-0.5 text-right tabular-nums text-slate-800">{formatMoney(summary.consumedWipQty)}</div></div>
            <div><div className="text-xs font-semibold text-slate-500">คงเหลือ WIP</div><div className={`mt-0.5 text-right tabular-nums ${summary.wipQty < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatMoney(summary.wipQty)}</div></div>
            <div><div className="text-xs font-semibold text-slate-500">มูลค่าวัตถุดิบใน WIP</div><div className={`mt-0.5 text-right tabular-nums ${summary.wipQty < 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatMoney(summary.wipQty * summary.avgCost)} บาท</div></div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm"><span className="text-slate-500">ต้นทุนเฉลี่ย WIP/กก.</span><span className="font-semibold tabular-nums text-slate-700">{formatMoney(summary.avgCost)}</span></div>
        </div>
      </div>
    </div>
  )
}

function ProductionOutputResultTable({ canVoid, onVoid, rows }: { canVoid: boolean; onVoid: (docNo: string) => void; rows: ProductionMovementRow[] }) {
  const results = useMemo(() => {
    const grouped = new Map<string, {
      categoryCode: string
      createdAt: string | null | undefined
      date: string
      docNo: string
      lossQty: number
      notes: string | null | undefined
      outputQty: number
      productCode: string
      productName: string
      sourceWipQty: number
      status: string
      warehouseName: string
    }>()
    for (const row of rows) {
      const current = grouped.get(row.docNo) ?? {
        categoryCode: '',
        createdAt: row.createdAt,
        date: row.date,
        docNo: row.docNo,
        lossQty: 0,
        notes: row.notes,
        outputQty: 0,
        productCode: row.productCode,
        productName: row.productName,
        sourceWipQty: 0,
        status: row.status,
        warehouseName: row.warehouseName,
      }
      current.sourceWipQty += row.sourceWipQty ?? row.qty
      if (row.categoryCode === 'LOSS') current.lossQty += row.qty
      else {
        current.outputQty += row.qty
        current.categoryCode = row.categoryCode ?? current.categoryCode
        current.productCode = row.productCode
        current.productName = row.productName
        current.warehouseName = row.warehouseName
      }
      current.status = row.status
      current.notes = row.notes ?? current.notes
      grouped.set(row.docNo, current)
    }
    return [...grouped.values()]
  }, [rows])

  return (
    <div className="order-1 space-y-2">
      <h4 className="px-1 text-sm font-bold text-slate-700">ผลลัพธ์จากการผลิต</h4>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="ns-table hidden min-w-full table-fixed divide-y divide-slate-200 text-sm lg:table" style={{ minWidth: 980 }}>
          <colgroup><col style={{ width: 180 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col />{canVoid ? <col style={{ width: 130 }} /> : null}</colgroup>
          <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600"><tr>
            <th className="p-2.5 text-center">สินค้า</th><th className="p-2.5 text-center">ประเภท</th><th className="p-2.5 text-center">คลังรับผลผลิต</th><th className="p-2.5 text-right">จำนวนผลผลิตที่ได้ (กก.)</th><th className="p-2.5 text-right">สูญเสีย (กก.)</th><th className="p-2.5 text-center">วันที่ผลิต</th><th className="p-2.5 text-right">WIP ที่ใช้ (กก.)</th><th className="p-2.5 text-left">หมายเหตุ</th>{canVoid ? <th className="p-2.5 text-center">จัดการ</th> : null}
          </tr></thead>
          <tbody className="divide-y divide-slate-200">
            {results.map((result) => {
              const dateTime = formatMovementDateTimeParts(result.createdAt)
              return <tr key={result.docNo}>
                <td className="p-2.5 text-center"><span className="block truncate font-semibold" title={result.productName}>{result.productName}</span><span className="block truncate font-mono text-xs text-slate-400">{result.productCode}</span></td>
                <td className="p-2.5 text-center">{result.categoryCode ? stockCategoryLabel(result.categoryCode) : '-'}</td>
                <td className="p-2.5 text-center">{result.warehouseName || '-'}</td>
                <td className="p-2.5 text-right font-semibold tabular-nums">{formatMoney(result.outputQty)}</td>
                <td className="p-2.5 text-right tabular-nums">{formatMoney(result.lossQty)}</td>
                <td className="p-2.5 text-center whitespace-nowrap"><span className="block">{formatDateDisplay(result.date)}</span><span className="block text-xs text-slate-500">{dateTime.time}</span></td>
                <td className="p-2.5 text-right tabular-nums">{formatMoney(result.sourceWipQty)}</td>
                <td className="p-2.5 text-left truncate" title={result.notes ?? ''}>{result.notes || '-'}</td>
                {canVoid ? <td className="p-2.5 text-center">{result.status === 'active' ? <button className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50" type="button" onClick={() => onVoid(result.docNo)}>ยกเลิกผลผลิต</button> : <span className="text-xs text-slate-400">ยกเลิกแล้ว</span>}</td> : null}
              </tr>
            })}
            {results.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={canVoid ? 9 : 8}>ยังไม่มีผลลัพธ์จากการผลิต</td></tr> : null}
          </tbody>
        </table>
        <div className="divide-y divide-slate-200 lg:hidden">
          {results.map((result) => <div key={result.docNo} className="space-y-2 p-3.5 text-sm">
            <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-800">{result.productName}</div><div className="font-mono text-xs text-slate-400">{result.productCode} · {stockCategoryLabel(result.categoryCode)}</div></div><div className="text-right text-xs text-slate-500">{result.warehouseName || '-'}<br />{formatDateDisplay(result.date)} {formatMovementDateTimeParts(result.createdAt).time}</div></div>
            <div className="grid grid-cols-3 gap-2 border-y border-slate-100 py-2 text-right tabular-nums"><div><div className="text-xs text-slate-500">ผลผลิต</div>{formatMoney(result.outputQty)}</div><div><div className="text-xs text-slate-500">สูญเสีย</div>{formatMoney(result.lossQty)}</div><div><div className="text-xs text-slate-500">WIP ที่ใช้</div>{formatMoney(result.sourceWipQty)}</div></div>
            {result.notes ? <div className="text-xs text-slate-500">หมายเหตุ: {result.notes}</div> : null}
            {canVoid && result.status === 'active' ? <div className="flex justify-end border-t border-slate-100 pt-2"><button className="min-h-9 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50" type="button" onClick={() => onVoid(result.docNo)}>ยกเลิกผลผลิต</button></div> : null}
          </div>)}
          {results.length === 0 ? <div className="p-8 text-center text-slate-400">ยังไม่มีผลลัพธ์จากการผลิต</div> : null}
        </div>
      </div>
    </div>
  )
}

function ProductionOutputDraftTable({ notes, onRemove, outputDate, outputDrafts, outputProductOptions, outputWarehouseOptions, productName, sourceWipQty }: { notes: string; onRemove: (index: number) => void; outputDate: string; outputDrafts: ProductionOutputDraft[]; outputProductOptions: Option[]; outputWarehouseOptions: Option[]; productName: string; sourceWipQty: number }) {
  return (
    <div className="md:col-span-3 space-y-2">
      <h4 className="px-1 text-sm font-bold text-slate-700">รายการผลผลิตที่เตรียมส่งเข้าคลัง</h4>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="ns-table min-w-full table-fixed divide-y divide-slate-200 text-sm" style={{ minWidth: 1220 }}>
          <colgroup><col style={{ width: 180 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col /><col style={{ width: 90 }} /></colgroup>
          <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600"><tr><th className="p-2.5 text-center">สินค้า</th><th className="p-2.5 text-center whitespace-nowrap">ประเภท</th><th className="p-2.5 text-center">คลังรับผลผลิต</th><th className="p-2.5 text-right" data-column-align="right">จำนวนผลผลิตที่ได้ (กก.)</th><th className="p-2.5 text-right" data-column-align="right">สูญเสีย (กก.)</th><th className="p-2.5 text-center">วันที่ผลิต</th><th className="p-2.5 text-right" data-column-align="right">WIP ที่ใช้ (กก.)</th><th className="p-2.5 text-left">หมายเหตุ</th><th className="p-2.5 text-center">จัดการ</th></tr></thead>
          <tbody className="divide-y divide-slate-200">
            {outputDrafts.map((draft, index) => {
              const warehouse = outputWarehouseOptions.find((option) => option.code === draft.destinationWarehouseCode)
              return <tr key={draft.id}>
                <td className="p-2.5 text-center"><span className="block font-semibold text-slate-700">{outputProductOptions.find((product) => product.code === draft.productCode)?.name ?? (draft.productCode ? productName : 'สูญเสียจากการผลิต')}</span><span className="block font-mono text-xs text-slate-400">{draft.productCode || '-'}</span></td>
                <td className="p-2.5 text-center font-semibold whitespace-nowrap text-slate-600">{stockCategoryLabel(draft.categoryCode)}</td>
                <td className="p-2.5 text-center">{warehouse?.name ?? draft.destinationWarehouseCode}</td>
                <td className="p-2.5 text-right font-semibold tabular-nums">{Number(draft.netQty).toFixed(2)}</td>
                <td className="p-2.5 text-right font-semibold tabular-nums">{Number(draft.lossQty).toFixed(2)}</td>
                <td className="p-2.5 text-center whitespace-nowrap">{formatDateDisplay(outputDate)}</td>
                <td className="p-2.5 text-right tabular-nums">{formatMoney(sourceWipQty)}</td>
                <td className="p-2.5 text-left truncate" title={notes}>{notes || '-'}</td>
                <td className="p-2.5 text-center"><button className="font-semibold text-rose-600 hover:text-rose-700" type="button" onClick={() => onRemove(index)}>ลบ</button></td>
              </tr>
            })}
            {outputDrafts.length === 0 ? <tr><td className="p-4 text-center text-slate-400" colSpan={9}>ยังไม่มีรายการผลผลิตที่เตรียมส่งเข้าคลัง</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProductStockPreview({
  destinationWarehouseName,
  error,
  isLoading,
  isReady,
  stock,
}: {
  destinationWarehouseName: string
  error: string | null
  isLoading: boolean
  isReady: boolean
  stock: ProductStockPayload | null
}) {
  if (!isReady) return null
  if (isLoading) return <div className="rounded-md bg-slate-50 p-4 text-center text-xs text-slate-500">กำลังดึงข้อมูล Stock...</div>
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-semibold">โหลดสต๊อกล้มเหลว: {error}</div>
  if (!stock) return null

  return (
    <div className="space-y-2 border-b border-slate-200 pb-4">
      <h5 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
        📦 ข้อมูล Stock ปัจจุบันของสินค้าที่จะเบิก: <span className="font-normal text-slate-600">{stock.productName} ({stock.productCode})</span>
      </h5>
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-indigo-100 bg-white shadow-sm">
        <table className="ns-table min-w-full table-fixed divide-y divide-indigo-100 text-sm" style={{ minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 300 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 220 }} />
          </colgroup>
          <thead className="border-b border-indigo-100 bg-indigo-50 text-xs font-semibold text-indigo-700">
            <tr>
              <th className="p-2 text-center">สาขา / คลัง</th>
              <th className="p-2 whitespace-nowrap text-center">ประเภท</th>
              <th className="p-2 !text-right">จำนวนคงเหลือ (กก.)</th>
              <th className="p-2 !text-right">ราคาเฉลี่ย/กก.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-100">
            {stock.rows.map((row, index) => (
              <tr key={index} className="hover:bg-indigo-50/10">
                <td className="min-w-0 p-2 text-center font-medium text-slate-700">
                  <span className="block truncate" title={row.warehouseName || destinationWarehouseName || '-'}>
                    {row.warehouseName || destinationWarehouseName || '-'}
                  </span>
                </td>
                <td className="p-2 whitespace-nowrap text-center"><span className="rounded bg-slate-100 px-1 py-0.5 text-xs font-bold text-slate-600">{stockCategoryLabel(row.status)}</span></td>
                <td className="p-2 whitespace-nowrap text-right font-bold text-slate-900 tabular-nums">{formatMoney(row.qty)}</td>
                <td className="p-2 whitespace-nowrap text-right text-slate-500 tabular-nums">{formatMoney(row.avgCost)}</td>
              </tr>
            ))}
            {stock.rows.length === 0 ? (
              <tr>
                <td className="p-8 text-center text-slate-400 font-semibold" colSpan={productStockColumnCount}>
                  ไม่มีของในคลังนี้ (เป็นศูนย์)
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-indigo-100/60 bg-white rounded-md border border-indigo-100 overflow-hidden shadow-sm">
        {stock.rows.map((row, index) => (
          <div key={index} className="p-3.5 space-y-3 text-sm border-b border-indigo-50/50 last:border-b-0">
            <div className="flex items-center justify-center gap-3 text-center">
              <span className="font-bold text-slate-800 text-sm">{row.warehouseName || destinationWarehouseName || '-'}</span>
              <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{stockCategoryLabel(row.status)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-2 bg-indigo-50/30 rounded-md">
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-500 block mb-0.5">คงเหลือ (กก.)</span>
                <span className="font-bold text-slate-950 text-sm tabular-nums">{formatMoney(row.qty)}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-500 block mb-0.5">เฉลี่ย/กก.</span>
                <span className="font-semibold text-slate-700 text-sm tabular-nums">{formatMoney(row.avgCost)}</span>
              </div>
            </div>
          </div>
        ))}
        {stock.rows.length === 0 ? (
          <div className="p-4 text-center text-slate-400 font-semibold text-sm">
            ไม่มีของในคลังนี้ (เป็นศูนย์)
          </div>
        ) : null}
      </div>
    </div>
  )
}

function FormField({ children, error, label }: { children: React.ReactNode; error?: string; label: string }) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  return (
    <label className="block" data-field-invalid={error ? 'true' : undefined} data-manual-required={hasInlineRequired ? 'true' : undefined}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600 font-bold">*</span> : null}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  )
}

function readFormValue(formElement: HTMLFormElement | undefined, inputId: string) {
  const element = formElement?.querySelector(`#${inputId}`) ?? (typeof document === 'undefined' ? null : document.getElementById(inputId))
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) return element.value.trim()
  const namedElement = formElement?.elements.namedItem(inputId)
  if (namedElement instanceof HTMLInputElement) return namedElement.value.trim()
  return ''
}

function getComboboxCode(formElement: HTMLFormElement | undefined, inputId: string, currentValue: string) {
  const element = formElement?.querySelector(`#${inputId}`) ?? (typeof document === 'undefined' ? null : document.getElementById(inputId))
  const displayValue = element instanceof HTMLInputElement ? element.value : ''
  const parsedCode = displayValue.split(' - ')[0]?.trim() ?? ''
  return currentValue || parsedCode
}

function SelectField({ allowBlank = false, disabled = false, error, helperText, label, onChange, options, placeholder, required = false, selectId, value, hideCode = false }: { allowBlank?: boolean; disabled?: boolean; error?: string; helperText?: string; label: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; required?: boolean; selectId?: string; value: string; hideCode?: boolean }) {
  return (
    <FormField error={error} label={label}>
      <Select aria-invalid={Boolean(error)} id={selectId} name={selectId} className="h-10 w-full" disabled={disabled} required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allowBlank ? '-' : (placeholder ?? 'เลือกข้อมูล')}</option>
        {options.map((option) => {
          const displayLabel = hideCode ? option.name : (option.code === option.name ? option.name : `${option.code} - ${option.name}`)
          return <option key={`${option.code}-${option.id}`} value={option.code}>{displayLabel}</option>
        })}
      </Select>
      {helperText ? <span className="mt-1 block text-xs text-slate-500">{helperText}</span> : null}
    </FormField>
  )
}

function MiniMetric({ label, tone, value }: { label: string; tone: 'amber' | 'emerald' | 'red'; value: number }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-amber-700'
  return <div className="px-2"><div className="text-xs font-medium text-slate-500">{label}</div><div className={`text-sm font-bold ${color}`}>{formatMoney(value)} กก.</div></div>
}

function Metric({ label, value, tone = 'normal' }: { label: string; tone?: 'normal' | 'danger'; value: string }) {
  return <SharedKpiCard label={label} tone={tone} value={value} />
}

function ModalDismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="h-11 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-medium text-white transition-colors hover:border-rose-700 hover:bg-rose-700 sm:h-9"
      type="button"
      onClick={onClick}
    >
      ปิด
    </button>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-slate-100 pb-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 break-words whitespace-pre-line text-sm font-medium text-slate-800">{value}</div>
    </div>
  )
}

function Alert({ text, title, tone }: { text: string; title: string; tone: 'red' }) {
  const className = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : ''
  return <div className={`rounded-md border p-4 text-sm ${className}`}><div className="font-bold">{title}</div><div className="mt-1">{text}</div></div>
}

function cardClass(status: string) {
  if (status === 'Cancelled') return 'border-slate-200 bg-white opacity-70 dark:opacity-100'
  return 'border-slate-200 bg-white hover:border-blue-300'
}

function statusClass(status: string, compact = false) {
  if (status === 'In Production') return compact ? 'text-blue-700' : 'bg-blue-100 text-blue-700'
  if (status === 'Partially Completed') return compact ? 'text-amber-700' : 'bg-amber-100 text-amber-700'
  if (status === 'Completed') return compact ? 'text-emerald-700' : 'bg-emerald-100 text-emerald-700'
  if (status === 'Cancelled') return compact ? 'text-red-700' : 'bg-red-100 text-red-700'
  return compact ? 'text-slate-700' : 'bg-slate-100 text-slate-700'
}

function StatusBadge({ compact = false, status }: { compact?: boolean; status: string }) {
  return compact ? (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusClass(status, true)}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  ) : (
    <span className={`rounded-full px-3 py-1 text-sm font-bold ${statusClass(status)}`}>{statusLabel(status)}</span>
  )
}
