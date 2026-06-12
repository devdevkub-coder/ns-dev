'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type Row = {
  afterAmount: number
  afterPrice: number
  afterSupplierId: string
  afterSupplierName?: string
  beforeAmount: number
  beforePrice: number
  beforeSupplierId: string
  beforeSupplierName?: string
  billDocNo?: string
  billId: string
  changedBy: string
  id: string
  itemIndex: number | null
  reason: string
  swapDate: string
}

type BillSwapColumnKey =
  | 'swapDate'
  | 'billDocNo'
  | 'beforeSupplier'
  | 'afterSupplier'
  | 'product'
  | 'weight'
  | 'beforePrice'
  | 'afterPrice'
  | 'beforeAmount'
  | 'afterAmount'
  | 'diff'
  | 'reason'
type BillSwapSortDirection = 'asc' | 'desc'
type BillSwapSortKey = BillSwapColumnKey

const billSwapColumns: Array<ResizableColumnDefinition<BillSwapColumnKey>> = [
  { defaultWidth: 120, key: 'swapDate', minWidth: 100 },
  { defaultWidth: 140, key: 'billDocNo', minWidth: 120 },
  { defaultWidth: 220, key: 'beforeSupplier', minWidth: 140 },
  { defaultWidth: 220, key: 'afterSupplier', minWidth: 140 },
  { defaultWidth: 180, key: 'product', minWidth: 120 },
  { defaultWidth: 85, key: 'weight', minWidth: 80 },
  { defaultWidth: 80, key: 'beforePrice', minWidth: 70 },
  { defaultWidth: 80, key: 'afterPrice', minWidth: 70 },
  { defaultWidth: 90, key: 'beforeAmount', minWidth: 80 },
  { defaultWidth: 90, key: 'afterAmount', minWidth: 80 },
  { defaultWidth: 90, key: 'diff', minWidth: 80 },
  { defaultWidth: 220, key: 'reason', minWidth: 160 },
]

