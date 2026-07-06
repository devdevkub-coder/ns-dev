'use client'

import Link from 'next/link'
import { ArrowUpRight, FileText, RefreshCw, Scale, Truck, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { formatWeight } from '@/lib/weight-tickets'

type FilterType = 'all' | 'WTI' | 'WTO'
type StatusRow = {
  count: number
  netWeight: number
  status: string
  statusLabel: string
  type: string
}
type BranchRow = {
  branchId: string
  branchName: string
  pendingOutWeight: number
  wtiCount: number
  wtiNetWeight: number
  wtiWaitingBillWeight: number
  wtoCount: number
  wtoNetWeight: number
}
type ProductRow = {
  documentCount: number
  pendingOutWeight: number
  productCode: string
  productId: string
  productName: string
  wtiNetWeight: number
  wtiRemainingWeight: number
  wtoNetWeight: number
}
type AttentionRow = {
  branchName: string
  date: string
  docNo: string
  href: string
  netWeight: number
  partyName: string
  remainingWeight: number
  status: string
  statusLabel: string
  type: string
  warning: string
}
type DashboardPayload = {
  attentionRows: AttentionRow[]
  byBranch: BranchRow[]
  byStatus: StatusRow[]
  filters: {
    branchId: string
    dateFrom: string
    dateTo: string
    type: FilterType
  }
  summary: {
    cancelledDocuments: number
    totalDocuments: number
    wtiDocuments: number
    wtiNetWeight: number
    wtiWaitingBillCount: number
    wtiWaitingBillWeight: number
    wtoDocuments: number
    wtoNetWeight: number
    wtoPendingOutCount: number
    wtoPendingOutWeight: number
  }
  topProducts: ProductRow[]
}
type BranchOption = {
  id: string
  name: string
}
type DashboardTab = 'attention' | 'overview' | 'products'
type ProductColumnKey = 'documents' | 'pendingOut' | 'product' | 'wtiNet' | 'wtiRemaining' | 'wtoNet'
type AttentionColumnKey = 'branch' | 'date' | 'docNo' | 'netWeight' | 'party' | 'remaining' | 'status' | 'type'

const productColumns: Array<ResizableColumnDefinition<ProductColumnKey>> = [
  { key: 'product', defaultWidth: 210, minWidth: 160 },
  { key: 'documents', defaultWidth: 90, minWidth: 80 },
  { key: 'wtiNet', defaultWidth: 120, minWidth: 105 },
  { key: 'wtiRemaining', defaultWidth: 130, minWidth: 115 },
  { key: 'wtoNet', defaultWidth: 120, minWidth: 105 },
  { key: 'pendingOut', defaultWidth: 130, minWidth: 115 },
]

const attentionColumns: Array<ResizableColumnDefinition<AttentionColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'type', defaultWidth: 80, minWidth: 70 },
  { key: 'date', defaultWidth: 100, minWidth: 90 },
  { key: 'party', defaultWidth: 190, minWidth: 150 },
  { key: 'branch', defaultWidth: 130, minWidth: 110 },
  { key: 'remaining', defaultWidth: 120, minWidth: 105 },
  { key: 'netWeight', defaultWidth: 120, minWidth: 105 },
  { key: 'status', defaultWidth: 130, minWidth: 110 },
]

const typeOptions: Array<{ label: string; value: FilterType }> = [
  { label: 'WTI/WTO ทั้งหมด', value: 'all' },
  { label: 'ใบรับของ WTI', value: 'WTI' },
  { label: 'ใบส่งของ WTO', value: 'WTO' },
]

const quickRangeOptions: Array<{ label: string; value: 'last30' | 'last7' | 'month' | 'today' }> = [
  { label: 'วันนี้', value: 'today' },
  { label: '7 วัน', value: 'last7' },
  { label: 'เดือนนี้', value: 'month' },
  { label: '30 วัน', value: 'last30' },
]

const dashboardTabs: Array<{ label: string; value: DashboardTab }> = [
  { label: 'ภาพรวม', value: 'overview' },
  { label: 'สรุปสินค้า', value: 'products' },
  { label: 'เอกสารที่ต้องตามต่อ', value: 'attention' },
]

