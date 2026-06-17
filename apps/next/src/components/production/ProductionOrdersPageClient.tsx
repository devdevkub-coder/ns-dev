'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { Plus } from 'lucide-react'

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
const pageSizeOptions = [10, 25, 50, 100]
const statusOptions = ['', 'Open', 'In Production', 'Partially Completed', 'Completed', 'Cancelled']
const sortOptions = [
  { label: 'วันที่', value: 'date' },
  { label: 'เลขที่', value: 'docNo' },
  { label: 'สถานะ', value: 'status' },
  { label: 'ต้นทุนเข้า', value: 'inputCost' },
  { label: 'มูลค่าผลผลิต', value: 'outputValue' },
]

type ProductionOrderColumnKey = 'index' | 'date' | 'docNo' | 'branch' | 'productName' | 'machine' | 'warehouseName' | 'inputQty' | 'wipQty' | 'outputQty' | 'yield' | 'status'

const productionOrderColumns: Array<ResizableColumnDefinition<ProductionOrderColumnKey>> = [
  { key: 'index', defaultWidth: 60, minWidth: 50 },
  { key: 'date', defaultWidth: 100, minWidth: 80 },
  { key: 'docNo', defaultWidth: 130, minWidth: 100 },
  { key: 'branch', defaultWidth: 120, minWidth: 90 },
  { key: 'productName', defaultWidth: 180, minWidth: 130 },
  { key: 'machine', defaultWidth: 140, minWidth: 100 },
  { key: 'warehouseName', defaultWidth: 140, minWidth: 100 },
  { key: 'inputQty', defaultWidth: 120, minWidth: 95 },
  { key: 'wipQty', defaultWidth: 120, minWidth: 95 },
  { key: 'outputQty', defaultWidth: 120, minWidth: 95 },
  { key: 'yield', defaultWidth: 80, minWidth: 60 },
  { key: 'status', defaultWidth: 110, minWidth: 90 },
]

