'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import {
  DualCostingCountRow,
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingPageSection,
  DualCostingStatCard,
} from './DualCostingPageShell'

type MatchLogRow = {
  allocationMode: string
  costType: string
  date: string
  id: string
  matchId: string
  matchType: string
  product: string
  qtyUsed: number
  sourceNo: string
  sourceType: string
  status: string
  target: string
  totalCost: number
  unitCost: number
}

type Payload = {
  filters: { costTypes: string[]; matchTypes: string[]; statuses: string[] }
  rows: MatchLogRow[]
  summary: { active: number; reversed: number; sales: number; total: number; totalCost: number; totalQty: number }
}

type MatchLogColumnKey = 'action' | 'allocationMode' | 'costType' | 'date' | 'matchId' | 'matchType' | 'product' | 'qtyUsed' | 'sourceNo' | 'sourceType' | 'status' | 'target' | 'totalCost' | 'unitCost'
type SortDirection = 'asc' | 'desc'

const matchLogColumns: Array<ResizableColumnDefinition<MatchLogColumnKey>> = [
  { key: 'matchType', defaultWidth: 125, minWidth: 105 },
  { key: 'costType', defaultWidth: 125, minWidth: 105 },
  { key: 'matchId', defaultWidth: 150, minWidth: 125 },
  { key: 'date', defaultWidth: 115, minWidth: 100 },
  { key: 'target', defaultWidth: 190, minWidth: 140 },
  { key: 'sourceType', defaultWidth: 125, minWidth: 105 },
  { key: 'sourceNo', defaultWidth: 150, minWidth: 125 },
  { key: 'product', defaultWidth: 220, minWidth: 160 },
  { key: 'qtyUsed', defaultWidth: 120, minWidth: 100 },
  { key: 'unitCost', defaultWidth: 120, minWidth: 100 },
  { key: 'totalCost', defaultWidth: 135, minWidth: 110 },
  { key: 'allocationMode', defaultWidth: 115, minWidth: 95 },
  { key: 'status', defaultWidth: 120, minWidth: 100 },
  { key: 'action', defaultWidth: 110, minWidth: 95 },
]

