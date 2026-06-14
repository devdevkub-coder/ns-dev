'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { stockAdjustReasonOptions } from '@/lib/stock'
import type { StatusConvertFormValues, StockAdjustFormValues, StockConvertFormValues, StockCostPoolOption, StockOption } from '@/lib/stock'

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

const STATUS_CONVERT_PAGE_SIZES = [10, 20, 50, 100]

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
    title: 'Grade Adjustment / ปรับเกรดสินค้า',
  },
  'status-convert': {
    accent: 'from-purple-700 to-pink-700',
    api: '/api/stock/status-convert',
    title: 'ปรับสถานะสินค้า / Status Convert',
  },
} satisfies Record<Mode, { accent: string; api: string; title: string }>

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
  const [search, setSearch] = useState('')
  const [sourceTypeFilter, setSourceTypeFilter] = useState('')
  const [toDateFilter, setToDateFilter] = useState('')
  const [statusConvertPage, setStatusConvertPage] = useState(1)
  const [statusConvertPageSize, setStatusConvertPageSize] = useState(20)
  const [statusConvertSortDirection, setStatusConvertSortDirection] = useState<SortDirection>('desc')
  const [statusConvertSortKey, setStatusConvertSortKey] = useState<StatusConvertSortKey>('date')
  const [convertDetail, setConvertDetail] = useState<StockConvertDetail | null>(null)
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
      .filter((row) => mode !== 'adjust' || !adjustBranchFilter || row.branchId === adjustBranchFilter)
      .filter((row) => mode !== 'adjust' || !adjustTypeFilter || row.adjustType === adjustTypeFilter)
      .filter((row) => mode !== 'adjust' || !fromDateFilter || String(row.date ?? '') >= fromDateFilter)
      .filter((row) => mode !== 'adjust' || !toDateFilter || String(row.date ?? '') <= toDateFilter)
  }, [adjustBranchFilter, adjustTypeFilter, costStatusFilter, data.rows, fromDateFilter, mode, search, sourceTypeFilter, toDateFilter])

  useEffect(() => {
    if (mode === 'status-convert') setStatusConvertPage(1)
  }, [mode, rows.length, search])

  const statusConvertSortedRows = useMemo(() => {
    if (mode !== 'status-convert') return rows
    return [...rows].sort((left, right) => compareStatusConvertRows(left, right, statusConvertSortKey, statusConvertSortDirection))
  }, [mode, rows, statusConvertSortDirection, statusConvertSortKey])

  const statusConvertTotalPages = useMemo(() => {
    if (mode !== 'status-convert') return 1
    return Math.max(1, Math.ceil(statusConvertSortedRows.length / statusConvertPageSize))
  }, [mode, statusConvertPageSize, statusConvertSortedRows.length])

  useEffect(() => {
    if (mode !== 'status-convert') return
    setStatusConvertPage((currentPage) => Math.min(currentPage, statusConvertTotalPages))
  }, [mode, statusConvertTotalPages])

  const visibleRows = useMemo(() => {
    if (mode !== 'status-convert') return rows
    const startIndex = (statusConvertPage - 1) * statusConvertPageSize
    return statusConvertSortedRows.slice(startIndex, startIndex + statusConvertPageSize)
  }, [mode, rows, statusConvertPage, statusConvertPageSize, statusConvertSortedRows])

  const hasFilters = useMemo(() => {
    if (mode === 'convert') return Boolean(search.trim() || sourceTypeFilter || costStatusFilter)
    if (mode === 'adjust') return Boolean(search.trim() || adjustBranchFilter || adjustTypeFilter || fromDateFilter || toDateFilter)
    return Boolean(search.trim())
  }, [mode, search, sourceTypeFilter, costStatusFilter, adjustBranchFilter, adjustTypeFilter, fromDateFilter, toDateFilter])

  const resetFilters = useCallback(() => {
    setSearch('')
    setSourceTypeFilter('')
    setCostStatusFilter('')
    setAdjustBranchFilter('')
    setAdjustTypeFilter('')
    setFromDateFilter('')
    setToDateFilter('')
  }, [])

  function toggleStatusConvertSort(nextKey: StatusConvertSortKey) {
    if (statusConvertSortKey === nextKey) {
      setStatusConvertSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
      return
    }
    setStatusConvertSortKey(nextKey)
    setStatusConvertSortDirection(nextKey === 'date' ? 'desc' : 'asc')
  }

  async function submit(values: StatusConvertFormValues | StockConvertFormValues | StockAdjustFormValues) {
    setError(null)
    setIsSaving(true)
    try {
      await dailyFetchJson(meta.api, { body: JSON.stringify(values), method: 'POST' })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่ได้')
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
    const reasonText = window.prompt(`เลือกเหตุผลโดยใส่หมายเลข:\n${stockAdjustReasonOptions.map((reason, index) => `${index + 1}. ${reason}`).join('\n')}`, '1')
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
    link.href = `${meta.api}?detail=${encodeURIComponent(refNo)}&format=csv`
    link.download = `stock-convert-${refNo}-allocation.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {mode === 'adjust' ? <AdjustPrincipleBox /> : null}
      <SummaryCards mode={mode} rows={rows} />
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:block mb-4 space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={mode === 'convert' ? 'ค้นหา doc/source/target/ref...' : mode === 'adjust' ? 'ค้นหา doc/สินค้า/เหตุผล...' : 'ค้นหาเลขที่/วันที่/สินค้า/เหตุผล...'}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {mode === 'convert' ? (
            <>
              <select className="h-9 rounded-md border border-slate-300 bg-amber-50 px-3 text-sm font-medium text-slate-800" value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
                <option value="">ทุก Source Type</option>
                <option value="Manual">📝 Manual</option>
                <option value="Auto (FIFO)">Auto FIFO</option>
                <option value="Auto (LIFO)">Auto LIFO</option>
                <option value="Auto (HIGHEST_COST)">Auto Highest Cost</option>
                <option value="Auto (LOWEST_COST)">Auto Lowest Cost</option>
                <option value="Legacy">Legacy</option>
              </select>
              <select className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800" value={costStatusFilter} onChange={(event) => setCostStatusFilter(event.target.value)}>
                <option value="">ทุก Cost Status</option>
                <option value="allocated">✓ Allocated</option>
                <option value="pending_cost">⏳ Pending Cost</option>
                <option value="partial">📋 Partial</option>
              </select>
            </>
          ) : mode === 'adjust' ? (
            <>
              <select className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800" value={adjustBranchFilter} onChange={(event) => setAdjustBranchFilter(event.target.value)}>
                <option value="">ทุกสาขา</option>
                {data.reference.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <DatePickerInput className="w-[130px] h-9" title="จากวันที่" value={fromDateFilter} onChange={setFromDateFilter} />
              <DatePickerInput className="w-[130px] h-9" title="ถึงวันที่" value={toDateFilter} onChange={setToDateFilter} />
              <button className="h-9 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500 opacity-60 flex items-center justify-center border border-slate-200" disabled title="รอ export contract สำหรับ stock adjustment" type="button">📥 CSV</button>
            </>
          ) : null}

          {hasFilters ? (
            <button className="h-9 rounded-md border border-slate-300 bg-slate-100 px-3 text-xs hover:bg-slate-200" type="button" onClick={resetFilters}>
              ✕ ล้าง
            </button>
          ) : null}

          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" type="button" onClick={() => void loadData()}>
            โหลดใหม่
          </button>
          <a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors ml-auto" href={`${pathname}?new=1`}>
            {mode === 'adjust' ? '+ ปรับสต๊อกใหม่' : mode === 'convert' ? '+ ปรับเกรดใหม่' : '+ ปรับสถานะใหม่'}
          </a>
        </div>
        {mode === 'adjust' ? (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">ประเภท:</span>
            <SegmentedButton active={!adjustTypeFilter} label="ทั้งหมด" onClick={() => setAdjustTypeFilter('')} />
            <SegmentedButton active={adjustTypeFilter === 'LOSS'} label="นับขาด" onClick={() => setAdjustTypeFilter('LOSS')} />
            <SegmentedButton active={adjustTypeFilter === 'GAIN'} label="นับเกิน" onClick={() => setAdjustTypeFilter('GAIN')} />
          </div>
        ) : null}
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-md bg-white p-3 shadow md:hidden">
        <div className="flex gap-2 items-center">
          <input
            className="min-w-[150px] flex-1 rounded-md border border-slate-300 px-3 h-9 text-sm"
            placeholder="ค้นหาด่วน..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="h-9 rounded-md bg-slate-100 px-2.5 text-xs text-slate-700 border border-slate-200" type="button" onClick={() => void loadData()}>
            โหลดใหม่
          </button>
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
            <span className="text-[11px] text-slate-500">ประเภท:</span>
            <SegmentedButton active={!adjustTypeFilter} label="ทั้งหมด" onClick={() => setAdjustTypeFilter('')} />
            <SegmentedButton active={adjustTypeFilter === 'LOSS'} label="นับขาด" onClick={() => setAdjustTypeFilter('LOSS')} />
            <SegmentedButton active={adjustTypeFilter === 'GAIN'} label="นับเกิน" onClick={() => setAdjustTypeFilter('GAIN')} />
          </div>
        ) : null}
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองรายการ</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {mode === 'convert' ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Source Type</span>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 bg-white text-slate-800" value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
                      <option value="">ทุก Source Type</option>
                      <option value="Manual">📝 Manual</option>
                      <option value="Auto (FIFO)">Auto FIFO</option>
                      <option value="Auto (LIFO)">Auto LIFO</option>
                      <option value="Auto (HIGHEST_COST)">Auto Highest Cost</option>
                      <option value="Auto (LOWEST_COST)">Auto Lowest Cost</option>
                      <option value="Legacy">Legacy</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Cost Status</span>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 bg-white text-slate-800" value={costStatusFilter} onChange={(event) => setCostStatusFilter(event.target.value)}>
                      <option value="">ทุก Cost Status</option>
                      <option value="allocated">✓ Allocated</option>
                      <option value="pending_cost">⏳ Pending Cost</option>
                      <option value="partial">📋 Partial</option>
                    </select>
                  </label>
                </>
              ) : mode === 'adjust' ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 bg-white text-slate-800" value={adjustBranchFilter} onChange={(event) => setAdjustBranchFilter(event.target.value)}>
                      <option value="">ทุกสาขา</option>
                      {data.reference.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
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
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
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
                className="h-11 rounded-md bg-slate-900 text-sm font-semibold text-white hover:bg-slate-850"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* FAB for Mobile Creation */}
      <a
        aria-label="สร้างรายการใหม่"
        className="h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg fixed bottom-6 right-6 z-40 md:hidden flex items-center justify-center hover:bg-blue-700"
        href={`${pathname}?new=1`}
      >
        <Plus className="h-6 w-6" />
      </a>
      {mode === 'status-convert' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>พบทั้งหมด {rows.length} รายการ</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              value={String(statusConvertPageSize)}
              onChange={(event) => {
                setStatusConvertPageSize(Number(event.target.value))
                setStatusConvertPage(1)
              }}
            >
              {STATUS_CONVERT_PAGE_SIZES.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} / หน้า
                </option>
              ))}
            </select>
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
      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8 animate-fade-in">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shrink-0">
              <h3 className="font-bold text-slate-900">{meta.title}</h3>
              <a className="text-2xl text-slate-400 hover:text-slate-700" href={pathname}>&times;</a>
            </div>
            {mode === 'status-convert' ? <StatusConvertForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
            {mode === 'convert' ? <ConvertForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
            {mode === 'adjust' ? <AdjustForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
          </div>
        </div>
      ) : null}
      <OperationTable
        isLoading={isLoading}
        mode={mode}
        rows={visibleRows}
        sortDirection={mode === 'status-convert' ? statusConvertSortDirection : undefined}
        sortKey={mode === 'status-convert' ? statusConvertSortKey : undefined}
        onConvertDetail={mode === 'convert' ? openConvertDetail : undefined}
        onAdjustCorrect={mode === 'adjust' ? correctAdjust : undefined}
        onSortChange={mode === 'status-convert' ? toggleStatusConvertSort : undefined}
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
      {mode === 'adjust' ? <AdjustUsageBox /> : null}
    </section>
  )
}

function descriptionFor(mode: Mode) {
  if (mode === 'status-convert') return 'แปลง stock bucket RM ↔ FG ของสินค้าเดิม · ลดต้นทางเพิ่มปลายทางทันที · ใช้ source WAC และบันทึก Stock Ledger 2 ฝั่ง'
  if (mode === 'convert') return 'ตัดสินค้าต้นทางจาก Cost Pool ด้วย FIFO/LIFO/Cost/Manual แล้วเพิ่มสินค้าปลายทางกลับเข้า Cost Pool เป็น Regrade'
  return 'หาของไม่เจอ · สต๊อกตัด 0 แล้ว แต่ในระบบยังมี · นับเกินระบบ — Quick Adjust ทีละ row · กระทบ stock value/WAC'
}

function SummaryCards({ mode, rows }: { mode: Mode; rows: Payload['rows'] }) {
  const totalQty = rows.reduce((sum, row) => sum + Number(row.qty ?? row.sourceQty ?? row.diffQty ?? 0), 0)
  const totalValue = rows.reduce((sum, row) => sum + Number(row.value ?? row.valueNote ?? 0), 0)
  if (mode === 'convert') {
    const posted = rows.filter((row) => row.status === 'posted').length
    const pendingCost = rows.filter((row) => row.costStatus === 'pending_cost').length
    const manualCount = rows.filter((row) => row.sourceType === 'Manual').length
    const autoCount = rows.filter((row) => String(row.sourceType ?? '').startsWith('Auto')).length
    const reversed = rows.filter((row) => row.status === 'reversed').length
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 lg:grid-cols-7 text-sm">
        <Metric emoji="📋" iconBg="bg-slate-100" label="รายการทั้งหมด" value={String(rows.length)} valueClassName="text-slate-900" />
        <Metric emoji="✅" iconBg="bg-emerald-100 text-emerald-700" label="Posted" value={String(posted)} valueClassName="text-emerald-700" />
        <Metric emoji="⏳" iconBg="bg-amber-100 text-amber-700" label="Pending Cost" value={String(pendingCost)} valueClassName="text-amber-700" />
        <Metric emoji="📝" iconBg="bg-blue-100 text-blue-700" label="Manual" value={String(manualCount)} valueClassName="text-blue-700" />
        <Metric emoji="🏭" iconBg="bg-purple-100 text-purple-700" label="Auto Cost Pool" value={String(autoCount)} valueClassName="text-purple-700" />
        <Metric emoji="⚖️" iconBg="bg-slate-100" label="น้ำหนักรวม" value={`${formatMoney(totalQty)} กก.`} valueClassName="text-slate-900" />
        <Metric emoji="🔄" iconBg="bg-slate-100 text-slate-500" label="Reversed" value={String(reversed)} valueClassName="text-slate-500" className="col-span-2 md:col-span-1" />
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
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm">
        <Metric emoji="📋" iconBg="bg-slate-100" label="รายการทั้งหมด" value={String(rows.length)} valueClassName="text-slate-900" />
        <Metric emoji="📉" iconBg="bg-red-100 text-red-700" label="นับขาด (LOSS)" value={`-${formatMoney(lossQty)} กก.`} valueClassName="text-red-600" />
        <Metric emoji="💸" iconBg="bg-red-100 text-red-700" label="มูลค่าขาด (รวม)" value={formatMoney(lossValue)} valueClassName="text-red-600" />
        <Metric emoji="📈" iconBg="bg-emerald-100 text-emerald-700" label="นับเกิน (GAIN)" value={`+${formatMoney(gainQty)} กก.`} valueClassName="text-emerald-700" />
        <Metric emoji="💰" iconBg="bg-emerald-100 text-emerald-700" label="มูลค่าเกิน (รวม)" value={formatMoney(gainValue)} valueClassName="text-emerald-700" className="col-span-2 lg:col-span-1" />
      </div>
    )
  }
  if (mode === 'status-convert') return null
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
      <Metric emoji="📋" iconBg="bg-slate-100" label="รายการ" value={String(rows.length)} />
      <Metric emoji="⚖️" iconBg="bg-slate-100" label="น้ำหนักรวม" value={`${formatMoney(totalQty)} กก.`} />
      <Metric emoji="💰" iconBg="bg-slate-100" label="มูลค่า" value={formatMoney(totalValue)} />
      <Metric emoji="🔗" iconBg="bg-slate-100" label="สถานะ" value="DB-connected" />
    </div>
  )
}

function AdjustPrincipleBox() {
  return (
    <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs text-slate-700">
      <div className="mb-1 font-bold">📒 หลักการทำงาน — Stock correction value</div>
      <ul className="ml-5 list-disc space-y-0.5">
        <li>ปรับสต๊อกจริง (qty) ตาม &quot;นับจริง&quot; ของคุณ — ตัดออกหรือเพิ่มเข้า stock_ledger</li>
        <li><strong>มูลค่ารวม</strong> คำนวณจากราคาต่อกก. ณ วันที่นับ — LOSS ติดลบ, GAIN เป็นบวก</li>
        <li>รายการ correction อาจกระทบ WAC และ margin จึงต้องตรวจเหตุผลและราคาให้ครบก่อนบันทึก</li>
        <li>ใช้เมื่อ &quot;หาของไม่เจอ&quot; / &quot;นับจริง 0 แต่ระบบมี&quot; / &quot;นับเกินระบบ&quot;</li>
      </ul>
    </div>
  )
}

function AdjustUsageBox() {
  return (
    <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-4 text-sm">
      <h3 className="mb-1 font-bold">💡 ใช้เมื่อไหร่</h3>
      <ul className="ml-5 list-disc space-y-1 text-slate-700">
        <li><strong>หาของไม่เจอ</strong> — ระบบมี 100 กก. แต่นับจริงเหลือ 80 → ใส่ &quot;นับจริง&quot; 80 → ขาด 20 กก. (Note)</li>
        <li><strong>สต๊อกตัด 0 แต่ในระบบยังมี</strong> — ระบบมี 50 กก. แต่นับจริง 0 → ใส่ &quot;นับจริง&quot; 0 → ขาด 50 กก. (Note)</li>
        <li><strong>นับเกินระบบ</strong> — ระบบมี 10 กก. แต่นับจริงได้ 25 → ใส่ &quot;นับจริง&quot; 25 → เกิน 15 กก. (Note)</li>
        <li>เคลื่อนไหวจะเข้า Stock Ledger เป็น <code>STOCK_COUNT_LOSS</code> หรือ <code>STOCK_COUNT_GAIN</code> · qty จริง · value ตาม correction policy</li>
      </ul>
    </div>
  )
}

function OperationTable({
  isLoading,
  mode,
  onAdjustCorrect,
  onConvertDetail,
  onConvertReverse,
  onStatusConvertReverse,
  onSortChange,
  rows,
  sortDirection,
  sortKey,
}: {
  isLoading: boolean
  mode: Mode
  onAdjustCorrect?: (row: Record<string, string | number | boolean | null>) => void
  onConvertDetail?: (refNo: string) => void
  onConvertReverse?: (refNo: string) => void
  onStatusConvertReverse?: (refNo: string) => void
  onSortChange?: (key: StatusConvertSortKey) => void
  rows: Payload['rows']
  sortDirection?: SortDirection
  sortKey?: StatusConvertSortKey
}) {
  const columns = columnsFor(mode)
  return (
    <>
      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block space-y-3 md:hidden">
        {isLoading ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
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
              <div key={id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
                <div className="mb-2 flex items-start justify-between">
                  <span className="font-bold text-slate-800">{refNo}</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${adjustType === 'LOSS' ? 'bg-red-100 text-red-700' : adjustType === 'GAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {adjustType === 'LOSS' ? '📉 นับขาด' : adjustType === 'GAIN' ? '📈 นับเกิน' : '-'}
                  </span>
                </div>
                <div className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</div>
                <div className="my-3 space-y-1 text-xs text-slate-600">
                  <div><span className="font-semibold">สินค้า:</span> {formatCell(row.productName)}</div>
                  <div><span className="font-semibold">สาขา/คลัง:</span> {formatCell(row.branchWarehouse)}</div>
                  {row.lotNo ? <div><span className="font-semibold">Lot:</span> <code className="font-mono">{String(row.lotNo)}</code></div> : null}
                  {row.reason ? <div><span className="font-semibold">เหตุผล:</span> {String(row.reason)}</div> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <div className="text-slate-400">ระบบ / นับจริง</div>
                    <div className="font-semibold text-slate-800">{formatMoney(systemQty)} / {formatMoney(countedQty)} กก.</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Diff น้ำหนัก</div>
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
                  <button
                    disabled={!row.canEdit || !onAdjustCorrect}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                    type="button"
                    onClick={() => onAdjustCorrect?.(row)}
                  >
                    แก้ไข
                  </button>
                </div>
              </div>
            )
          }

          if (mode === 'convert') {
            const status = String(row.status ?? '')
            const costStatus = String(row.costStatus ?? '')
            const costStatusLabel = costStatus === 'allocated' ? '✓ Allocated' : costStatus === 'pending_cost' ? '⏳ Pending Cost' : costStatus === 'partial' ? '📋 Partial' : '-'
            const costStatusColor = costStatus === 'allocated' ? 'bg-emerald-100 text-emerald-700' : costStatus === 'pending_cost' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            const statusColor = status === 'posted' ? 'bg-emerald-100 text-emerald-700' : status === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
            const sourceType = String(row.sourceType ?? 'Manual')
            const sourceTypeColor = sourceType.startsWith('Auto') ? 'bg-purple-100 text-purple-700' : sourceType === 'Legacy' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'

            return (
              <div key={id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
                <div className="mb-2 flex items-start justify-between">
                  <span className="font-bold text-slate-800">{refNo}</span>
                  <div className="flex gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sourceTypeColor}`}>{sourceType}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor}`}>{status || 'posted'}</span>
                  </div>
                </div>
                <div className="text-xs text-slate-500">{formatDateDisplay(date)}</div>
                <div className="my-3 space-y-1 text-xs text-slate-600">
                  <div><span className="font-semibold text-red-600">Source (ออก):</span> {formatCell(row.sourceProduct)}</div>
                  <div><span className="font-semibold text-emerald-700">Target (เข้า):</span> {formatCell(row.targetProduct)}</div>
                  <div><span className="font-semibold">สาขา / คลัง:</span> {formatCell(row.branchWarehouse)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <div className="text-slate-400">Source Qty</div>
                    <div className="font-semibold text-red-700">{formatMoney(Number(row.sourceQty ?? 0))} กก. (@{formatMoney(Number(row.unitCost ?? 0))})</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Target Qty</div>
                    <div className="font-semibold text-emerald-700">{formatMoney(Number(row.targetQty ?? 0))} กก. (@{formatMoney(Number(row.targetUnitCost ?? 0))})</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Loss / Cost Status</div>
                    <div className="font-semibold text-slate-800">
                      {formatMoney(Number(row.lossQty ?? 0))} กก. / <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${costStatusColor}`}>{costStatusLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-1">
                  <button
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                    disabled={!onConvertDetail}
                    type="button"
                    onClick={() => onConvertDetail?.(refNo)}
                  >
                    รายละเอียด
                  </button>
                  <button
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    disabled={status === 'reversed' || !onConvertReverse}
                    type="button"
                    onClick={() => onConvertReverse?.(refNo)}
                  >
                    ย้อนกลับ
                  </button>
                </div>
              </div>
            )
          }

          if (mode === 'status-convert') {
            const status = String(row.status ?? 'posted')
            const statusColor = status === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'

            return (
              <div key={id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50">
                <div className="mb-2 flex items-start justify-between">
                  <span className="font-bold text-slate-800">{refNo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor}`}>{status}</span>
                </div>
                <div className="text-xs text-slate-500">{formatDateDisplay(date)}</div>
                <div className="my-3 space-y-1 text-xs text-slate-600">
                  <div><span className="font-semibold">สินค้า:</span> <b>{formatCell(row.productCode)}</b> - {formatCell(row.productName)}</div>
                  <div><span className="font-semibold">สาขา/คลัง:</span> {formatCell(row.branchName)} / {formatCell(row.warehouseName)}</div>
                  {row.lotNo ? <div><span className="font-semibold">Lot:</span> <code className="font-mono">{String(row.lotNo)}</code></div> : null}
                  <div>
                    <span className="font-semibold">การเปลี่ยนสถานะ:</span>{' '}
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{formatCell(row.statusFrom)}</span>
                    <span className="mx-1 text-amber-600">→</span>
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">{formatCell(row.statusTo)}</span>
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
                    <div className="text-slate-400">ผู้ทำ / วันที่ทำ</div>
                    <div className="font-semibold text-slate-600">{formatCell(row.createdBy)} ({formatDateTime(row.createdAt)})</div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    disabled={status === 'reversed' || !onStatusConvertReverse}
                    type="button"
                    onClick={() => onStatusConvertReverse?.(refNo)}
                  >
                    ย้อนกลับ
                  </button>
                </div>
              </div>
            )
          }

          return null
        })}
        {!isLoading && !rows.length ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-400 shadow">{emptyTextFor(mode)}</div> : null}
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
        <table className={mode === 'convert' ? 'w-full min-w-[1300px] text-sm' : mode === 'status-convert' ? 'w-full min-w-[1280px] text-sm' : 'w-full min-w-[1500px] text-xs'}>
          <thead className="bg-slate-100">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`p-2 text-left ${column.headerClassName ?? ''}`}>
                  {mode === 'status-convert' && column.sortable && onSortChange ? (
                    <button
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
                      type="button"
                      onClick={() => onSortChange(column.key as StatusConvertSortKey)}
                    >
                      <span>{column.label}</span>
                      <span className="text-xs text-slate-400">{sortKey === column.key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={columns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row, index) => <tr key={String(row.id ?? index)} className="border-t border-slate-200 hover:bg-slate-50">{columns.map((column) => <td key={column.key} className={`p-2 align-top ${mode === 'adjust' ? 'font-semibold text-slate-700' : ''} ${column.cellClassName ?? ''}`}>{formatOperationCell(mode, row, column.key, onConvertReverse, onConvertDetail, onStatusConvertReverse, onAdjustCorrect)}</td>)}</tr>)}
            {!isLoading && !rows.length ? <tr><td className="p-8 text-center text-slate-400" colSpan={columns.length}>{emptyTextFor(mode)}</td></tr> : null}
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

function columnsFor(mode: Mode): OperationColumn[] {
  if (mode === 'status-convert') return [
    { key: 'date', label: 'วันที่', sortable: true },
    { key: 'refNo', label: 'เลขที่', sortable: true },
    { key: 'productDisplay', label: 'สินค้า', sortable: true },
    { key: 'lotNo', label: 'Lot', sortable: true },
    { key: 'locationDisplay', label: 'สาขา/คลัง', sortable: true },
    { key: 'qty', label: 'จำนวน (กก.)', cellClassName: 'text-right font-bold text-purple-700', sortable: true },
    { key: 'unitCost', label: 'ต้นทุน (บาท/กก.)', cellClassName: 'text-right text-slate-600', sortable: true },
    { key: 'value', label: 'มูลค่า', cellClassName: 'text-right text-slate-600', sortable: true },
    { key: 'statusFlow', label: 'เปลี่ยนสถานะ', cellClassName: 'text-center', sortable: true },
    { key: 'note', label: 'เหตุผล', sortable: true },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-center', sortable: true },
    { key: 'createdBy', label: 'ผู้ทำ', sortable: true },
    { key: 'createdAt', label: 'วันที่ทำ', sortable: true },
    { key: 'action', label: 'การกระทำ', cellClassName: 'text-center' },
  ]
  if (mode === 'convert') return [
    { key: 'sourceType', label: 'Source Type' },
    { key: 'refNo', label: 'เลขที่ / Ref' },
    { key: 'date', label: 'วันที่' },
    { key: 'branchWarehouse', label: 'สาขา / คลัง' },
    { key: 'sourceProduct', label: 'Source (ออก)', headerClassName: 'bg-red-50' },
    { key: 'sourceQty', label: 'Qty', cellClassName: 'text-right font-mono text-red-700', headerClassName: 'bg-red-50 text-right' },
    { key: 'unitCost', label: '฿/กก.', cellClassName: 'text-right font-mono', headerClassName: 'bg-red-50 text-right' },
    { key: 'targetProduct', label: 'Target (เข้า)', headerClassName: 'bg-emerald-50' },
    { key: 'targetQty', label: 'Qty', cellClassName: 'text-right font-mono text-emerald-700', headerClassName: 'bg-emerald-50 text-right' },
    { key: 'targetUnitCost', label: '฿/กก.', cellClassName: 'text-right font-mono', headerClassName: 'bg-emerald-50 text-right' },
    { key: 'lossQty', label: 'Loss', cellClassName: 'text-right font-mono' },
    { key: 'costStatus', label: 'Cost Status', cellClassName: 'text-center' },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-center' },
    { key: 'action', label: '' },
  ]
  if (mode === 'adjust') return [
    { key: 'docNo', label: 'Doc No' },
    { key: 'date', label: 'วันที่' },
    { key: 'branchWarehouse', label: 'สาขา/คลัง' },
    { key: 'productName', label: 'สินค้า' },
    { key: 'lotNo', label: 'Lot' },
    { key: 'outputCategory', label: 'คลัง' },
    { key: 'systemQty', label: 'ระบบ', cellClassName: 'text-right font-mono' },
    { key: 'onHoldQty', label: 'จองไว้', cellClassName: 'text-right font-mono text-amber-700' },
    { key: 'readyQty', label: 'พร้อมใช้', cellClassName: 'text-right font-mono text-emerald-700' },
    { key: 'countedQty', label: 'นับจริง', cellClassName: 'text-right font-mono' },
    { key: 'diffQty', label: 'Diff', cellClassName: 'text-right font-mono' },
    { key: 'adjustType', label: 'ประเภท' },
    { key: 'unitPricePerKg', label: 'ราคา/กก.', cellClassName: 'text-right font-mono' },
    { key: 'totalValue', label: 'มูลค่ารวม', cellClassName: 'text-right font-mono' },
    { key: 'reason', label: 'เหตุผล' },
    { key: 'createdAt', label: 'วันที่สร้างรายการ' },
    { key: 'updatedBy', label: 'แก้ไขโดย' },
    { key: 'action', label: 'การกระทำ', cellClassName: 'text-center' },
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
  if (key === 'locationDisplay') return `${String(row.branchName ?? '')} ${String(row.warehouseName ?? '')}`.trim().toLowerCase()
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

function formatOperationCell(mode: Mode, row: Record<string, string | number | boolean | null>, key: string, onConvertReverse?: (refNo: string) => void, onConvertDetail?: (refNo: string) => void, onStatusConvertReverse?: (refNo: string) => void, onAdjustCorrect?: (row: Record<string, string | number | boolean | null>) => void) {
  if (mode === 'status-convert') {
    if (key === 'productDisplay') return <><b>{formatCell(row.productCode)}</b><div className="text-xs text-slate-500">{formatCell(row.productName)}</div></>
    if (key === 'locationDisplay') return <span className="text-xs">{formatCell(row.branchName)}<br />{formatCell(row.warehouseName)}</span>
    if (key === 'statusFlow') return <><span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{formatCell(row.statusFrom)}</span><span className="mx-1 text-amber-600">→</span><span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{formatCell(row.statusTo)}</span></>
    if (key === 'createdAt') return formatDateTime(row.createdAt)
    if (key === 'status') {
      const status = String(row.status ?? 'posted')
      const color = status === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{status}</span>
    }
    if (key === 'action') {
      const status = String(row.status ?? 'posted')
      const refNo = String(row.refNo ?? row.id ?? '')
      return (
        <button
          className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
          disabled={status === 'reversed' || !onStatusConvertReverse}
          type="button"
          onClick={() => onStatusConvertReverse?.(refNo)}
        >
          ย้อนกลับ
        </button>
      )
    }
  }
  if (mode === 'convert') {
    if (key === 'action') {
      const status = String(row.status ?? '')
      const refNo = String(row.refNo ?? row.id ?? '')
      return (
        <div className="flex items-center justify-center gap-1">
          <button
            className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            disabled={!onConvertDetail}
            type="button"
            onClick={() => onConvertDetail?.(refNo)}
          >
            รายละเอียด
          </button>
          <button className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 opacity-60" disabled title="Cost allocation ถูกทำตอน Post แล้ว" type="button">ยืนยันต้นทุน</button>
          <button
            className="rounded-md bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
            disabled={status === 'reversed' || !onConvertReverse}
            type="button"
            onClick={() => onConvertReverse?.(refNo)}
          >
            ย้อนกลับ
          </button>
        </div>
      )
    }
    if (key === 'costStatus') {
      const value = String(row[key] ?? '')
      const label = value === 'allocated' ? '✓ Allocated' : value === 'pending_cost' ? '⏳ Pending Cost' : value === 'partial' ? '📋 Partial' : '-'
      const color = value === 'allocated' ? 'bg-emerald-100 text-emerald-700' : value === 'pending_cost' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      const color = value === 'posted' ? 'bg-emerald-100 text-emerald-700' : value === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{value || '-'}</span>
    }
    if (key === 'sourceType') {
      const value = String(row[key] ?? 'Manual')
      const color = value.startsWith('Auto') ? 'bg-purple-100 text-purple-700' : value === 'Legacy' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{value}</span>
    }
  }
  if (mode === 'adjust') {
    if (key === 'action') {
      return <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60" disabled={!row.canEdit || !onAdjustCorrect} title={row.canEdit ? 'แก้ไขได้ภายใน 7 วัน' : 'หมดช่วงแก้ไข 7 วันแล้ว'} type="button" onClick={() => onAdjustCorrect?.(row)}>แก้ไข</button>
    }
    if (key === 'createdAt') return formatDateTime(row.createdAt)
    if (key === 'adjustType') {
      const value = String(row[key] ?? '')
      const color = value === 'LOSS' ? 'bg-red-100 text-red-700' : value === 'GAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      const label = value === 'LOSS' ? '📉 นับขาด' : value === 'GAIN' ? '📈 นับเกิน' : '-'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{value || 'posted'}</span>
    }
    if (key === 'outputCategory') {
      return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{formatCell(row[key])}</span>
    }
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

function ConvertDetailModal({ detail, isLoading, onClose, onExport }: { detail: StockConvertDetail; isLoading: boolean; onClose: () => void; onExport: () => void }) {
  const totalQty = detail.lines.reduce((sum, line) => sum + line.qty, 0)
  const totalCost = detail.lines.reduce((sum, line) => sum + line.totalCost, 0)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h3 className="font-bold">Cost Allocation Detail · {detail.refNo}</h3>
            <div className="mt-1 text-xs text-slate-500">{detail.date} · {detail.branchWarehouse || '-'} · {detail.status}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800" disabled={isLoading} type="button" onClick={onExport}>ส่งออก CSV</button>
            <button className="text-2xl text-slate-400 hover:text-slate-700" type="button" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-5">
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Source Qty" value={`${formatMoney(detail.sourceQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Target Qty" value={`${formatMoney(detail.targetQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Loss" value={`${formatMoney(detail.lossQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Allocated Qty" value={`${formatMoney(totalQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Allocated Cost" value={formatMoney(totalCost)} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Target Policy" value={detail.targetCostPolicy} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Target ฿/กก." value={formatMoney(detail.targetUnitCost)} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Variance" value={formatMoney(detail.targetCostVariance)} />
        </div>
        <div className="max-h-[55vh] overflow-auto p-5">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-2 text-left">Line</th>
                <th className="p-2 text-left">Source Pool</th>
                <th className="p-2 text-left">Source Product</th>
                <th className="p-2 text-left">Target Pool</th>
                <th className="p-2 text-left">Target Product</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">฿/กก.</th>
                <th className="p-2 text-right">Cost</th>
                <th className="p-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={`${line.lineNo}-${line.sourcePoolId ?? 'source'}`} className="border-t border-slate-100">
                  <td className="p-2 font-mono">{line.lineNo}</td>
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">{line.sourceRefNo ?? line.sourceType ?? '-'}</div>
                    <div className="text-xs text-slate-500">Pool {line.sourcePoolId ?? '-'}{line.sourceLotNo ? ` · Lot ${line.sourceLotNo}` : ''}</div>
                  </td>
                  <td className="p-2">{line.sourceProduct}</td>
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">Pool {line.targetPoolId ?? '-'}</div>
                    <div className="text-xs text-slate-500">{line.targetPoolStatus ?? '-'}{line.targetLotNo ? ` · Lot ${line.targetLotNo}` : ''}</div>
                  </td>
                  <td className="p-2">{line.targetProduct}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.qty)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.unitCost)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.totalCost)}</td>
                  <td className="p-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${line.allocationStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{line.allocationStatus}</span>
                  </td>
                </tr>
              ))}
              {!detail.lines.length ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่พบ allocation lines สำหรับเอกสารนี้</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          เหตุผล: {detail.reason || '-'} · หมายเหตุ: {detail.notes || '-'} · เหตุผล override: {detail.targetCostReason || '-'}
        </div>
      </div>
    </div>
  )
}

