'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

type SelectOption = {
  active: boolean | null
  branchIds?: string[]
  code: string | null
  id: string
  name: string
}

type ApRow = {
  aging: number
  branchName: string
  bucket: string
  creditTerm: number
  date: string
  drilldown?: {
    paymentApprovals: Array<{ approvedAmount: number; docNo: string; href: string; status: string }>
    payments: Array<{ allocatedAmount: number; date: string; docNo: string; href: string; netAmount: number; paymentApprovalDocNo: string; status: string; voucherId: string }>
    purchaseBill: { docNo: string; href: string; sourceOfTruth: string }
    supplierAdvances: Array<{ allocatedAmount: number; allocatedSubtotalAmount: number; allocatedVatAmount: number; advanceType: string; docNo: string; href: string; invoiceNo: string; status: string; vatType: string }>
  }
  docNo: string
  dueDate: string
  id: string
  paidAmount: number
  payableBalance: number
  status: string
  supplierCode: string
  supplierName: string
  totalAmount: number
  transactionMode: string
}

type ApPayload = {
  byBucket: Array<{ bucket: string; bills: number; total: number }>
  bySupplier: Array<{ bills: number; current: number; gt90: number; oldest: number; supplierName: string; total: number; b30: number; b60: number; b90: number }>
  filters: { branches: SelectOption[]; statuses: string[]; suppliers: SelectOption[] }
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number }
  rows: ApRow[]
  summary: { bills: number; dueIn7: number; overdue: number; suppliers: number; total: number }
}

type SortKey = 'date' | 'docNo' | 'dueDate' | 'payableBalance' | 'supplierName' | 'aging'
type SummarySortKey = 'supplierName' | 'bills' | 'current' | 'b30' | 'b60' | 'b90' | 'gt90' | 'total' | 'oldest'

type TablePaginationProps = {
  currentPage: number
  isLoading: boolean
  onNext: () => void
  onPrevious: () => void
  totalLabel: string
  totalPages: number
}

