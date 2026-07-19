'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { Download, Plus, Search } from 'lucide-react'
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
  date: string
  docNo: string
  lotNo: string
  outputType?: string
  productCode: string
  productName: string
  qty: number
  status: string
  stockStatus?: string
  totalCost: number
  unitCost: number
  warehouseCode: string
  warehouseName: string
}
type ProductionOrderRow = {
  branchName: string
  closedAt: string | null
  createdAt: string | null
  date: string
  docNo: string
  id: string
  inputCost: number
  inputCount: number
  inputQty: number
  inputs: ProductionMovementRow[]
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
  qtyPlanned: number
  status: string
  variance: number
  warehouseName: string
  wipQty: number
  wipValue: number
}
type ProductionOrdersPayload = {
  categories: Category[]
  filters: { branches: Array<{ code: string; name: string }> }
  page: number
  pageSize: number
  rows: ProductionOrderRow[]
  summary: { inputCost: number; outputValue: number; qtyPlanned: number; total: number; totalPages: number; variance: number }
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

const emptyOptions: ProductionOrderOptions = { branches: [], machines: [], productionLines: [], productionTypes: [], products: [], warehouses: [] }
const pageSizeOptions = [10, 25]
const statusOptions = ['', 'Open', 'In Production', 'Partially Completed', 'Completed', 'Cancelled']
const sortOptions = [
  { label: 'วันที่ใบสั่งผลิต', value: 'date' },
  { label: 'เลขที่ใบสั่งผลิต', value: 'docNo' },
  { label: 'สถานะผลิต', value: 'status' },
]

type ProductionOrderColumnKey = 'index' | 'date' | 'createdAt' | 'docNo' | 'branch' | 'productName' | 'machine' | 'warehouseName' | 'inputQty' | 'wipQty' | 'outputQty' | 'yield' | 'status' | 'action'

const productionOrderColumns: Array<ResizableColumnDefinition<ProductionOrderColumnKey>> = [
  { key: 'index', defaultWidth: 56, minWidth: 50 },
  { key: 'date', defaultWidth: 140, minWidth: 140 },
  { key: 'createdAt', defaultWidth: 140, minWidth: 140 },
  { key: 'docNo', defaultWidth: 130, minWidth: 100 },
  { key: 'branch', defaultWidth: 110, minWidth: 90 },
  { key: 'productName', defaultWidth: 170, minWidth: 130 },
  { key: 'machine', defaultWidth: 130, minWidth: 100 },
  { key: 'warehouseName', defaultWidth: 130, minWidth: 100 },
  { key: 'inputQty', defaultWidth: 120, minWidth: 95 },
  { key: 'wipQty', defaultWidth: 160, minWidth: 140 },
  { key: 'outputQty', defaultWidth: 120, minWidth: 95 },
  { key: 'yield', defaultWidth: 120, minWidth: 105 },
  { key: 'status', defaultWidth: 110, minWidth: 104, maxWidth: 144 },
  { key: 'action', defaultWidth: 72, minWidth: 72, maxWidth: 88 },
]
const productionMovementColumnCount = 10
const productStockColumnCount = 5
const activeSegmentClass = 'border-[#334155] bg-[#334155] text-white dark:border-blue-500 dark:bg-blue-500/20'
const inactiveSegmentClass = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'

function MatchButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
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
  const [sort, setSort] = useState('date')
  const [statuses, setStatuses] = useState<string[]>([])

  const columnResize = useResizableColumns('production.orders.v7', productionOrderColumns)

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

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ direction, page: String(page), pageSize: String(pageSize), sort })
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
            className="hidden lg:inline-flex"
            size="sm"
            variant="outline"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <PageSizeDropdown options={pageSizeOptions} value={pageSize} onChange={(size) => { setPageSize(size); setPage(1) }} />
        <Button disabled={page <= 1} size="sm" variant="outline" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
        <span className="px-1 text-sm font-medium">หน้า {data?.page ?? page} / {totalPages}</span>
        <Button disabled={page >= totalPages} size="sm" variant="outline" type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
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
    if (refresh) void loadData()
  }

  async function refreshSelectedOrder(docNo: string) {
    const params = new URLSearchParams({ pageSize: '10', search: docNo })
    const payload = await dailyFetchJson<ProductionOrdersPayload>(`/api/production/orders?${params.toString()}`)
    const refreshedRow = payload.rows.find((candidate) => candidate.docNo === docNo) ?? null
    if (refreshedRow) setSelectedRow(refreshedRow)
    await loadData()
    return refreshedRow
  }

  return (
    <section className="space-y-4">
      {error ? <Alert tone="red" title="โหลดข้อมูลใบสั่งผลิตไม่ได้" text={error} /> : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block mb-3 space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
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
          <label className="text-xs text-slate-500">วันที่ใบสั่งผลิต:</label>
          <DatePickerInput ariaLabel="วันที่ใบสั่งผลิตตั้งแต่" className="w-[130px] !h-9 text-sm" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput ariaLabel="วันที่ใบสั่งผลิตถึง" className="w-[130px] !h-9 text-sm" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
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
              <MatchButton active={statuses.length === 0} label="ทุกสถานะ" onClick={() => toggleAppliedStatus('')} tone="dark" />
              <MatchButton active={statuses.includes('Open')} label="ยังไม่เริ่ม" onClick={() => toggleAppliedStatus('Open')} tone="dark" />
              <MatchButton active={statuses.includes('In Production')} label="กำลังผลิต" onClick={() => toggleAppliedStatus('In Production')} tone="amber" />
              <MatchButton active={statuses.includes('Partially Completed')} label="เสร็จบางส่วน" onClick={() => toggleAppliedStatus('Partially Completed')} tone="amber" />
              <MatchButton active={statuses.includes('Completed')} label="เสร็จสิ้น" onClick={() => toggleAppliedStatus('Completed')} tone="emerald" />
              <MatchButton active={statuses.includes('Cancelled')} label="ยกเลิก" onClick={() => toggleAppliedStatus('Cancelled')} tone="red" />
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
                <span className="mb-1 block text-xs font-semibold text-slate-600">วันที่ใบสั่งผลิต</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput ariaLabel="วันที่ใบสั่งผลิตตั้งแต่" className="flex-1" value={mobileDateFrom} onChange={(value) => updateMobileFilters({ dateFrom: value })} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput ariaLabel="วันที่ใบสั่งผลิตถึง" className="flex-1" value={mobileDateTo} onChange={(value) => updateMobileFilters({ dateTo: value })} />
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
                  <ResizableTableHead label="ลำดับ" resizeProps={columnResize.getResizeHandleProps('index', 'ลำดับ')} />
                  <ResizableTableHead
                    activeSortKey={sort}
                    direction={direction}
                    label="วันที่ใบสั่งผลิต"
                    sortKey="date"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('date', 'วันที่ใบสั่งผลิต')}
                  />
                  <ResizableTableHead align="right" label="วันที่สร้างรายการ" resizeProps={columnResize.getResizeHandleProps('createdAt', 'วันที่สร้างรายการ')} />
                  <ResizableTableHead
                    activeSortKey={sort}
                    direction={direction}
                    align="right"
                    label="เลขที่ใบสั่งผลิต"
                    sortKey="docNo"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่ใบสั่งผลิต')}
                  />
                  <ResizableTableHead align="right" label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
                  <ResizableTableHead align="right" label="สินค้าที่ผลิต" resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้าที่ผลิต')} />
                  <ResizableTableHead align="right" label="เครื่องจักร" resizeProps={columnResize.getResizeHandleProps('machine', 'เครื่องจักร')} />
                  <ResizableTableHead align="right" label="คลังรับผลผลิต" resizeProps={columnResize.getResizeHandleProps('warehouseName', 'คลังรับผลผลิต')} />
                  <ResizableTableHead align="right" label="ปริมาณเบิก (กก.)" resizeProps={columnResize.getResizeHandleProps('inputQty', 'ปริมาณเบิก (กก.)')} />
                  <ResizableTableHead align="right" label="งานระหว่างทำคงเหลือ" resizeProps={columnResize.getResizeHandleProps('wipQty', 'งานระหว่างทำคงเหลือ')} />
                  <ResizableTableHead align="right" label="ปริมาณผลิต (กก.)" resizeProps={columnResize.getResizeHandleProps('outputQty', 'ปริมาณผลิต (กก.)')} />
                  <ResizableTableHead align="right" label="อัตราผลได้" resizeProps={columnResize.getResizeHandleProps('yield', 'อัตราผลได้')} />
                  <ResizableTableHead
                    activeSortKey={sort}
                    align="right"
                    direction={direction}
                    label="สถานะผลิต"
                    sortKey="status"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('status', 'สถานะผลิต')}
                  />
                  <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
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
                {currentRows.map((row, index) => {
                  const yieldPct = row.inputQty > 0 ? (row.outputQty / row.inputQty) * 100 : 0
                  const wipQty = Math.max(0, row.wipQty ?? 0)
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedRow(row); setModalMode('detail') }}
                    >
                      <td className="p-3 whitespace-nowrap text-slate-500 font-mono">{(page - 1) * pageSize + index + 1}</td>
                      <td className="p-3 whitespace-nowrap">{formatDateDisplay(row.date)}</td>
                      <td className="p-3 whitespace-nowrap text-right text-slate-500">{formatDateDisplay(row.createdAt)}</td>
                      <td className="p-3 truncate text-right font-mono font-semibold text-slate-900" title={row.docNo}>{row.docNo}</td>
                      <td className="p-3 truncate text-right" title={row.branchName}>{row.branchName}</td>
                      <td className="p-3 min-w-0 text-right">
                        <div className="font-semibold text-slate-800 truncate" title={row.productName || 'ยังไม่ได้กำหนดสินค้า'}>{row.productName || 'ยังไม่ได้กำหนดสินค้า'}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">{row.productCode || row.productId || '-'}</div>
                      </td>
                      <td className="p-3 min-w-0 text-right">
                        {row.machineName ? (
                          <div className="truncate">
                            <span className="font-medium text-slate-800" title={row.machineName}>{row.machineName}</span>
                            <div className="text-xs text-slate-400 mt-0.5 truncate">{row.machineType || '-'}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-3 truncate text-right" title={row.warehouseName}>{row.warehouseName || '-'}</td>
                      <td className="p-3 text-right font-medium tabular-nums text-slate-700">{formatMoney(row.inputQty)}</td>
                      <td className="p-3 text-right font-medium tabular-nums text-slate-600">{formatMoney(wipQty)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-slate-800">{formatMoney(row.outputQty)}</td>
                      <td className="p-3 text-right font-bold tabular-nums">
                        {row.inputQty > 0 ? (
                          <span className={yieldPct >= 90 ? 'text-emerald-700' : yieldPct >= 70 ? 'text-blue-700' : 'text-amber-700'}>
                            {yieldPct.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-right">
                        <StatusBadge compact status={row.status} />
                      </td>
                      <td className="p-3 text-right">
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedRow(row)
                            setModalMode('detail')
                          }}
                        >
                          เปิด
                        </button>
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
                onOpen={() => { setSelectedRow(row); setModalMode('detail') }}
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
          <div className="text-xs text-slate-500">{formatDateDisplay(row.date)}</div>
          <div className="mt-1"><StatusBadge status={row.status} /></div>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-200/70 pt-3">
        <div className="truncate text-sm font-bold text-slate-800">{row.productName || 'ยังไม่ได้กำหนดสินค้า'}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{row.productCode || row.productId || '-'} · {row.warehouseName}</div>
        <div className="mt-0.5 text-xs text-slate-500">สร้างรายการ {formatDateDisplay(row.createdAt)}</div>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200/70 py-2 text-center">
        <MiniMetric label="เบิก" tone="red" value={row.inputQty} />
        <MiniMetric label="งานระหว่างทำ" tone="amber" value={wipQty} />
        <MiniMetric label="ผลิต" tone="emerald" value={row.outputQty} />
      </div>
      {row.inputQty > 0 ? (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">อัตราผลได้</span>
          <span className={`font-bold ${yieldPct >= 90 ? 'text-emerald-700' : yieldPct >= 70 ? 'text-blue-700' : 'text-amber-700'}`}>{yieldPct.toFixed(1)}%</span>
        </div>
      ) : null}
      {row.status === 'Completed' ? <CountdownTimer closedAt={row.closedAt} /> : null}
      <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/70 pt-2.5">
        <div className="text-xs"><span className="text-slate-500">ต้นทุนเบิก:</span><b className="ml-1 text-slate-800">{formatMoney(row.inputCost)}</b></div>
        <span aria-hidden className="text-xs font-bold text-blue-700">ดูรายละเอียด →</span>
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
  const [tab, setTab] = useState<'header' | 'input' | 'output'>('header')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isStockPreviewLoading, setIsStockPreviewLoading] = useState(false)
  const [productStock, setProductStock] = useState<ProductStockPayload | null>(null)
  const [productStockError, setProductStockError] = useState<string | null>(null)
  const [wip, setWip] = useState<WipPayload | null>(null)
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})
  const [createForm, setCreateForm] = useState({
    branchCode: '',
    date: todayDateInput(),
    destinationWarehouseCode: '',
    machineCode: '',
    notes: '',
    productionLineCode: '',
    productionType: 'Processing',
    shift: 'เช้า',
    sourceWarehouseCode: '',
    targetProductCode: '',
    wipWarehouseCode: '',
    machineType: '',
  })
  const [inputForm, setInputForm] = useState({ date: todayDateInput(), lotNo: '', netQty: '', notes: '', productCode: '', sourceWarehouseCode: '', stockStatus: 'RM' })
  const [outputForm, setOutputForm] = useState({ categoryCode: 'FG', completeOrder: false, date: todayDateInput(), destinationWarehouseCode: '', lossQty: '', lotNo: '', netQty: '', notes: '', productCode: row?.productCode ?? '' })
  const inputNetQtyRef = useRef<HTMLInputElement | null>(null)
  const outputNetQtyRef = useRef<HTMLInputElement | null>(null)
  const outputLossQtyRef = useRef<HTMLInputElement | null>(null)

  const branchWarehouses = useMemo(() => {
    const branchCode = isCreate ? createForm.branchCode : null
    return branchCode ? options.warehouses.filter((warehouse) => warehouse.branchCode === branchCode) : options.warehouses
  }, [createForm.branchCode, isCreate, options.warehouses])
  const branchWipWarehouses = useMemo(() => createForm.branchCode ? branchWarehouses.filter((warehouse) => warehouse.type?.toUpperCase() === 'WIP') : [], [branchWarehouses, createForm.branchCode])
  const isWipWarehouseLocked = isCreate && branchWipWarehouses.length === 1
  const rowWipQty = wip?.wipQty ?? row?.wipQty ?? Math.max(0, (row?.inputQty ?? 0) - (row?.outputQty ?? 0))
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
    description: `รหัส ${product.code}`,
    id: product.code,
    label: `${product.code} - ${product.name}`,
    searchText: `${product.code} ${product.name}`,
  })), [options.products])
  const selectedDestinationWarehouse = useMemo(() => options.warehouses.find((warehouse) => warehouse.code === createForm.destinationWarehouseCode) ?? null, [createForm.destinationWarehouseCode, options.warehouses])

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
        setOutputForm((current) => ({ ...current, destinationWarehouseCode: current.destinationWarehouseCode || payload.warehouses[0]?.code || '', productCode: current.productCode || payload.products[0]?.code || '' }))
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
    if (!isCreate || !createForm.branchCode) return
    if (branchWipWarehouses.length === 1) {
      const lockedWipWarehouseCode = branchWipWarehouses[0]?.code ?? ''
      if (createForm.wipWarehouseCode !== lockedWipWarehouseCode) {
        setCreateForm((form) => ({ ...form, wipWarehouseCode: lockedWipWarehouseCode }))
        setCreateErrors((current) => {
          if (!current.wipWarehouseCode) return current
          const next = { ...current }
          delete next.wipWarehouseCode
          return next
          return next
        })
      }
      return
    }
    if (createForm.wipWarehouseCode && !branchWipWarehouses.some((warehouse) => warehouse.code === createForm.wipWarehouseCode)) {
      setCreateForm((form) => ({ ...form, wipWarehouseCode: '' }))
    }
  }, [branchWipWarehouses, createForm.branchCode, createForm.wipWarehouseCode, isCreate])

  useEffect(() => {
    let activeBranchCode = ''
    let activeProductCode = ''
    let activeWarehouseCode = ''

    if (isCreate) {
      if (!createForm.branchCode || !createForm.targetProductCode || !createForm.destinationWarehouseCode) {
        setProductStock(null)
        setProductStockError(null)
        setIsStockPreviewLoading(false)
        return
      }
      activeBranchCode = createForm.branchCode
      activeProductCode = createForm.targetProductCode
      activeWarehouseCode = createForm.destinationWarehouseCode
    } else {
      if (!row) {
        setProductStock(null)
        setProductStockError(null)
        setIsStockPreviewLoading(false)
        return
      }
      const branch = options.branches.find((b) => b.name === row.branchName)
      const warehouse = options.warehouses.find((w) => w.name === row.warehouseName)
      if (!branch || !warehouse || !row.productCode) {
        setProductStock(null)
        setProductStockError(null)
        setIsStockPreviewLoading(false)
        return
      }
      activeBranchCode = branch.code
      activeProductCode = row.productCode
      activeWarehouseCode = warehouse.code
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
  }, [createForm.branchCode, createForm.destinationWarehouseCode, createForm.targetProductCode, isCreate, row, options.branches, options.warehouses])

  async function submitCreate() {
    if (!validateCreateForm()) return
    await runAction(async () => {
      await dailyFetchJson('/api/production/orders', {
        body: JSON.stringify({
          branchCode: createForm.branchCode,
          date: createForm.date,
          destinationWarehouseCode: createForm.destinationWarehouseCode,
          ...(createForm.machineCode.trim() ? { machineCode: createForm.machineCode } : {}),
          ...(createForm.notes.trim() ? { notes: createForm.notes.trim() } : {}),
          ...(createForm.productionLineCode.trim() ? { productionLineCode: createForm.productionLineCode } : {}),
          productionType: createForm.productionType,
          ...(createForm.shift.trim() ? { shift: createForm.shift.trim() } : {}),
          sourceWarehouseCode: createForm.sourceWarehouseCode,
          targetProductCode: createForm.targetProductCode,
          wipWarehouseCode: createForm.wipWarehouseCode,
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
    const defaultFgWarehouse = warehouses.find((w) => w.type?.toUpperCase() === 'FG')
      || warehouses.find((w) => w.type?.toUpperCase() !== 'WIP')
      || warehouses[0]
    const defaultSourceWarehouse = warehouses.find((w) => w.type?.toUpperCase() === 'RM')
      || warehouses.find((w) => w.type?.toUpperCase() !== 'WIP' && w.type?.toUpperCase() !== 'FG')
      || warehouses[0]
    const defaultWipWarehouse = warehouses.find((w) => w.type?.toUpperCase() === 'WIP')
      || warehouses[0]

    setCreateForm((form) => ({
      ...form,
      branchCode,
      destinationWarehouseCode: defaultFgWarehouse?.code ?? '',
      sourceWarehouseCode: defaultSourceWarehouse?.code ?? '',
      wipWarehouseCode: defaultWipWarehouse?.code ?? '',
    }))
    setCreateErrors((current) => {
      const next = { ...current }
      delete next.branchCode
      delete next.destinationWarehouseCode
      delete next.sourceWarehouseCode
      delete next.wipWarehouseCode
      return next
    })
  }

  function updateCreateMachine(machineCode: string) {
    const machine = options.machines.find((m) => m.code === machineCode)
    const machineType = machine?.type ?? ''

    const mappedProdType = {
      'เครื่องตัด': 'Processing',
      'เครื่องบด': 'Processing',
      'เครื่องอัด': 'Baling',
      'เครื่องอัดขวด': 'Baling',
      'สายพาน': 'Sorting',
    }[machineType] || 'Processing'

    setCreateForm((form) => ({
      ...form,
      machineCode,
      machineType,
      productionType: mappedProdType,
    }))
    setCreateErrors((current) => {
      const next = { ...current }
      delete next.machineCode
      return next
    })
  }

  function validateCreateForm() {
    const requiredFields: Array<[keyof typeof createForm, string]> = [
      ['date', 'กรุณาระบุวันที่'],
      ['branchCode', 'กรุณาเลือกสาขา'],
      ['productionType', 'กรุณาเลือกประเภทการผลิต'],
      ['targetProductCode', 'กรุณาเลือกสินค้าที่ผลิต'],
      ['sourceWarehouseCode', 'กรุณาเลือกคลังวัตถุดิบ'],
      ['wipWarehouseCode', 'กรุณาเลือกคลัง WIP'],
      ['destinationWarehouseCode', 'กรุณาเลือกคลังรับผลผลิต'],
    ]
    const nextErrors: Record<string, string> = {}
    for (const [field, message] of requiredFields) {
      if (!createForm[field].trim()) nextErrors[field] = message
    }
    if (createForm.branchCode) {
      if (branchWipWarehouses.length === 0) {
        nextErrors.wipWarehouseCode = 'สาขานี้ยังไม่ได้ตั้งค่าคลัง WIP'
      } else if (createForm.wipWarehouseCode && !branchWipWarehouses.some((warehouse) => warehouse.code === createForm.wipWarehouseCode)) {
        nextErrors.wipWarehouseCode = 'กรุณาเลือกคลัง WIP ของสาขานี้'
      }
    }
    setCreateErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) return true
    setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
    return false
  }

  async function submitInput(formElement?: HTMLFormElement) {
    if (!row) return
    const netQtyText = readFormValue(formElement, 'production-input-net-qty') || inputNetQtyRef.current?.value.trim() || inputForm.netQty
    const netQty = Number(netQtyText)
    const productCode = getComboboxCode(formElement, 'production-input-product', inputForm.productCode)
    const sourceWarehouseCode = readFormValue(formElement, 'production-input-source-warehouse') || inputForm.sourceWarehouseCode
    const stockStatus = (inputForm.stockStatus || 'RM') as 'RM' | 'FG'
    if (!productCode || !sourceWarehouseCode || !Number.isFinite(netQty) || netQty <= 0) {
      setError('กรุณาเลือกสินค้า คลังวัตถุดิบ และระบุ Net (กก.) มากกว่า 0')
      return
    }
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/inputs`, {
        body: JSON.stringify({ date: inputForm.date, lines: [{ netQty, productCode, sourceWarehouseCode, stockStatus }], notes: inputForm.notes || undefined }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setInputForm((form) => ({ ...form, lotNo: '', netQty: '', notes: '' }))
      setTab('input')
    })
  }

  async function submitOutput(formElement?: HTMLFormElement) {
    if (!row) return
    const netQtyText = readFormValue(formElement, 'production-output-net-qty') || outputNetQtyRef.current?.value.trim() || outputForm.netQty
    const lossQtyText = readFormValue(formElement, 'production-output-loss-qty') || outputLossQtyRef.current?.value.trim() || outputForm.lossQty
    const netQty = Number(netQtyText)
    const lossQty = lossQtyText ? Number(lossQtyText) : 0
    const productCode = getComboboxCode(formElement, 'production-output-product', outputForm.productCode)
    const categoryCode = 'FG'
    const destinationWarehouseCode = readFormValue(formElement, 'production-output-destination-warehouse') || outputForm.destinationWarehouseCode
    if (netQtyText && (!productCode || !destinationWarehouseCode || !Number.isFinite(netQty) || netQty <= 0)) {
      setError('กรุณาเลือกสินค้า คลังรับผลผลิต และระบุ Net (กก.) มากกว่า 0')
      return
    }
    if (!Number.isFinite(lossQty) || lossQty < 0) {
      setError('กรุณาระบุ Loss kg เป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
      return
    }
    if (!netQtyText && lossQty <= 0) {
      setError('กรุณาระบุ Net (กก.) หรือ Loss kg อย่างน้อย 1 รายการ')
      return
    }
    await runAction(async () => {
      const lines = netQtyText ? [{ categoryCode, destinationWarehouseCode, lotNo: undefined, netQty, productCode }] : []
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/outputs`, {
        body: JSON.stringify({ completeOrder: outputForm.completeOrder, date: outputForm.date, lines, lossQty, notes: outputForm.notes || undefined }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setOutputForm((form) => ({ ...form, completeOrder: false, lossQty: '', lotNo: '', netQty: '', notes: '' }))
      setTab('output')
    })
  }

  async function patchOrder(action: 'cancel' | 'complete') {
    if (!row) return
    const reason = action === 'cancel' ? window.prompt('เหตุผลการยกเลิก')?.trim() : undefined
    if (action === 'cancel' && !reason) return
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}`, {
        body: JSON.stringify(action === 'complete' ? { action, note: '' } : { action, reason }),
        method: 'PATCH',
      })
      await onRefreshRow(row.docNo)
    })
  }

  async function reverseMovement(kind: 'inputs' | 'outputs', docNo: string) {
    if (!row) return
    const reason = window.prompt('เหตุผลการ reverse')?.trim()
    if (!reason) return
    const payloadKey = kind === 'inputs' ? 'inputDocNo' : 'outputDocNo'
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/${kind}/reverse`, {
        body: JSON.stringify({ date: todayDateInput(), [payloadKey]: docNo, reason }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setTab(kind === 'inputs' ? 'input' : 'output')
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
      <DialogContent className="max-w-5xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 dark:bg-[#0f172a] border-0 outline-none focus:outline-none max-h-[90vh] animate-fade-in" hideClose>
        <DialogHeader className="shrink-0 rounded-none border-b border-slate-800 bg-slate-900 px-4 py-4 text-white dark:border-slate-700 dark:bg-[#0f172a] sm:px-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <DialogTitle className="font-mono text-lg font-bold text-white">{isCreate ? 'ใบสั่งผลิตใหม่' : row?.docNo ?? ''}</DialogTitle>
                {isCreate ? (
                  <span className="inline-flex rounded-full border border-blue-400/30 bg-blue-400/15 px-2.5 py-0.5 text-xs font-semibold text-blue-100">ร่างใหม่</span>
                ) : (
                  <StatusBadge status={row?.status ?? '-'} />
                )}
              </div>
              <DialogDescription className="mt-1 text-sm text-slate-300">
                {isCreate ? 'สถานะจะเป็น “ยังไม่เริ่ม” หลังบันทึก และยังไม่กระทบสต็อก' : `${row?.productName || '-'} · ${row?.branchName || '-'}`}
              </DialogDescription>
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
                  {rowWipQty <= 0 && row.status !== 'Completed' && row.status !== 'Cancelled' ? (
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
              <Metric label="ผลผลิต (กก.)" value={formatMoney(row?.outputQty ?? 0)} />
              <Metric label="งานระหว่างผลิต (กก.)" value={formatMoney(rowWipQty)} />
              <Metric label="ต้นทุนวัตถุดิบ (บาท)" value={formatMoney(row?.inputCost ?? 0)} />
              <Metric label="มูลค่าผลผลิต (บาท)" value={formatMoney(row?.outputValue ?? 0)} />
              <Metric label="อัตราผลได้" value={`${((row?.inputQty ?? 0) > 0 ? ((row?.outputQty ?? 0) / (row?.inputQty ?? 1)) * 100 : 0).toFixed(1)}%`} />
            </div>
          ) : null}

          {!isCreate ? (
            <Tabs className="gap-0" value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
              <TabsList className="w-full flex-nowrap overflow-x-auto" variant="line">
                <TabsTrigger className="min-h-11 px-4 font-semibold dark:text-slate-300 dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-white" value="header" variant="line">ข้อมูลทั่วไป</TabsTrigger>
                <TabsTrigger className="min-h-11 px-4 font-semibold dark:text-slate-300 dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-white" value="input" variant="line">วัตถุดิบเบิก ({row?.inputCount ?? 0})</TabsTrigger>
                <TabsTrigger className="min-h-11 px-4 font-semibold dark:text-slate-300 dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-white" value="output" variant="line">ผลผลิต ({row?.outputCount ?? 0})</TabsTrigger>
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
                    <FormField error={createErrors.date} label="วันที่ใบสั่งผลิต *">
                      <DatePickerInput value={createForm.date} onChange={(date) => updateCreateForm('date', date)} className="w-full !h-9" />
                    </FormField>
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
                    <div className="md:col-span-3">
                      <ProductStockPreview
                        destinationWarehouseName={selectedDestinationWarehouse?.name ?? ''}
                        error={productStockError}
                        isLoading={isStockPreviewLoading}
                        isReady={Boolean(createForm.branchCode && createForm.targetProductCode && createForm.destinationWarehouseCode)}
                        stock={productStock}
                      />
                    </div>
                  </div>
                </div>

                {/* กลุ่มที่ 2: เครื่องจักร & ไลน์ผลิต */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">เครื่องจักรและไลน์ผลิต</h3>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <SelectField label="เครื่องจักร" allowBlank value={createForm.machineCode} options={options.machines} onChange={updateCreateMachine} />
                    <FormField label="ประเภทเครื่องจักร">
                      <div aria-disabled="true" className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700">
                        <span className={createForm.machineType ? 'font-medium' : 'text-slate-500'}>{createForm.machineType || 'ระบบจะแสดงหลังเลือกเครื่องจักร'}</span>
                      </div>
                    </FormField>
                    <SelectField label="ไลน์ผลิต" allowBlank value={createForm.productionLineCode} options={options.productionLines} onChange={(productionLineCode) => updateCreateForm('productionLineCode', productionLineCode)} />
                  </div>
                </div>

                {/* กลุ่มที่ 3: ข้อมูลเพิ่มเติม */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">ข้อมูลเพิ่มเติม</h3>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <FormField label="กะการผลิต">
                      <Select
                        className="h-10 w-full"
                        value={createForm.shift}
                        onChange={(event) => updateCreateForm('shift', event.target.value)}
                      >
                        <option value="เช้า">เช้า</option>
                        <option value="บ่าย">บ่าย</option>
                      </Select>
                    </FormField>
                    <div className="md:col-span-2">
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
                    <ReadField label="วันที่ใบสั่งผลิต" value={formatDateDisplay(row?.date)} />
                    <ReadField label="วันที่สร้างรายการ" value={formatDateDisplay(row?.createdAt)} />
                    <ReadField label="สถานะผลิต" value={row?.status ? statusLabel(row.status) : '-'} />
                    <ReadField label="สินค้าเป้าหมาย" value={row?.productName ?? '-'} />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">การผลิตและคลัง</h4>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                    <ReadField label="สาขา" value={row?.branchName ?? '-'} />
                    <ReadField label="เครื่องจักร" value={row?.machineName ?? '-'} />
                    <ReadField label="ประเภทเครื่องจักร" value={row?.machineType ?? '-'} />
                    <ReadField label="คลังรับผลผลิต" value={row?.warehouseName ?? '-'} />
                    <ReadField label="งานระหว่างผลิตคงเหลือ (กก.)" value={formatMoney(rowWipQty)} />
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
              rows={row?.inputs ?? []}
              title="วัตถุดิบที่เบิก"
              onReverse={(docNo) => void reverseMovement('inputs', docNo)}
              form={(
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div className="md:col-span-3">
                    <ProductStockPreview
                      destinationWarehouseName={row?.warehouseName ?? ''}
                      error={productStockError}
                      isLoading={isStockPreviewLoading}
                      isReady={true}
                      stock={productStock}
                    />
                  </div>
                  <FormField label="วันที่"><DatePickerInput value={inputForm.date} onChange={(date) => setInputForm((form) => ({ ...form, date }))} /></FormField>
                  <div className="md:col-span-2">
                    <SearchCombobox inputId="production-input-product" label="สินค้า" options={productSearchOptions} placeholder="พิมพ์รหัส/ชื่อสินค้า..." value={inputForm.productCode} onChange={(productCode) => setInputForm((form) => ({ ...form, productCode }))} />
                  </div>
                  <SelectField
                    hideCode={true}
                    selectId="production-input-source-warehouse"
                    label="คลังวัตถุดิบ"
                    value={inputForm.sourceWarehouseCode}
                    options={options.warehouses}
                    onChange={(sourceWarehouseCode) => {
                      const selectedWarehouse = options.warehouses.find((w) => w.code === sourceWarehouseCode)
                      const inferredStatus = selectedWarehouse?.type?.toUpperCase() === 'FG' ? 'FG' : 'RM'
                      setInputForm((form) => ({ ...form, sourceWarehouseCode, stockStatus: inferredStatus }))
                    }}
                  />
                  <FormField label="Net (กก.)"><input key={`input-net-${row?.inputCount ?? 0}`} ref={inputNetQtyRef} id="production-input-net-qty" className="w-full rounded-md border px-3 py-2 text-right border-slate-300 bg-white" defaultValue={inputForm.netQty} inputMode="decimal" /></FormField>
                  <FormField label="หมายเหตุ"><input className="w-full rounded-md border px-3 py-2 border-slate-300 bg-white" value={inputForm.notes} onChange={(event) => setInputForm((form) => ({ ...form, notes: event.target.value }))} /></FormField>
                </div>
              )}
              onSubmit={(formElement) => void submitInput(formElement)}
            />
          ) : null}

          {!isCreate && tab === 'output' ? (
            <MovementPanel
              actionLabel="บันทึกผลผลิต"
              canWrite={canWrite}
              isSaving={isSaving}
              rows={row?.outputs ?? []}
              title="ผลผลิต"
              onReverse={(docNo) => void reverseMovement('outputs', docNo)}
              form={(
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <FormField label="วันที่"><DatePickerInput value={outputForm.date} onChange={(date) => setOutputForm((form) => ({ ...form, date }))} /></FormField>
                  <div className="md:col-span-2">
                    <SearchCombobox inputId="production-output-product" label="สินค้า/Grade" options={productSearchOptions} placeholder="พิมพ์รหัส/ชื่อสินค้า..." value={outputForm.productCode} onChange={(productCode) => setOutputForm((form) => ({ ...form, productCode }))} />
                  </div>
                  <SelectField hideCode={true} selectId="production-output-destination-warehouse" label="คลังรับผลผลิต" value={outputForm.destinationWarehouseCode} options={options.warehouses} onChange={(destinationWarehouseCode) => setOutputForm((form) => ({ ...form, destinationWarehouseCode }))} />
                  <FormField label="Net (กก.)"><input key={`output-net-${row?.outputCount ?? 0}`} ref={outputNetQtyRef} id="production-output-net-qty" className="w-full rounded-md border px-3 py-2 text-right border-slate-300 bg-white" defaultValue={outputForm.netQty} inputMode="decimal" /></FormField>
                  <FormField label="Loss kg"><input key={`output-loss-${row?.outputCount ?? 0}`} ref={outputLossQtyRef} id="production-output-loss-qty" className="w-full rounded-md border px-3 py-2 text-right border-slate-300 bg-white" defaultValue={outputForm.lossQty} inputMode="decimal" /></FormField>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 border-slate-300 bg-white h-9 mt-6 select-none cursor-pointer"><input checked={outputForm.completeOrder} type="checkbox" onChange={(event) => setOutputForm((form) => ({ ...form, completeOrder: event.target.checked }))} />จบงานหลังรับ</label>
                  <div className="md:col-span-2">
                    <FormField label="หมายเหตุ"><input className="w-full rounded-md border px-3 py-2 border-slate-300 bg-white" value={outputForm.notes} onChange={(event) => setOutputForm((form) => ({ ...form, notes: event.target.value }))} /></FormField>
                  </div>
                </div>
              )}
              onSubmit={(formElement) => void submitOutput(formElement)}
            />
          ) : null}
        </div>

      </DialogContent>
    </Dialog>
  )
}

function MovementPanel({
  actionLabel,
  canWrite,
  form,
  isSaving,
  onReverse,
  onSubmit,
  rows,
  title,
}: {
  actionLabel: string
  canWrite: boolean
  form: React.ReactNode
  isSaving: boolean
  onReverse: (docNo: string) => void
  onSubmit: (formElement?: HTMLFormElement) => void
  rows: ProductionMovementRow[]
  title: string
}) {
  const formRef = useRef<HTMLFormElement | null>(null)
  return (
    <div className="space-y-4 rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-2">
        <h4 className="text-base font-bold text-slate-800">{title}</h4>
      </div>

      {canWrite ? (
        <form
          ref={formRef}
          noValidate
          className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(formRef.current ?? undefined)
          }}
        >
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

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <table className="ns-table hidden min-w-full table-fixed divide-y divide-slate-200 text-sm lg:table" style={{ minWidth: 980 }}>
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 90 }} />
            <col />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">สินค้า</th>
              <th className="p-2 text-left">คลัง</th>
              <th className="p-2 text-left">Lot No.</th>
              <th className="p-2 text-right">น้ำหนัก (กก.)</th>
              <th className="p-2 text-right">ราคา/กก.</th>
              <th className="p-2 text-right">รวมมูลค่า</th>
              <th className="p-2 text-right">สถานะ</th>
              <th className="p-2 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, index) => {
              const isRowActive = row.status?.toLowerCase() === 'active'
              const isRowReversed = row.status?.toLowerCase() === 'reversed'
              return (
                <tr key={index} className={`hover:bg-slate-50 ${isRowReversed ? 'bg-slate-50/50 text-slate-400 line-through' : ''}`}>
                  <td className="p-2 whitespace-nowrap">{formatDateDisplay(row.date)}</td>
                  <td className="p-2 whitespace-nowrap font-mono">{row.docNo}</td>
                  <td className="min-w-0 p-2">
                    <span className="block truncate font-semibold" title={row.productName}>{row.productName}</span>
                    <div className="truncate text-xs text-slate-400 font-mono">{row.productCode}</div>
                  </td>
                  <td className="min-w-0 p-2">
                    <span className="block truncate" title={row.warehouseName}>{row.warehouseName}</span>
                    {row.stockStatus ? <span className="ml-1 text-xs text-slate-400 font-semibold">[{row.stockStatus}]</span> : null}
                  </td>
                  <td className="p-2 whitespace-nowrap font-mono">{row.lotNo || '-'}</td>
                  <td className="p-2 whitespace-nowrap text-right font-medium tabular-nums">{formatMoney(row.qty)}</td>
                  <td className="p-2 whitespace-nowrap text-right text-slate-500 tabular-nums">{formatMoney(row.unitCost)}</td>
                  <td className="p-2 whitespace-nowrap text-right font-semibold text-slate-800 tabular-nums">{formatMoney(row.totalCost)}</td>
                  <td className="p-2 text-right">
                    <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${isRowActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {isRowActive ? 'Active' : 'Reversed'}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    {canWrite && isRowActive ? (
                      <button
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-700 hover:bg-slate-50"
                        type="button"
                        onClick={() => onReverse(row.docNo)}
                      >
                        Reverse
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="p-8 text-center text-slate-400" colSpan={productionMovementColumnCount}>
                  ยังไม่มีรายการเคลื่อนไหว
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="block lg:hidden divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => {
            const isRowActive = row.status?.toLowerCase() === 'active'
            const isRowReversed = row.status?.toLowerCase() === 'reversed'
            return (
              <div key={index} className={`p-4 space-y-3 text-base ${isRowReversed ? 'bg-slate-50/50 text-slate-400 line-through' : ''}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-bold text-slate-900 text-lg leading-tight block">{index + 1}. {row.productName}</span>
                    <span className="text-sm text-slate-500 font-mono block mt-0.5">{row.productCode}</span>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${isRowActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {isRowActive ? 'Active' : 'Reversed'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 py-2 border-t border-b border-slate-100/50 text-slate-600 text-sm">
                  <div><span className="text-slate-500 font-medium">วันที่:</span> {formatDateDisplay(row.date)}</div>
                  <div><span className="text-slate-500 font-medium">เลขที่:</span> <span className="font-mono">{row.docNo}</span></div>
                  <div><span className="text-slate-500 font-medium">คลัง:</span> {row.warehouseName} {row.stockStatus ? `[${row.stockStatus}]` : ''}</div>
                  <div><span className="text-slate-500 font-medium">Lot No.:</span> <span className="font-mono">{row.lotNo || '-'}</span></div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2.5 bg-slate-50 rounded-md">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">น้ำหนัก (กก.)</span>
                    <span className="font-bold text-slate-950 text-sm tabular-nums">{formatMoney(row.qty)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">ราคา/กก.</span>
                    <span className="font-semibold text-slate-700 text-sm tabular-nums">{formatMoney(row.unitCost)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">รวมมูลค่า</span>
                    <span className="font-bold text-blue-700 text-sm tabular-nums">{formatMoney(row.totalCost)}</span>
                  </div>
                </div>

                {canWrite && isRowActive && (
                  <div className="flex justify-end pt-1">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 h-9 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={() => onReverse(row.docNo)}
                    >
                      Reverse
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
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
      <h5 className="font-bold text-indigo-800 text-xs flex items-center gap-1.5">
        📦 ข้อมูล Stock ปัจจุบันของสินค้าที่จะผลิต: <span className="font-normal text-slate-600">{stock.productName} ({stock.productCode})</span>
      </h5>
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-indigo-100 bg-white shadow-sm">
        <table className="ns-table min-w-full table-fixed divide-y divide-indigo-100 text-sm" style={{ minWidth: 720 }}>
          <colgroup>
            <col style={{ width: 230 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col />
          </colgroup>
          <thead className="border-b border-indigo-100 bg-indigo-50 text-xs font-semibold text-indigo-700">
            <tr>
              <th className="p-2 text-left">สาขา / คลัง</th>
              <th className="p-2 text-right">ประเภท</th>
              <th className="p-2 text-right">จำนวนคงเหลือ (กก.)</th>
              <th className="p-2 text-right">ราคาเฉลี่ย/กก.</th>
              <th className="p-2 text-right">รวมมูลค่า</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-100">
            {stock.rows.map((row, index) => (
              <tr key={index} className="hover:bg-indigo-50/10">
                <td className="min-w-0 p-2 font-medium text-slate-700">
                  <span className="block truncate" title={`${stock.branchCode} / ${row.warehouseCode || destinationWarehouseName}`}>
                    {stock.branchCode} / {row.warehouseCode || destinationWarehouseName}
                  </span>
                </td>
                <td className="p-2 text-right"><span className="rounded bg-slate-100 px-1 py-0.5 text-xs font-bold text-slate-600">{row.status}</span></td>
                <td className="p-2 whitespace-nowrap text-right font-bold text-slate-900 tabular-nums">{formatMoney(row.qty)}</td>
                <td className="p-2 whitespace-nowrap text-right text-slate-500 tabular-nums">{formatMoney(row.avgCost)}</td>
                <td className="p-2 whitespace-nowrap text-right font-bold text-slate-800 tabular-nums">{formatMoney(row.value)}</td>
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
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800 text-sm">{stock.branchCode} / {row.warehouseCode || destinationWarehouseName}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{row.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center py-2 bg-indigo-50/30 rounded-md">
              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-0.5">คงเหลือ (กก.)</span>
                <span className="font-bold text-slate-950 text-sm tabular-nums">{formatMoney(row.qty)}</span>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-0.5">เฉลี่ย/กก.</span>
                <span className="font-semibold text-slate-700 text-sm tabular-nums">{formatMoney(row.avgCost)}</span>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 block mb-0.5">รวมมูลค่า</span>
                <span className="font-bold text-indigo-700 text-sm tabular-nums">{formatMoney(row.value)}</span>
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

function SelectField({ allowBlank = false, disabled = false, error, helperText, label, onChange, options, placeholder, selectId, value, hideCode = false }: { allowBlank?: boolean; disabled?: boolean; error?: string; helperText?: string; label: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; selectId?: string; value: string; hideCode?: boolean }) {
  return (
    <FormField error={error} label={label}>
      <Select aria-invalid={Boolean(error)} id={selectId} name={selectId} className="h-10 w-full" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
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
      <div className="mt-1 break-words text-sm font-medium text-slate-800">{value}</div>
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
  if (status === 'In Production') return compact ? 'text-purple-700' : 'bg-purple-100 text-purple-700'
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