export function BillSwapHistoryPageClient({ tableKey = 'daily.bill-swap-history' }: { tableKey?: string }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const [sortDirection, setSortDirection] = useState<BillSwapSortDirection>('desc')
  const [sortKey, setSortKey] = useState<BillSwapSortKey>('swapDate')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<{ rows: Row[] }>('/api/daily/bill-swap-history')
      setRows(payload.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดประวัติเปลี่ยน Supplier ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, pageSize, search])

  const enrichedRows = useMemo(() => rows.map(enrichBillSwapRow), [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return enrichedRows.filter((row) => {
      const inDateRange = (!dateFrom || row.swapDate >= dateFrom) && (!dateTo || row.swapDate <= dateTo)
      if (!inDateRange) return false
      return !query || `${row.billDocNo} ${row.billId} ${row.beforeSupplierName} ${row.afterSupplierName} ${row.productName} ${row.reason}`.toLowerCase().includes(query)
    })
  }, [dateFrom, dateTo, enrichedRows, search])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...filteredRows].sort((left, right) => {
      const leftValue = billSwapSortValue(left, sortKey)
      const rightValue = billSwapSortValue(right, sortKey)
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction
      return String(leftValue).localeCompare(String(rightValue), 'th') * direction
    })
  }, [filteredRows, sortDirection, sortKey])

  const totals = useMemo(() => ({
    after: filteredRows.reduce((sum, row) => sum + row.afterAmount, 0),
    before: filteredRows.reduce((sum, row) => sum + row.beforeAmount, 0),
    diff: filteredRows.reduce((sum, row) => sum + row.diffExVat, 0),
    rows: filteredRows.length,
    weight: filteredRows.reduce((sum, row) => sum + row.weight, 0),
  }), [filteredRows])

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasActiveFilter = Boolean(search || dateFrom || dateTo)
  const {
    getColumnStyle,
    getResizeHandleProps,
    hasCustomWidths,
    resetColumnWidths,
    tableMinWidth,
  } = useResizableColumns(tableKey, billSwapColumns)

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  function changeSort(nextKey: BillSwapSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'beforeSupplier' || nextKey === 'afterSupplier' || nextKey === 'product' || nextKey === 'reason' ? 'asc' : 'desc')
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi label="จำนวนรายการเปลี่ยน" value={totals.rows.toLocaleString('th-TH')} tone="white" />
        <Kpi label="น้ำหนักรวม (กก.)" value={formatMoney(totals.weight)} tone="blue" />
        <Kpi label="ยอดเก่า / ยอดใหม่" value={`${formatMoney(totals.before)} / ${formatMoney(totals.after)}`} tone="slate" />
        <Kpi label="ส่วนต่างรวม (ก่อน VAT)" value={formatMoney(totals.diff)} tone={totals.diff >= 0 ? 'emerald' : 'red'} />
      </div>

      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[260px] flex-1 rounded-md"
            placeholder="ค้นหาชื่อ Supplier / สินค้า / บิล..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="text-xs text-slate-500">วันที่:</span>
          <DatePickerInput id="bill-swap-history-date-from" value={dateFrom} onChange={setDateFrom} />
          <span className="text-slate-400">→</span>
          <DatePickerInput id="bill-swap-history-date-to" value={dateTo} onChange={setDateTo} />
          {hasActiveFilter ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={resetColumnWidths}>Set col to default</Button> : null}
          <Select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto px-2 py-1"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </Select>
          <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full text-xs" style={{ minWidth: tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {billSwapColumns.map((column) => <col key={column.key} style={getColumnStyle(column.key)} />)}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="วันที่" resizeProps={getResizeHandleProps('swapDate', 'วันที่')} sortKey="swapDate" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="บิลซื้อ" resizeProps={getResizeHandleProps('billDocNo', 'บิลซื้อ')} sortKey="billDocNo" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="Supplier เดิม" resizeProps={getResizeHandleProps('beforeSupplier', 'Supplier เดิม')} sortKey="beforeSupplier" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="Supplier ใหม่" resizeProps={getResizeHandleProps('afterSupplier', 'Supplier ใหม่')} sortKey="afterSupplier" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="สินค้า" resizeProps={getResizeHandleProps('product', 'สินค้า')} sortKey="product" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="น้ำหนัก (กก.)" resizeProps={getResizeHandleProps('weight', 'น้ำหนัก (กก.)')} sortKey="weight" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ราคาเก่า" resizeProps={getResizeHandleProps('beforePrice', 'ราคาเก่า')} sortKey="beforePrice" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ราคาใหม่" resizeProps={getResizeHandleProps('afterPrice', 'ราคาใหม่')} sortKey="afterPrice" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอดเก่า (ก่อน VAT)" resizeProps={getResizeHandleProps('beforeAmount', 'ยอดเก่า (ก่อน VAT)')} sortKey="beforeAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอดใหม่ (ก่อน VAT)" resizeProps={getResizeHandleProps('afterAmount', 'ยอดใหม่ (ก่อน VAT)')} sortKey="afterAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ส่วนต่าง (ก่อน VAT)" resizeProps={getResizeHandleProps('diff', 'ส่วนต่าง (ก่อน VAT)')} sortKey="diff" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เหตุผล" resizeProps={getResizeHandleProps('reason', 'เหตุผล')} sortKey="reason" onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && pagedRows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.swapDate}</td>
                <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.billDocNo || row.billId}</td>
                <td className="p-2 text-xs font-semibold text-rose-600">{row.beforeSupplierName}</td>
                <td className="p-2 text-xs font-semibold text-emerald-700">{row.afterSupplierName}</td>
                <td className="p-2 text-xs font-semibold text-slate-700">{row.productName}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.weight)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-rose-600 tabular-nums">{formatMoney(row.beforePrice)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{formatMoney(row.afterPrice)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-rose-600 tabular-nums">{formatMoney(row.beforeAmount)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{formatMoney(row.afterAmount)}</td>
                <td className={`p-2 pr-4 text-right text-xs font-semibold tabular-nums ${row.diffExVat >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.diffExVat)}</td>
                <td className="max-w-60 truncate p-2 text-xs font-semibold text-slate-700">{row.reason || '-'}</td>
              </tr>
            ))}
            {!isLoading && totalRows === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ยังไม่มีประวัติการเปลี่ยน Supplier</td></tr> : null}
          </tbody>
          {totalRows > 0 ? (
            <tfoot>
              <tr className="bg-slate-100 text-xs font-semibold">
                <td className="p-2 text-right text-slate-700" colSpan={5}>รวม</td>
                <td className="p-2 pr-4 text-right text-slate-700 tabular-nums">{formatMoney(totals.weight)}</td>
                <td className="p-2" colSpan={2} />
                <td className="p-2 pr-4 text-right text-rose-600 tabular-nums">{formatMoney(totals.before)}</td>
                <td className="p-2 pr-4 text-right text-emerald-700 tabular-nums">{formatMoney(totals.after)}</td>
                <td className={`p-2 pr-4 text-right tabular-nums ${totals.diff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(totals.diff)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  )
}

function Kpi({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'red' | 'slate' | 'white'; value: string }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-50 text-slate-800',
    white: 'bg-white text-slate-900',
  }
  return <div className={`rounded-md p-3 shadow ${tones[tone]}`}><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>
}

function billSwapSortValue(row: ReturnType<typeof enrichBillSwapRow>, sort: BillSwapSortKey) {
  const values: Record<BillSwapSortKey, number | string> = {
    afterAmount: row.afterAmount,
    afterPrice: row.afterPrice,
    afterSupplier: row.afterSupplierName,
    beforeAmount: row.beforeAmount,
    beforePrice: row.beforePrice,
    beforeSupplier: row.beforeSupplierName,
    billDocNo: row.billDocNo || row.billId,
    diff: row.diffExVat,
    product: row.productName,
    reason: row.reason || '',
    swapDate: row.swapDate,
    weight: row.weight,
  }
  return values[sort]
}

function enrichBillSwapRow(row: Row) {
  const weight = row.beforePrice > 0 ? row.beforeAmount / row.beforePrice : row.afterPrice > 0 ? row.afterAmount / row.afterPrice : 0
  return {
    ...row,
    afterSupplierName: row.afterSupplierName || row.afterSupplierId || '-',
    beforeSupplierName: row.beforeSupplierName || row.beforeSupplierId || '-',
    diffExVat: row.afterAmount - row.beforeAmount,
    productName: row.itemIndex === null ? row.billDocNo || row.billId : `รายการ #${row.itemIndex + 1}`,
    weight,
  }
}
