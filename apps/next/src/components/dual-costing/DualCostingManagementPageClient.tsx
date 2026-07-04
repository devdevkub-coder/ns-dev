'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import {
  DualCostingCountRow,
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingHint,
  DualCostingPageSection,
  DualCostingPanel,
  DualCostingStatCard,
  DualCostingWorkflowStrip,
} from './DualCostingPageShell'

type Mode = 'ledger' | 'report' | 'waiting'

type WaitingRow = {
  allocatedQty: number
  allocationStatus: string
  branchName: string
  customerName: string
  date: string
  docNo: string
  id: string
  metalGroup: string
  productId: string
  productName: string
  qty: number
  remainingQty: number
  revenuePending: number
  salesBillId: string
  itemId: string
  unitPrice: number
}

type LedgerRow = {
  allocatedAt: string
  allocatedBy: string
  allocatedQty: number
  allocatedRevenue: number
  costPerKg: number
  costPoolNo: string
  date: string
  gpPct: number
  grossProfit: number
  id: string
  matchId: string
  productCategory: string
  productName: string
  saleDocNo: string
  saleQty: number
  sourceNo: string
  status: string
  targetType: string
  totalCost: number
}

type LedgerColumnKey = 'allocatedBy' | 'allocatedQty' | 'costPerKg' | 'costPoolNo' | 'gpPct' | 'grossProfit' | 'matchId' | 'productCategory' | 'productName' | 'saleDocNo' | 'saleQty' | 'allocatedRevenue' | 'status' | 'targetType' | 'totalCost'

type TabPayload = {
  rows: WaitingRow[]
  count: number
}

type WaitingPayload = {
  filters: { categories: string[]; statuses: string[] }
  po: TabPayload
  bill: TabPayload
  production: TabPayload
  summary: { byCategory: { count: number; name: string; qty: number; revenue: number }[]; count: number; fullyPending: number; partial: number; totalQty: number; totalRevenue: number }
}

type LedgerPayload = {
  filters: { categories: string[]; statuses: string[]; targetTypes: string[] }
  rows: LedgerRow[]
  summary: { active: number; cost: number; gp: number; gpPct: number; poCount: number; revenue: number; reversed: number; rows: number; spotCount: number; totalQty: number }
}

type ReportPayload = {
  report: {
    byCategory: { allocatedQty: number; category: string; cost: number; gp: number; gpPct: number; pendingQty: number; pendingRevenue: number; revenue: number; rows: number }[]
    po: ReportMetric
    spotAllocated: ReportMetric
    total: ReportMetric
    waiting: { count: number; qty: number; revenue: number }
  }
}

type ReportMetric = { cost: number; count: number; gp: number; gpPct: number; qty: number; revenue: number }
type ReportCategoryRow = ReportPayload['report']['byCategory'][number]
type ReportColumnKey = 'allocatedQty' | 'category' | 'cost' | 'gp' | 'gpPct' | 'pendingQty' | 'pendingRevenue' | 'revenue'
type WaitingSummaryRow = WaitingPayload['summary']['byCategory'][number]
type WaitingSummaryColumnKey = 'count' | 'name' | 'qty' | 'revenue'

const waitingSummaryColumns: Array<ResizableColumnDefinition<WaitingSummaryColumnKey> & { align?: 'center' | 'left' | 'right'; label: string }> = [
  { key: 'name', label: 'หมวดสินค้า', defaultWidth: 180, minWidth: 140 },
  { key: 'count', label: 'รายการรอจัดสรร', defaultWidth: 130, minWidth: 110, align: 'right' },
  { key: 'qty', label: 'น้ำหนักรอจัดสรร', defaultWidth: 150, minWidth: 125, align: 'right' },
  { key: 'revenue', label: 'มูลค่ารอจัดสรร', defaultWidth: 150, minWidth: 125, align: 'right' },
]

const reportColumns: Array<ResizableColumnDefinition<ReportColumnKey> & { align?: 'center' | 'left' | 'right'; label: string }> = [
  { key: 'category', label: 'หมวดสินค้า', defaultWidth: 160, minWidth: 130 },
  { key: 'allocatedQty', label: 'น้ำหนักจัดสรรแล้ว', defaultWidth: 140, minWidth: 120, align: 'right' },
  { key: 'revenue', label: 'รายได้จัดสรร', defaultWidth: 130, minWidth: 115, align: 'right' },
  { key: 'cost', label: 'ต้นทุน Deal Cost', defaultWidth: 130, minWidth: 115, align: 'right' },
  { key: 'gp', label: 'กำไรขั้นต้น', defaultWidth: 120, minWidth: 110, align: 'right' },
  { key: 'gpPct', label: 'GP%', defaultWidth: 90, minWidth: 80, align: 'right' },
  { key: 'pendingQty', label: 'น้ำหนักรอจัดสรร', defaultWidth: 135, minWidth: 120, align: 'right' },
  { key: 'pendingRevenue', label: 'มูลค่าขายรอจัดสรร', defaultWidth: 150, minWidth: 130, align: 'right' },
]

export function DualCostingManagementPageClient({ mode }: { mode: Mode }) {
  if (mode === 'waiting') return <WaitingAllocationsView />
  if (mode === 'ledger') return <AllocationLedgerView />
  return <DualCostingReportView />
}