export function MatchLogPageClient() {
  const [costType, setCostType] = useState('all')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [matchType, setMatchType] = useState('all')
  const [poSellTarget, setPoSellTarget] = useState('all')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortKey, setSortKey] = useState<MatchLogColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('dual-costing.match-log.main.v1', matchLogColumns)

  useEffect(() => {
    setPage(1)
  }, [costType, matchType, poSellTarget, search, status])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (costType !== 'all') params.set('costType', costType)
    if (matchType !== 'all') params.set('matchType', matchType)
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    return params.toString()
  }, [costType, matchType, search, status])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>(`/api/dual-costing/match-log?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Match Log ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const poSellOptions = useMemo(() => {
    const targets = (data?.rows ?? []).map((row) => row.target).filter((target) => target && target !== '-')
    return Array.from(new Set(targets)).sort((left, right) => left.localeCompare(right, 'th'))
  }, [data?.rows])

  useEffect(() => {
    if (poSellTarget !== 'all' && !poSellOptions.includes(poSellTarget)) setPoSellTarget('all')
  }, [poSellOptions, poSellTarget])

  const visibleRows = useMemo(() => {
    const rows = data?.rows ?? []
    if (poSellTarget === 'all') return rows
    return rows.filter((row) => row.target === poSellTarget)
  }, [data?.rows, poSellTarget])

  const sortedRows = useMemo(() => {
    if (!sortKey) return visibleRows

    return [...visibleRows].sort((left, right) => {
      const result = compareSortValues(getMatchLogSortValue(left, sortKey), getMatchLogSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [sortDirection, sortKey, visibleRows])

  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const visibleSummary = useMemo(() => {
    const activeRows = visibleRows.filter((row) => row.status !== 'reversed')
    return {
      active: activeRows.length,
      regrade: visibleRows.filter((row) => row.matchType === 'regrade').length,
      sales: visibleRows.filter((row) => row.matchType === 'sales').length,
      total: visibleRows.length,
      totalCost: activeRows.reduce((sum, row) => sum + row.totalCost, 0),
      totalQty: activeRows.reduce((sum, row) => sum + row.qtyUsed, 0),
    }
  }, [visibleRows])

  const exportHref = `/api/dual-costing/match-log?${queryString ? `${queryString}&` : ''}format=xlsx`
  const hasActiveFilters = Boolean(search || matchType !== 'all' || costType !== 'all' || poSellTarget !== 'all' || status !== 'all')
  const listControls = (
    <>
      <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
      <div className="flex items-center gap-2">
        {columnResize.hasCustomWidths ? (
          <Button className="hidden h-8 text-xs md:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>
            คืนค่าเดิมตาราง
          </Button>
        ) : null}
        <select
          aria-label="จำนวนรายการต่อหน้า"
          className="h-8 text-xs rounded-md border border-slate-300 px-2 bg-white text-slate-800"
          value={pageSize}
          onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
        >
          {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
        </select>
        <Button
          disabled={currentPage <= 1}
          size="xs"
          variant="outline"
          type="button"
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          ก่อนหน้า
        </Button>
        <span className="px-1">หน้า {currentPage} / {totalPages}</span>
        <Button
          disabled={currentPage >= totalPages}
          size="xs"
          variant="outline"
          type="button"
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
        >
          ถัดไป
        </Button>
      </div>
    </>
  )

  function clearFilters() {
    setCostType('all')
    setMatchType('all')
    setPoSellTarget('all')
    setSearch('')
    setStatus('all')
  }

  function handleSort(key: MatchLogColumnKey) {
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <DualCostingStatCard label="Sales Match" tone="emerald" value={String(visibleSummary.sales)} />
        <DualCostingStatCard label="Regrade Match" tone="purple" value={String(visibleSummary.regrade)} />
        <DualCostingStatCard label="Active" tone="emerald" value={String(visibleSummary.active)} />
        <DualCostingStatCard label="รวม Qty" value={formatMoney(visibleSummary.totalQty)} />
        <DualCostingStatCard label="รวมมูลค่าต้นทุน" value={formatMoney(visibleSummary.totalCost)} />
      </div>

      <DualCostingFilterCard>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[240px] flex-1 rounded-md"
            placeholder="ค้นหา match id / source / target..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select className="w-auto min-w-[160px]" value={matchType} onChange={(event) => setMatchType(event.target.value)}>
            <option value="all">ทุก Match Type</option>
            {(data?.filters.matchTypes ?? []).map((item) => <option key={item} value={item}>{matchTypeLabel(item)}</option>)}
          </Select>
          <Select className="w-auto min-w-[150px]" value={costType} onChange={(event) => setCostType(event.target.value)}>
            <option value="all">ทุก Cost Type</option>
            {(data?.filters.costTypes ?? []).map((item) => <option key={item} value={item}>{costTypeLabel(item)}</option>)}
          </Select>
          <Select className="w-auto min-w-[180px]" disabled={poSellOptions.length === 0} title="API ยังไม่มี po_sell_id แยก จึงกรองจาก target ที่ส่งมา" value={poSellTarget} onChange={(event) => setPoSellTarget(event.target.value)}>
            <option value="all">ทุก PO Sell</option>
            {poSellOptions.map((target) => <option key={target} value={target}>{target}</option>)}
          </Select>
          <Select className="w-auto min-w-[150px]" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
          </Select>
          {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
          <Button asChild size="sm" variant="export">
            <a href={exportHref}>ส่งออก Excel</a>
          </Button>
        </div>
      </DualCostingFilterCard>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          {listControls}
        </div>
        <div className="overflow-x-auto">
      <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth, width: '100%' }}>
        <colgroup>
          {matchLogColumns.map((column) => (
            <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
          ))}
        </colgroup>
        <thead className="bg-slate-100">
          <tr>
            <ResizableTableHead label="Match Type" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="matchType" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('matchType', 'Match Type')} />
            <ResizableTableHead label="Cost Type" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="costType" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('costType', 'Cost Type')} />
            <ResizableTableHead label="Match ID" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="matchId" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('matchId', 'Match ID')} />
            <ResizableTableHead label="วันที่เอกสาร" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} />
            <ResizableTableHead label="Target / Reference" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="target" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('target', 'Target / Reference')} />
            <ResizableTableHead label="Source" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="sourceType" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('sourceType', 'Source')} />
            <ResizableTableHead label="Source No" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="sourceNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('sourceNo', 'Source No')} />
            <ResizableTableHead label="สินค้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="product" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} />
            <ResizableTableHead align="right" label="Qty" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="qtyUsed" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qtyUsed', 'Qty')} />
            <ResizableTableHead align="right" label="บาท/หน่วย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="unitCost" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('unitCost', 'บาท/หน่วย')} />
            <ResizableTableHead align="right" label="มูลค่า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="totalCost" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('totalCost', 'มูลค่า')} />
            <ResizableTableHead align="center" label="Mode" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="allocationMode" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('allocationMode', 'Mode')} />
            <ResizableTableHead align="center" label="สถานะ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="status" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
            <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={matchLogColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && visibleRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={matchLogColumns.length}>ยังไม่มี Match Log ตามตัวกรอง</td></tr> : null}
          {!isLoading && pagedRows.map((row) => (
            <tr key={row.id} className={`hover:bg-slate-50 ${row.status === 'reversed' ? 'opacity-50' : ''}`}>
              <td className="p-2"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${matchTypeClass(row.matchType)}`}>{matchTypeBadge(row.matchType)}</span></td>
              <td className="p-2"><span className={`rounded-md px-2 py-0.5 text-xs ${costTypeClass(row.costType)}`}>{row.costType}</span></td>
              <td className="p-2 font-mono text-xs">{row.matchId}</td>
              <td className="whitespace-nowrap p-2 text-xs">{formatDateDisplay(row.date)}</td>
              <td className="p-2 text-xs">{row.target}</td>
              <td className="p-2"><span className={`rounded-md px-2 py-0.5 text-xs ${sourceTypeClass(row.sourceType)}`}>{row.sourceType}</span></td>
              <td className="p-2 font-mono text-xs">{row.sourceNo}</td>
              <td className="p-2 text-xs">{row.product}</td>
              <td className="p-2 text-right">{formatMoney(row.qtyUsed)}</td>
              <td className="p-2 text-right">{formatMoney(row.unitCost)}</td>
              <td className="p-2 text-right font-medium">{formatMoney(row.totalCost)}</td>
              <td className="p-2 text-center text-xs">{row.allocationMode}</td>
              <td className="p-2 text-center"><span className={`rounded-md px-2 py-0.5 text-xs ${row.status === 'reversed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{statusLabel(row.status)}</span></td>
              <td className="p-2 text-right">
                {row.status !== 'reversed' ? <button className="text-xs text-red-600 opacity-60" disabled title="Reverse ยังเป็น read-only shell" type="button">ย้อนกลับ</button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function getMatchLogSortValue(row: MatchLogRow, key: MatchLogColumnKey): string | number {
  if (key === 'action') return ''
  if (key === 'date') {
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  return row[key] ?? ''
}

function matchTypeLabel(type: string) {
  return type === 'regrade' ? 'Regrade (GA)' : 'Sales (PO Sell)'
}

function matchTypeBadge(type: string) {
  return type === 'regrade' ? 'Regrade' : 'Sales'
}

function matchTypeClass(type: string) {
  return type === 'regrade' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
}

function costTypeLabel(type: string) {
  if (type === 'Production') return 'Production'
  if (type === 'Regrade') return 'Regrade'
  return 'Purchase'
}

function costTypeClass(type: string) {
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}

function sourceTypeClass(type: string) {
  if (type === 'PO_Buy') return 'bg-cyan-100 text-cyan-700'
  if (type === 'Spot_Buy') return 'bg-blue-100 text-blue-700'
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'bg-purple-100 text-purple-700'
  if (type === 'Trading_Deal') return 'bg-fuchsia-100 text-fuchsia-700'
  return 'bg-slate-200 text-slate-700'
}

function statusLabel(status: string) {
  return status === 'reversed' ? 'Reversed' : 'Approved'
}