function Metric({
  cardClassName,
  emoji,
  iconBg = 'bg-slate-100',
  label,
  labelClassName = 'text-slate-500',
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
  if (cardClassName) {
    return <div className={cardClassName}><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${valueClassName}`}>{value}</div></div>
  }

  return (
    <div className={`bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3 ${className}`}>
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji ?? '•'}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold ${labelClassName} truncate`}>{label}</div>
        <div className={`font-bold ${valueClassName} mt-0.5`}>{value}</div>
      </div>
    </div>
  )
}

function Field(props: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {props.label}
      {props.type === 'date' ? (
        <DatePickerInput className="mt-1.5 w-full font-normal" value={props.value} onChange={props.onChange} />
      ) : (
        <input
          className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-slate-900"
          inputMode={props.type === 'number' ? 'decimal' : undefined}
          min={props.type === 'number' ? 0 : undefined}
          step={props.type === 'number' ? 'any' : undefined}
          type={props.type ?? 'text'}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </label>
  )
}

function Select(props: { disabled?: boolean; label: string; onChange: (value: string) => void; options: StockOption[]; placeholder?: string; value: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {props.label}
      <select
        className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">{props.placeholder ?? 'เลือก'}</option>
        {props.options.filter((option) => option.active !== false).map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}
      </select>
    </label>
  )
}

function BranchWarehouseFields({ branchId, reference, setBranchId, setWarehouseId, warehouseId }: { branchId: string; reference: Payload['reference']; setBranchId: (value: string) => void; setWarehouseId: (value: string) => void; warehouseId: string }) {
  return <>
    <Select label="สาขา" options={reference.branches} value={branchId} onChange={setBranchId} />
    <Select disabled={!branchId} label="คลัง" options={reference.warehouses.filter((item) => !branchId || item.branchId === branchId)} placeholder={branchId ? 'เลือก' : 'เลือกสาขาก่อน'} value={warehouseId} onChange={setWarehouseId} />
  </>
}

function StatusConvertForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StatusConvertFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StatusConvertFormValues>({ branchId: '', date: todayDateInput(), docNo: null, fromStatus: 'RM', lotNo: null, notes: null, productId: '', qty: 0, reason: '', toStatus: 'FG', warehouseId: '' })
  const setFromStatus = (fromStatus: StatusConvertFormValues['fromStatus']) => setValues({ ...values, fromStatus, toStatus: fromStatus === 'RM' ? 'FG' : 'RM' })
  const setToStatus = (toStatus: StatusConvertFormValues['toStatus']) => setValues({ ...values, fromStatus: toStatus === 'RM' ? 'FG' : 'RM', toStatus })
  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} onSubmit={() => props.onSubmit(values)}>
    <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm grid gap-4 md:grid-cols-2">
      <BaseDateDoc values={values} setValues={setValues} />
      <Select label="สินค้า" options={props.reference.products} value={values.productId} onChange={(productId) => setValues({ ...values, productId })} />
      <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
      <Select label="จากสถานะ" options={statusOptions()} value={values.fromStatus} onChange={(fromStatus) => setFromStatus(fromStatus as StatusConvertFormValues['fromStatus'])} />
      <Select label="เป็นสถานะ" options={statusOptions()} value={values.toStatus} onChange={(toStatus) => setToStatus(toStatus as StatusConvertFormValues['toStatus'])} />
      <Field label="น้ำหนัก (กก.)" type="number" value={String(values.qty)} onChange={(qty) => setValues({ ...values, qty: Number(qty) })} />
      <Field label="Lot" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
      <div className="md:col-span-2">
        <Field label="เหตุผล *" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
      </div>
      <div className="md:col-span-2">
        <Field label="หมายเหตุ" value={values.notes ?? ''} onChange={(notes) => setValues({ ...values, notes })} />
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
    <div className="rounded-md border border-red-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-red-700">Cost Pool Lots</div>
        <div className="text-xs text-slate-500">
          เลือก {formatMoney(totalQty)} / {formatMoney(sourceQty || 0)} กก. · {formatMoney(totalValue)} ฿
        </div>
      </div>
      {shortageQty > 0 ? <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">Cost Pool ไม่พอ ขาด {formatMoney(shortageQty)} กก.</div> : null}
      {method === 'MANUAL' ? (
        <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100">
          <table className="w-full text-xs">
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
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">{entry.sourceRefNo ?? entry.sourceType}</div>
                    <div className="text-slate-500">{entry.date}{entry.lotNo ? ` · Lot ${entry.lotNo}` : ''}</div>
                  </td>
                  <td className="p-2 text-right font-mono">{formatMoney(entry.availableQty)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(entry.unitCost)}</td>
                  <td className="p-2 text-right">
                    <input
                      className="h-8 w-24 rounded-md border border-slate-300 px-2 text-right font-mono"
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
          <table className="w-full text-xs">
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
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">{line.entry.sourceRefNo ?? line.entry.sourceType}</div>
                    <div className="text-slate-500">{line.entry.date}{line.entry.lotNo ? ` · Lot ${line.entry.lotNo}` : ''}</div>
                  </td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.qty)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.entry.unitCost)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.qty * line.entry.unitCost)}</td>
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

function ConvertForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StockConvertFormValues) => void; reference: Payload['reference'] }) {
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
  const sourceProduct = props.reference.products.find((item) => item.id === values.sourceProductId)
  const targetProduct = props.reference.products.find((item) => item.id === values.targetProductId)
  const lossQty = Math.max(0, Number(values.sourceQty) - Number(values.targetQty))
  const yieldPct = Number(values.sourceQty) > 0 ? (Number(values.targetQty) / Number(values.sourceQty)) * 100 : 0
  const sourceCostPoolEntries = useMemo(() => {
    const entries = props.reference.costPoolEntries ?? []
    return entries
      .filter((entry) => !values.branchId || entry.branchId === values.branchId)
      .filter((entry) => !values.warehouseId || entry.warehouseId === values.warehouseId)
      .filter((entry) => !values.sourceProductId || entry.productId === values.sourceProductId)
      .filter((entry) => !values.lotNo || entry.lotNo === values.lotNo)
      .filter((entry) => entry.availableQty > 0)
      .sort((left, right) => sortCostPoolEntries(left, right, values.allocationMethod))
  }, [props.reference.costPoolEntries, values.allocationMethod, values.branchId, values.lotNo, values.sourceProductId, values.warehouseId])
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
  const previewUnitCost = Number(values.sourceQty) > 0 ? previewValue / Number(values.sourceQty) : 0
  const targetUnitCost = values.targetCostPolicy === 'CUSTOM_UNIT_COST' ? Number(values.targetUnitCost || 0) : previewUnitCost
  const targetValue = Number(values.targetQty || 0) * targetUnitCost
  const costVariance = targetValue - previewValue

  function updateManualAllocation(poolEntryId: string, qty: number) {
    const existing = values.manualAllocations.filter((line) => line.poolEntryId !== poolEntryId)
    setValues({ ...values, manualAllocations: qty > 0 ? [...existing, { poolEntryId, qty }] : existing })
  }

  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} mode="convert" onSubmit={() => props.onSubmit(values)}>
    <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm grid gap-4 md:grid-cols-2 animate-fade-in">
      <BaseDateDoc values={values} setValues={setValues} />
      <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
    </div>
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-red-700">Source (ออก)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="สินค้าต้นทาง" options={props.reference.products} value={values.sourceProductId} onChange={(sourceProductId) => setValues({ ...values, sourceProductId })} />
        <Field label="น้ำหนักต้นทาง (กก.)" type="number" value={String(values.sourceQty)} onChange={(sourceQty) => setValues({ ...values, sourceQty: Number(sourceQty) })} />
        <Field label="Lot ต้นทาง" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
        <ReadOnlyBox label="Source Product" value={sourceProduct ? `${sourceProduct.code ? `${sourceProduct.code} - ` : ''}${sourceProduct.name}` : '-'} />
        <label className="block text-sm font-medium md:col-span-2">วิธีตัดต้นทุน
          <select
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2"
            value={values.allocationMethod}
            onChange={(event) => setValues({ ...values, allocationMethod: event.target.value as StockConvertFormValues['allocationMethod'], manualAllocations: [] })}
          >
            <option value="FIFO">FIFO (มาก่อน-ออกก่อน)</option>
            <option value="LIFO">LIFO (มาหลัง-ออกก่อน)</option>
            <option value="HIGHEST_COST">Highest Cost (ต้นทุนสูงก่อน)</option>
            <option value="LOWEST_COST">Lowest Cost (ต้นทุนต่ำก่อน)</option>
            <option value="MANUAL">Manual (เลือก lot เอง)</option>
          </select>
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
      </div>
    </div>
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-emerald-700">Target (เข้า)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="สินค้าปลายทาง" options={props.reference.products} value={values.targetProductId} onChange={(targetProductId) => setValues({ ...values, targetProductId })} />
        <Field label="น้ำหนักปลายทาง (กก.)" type="number" value={String(values.targetQty)} onChange={(targetQty) => setValues({ ...values, targetQty: Number(targetQty) })} />
        <Field label="Lot ปลายทาง" value={values.targetLotNo ?? ''} onChange={(targetLotNo) => setValues({ ...values, targetLotNo })} />
        <ReadOnlyBox label="Target Product" value={targetProduct ? `${targetProduct.code ? `${targetProduct.code} - ` : ''}${targetProduct.name}` : '-'} />
        <label className="block text-sm font-medium md:col-span-2">Target Cost Policy
          <select
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2"
            value={values.targetCostPolicy}
            onChange={(event) => setValues({ ...values, targetCostPolicy: event.target.value as StockConvertFormValues['targetCostPolicy'], targetUnitCost: null, targetUnitCostReason: null })}
          >
            <option value="SOURCE_MATCHED">Source matched cost (default)</option>
            <option value="CUSTOM_UNIT_COST">Custom unit cost (admin/owner)</option>
          </select>
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
        <ReadOnlyBox label="Allocation" value={`${values.allocationMethod} · ${formatMoney(previewUnitCost)} ฿/กก.`} />
        <ReadOnlyBox label="Target Cost" value={`${values.targetCostPolicy} · ${formatMoney(targetUnitCost)} ฿/กก.`} />
        <ReadOnlyBox label="Target Value" value={formatMoney(targetValue)} />
        <ReadOnlyBox label="Cost Variance" value={formatMoney(costVariance)} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="เหตุผล" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
        <Field label="หมายเหตุ" value={values.notes ?? ''} onChange={(notes) => setValues({ ...values, notes })} />
      </div>
    </div>
  </FormShell>
}

function AdjustForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StockAdjustFormValues) => void; reference: Payload['reference'] }) {
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

  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} onSubmit={() => props.onSubmit(values)}>
    <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm grid gap-4 md:grid-cols-2">
      <BaseDateDoc values={values} setValues={setValues} />
      <Select label="สินค้า" options={props.reference.products} value={values.productId} onChange={(productId) => setValues({ ...values, productId })} />
      <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
      <Select label="สถานะสินค้า" options={[{ active: true, id: 'RM', name: 'RM' }, { active: true, id: 'WIP', name: 'WIP' }, { active: true, id: 'FG', name: 'FG' }]} value={values.status} onChange={(status) => setValues({ ...values, status: status as StockAdjustFormValues['status'] })} />
      <Field label="Lot" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
      <Field label="นับจริง" type="number" value={String(values.countedQty)} onChange={(countedQty) => setValues({ ...values, countedQty: Number(countedQty) })} />
      <div className="md:col-span-2 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs md:grid-cols-5">
        <ReadOnlyBox label="ระบบมี" value={isSnapshotLoading ? 'กำลังโหลด' : `${formatMoney(snapshot?.systemQty ?? values.systemQty)} กก.`} />
        <ReadOnlyBox label="จองไว้" value={`${formatMoney(snapshot?.onHoldQty ?? 0)} กก.`} />
        <ReadOnlyBox label="พร้อมใช้" value={`${formatMoney(snapshot?.readyQty ?? 0)} กก.`} />
        <ReadOnlyBox label="ราคา/กก." value={formatMoney(snapshot?.unitPricePerKg ?? values.unitPricePerKg ?? 0)} />
        <ReadOnlyBox label="มูลค่ารวม" value={formatMoney(snapshot?.totalValue ?? values.totalValue ?? 0)} valueClassName={(snapshot?.totalValue ?? values.totalValue ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'} />
        <div className="md:col-span-5 text-slate-600">
          {snapshotError ? <span className="text-red-700">{snapshotError}</span> : <>Diff: <b className={(snapshot?.diffQty ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}>{formatMoney(snapshot?.diffQty ?? 0)} กก.</b> · Price source: {snapshot?.priceSource ?? '-'}</>}
        </div>
      </div>
      <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        ระบบจะใช้ยอดจาก Stock Ledger จริงตาม bucket/วันที่ที่เลือก และ block ถ้านับจริงต่ำกว่า active hold เพื่อไม่ให้พร้อมใช้ติดลบ
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-semibold text-slate-600">เหตุผล *<select className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-slate-900" value={values.reason} onChange={(event) => setValues({ ...values, reason: event.target.value as StockAdjustFormValues['reason'] })}>{reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
      </div>
      <div className="md:col-span-2">
        <Field label="หมายเหตุ" value={values.remark ?? ''} onChange={(remark) => setValues({ ...values, remark })} />
      </div>
    </div>
  </FormShell>
}

function BaseDateDoc<T extends { date: string; docNo?: string | null }>({ setValues, values }: { setValues: (values: T) => void; values: T }) {
  return <>
    <Field label="วันที่" type="date" value={values.date} onChange={(date) => setValues({ ...values, date })} />
    <Field label="เลขที่เอกสาร" value={values.docNo ?? ''} onChange={(docNo) => setValues({ ...values, docNo })} />
  </>
}

function ReadOnlyBox({ label, value, valueClassName = 'text-slate-800' }: { label: string; value: string; valueClassName?: string }) {
  return <div className="rounded-md border border-white/70 bg-white/80 px-3 py-2"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-sm font-semibold ${valueClassName}`}>{value}</div></div>
}

function FormShell({ cancelHref, children, isSaving, mode, onSubmit }: { cancelHref: string; children: React.ReactNode; isSaving: boolean; mode?: Mode; onSubmit: () => void }) {
  return (
    <form className="flex-1 flex flex-col overflow-hidden" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
        <a className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 flex items-center justify-center" href={cancelHref}>
          ยกเลิก
        </a>
        <button
          className="rounded-md bg-slate-900 px-5 py-2 text-sm font-normal text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          บันทึก
        </button>
      </div>
    </form>
  )
}

function statusOptions(): StockOption[] {
  return [{ active: true, id: 'RM', name: 'RM' }, { active: true, id: 'FG', name: 'FG' }]
}