function bucketClass(bucket: string) {
  if (bucket === 'Current') return 'bg-slate-100 text-slate-600'
  if (bucket === '1-30') return 'bg-yellow-100 text-yellow-700'
  if (bucket === '31-60') return 'bg-amber-100 text-amber-700'
  if (bucket === '61-90') return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

function bucketBarClass(bucket: string) {
  if (bucket === 'Current') return 'bg-slate-400'
  if (bucket === '1-30') return 'bg-yellow-500'
  if (bucket === '31-60') return 'bg-amber-500'
  if (bucket === '61-90') return 'bg-orange-500'
  return 'bg-red-500'
}

function bucketTextClass(bucket: string) {
  if (bucket === 'Current') return 'text-slate-600'
  if (bucket === '1-30') return 'text-yellow-700'
  if (bucket === '31-60') return 'text-amber-700'
  if (bucket === '61-90') return 'text-orange-700'
  return 'text-red-700'
}

function bucketCardClass(bucket: string) {
  if (bucket === 'Current') return 'border-slate-400 bg-slate-50'
  if (bucket === '1-30') return 'border-yellow-500 bg-yellow-50'
  if (bucket === '31-60') return 'border-amber-500 bg-amber-50'
  if (bucket === '61-90') return 'border-orange-500 bg-orange-50'
  return 'border-red-500 bg-red-50'
}

function bucketLabel(bucket: string) {
  return bucket === 'Current' ? 'วันนี้/อนาคต' : `${bucket} วัน`
}

function bucketLongLabel(bucket: string) {
  return bucket === 'Current' ? 'วันนี้/อนาคต' : `${bucket} วัน`
}

function moneyOrDash(value: number) {
  return value ? formatMoney(value) : '-'
}

function percentage(value: number, total: number) {
  if (total <= 0 || value <= 0) return '0%'
  return `${Math.max(1, Math.min(100, (value / total) * 100))}%`
}

function currentMonthStart() {
  return `${todayDateInput().slice(0, 8)}01`
}

export function AccountsPayablePageClient({ initialFilters }: { initialFilters?: { branchId?: string; from?: string; to?: string } } = {}) {
  const latestLoadRequestRef = useRef(0)
  const [data, setData] = useState<ApPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState<ApRow | null>(null)
  const [tab, setTab] = useState<'summary' | 'detail'>('summary')
  const [bucket, setBucket] = useState('')
  const [branchId, setBranchId] = useState(initialFilters?.branchId || '')
  const [from, setFrom] = useState(initialFilters?.from ?? currentMonthStart())
  const [page, setPage] = useState(1)
  const [summaryPage, setSummaryPage] = useState(1)
  const summaryPageSize = 50
  const [summarySortDirection, setSummarySortDirection] = useState<'asc' | 'desc'>('desc')
  const [summarySortKey, setSummarySortKey] = useState<SummarySortKey>('total')
  const [q, setQ] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [status, setStatus] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [to, setTo] = useState(initialFilters?.to || todayDateInput())
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const hasFilters = Boolean(branchId || bucket || from || q.trim() || status || supplierId || to)

  const supplierOptions = useMemo(() => {
    const list = (data?.filters.suppliers ?? []).filter((supplier) => !branchId || (supplier.branchIds ?? []).includes(branchId))
    return [
      { id: '', label: 'ผู้ขายทั้งหมด' },
      ...list.map((s) => ({
        id: s.id,
        label: s.code ? `${s.code} - ${s.name}` : s.name,
        searchText: `${s.code ?? ''} ${s.name}`,
      })),
    ]
  }, [branchId, data?.filters.suppliers])


  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '50',
      sortDirection,
      sortKey,
    })
    if (branchId) params.set('branchId', branchId)
    if (bucket) params.set('bucket', bucket)
    if (from) params.set('from', from)
    if (q.trim()) params.set('q', q.trim())
    if (status) params.set('status', status)
    if (supplierId) params.set('supplierId', supplierId)
    if (to) params.set('to', to)
    return params
  }, [branchId, bucket, from, page, q, sortDirection, sortKey, status, supplierId, to])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<ApPayload>(`/api/finance/ap?${query.toString()}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด AP ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!branchId || !supplierId) return
    const supplier = data?.filters.suppliers.find((row) => row.id === supplierId)
    if (supplier && !(supplier.branchIds ?? []).includes(branchId)) {
      setSupplierId('')
      setPage(1)
    }
  }, [branchId, data?.filters.suppliers, supplierId])

  useEffect(() => {
    setSummaryPage(1)
  }, [branchId, bucket, from, q, status, supplierId, to])

  function changeSort(nextKey: SortKey) {
    setPage(1)
    if (nextKey === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'payableBalance' || nextKey === 'aging' ? 'desc' : 'asc')
  }

  async function exportXlsx() {
    setIsExporting(true)
    setError(null)
    try {
      const exportQuery = new URLSearchParams(query)
      exportQuery.set('format', 'xlsx')
      const response = await fetch(`/api/finance/ap?${exportQuery.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('ส่งออก AP ไม่สำเร็จ')
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `finance_ap_${todayDateInput()}.xlsx`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ส่งออก AP ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
    }
  }

  const totalPages = data?.pagination.totalPages ?? 1
  const bucketRows = data?.byBucket ?? []
  const topSuppliers = (data?.bySupplier ?? []).slice(0, 5)
  const totalAp = data?.summary.total ?? 0
  const overdueAp = data?.summary.overdue ?? 0
  const dueIn7 = data?.summary.dueIn7 ?? 0
  const overduePercent = totalAp > 0 ? ((overdueAp / totalAp) * 100).toFixed(1) : '0.0'

  const summaryRows = useMemo(() => data?.bySupplier ?? [], [data?.bySupplier])
  const sortedSummaryRows = useMemo(() => {
    return [...summaryRows].sort((left, right) => {
      const direction = summarySortDirection === 'asc' ? 1 : -1
      const leftValue = left[summarySortKey]
      const rightValue = right[summarySortKey]
      if (typeof leftValue === 'string' || typeof rightValue === 'string') {
        return String(leftValue).localeCompare(String(rightValue), 'th') * direction
      }
      return ((leftValue as number) - (rightValue as number)) * direction
    })
  }, [summaryRows, summarySortDirection, summarySortKey])
  const summaryTotalPages = Math.max(1, Math.ceil(summaryRows.length / summaryPageSize))
  const safeSummaryPage = Math.min(summaryPage, summaryTotalPages)

  const visibleSummaryRows = useMemo(() => {
    const start = (safeSummaryPage - 1) * summaryPageSize
    return sortedSummaryRows.slice(start, start + summaryPageSize)
  }, [safeSummaryPage, sortedSummaryRows, summaryPageSize])

  function changeSummarySort(nextKey: SummarySortKey) {
    setSummaryPage(1)
    if (nextKey === summarySortKey) {
      setSummarySortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSummarySortKey(nextKey)
    setSummarySortDirection(nextKey === 'supplierName' ? 'asc' : 'desc')
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm">
        <Metric label="ค้างจ่ายรวม" tone="red" value={formatMoney(totalAp)} />
        <Metric label="อายุหนี้แล้ว" tone="amber" value={formatMoney(overdueAp)} />
        <Metric label="อายุไม่เกิน 7 วัน" tone="yellow" value={formatMoney(dueIn7)} />
        <Metric label="บิลค้างจ่าย" value={`${data?.summary.bills ?? 0} ใบ`} />
        <Metric className="col-span-2 lg:col-span-1" label="ผู้ขายค้างจ่าย" value={`${data?.summary.suppliers ?? 0} ราย`} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
        {bucketRows.map((bucket) => {
          const isZero = bucket.total === 0
          const textClass = isZero ? 'text-slate-500' : bucketTextClass(bucket.bucket)
          return (
            <div key={`card-${bucket.bucket}`} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-center">
              <div className={`text-xs font-semibold ${textClass}`}>อายุ {bucketLongLabel(bucket.bucket)}</div>
              <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{formatMoney(bucket.total)}</div>
              <div className="mt-1 text-xs text-slate-400 font-medium">{bucket.bills} ใบ</div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 ผู้ขายค้างจ่ายสูงสุด</div>
        <div className="space-y-1.5">
          {topSuppliers.map((supplier, index) => (
            <div key={supplier.supplierName} className="flex items-center gap-2 text-xs">
              <span className={`w-5 text-center font-bold ${index < 3 ? 'text-red-600' : 'text-slate-400'}`}>{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-700">{supplier.supplierName}</div>
                <div className="text-xs text-slate-400">{supplier.bills} ใบ · เกินสุด {supplier.oldest} วัน</div>
              </div>
              <div className="h-2.5 w-20 rounded-full bg-slate-100 dark:bg-slate-950">
                <div className="h-2.5 rounded-full bg-red-500" style={{ width: percentage(supplier.total, topSuppliers[0]?.total ?? 0) }} />
              </div>
              <div className="w-24 text-right font-bold text-red-700">{formatMoney(supplier.total)}</div>
            </div>
          ))}
          {!isLoading && topSuppliers.length === 0 ? <div className="py-4 text-center text-slate-400">ไม่มีเจ้าหนี้คงค้าง</div> : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'summary' | 'detail')}>
        <TabsList className="overflow-x-auto" variant="line">
          <TabsTrigger value="summary" variant="line">
          📊 สรุปตามผู้ขาย
          </TabsTrigger>
          <TabsTrigger value="detail" variant="line">
          📄 รายบิลรับซื้อ
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        {/* Desktop View */}
        <div className="hidden lg:block space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input autoComplete="off" className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" placeholder="ค้นหาเลข PB / ผู้ขาย / สาขา" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
            
            <div className="min-w-[260px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm rounded-md border-slate-300 focus:border-slate-400 focus:ring-0 outline-none"
                inputId="ap-supplier-filter"
                label="ผู้ขาย"
                options={supplierOptions}
                placeholder="ผู้ขายทั้งหมด"
                value={supplierId}
                onChange={(value) => {
                  setPage(1)
                  setSupplierId(value)
                }}
              />
            </div>
            
            <Select className="h-9 px-3 py-2 text-sm" value={bucket} onChange={(event) => { setPage(1); setBucket(event.target.value) }}>
              <option value="">ทุกอายุหนี้</option>
              <option value="Current">วันนี้/อนาคต</option>
              <option value="1-30">1-30 วัน</option>
              <option value="31-60">31-60 วัน</option>
              <option value="61-90">61-90 วัน</option>
              <option value=">90">&gt;90 วัน</option>
            </Select>
            
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-9 px-3 py-2 text-sm" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
              <option value="">ทุกสาขา</option>
              {(data?.filters.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
            
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">สถานะ:</span>
              {['', ...(data?.filters.statuses ?? [])].map((item) => {
                const active = status === item
                return (
                  <button
                    aria-pressed={active}
                    className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-500 bg-slate-600 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'}`}
                    key={item || 'all-statuses'}
                    onClick={() => { setPage(1); setStatus(item) }}
                    type="button"
                  >
                    {item || 'ทุกสถานะ'}
                  </button>
                )
              })}
            </div>
            
            <span className="text-xs text-slate-500">วันที่บิล:</span>
            <DatePickerInput className="w-[130px]" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
            <span className="text-slate-400">→</span>
            <DatePickerInput className="w-[130px]" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
            
            {hasFilters && (
              <button className="rounded-md bg-slate-100 px-3 py-2 text-xs font-normal text-slate-700 hover:bg-slate-200 transition-colors" type="button" onClick={() => { setBranchId(''); setBucket(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setSupplierId(''); setTo('') }}>✕ ล้าง</button>
            )}
            
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button className="flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-normal text-white transition-colors hover:bg-emerald-700 disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</button>
              <span className="text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
            </div>
          </div>
        </div>

        {/* Mobile View (Collapsible Filters) */}
        <div className="block lg:hidden space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
                showMobileFilters ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              ตัวกรอง
            </button>
            <button
              className="ml-auto inline-flex h-9 shrink-0 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isExporting}
              type="button"
              onClick={() => void exportXlsx()}
            >
              {isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}
            </button>
          </div>

          <div className="relative w-full">
            <input
              autoComplete="off" className="w-full rounded-md border px-3 py-2 text-sm pr-8"
              placeholder="ค้นหาเลขบิล / ผู้ขาย / สาขา..."
              type="search"
              value={q}
              onChange={(event) => { setPage(1); setQ(event.target.value) }}
            />
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm rounded-md border-slate-300 focus:border-slate-400 focus:ring-0 outline-none w-full"
                inputId="ap-supplier-filter-mobile"
                label="ผู้ขาย"
                options={supplierOptions}
                placeholder="ผู้ขายทั้งหมด"
                value={supplierId}
                onChange={(value) => {
                  setPage(1)
                  setSupplierId(value)
                }}
              />
              <Select className="h-9 w-full px-3 py-2 text-sm" value={bucket} onChange={(event) => { setPage(1); setBucket(event.target.value) }}>
                <option value="">ทุกอายุหนี้</option>
                <option value="Current">วันนี้/อนาคต</option>
                <option value="1-30">1-30 วัน</option>
                <option value="31-60">31-60 วัน</option>
                <option value="61-90">61-90 วัน</option>
                <option value=">90">&gt;90 วัน</option>
              </Select>
              <Select className="h-9 w-full px-3 py-2 text-sm" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
                <option value="">ทุกสาขา</option>
                {(data?.filters.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Select>
              <div className="space-y-1">
                <span className="block text-xs font-semibold text-slate-600">สถานะ</span>
                <div aria-label="กรองสถานะเจ้าหนี้" className="flex flex-wrap gap-2" role="group">
                  {['', ...(data?.filters.statuses ?? [])].map((item) => {
                    const active = status === item
                    return (
                      <button
                        aria-pressed={active}
                        className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-500 bg-slate-600 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'}`}
                        key={item || 'all-statuses-mobile'}
                        onClick={() => { setPage(1); setStatus(item) }}
                        type="button"
                      >
                        {item || 'ทุกสถานะ'}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">
                  วันที่บิลจาก
                  <DatePickerInput className="mt-1 w-full" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
                </label>
                <label className="text-xs text-slate-500">
                  วันที่บิลถึง
                  <DatePickerInput className="mt-1 w-full" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
                </label>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
                <button className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={() => { setBranchId(''); setBucket(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setSupplierId(''); setTo('') }}>ล้างตัวกรอง</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {tab === 'summary' ? (
        <>
          <SummaryTable
            buckets={bucketRows}
            isLoading={isLoading}
            pagination={{
              currentPage: safeSummaryPage,
              isLoading,
              onNext: () => setSummaryPage((current) => Math.min(summaryTotalPages, current + 1)),
              onPrevious: () => setSummaryPage((current) => Math.max(1, current - 1)),
              totalLabel: `พบทั้งหมด ${summaryRows.length.toLocaleString('th-TH')} รายการ`,
              totalPages: summaryTotalPages,
            }}
            rows={visibleSummaryRows}
            selectedSort={summarySortKey}
            sortDirection={summarySortDirection}
            summary={data?.summary}
            onSort={changeSummarySort}
          />
        </>
      ) : null}
      {tab === 'detail' && (
        <DetailTable
          isLoading={isLoading}
          pagination={{
            currentPage: page,
            isLoading,
            onNext: () => setPage((current) => Math.min(totalPages, current + 1)),
            onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            totalLabel: `พบทั้งหมด ${(data?.pagination.totalRows ?? 0).toLocaleString('th-TH')} รายการ`,
            totalPages,
          }}
          rows={data?.rows ?? []}
          selectedSort={sortKey}
          sortDirection={sortDirection}
          summaryTotal={data?.summary.total ?? 0}
          onOpen={setSelectedRow}
          onSort={changeSort}
        />
      )}



      {/* Mobile Card list for Summary tab */}
      {tab === 'summary' && (
        <div className="block lg:hidden space-y-3">
          <MobileTablePagination
            currentPage={safeSummaryPage}
            isLoading={isLoading}
            totalLabel={`พบทั้งหมด ${summaryRows.length.toLocaleString('th-TH')} รายการ`}
            totalPages={summaryTotalPages}
            onNext={() => setSummaryPage((current) => Math.min(summaryTotalPages, current + 1))}
            onPrevious={() => setSummaryPage((current) => Math.max(1, current - 1))}
          />
          {isLoading ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}
          
          {!isLoading && visibleSummaryRows.map((row) => (
            <div key={row.supplierName} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold text-slate-900 text-[15px] leading-snug">{row.supplierName}</span>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold shrink-0 ${row.oldest > 30 ? 'bg-red-100 text-red-700' : row.oldest > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                  {row.oldest > 0 ? `อายุหนี้ ${row.oldest} วัน` : 'วันนี้/อนาคต'}
                </span>
              </div>
              
              <div className="text-xs text-slate-600 space-y-2">
                <div className="text-sm font-medium">
                  จำนวนบิล: <span className="text-slate-800">{row.bills} ใบ</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 font-mono text-[13px]">
                  <div>
                    <span className="text-slate-400 block text-xs font-semibold">ยอดค้างจ่ายรวม:</span>
                    <span className="text-red-700 font-bold tabular-nums">{formatMoney(row.total)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs font-semibold">วันนี้/อนาคต:</span>
                    <span className="text-slate-600 tabular-nums">{formatMoney(row.current)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!isLoading && summaryRows.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow border border-slate-200">
              ไม่มีเจ้าหนี้คงค้าง
            </div>
          ) : null}
        </div>
      )}



      {/* Mobile Card list for Detail tab */}
      {tab === 'detail' && (
        <div className="block lg:hidden space-y-3">
          <MobileTablePagination
            currentPage={page}
            isLoading={isLoading}
            totalLabel={`พบทั้งหมด ${(data?.pagination.totalRows ?? 0).toLocaleString('th-TH')} รายการ`}
            totalPages={totalPages}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          />
          {isLoading ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}
          
          {!isLoading && (data?.rows ?? []).map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 active:bg-slate-50 cursor-pointer"
              onClick={() => setSelectedRow(row)}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold text-slate-900 text-[15px] leading-snug text-blue-600">{row.docNo}</span>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold shrink-0 ${bucketClass(row.bucket)}`}>
                  {bucketLongLabel(row.bucket)} ({row.aging} วัน)
                </span>
              </div>
              
              <div className="text-xs text-slate-600 space-y-2">
                <div>
                  <span className="font-semibold text-slate-500">ผู้ขาย: </span>
                  <span className="text-slate-800 font-medium">{row.supplierName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-xs uppercase font-semibold">วันที่บิล:</span>
                    <span className="text-slate-700 font-medium">{formatDateDisplay(row.date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs uppercase font-semibold">นับอายุจาก:</span>
                    <span className="text-slate-700 font-medium">{formatDateDisplay(row.dueDate)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 font-mono text-[13px]">
                  <div>
                    <span className="text-slate-400 block text-xs font-semibold">ยอดบิล:</span>
                    <span className="text-slate-800 tabular-nums">{formatMoney(row.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs font-semibold">จ่ายแล้ว:</span>
                    <span className="text-emerald-700 tabular-nums">{formatMoney(row.paidAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs font-bold">ค้างจ่าย:</span>
                    <span className="text-red-700 font-bold tabular-nums">{formatMoney(row.payableBalance)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!isLoading && (data?.rows ?? []).length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow border border-slate-200">
              ไม่มีเจ้าหนี้คงค้าง
            </div>
          ) : null}
        </div>
      )}


      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Metric({
  label,
  tone = 'slate',
  value,
  className = '',
}: {
  label: string
  tone?: 'red' | 'amber' | 'yellow' | 'slate'
  value: string
  className?: string
}) {
  return <SharedKpiCard className={className} label={label} tone={tone} value={value} />
}

function TableToolbar({
  onResetWidths,
  pagination,
}: {
  onResetWidths?: () => void
  pagination: TablePaginationProps
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <div>{pagination.totalLabel}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          disabled={pagination.currentPage <= 1 || pagination.isLoading}
          type="button"
          onClick={pagination.onPrevious}
        >
          ก่อนหน้า
        </button>
        <span className="px-1">หน้า {pagination.currentPage} / {pagination.totalPages}</span>
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          disabled={pagination.currentPage >= pagination.totalPages || pagination.isLoading}
          type="button"
          onClick={pagination.onNext}
        >
          ถัดไป
        </button>
        {onResetWidths ? (
          <button
            className="h-9 rounded-md bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            type="button"
            onClick={onResetWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
    </div>
  )
}

function MobileTablePagination({
  currentPage,
  isLoading,
  onNext,
  onPrevious,
  totalLabel,
  totalPages,
}: TablePaginationProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-3 text-sm text-slate-600 shadow sm:flex-row sm:items-center sm:justify-between">
      <div>{totalLabel}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={currentPage <= 1 || isLoading} size="xs" type="button" variant="outline" onClick={onPrevious}>ก่อนหน้า</Button>
        <span>หน้า {currentPage} / {totalPages}</span>
        <Button disabled={currentPage >= totalPages || isLoading} size="xs" type="button" variant="outline" onClick={onNext}>ถัดไป</Button>
      </div>
    </div>
  )
}

const summaryColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'supplierName', defaultWidth: 220, minWidth: 160 },
  { key: 'bills', defaultWidth: 110, minWidth: 90 },
  { key: 'current', defaultWidth: 130, minWidth: 110 },
  { key: 'b30', defaultWidth: 110, minWidth: 100 },
  { key: 'b60', defaultWidth: 110, minWidth: 100 },
  { key: 'b90', defaultWidth: 110, minWidth: 100 },
  { key: 'gt90', defaultWidth: 110, minWidth: 100 },
  { key: 'total', defaultWidth: 140, minWidth: 120 },
  { key: 'oldest', defaultWidth: 130, minWidth: 110 },
]

function SummaryTable({
  buckets,
  isLoading,
  onSort,
  pagination,
  rows,
  selectedSort,
  sortDirection,
  summary,
}: {
  buckets: ApPayload['byBucket']
  isLoading: boolean
  onSort: (key: SummarySortKey) => void
  pagination: TablePaginationProps
  rows: ApPayload['bySupplier']
  selectedSort: SummarySortKey
  sortDirection: 'asc' | 'desc'
  summary: ApPayload['summary'] | undefined
}) {
  const bucketTotal = (bucket: string) => buckets.find((item) => item.bucket === bucket)?.total ?? 0
  const columnResize = useResizableColumns('finance.ap.summary.v5', summaryColumns)

  return (
    <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
      <TableToolbar pagination={pagination} onResetWidths={columnResize.hasCustomWidths ? columnResize.resetColumnWidths : undefined} />
      <div className="overflow-x-auto">
      <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          {summaryColumns.map((column) => (
            <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
          ))}
        </colgroup>
        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
          <tr>
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="ผู้ขาย" resizeProps={columnResize.getResizeHandleProps('supplierName', 'ผู้ขาย')} sortKey="supplierName" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="จำนวนบิล" resizeProps={columnResize.getResizeHandleProps('bills', 'จำนวนบิล')} sortKey="bills" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="วันนี้/อนาคต" resizeProps={columnResize.getResizeHandleProps('current', 'วันนี้/อนาคต')} sortKey="current" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="1-30 วัน" resizeProps={columnResize.getResizeHandleProps('b30', '1-30 วัน')} sortKey="b30" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="31-60 วัน" resizeProps={columnResize.getResizeHandleProps('b60', '31-60 วัน')} sortKey="b60" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="61-90 วัน" resizeProps={columnResize.getResizeHandleProps('b90', '61-90 วัน')} sortKey="b90" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="&gt;90 วัน" resizeProps={columnResize.getResizeHandleProps('gt90', '>90 วัน')} sortKey="gt90" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="รวมค้างจ่าย" resizeProps={columnResize.getResizeHandleProps('total', 'รวมค้างจ่าย')} sortKey="total" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="อายุหนี้สูงสุด" resizeProps={columnResize.getResizeHandleProps('oldest', 'อายุหนี้สูงสุด')} sortKey="oldest" onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่มีเจ้าหนี้คงค้าง</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.supplierName} className={`border-t border-slate-100 hover:bg-slate-50/30 dark:hover:bg-slate-800/40 ${row.oldest > 30 ? 'bg-red-50/15 dark:bg-red-50/10' : row.oldest > 0 ? 'bg-amber-50/15 dark:bg-amber-50/10' : ''}`}>
              <td className="p-2 font-medium min-w-0 overflow-hidden"><div className="truncate" title={row.supplierName || ''}>{row.supplierName}</div></td>
              <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{row.bills}</td>
              <td className="p-2 text-right text-slate-600 whitespace-nowrap tabular-nums pl-4">{moneyOrDash(row.current)}</td>
              <td className="p-2 text-right text-yellow-700 whitespace-nowrap tabular-nums pl-4">{moneyOrDash(row.b30)}</td>
              <td className="p-2 text-right text-amber-700 whitespace-nowrap tabular-nums pl-4">{moneyOrDash(row.b60)}</td>
              <td className="p-2 text-right text-orange-700 whitespace-nowrap tabular-nums pl-4">{moneyOrDash(row.b90)}</td>
              <td className="p-2 text-right font-bold text-red-700 whitespace-nowrap tabular-nums pl-4">{moneyOrDash(row.gt90)}</td>
              <td className="p-2 text-right text-base font-bold text-red-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.total)}</td>
              <td className={`p-2 text-right whitespace-nowrap tabular-nums pl-4 ${row.oldest > 30 ? 'font-bold text-red-700' : row.oldest > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{row.oldest > 0 ? `${row.oldest} วัน` : '-'}</td>
            </tr>
          ))}
        </tbody>
        {!isLoading && rows.length > 0 ? (
          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td className="p-2">รวมทั้งหมด ({summary?.suppliers ?? rows.length} ผู้ขาย)</td>
              <td className="p-2 text-right">{summary?.bills ?? 0}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('Current'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('1-30'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('31-60'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('61-90'))}</td>
              <td className="p-2 text-right text-red-700">{formatMoney(bucketTotal('>90'))}</td>
              <td className="p-2 text-right text-lg text-red-700">{formatMoney(summary?.total ?? 0)}</td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
      </div>
    </div>
  )
}

const detailColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'supplierName', defaultWidth: 220, minWidth: 160 },
  { key: 'docNo', defaultWidth: 150, minWidth: 130 },
  { key: 'date', defaultWidth: 130, minWidth: 110 },
  { key: 'dueDate', defaultWidth: 150, minWidth: 130 },
  { key: 'aging', defaultWidth: 120, minWidth: 100 },
  { key: 'totalAmount', defaultWidth: 130, minWidth: 110 },
  { key: 'paidAmount', defaultWidth: 130, minWidth: 110 },
  { key: 'payableBalance', defaultWidth: 140, minWidth: 120 },
]

function DetailTable({
  isLoading,
  onOpen,
  onSort,
  pagination,
  rows,
  selectedSort,
  sortDirection,
  summaryTotal,
}: {
  isLoading: boolean
  onOpen: (row: ApRow) => void
  onSort: (key: SortKey) => void
  pagination: TablePaginationProps
  rows: ApRow[]
  selectedSort: SortKey
  sortDirection: 'asc' | 'desc'
  summaryTotal: number
}) {
  const columnResize = useResizableColumns('finance.ap.detail.v5', detailColumns)
  return (
    <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
      <TableToolbar pagination={pagination} onResetWidths={columnResize.hasCustomWidths ? columnResize.resetColumnWidths : undefined} />
      <div className="overflow-x-auto">
      <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          {detailColumns.map((column) => (
            <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
          ))}
        </colgroup>
        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
          <tr>
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="ผู้ขาย" resizeProps={columnResize.getResizeHandleProps('supplierName', 'ผู้ขาย')} sortKey="supplierName" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="เลขที่บิลรับซื้อ" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่บิลรับซื้อ')} sortKey="docNo" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="วันที่บิล" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่บิล')} sortKey="date" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="ตั้งต้นอายุหนี้" resizeProps={columnResize.getResizeHandleProps('dueDate', 'ตั้งต้นอายุหนี้')} sortKey="dueDate" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="center" direction={sortDirection} label="อายุหนี้" resizeProps={columnResize.getResizeHandleProps('aging', 'อายุหนี้')} sortKey="aging" onSort={onSort} />
            <ResizableTableHead align="right" label="ยอดบิล" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'ยอดบิล')} />
            <ResizableTableHead align="right" label="จ่ายแล้ว" resizeProps={columnResize.getResizeHandleProps('paidAmount', 'จ่ายแล้ว')} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="ค้างจ่าย" resizeProps={columnResize.getResizeHandleProps('payableBalance', 'ค้างจ่าย')} sortKey="payableBalance" onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={8}>ไม่มีเจ้าหนี้คงค้าง</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.id} className={`border-t border-slate-100 hover:bg-slate-50/30 dark:hover:bg-slate-800/40 ${row.aging > 30 ? 'bg-red-50/15 dark:bg-red-50/10' : row.aging > 0 ? 'bg-amber-50/15 dark:bg-amber-50/10' : ''}`}>
              <td className="p-2 min-w-0 overflow-hidden"><div className="truncate" title={row.supplierName || ''}>{row.supplierName}</div></td>
              <td className="p-2 whitespace-nowrap"><button className="font-mono text-xs text-blue-600" type="button" onClick={() => onOpen(row)}>{row.docNo}</button></td>
              <td className="p-2 whitespace-nowrap">{formatDateDisplay(row.date)}</td>
              <td className="p-2 whitespace-nowrap">{formatDateDisplay(row.dueDate)}</td>
              <td className="p-2 text-center whitespace-nowrap"><span className={`rounded-md px-2 py-0.5 text-xs ${bucketClass(row.bucket)}`}>{bucketLongLabel(row.bucket)} ({row.aging})</span></td>
              <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{formatMoney(row.totalAmount)}</td>
              <td className="p-2 text-right text-emerald-600 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.paidAmount)}</td>
              <td className="p-2 text-right font-bold text-red-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.payableBalance)}</td>
            </tr>
          ))}
        </tbody>
        {!isLoading && rows.length > 0 ? (
          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td className="p-2 text-right" colSpan={7}>รวมค้างจ่ายทั้งหมด</td>
              <td className="p-2 text-right text-lg text-red-700">{formatMoney(summaryTotal)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      </div>
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: ApRow }) {
  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent hideClose className="max-h-[90vh] max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none">
        <DialogHeader className="p-4 bg-slate-900 text-white shrink-0 rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg font-bold text-white">{row.docNo}</DialogTitle>
            </div>
            <DialogDescription className="mt-1 text-xs text-slate-400">
              {row.supplierName}
            </DialogDescription>
          </div>
          <Button className="h-9 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4 text-sm">
          {/* ข้อมูลเอกสาร */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูลเอกสาร</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailItem label="วันที่บิล" value={formatDateDisplay(row.date)} />
              <DetailItem label="นับอายุจาก" value={formatDateDisplay(row.dueDate)} />
              <DetailItem label="อายุหนี้" value={`${row.aging} วัน (${bucketLongLabel(row.bucket)})`} />
              <DetailItem label="สาขา" value={row.branchName || '-'} />
              <DetailItem label="ประเภท" value={row.transactionMode || '-'} />
            </div>
          </div>

          {/* ข้อมูลการเงิน */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูลการเงิน</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <DetailItem label="ยอดบิล" value={`${formatMoney(row.totalAmount)} บาท`} />
              <DetailItem label="จ่ายแล้ว" value={`${formatMoney(row.paidAmount)} บาท`} />
              <DetailItem label="ค้างจ่าย" value={`${formatMoney(row.payableBalance)} บาท`} />
              <DetailItem label="สถานะ" value={row.status || '-'} />
            </div>
          </div>

          <TraceSection
            paymentApprovals={row.drilldown?.paymentApprovals ?? []}
            payments={row.drilldown?.payments ?? []}
            purchaseBill={row.drilldown?.purchaseBill}
            supplierAdvances={row.drilldown?.supplierAdvances ?? []}
          />
        </div>

      </DialogContent>
    </Dialog>
  )
}

function TraceSection({
  paymentApprovals,
  payments,
  purchaseBill,
  supplierAdvances,
}: {
  paymentApprovals: NonNullable<ApRow['drilldown']>['paymentApprovals']
  payments: NonNullable<ApRow['drilldown']>['payments']
  purchaseBill?: NonNullable<ApRow['drilldown']>['purchaseBill']
  supplierAdvances: NonNullable<ApRow['drilldown']>['supplierAdvances']
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ที่มาของยอด</div>
      <div className="space-y-3">
        <TraceLink label="บิลรับซื้อ" href={purchaseBill?.href ?? '#'} docNo={purchaseBill?.docNo ?? '-'} amountLabel="ที่มา" amountValue={purchaseBill?.sourceOfTruth ?? '-'} />
        <TraceList
          emptyText="ยังไม่มีรายการอนุมัติจ่ายของบิลนี้"
          rows={paymentApprovals.map((approval) => ({
            amount: `${formatMoney(approval.approvedAmount)} บาท`,
            href: approval.href,
            meta: approval.status,
            title: approval.docNo || '-',
          }))}
          title="อนุมัติจ่าย / PMA"
        />
        <TraceList
          emptyText="ยังไม่มีรายการจ่ายเงินจริงของบิลนี้"
          rows={payments.map((payment) => ({
            amount: `${formatMoney(payment.allocatedAmount)} บาท`,
            href: payment.href,
            meta: `${payment.date ? formatDateDisplay(payment.date) : '-'} · ${payment.status}`,
            title: payment.docNo || payment.voucherId || '-',
          }))}
          title="จ่ายเงินจริง / PMT"
        />
        <TraceList
          emptyText="ยังไม่มีเงินจ่ายล่วงหน้าผู้ขายที่ใช้หักบิลนี้"
          rows={supplierAdvances.map((advance) => ({
            amount: `${formatMoney(advance.allocatedAmount)} บาท`,
            href: advance.href,
            meta: [
              advance.status,
              advance.invoiceNo ? `INV ${advance.invoiceNo}` : null,
              advance.vatType === 'NONE' ? 'ไม่มี VAT' : `มี VAT: ฐาน ${formatMoney(advance.allocatedSubtotalAmount)} / VAT ${formatMoney(advance.allocatedVatAmount)}`,
            ].filter(Boolean).join(' · '),
            title: advance.docNo,
          }))}
          title="เงินจ่ายล่วงหน้าผู้ขาย"
        />
      </div>
    </div>
  )
}

function TraceLink({ amountLabel, amountValue, docNo, href, label }: { amountLabel: string; amountValue: string; docNo: string; href: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
        <a className="font-mono text-xs font-semibold text-blue-700 hover:underline" href={href}>{docNo}</a>
      </div>
      <div className="text-right">
        <div className="text-xs text-slate-400">{amountLabel}</div>
        <div className="text-xs font-semibold text-slate-700">{amountValue}</div>
      </div>
    </div>
  )
}

function TraceList({ emptyText, rows, title }: { emptyText: string; rows: Array<{ amount: string; href: string; meta: string; title: string }>; title: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold text-slate-500">{title}</div>
      {rows.length === 0 ? <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-400">{emptyText}</div> : null}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={`${title}-${row.title}-${row.amount}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2">
            <div>
              <a className="font-mono text-xs font-semibold text-blue-700 hover:underline" href={row.href}>{row.title}</a>
              <div className="text-xs text-slate-400">{row.meta}</div>
            </div>
            <div className="text-xs font-bold text-slate-800">{row.amount}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
