'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

type TradingPayload = {
  deals: Array<{ customerName: string; date: string; dealNo: string; grossProfit: number; grossProfitPct: number; id: string; matchedPurchaseAmount: number; matchedQty: number; matchedSalesAmount: number; productName: string; purchaseBillNo: string; salesBillNo: string; status: string; supplierName: string }>
  filters: { statuses: string[] }
  purchases: Array<{ date: string; docNo: string; id: string; matchedAmount: number; remainingAmount: number; supplierName: string; totalAmount: number }>
  sales: Array<{ customerName: string; date: string; docNo: string; id: string; matchedAmount: number; remainingAmount: number; totalAmount: number }>
  summary: { activeDeals: number; grossProfit: number; purchaseRemaining: number; purchaseTotal: number; salesRemaining: number; salesTotal: number }
}

type TradingDealRow = TradingPayload['deals'][number]
type TradingPurchaseRow = TradingPayload['purchases'][number]
type AllocationColumnKey = 'action' | 'customerName' | 'date' | 'grossProfit' | 'grossProfitPct' | 'matchedPurchaseAmount' | 'matchedQty' | 'matchedSalesAmount' | 'productName' | 'purchaseBillNo' | 'salesBillNo' | 'supplierName'
type RemainingColumnKey = 'date' | 'docNo' | 'matchedAmount' | 'remainingAmount' | 'supplierName' | 'totalAmount'
type SortDirection = 'asc' | 'desc'

const allocationLinks = [
  { href: '/dual-costing/cost-allocation-ledger', label: 'บัญชีการจัดสรรต้นทุน' },
  { href: '/dual-costing/deal-margin', label: 'รายงานกำไรต่อดีล' },
  { href: '/dual-costing/waiting-allocations', label: 'รายการรอจัดสรร' },
]

function isCancelled(status: string) {
  return status.toLowerCase().includes('cancel')
}

const allocationColumns: Array<ResizableColumnDefinition<AllocationColumnKey>> = [
  { key: 'salesBillNo', defaultWidth: 110 },
  { key: 'date', defaultWidth: 80 },
  { key: 'purchaseBillNo', defaultWidth: 110 },
  { key: 'supplierName', defaultWidth: 150 },
  { key: 'customerName', defaultWidth: 150 },
  { key: 'productName', defaultWidth: 120 },
  { key: 'matchedQty', defaultWidth: 70 },
  { key: 'matchedPurchaseAmount', defaultWidth: 90 },
  { key: 'matchedSalesAmount', defaultWidth: 90 },
  { key: 'grossProfit', defaultWidth: 90 },
  { key: 'grossProfitPct', defaultWidth: 70 },
  { key: 'action', defaultWidth: 80 },
]

function compareSortValues(left: string | number, right: string | number) {
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'th', { numeric: true })
}

function useLocalTableSort<TRow, TKey extends string>(rows: TRow[], getSortValue: (row: TRow, key: TKey) => string | number) {
  const [sortKey, setSortKey] = useState<TKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [getSortValue, rows, sortDirection, sortKey])

  function handleSort(key: TKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return { handleSort, sortDirection, sortedRows, sortKey }
}

function getAllocationSortValue(row: TradingDealRow, key: AllocationColumnKey) {
  if (key === 'action') return ''
  return row[key]
}

function getRemainingSortValue(row: TradingPurchaseRow, key: RemainingColumnKey) {
  return row[key]
}

