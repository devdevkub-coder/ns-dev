'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { formatDateDisplay } from '@/lib/format'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import {
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingPageSection,
  DualCostingPanel,
  DualCostingStatCard,
} from './DualCostingPageShell'

type DealMarginRow = {
  avgCost: number
  channel: string
  customer: string
  date: string
  docNo: string
  id: string
  margin: number
  marginPct: number
  matchedCost: number
  matchedQty: number
  product: string
  sellQty: number
  statusMatch: string
  totalRevenue: number
  unitPrice: number
}

type Payload = {
  filters: { channels: string[] }
  rows: DealMarginRow[]
  summary: { cost: number; fullyMatched: number; margin: number; marginPct: number; none: number; partial: number; revenue: number; rows: number }
  topDeals: DealMarginRow[]
}

type DealMarginColumnKey = 'avgCost' | 'channel' | 'customer' | 'date' | 'docNo' | 'margin' | 'marginPct' | 'matchedCost' | 'matchedQty' | 'product' | 'sellQty' | 'statusMatch' | 'totalRevenue' | 'unitPrice'
type SortDirection = 'asc' | 'desc'

const dealMarginColumns: Array<ResizableColumnDefinition<DealMarginColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 125 },
  { key: 'date', defaultWidth: 115, minWidth: 100 },
  { key: 'customer', defaultWidth: 210, minWidth: 150 },
  { key: 'channel', defaultWidth: 145, minWidth: 115 },
  { key: 'product', defaultWidth: 220, minWidth: 160 },
  { key: 'sellQty', defaultWidth: 130, minWidth: 105 },
  { key: 'unitPrice', defaultWidth: 130, minWidth: 105 },
  { key: 'totalRevenue', defaultWidth: 145, minWidth: 120 },
  { key: 'matchedQty', defaultWidth: 140, minWidth: 115 },
  { key: 'avgCost', defaultWidth: 130, minWidth: 105 },
  { key: 'matchedCost', defaultWidth: 145, minWidth: 120 },
  { key: 'margin', defaultWidth: 140, minWidth: 115 },
  { key: 'marginPct', defaultWidth: 105, minWidth: 90 },
  { key: 'statusMatch', defaultWidth: 145, minWidth: 120 },
]

const pageSizeOptions = [10, 25, 50, 100] as const