const mobileTabLabels: Record<DashboardTab, string> = {
  overview: 'ภาพรวม',
  products: 'สินค้า',
  attention: 'ตามต่อ',
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(end) }
}

function applyRange(range: 'last30' | 'last7' | 'month' | 'today') {
  const end = new Date()
  const start = new Date(end)
  if (range === 'today') {
    // keep today
  } else if (range === 'last7') {
    start.setDate(start.getDate() - 6)
  } else if (range === 'last30') {
    start.setDate(start.getDate() - 29)
  } else {
    start.setDate(1)
  }
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(end) }
}

function formatCount(value: number) {
  return value.toLocaleString('th-TH')
}

function weightText(value: number) {
  return `${formatWeight(value)} กก.`
}

export function WeightTicketDashboardPageClient() {
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [branchId, setBranchId] = useState('all')
  const defaultDateRange = useMemo(() => defaultRange(), [])
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [type, setType] = useState<FilterType>('all')

  const activeFilterText = useMemo(() => {
    const branchName = branchId === 'all' ? 'ทุกสาขา' : branches.find((branch) => branch.id === branchId)?.name ?? branchId
    const typeName = type === 'all' ? 'WTI/WTO' : type
    return `${branchName} · ${typeName} · ${formatDateDisplay(dateRange.dateFrom)} - ${formatDateDisplay(dateRange.dateTo)}`
  }, [branchId, branches, dateRange.dateFrom, dateRange.dateTo, type])

  const hasActiveFilters = branchId !== 'all' || type !== 'all' || dateRange.dateFrom !== defaultDateRange.dateFrom || dateRange.dateTo !== defaultDateRange.dateTo
  const tabCounts: Partial<Record<DashboardTab, number>> = {
    attention: data?.attentionRows.length ?? 0,
    products: data?.topProducts.length ?? 0,
  }

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
      })
      if (branchId !== 'all') params.set('branchId', branchId)
      if (type !== 'all') params.set('type', type)
      const payload = await dailyFetchJson<DashboardPayload>(`/api/daily/weight-ticket-dashboard?${params.toString()}`)
      setData(payload)
    } catch (caught) {
      setData(null)
      setError(caught instanceof Error ? caught.message : 'โหลด Dashboard ใบรับ-ส่งของไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [branchId, dateRange.dateFrom, dateRange.dateTo, type])

  useEffect(() => {
    let cancelled = false

    async function loadBranches() {
      try {
        const payload = await dailyFetchJson<{ branches?: Array<{ id: string; name: string }> }>('/api/branches')
        if (!cancelled) setBranches(payload.branches ?? [])
      } catch {
        if (!cancelled) setBranches([])
      }
    }

    void loadBranches()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function setQuickRange(range: 'last30' | 'last7' | 'month' | 'today') {
    setDateRange(applyRange(range))
  }

  function resetFilters() {
    setBranchId('all')
    setType('all')
    setDateRange({ ...defaultDateRange })
  }

  function isQuickRangeActive(range: 'last30' | 'last7' | 'month' | 'today') {
    const nextRange = applyRange(range)
    return dateRange.dateFrom === nextRange.dateFrom && dateRange.dateTo === nextRange.dateTo
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5">
        <KpiCard icon={FileText} label="เอกสารทั้งหมด" note={`${formatCount(data?.summary.cancelledDocuments ?? 0)} ยกเลิก`} tone="slate" value={isLoading ? '...' : formatCount(data?.summary.totalDocuments ?? 0)} />
        <KpiCard icon={Scale} label="WTI รับเข้า" note={`${formatCount(data?.summary.wtiDocuments ?? 0)} ใบ`} tone="emerald" value={isLoading ? '...' : weightText(data?.summary.wtiNetWeight ?? 0)} />
        <KpiCard icon={TriangleAlert} label="WTI รอเปิด PB" note={`${formatCount(data?.summary.wtiWaitingBillCount ?? 0)} ใบ`} tone="amber" value={isLoading ? '...' : weightText(data?.summary.wtiWaitingBillWeight ?? 0)} />
        <KpiCard icon={Truck} label="WTO ส่งออก" note={`${formatCount(data?.summary.wtoDocuments ?? 0)} ใบ`} tone="blue" value={isLoading ? '...' : weightText(data?.summary.wtoNetWeight ?? 0)} />
        <KpiCard className="col-span-2 xl:col-span-1" icon={TriangleAlert} label="WTO pending out" note={`${formatCount(data?.summary.wtoPendingOutCount ?? 0)} ใบ`} tone="purple" value={isLoading ? '...' : weightText(data?.summary.wtoPendingOutWeight ?? 0)} />
      </div>

      <Tabs className="min-w-0" value={activeTab} onValueChange={(value) => setActiveTab(value as DashboardTab)}>
        <div className="min-w-0 overflow-hidden rounded-md bg-white shadow-sm">
          <TabsList className="w-full min-w-0 overflow-x-auto px-1 sm:px-2" variant="line">
            {dashboardTabs.map((tab) => {
              const count = tabCounts[tab.value]
              return (
                <TabsTrigger aria-label={tab.label} className="min-w-0 flex-1 gap-1 px-2 text-xs sm:flex-none sm:gap-2 sm:px-3 sm:text-sm" key={tab.value} value={tab.value} variant="line">
                  <span className="min-w-0 truncate">
                    <span className="sm:hidden">{mobileTabLabels[tab.value]}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </span>
                  {count !== undefined ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{formatCount(count)}</span> : null}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>
      </Tabs>

      <div className="hidden rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-3 lg:grid-cols-[130px_130px_190px]">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">จากวันที่</label>
                <DatePickerInput className="w-full" value={dateRange.dateFrom} onChange={(value) => setDateRange((current) => ({ ...current, dateFrom: value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">ถึงวันที่</label>
                <DatePickerInput className="w-full" value={dateRange.dateTo} onChange={(value) => setDateRange((current) => ({ ...current, dateTo: value }))} />
              </div>
              <BranchSelectCombobox
                allOptionLabel="ทุกสาขา"
                branches={branches}
                includeAllOption
                inputId="weight-ticket-dashboard-branch"
                label="สาขา"
                placeholder="เลือกสาขา"
                value={branchId === 'all' ? null : branchId}
                onChange={(nextBranchId) => setBranchId(nextBranchId ?? 'all')}
              />
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button asChild className="gap-2" size="sm" variant="outline">
                <Link href="/daily/weight-ticket-list">
                  <FileText className="size-4" />
                  รายการใบรับ-ส่งของ
                </Link>
              </Button>
              <Button asChild className="gap-2" size="sm">
                <Link href="/daily/weight-tickets?type=WTI">
                  <Scale className="size-4" />
                  สร้าง WTI
                </Link>
              </Button>
              <Button asChild className="gap-2" size="sm" variant="secondary">
                <Link href="/daily/weight-tickets?type=WTO">
                  <Truck className="size-4" />
                  สร้าง WTO
                </Link>
              </Button>
              {hasActiveFilters ? <Button size="sm" type="button" variant="outline" onClick={resetFilters}>ล้างตัวกรอง</Button> : null}
              <Button className="gap-2" disabled={isLoading} size="sm" type="button" onClick={() => void loadData()}>
                <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
                รีเฟรช
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">ช่วงเวลา:</span>
            {quickRangeOptions.map((option) => (
              <button
                className={`rounded-md border px-3 py-1 text-xs font-medium transition ${isQuickRangeActive(option.value) ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                key={option.value}
                type="button"
                onClick={() => setQuickRange(option.value)}
              >
                {option.label}
              </button>
            ))}
            <span className="ml-2 text-xs font-semibold text-slate-600">ประเภท:</span>
            {typeOptions.map((option) => (
              <button
                className={`rounded-md border px-3 py-1 text-xs font-medium transition ${type === option.value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-slate-900">Dashboard ใบรับ-ส่งของ</div>
            <div className="truncate text-xs text-slate-500">{activeFilterText}</div>
          </div>
          <Button size="sm" type="button" variant="outline" onClick={() => setShowMobileFilters(true)}>ตัวกรอง {hasActiveFilters ? '(มี)' : ''}</Button>
          <Button className="gap-1" disabled={isLoading} size="sm" type="button" onClick={() => void loadData()}>
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button asChild className="gap-1 px-2" size="sm" variant="outline"><Link href="/daily/weight-ticket-list"><FileText className="size-4" />รายการ</Link></Button>
          <Button asChild className="gap-1 px-2" size="sm"><Link href="/daily/weight-tickets?type=WTI"><Scale className="size-4" />WTI</Link></Button>
          <Button asChild className="gap-1 px-2" size="sm" variant="secondary"><Link href="/daily/weight-tickets?type=WTO"><Truck className="size-4" />WTO</Link></Button>
        </div>
      </div>

      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรอง Dashboard ใบรับ-ส่งของ"
          onClose={() => setShowMobileFilters(false)}
          footer={
            <>
              <button
                className="h-11 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                type="button"
                onClick={resetFilters}
              >
                ล้างตัวกรอง
              </button>
              <button
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                type="button"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </>
          }
        >
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
            <div className="flex items-center gap-2">
              <DatePickerInput className="flex-1" value={dateRange.dateFrom} onChange={(value) => setDateRange((current) => ({ ...current, dateFrom: value }))} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="flex-1" value={dateRange.dateTo} onChange={(value) => setDateRange((current) => ({ ...current, dateTo: value }))} />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงเวลา</span>
            <div className="flex flex-wrap gap-2">
              {quickRangeOptions.map((option) => (
                <button
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition ${isQuickRangeActive(option.value) ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                  key={`mobile-range-${option.value}`}
                  type="button"
                  onClick={() => setQuickRange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <BranchSelectCombobox
              allOptionLabel="ทุกสาขา"
              branches={branches}
              className="w-full"
              includeAllOption
              inputId="weight-ticket-dashboard-branch-mobile"
              label="สาขา"
              placeholder="เลือกสาขา"
              value={branchId === 'all' ? null : branchId}
              onChange={(nextBranchId) => setBranchId(nextBranchId ?? 'all')}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภทเอกสาร</span>
            <div className="flex flex-wrap gap-2">
              {typeOptions.map((option) => (
                <button
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition ${type === option.value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                  key={`mobile-type-${option.value}`}
                  type="button"
                  onClick={() => setType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </MobileFilterSheet>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</div> : null}

      {activeTab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <StatusPanel isLoading={isLoading} rows={data?.byStatus ?? []} />
          <BranchPanel isLoading={isLoading} rows={data?.byBranch ?? []} />
        </div>
      ) : null}
      {activeTab === 'products' ? <ProductPanel isLoading={isLoading} rows={data?.topProducts ?? []} /> : null}
      {activeTab === 'attention' ? <AttentionPanel isLoading={isLoading} rows={data?.attentionRows ?? []} /> : null}
    </section>
  )
}

function KpiCard({ className = '', icon: Icon, label, note, tone, value }: { className?: string; icon: LucideIcon; label: string; note: string; tone: 'amber' | 'blue' | 'emerald' | 'purple' | 'slate'; value: string }) {
  const toneClass = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple: 'bg-purple-50 text-purple-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone]
  const valueClass = {
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    purple: 'text-purple-700',
    slate: 'text-slate-900',
  }[tone]

  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:gap-3 sm:p-4 ${className}`}>
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-md sm:size-10 ${toneClass}`}>
        <Icon className="size-4 sm:size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold leading-tight text-slate-500">{label}</div>
        <div className={`mt-1 break-words font-mono text-base font-bold leading-tight tabular-nums sm:text-lg ${valueClass}`}>{value}</div>
        <div className="mt-0.5 text-xs leading-tight text-slate-400">{note}</div>
      </div>
    </div>
  )
}

function StatusPanel({ isLoading, rows }: { isLoading: boolean; rows: StatusRow[] }) {
  const maxCount = Math.max(1, ...rows.map((row) => row.count))
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-bold text-slate-800">สรุปตามสถานะ</div>
      <div className="mt-3 space-y-3">
        {isLoading ? <div className="py-8 text-center text-sm text-slate-400">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && rows.map((row) => (
          <div key={`${row.type}-${row.status}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0 truncate font-semibold text-slate-700">{row.type} · {row.statusLabel}</div>
              <div className="shrink-0 font-mono font-bold text-slate-900">{formatCount(row.count)} ใบ</div>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.max(4, row.count / maxCount * 100)}%` }} />
            </div>
            <div className="text-xs text-slate-400">{weightText(row.netWeight)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BranchPanel({ isLoading, rows }: { isLoading: boolean; rows: BranchRow[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-bold text-slate-800">สรุปตามสาขา</div>
      <div className="mt-3 divide-y divide-slate-100">
        {isLoading ? <div className="py-8 text-center text-sm text-slate-400">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && rows.map((row) => (
          <div key={row.branchId} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-800">{row.branchName}</div>
              <div className="mt-1 text-xs text-slate-500">WTI {formatCount(row.wtiCount)} ใบ · WTO {formatCount(row.wtoCount)} ใบ</div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs">
              <MetricLine label="WTI" value={weightText(row.wtiNetWeight)} />
              <MetricLine label="WTO" value={weightText(row.wtoNetWeight)} />
              <MetricLine label="รอ PB" value={weightText(row.wtiWaitingBillWeight)} />
              <MetricLine label="Pending out" value={weightText(row.pendingOutWeight)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className="font-mono font-bold text-slate-800 tabular-nums">{value}</div>
    </div>
  )
}

function ProductPanel({ isLoading, rows }: { isLoading: boolean; rows: ProductRow[] }) {
  const columnResize = useResizableColumns('daily.weight-ticket-dashboard.products.v1', productColumns)
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <div>
          <div className="text-sm font-bold text-slate-800">สรุปตามสินค้า</div>
          <div className="text-xs text-slate-500">น้ำหนักรับเข้า, รอเปิด PB, ส่งออก และ pending out</div>
        </div>
        {columnResize.hasCustomWidths ? (
          <Button className="hidden lg:inline-flex" size="xs" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าตาราง</Button>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {productColumns.map((column, index) => <col key={column.key} style={index === productColumns.length - 1 ? undefined : columnResize.getColumnStyle(column.key)} />)}
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <ResizableTableHead label="สินค้า" resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} />
              <ResizableTableHead align="right" label="เอกสาร" resizeProps={columnResize.getResizeHandleProps('documents', 'เอกสาร')} />
              <ResizableTableHead align="right" label="WTI รับเข้า" resizeProps={columnResize.getResizeHandleProps('wtiNet', 'WTI รับเข้า')} />
              <ResizableTableHead align="right" label="WTI รอ PB" resizeProps={columnResize.getResizeHandleProps('wtiRemaining', 'WTI รอ PB')} />
              <ResizableTableHead align="right" label="WTO ส่งออก" resizeProps={columnResize.getResizeHandleProps('wtoNet', 'WTO ส่งออก')} />
              <ResizableTableHead align="right" label="WTO pending" resizeProps={columnResize.getResizeHandleProps('pendingOut', 'WTO pending')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-400" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={6}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={row.productId} className="hover:bg-slate-50">
                <td className="min-w-0 p-2.5">
                  <div className="truncate font-semibold text-slate-800" title={row.productName}>{row.productName}</div>
                  {row.productCode ? <div className="truncate text-[11px] text-slate-400">{row.productCode}</div> : null}
                </td>
                <td className="p-2.5 text-right font-mono font-semibold tabular-nums">{formatCount(row.documentCount)}</td>
                <td className="p-2.5 text-right font-mono text-emerald-700 tabular-nums">{weightText(row.wtiNetWeight)}</td>
                <td className="p-2.5 text-right font-mono text-amber-700 tabular-nums">{weightText(row.wtiRemainingWeight)}</td>
                <td className="p-2.5 text-right font-mono text-blue-700 tabular-nums">{weightText(row.wtoNetWeight)}</td>
                <td className="p-2.5 text-right font-mono text-purple-700 tabular-nums">{weightText(row.pendingOutWeight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-100 lg:hidden">
        {isLoading ? <div className="p-6 text-center text-sm text-slate-400">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && rows.map((row) => (
          <div key={row.productId} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">{row.productName}</div>
                <div className="text-xs text-slate-400">{row.productCode || '-'}</div>
              </div>
              <div className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{formatCount(row.documentCount)} ใบ</div>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-100 bg-slate-50 p-3 text-xs">
              <MetricLine label="WTI รับเข้า" value={weightText(row.wtiNetWeight)} />
              <MetricLine label="WTI รอ PB" value={weightText(row.wtiRemainingWeight)} />
              <MetricLine label="WTO ส่งออก" value={weightText(row.wtoNetWeight)} />
              <MetricLine label="WTO pending" value={weightText(row.pendingOutWeight)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AttentionPanel({ isLoading, rows }: { isLoading: boolean; rows: AttentionRow[] }) {
  const columnResize = useResizableColumns('daily.weight-ticket-dashboard.attention.v1', attentionColumns)
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <div>
          <div className="text-sm font-bold text-slate-800">เอกสารที่ต้องตามต่อ</div>
          <div className="text-xs text-slate-500">WTI ที่ยังเหลือรอ PB และ WTO ที่ยังมี pending out</div>
        </div>
        {columnResize.hasCustomWidths ? (
          <Button className="hidden lg:inline-flex" size="xs" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าตาราง</Button>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {attentionColumns.map((column, index) => <col key={column.key} style={index === attentionColumns.length - 1 ? undefined : columnResize.getColumnStyle(column.key)} />)}
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <ResizableTableHead label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead align="center" label="ประเภท" resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
              <ResizableTableHead label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="คู่ค้า" resizeProps={columnResize.getResizeHandleProps('party', 'คู่ค้า')} />
              <ResizableTableHead label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
              <ResizableTableHead align="right" label="คงเหลือ" resizeProps={columnResize.getResizeHandleProps('remaining', 'คงเหลือ')} />
              <ResizableTableHead align="right" label="สุทธิ" resizeProps={columnResize.getResizeHandleProps('netWeight', 'สุทธิ')} />
              <ResizableTableHead align="center" label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-400" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={8}>ไม่มีเอกสารที่ต้องตามต่อ</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={`${row.type}-${row.docNo}`} className="hover:bg-slate-50">
                <td className="p-2.5">
                  <Link className="inline-flex min-w-0 items-center gap-1 font-semibold text-blue-700 hover:text-blue-900" href={row.href}>
                    <span className="truncate">{row.docNo}</span>
                    <ArrowUpRight className="size-3.5 shrink-0" />
                  </Link>
                </td>
                <td className="p-2.5 text-center font-bold text-slate-700">{row.type}</td>
                <td className="p-2.5 whitespace-nowrap">{formatDateDisplay(row.date)}</td>
                <td className="min-w-0 p-2.5"><div className="truncate" title={row.partyName}>{row.partyName}</div></td>
                <td className="min-w-0 p-2.5"><div className="truncate" title={row.branchName}>{row.branchName}</div></td>
                <td className="p-2.5 text-right font-mono font-bold text-amber-700 tabular-nums">{weightText(row.remainingWeight)}</td>
                <td className="p-2.5 text-right font-mono text-slate-700 tabular-nums">{weightText(row.netWeight)}</td>
                <td className="p-2.5 text-center">
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">{row.warning}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-100 lg:hidden">
        {isLoading ? <div className="p-6 text-center text-sm text-slate-400">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">ไม่มีเอกสารที่ต้องตามต่อ</div> : null}
        {!isLoading && rows.map((row) => (
          <Link key={`${row.type}-${row.docNo}`} className="block space-y-3 p-4 hover:bg-slate-50" href={row.href}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-blue-700">{row.docNo}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{row.type} · {formatDateDisplay(row.date)}</div>
              </div>
              <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">{row.warning}</span>
            </div>
            <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs">
              <div className="truncate font-semibold text-slate-800">{row.partyName}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
              <MetricLine label="สาขา" value={row.branchName} />
              <MetricLine label="สุทธิ" value={weightText(row.netWeight)} />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
              <span className="font-semibold text-slate-500">คงเหลือต้องตามต่อ</span>
              <span className="font-mono font-bold text-amber-700 tabular-nums">{weightText(row.remainingWeight)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