export function TradingMatchingPageClient() {
  const [data, setData] = useState<TradingPayload | null>(null)
  const columnResize = useResizableColumns('trading.matching.allocations.v5', allocationColumns)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDeal, setSelectedDeal] = useState<TradingDealRow | null>(null)
  const [tab, setTab] = useState<'allocations' | 'remaining'>('allocations')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [fromDate, toDate, search, tab])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<TradingPayload>('/api/trading/matching'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดหน้าจอจับคู่ดีลไม่สำเร็จ')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.deals ?? []).filter((row) => {
      if (isCancelled(row.status)) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.purchaseBillNo} ${row.salesBillNo} ${row.supplierName} ${row.customerName} ${row.productName}`.toLowerCase().includes(query)
    })
  }, [data?.deals, fromDate, search, toDate])

  const remainingPurchases = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.purchases ?? []).filter((row) => {
      if (row.remainingAmount <= 0.01) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.docNo} ${row.supplierName}`.toLowerCase().includes(query)
    })
  }, [data?.purchases, fromDate, search, toDate])
  const {
    handleSort: handleAllocationSort,
    sortDirection: allocationSortDirection,
    sortedRows: sortedFilteredDeals,
    sortKey: allocationSortKey,
  } = useLocalTableSort<TradingDealRow, AllocationColumnKey>(filteredDeals, getAllocationSortValue)
  const {
    handleSort: handleRemainingSort,
    sortDirection: remainingSortDirection,
    sortedRows: sortedRemainingPurchases,
    sortKey: remainingSortKey,
  } = useLocalTableSort<TradingPurchaseRow, RemainingColumnKey>(remainingPurchases, getRemainingSortValue)

  const totalRows = tab === 'allocations' ? sortedFilteredDeals.length : sortedRemainingPurchases.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pagedFilteredDeals = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedFilteredDeals.slice(start, start + pageSize)
  }, [sortedFilteredDeals, currentPage, pageSize])

  const pagedRemainingPurchases = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRemainingPurchases.slice(start, start + pageSize)
  }, [sortedRemainingPurchases, currentPage, pageSize])

  const totals = useMemo(() => {
    const salesAmount = filteredDeals.reduce((sum, row) => sum + row.matchedSalesAmount, 0)
    const costAmount = filteredDeals.reduce((sum, row) => sum + row.matchedPurchaseAmount, 0)
    const grossProfit = salesAmount - costAmount
    const remainingCost = remainingPurchases.reduce((sum, row) => sum + row.remainingAmount, 0)
    const remainingMatchedCost = remainingPurchases.reduce((sum, row) => sum + row.matchedAmount, 0)
    return {
      allocationCount: filteredDeals.length,
      costAmount,
      grossProfit,
      grossProfitPct: salesAmount > 0 ? grossProfit / salesAmount * 100 : 0,
      remainingCost,
      remainingMatchedCost,
      salesAmount,
    }
  }, [filteredDeals, remainingPurchases])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return `/api/trading/matching?${params.toString()}`
  }, [fromDate, search, toDate])

  const resetFilters = () => {
    setFromDate('')
    setSearch('')
    setToDate('')
  }

  const hasFilters = Boolean(search.trim() || fromDate || toDate)

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-4">
        <Metric label="GP คาดการณ์" tone={totals.grossProfit >= 0 ? 'emerald' : 'red'} value={formatMoney(totals.grossProfit)} />
        <Metric label="ยอดขายที่จับคู่" tone="slate" value={formatMoney(totals.salesAmount)} />
        <Metric label="ต้นทุนที่จับคู่" tone="purple" value={formatMoney(totals.costAmount)} />
        <Metric label="ต้นทุนคงเหลือ" tone="amber" value={formatMoney(totals.remainingCost)} />
      </div>

      <Tabs className="gap-0" value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList className="w-full flex-nowrap overflow-x-auto" variant="line">
          <TabsTrigger value="allocations" variant="line">รายการจับคู่ ({filteredDeals.length})</TabsTrigger>
          <TabsTrigger value="remaining" variant="line">ต้นทุนคงเหลือ ({remainingPurchases.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input autoComplete="off" className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-750 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" placeholder="ค้นหาบิลขาย / บิลซื้อ / คู่ค้า / สินค้า" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <DatePickerInput ariaLabel="วันที่เริ่มต้น" className="h-9 text-sm" value={fromDate} onChange={setFromDate} />
          <DatePickerInput ariaLabel="วันที่สิ้นสุด" className="h-9 text-sm" value={toDate} onChange={setToDate} />
          {hasFilters ? <button className="h-9 rounded-md border border-slate-300 px-4 text-sm font-normal text-slate-655 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-0" type="button" onClick={resetFilters}>ล้าง</button> : null}
          <button className="h-9 rounded-md border border-slate-300 px-4 text-sm font-normal text-slate-655 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-0" type="button" onClick={() => void loadData()}>รีเฟรช</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <a className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-normal text-white shadow-xs transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-0" href={exportHref}>ส่งออก Excel</a>
          <div className="flex flex-wrap gap-2">
            {allocationLinks.map((item) => (
              <Link key={item.href} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 shadow-xs transition-colors hover:bg-slate-50 focus:outline-none focus:ring-0" href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        {/* Pagination Controls */}
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div>
            พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="จำนวนรายการต่อหน้า"
              className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
            </select>
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={currentPage <= 1}
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              ก่อนหน้า
            </button>
            <span className="px-1">หน้า {currentPage} / {totalPages}</span>
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={currentPage >= totalPages}
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              ถัดไป
            </button>
          </div>
        </div>

        {tab === 'allocations' ? (
          <>
            <div className="block space-y-3 p-3 lg:hidden">
              {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-455 font-semibold text-xs shadow-sm">กำลังโหลดข้อมูล</div> : null}
              {!isLoading && pagedFilteredDeals.map((row) => (
                <button key={row.id} className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:bg-slate-50/50 active:bg-slate-100/50 transition-all outline-none focus:outline-none focus:ring-0 cursor-pointer" type="button" onClick={() => setSelectedDeal(row)}>
                  <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 mb-2">
                    <span className="font-bold text-slate-800 text-sm">{row.salesBillNo || '-'}</span>
                    <span className="text-xs text-slate-400 font-semibold">{formatDateDisplay(row.date)}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-semibold">ต้นทุนจาก: <span className="font-mono text-slate-600 font-bold">{row.purchaseBillNo || '-'}</span></div>
                  <div className="mt-1 text-xs text-slate-605 font-semibold">{row.supplierName} &rarr; {row.customerName}</div>
                  <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs">
                    <Amount label="ต้นทุน" tone="red" value={row.matchedPurchaseAmount} />
                    <Amount label="ยอดขาย" tone="emerald" value={row.matchedSalesAmount} />
                    <Amount label="GP" tone={row.grossProfit >= 0 ? 'purple' : 'red'} value={row.grossProfit} />
                  </div>
                </button>
              ))}
              {!isLoading && filteredDeals.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-455 font-semibold text-xs shadow-sm">ยังไม่มีรายการจัดสรรตามเงื่อนไขที่ค้นหา</div> : null}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
                {columnResize.hasCustomWidths ? (
                  <button className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>
                    คืนค่าเดิมตาราง
                  </button>
                ) : null}
              </div>
              <table className="ns-table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {allocationColumns.map((col) => (
                    <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                  <tr>
                    <ResizableTableHead label="บิลขาย" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="salesBillNo" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('salesBillNo', 'บิลขาย')} />
                    <ResizableTableHead label="วันที่" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="date" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
                    <ResizableTableHead label="บิลซื้อ/ต้นทุน" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="purchaseBillNo" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('purchaseBillNo', 'บิลซื้อ/ต้นทุน')} />
                    <ResizableTableHead label="ผู้ขาย" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="supplierName" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('supplierName', 'ผู้ขาย')} />
                    <ResizableTableHead label="ลูกค้า" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="customerName" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('customerName', 'ลูกค้า')} />
                    <ResizableTableHead label="สินค้า" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="productName" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้า')} />
                    <ResizableTableHead align="right" label="จำนวน" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="matchedQty" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('matchedQty', 'จำนวน')} />
                    <ResizableTableHead align="right" label="ต้นทุน" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="matchedPurchaseAmount" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('matchedPurchaseAmount', 'ต้นทุน')} />
                    <ResizableTableHead align="right" label="ยอดขาย" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="matchedSalesAmount" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('matchedSalesAmount', 'ยอดขาย')} />
                    <ResizableTableHead align="right" label="GP คาดการณ์" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="grossProfit" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('grossProfit', 'GP คาดการณ์')} />
                    <ResizableTableHead align="right" label="GP%" activeSortKey={allocationSortKey ?? undefined} direction={allocationSortDirection} sortKey="grossProfitPct" onSort={handleAllocationSort} resizeProps={columnResize.getResizeHandleProps('grossProfitPct', 'GP%')} />
                    <ResizableTableHead label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? <tr><td className="p-6 text-center text-slate-500 font-semibold" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
                  {!isLoading && !error && filteredDeals.length === 0 ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={12}>ยังไม่มีรายการจัดสรรตามเงื่อนไขที่ค้นหา</td></tr> : null}
                  {!isLoading && pagedFilteredDeals.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-2.5 font-mono font-semibold text-slate-800 overflow-hidden truncate">{row.salesBillNo || '-'}</td>
                      <td className="p-2.5 text-slate-500 font-medium overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                      <td className="p-2.5 font-mono text-slate-600 font-medium overflow-hidden truncate">{row.purchaseBillNo || '-'}</td>
                      <td className="p-2.5 text-slate-700 font-medium overflow-hidden truncate">{row.supplierName}</td>
                      <td className="p-2.5 text-slate-700 font-medium overflow-hidden truncate">{row.customerName}</td>
                      <td className="p-2.5 text-slate-700 font-medium overflow-hidden truncate">{row.productName}</td>
                      <td className="p-2.5 text-right font-medium overflow-hidden truncate">{formatMoney(row.matchedQty)}</td>
                      <td className="p-2.5 text-right text-red-700 font-semibold overflow-hidden truncate">{formatMoney(row.matchedPurchaseAmount)}</td>
                      <td className="p-2.5 text-right text-emerald-700 font-semibold overflow-hidden truncate">{formatMoney(row.matchedSalesAmount)}</td>
                      <td className={`p-2.5 text-right font-bold overflow-hidden truncate ${row.grossProfit >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.grossProfit)}</td>
                      <td className="p-2.5 text-right font-medium text-slate-505 overflow-hidden truncate">{row.grossProfitPct.toFixed(2)}%</td>
                      <td className="whitespace-nowrap p-2.5 text-center overflow-hidden truncate">
                        <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-655 hover:bg-slate-50 transition-colors outline-none focus:outline-none focus:ring-0 shadow-2xs cursor-pointer" type="button" onClick={() => setSelectedDeal(row)}>
                          รายละเอียด
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="block space-y-3 p-3 lg:hidden">
              {pagedRemainingPurchases.map((row) => <RemainingPurchaseCard key={row.id} row={row} />)}
              {!isLoading && remainingPurchases.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-455 font-semibold text-xs shadow-sm">ไม่มีต้นทุนซื้อมาขายไปคงเหลือ</div> : null}
            </div>

            <div className="hidden lg:block">
              <RemainingPurchaseTable rows={pagedRemainingPurchases} sortDirection={remainingSortDirection} sortKey={remainingSortKey} onSort={handleRemainingSort} />
            </div>
          </>
        )}
      </div>
      {selectedDeal ? <DealDetailModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} /> : null}
    </section>
  )
}

function Amount({ label, tone, value }: { label: string; tone: 'emerald' | 'purple' | 'red'; value: number }) {
  const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'purple' ? 'text-purple-700' : 'text-red-650'
  return <div><span className="block text-slate-405 font-semibold">{label}</span><span className={`font-bold tabular-nums text-xs ${color}`}>{formatMoney(value)}</span></div>
}

function RemainingPurchaseCard({ row }: { row: TradingPurchaseRow }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow space-y-2.5">
      <div className="flex justify-between gap-3 font-bold text-slate-800 border-b border-slate-100 pb-2">
        <span className="font-mono">{row.docNo}</span>
        <span className="text-slate-400 font-semibold">{formatDateDisplay(row.date)}</span>
      </div>
      <div className="text-slate-655 font-semibold">ผู้ขาย: {row.supplierName}</div>
      <div className="flex justify-between border-t border-slate-50 pt-2 font-semibold text-xs">
        <span className="text-slate-505">ต้นทุนรวม {formatMoney(row.totalAmount)}</span>
        <span className="text-amber-700 font-bold">คงเหลือ {formatMoney(row.remainingAmount)}</span>
      </div>
    </div>
  )
}

const remainingColumns: Array<ResizableColumnDefinition<RemainingColumnKey>> = [
  { key: 'docNo', defaultWidth: 120 },
  { key: 'date', defaultWidth: 90 },
  { key: 'supplierName', defaultWidth: 200 },
  { key: 'totalAmount', defaultWidth: 110 },
  { key: 'matchedAmount', defaultWidth: 110 },
  { key: 'remainingAmount', defaultWidth: 120 },
]

function RemainingPurchaseTable({
  onSort,
  rows,
  sortDirection,
  sortKey,
}: {
  onSort: (key: RemainingColumnKey) => void
  rows: TradingPurchaseRow[]
  sortDirection: SortDirection
  sortKey: RemainingColumnKey | null
}) {
  const columnResize = useResizableColumns('trading.matching.remaining.v5', remainingColumns)
  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
        <div className="font-bold text-emerald-755 text-sm">บิลซื้อซื้อมาขายไป / ต้นทุนที่ยังไม่ได้จับคู่</div>
        {columnResize.hasCustomWidths ? (
          <button className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="ns-table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {remainingColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <ResizableTableHead label="บิลซื้อ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={onSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'บิลซื้อ')} />
              <ResizableTableHead label="วันที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={onSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="ผู้ขาย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="supplierName" onSort={onSort} resizeProps={columnResize.getResizeHandleProps('supplierName', 'ผู้ขาย')} />
              <ResizableTableHead align="right" label="มูลค่า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="totalAmount" onSort={onSort} resizeProps={columnResize.getResizeHandleProps('totalAmount', 'มูลค่า')} />
              <ResizableTableHead align="right" label="จับคู่แล้ว" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="matchedAmount" onSort={onSort} resizeProps={columnResize.getResizeHandleProps('matchedAmount', 'จับคู่แล้ว')} />
              <ResizableTableHead align="right" label="ต้นทุนคงเหลือ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="remainingAmount" onSort={onSort} resizeProps={columnResize.getResizeHandleProps('remainingAmount', 'ต้นทุนคงเหลือ')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                <td className="p-2.5 font-mono font-medium overflow-hidden truncate">{row.docNo}</td>
                <td className="p-2.5 text-slate-505 font-medium overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                <td className="p-2.5 text-slate-800 font-medium overflow-hidden truncate">{row.supplierName}</td>
                <td className="p-2.5 text-right font-medium overflow-hidden truncate">{formatMoney(row.totalAmount)}</td>
                <td className="p-2.5 text-right text-slate-500 font-medium overflow-hidden truncate">{formatMoney(row.matchedAmount)}</td>
                <td className="p-2.5 text-right font-bold text-amber-700 overflow-hidden truncate">{formatMoney(row.remainingAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={6}>ไม่มีต้นทุนซื้อมาขายไปคงเหลือ</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Metric({ label, tone = 'slate', value }: { label: string; tone?: 'amber' | 'emerald' | 'purple' | 'red' | 'slate'; value: string }) {
  return <SharedKpiCard label={label} tone={tone} value={value} />
}

function DealDetailModal({ deal, onClose }: { deal: TradingDealRow; onClose: () => void }) {
  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden rounded-md border-0 bg-slate-900 !p-0 shadow-2xl outline-none focus:outline-none flex flex-col" fallbackTitle="รายละเอียด Deal" hideClose>
        <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-6 py-4 text-white">
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-white text-base font-bold">Sales Bill {deal.salesBillNo || '-'}</DialogTitle>
              <DialogDescription className="text-slate-300 text-xs mt-1">
                แหล่งต้นทุน {deal.purchaseBillNo || '-'} · {deal.productName}
              </DialogDescription>
            </div>
            <Button className="h-9 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm sm:p-5">
          <div className="grid gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow md:grid-cols-3">
            <Detail label="วันที่" value={deal.date || '-'} />
            <Detail label="จำนวน" value={formatMoney(deal.matchedQty)} />
            <Detail label="GP %" value={`${formatMoney(deal.grossProfitPct)}%`} />
            <div className="md:col-span-3">
              <Detail label="บิลซื้อ / ผู้ขาย" value={`${deal.purchaseBillNo || '-'} · ${deal.supplierName}`} />
            </div>
            <div className="md:col-span-3">
              <Detail label="บิลขาย / ลูกค้า" value={`${deal.salesBillNo || '-'} · ${deal.customerName}`} />
            </div>
            <Detail label="Cost" value={formatMoney(deal.matchedPurchaseAmount)} />
            <Detail label="Sales" value={formatMoney(deal.matchedSalesAmount)} />
            <Detail label="GP คาดการณ์" value={formatMoney(deal.grossProfit)} />
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col py-1">
      <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-slate-850 sm:text-sm">{value}</div>
    </div>
  )
}