function MatchButton({ active, label, onClick, tone = 'dark' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const activeClass = {
    amber: 'border-amber-600 bg-amber-600 text-white',
    dark: 'border-slate-700 bg-slate-700 text-white',
    emerald: 'border-emerald-600 bg-emerald-600 text-white',
    red: 'border-red-600 bg-red-600 text-white',
    slate: 'border-slate-500 bg-slate-500 text-white',
  }[tone]
  const idleClass = tone === 'amber' ? 'border-slate-300 bg-white hover:bg-amber-50' : tone === 'emerald' ? 'border-slate-300 bg-white hover:bg-emerald-50' : tone === 'red' ? 'border-slate-300 bg-white hover:bg-red-50' : 'border-slate-300 bg-white hover:bg-slate-100'
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<ProductionOrderRow | null>(null)
  const [sort, setSort] = useState('date')
  const [status, setStatus] = useState('Open')

  const columnResize = useResizableColumns('production.orders.v5', productionOrderColumns)

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

  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const latestLoadRequestRef = useRef(0)

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ direction, page: String(page), pageSize: String(pageSize), sort })
      if (search.trim()) params.set('search', search.trim())
      if (status) params.set('status', status)
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
  }, [dateFrom, dateTo, direction, page, pageSize, search, sort, status])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currentRows = useMemo(() => data?.rows ?? [], [data?.rows])
  const totalPages = data?.summary.totalPages ?? 1

  function clearFilters() {
    setSearch('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
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
      <div className="hidden lg:block mb-3 space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input 
            className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm h-9 border-slate-300" 
            placeholder="ค้นหาเลขใบสั่งผลิต / สินค้า / หมายเหตุ..." 
            type="search" 
            value={search} 
            onChange={(event) => { setSearch(event.target.value); setPage(1) }} 
          />
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput className="w-[130px] !h-9 text-sm" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px] !h-9 text-sm" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
          <select className="h-9 rounded-md border px-3 text-sm bg-white text-slate-800 border-slate-300" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>เรียง: {option.label}</option>)}
          </select>
          <button className="h-9 rounded-md border px-3 text-sm bg-white text-slate-700 hover:bg-slate-50 border-slate-300" type="button" onClick={() => setDirection((value) => value === 'asc' ? 'desc' : 'asc')}>{direction === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'}</button>
          {(search || dateFrom || dateTo || status) ? (
            <button className="h-9 rounded-md bg-slate-100 px-3 text-xs hover:bg-slate-200" type="button" onClick={clearFilters}>
              ✕ ล้างทั้งหมด
            </button>
          ) : null}
          <button className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 h-9 flex items-center" type="button" onClick={() => setModalMode('create')}>+ ใบสั่งผลิตใหม่</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">ช่วงเวลา:</span>
              <MatchButton active={isAllPeriod} label="ทั้งหมด" onClick={() => setPeriod('')} />
              <MatchButton active={isTodayPeriod} label="วันนี้" onClick={() => setPeriod('today')} />
              <MatchButton active={isWeekPeriod} label="7 วัน" onClick={() => setPeriod('week')} />
              <MatchButton active={isMonthPeriod} label="เดือนนี้" onClick={() => setPeriod('month')} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">สถานะ:</span>
              <MatchButton active={status === ''} label="ทุกสถานะ" onClick={() => { setStatus(''); setPage(1) }} tone="dark" />
              <MatchButton active={status === 'Open'} label="ยังไม่เริ่ม" onClick={() => { setStatus('Open'); setPage(1) }} tone="dark" />
              <MatchButton active={status === 'In Production'} label="กำลังผลิต" onClick={() => { setStatus('In Production'); setPage(1) }} tone="amber" />
              <MatchButton active={status === 'Partially Completed'} label="เสร็จบางส่วน" onClick={() => { setStatus('Partially Completed'); setPage(1) }} tone="amber" />
              <MatchButton active={status === 'Completed'} label="เสร็จสิ้น" onClick={() => { setStatus('Completed'); setPage(1) }} tone="emerald" />
              <MatchButton active={status === 'Cancelled'} label="ยกเลิก" onClick={() => { setStatus('Cancelled'); setPage(1) }} tone="red" />
            </div>
          </div>
          <span className="text-xs text-slate-500">พบ <b className="text-slate-700">{data?.summary.total ?? 0}</b> ใบ</span>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-3 space-y-2 rounded-md bg-white p-3 shadow lg:hidden animate-fade-in">
        <div className="flex gap-2 items-center">
          <input 
            className="min-w-[150px] flex-1 rounded-md border px-3 h-9 text-sm border-slate-300" 
            placeholder="ค้นหาใบสั่งผลิต..." 
            type="search" 
            value={search} 
            onChange={(event) => { setSearch(event.target.value); setPage(1) }} 
          />
          <button className="h-9 rounded-md bg-slate-100 px-2.5 text-xs text-slate-700" type="button" onClick={() => void loadData()}>
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(dateFrom || dateTo || status) ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden animate-fade-in">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองใบสั่งผลิต</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงเวลา</span>
                <div className="flex flex-wrap gap-2">
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isAllPeriod ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 text-slate-700 bg-white'}`} type="button" onClick={() => setPeriod('')}>ทั้งหมด</button>
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isTodayPeriod ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 text-slate-700 bg-white'}`} type="button" onClick={() => setPeriod('today')}>วันนี้</button>
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isWeekPeriod ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 text-slate-700 bg-white'}`} type="button" onClick={() => setPeriod('week')}>7 วัน</button>
                  <button className={`flex-1 h-9 rounded-md text-xs border ${isMonthPeriod ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 text-slate-700 bg-white'}`} type="button" onClick={() => setPeriod('month')}>เดือนนี้</button>
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput className="flex-1" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      status === '' 
                        ? 'border-slate-700 bg-slate-700 text-white' 
                        : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
                    }`}
                    type="button"
                    onClick={() => { setStatus(''); setPage(1) }}
                  >
                    ทุกสถานะ
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      status === 'Open' 
                        ? 'border-slate-700 bg-slate-700 text-white' 
                        : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
                    }`}
                    type="button"
                    onClick={() => { setStatus('Open'); setPage(1) }}
                  >
                    ยังไม่เริ่ม
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      status === 'In Production' 
                        ? 'border-amber-600 bg-amber-600 text-white' 
                        : 'border-slate-300 text-slate-700 bg-white hover:bg-amber-50'
                    }`}
                    type="button"
                    onClick={() => { setStatus('In Production'); setPage(1) }}
                  >
                    กำลังผลิต
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      status === 'Partially Completed' 
                        ? 'border-amber-600 bg-amber-600 text-white' 
                        : 'border-slate-300 text-slate-700 bg-white hover:bg-amber-50'
                    }`}
                    type="button"
                    onClick={() => { setStatus('Partially Completed'); setPage(1) }}
                  >
                    เสร็จบางส่วน
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      status === 'Completed' 
                        ? 'border-emerald-600 bg-emerald-600 text-white' 
                        : 'border-slate-300 text-slate-700 bg-white hover:bg-emerald-50'
                    }`}
                    type="button"
                    onClick={() => { setStatus('Completed'); setPage(1) }}
                  >
                    เสร็จสิ้น
                  </button>
                  <button
                    className={`h-9 rounded-md text-xs font-medium border outline-none ${
                      status === 'Cancelled' 
                        ? 'border-red-600 bg-red-600 text-white' 
                        : 'border-slate-300 text-slate-700 bg-white hover:bg-red-50'
                    }`}
                    type="button"
                    onClick={() => { setStatus('Cancelled'); setPage(1) }}
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">เรียงลำดับ</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}>
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  clearFilters()
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
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? <div className="rounded-md bg-white p-10 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      {!isLoading && currentRows.length > 0 ? (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto rounded-md bg-white border border-slate-200 shadow">
            <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {productionOrderColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <tr>
                  <ResizableTableHead label="ลำดับ" resizeProps={columnResize.getResizeHandleProps('index', 'ลำดับ')} />
                  <ResizableTableHead
                    activeSortKey={sort}
                    direction={direction}
                    label="วันที่"
                    sortKey="date"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')}
                  />
                  <ResizableTableHead
                    activeSortKey={sort}
                    direction={direction}
                    label="เลขที่"
                    sortKey="docNo"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')}
                  />
                  <ResizableTableHead label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
                  <ResizableTableHead label="สินค้าที่ผลิต" resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้าที่ผลิต')} />
                  <ResizableTableHead label="เครื่องจักร" resizeProps={columnResize.getResizeHandleProps('machine', 'เครื่องจักร')} />
                  <ResizableTableHead label="คลังรับผลผลิต" resizeProps={columnResize.getResizeHandleProps('warehouseName', 'คลังรับผลผลิต')} />
                  <ResizableTableHead align="right" label="ปริมาณเบิก (กก.)" resizeProps={columnResize.getResizeHandleProps('inputQty', 'ปริมาณเบิก (กก.)')} />
                  <ResizableTableHead align="right" label="WIP คงเหลือ" resizeProps={columnResize.getResizeHandleProps('wipQty', 'WIP คงเหลือ')} />
                  <ResizableTableHead align="right" label="ปริมาณผลิต (กก.)" resizeProps={columnResize.getResizeHandleProps('outputQty', 'ปริมาณผลิต (กก.)')} />
                  <ResizableTableHead align="right" label="Yield" resizeProps={columnResize.getResizeHandleProps('yield', 'Yield')} />
                  <ResizableTableHead
                    activeSortKey={sort}
                    align="center"
                    direction={direction}
                    label="สถานะ"
                    sortKey="status"
                    onSort={toggleSort}
                    resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                      <td className="p-3 font-mono font-semibold text-slate-900 truncate" title={row.docNo}>{row.docNo}</td>
                      <td className="p-3 truncate" title={row.branchName}>{row.branchName}</td>
                      <td className="p-3 min-w-0">
                        <div className="font-semibold text-slate-800 truncate" title={row.productName || 'ยังไม่ได้กำหนดสินค้า'}>{row.productName || 'ยังไม่ได้กำหนดสินค้า'}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{row.productCode || row.productId || '-'}</div>
                      </td>
                      <td className="p-3 min-w-0">
                        {row.machineName ? (
                          <div className="truncate">
                            <span className="font-medium text-slate-800" title={row.machineName}>{row.machineName}</span>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">{row.machineType || '-'}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-3 truncate" title={row.warehouseName}>{row.warehouseName || '-'}</td>
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
                      <td className="p-3 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Grid/Card View */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
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
        <div className="rounded-md bg-white p-12 text-center text-slate-400 shadow">
          <div className="mb-2 text-3xl font-semibold">ใบสั่งผลิต</div>
          <div>ยังไม่มีใบสั่งผลิต</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div className="flex items-center gap-3">
          <span>รวมทั้งหมด <span className="font-semibold text-slate-900">{data?.summary.total ?? 0}</span> รายการ</span>
          {columnResize.hasCustomWidths ? (
            <button
              className="rounded-md border border-slate-300 px-2 py-0.5 bg-white text-slate-700 hover:bg-slate-50 text-xs"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border border-slate-300 px-2 py-1 bg-white text-slate-800 text-sm" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50 bg-white text-slate-700 hover:bg-slate-50 text-sm" disabled={page <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1 text-sm font-medium">หน้า {data?.page ?? page} / {totalPages}</span>
          <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50 bg-white text-slate-700 hover:bg-slate-50 text-sm" disabled={page >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</button>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
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

function OrderCard({ onOpen, row }: { onOpen: () => void; row: ProductionOrderRow }) {
  const yieldPct = row.inputQty > 0 ? (row.outputQty / row.inputQty) * 100 : 0
  const wipQty = Math.max(0, row.wipQty ?? 0)
  return (
    <div className={`relative cursor-pointer overflow-hidden rounded-md border-2 p-4 shadow-md transition hover:shadow-xl ${cardClass(row.status)}`} onClick={onOpen}>
      <div className="absolute right-2 top-2"><StatusBadge status={row.status} /></div>
      <div className="mb-1 font-mono text-xs text-slate-400">{row.docNo}</div>
      <div className="mb-3 text-xs text-slate-500">{formatDateDisplay(row.date)} · {row.branchName}</div>
      <div className="mb-3 rounded-md border border-slate-200 bg-white/80 p-3">
        <div className="mb-1 text-xs text-slate-500">สินค้าที่ผลิต</div>
        <div className="text-base font-bold leading-tight text-amber-700 truncate">{row.productName || 'ยังไม่ได้กำหนดสินค้า'}</div>
        <div className="mt-1 text-xs text-slate-500 truncate">{row.productCode || row.productId || '-'} · {row.warehouseName}</div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <MiniMetric label="เบิก" tone="red" value={row.inputQty} />
        <MiniMetric label="WIP" tone="amber" value={wipQty} />
        <MiniMetric label="ผลิต" tone="emerald" value={row.outputQty} />
      </div>
      {row.inputQty > 0 ? (
        <div className="mb-2">
          <div className="mb-0.5 flex justify-between text-xs"><span className="text-slate-500">Yield</span><span className={`font-bold ${yieldPct >= 90 ? 'text-emerald-700' : yieldPct >= 70 ? 'text-blue-700' : 'text-amber-700'}`}>{yieldPct.toFixed(1)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-500" style={{ width: `${Math.min(100, yieldPct)}%` }} /></div>
        </div>
      ) : null}
      {row.status === 'Completed' ? <CountdownTimer closedAt={row.closedAt} /> : null}
      <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
        <div className="text-xs"><span className="text-slate-500">ต้นทุน:</span><b className="ml-1 text-slate-700">{formatMoney(row.inputCost)}</b></div>
        <button className="rounded-md bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700" type="button">เปิด</button>
      </div>
    </div>
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
        setText('หมดเวลาแก้ไข (Locked)')
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

  const isLocked = text.includes('Locked')

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
          const defaultWhCode = current.sourceWarehouseCode || payload.warehouses[0]?.code || ''
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
    if (!isCreate) return
    if (!createForm.branchCode || !createForm.targetProductCode || !createForm.destinationWarehouseCode) {
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
          branchCode: createForm.branchCode,
          productCode: createForm.targetProductCode,
          warehouseCode: createForm.destinationWarehouseCode,
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
  }, [createForm.branchCode, createForm.destinationWarehouseCode, createForm.targetProductCode, isCreate])

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
      <DialogContent className="max-w-5xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 max-h-[90vh] animate-fade-in" hideClose>
        <div className="bg-slate-900 px-5 py-4 shrink-0 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle className="font-mono text-lg font-bold text-slate-100">{isCreate ? 'ใบสั่งผลิตใหม่' : row?.docNo ?? ''}</DialogTitle>
              <StatusBadge status={isCreate ? 'Open' : row?.status ?? '-'} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isCreate && row ? (
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-800 hover:bg-teal-700" disabled={isSaving || rowWipQty > 0 || row.status === 'Completed' || row.status === 'Cancelled'} type="button" onClick={() => void patchOrder('complete')}>จบงาน</button>
                  <button className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-800 hover:bg-red-700" disabled={isSaving || row.inputCount > 0 || row.outputCount > 0 || row.status === 'Cancelled'} type="button" onClick={() => void patchOrder('cancel')}>ยกเลิก</button>
                </div>
              ) : null}
              <button className="text-2xl text-slate-400 hover:text-slate-200 ml-1" type="button" onClick={() => onClose(false)}>&times;</button>
            </div>
          </div>
          {!isCreate && row ? (
            <div className="mt-3 rounded-md border-l-4 border-amber-500 bg-slate-800/80 p-3 text-white">
              <div className="text-xs font-bold text-amber-300">สินค้าที่ผลิต</div>
              <div className="text-lg font-bold text-amber-200">{row.productName}</div>
              <div className="font-mono text-xs text-slate-300">{row.productCode || '-'}</div>
            </div>
          ) : null}
          {error ? <div className="mt-3"><Alert tone="red" title="บันทึกไม่สำเร็จ" text={error} /></div> : null}
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 space-y-3 p-4">
          {!isCreate ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6 text-sm">
              <Metric label="วัตถุดิบเบิก" value={formatMoney(row?.inputQty ?? 0)} tone="danger" />
              <Metric label="ผลผลิตได้" value={formatMoney(row?.outputQty ?? 0)} />
              <Metric label="WIP คงเหลือ" value={formatMoney(rowWipQty)} />
              <Metric label="RM Cost" value={formatMoney(row?.inputCost ?? 0)} />
              <Metric label="Output Value" value={formatMoney(row?.outputValue ?? 0)} />
              <Metric label="Yield" value={`${((row?.inputQty ?? 0) > 0 ? ((row?.outputQty ?? 0) / (row?.inputQty ?? 1)) * 100 : 0).toFixed(1)}%`} />
            </div>
          ) : null}

          {!isCreate ? (
            <div className="flex overflow-x-auto rounded-t-md border-b border-slate-100 bg-white shadow">
              {[
                ['header', 'Header'],
                ['input', `Input (${row?.inputCount ?? 0})`],
                ['output', `Output (${row?.outputCount ?? 0})`],
              ].map(([key, label]) => (
                <button key={key} className={`whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium ${tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`} type="button" onClick={() => setTab(key as typeof tab)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {(isCreate || tab === 'header') ? (
            isCreate ? (
              <div className="space-y-3">
                {/* กลุ่มที่ 1: ข้อมูลพื้นฐาน */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ข้อมูลพื้นฐาน</h3>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <FormField error={createErrors.date} label="วันที่ *">
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
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">เครื่องจักร & ไลน์ผลิต</h3>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <SelectField label="เครื่องจักร" allowBlank value={createForm.machineCode} options={options.machines} onChange={updateCreateMachine} />
                    <ReadField label="ประเภทเครื่องจักร" value={createForm.machineType || '-'} />
                    <SelectField label="ไลน์ผลิต" allowBlank value={createForm.productionLineCode} options={options.productionLines} onChange={(productionLineCode) => updateCreateForm('productionLineCode', productionLineCode)} />
                  </div>
                </div>

                {/* กลุ่มที่ 3: ข้อมูลเพิ่มเติม */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ข้อมูลเพิ่มเติม</h3>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <FormField label="Shift">
                      <select
                        className="w-full rounded-md border px-3 py-2 border-slate-300 bg-white h-9 text-sm outline-none text-slate-800"
                        value={createForm.shift}
                        onChange={(event) => updateCreateForm('shift', event.target.value)}
                      >
                        <option value="เช้า">เช้า</option>
                        <option value="บ่าย">บ่าย</option>
                      </select>
                    </FormField>
                    <div className="md:col-span-2">
                      <FormField label="หมายเหตุ">
                        <input className="w-full rounded-md border px-3 py-2 border-slate-300 bg-white" value={createForm.notes} onChange={(event) => updateCreateForm('notes', event.target.value)} />
                      </FormField>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-white p-5 shadow">
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <ReadField label="เลขที่เอกสาร" value={row?.docNo ?? '-'} />
                  <ReadField label="วันที่" value={row?.date ?? '-'} />
                  <ReadField label="สถานะ" value={row?.status ? statusLabel(row.status) : '-'} />
                  <ReadField label="สินค้าเป้าหมาย" value={row?.productName ?? '-'} />
                  <ReadField label="สาขา" value={row?.branchName ?? '-'} />
                  <ReadField label="เครื่องจักร" value={row?.machineName ?? '-'} />
                  <ReadField label="ประเภทเครื่องจักร" value={row?.machineType ?? '-'} />
                  <ReadField label="คลังรับผลผลิต" value={row?.warehouseName ?? '-'} />
                  <ReadField label="WIP" value={formatMoney(rowWipQty)} />
                  <ReadField label="หมายเหตุ" value={row?.notes || '-'} />
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

        <div className="flex flex-wrap justify-end items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
          <button 
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 bg-transparent border-0 outline-none transition-colors" 
            type="button" 
            onClick={() => onClose(false)}
          >
            {isCreate ? 'ยกเลิก' : 'ปิด'}
          </button>
          {isCreate ? (
            <button 
              className="rounded-md bg-[#0F172A] hover:bg-[#1E293B] px-5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50" 
              disabled={isSaving} 
              type="button" 
              onClick={() => void submitCreate()}
            >
              {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
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
    <div className="rounded-md bg-white p-5 shadow space-y-4">
      <div className="border-b border-slate-100 pb-2">
        <h4 className="text-base font-bold text-slate-800">{title}</h4>
      </div>

      {canWrite ? (
        <form
          ref={formRef}
          noValidate
          className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(formRef.current ?? undefined)
          }}
        >
          {form}
          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              className="rounded-md bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? 'กำลังบันทึก...' : actionLabel}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="hidden lg:table w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
            <tr>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">สินค้า</th>
              <th className="p-2 text-left">คลัง</th>
              <th className="p-2 text-left">Lot No.</th>
              <th className="p-2 text-right">น้ำหนัก (กก.)</th>
              <th className="p-2 text-right">ราคา/กก.</th>
              <th className="p-2 text-right">รวมมูลค่า</th>
              <th className="p-2 text-center">สถานะ</th>
              <th className="p-2 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const isRowActive = row.status?.toLowerCase() === 'active'
              const isRowReversed = row.status?.toLowerCase() === 'reversed'
              return (
                <tr key={index} className={`hover:bg-slate-50 ${isRowReversed ? 'bg-slate-50/50 text-slate-400 line-through' : ''}`}>
                  <td className="p-2 whitespace-nowrap">{formatDateDisplay(row.date)}</td>
                  <td className="p-2 font-mono">{row.docNo}</td>
                  <td className="p-2">
                    <span className="font-semibold">{row.productName}</span>
                    <div className="text-[10px] text-slate-400 font-mono">{row.productCode}</div>
                  </td>
                  <td className="p-2">
                    {row.warehouseName}
                    {row.stockStatus ? <span className="ml-1 text-[10px] text-slate-400 font-semibold">[{row.stockStatus}]</span> : null}
                  </td>
                  <td className="p-2 font-mono">{row.lotNo || '-'}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{formatMoney(row.qty)}</td>
                  <td className="p-2 text-right text-slate-500 tabular-nums">{formatMoney(row.unitCost)}</td>
                  <td className="p-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(row.totalCost)}</td>
                  <td className="p-2 text-center">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isRowActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {isRowActive ? 'Active' : 'Reversed'}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      disabled={!canWrite || !isRowActive}
                      type="button"
                      onClick={() => onReverse(row.docNo)}
                    >
                      Reverse
                    </button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-slate-400" colSpan={10}>
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
              <div key={index} className={`p-4 space-y-2 text-xs ${isRowReversed ? 'bg-slate-50/50 text-slate-400 line-through' : ''}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="font-semibold text-slate-900 text-sm leading-tight block">{index + 1}. {row.productName}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">{row.productCode}</span>
                  </div>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isRowActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {isRowActive ? 'Active' : 'Reversed'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-1.5 border-t border-b border-slate-100/50 text-slate-600">
                  <div><span className="text-slate-400 font-medium">วันที่:</span> {formatDateDisplay(row.date)}</div>
                  <div><span className="text-slate-400 font-medium">เลขที่:</span> <span className="font-mono">{row.docNo}</span></div>
                  <div><span className="text-slate-400 font-medium">คลัง:</span> {row.warehouseName} {row.stockStatus ? `[${row.stockStatus}]` : ''}</div>
                  <div><span className="text-slate-400 font-medium">Lot No.:</span> <span className="font-mono">{row.lotNo || '-'}</span></div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2 bg-slate-50 rounded-md">
                  <div>
                    <span className="text-[9px] text-slate-400 block">น้ำหนัก (กก.)</span>
                    <span className="font-bold text-slate-700 tabular-nums">{formatMoney(row.qty)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block">ราคา/กก.</span>
                    <span className="font-medium text-slate-500 tabular-nums">{formatMoney(row.unitCost)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 block">รวมมูลค่า</span>
                    <span className="font-bold text-blue-700 tabular-nums">{formatMoney(row.totalCost)}</span>
                  </div>
                </div>

                {canWrite && isRowActive && (
                  <div className="flex justify-end pt-1">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
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
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
      <h5 className="font-bold text-indigo-800 text-xs flex items-center gap-1.5">
        📦 ข้อมูล Stock ปัจจุบันของสินค้าที่จะผลิต: <span className="font-normal text-slate-600">{stock.productName} ({stock.productCode})</span>
      </h5>
      
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto rounded-md bg-white border border-indigo-100">
        <table className="w-full text-xs">
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
                <td className="p-2 font-medium text-slate-700">{stock.branchCode} / {row.warehouseCode || destinationWarehouseName}</td>
                <td className="p-2 text-center"><span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold text-slate-600">{row.status}</span></td>
                <td className="p-2 text-right font-bold text-slate-900 tabular-nums">{formatMoney(row.qty)}</td>
                <td className="p-2 text-right text-slate-500 tabular-nums">{formatMoney(row.avgCost)}</td>
                <td className="p-2 text-right font-bold text-indigo-700 tabular-nums">{formatMoney(row.value)}</td>
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
      <div className="block lg:hidden divide-y divide-indigo-100/60 bg-white rounded-md border border-indigo-100 overflow-hidden shadow-sm">
        {stock.rows.map((row, index) => (
          <div key={index} className="p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-700">{stock.branchCode} / {row.warehouseCode || destinationWarehouseName}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{row.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center py-1.5 bg-indigo-50/30 rounded-md">
              <div>
                <span className="text-[9px] text-slate-400 block">คงเหลือ (กก.)</span>
                <span className="font-bold text-slate-900 tabular-nums">{formatMoney(row.qty)}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block">เฉลี่ย/กก.</span>
                <span className="font-medium text-slate-500 tabular-nums">{formatMoney(row.avgCost)}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block">รวมมูลค่า</span>
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

function FormField({ children, error, label }: { children: React.ReactNode; error?: string; label: string }) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600 font-bold">*</span> : null}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  )
}

function readFormValue(formElement: HTMLFormElement | undefined, inputId: string) {
  const element = formElement?.querySelector(`#${inputId}`) ?? (typeof document === 'undefined' ? null : document.getElementById(inputId))
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) return element.value.trim()
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
      <select id={selectId} className={`w-full rounded-md border px-3 py-2 disabled:bg-slate-100 disabled:text-slate-600 ${error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-800'} h-9 text-sm outline-none`} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allowBlank ? '-' : (placeholder ?? 'เลือกข้อมูล')}</option>
        {options.map((option) => {
          const displayLabel = hideCode ? option.name : (option.code === option.name ? option.name : `${option.code} - ${option.name}`)
          return <option key={`${option.code}-${option.id}`} value={option.code}>{displayLabel}</option>
        })}
      </select>
      {helperText ? <span className="mt-1 block text-xs text-slate-500">{helperText}</span> : null}
    </FormField>
  )
}

function MiniMetric({ label, tone, value }: { label: string; tone: 'amber' | 'emerald' | 'red'; value: number }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-amber-700'
  return <div className="rounded-md bg-white/70 p-2"><div className={`text-[10px] ${color}`}>{label}</div><div className={`text-sm font-bold ${color}`}>{formatMoney(value)}</div></div>
}

function Metric({ label, value, tone = 'normal' }: { label: string; tone?: 'normal' | 'danger'; value: string }) {
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-3">
      <div className="text-xs text-slate-500 font-semibold">{label}</div>
      <div className={`mt-1 text-lg font-bold ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 font-semibold">{label}</div>
      <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{value}</div>
    </div>
  )
}

function Alert({ text, title, tone }: { text: string; title: string; tone: 'red' }) {
  const className = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : ''
  return <div className={`rounded-md border p-4 text-sm ${className}`}><div className="font-bold">{title}</div><div className="mt-1">{text}</div></div>
}

function cardClass(status: string) {
  if (status === 'Completed') return 'border-emerald-300 bg-emerald-50'
  if (status === 'In Production' || status === 'Partially Completed') return 'border-blue-400 bg-blue-50'
  if (status === 'Cancelled') return 'border-slate-300 bg-slate-50 opacity-70'
  return 'border-slate-200 bg-white hover:border-blue-300'
}

function statusClass(status: string) {
  if (status === 'In Production') return 'bg-purple-100 text-purple-700'
  if (status === 'Partially Completed') return 'bg-amber-100 text-amber-700'
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Cancelled') return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-700'
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusClass(status)}`}>{statusLabel(status)}</span>
}

