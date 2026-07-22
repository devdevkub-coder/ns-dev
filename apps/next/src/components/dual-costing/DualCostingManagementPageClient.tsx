'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { Select } from '@/components/ui/Select'
import { SegmentedFilterButton } from '@/components/ui/SegmentedFilterButton'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import {
  DualCostingCountRow,
  DualCostingErrorBox,
  DualCostingFilterCard,
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
  dealId: string
  gpPct: number
  grossProfit: number
  id: string
  matchId: string
  productCategory: string
  productId: string
  productName: string
  saleDocNo: string
  saleQty: number
  sourceNo: string
  status: string
  targetGroupKey: string
  targetSourceType: 'po-sell' | 'spot-sell'
  targetType: string
  totalCost: number
}

type LedgerColumnKey = 'action' | 'allocatedBy' | 'allocatedQty' | 'costPerKg' | 'costPoolNo' | 'gpPct' | 'grossProfit' | 'matchId' | 'productCategory' | 'productName' | 'saleDocNo' | 'saleQty' | 'allocatedRevenue' | 'status' | 'targetType' | 'totalCost'

type TabPayload = {
  rows: WaitingRow[]
  count: number
}

type WaitingPayload = {
  filters: { categories: string[]; statuses: string[] }
  po: TabPayload
  bill: TabPayload
  production: TabPayload
  summary: { byCategory: { count: number; name: string; partial: number; qty: number; revenue: number }[]; count: number; fullyPending: number; partial: number; totalQty: number; totalRevenue: number }
}

type LedgerPayload = {
  filters: { categories: string[]; statuses: string[]; targetTypes: string[] }
  rows: LedgerRow[]
  summary: { active: number; cost: number; gp: number; gpPct: number; poCount: number; revenue: number; reversed: number; rows: number; spotCount: number; totalQty: number }
}