export function DealMarginPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [channel, setChannel] = useState('all')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(25)
  const [sortKey, setSortKey] = useState<DealMarginColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('dual-costing.deal-margin.main.v1', dealMarginColumns)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (channel !== 'all') params.set('channel', channel)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [channel, fromDate, toDate])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<Payload>(`/api/dual-costing/deal-margin?${queryString}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Deal Margin ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const exportHref = `/api/dual-costing/deal-margin?${queryString ? `${queryString}&` : ''}format=xlsx`
  const marginPositive = (data?.summary.margin ?? 0) >= 0
  const hasActiveFilters = Boolean(fromDate || toDate || channel !== 'all')
  const activeFilterCount = [fromDate, toDate, channel !== 'all'].filter(Boolean).length
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getDealMarginSortValue(left, sortKey), getDealMarginSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])
  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [channel, fromDate, toDate])

  function clearFilters() {
    setChannel('all')
    setFromDate('')
    setToDate('')
  }

  function handleSort(key: DealMarginColumnKey) {
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

      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        <div className={`min-w-0 rounded-xl p-5 text-white shadow ${marginPositive ? 'bg-gradient-to-br from-purple-600 to-pink-700' : 'bg-gradient-to-br from-red-500 to-rose-700'}`}>
          <div className="text-xs opacity-90 font-semibold">กำไรดีล (Deal Margin)</div>
          <div className="mt-1 truncate text-4xl font-bold">{formatMoney(data?.summary.margin ?? 0)}</div>
          <div className="mt-2 text-sm opacity-90 font-medium">Margin {(data?.summary.marginPct ?? 0).toFixed(1)}%</div>
          <div className="mt-3 space-y-0.5 text-xs opacity-80 font-mono">
            <div>รายได้ดีล: <b>{formatMoney(data?.summary.revenue ?? 0)}</b></div>
            <div>ต้นทุนที่จับคู่: <b>{formatMoney(data?.summary.cost ?? 0)}</b></div>
            <div className="mt-1">{data?.summary.rows ?? 0} ดีล · {data?.summary.fullyMatched ?? 0} Fully Matched</div>
          </div>
        </div>

        <DualCostingPanel title="Top 5 Deal กำไรสูงสุด">
          {(data?.topDeals.length ?? 0) === 0 ? <div className="text-xs text-slate-400 py-4 text-center">ไม่มีข้อมูล</div> : null}
          <div className="space-y-2">
            {(data?.topDeals ?? []).map((row, index) => (
              <div key={row.id} className="text-xs">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="w-4 text-center font-bold text-slate-400">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{row.docNo} · {row.customer}</span>
                  <span className={`w-20 text-right font-bold ${row.margin >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{formatMoney(row.margin)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-gradient-to-r from-purple-400 to-pink-500" style={{ width: `${Math.min(100, Math.max(0, row.margin) / Math.max(data?.topDeals[0]?.margin || 1, 1) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </DualCostingPanel>

        <DualCostingPanel title="สถานะการ Match">
          <MatchStatusDonut
            fully={data?.summary.fullyMatched ?? 0}
            none={data?.summary.none ?? 0}
            partial={data?.summary.partial ?? 0}
            total={data?.summary.rows ?? 0}
          />
        </DualCostingPanel>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
        <DualCostingStatCard label="รายได้ดีลรวม" tone="emerald" value={formatMoney(data?.summary.revenue ?? 0)} />
        <DualCostingStatCard label="ต้นทุนที่จับคู่รวม" tone="red" value={formatMoney(data?.summary.cost ?? 0)} />
        <DualCostingStatCard label="กำไรดีลรวม" tone="purple" value={formatMoney(data?.summary.margin ?? 0)} />
        <DualCostingStatCard label="Margin %" tone={marginPositive ? 'emerald' : 'red'} value={`${(data?.summary.marginPct ?? 0).toFixed(2)}%`} />
      </div>

      <DualCostingFilterCard>
        {/* Desktop View */}
        <div className="hidden lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">วันที่เอกสาร:</span>
            <DatePickerInput id="deal-margin-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="deal-margin-to" value={toDate} onChange={setToDate} />
            <Select className="w-auto min-w-[180px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="all">ทุกช่องทาง</option>
              {(data?.filters.channels ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            {hasActiveFilters ? <Button size="sm" type="button" variant="secondary" className="h-9 rounded-lg" onClick={clearFilters}>ล้างตัวกรอง</Button> : null}
            <Button asChild size="sm" variant="export" className="ml-auto rounded-lg h-9 px-3 text-xs font-semibold focus-visible:ring-slate-100">
              <a href={exportHref}>ส่งออก XLSX</a>
            </Button>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2">
          <div className="flex gap-2">
            <button
              className={`flex-1 h-10 rounded-md border px-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              ตัวกรอง{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <Button asChild size="sm" variant="export" className="h-10 rounded-md shrink-0">
              <a href={exportHref}>XLSX</a>
            </Button>
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
              <label className="text-xs text-slate-500 font-semibold">
                ช่องทาง
                <Select className="mt-1 w-full h-9 border-slate-300 focus-visible:ring-emerald-100 text-sm" value={channel} onChange={(event) => setChannel(event.target.value)}>
                  <option value="all">ทุกช่องทาง</option>
                  {(data?.filters.channels ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
              {hasActiveFilters && (
                <div className="flex justify-end pt-1">
                  <button
                    className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors focus-visible:outline-none"
                    type="button"
                    onClick={clearFilters}
                  >
                    ล้างตัวกรอง
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </DualCostingFilterCard>

      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? (
            <Button className="hidden h-9 lg:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </Button>
          ) : null}
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
          <Button disabled={safePage <= 1 || isLoading} className="h-9" size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {safePage} / {totalPages}</span>
          <Button disabled={safePage >= totalPages || isLoading} className="h-9" size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}>
          <colgroup>
            {dealMarginColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key)
              if (index === dealMarginColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={style} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="เลขที่ PO Sell" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่ PO Sell')} />
              <ResizableTableHead label="วันที่เอกสาร" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} />
              <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="customer" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('customer', 'ลูกค้า')} />
              <ResizableTableHead label="ช่องทาง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="channel" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('channel', 'ช่องทาง')} />
              <ResizableTableHead label="สินค้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="product" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} />
              <ResizableTableHead align="right" label="จำนวนขาย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="sellQty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('sellQty', 'จำนวนขาย')} />
              <ResizableTableHead align="right" label="ราคา/หน่วย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="unitPrice" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('unitPrice', 'ราคา/หน่วย')} />
              <ResizableTableHead align="right" label="รายได้ดีล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="totalRevenue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('totalRevenue', 'รายได้ดีล')} />
              <ResizableTableHead align="right" label="จำนวนที่จับคู่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="matchedQty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('matchedQty', 'จำนวนที่จับคู่')} />
              <ResizableTableHead align="right" label="ต้นทุนเฉลี่ย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="avgCost" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('avgCost', 'ต้นทุนเฉลี่ย')} />
              <ResizableTableHead align="right" label="ต้นทุนที่จับคู่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="matchedCost" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('matchedCost', 'ต้นทุนที่จับคู่')} />
              <ResizableTableHead align="right" label="กำไรดีล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="margin" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('margin', 'กำไรดีล')} />
              <ResizableTableHead align="right" label="Margin %" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="marginPct" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('marginPct', 'Margin %')} />
              <ResizableTableHead align="center" label="สถานะ Match" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="statusMatch" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('statusMatch', 'สถานะ Match')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={dealMarginColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={dealMarginColumns.length}>ยังไม่มี PO Sell</td></tr> : null}
            {!isLoading && pagedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">{row.docNo}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(row.date)}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{row.customer}</td>
                <td className="px-3 py-3 text-slate-600">{row.channel}</td>
                <td className="px-3 py-3 text-slate-700">{row.product}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.sellQty)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.unitPrice)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.totalRevenue)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.matchedQty)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.avgCost)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.matchedCost)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.margin)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums ${row.marginPct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{row.marginPct.toFixed(2)}%</td>
                <td className="px-3 py-3 text-center"><MatchStatusBadge status={row.statusMatch} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm">ยังไม่มี PO Sell</div>
        ) : null}
        {!isLoading && pagedRows.map((row) => (
          <div key={row.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-mono text-xs font-bold text-slate-800">{row.docNo}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatDateDisplay(row.date)}</div>
              </div>
              <MatchStatusBadge status={row.statusMatch} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-800">{row.customer}</div>
              <div className="mt-0.5 truncate text-xs text-slate-600">{row.product}</div>
              <div className="text-xs text-slate-500 mt-1">ช่องทาง: <span className="font-semibold">{row.channel}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">จำนวนขาย / ราคา</span>
                <span className="font-mono text-slate-700">{formatMoney(row.sellQty)} / {formatMoney(row.unitPrice)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">รายได้ดีล</span>
                <span className="font-mono text-slate-900 font-semibold">{formatMoney(row.totalRevenue)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">จำนวนที่จับคู่ / ต้นทุนเฉลี่ย</span>
                <span className="font-mono text-slate-700">{formatMoney(row.matchedQty)} / {formatMoney(row.avgCost)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">ต้นทุนที่จับคู่</span>
                <span className="font-mono text-slate-900 font-semibold">{formatMoney(row.matchedCost)}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="text-slate-500">กำไรดีล (Margin %)</span>
              <span className={`font-mono font-bold ${row.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.margin)} ({row.marginPct.toFixed(2)}%)</span>
            </div>
          </div>
        ))}
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

function getDealMarginSortValue(row: DealMarginRow, key: DealMarginColumnKey): string | number {
  if (key === 'date') {
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  return row[key] ?? ''
}

function MatchStatusBadge({ status }: { status: string }) {
  const className = status === 'Fully'
    ? 'border-emerald-200/50 bg-emerald-50 text-emerald-700'
    : status === 'Partial'
      ? 'border-amber-200/50 bg-amber-50 text-amber-700'
      : 'border-slate-200/50 bg-slate-100 text-slate-600'
  const label = status === 'Fully' ? 'Fully Matched' : status === 'Partial' ? 'Partial Match' : 'No Match'

  return <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${className}`}>{label}</span>
}

function MatchStatusDonut({ fully, none, partial, total }: { fully: number; none: number; partial: number; total: number }) {
  const circumference = 440
  const fullyArc = total > 0 ? (fully / total) * circumference : 0
  const partialArc = total > 0 ? (partial / total) * circumference : 0
  const noneArc = total > 0 ? (none / total) * circumference : 0
  const fullyPct = total > 0 ? (fully / total) * 100 : 0

  return (
    <>
      <svg aria-label="Match status distribution" className="mx-auto block h-[140px] w-[140px]" role="img" viewBox="0 0 200 200">
        {total > 0 ? (
          <>
            <circle cx="100" cy="100" r="70" fill="none" stroke="#10b981" strokeDasharray={`${fullyArc} ${circumference}`} strokeWidth="40" transform="rotate(-90 100 100)" />
            <circle cx="100" cy="100" r="70" fill="none" stroke="#f59e0b" strokeDasharray={`${partialArc} ${circumference}`} strokeDashoffset={-fullyArc} strokeWidth="40" transform="rotate(-90 100 100)" />
            <circle cx="100" cy="100" r="70" fill="none" stroke="#94a3b8" strokeDasharray={`${noneArc} ${circumference}`} strokeDashoffset={-(fullyArc + partialArc)} strokeWidth="40" transform="rotate(-90 100 100)" />
          </>
        ) : null}
        <text x="100" y="95" fill="#64748b" fontSize="12" textAnchor="middle">{total} Deals</text>
        <text x="100" y="115" fill="#0f172a" fontSize="14" fontWeight="bold" textAnchor="middle">{fullyPct.toFixed(0)}%</text>
      </svg>
      <div className="mt-1 flex justify-center gap-2 text-xs">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-emerald-500" />Fully</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-amber-500" />Partial</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-slate-400" />None</span>
      </div>
    </>
  )
}