function WaitingAllocationsView() {
  const [activeTab, setActiveTab] = useState<'po' | 'bill' | 'production'>('po')
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<WaitingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortKey, setSortKey] = useState<string>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [summarySortKey, setSummarySortKey] = useState<WaitingSummaryColumnKey | null>(null)
  const [summarySortDirection, setSummarySortDirection] = useState<'asc' | 'desc'>('asc')

  // Pagination states for each tab
  const [poPage, setPoPage] = useState(1)
  const [billPage, setBillPage] = useState(1)
  const [productionPage, setProductionPage] = useState(1)
  const pageSize = 20

  const poColumns = useMemo<Array<ResizableColumnDefinition<string> & { label: string; align?: 'left' | 'right' | 'center' }>>(() => [
    { key: 'docNo', label: 'PO ขาย', defaultWidth: 140 },
    { key: 'date', label: 'วันที่', defaultWidth: 100 },
    { key: 'customerName', label: 'ลูกค้า', defaultWidth: 180 },
    { key: 'productName', label: 'สินค้า', defaultWidth: 220 },
    { key: 'metalGroup', label: 'หมวด', defaultWidth: 90, align: 'center' },
    { key: 'qty', label: 'ขาย (กก.)', defaultWidth: 110, align: 'right' },
    { key: 'allocatedQty', label: 'Allocate แล้ว', defaultWidth: 110, align: 'right' },
    { key: 'remainingQty', label: 'รอจัดสรร (กก.)', defaultWidth: 115, align: 'right' },
    { key: 'unitPrice', label: 'ราคา/กก.', defaultWidth: 100, align: 'right' },
    { key: 'revenuePending', label: 'มูลค่ารอจัดสรร', defaultWidth: 120, align: 'right' },
    { key: 'allocationStatus', label: 'สถานะ', defaultWidth: 90, align: 'center' },
    { key: 'action', label: 'Action', defaultWidth: 90, align: 'center' },
  ], [])

  const billColumns = useMemo<Array<ResizableColumnDefinition<string> & { label: string; align?: 'left' | 'right' | 'center' }>>(() => [
    { key: 'docNo', label: 'บิลขาย', defaultWidth: 140 },
    { key: 'date', label: 'วันที่', defaultWidth: 100 },
    { key: 'customerName', label: 'ลูกค้า', defaultWidth: 180 },
    { key: 'productName', label: 'สินค้า', defaultWidth: 220 },
    { key: 'metalGroup', label: 'หมวด', defaultWidth: 90, align: 'center' },
    { key: 'qty', label: 'ขาย (กก.)', defaultWidth: 110, align: 'right' },
    { key: 'allocatedQty', label: 'Allocate แล้ว', defaultWidth: 110, align: 'right' },
    { key: 'remainingQty', label: 'รอจัดสรร (กก.)', defaultWidth: 115, align: 'right' },
    { key: 'unitPrice', label: 'ราคา/กก.', defaultWidth: 100, align: 'right' },
    { key: 'revenuePending', label: 'มูลค่ารอจัดสรร', defaultWidth: 120, align: 'right' },
    { key: 'allocationStatus', label: 'สถานะ', defaultWidth: 90, align: 'center' },
    { key: 'action', label: 'Action', defaultWidth: 90, align: 'center' },
  ], [])

  const productionColumns = useMemo<Array<ResizableColumnDefinition<string> & { label: string; align?: 'left' | 'right' | 'center' }>>(() => [
    { key: 'docNo', label: 'ใบสั่งผลิต', defaultWidth: 140 },
    { key: 'date', label: 'วันที่เบิกวัตถุดิบ', defaultWidth: 120 },
    { key: 'customerName', label: 'ผู้ผลิต', defaultWidth: 180 },
    { key: 'productName', label: 'สินค้า', defaultWidth: 220 },
    { key: 'metalGroup', label: 'หมวด', defaultWidth: 90, align: 'center' },
    { key: 'qty', label: 'ผลิต (กก.)', defaultWidth: 110, align: 'right' },
    { key: 'allocatedQty', label: 'Allocate แล้ว', defaultWidth: 110, align: 'right' },
    { key: 'remainingQty', label: 'รอจัดสรร (กก.)', defaultWidth: 115, align: 'right' },
    { key: 'unitPrice', label: 'ต้นทุน/กก.', defaultWidth: 100, align: 'right' },
    { key: 'revenuePending', label: 'มูลค่ารอจัดสรร', defaultWidth: 120, align: 'right' },
    { key: 'allocationStatus', label: 'สถานะ', defaultWidth: 90, align: 'center' },
    { key: 'action', label: 'Action', defaultWidth: 90, align: 'center' },
  ], [])

  const poResize = useResizableColumns('dual-costing.waiting.po.v2', poColumns)
  const billResize = useResizableColumns('dual-costing.waiting.bill.v2', billColumns)
  const prodResize = useResizableColumns('dual-costing.waiting.production.v2', productionColumns)
  const summaryResize = useResizableColumns('dual-costing.waiting.summary.v1', waitingSummaryColumns)

  const columnResize = activeTab === 'po' ? poResize : activeTab === 'bill' ? billResize : prodResize
  const currentColumns = activeTab === 'po' ? poColumns : activeTab === 'bill' ? billColumns : productionColumns
  const tabData = data ? (activeTab === 'po' ? data.po : activeTab === 'bill' ? data.bill : data.production) : null
  const rows = useMemo(() => tabData?.rows ?? [], [tabData])
  const summaryRows = useMemo(() => data?.summary.byCategory ?? [], [data?.summary.byCategory])

  const sortedRows = useMemo(() => {
    const nextRows = [...rows]
    if (!sortKey) return nextRows

    nextRows.sort((left: any, right: any) => {
      let lVal = left[sortKey]
      let rVal = right[sortKey]

      if (typeof lVal === 'string') {
        return sortDirection === 'asc'
          ? lVal.localeCompare(rVal)
          : rVal.localeCompare(lVal)
      }

      lVal = Number(lVal) || 0
      rVal = Number(rVal) || 0
      return sortDirection === 'asc' ? lVal - rVal : rVal - lVal
    })
    return nextRows
  }, [rows, sortKey, sortDirection])
  const sortedSummaryRows = useMemo(() => {
    if (!summarySortKey) return summaryRows

    return [...summaryRows].sort((left, right) => {
      const result = compareSortValues(getWaitingSummarySortValue(left, summarySortKey), getWaitingSummarySortValue(right, summarySortKey))
      return summarySortDirection === 'asc' ? result : -result
    })
  }, [summaryRows, summarySortDirection, summarySortKey])

  const changeSort = (key: string) => {
    if (activeTab === 'po') setPoPage(1)
    else if (activeTab === 'bill') setBillPage(1)
    else setProductionPage(1)

    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  function changeSummarySort(key: WaitingSummaryColumnKey) {
    if (summarySortKey === key) {
      setSummarySortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSummarySortKey(key)
    setSummarySortDirection('asc')
  }

  useEffect(() => {
    setPoPage(1)
    setBillPage(1)
    setProductionPage(1)
  }, [category, search, status])

  const currentPage = activeTab === 'po' ? poPage : activeTab === 'bill' ? billPage : productionPage
  const setPage = activeTab === 'po' ? setPoPage : activeTab === 'bill' ? setBillPage : setProductionPage

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const visibleRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, safePage, pageSize])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    return params.toString()
  }, [category, search, status])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<WaitingPayload>(`/api/dual-costing/waiting-allocations?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Waiting Allocations ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => { void loadData() }, [loadData])

  return (
    <DualCostingPageSection>
      <DualCostingErrorBox error={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <DualCostingStatCard icon="⏳" label="รายการที่รอส่งต่อ" tone="amber" value={String(data?.summary.count ?? 0)} />
        <DualCostingStatCard icon="⚖️" label="น้ำหนักรอจัดสรร" tone="blue" value={`${formatMoney(data?.summary.totalQty ?? 0)} กก.`} />
        <div className="col-span-2 md:col-span-1">
          <DualCostingStatCard icon="💰" label="มูลค่ารอจัดสรร" tone="emerald" value={formatMoney(data?.summary.totalRevenue ?? 0)} />
        </div>
      </div>

      <DualCostingPanel title="สรุปตามหมวด">
        {/* Desktop View */}
        <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
          {summaryResize.hasCustomWidths ? (
            <div className="flex justify-end border-b border-slate-100 px-3 py-3">
              <Button size="sm" type="button" variant="outline" onClick={summaryResize.resetColumnWidths}>คืนค่าเดิมตารางสรุป</Button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
          <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: summaryResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {waitingSummaryColumns.map((column, index) => {
                if (index === waitingSummaryColumns.length - 1) {
                  return <col key={column.key} style={{ minWidth: column.minWidth }} />
                }
                return <col key={column.key} style={summaryResize.getColumnStyle(column.key)} />
              })}
            </colgroup>
            <TableHeader className="bg-slate-100">
              <tr>
                {waitingSummaryColumns.map((column) => (
                  <ResizableTableHead
                    key={column.key}
                    activeSortKey={summarySortKey ?? undefined}
                    align={column.align}
                    direction={summarySortDirection}
                    label={column.label}
                    sortKey={column.key}
                    onSort={changeSummarySort}
                    resizeProps={summaryResize.getResizeHandleProps(column.key, column.label)}
                  />
                ))}
              </tr>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {sortedSummaryRows.map((row) => (
                <TableRow key={row.name} className="transition-colors hover:bg-slate-50">
                  <TableCell className="px-3 py-3"><span className="block truncate rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800" title={row.name}>{row.name}</span></TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{row.count}</TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-800">{formatMoney(row.qty)} กก.</TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-emerald-700">{formatMoney(row.revenue)}</TableCell>
                </TableRow>
              ))}
              {!isLoading && summaryRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={waitingSummaryColumns.length}>ไม่มีรายการรอ allocate ตามตัวกรอง</TableCell></TableRow> : null}
            </TableBody>
          </Table>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-3">
          {sortedSummaryRows.map((row) => (
            <div key={row.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{row.name}</span>
                <span className="text-xs text-slate-500 font-semibold">{row.count} รายการ</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block">น้ำหนักรอ</span>
                  <span className="font-mono font-bold text-slate-800">{formatMoney(row.qty)} กก.</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">มูลค่ารอ</span>
                  <span className="font-mono font-bold text-emerald-700">{formatMoney(row.revenue)}</span>
                </div>
              </div>
            </div>
          ))}
          {!isLoading && summaryRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-400">ไม่มีรายการรอ allocate ตามตัวกรอง</div>
          ) : null}
        </div>
      </DualCostingPanel>

      <DualCostingFilterCard>
        {/* Desktop View */}
        <div className="hidden lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="min-w-[240px] flex-1 rounded-md border-slate-300 focus-visible:ring-emerald-100" placeholder="ค้นหา doc no / สินค้า / ลูกค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select className="w-auto min-w-[160px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option>{(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item === 'pending_allocation' ? 'pending' : item === 'partially_allocated' ? 'partial' : item}</option>)}</Select>
            <Select className="w-auto min-w-[160px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Button
              className="ml-auto h-9 rounded-md px-3 text-sm font-normal focus-visible:ring-slate-100"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => columnResize.resetColumnWidths()}
            >
              คืนค่าเดิมตาราง
            </Button>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2">
          <div className="flex gap-2">
            <Input className="flex-1 h-10 rounded-md border-slate-300 focus-visible:ring-emerald-100 text-sm" placeholder="ค้นหา doc no / สินค้า / ลูกค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button
              className={`h-10 rounded-md border px-3 text-sm font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง
            </button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <label className="text-xs text-slate-500 font-semibold">
                สถานะ
                <Select className="mt-1 w-full h-9 border-slate-300 focus-visible:ring-emerald-100 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option>{(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item === 'pending_allocation' ? 'pending' : item === 'partially_allocated' ? 'partial' : item}</option>)}</Select>
              </label>
              <label className="text-xs text-slate-500 font-semibold">
                หมวดสินค้า
                <Select className="mt-1 w-full h-9 border-slate-300 focus-visible:ring-emerald-100 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="all">ทุกหมวด</option>
                  {(data?.filters.categories ?? []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </Select>
              </label>
              <div className="flex justify-end pt-1">
                <Button
                  className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors focus-visible:outline-none"
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setCategory('all')
                    setSearch('')
                    setStatus('all')
                  }}
                >
                  ล้างตัวกรอง
                </Button>
              </div>
            </div>
          )}
        </div>
      </DualCostingFilterCard>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors focus-visible:outline-none ${
            activeTab === 'po'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => {
            setActiveTab('po')
            setSortKey('date')
            setSortDirection('desc')
          }}
        >
          PO ขาย <span className="ml-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 font-medium">{data?.po.count ?? 0}</span>
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors focus-visible:outline-none ${
            activeTab === 'bill'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => {
            setActiveTab('bill')
            setSortKey('date')
            setSortDirection('desc')
          }}
        >
          บิลขาย <span className="ml-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 font-medium">{data?.bill.count ?? 0}</span>
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors focus-visible:outline-none ${
            activeTab === 'production'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => {
            setActiveTab('production')
            setSortKey('date')
            setSortDirection('desc')
          }}
        >
          Production <span className="ml-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 font-medium">{data?.production.count ?? 0}</span>
        </button>
      </div>

      {/* Pagination controls */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>พบทั้งหมด {sortedRows.length.toLocaleString('th-TH')} รายการ</div>
        <div className="flex items-center gap-2">
          <Button className="h-9 px-3 text-sm" disabled={safePage <= 1 || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span>หน้า {safePage} / {totalPages}</span>
          <Button className="h-9 px-3 text-sm" disabled={safePage >= totalPages || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden overflow-x-auto lg:block" style={{ width: '100%', overflowX: 'auto' }}>
        <table className="w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {currentColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-600">
            <tr className="divide-x divide-transparent">
              {currentColumns.map((col) => (
                <ResizableTableHead
                  key={col.key}
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  label={col.label}
                  align={col.align}
                  resizeProps={columnResize.getResizeHandleProps(col.key, col.label)}
                  sortKey={col.key}
                  onSort={changeSort}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={currentColumns.length}>
                  กำลังโหลดข้อมูล
                </td>
              </tr>
            ) : null}
            {!isLoading && sortedRows.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-emerald-700 font-semibold" colSpan={currentColumns.length}>
                  ไม่มีรายการค้าง allocate ตามตัวกรอง
                </td>
              </tr>
            ) : null}
            {!isLoading && visibleRows.map((row) => {
              let allocatorHref = ''
              if (activeTab === 'po') {
                allocatorHref = `/dual-costing/cost-allocator?sourceType=po-sell&productId=${encodeURIComponent(row.productId)}&poSellId=${encodeURIComponent(row.id)}`
              } else if (activeTab === 'bill') {
                allocatorHref = `/dual-costing/cost-allocator?sourceType=spot-sell&productId=${encodeURIComponent(row.productId)}&poSellId=${encodeURIComponent(`${row.salesBillId}:${row.itemId}`)}`
              } else {
                allocatorHref = `/dual-costing/cost-allocator?sourceType=production&productId=${encodeURIComponent(row.productId)}&poSellId=${encodeURIComponent(row.docNo)}`
              }

              return (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 pl-4 font-mono text-slate-700 whitespace-nowrap">{row.docNo}</td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{formatDateDisplay(row.date)}</td>
                  <td className="p-3 text-slate-800 font-medium min-w-0 overflow-hidden"><div className="truncate" title={row.customerName === '-' ? 'ภายในโรงงาน' : row.customerName}>{row.customerName === '-' ? 'ภายในโรงงาน' : row.customerName}</div></td>
                  <td className="p-3 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.productName || ''}>{row.productName}</div></td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {row.metalGroup}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.qty)}</td>
                  <td className="p-3 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.allocatedQty)}</td>
                  <td className="p-3 text-right font-mono font-bold text-amber-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.remainingQty)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.unitPrice)}</td>
                  <td className="p-3 text-right font-mono text-emerald-700 font-medium whitespace-nowrap tabular-nums pl-4">{formatMoney(row.revenuePending)}</td>
                  <td className="p-3 text-center">
                    <StatusPill status={row.allocationStatus} />
                  </td>
                  <td className="p-3 pr-4 text-center">
                    <Button asChild size="xs" type="button" className="rounded-lg font-semibold focus-visible:ring-2 focus-visible:ring-emerald-100">
                      <Link href={allocatorHref}>
                        {row.allocatedQty > 0 ? 'จัดสรรต่อ' : 'จัดสรร'}
                      </Link>
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="block space-y-3 p-3 lg:hidden">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && sortedRows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-emerald-700 shadow-sm">ไม่มีรายการค้าง allocate ตามตัวกรอง</div>
        ) : null}
        {!isLoading && visibleRows.map((row) => {
          let allocatorHref = ''
          if (activeTab === 'po') {
            allocatorHref = `/dual-costing/cost-allocator?sourceType=po-sell&productId=${encodeURIComponent(row.productId)}&poSellId=${encodeURIComponent(row.id)}`
          } else if (activeTab === 'bill') {
            allocatorHref = `/dual-costing/cost-allocator?sourceType=spot-sell&productId=${encodeURIComponent(row.productId)}&poSellId=${encodeURIComponent(`${row.salesBillId}:${row.itemId}`)}`
          } else {
            allocatorHref = `/dual-costing/cost-allocator?sourceType=production&productId=${encodeURIComponent(row.productId)}&poSellId=${encodeURIComponent(row.docNo)}`
          }

          return (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono text-xs font-semibold text-slate-500">{row.docNo}</div>
                  <div className="text-xs text-slate-500">{formatDateDisplay(row.date)}</div>
                </div>
                <StatusPill status={row.allocationStatus} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">{row.customerName === '-' ? 'ภายในโรงงาน' : row.customerName}</div>
                <div className="text-xs text-slate-600 mt-1">{row.productName}</div>
                <div className="mt-1"><span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{row.metalGroup}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500 block">ขาย / Allocate แล้ว</span>
                  <span className="font-mono font-medium text-slate-800">{formatMoney(row.qty)} / <span className="text-emerald-700 font-semibold">{formatMoney(row.allocatedQty)}</span> กก.</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">ค้าง allocate</span>
                  <span className="font-mono font-bold text-amber-700">{formatMoney(row.remainingQty)} กก.</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{activeTab === 'production' ? 'ต้นทุน/กก.' : 'ราคา/กก.'}</span>
                  <span className="font-mono text-slate-700">{formatMoney(row.unitPrice)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">มูลค่ารอ Match</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatMoney(row.revenuePending)}</span>
                </div>
              </div>
              <div className="pt-1">
                <Button asChild size="sm" type="button" className="w-full rounded-lg font-semibold focus-visible:ring-2 focus-visible:ring-emerald-100">
                  <Link href={allocatorHref}>
                    {row.allocatedQty > 0 ? 'จัดสรรต่อ' : 'จัดสรร'}
                  </Link>
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      </div>

    </DualCostingPageSection>
  )
}

function AllocationLedgerView() {
  const pageSizeOptions = [10, 25, 50, 100] as const
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<LedgerPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('approved')
  const [targetType, setTargetType] = useState('all')
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Pagination states
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(50)
  const [sortKey, setSortKey] = useState<LedgerColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const ledgerColumns = useMemo<Array<ResizableColumnDefinition<LedgerColumnKey> & { align?: 'center' | 'left' | 'right'; label: string }>>(() => [
    { key: 'matchId', label: 'Match ID', defaultWidth: 190, minWidth: 160 },
    { key: 'targetType', label: 'Type', defaultWidth: 88, minWidth: 78, align: 'center' },
    { key: 'saleDocNo', label: 'Sale Doc', defaultWidth: 130, minWidth: 120 },
    { key: 'productName', label: 'สินค้า', defaultWidth: 230, minWidth: 180 },
    { key: 'productCategory', label: 'หมวด', defaultWidth: 110, minWidth: 95, align: 'center' },
    { key: 'saleQty', label: 'Sale Qty', defaultWidth: 115, minWidth: 105, align: 'right' },
    { key: 'allocatedQty', label: 'Allocated', defaultWidth: 115, minWidth: 105, align: 'right' },
    { key: 'costPoolNo', label: 'Cost Pool', defaultWidth: 145, minWidth: 130 },
    { key: 'costPerKg', label: 'บาท/กก.', defaultWidth: 95, minWidth: 85, align: 'right' },
    { key: 'totalCost', label: 'Total Cost', defaultWidth: 125, minWidth: 110, align: 'right' },
    { key: 'allocatedRevenue', label: 'Revenue', defaultWidth: 125, minWidth: 110, align: 'right' },
    { key: 'grossProfit', label: 'GP', defaultWidth: 115, minWidth: 100, align: 'right' },
    { key: 'gpPct', label: 'GP%', defaultWidth: 80, minWidth: 70, align: 'right' },
    { key: 'allocatedBy', label: 'By', defaultWidth: 135, minWidth: 115 },
    { key: 'status', label: 'Status', defaultWidth: 115, minWidth: 100, align: 'center' },
  ], [])
  const ledgerResize = useResizableColumns('dual-costing.allocation-ledger.v1', ledgerColumns)

  useEffect(() => {
    setPage(1)
  }, [category, fromDate, pageSize, search, status, targetType, toDate])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getLedgerSortValue(left, sortKey), getLedgerSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safePage = Math.min(page, totalPages)

  const visibleRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, safePage, pageSize])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (fromDate) params.set('from', fromDate)
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (targetType !== 'all') params.set('targetType', targetType)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [category, fromDate, search, status, targetType, toDate])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<LedgerPayload>(`/api/dual-costing/cost-allocation-ledger?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Allocation Ledger ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => { void loadData() }, [loadData])

  function handleLedgerSort(key: LedgerColumnKey) {
    setPage(1)
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <DualCostingPageSection>
      <DualCostingErrorBox error={error} />
      <DualCostingWorkflowStrip active="ledger" />
      
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DualCostingStatCard icon="📊" label="รวม Allocations" tone="slate" value={String(data?.summary.active ?? 0)}>
          <span className="text-xs font-semibold text-slate-500 mt-0.5 block">PO {data?.summary.poCount ?? 0} · Spot {data?.summary.spotCount ?? 0}</span>
        </DualCostingStatCard>
        <DualCostingStatCard icon="⚖️" label="น้ำหนัก allocate" tone="blue" value={`${formatMoney(data?.summary.totalQty ?? 0)} กก.`} />
        <DualCostingStatCard icon="💳" label="ต้นทุนรวม" tone="red" value={formatMoney(data?.summary.cost ?? 0)} />
        <DualCostingStatCard icon="📈" label="กำไรรวม (Deal Cost)" tone={(data?.summary.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(data?.summary.gp ?? 0)} />
      </div>

      <DualCostingFilterCard>
        {/* Desktop View */}
        <div className="hidden xl:block">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 min-w-[260px] flex-1 rounded-md border-slate-300 focus-visible:ring-emerald-100" placeholder="ค้นหา match id / doc / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <span className="text-xs text-slate-500 font-semibold">วันที่:</span>
            <DatePickerInput id="allocation-ledger-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="allocation-ledger-to" value={toDate} onChange={setToDate} />
            <Select className="w-auto min-w-[130px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="all">ทุก target</option>{(data?.filters.targetTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Select className="w-auto min-w-[130px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Select className="w-auto min-w-[130px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={status} onChange={(event) => setStatus(event.target.value)}><option value="approved">Approved</option><option value="reversed">Reversed</option><option value="all">ทั้งหมด</option></Select>
            <Button disabled className="ml-auto h-9 rounded-md px-3 text-sm font-normal focus-visible:ring-slate-100" size="sm" type="button" variant="export">ส่งออก CSV</Button>
          </div>
        </div>

        {/* Mobile / Tablet View */}
        <div className="block xl:hidden space-y-2">
          <div className="flex gap-2">
            <Input className="h-9 flex-1 rounded-md border-slate-300 text-sm focus-visible:ring-emerald-100" placeholder="ค้นหา match id / doc / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button
              className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold transition-colors ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              ตัวกรอง
            </button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500 font-semibold">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={fromDate} onChange={setFromDate} />
                </label>
                <label className="text-xs text-slate-500 font-semibold">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={toDate} onChange={setToDate} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-slate-500 font-semibold">
                  Target
                  <Select className="mt-1 w-full h-9 border-slate-300 focus-visible:ring-emerald-100 text-xs" value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="all">ทุก target</option>{(data?.filters.targetTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
                </label>
                <label className="text-xs text-slate-500 font-semibold">
                  หมวดหมู่
                  <Select className="mt-1 w-full h-9 border-slate-300 focus-visible:ring-emerald-100 text-xs" value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="all">ทุกหมวด</option>
                    {(data?.filters.categories ?? []).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </Select>
                </label>
                <label className="text-xs text-slate-500 font-semibold">
                  สถานะ
                  <Select className="mt-1 w-full h-9 border-slate-300 focus-visible:ring-emerald-100 text-xs" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="approved">Approved</option>
                    <option value="reversed">Reversed</option>
                    <option value="all">ทั้งหมด</option>
                  </Select>
                </label>
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors focus-visible:outline-none"
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setCategory('all')
                    setFromDate('')
                    setSearch('')
                    setStatus('approved')
                    setTargetType('all')
                    setToDate('')
                  }}
                >
                  ล้างตัวกรอง
                </Button>
              </div>
            </div>
          )}
        </div>
      </DualCostingFilterCard>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 text-sm text-slate-600">
        <div>พบทั้งหมด {sortedRows.length.toLocaleString('th-TH')} รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {ledgerResize.hasCustomWidths ? <Button className="hidden lg:inline-flex" size="sm" type="button" variant="outline" onClick={ledgerResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <Select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto px-2 py-1"
            disabled={isLoading}
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof pageSizeOptions)[number])
              setPage(1)
            }}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option} / หน้า</option>
            ))}
          </Select>
          <Button disabled={safePage <= 1 || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {safePage} / {totalPages}</span>
          <Button disabled={safePage >= totalPages || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden overflow-x-auto lg:block">
        <Table className="text-sm" style={{ minWidth: ledgerResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {ledgerColumns.map((column) => (
              <col key={column.key} style={ledgerResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <TableHeader className="bg-slate-100">
            <tr>
              {ledgerColumns.map((column) => (
                <ResizableTableHead
                  key={column.key}
                  activeSortKey={sortKey ?? undefined}
                  align={column.align}
                  direction={sortDirection}
                  label={column.label}
                  sortKey={column.key}
                  onSort={handleLedgerSort}
                  resizeProps={ledgerResize.getResizeHandleProps(column.key, column.label)}
                />
              ))}
            </tr>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={ledgerColumns.length}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={ledgerColumns.length}>ยังไม่มีรายการ</TableCell></TableRow> : null}
            {visibleRows.map((row) => (
              <TableRow key={row.id} className={`hover:bg-indigo-50/30 ${row.status === 'reversed' ? 'opacity-50' : ''}`}>
                <TableCell className="p-2 font-mono text-xs text-slate-700"><span className="block truncate" title={row.matchId}>{row.matchId}</span></TableCell>
                <TableCell className="p-2 text-center"><TargetPill type={row.targetType} /></TableCell>
                <TableCell className="p-2 font-mono text-xs text-slate-700"><span className="block truncate" title={row.saleDocNo}>{row.saleDocNo}</span></TableCell>
                <TableCell className="p-2 text-sm text-slate-800"><span className="block truncate" title={row.productName}>{row.productName}</span></TableCell>
                <TableCell className="p-2 text-center"><span className="whitespace-nowrap text-xs font-semibold text-slate-600">{row.productCategory}</span></TableCell>
                <TableCell className="p-2 text-right font-mono text-slate-700">{formatMoney(row.saleQty)}</TableCell>
                <TableCell className="p-2 text-right font-mono font-medium text-blue-700">{formatMoney(row.allocatedQty)}</TableCell>
                <TableCell className="p-2 font-mono text-xs text-slate-600"><span className="block truncate" title={row.costPoolNo}>{row.costPoolNo}</span></TableCell>
                <TableCell className="p-2 text-right font-mono text-slate-700">{formatMoney(row.costPerKg)}</TableCell>
                <TableCell className="p-2 text-right font-mono text-red-700">{formatMoney(row.totalCost)}</TableCell>
                <TableCell className="p-2 text-right font-mono text-emerald-700">{formatMoney(row.allocatedRevenue)}</TableCell>
                <TableCell className={`p-2 text-right font-mono font-bold ${row.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.grossProfit)}</TableCell>
                <TableCell className="p-2 text-right font-mono text-xs text-slate-700">{row.gpPct.toFixed(2)}%</TableCell>
                <TableCell className="p-2 text-xs text-slate-700"><span className="block truncate" title={row.allocatedBy}>{row.allocatedBy}</span></TableCell>
                <TableCell className="p-2 text-center"><LedgerStatusText status={row.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>



      {/* Mobile Card List */}
      <div className="block space-y-3 p-3 lg:hidden">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && (data?.rows.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">ไม่มี allocation log ตรงกับ filter</div>
        ) : null}
        {!isLoading && visibleRows.map((row) => (
          <div key={row.id} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 ${row.status === 'reversed' ? 'opacity-50' : ''}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-mono text-xs font-bold text-slate-800">{row.matchId}</div>
                <div className="text-xs text-slate-500 mt-0.5">Sale Doc: <span className="font-mono">{row.saleDocNo}</span></div>
              </div>
              <div className="flex gap-1.5 items-center">
                <TargetPill type={row.targetType} />
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${row.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : 'bg-slate-100 text-slate-600 border border-slate-200/50'}`}>{row.status}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-600">{row.productName}</div>
              <div className="mt-1 flex gap-1">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{row.productCategory}</span>
                <span className="rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs font-mono">Pool: {row.costPoolNo}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">Sale / Allocated Qty</span>
                <span className="font-mono text-slate-700">{formatMoney(row.saleQty)} / <span className="text-blue-700 font-semibold">{formatMoney(row.allocatedQty)}</span> กก.</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">ต้นทุน (฿/กก.)</span>
                <span className="font-mono text-slate-700">{formatMoney(row.totalCost)} (<span className="text-slate-600">{formatMoney(row.costPerKg)}</span>)</span>
              </div>
              <div>
                <span className="text-slate-500 block">Revenue</span>
                <span className="font-mono font-semibold text-emerald-700">{formatMoney(row.allocatedRevenue)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">GP (GP%)</span>
                <span className={`font-mono font-bold ${row.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.grossProfit)} ({row.gpPct.toFixed(2)}%)</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-100/50 flex justify-between text-xs text-slate-500">
              <span>โดย {row.allocatedBy}</span>
              <span>{row.allocatedAt ? formatDateDisplay(row.allocatedAt) : ''}</span>
            </div>
          </div>
        ))}
      </div>
      </div>

    </DualCostingPageSection>
  )
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getWaitingSummarySortValue(row: WaitingSummaryRow, key: WaitingSummaryColumnKey): string | number {
  return row[key] ?? ''
}

function getLedgerSortValue(row: LedgerRow, key: LedgerColumnKey): string | number {
  return row[key] ?? ''
}

function getReportSortValue(row: ReportCategoryRow, key: ReportColumnKey): string | number {
  return row[key] ?? ''
}

function DualCostingReportView() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sortKey, setSortKey] = useState<ReportColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const reportResize = useResizableColumns('dual-costing.report.by-category.v1', reportColumns)

  useEffect(() => {
    let mounted = true
    async function loadData() {
      setError(null)
      setIsLoading(true)
      try {
        const payload = await dailyFetchJson<ReportPayload>('/api/dual-costing/report')
        if (mounted) setData(payload)
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : 'โหลด Dual Costing Report ไม่ได้')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadData()
    return () => { mounted = false }
  }, [])

  const report = data?.report
  const reportRows = useMemo(() => report?.byCategory ?? [], [report?.byCategory])
  const sortedReportRows = useMemo(() => {
    if (!sortKey) return reportRows

    return [...reportRows].sort((left, right) => {
      const result = compareSortValues(getReportSortValue(left, sortKey), getReportSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [reportRows, sortDirection, sortKey])

  function handleReportSort(key: ReportColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="emerald">
        รายงานนี้ใช้ Deal Cost เพื่อให้ผู้บริหารดูกำไรต่อดีล/ลอตที่ allocate เท่านั้น ไม่ใช้ปิดงบ และ P&L ยังใช้ WAC ตามหลักบัญชี
      </DualCostingHint>
      <DualCostingErrorBox error={error} />
      {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล...</div> : null}
      
      {!isLoading && report ? (
        <>
          <div className="grid grid-cols-2 gap-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 p-5 text-white shadow-lg border border-emerald-500/20 md:grid-cols-4">
            <HeroMetric label="Total Revenue (Allocated)" value={formatMoney((report?.po.revenue ?? 0) + (report?.spotAllocated.revenue ?? 0))} />
            <HeroMetric label="Total Cost (Deal Cost)" value={formatMoney(report?.total.cost ?? 0)} />
            <HeroMetric label="Gross Profit" value={formatMoney(report?.total.gp ?? 0)} />
            <HeroMetric label="GP%" value={`${(report?.total.gpPct ?? 0).toFixed(2)}%`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ReportCard metric={report?.po} title="ขายผ่าน PO Sell" />
            <ReportCard metric={report?.spotAllocated} title="ขาย Spot Sell (Allocated)" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <DualCostingStatCard icon="⏳" label="รายการค้าง" tone="amber" value={String(report?.waiting.count ?? 0)} />
            <DualCostingStatCard icon="⚖️" label="น้ำหนักค้าง" tone="amber" value={`${formatMoney(report?.waiting.qty ?? 0)} กก.`} />
            <DualCostingStatCard icon="💰" label="มูลค่าขายค้าง" tone="emerald" value={formatMoney(report?.waiting.revenue ?? 0)} />
          </div>
          <DualCostingPanel title="สรุปตามหมวดสินค้า">
            {/* Desktop View */}
            <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
              {reportResize.hasCustomWidths ? (
                <div className="flex justify-end border-b border-slate-100 px-3 py-3">
                  <Button size="sm" type="button" variant="outline" onClick={reportResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button>
                </div>
              ) : null}
              <div className="overflow-x-auto">
              <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: reportResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {reportColumns.map((column, index) => {
                    if (index === reportColumns.length - 1) {
                      return <col key={column.key} style={{ minWidth: column.minWidth }} />
                    }
                    return <col key={column.key} style={reportResize.getColumnStyle(column.key)} />
                  })}
                </colgroup>
                <TableHeader className="bg-slate-100">
                  <tr>
                    {reportColumns.map((column) => (
                      <ResizableTableHead
                        key={column.key}
                        activeSortKey={sortKey ?? undefined}
                        align={column.align}
                        direction={sortDirection}
                        label={column.label}
                        sortKey={column.key}
                        onSort={handleReportSort}
                        resizeProps={reportResize.getResizeHandleProps(column.key, column.label)}
                      />
                    ))}
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {sortedReportRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={reportColumns.length}>ยังไม่มีข้อมูลสรุปตามหมวดสินค้า</TableCell></TableRow> : null}
                  {sortedReportRows.map((row) => (
                    <TableRow key={row.category} className="transition-colors hover:bg-slate-50">
                      <TableCell className="px-3 py-3"><span className="block truncate rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800" title={row.category}>{row.category}</span></TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.allocatedQty)}</TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-blue-700">{formatMoney(row.revenue)}</TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-red-600">{formatMoney(row.cost)}</TableCell>
                      <TableCell className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{row.gpPct.toFixed(2)}%</TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-amber-700">{formatMoney(row.pendingQty)}</TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-amber-700">{formatMoney(row.pendingRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>

            {/* Mobile View */}
            <div className="block lg:hidden space-y-3">
              {sortedReportRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-400 shadow-sm">ยังไม่มีข้อมูลสรุปตามหมวดสินค้า</div>
              ) : null}
              {sortedReportRows.map((row) => (
                <div key={row.category} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">{row.category}</span>
                    <span className="text-xs text-slate-500 font-semibold">พบ {row.rows} รายการ</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block">Allocated Qty</span>
                      <span className="font-mono text-slate-700">{formatMoney(row.allocatedQty)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">Revenue</span>
                      <span className="font-mono text-blue-700 font-semibold">{formatMoney(row.revenue)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Cost</span>
                      <span className="font-mono text-red-600">{formatMoney(row.cost)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">GP (GP%)</span>
                      <span className={`font-mono font-bold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.gp)} ({row.gpPct.toFixed(2)}%)</span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 col-span-2 grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 block">Pending Qty</span>
                        <span className="font-mono text-amber-700">{formatMoney(row.pendingQty)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block">Pending Revenue</span>
                        <span className="font-mono text-amber-700 font-semibold">{formatMoney(row.pendingRevenue)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DualCostingPanel>
        </>
      ) : null}
    </DualCostingPageSection>
  )
}

function StatusPill({ status }: { status: string }) {
  return status === 'pending_allocation'
    ? <span className="rounded border border-red-200/50 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">pending</span>
    : <span className="rounded border border-amber-200/50 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">partial</span>
}

function LedgerStatusText({ status }: { status: string }) {
  const active = status === 'approved'
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${active ? 'text-emerald-700' : 'text-slate-600'}`}>
      <span className={`size-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {status}
    </span>
  )
}

function TargetPill({ type }: { type: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold ${type === 'PO_SELL' ? 'bg-blue-50 text-blue-700 border-blue-200/50' : 'bg-purple-50 text-purple-700 border-purple-200/50'}`}>{type === 'PO_SELL' ? 'PO' : 'Spot'}</span>
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-white/80">{label}</div><div className="mt-1 text-lg font-bold">{value}</div></div>
}

function ReportCard({ metric, title }: { metric?: ReportMetric; title: string }) {
  return (
    <DualCostingPanel title={title}>
      <div className="grid grid-cols-2 gap-3">
        <DualCostingStatCard icon="📊" label="จำนวนรายการ" tone="slate" value={String(metric?.count ?? 0)} />
        <DualCostingStatCard icon="⚖️" label="น้ำหนัก" tone="blue" value={formatMoney(metric?.qty ?? 0)} />
        <DualCostingStatCard icon="💰" label="Revenue" tone="emerald" value={formatMoney(metric?.revenue ?? 0)} />
        <DualCostingStatCard icon="💳" label="Cost" tone="red" value={formatMoney(metric?.cost ?? 0)} />
        <DualCostingStatCard icon="📈" label="GP" tone={(metric?.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(metric?.gp ?? 0)} />
        <DualCostingStatCard icon="📈" label="GP%" tone="slate" value={`${(metric?.gpPct ?? 0).toFixed(2)}%`} />
      </div>
    </DualCostingPanel>
  )
}