type ReportPayload = {
  filters: {
    dateFrom: string
    dateTo: string
  }
  report: {
    byCategory: {
      allocatedQty: number
      category: string
      cost: number
      detail: {
        allocatedRows: {
          allocatedQty: number
          cost: number
          costPoolNo: string
          date: string
          gp: number
          gpPct: number
          matchId: string
          productName: string
          revenue: number
          saleDocNo: string
          sourceNo: string
          targetType: string
        }[]
        pendingRows: {
          customerName: string
          date: string
          docNo: string
          pendingQty: number
          pendingRevenue: number
          productName: string
          unitPrice: number
        }[]
      }
      gp: number
      gpPct: number
      pendingQty: number
      pendingRevenue: number
      revenue: number
      rows: number
    }[]
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
type WaitingSummaryColumnKey = 'count' | 'name' | 'partial' | 'qty' | 'revenue'

const waitingSummaryColumns: Array<ResizableColumnDefinition<WaitingSummaryColumnKey> & { align?: 'center' | 'left' | 'right'; label: string }> = [
  { key: 'name', label: 'หมวดสินค้า', defaultWidth: 180, minWidth: 140 },
  { key: 'count', label: 'รายการรอจัดสรร', defaultWidth: 130, minWidth: 110, align: 'right' },
  { key: 'partial', label: 'บางส่วน', defaultWidth: 100, minWidth: 90, align: 'right' },
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

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthStart() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

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

  const poColumns = useMemo<Array<ResizableColumnDefinition<string> & { label: string; align?: 'left' | 'right' | 'center'; className?: string }>>(() => [
    { key: 'docNo', label: 'PO ขาย', defaultWidth: 140, className: 'ns-table-textual-column' },
    { key: 'date', label: 'วันที่', defaultWidth: 100, className: 'ns-table-textual-column' },
    { key: 'customerName', label: 'ลูกค้า', defaultWidth: 180, className: 'ns-table-textual-column' },
    { key: 'productName', label: 'สินค้า', defaultWidth: 220, className: 'ns-table-textual-column' },
    { key: 'metalGroup', label: 'หมวด', defaultWidth: 90, className: 'ns-table-textual-column' },
    { key: 'qty', label: 'ขาย (กก.)', defaultWidth: 110, align: 'right' },
    { key: 'allocatedQty', label: 'จัดสรรแล้ว', defaultWidth: 110, align: 'right' },
    { key: 'remainingQty', label: 'รอจัดสรร (กก.)', defaultWidth: 115, align: 'right' },
    { key: 'unitPrice', label: 'ราคา/กก.', defaultWidth: 100, align: 'right' },
    { key: 'revenuePending', label: 'มูลค่ารอจัดสรร', defaultWidth: 120, align: 'right' },
    { key: 'allocationStatus', label: 'สถานะ', defaultWidth: 90, className: 'ns-table-textual-column' },
    { key: 'action', label: 'จัดการ', defaultWidth: 72, minWidth: 64, maxWidth: 88, align: 'right' },
  ], [])

  const billColumns = useMemo<Array<ResizableColumnDefinition<string> & { label: string; align?: 'left' | 'right' | 'center'; className?: string }>>(() => [
    { key: 'docNo', label: 'บิลขาย', defaultWidth: 140, className: 'ns-table-textual-column' },
    { key: 'date', label: 'วันที่', defaultWidth: 100, className: 'ns-table-textual-column' },
    { key: 'customerName', label: 'ลูกค้า', defaultWidth: 180, className: 'ns-table-textual-column' },
    { key: 'productName', label: 'สินค้า', defaultWidth: 220, className: 'ns-table-textual-column' },
    { key: 'metalGroup', label: 'หมวด', defaultWidth: 90, className: 'ns-table-textual-column' },
    { key: 'qty', label: 'ขาย (กก.)', defaultWidth: 110, align: 'right' },
    { key: 'allocatedQty', label: 'จัดสรรแล้ว', defaultWidth: 110, align: 'right' },
    { key: 'remainingQty', label: 'รอจัดสรร (กก.)', defaultWidth: 115, align: 'right' },
    { key: 'unitPrice', label: 'ราคา/กก.', defaultWidth: 100, align: 'right' },
    { key: 'revenuePending', label: 'มูลค่ารอจัดสรร', defaultWidth: 120, align: 'right' },
    { key: 'allocationStatus', label: 'สถานะ', defaultWidth: 90, className: 'ns-table-textual-column' },
    { key: 'action', label: 'จัดการ', defaultWidth: 72, minWidth: 64, maxWidth: 88, align: 'right' },
  ], [])

  const productionColumns = useMemo<Array<ResizableColumnDefinition<string> & { label: string; align?: 'left' | 'right' | 'center'; className?: string }>>(() => [
    { key: 'docNo', label: 'ใบสั่งผลิต', defaultWidth: 140, className: 'ns-table-textual-column' },
    { key: 'date', label: 'วันที่เบิกวัตถุดิบ', defaultWidth: 120, className: 'ns-table-textual-column' },
    { key: 'customerName', label: 'ผู้ผลิต', defaultWidth: 180, className: 'ns-table-textual-column' },
    { key: 'productName', label: 'สินค้า', defaultWidth: 220, className: 'ns-table-textual-column' },
    { key: 'metalGroup', label: 'หมวด', defaultWidth: 90, className: 'ns-table-textual-column' },
    { key: 'qty', label: 'ผลิต (กก.)', defaultWidth: 110, align: 'right' },
    { key: 'allocatedQty', label: 'จัดสรรแล้ว', defaultWidth: 110, align: 'right' },
    { key: 'remainingQty', label: 'รอจัดสรร (กก.)', defaultWidth: 115, align: 'right' },
    { key: 'unitPrice', label: 'ต้นทุน/กก.', defaultWidth: 100, align: 'right' },
    { key: 'revenuePending', label: 'มูลค่ารอจัดสรร', defaultWidth: 120, align: 'right' },
    { key: 'allocationStatus', label: 'สถานะ', defaultWidth: 90, className: 'ns-table-textual-column' },
    { key: 'action', label: 'จัดการ', defaultWidth: 72, minWidth: 64, maxWidth: 88, align: 'right' },
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

      <DualCostingPanel
        title="สรุปตามหมวด"
        titleAction={summaryResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={summaryResize.resetColumnWidths}>คืนค่าเดิมตารางสรุป</Button> : null}
      >
        {/* Desktop View */}
        <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
          <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: summaryResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {waitingSummaryColumns.map((column) => (
                <col key={column.key} style={summaryResize.getColumnStyle(column.key)} />
              ))}
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
                  <TableCell className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{row.partial}</TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-800">{formatMoney(row.qty)} กก.</TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-emerald-700">{formatMoney(row.revenue)}</TableCell>
                </TableRow>
              ))}
              {!isLoading && summaryRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={waitingSummaryColumns.length}>ไม่มีรายการรอ allocate ตามตัวกรอง</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-3">
          {sortedSummaryRows.map((row) => (
            <div key={row.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{row.name}</span>
                <span className="text-xs text-slate-500 font-semibold">{row.count} รายการ</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block">บางส่วน</span>
                  <span className="font-mono font-bold text-slate-800">{row.partial}</span>
                </div>
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

      <Tabs
        className="gap-0"
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as typeof activeTab)
          setSortKey('date')
          setSortDirection('desc')
        }}
      >
        <TabsList className="w-full flex-nowrap overflow-x-auto" variant="line">
          <TabsTrigger value="po" variant="line">
            PO ขาย <span className="ml-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{data?.po.count ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="bill" variant="line">
            บิลขาย <span className="ml-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{data?.bill.count ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="production" variant="line">
            การผลิต <span className="ml-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{data?.production.count ?? 0}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <DualCostingFilterCard>
        {/* Desktop View */}
        <div className="hidden lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="min-w-[240px] flex-1 rounded-md border-slate-300 focus-visible:ring-emerald-100" placeholder="ค้นหา doc no / สินค้า / ลูกค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select className="h-9 w-auto min-w-[160px] border-slate-300" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <div aria-label="กรองสถานะรายการรอจัดสรร" className="flex flex-wrap items-center gap-2" role="group">
              <span className="text-xs text-slate-500">สถานะ:</span>
              {['all', ...(data?.filters.statuses ?? [])].map((item) => (
                <SegmentedFilterButton active={status === item} key={item} type="button" onClick={() => setStatus(item)}>
                  {item === 'all' ? 'ทุกสถานะ' : waitingStatusLabel(item)}
                </SegmentedFilterButton>
              ))}
            </div>
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
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
                showMobileFilters ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              ตัวกรอง
            </button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">สถานะ</span>
                <div aria-label="กรองสถานะรายการรอจัดสรร" className="flex flex-wrap gap-2" role="group">
                  {['all', ...(data?.filters.statuses ?? [])].map((item) => (
                    <SegmentedFilterButton active={status === item} key={item} type="button" onClick={() => setStatus(item)}>
                      {item === 'all' ? 'ทุกสถานะ' : waitingStatusLabel(item)}
                    </SegmentedFilterButton>
                  ))}
                </div>
              </div>
              <label className="text-xs text-slate-500 font-semibold">
                หมวดสินค้า
                <Select className="mt-1 h-9 w-full border-slate-300 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
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
        <table className="ns-table w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
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
                  className={col.className}
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
                  <td className="ns-table-textual-column p-3 pl-4 font-mono text-slate-700 whitespace-nowrap">{row.docNo}</td>
                  <td className="ns-table-textual-column p-3 whitespace-nowrap text-slate-600">{formatDateDisplay(row.date)}</td>
                  <td className="ns-table-textual-column p-3 text-slate-800 font-medium min-w-0 overflow-hidden"><div className="truncate" title={row.customerName === '-' ? 'ภายในโรงงาน' : row.customerName}>{row.customerName === '-' ? 'ภายในโรงงาน' : row.customerName}</div></td>
                  <td className="ns-table-textual-column p-3 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.productName || ''}>{row.productName}</div></td>
                  <td className="ns-table-textual-column p-3 text-left whitespace-nowrap">
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {row.metalGroup}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.qty)}</td>
                  <td className="p-3 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.allocatedQty)}</td>
                  <td className="p-3 text-right font-mono font-bold text-amber-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.remainingQty)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.unitPrice)}</td>
                  <td className="p-3 text-right font-mono text-emerald-700 font-medium whitespace-nowrap tabular-nums pl-4">{formatMoney(row.revenuePending)}</td>
                  <td className="ns-table-textual-column p-3 text-left">
                    <StatusPill status={row.allocationStatus} />
                  </td>
                  <td className="p-3 pr-4 text-right">
                    <Button asChild size="xs" type="button" className="rounded-md font-semibold focus-visible:ring-2 focus-visible:ring-emerald-100">
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
                  <span className="text-slate-500 block">ขาย / จัดสรรแล้ว</span>
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
                <Button asChild size="sm" type="button" className="w-full rounded-md font-semibold focus-visible:ring-2 focus-visible:ring-emerald-100">
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
  const [actionTargetId, setActionTargetId] = useState<string | null>(null)
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<LedgerPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null)
  const [status, setStatus] = useState('approved')
  const [targetType, setTargetType] = useState('all')
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Pagination states
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(50)
  const [sortKey, setSortKey] = useState<LedgerColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const ledgerColumns = useMemo<Array<ResizableColumnDefinition<LedgerColumnKey> & { align?: 'center' | 'left' | 'right'; className?: string; label: string }>>(() => [
    { key: 'matchId', label: 'เลขที่การจับคู่', defaultWidth: 190, minWidth: 160, className: 'ns-table-textual-column' },
    { key: 'targetType', label: 'ประเภท', defaultWidth: 88, minWidth: 78, className: 'ns-table-textual-column' },
    { key: 'saleDocNo', label: 'เอกสารขาย', defaultWidth: 130, minWidth: 120, className: 'ns-table-textual-column' },
    { key: 'productName', label: 'สินค้า', defaultWidth: 230, minWidth: 180, className: 'ns-table-textual-column' },
    { key: 'productCategory', label: 'หมวด', defaultWidth: 110, minWidth: 95, className: 'ns-table-textual-column' },
    { key: 'saleQty', label: 'จำนวนขาย', defaultWidth: 115, minWidth: 105, align: 'right' },
    { key: 'allocatedQty', label: 'จัดสรรแล้ว', defaultWidth: 115, minWidth: 105, align: 'right' },
    { key: 'costPoolNo', label: 'กลุ่มต้นทุน', defaultWidth: 145, minWidth: 130, className: 'ns-table-textual-column' },
    { key: 'costPerKg', label: 'ต้นทุน บาท/กก.', defaultWidth: 130, minWidth: 120, align: 'right' },
    { key: 'totalCost', label: 'ต้นทุนรวม', defaultWidth: 125, minWidth: 110, align: 'right' },
    { key: 'allocatedRevenue', label: 'รายได้', defaultWidth: 125, minWidth: 110, align: 'right' },
    { key: 'grossProfit', label: 'GP', defaultWidth: 115, minWidth: 100, align: 'right' },
    { key: 'gpPct', label: 'GP%', defaultWidth: 80, minWidth: 70, align: 'right' },
    { key: 'allocatedBy', label: 'ผู้จัดสรร', defaultWidth: 135, minWidth: 115, className: 'ns-table-textual-column' },
    { key: 'status', label: 'สถานะ', defaultWidth: 115, minWidth: 100, className: 'ns-table-textual-column' },
    { key: 'action', label: 'จัดการ', defaultWidth: 72, minWidth: 64, maxWidth: 88, align: 'center' },
  ], [])
  const ledgerResize = useResizableColumns('dual-costing.allocation-ledger.v1', ledgerColumns)

  useEffect(() => {
    setPage(1)
  }, [category, fromDate, pageSize, search, status, targetType, toDate])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const rowsByTarget = useMemo(() => {
    const grouped = new Map<string, LedgerRow[]>()
    rows.forEach((row) => {
      const targetRows = grouped.get(row.targetGroupKey) ?? []
      targetRows.push(row)
      grouped.set(row.targetGroupKey, targetRows)
    })
    return grouped
  }, [rows])
  const selectedDetailRows = selectedDetailKey ? rowsByTarget.get(selectedDetailKey) ?? [] : []
  const selectedDetailRow = selectedDetailRows[0] ?? null
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
  const exportHref = useMemo(() => `/api/dual-costing/cost-allocation-ledger?${queryString ? `${queryString}&` : ''}format=xlsx`, [queryString])

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

  async function handleReverse(row: LedgerRow, editAfterReverse: boolean) {
    const message = editAfterReverse
      ? 'แก้ไขข้อมูลรายการนี้หรือไม่? ระบบจะคืนต้นทุนเดิมกลับ Cost Pool แล้วเปิดหน้าจัดสรรต้นทุนใหม่'
      : 'ยกเลิกการจัดสรรรายการนี้หรือไม่? ระบบจะคืนต้นทุนกลับ Cost Pool และเก็บรายการไว้ในสถานะย้อนกลับแล้ว'
    if (!window.confirm(message)) return

    setActionTargetId(row.dealId)
    setError(null)
    try {
      await dailyFetchJson<{ success: boolean }>(
        '/api/dual-costing/cost-allocation-ledger/reverse',
        {
          body: JSON.stringify({
            dealId: row.dealId,
            reason: editAfterReverse ? 'edit_reallocation_from_ledger' : 'cancel_allocation_from_ledger',
          }),
          method: 'POST',
        },
      )
      if (editAfterReverse) {
        window.location.assign(buildLedgerAllocatorHref(row))
        return
      }
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ดำเนินการกับ Allocation Ledger ไม่สำเร็จ')
    } finally {
      setActionTargetId(null)
    }
  }

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

      <DualCostingFilterCard>
        {/* Desktop View */}
        <div className="hidden xl:block">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 min-w-[260px] flex-1 rounded-md border-slate-300 focus-visible:ring-emerald-100" placeholder="ค้นหา match id / doc / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <span className="text-xs text-slate-500 font-semibold">วันที่:</span>
            <DatePickerInput id="allocation-ledger-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="allocation-ledger-to" value={toDate} onChange={setToDate} />
            <Select className="h-9 w-auto min-w-[130px] border-slate-300" value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="all">ทุกประเภทเป้าหมาย</option>{(data?.filters.targetTypes ?? []).map((item) => <option key={item} value={item}>{targetTypeLabel(item)}</option>)}</Select>
            <Select className="h-9 w-auto min-w-[130px] border-slate-300" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <div aria-label="กรองสถานะรายการจัดสรร" className="flex flex-wrap items-center gap-2" role="group">
              <span className="text-xs text-slate-500">สถานะ:</span>
              {[{ label: 'ทั้งหมด', value: 'all' }, { label: 'อนุมัติแล้ว', value: 'approved' }, { label: 'ย้อนกลับแล้ว', value: 'reversed' }].map((item) => (
                <SegmentedFilterButton active={status === item.value} key={item.value} type="button" onClick={() => setStatus(item.value)}>{item.label}</SegmentedFilterButton>
              ))}
            </div>
            <Button
              className="ml-auto h-9 rounded-md px-3 text-sm font-normal focus-visible:ring-slate-100"
              disabled={isLoading || sortedRows.length === 0}
              size="sm"
              type="button"
              variant="export"
              onClick={() => window.location.assign(exportHref)}
            >
              ส่งออก Excel
            </Button>
          </div>
        </div>

        {/* Mobile / Tablet View */}
        <div className="block xl:hidden space-y-2">
          <div className="flex gap-2">
            <Input className="h-9 flex-1 rounded-md border-slate-300 text-sm focus-visible:ring-emerald-100" placeholder="ค้นหา match id / doc / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
                showMobileFilters ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
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
                  ประเภทเป้าหมาย
                  <Select className="mt-1 h-9 w-full border-slate-300 text-xs" value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="all">ทุกประเภทเป้าหมาย</option>{(data?.filters.targetTypes ?? []).map((item) => <option key={item} value={item}>{targetTypeLabel(item)}</option>)}</Select>
                </label>
                <label className="text-xs text-slate-500 font-semibold">
                  หมวดหมู่
                  <Select className="mt-1 h-9 w-full border-slate-300 text-xs" value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="all">ทุกหมวด</option>
                    {(data?.filters.categories ?? []).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </Select>
                </label>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">สถานะ</span>
                  <div aria-label="กรองสถานะรายการจัดสรร" className="flex flex-wrap gap-2" role="group">
                    {[{ label: 'ทั้งหมด', value: 'all' }, { label: 'อนุมัติแล้ว', value: 'approved' }, { label: 'ย้อนกลับแล้ว', value: 'reversed' }].map((item) => (
                      <SegmentedFilterButton active={status === item.value} key={item.value} type="button" onClick={() => setStatus(item.value)}>{item.label}</SegmentedFilterButton>
                    ))}
                  </div>
                </div>
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
          <PageSizeDropdown disabled={isLoading} options={pageSizeOptions} value={pageSize} onChange={(size) => {
            setPageSize(size as (typeof pageSizeOptions)[number])
            setPage(1)
          }} />
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
                  className={column.className}
                  direction={sortDirection}
                  label={column.label}
                  sortKey={column.key === 'action' ? undefined : column.key}
                  onSort={column.key === 'action' ? undefined : handleLedgerSort}
                  resizeProps={ledgerResize.getResizeHandleProps(column.key, column.label)}
                />
              ))}
            </tr>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={ledgerColumns.length}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={ledgerColumns.length}>ยังไม่มีรายการ</TableCell></TableRow> : null}
            {visibleRows.map((row) => (
              <TableRow
                key={row.id}
                className={`cursor-pointer hover:bg-indigo-50/50 ${row.status === 'reversed' ? 'opacity-50' : ''}`}
                onClick={() => setSelectedDetailKey(row.targetGroupKey)}
              >
                <TableCell className="ns-table-textual-column p-3 font-mono text-xs text-slate-700"><span className="block truncate" title={row.matchId}>{row.matchId}</span></TableCell>
                <TableCell className="ns-table-textual-column p-3 text-left"><TargetPill type={row.targetType} /></TableCell>
                <TableCell className="ns-table-textual-column p-3 text-left font-mono text-xs text-slate-700"><span className="block truncate" title={row.saleDocNo}>{row.saleDocNo}</span></TableCell>
                <TableCell className="ns-table-textual-column p-3 text-left text-sm text-slate-800"><span className="block truncate" title={row.productName}>{row.productName}</span></TableCell>
                <TableCell className="ns-table-textual-column p-3 text-left"><span className="whitespace-nowrap text-xs font-semibold text-slate-600">{row.productCategory}</span></TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.saleQty)}</TableCell>
                <TableCell className="p-3 text-right font-mono font-medium">
                  <button className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900" type="button" onClick={() => setSelectedDetailKey(row.targetGroupKey)}>
                    {formatMoney(row.allocatedQty)}
                  </button>
                </TableCell>
                <TableCell className="ns-table-textual-column p-3 text-left font-mono text-xs text-slate-600"><span className="block truncate" title={row.costPoolNo}>{row.costPoolNo}</span></TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.costPerKg)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-red-700">{formatMoney(row.totalCost)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-emerald-700">{formatMoney(row.allocatedRevenue)}</TableCell>
                <TableCell className={`p-3 text-right font-mono font-bold ${row.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.grossProfit)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-xs text-slate-700">{row.gpPct.toFixed(2)}%</TableCell>
                <TableCell className="ns-table-textual-column p-3 text-xs text-slate-700"><span className="block truncate" title={row.allocatedBy}>{row.allocatedBy}</span></TableCell>
                <TableCell className="ns-table-textual-column p-3 text-left"><LedgerStatusText status={row.status} /></TableCell>
                <TableCell className="p-3 text-center" onClick={(event) => event.stopPropagation()}>
                  <LedgerActionMenu
                    busy={actionTargetId === row.dealId}
                    disabled={row.status !== 'approved'}
                    onCancel={() => void handleReverse(row, false)}
                    onEdit={() => void handleReverse(row, true)}
                  />
                </TableCell>
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
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">ไม่มีบันทึกการจัดสรรตรงกับตัวกรอง</div>
        ) : null}
        {!isLoading && visibleRows.map((row) => (
          <div
            key={row.id}
            className={`cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 ${row.status === 'reversed' ? 'opacity-50' : ''}`}
            onClick={() => setSelectedDetailKey(row.targetGroupKey)}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-mono text-xs font-bold text-slate-800">{row.matchId}</div>
                <div className="text-xs text-slate-500 mt-0.5">เอกสารขาย: <span className="font-mono">{row.saleDocNo}</span></div>
              </div>
              <div className="flex gap-1.5 items-center">
                <TargetPill type={row.targetType} />
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${row.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : 'bg-slate-100 text-slate-600 border border-slate-200/50'}`}>{ledgerStatusLabel(row.status)}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-600">{row.productName}</div>
              <div className="mt-1 flex gap-1">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{row.productCategory}</span>
                <span className="rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs font-mono">กลุ่มต้นทุน: {row.costPoolNo}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">จำนวนขาย / จัดสรรแล้ว</span>
                <span className="font-mono text-slate-700">{formatMoney(row.saleQty)} / <button className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2" type="button" onClick={() => setSelectedDetailKey(row.targetGroupKey)}>{formatMoney(row.allocatedQty)}</button> กก.</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">ต้นทุน (฿/กก.)</span>
                <span className="font-mono text-slate-700">{formatMoney(row.totalCost)} (<span className="text-slate-600">{formatMoney(row.costPerKg)}</span>)</span>
              </div>
              <div>
                <span className="text-slate-500 block">รายได้</span>
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
            <div className="border-t border-slate-100 pt-3" onClick={(event) => event.stopPropagation()}>
              <LedgerActionMenu
                busy={actionTargetId === row.dealId}
                disabled={row.status !== 'approved'}
                mobileLabel
                onCancel={() => void handleReverse(row, false)}
                onEdit={() => void handleReverse(row, true)}
              />
            </div>
          </div>
        ))}
      </div>
      </div>

      <Dialog open={selectedDetailRow != null} onOpenChange={(open) => { if (!open) setSelectedDetailKey(null) }}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden border border-slate-200 bg-white p-0">
          {selectedDetailRow ? (
            <>
              <DialogHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4 pr-12 text-left">
                <DialogTitle>รายละเอียดต้นทุนที่จับคู่</DialogTitle>
                <DialogDescription>
                  {selectedDetailRow.saleDocNo} · {selectedDetailRow.productName} · {selectedDetailRows.length.toLocaleString('th-TH')} รายการต้นทุน
                </DialogDescription>
              </DialogHeader>
              <LedgerMatchedCostDetails rows={selectedDetailRows} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

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
  if (key === 'action') return ''
  return row[key] ?? ''
}

function getReportSortValue(row: ReportCategoryRow, key: ReportColumnKey): string | number {
  return row[key] ?? ''
}

function DualCostingReportView() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState(monthStart())
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<ReportCategoryRow | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortKey, setSortKey] = useState<ReportColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [toDate, setToDate] = useState(today())
  const reportResize = useResizableColumns('dual-costing.report.by-category.v1', reportColumns)
  const queryString = useMemo(() => new URLSearchParams({ from: fromDate, to: toDate }).toString(), [fromDate, toDate])
  const hasActiveFilters = fromDate !== monthStart() || toDate !== today()

  useEffect(() => {
    let mounted = true
    async function loadData() {
      setError(null)
      setIsLoading(true)
      try {
        const payload = await dailyFetchJson<ReportPayload>(`/api/dual-costing/report?${queryString}`)
        if (mounted) setData(payload)
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : 'โหลด Dual Costing Report ไม่ได้')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadData()
    return () => { mounted = false }
  }, [queryString])

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

  function clearFilters() {
    setFromDate(monthStart())
    setToDate(today())
  }

  return (
    <DualCostingPageSection>
      <DualCostingErrorBox error={error} />
      <Dialog open={selectedCategory != null} onOpenChange={(open) => { if (!open) setSelectedCategory(null) }}>
        <DialogContent className="max-h-[85vh] max-w-6xl overflow-hidden border border-slate-200 bg-white p-0">
          {selectedCategory ? (
            <>
              <DialogHeader>
                <DialogTitle>รายละเอียดหมวดสินค้า: {selectedCategory.category}</DialogTitle>
                <DialogDescription>
                  ดูที่มาของกำไร/ขาดทุนและรายการค้างจัดสรรในช่วงวันที่ {fromDate} → {toDate}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 overflow-y-auto bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <DualCostingStatCard icon="💰" label="รายได้" tone="emerald" value={formatMoney(selectedCategory.revenue)} />
                  <DualCostingStatCard icon="💳" label="ต้นทุน" tone="red" value={formatMoney(selectedCategory.cost)} />
                  <DualCostingStatCard icon="📈" label="กำไรขั้นต้น" tone={selectedCategory.gp >= 0 ? 'emerald' : 'red'} value={formatMoney(selectedCategory.gp)} />
                  <DualCostingStatCard icon="%" label="GP%" tone={selectedCategory.gp >= 0 ? 'emerald' : 'red'} value={`${selectedCategory.gpPct.toFixed(2)}%`} />
                </div>

                <DualCostingPanel title={`ชุดที่สร้างกำไร/ขาดทุน (${selectedCategory.detail.allocatedRows.length} รายการ)`}>
                  <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                    <Table className="min-w-[980px] text-sm">
                      <TableHeader className="bg-slate-100">
                        <tr>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">วันที่</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">Match ID</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">ประเภท</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">เอกสารขาย</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">ชุดต้นทุน</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">สินค้า</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">น้ำหนัก</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">รายได้</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">ต้นทุน</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">GP</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">GP%</TableCell>
                        </tr>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-100">
                        {selectedCategory.detail.allocatedRows.length === 0 ? (
                          <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={11}>ไม่มีรายการจัดสรรในหมวดนี้ตามช่วงวันที่</TableCell></TableRow>
                        ) : null}
                        {selectedCategory.detail.allocatedRows.map((row) => (
                          <TableRow key={`${row.matchId}-${row.saleDocNo}-${row.sourceNo}`}>
                            <TableCell className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDateDisplay(row.date)}</TableCell>
                            <TableCell className="px-3 py-2 font-mono text-xs text-slate-700">{row.matchId}</TableCell>
                            <TableCell className="px-3 py-2 text-slate-700">{row.targetType}</TableCell>
                            <TableCell className="px-3 py-2 font-mono text-xs text-slate-700">{row.saleDocNo}</TableCell>
                            <TableCell className="px-3 py-2">
                              <div className="font-mono text-xs text-slate-700">{row.costPoolNo}</div>
                              <div className="text-xs text-slate-500">{row.sourceNo}</div>
                            </TableCell>
                            <TableCell className="px-3 py-2 text-slate-700">{row.productName}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-slate-700">{formatMoney(row.allocatedQty)}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-emerald-700">{formatMoney(row.revenue)}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-red-600">{formatMoney(row.cost)}</TableCell>
                            <TableCell className={`px-3 py-2 text-right font-mono font-bold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-slate-700">{row.gpPct.toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DualCostingPanel>

                <DualCostingPanel title={`รายการค้างจัดสรร (${selectedCategory.detail.pendingRows.length} รายการ)`}>
                  <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                    <Table className="min-w-[760px] text-sm">
                      <TableHeader className="bg-slate-100">
                        <tr>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">วันที่</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">เอกสาร</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">ลูกค้า</TableCell>
                          <TableCell className="px-3 py-2 font-semibold text-slate-700">สินค้า</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">ค้างจัดสรร</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">ราคา/กก.</TableCell>
                          <TableCell className="px-3 py-2 text-right font-semibold text-slate-700">มูลค่าค้าง</TableCell>
                        </tr>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-100">
                        {selectedCategory.detail.pendingRows.length === 0 ? (
                          <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={7}>ไม่มีรายการค้างจัดสรรในหมวดนี้ตามช่วงวันที่</TableCell></TableRow>
                        ) : null}
                        {selectedCategory.detail.pendingRows.map((row) => (
                          <TableRow key={`${row.docNo}-${row.productName}-${row.date}`}>
                            <TableCell className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDateDisplay(row.date)}</TableCell>
                            <TableCell className="px-3 py-2 font-mono text-xs text-slate-700">{row.docNo}</TableCell>
                            <TableCell className="px-3 py-2 text-slate-700">{row.customerName}</TableCell>
                            <TableCell className="px-3 py-2 text-slate-700">{row.productName}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-amber-700">{formatMoney(row.pendingQty)}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-slate-700">{formatMoney(row.unitPrice)}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono font-semibold text-amber-700">{formatMoney(row.pendingRevenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DualCostingPanel>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล...</div> : null}
      
      {!isLoading && report ? (
        <>
          <DualCostingFilterCard>
            <div className="hidden lg:block">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[320px]">
                  <div className="mb-1 text-xs font-semibold text-slate-500">ช่วงวันที่</div>
                  <div className="grid grid-cols-[minmax(135px,1fr)_auto_minmax(135px,1fr)] items-center gap-2">
                    <DatePickerInput className="h-9 w-full" id="dual-costing-report-from" value={fromDate} onChange={setFromDate} />
                    <span className="text-xs text-slate-400">→</span>
                    <DatePickerInput className="h-9 w-full" id="dual-costing-report-to" value={toDate} onChange={setToDate} />
                  </div>
                </div>
                {hasActiveFilters ? (
                  <Button className="h-9 rounded-md px-3 text-sm font-normal focus-visible:ring-slate-100" size="sm" type="button" variant="outline" onClick={clearFilters}>
                    ล้างตัวกรอง
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="block lg:hidden space-y-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-500">ช่วงวันที่</div>
                  <div className="truncate text-sm font-semibold text-slate-900">{fromDate || '-'} → {toDate || '-'}</div>
                </div>
                <button
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
                    showMobileFilters ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  type="button"
                  onClick={() => setShowMobileFilters((current) => !current)}
                >
                  ตัวกรอง{hasActiveFilters ? ' (มี)' : ''}
                </button>
              </div>

              {showMobileFilters ? (
                <div className="grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-2 animate-in slide-in-from-top-2 duration-100">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-slate-500">
                      จากวันที่
                      <DatePickerInput className="mt-1 w-full" value={fromDate} onChange={setFromDate} />
                    </label>
                    <label className="text-xs font-semibold text-slate-500">
                      ถึงวันที่
                      <DatePickerInput className="mt-1 w-full" value={toDate} onChange={setToDate} />
                    </label>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none" size="sm" type="button" variant="secondary" onClick={clearFilters}>
                      ล้างตัวกรอง
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </DualCostingFilterCard>
          <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
            <DualCostingStatCard icon="💰" label="รายได้รวม (จัดสรรแล้ว)" tone="emerald" value={formatMoney((report?.po.revenue ?? 0) + (report?.spotAllocated.revenue ?? 0))} />
            <DualCostingStatCard icon="💳" label="ต้นทุนรวม (Deal Cost)" tone="red" value={formatMoney(report?.total.cost ?? 0)} />
            <DualCostingStatCard icon="📈" label="กำไรขั้นต้นรวม (Deal Cost)" tone={(report?.total.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(report?.total.gp ?? 0)} />
            <DualCostingStatCard icon="%" label="GP%" tone={(report?.total.gpPct ?? 0) >= 0 ? 'emerald' : 'red'} value={`${(report?.total.gpPct ?? 0).toFixed(2)}%`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ReportCard metric={report?.po} title="ขายผ่าน PO Sell" />
            <ReportCard metric={report?.spotAllocated} title="ขาย Spot Sell (จัดสรรแล้ว)" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <DualCostingStatCard icon="⏳" label="รายการค้าง" tone="amber" value={String(report?.waiting.count ?? 0)} />
            <DualCostingStatCard icon="⚖️" label="น้ำหนักค้าง" tone="amber" value={`${formatMoney(report?.waiting.qty ?? 0)} กก.`} />
            <DualCostingStatCard icon="💰" label="มูลค่าขายค้าง" tone="emerald" value={formatMoney(report?.waiting.revenue ?? 0)} />
          </div>
          <DualCostingPanel
            title="สรุปตามหมวดสินค้า"
            titleAction={reportResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={reportResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          >
            {/* Desktop View */}
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
              <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: reportResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {reportColumns.map((column) => (
                    <col key={column.key} style={reportResize.getColumnStyle(column.key)} />
                  ))}
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
                    <TableRow key={row.category} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => setSelectedCategory(row)}>
                      <TableCell className="px-3 py-3">
                        <button className="block w-full text-left" type="button" onClick={() => setSelectedCategory(row)}>
                          <span className="block truncate rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800" title={row.category}>{row.category}</span>
                        </button>
                      </TableCell>
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

            {/* Mobile View */}
            <div className="block lg:hidden space-y-3">
              {sortedReportRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-400 shadow-sm">ยังไม่มีข้อมูลสรุปตามหมวดสินค้า</div>
              ) : null}
              {sortedReportRows.map((row) => (
                <button key={row.category} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm space-y-2.5" type="button" onClick={() => setSelectedCategory(row)}>
                  <div className="flex justify-between items-center">
                    <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">{row.category}</span>
                    <span className="text-xs text-slate-500 font-semibold">พบ {row.rows} รายการ</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block">จำนวนที่จัดสรร</span>
                      <span className="font-mono text-slate-700">{formatMoney(row.allocatedQty)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">รายได้</span>
                      <span className="font-mono text-blue-700 font-semibold">{formatMoney(row.revenue)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">ต้นทุน</span>
                      <span className="font-mono text-red-600">{formatMoney(row.cost)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">GP (GP%)</span>
                      <span className={`font-mono font-bold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.gp)} ({row.gpPct.toFixed(2)}%)</span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 col-span-2 grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 block">จำนวนรอจัดสรร</span>
                        <span className="font-mono text-amber-700">{formatMoney(row.pendingQty)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block">มูลค่ารอจัดสรร</span>
                        <span className="font-mono text-amber-700 font-semibold">{formatMoney(row.pendingRevenue)}</span>
                      </div>
                    </div>
                  </div>
                </button>
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
    ? <span className="rounded border border-red-200/50 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">รอจัดสรร</span>
    : <span className="rounded border border-amber-200/50 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">จัดสรรบางส่วน</span>
}

function LedgerStatusText({ status }: { status: string }) {
  const active = status === 'approved'
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${active ? 'text-emerald-700' : 'text-slate-600'}`}>
      <span className={`size-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {ledgerStatusLabel(status)}
    </span>
  )
}

function LedgerMatchedCostDetails({ rows }: { rows: LedgerRow[] }) {
  const totalQty = rows.reduce((sum, row) => sum + row.allocatedQty, 0)
  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0)
  const weightedCostPerKg = totalQty > 0 ? totalCost / totalQty : 0

  return (
    <div className="min-h-0 overflow-y-auto p-5">
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <div className="text-xs text-blue-700">จำนวนที่จับคู่รวม</div>
          <div className="mt-1 font-mono text-base font-bold text-blue-900">{formatMoney(totalQty)} กก.</div>
        </div>
        <div className="rounded-lg border border-red-100 bg-red-50 p-3">
          <div className="text-xs text-red-700">ต้นทุนรวม</div>
          <div className="mt-1 font-mono text-base font-bold text-red-900">{formatMoney(totalCost)} บาท</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-600">ต้นทุนเฉลี่ย</div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900">{formatMoney(weightedCostPerKg)} บาท/กก.</div>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div className="rounded-lg border border-slate-200 bg-white p-3" key={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold text-slate-900">{row.sourceNo}</div>
                <div className="mt-0.5 font-mono text-xs text-slate-500">Match ID: {row.matchId}</div>
              </div>
              <LedgerStatusText status={row.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs md:grid-cols-4">
              <div>
                <div className="text-slate-500">Cost Pool</div>
                <div className="mt-0.5 truncate font-mono font-medium text-slate-800" title={row.costPoolNo}>{row.costPoolNo}</div>
              </div>
              <div className="text-right md:text-left">
                <div className="text-slate-500">จำนวนที่จับคู่</div>
                <div className="mt-0.5 font-mono font-medium text-blue-700">{formatMoney(row.allocatedQty)} กก.</div>
              </div>
              <div>
                <div className="text-slate-500">ต้นทุน</div>
                <div className="mt-0.5 font-mono font-medium text-red-700">{formatMoney(row.totalCost)} บาท</div>
                <div className="font-mono text-[11px] text-slate-500">{formatMoney(row.costPerKg)} บาท/กก.</div>
              </div>
              <div className="text-right md:text-left">
                <div className="text-slate-500">ผู้จัดสรร</div>
                <div className="mt-0.5 truncate font-medium text-slate-800" title={row.allocatedBy}>{row.allocatedBy}</div>
                <div className="text-[11px] text-slate-500">{row.allocatedAt ? formatDateDisplay(row.allocatedAt) : '-'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LedgerActionMenu({
  busy,
  disabled,
  mobileLabel = false,
  onCancel,
  onEdit,
}: {
  busy: boolean
  disabled: boolean
  mobileLabel?: boolean
  onCancel: () => void
  onEdit: () => void
}) {
  return (
    <TableActionButton
      aria-label="เปิดเมนูการจัดการ"
      busy={busy}
      disabled={disabled || busy}
      mobileLabel={mobileLabel}
      menu={(
        <>
          <TableActionMenuItem onSelect={onEdit}>แก้ไขข้อมูล</TableActionMenuItem>
          <TableActionMenuItem onSelect={onCancel}>ยกเลิก</TableActionMenuItem>
        </>
      )}
    />
  )
}

function TargetPill({ type }: { type: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold ${type === 'PO_SELL' ? 'bg-blue-50 text-blue-700 border-blue-200/50' : 'bg-purple-50 text-purple-700 border-purple-200/50'}`}>{targetTypeLabel(type)}</span>
}

function ReportCard({ metric, title }: { metric?: ReportMetric; title: string }) {
  return (
    <DualCostingPanel title={title}>
      <div className="grid grid-cols-2 gap-3">
        <DualCostingStatCard icon="📊" label="จำนวนรายการ" tone="slate" value={String(metric?.count ?? 0)} />
        <DualCostingStatCard icon="⚖️" label="น้ำหนัก" tone="blue" value={formatMoney(metric?.qty ?? 0)} />
        <DualCostingStatCard icon="💰" label="รายได้" tone="emerald" value={formatMoney(metric?.revenue ?? 0)} />
        <DualCostingStatCard icon="💳" label="ต้นทุน" tone="red" value={formatMoney(metric?.cost ?? 0)} />
        <DualCostingStatCard icon="📈" label="GP" tone={(metric?.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(metric?.gp ?? 0)} />
        <DualCostingStatCard icon="📈" label="GP%" tone="slate" value={`${(metric?.gpPct ?? 0).toFixed(2)}%`} />
      </div>
    </DualCostingPanel>
  )
}

function waitingStatusLabel(status: string) {
  if (status === 'pending_allocation') return 'รอจัดสรร'
  if (status === 'partially_allocated') return 'จัดสรรบางส่วน'
  return status
}

function ledgerStatusLabel(status: string) {
  if (status === 'approved') return 'อนุมัติแล้ว'
  if (status === 'reversed') return 'ย้อนกลับแล้ว'
  return status
}

function targetTypeLabel(type: string) {
  if (type === 'PO_SELL') return 'PO ขาย'
  if (type === 'SPOT_SELL') return 'ขายทันที'
  if (type === 'PRODUCTION') return 'การผลิต'
  return type
}

function buildLedgerAllocatorHref(row: LedgerRow) {
  const params = new URLSearchParams({
    productId: row.productId,
    sourceType: row.targetSourceType,
  })
  return `/dual-costing/cost-allocator?${params.toString()}`
}
