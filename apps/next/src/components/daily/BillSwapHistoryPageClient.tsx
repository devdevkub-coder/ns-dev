'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, Coins, Scale } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
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
  { defaultWidth: 110, key: 'weight', minWidth: 90 },
  { defaultWidth: 100, key: 'beforePrice', minWidth: 80 },
  { defaultWidth: 100, key: 'afterPrice', minWidth: 80 },
  { defaultWidth: 120, key: 'beforeAmount', minWidth: 95 },
  { defaultWidth: 120, key: 'afterAmount', minWidth: 95 },
  { defaultWidth: 120, key: 'diff', minWidth: 95 },
  { defaultWidth: 220, key: 'reason', minWidth: 160 },
]

function getDiffTextColors(diff: number) {
  if (diff === 0) {
    return {
      text: 'text-slate-700',
      iconBg: 'bg-slate-100',
      iconColor: 'text-slate-600',
      valueColor: 'text-slate-900',
    }
  }
  if (diff < 0) {
    return {
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-700',
    }
  }
  return {
    text: 'text-red-600',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    valueColor: 'text-rose-600',
  }
}

export function BillSwapHistoryPageClient({ tableKey = 'daily.bill-swap-history.v5' }: { tableKey?: string }) {
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

  const diffColors = useMemo(() => getDiffTextColors(totals.diff), [totals.diff])

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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi
          icon={<Scale className="size-5" />}
          label="น้ำหนักรวม (กก.)"
          value={formatMoney(totals.weight)}
          iconBgColor="bg-blue-50"
          iconColor="text-blue-600"
        />
        <Kpi
          icon={<ArrowUpDown className="size-5" />}
          label="ยอดเก่า / ยอดใหม่"
          value={`${formatMoney(totals.before)} / ${formatMoney(totals.after)}`}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
        />
        <Kpi
          icon={<Coins className="size-5" />}
          label="ส่วนต่างรวม (ก่อน VAT)"
          value={formatMoney(totals.diff)}
          iconBgColor={diffColors.iconBg}
          iconColor={diffColors.iconColor}
          valueColor={diffColors.valueColor}
        />
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
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
          {hasCustomWidths ? <Button size="sm" type="button" variant="outline" className="hidden lg:inline-flex" onClick={resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <PageSizeDropdown value={pageSize} onChange={setPageSize} />
          <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        
        {!isLoading && pagedRows.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-2">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 text-sm">{row.billDocNo || row.billId}</span>
              <span className="text-xs text-slate-500">{row.swapDate}</span>
            </div>
            
            <div className="text-xs text-slate-600 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">Supplier เดิม: </span>
                <span className="text-rose-600">{row.beforeSupplierName}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Supplier ใหม่: </span>
                <span className="text-emerald-700">{row.afterSupplierName}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">สินค้า/รายการ: </span>
                <span className="text-slate-800">{row.productName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-slate-500 block">น้ำหนัก: </span>
                  <span className="text-slate-800">{formatMoney(row.weight)} กก.</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">ส่วนต่าง (ก่อน VAT): </span>
                  <span className={`font-bold tabular-nums ${getDiffTextColors(row.diffExVat).text}`}>
                    {formatMoney(row.diffExVat)} บาท
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60 mt-1">
                <div>
                  <span className="font-semibold text-slate-400 block">ยอดเก่า: </span>
                  <span className="text-rose-600 tabular-nums">{formatMoney(row.beforeAmount)} บาท</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block">ยอดใหม่: </span>
                  <span className="text-emerald-700 tabular-nums">{formatMoney(row.afterAmount)} บาท</span>
                </div>
              </div>
              {row.reason?.trim() ? (
                <div className="text-xs text-slate-400 pt-1 border-t border-slate-100/60 mt-1 truncate">
                  เหตุผล: {row.reason}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {!isLoading && totalRows === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            ยังไม่มีประวัติการเปลี่ยน Supplier
          </div>
        ) : null}
      </div>

      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="ns-table w-full text-xs" style={{ minWidth: tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {billSwapColumns.map((column) => {
              const style = getColumnStyle(column.key);
              return <col key={column.key} style={style} />;
            })}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
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
                <td className="p-2 text-xs font-semibold text-slate-700 whitespace-nowrap">{row.swapDate}</td>
                <td className="p-2 text-xs font-semibold text-slate-700 truncate" title={row.billDocNo || row.billId}>{row.billDocNo || row.billId}</td>
                <td className="p-2 text-xs font-semibold text-rose-600 truncate" title={row.beforeSupplierName}>{row.beforeSupplierName}</td>
                <td className="p-2 text-xs font-semibold text-emerald-700 truncate" title={row.afterSupplierName}>{row.afterSupplierName}</td>
                <td className="p-2 text-xs font-semibold text-slate-700 truncate" title={row.productName}>{row.productName}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.weight)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-rose-600 tabular-nums">{formatMoney(row.beforePrice)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{formatMoney(row.afterPrice)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-rose-600 tabular-nums">{formatMoney(row.beforeAmount)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{formatMoney(row.afterAmount)}</td>
                <td className={`p-2 pr-4 text-right text-xs font-semibold tabular-nums ${getDiffTextColors(row.diffExVat).text}`}>{formatMoney(row.diffExVat)}</td>
                <td className="p-2 text-xs font-semibold text-slate-700 truncate" title={row.reason || ''}>{row.reason || '-'}</td>
              </tr>
            ))}
            {!isLoading && totalRows === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ยังไม่มีประวัติการเปลี่ยน Supplier</td></tr> : null}
          </tbody>
          {totalRows > 0 ? (
            <tfoot className="bg-slate-50/50 border-t border-slate-100">
              <tr className="text-xs font-semibold">
                <td className="p-2 text-right text-slate-700" colSpan={5}>รวม</td>
                <td className="p-2 pr-4 text-right text-slate-700 tabular-nums">{formatMoney(totals.weight)}</td>
                <td className="p-2" colSpan={2} />
                <td className="p-2 pr-4 text-right text-rose-600 tabular-nums">{formatMoney(totals.before)}</td>
                <td className="p-2 pr-4 text-right text-emerald-700 tabular-nums">{formatMoney(totals.after)}</td>
                <td className={`p-2 pr-4 text-right tabular-nums ${diffColors.text}`}>{formatMoney(totals.diff)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  )
}

interface KpiProps {
  icon: React.ReactNode
  label: string
  value: string
  iconBgColor: string
  iconColor: string
  valueColor?: string
}

function Kpi({ icon, label, value, iconColor, valueColor = 'text-slate-900' }: KpiProps) {
  const colorClass = `${iconColor} ${valueColor}`
  const tone = colorClass.includes('emerald') ? 'emerald' : colorClass.includes('amber') ? 'amber' : colorClass.includes('red') ? 'red' : colorClass.includes('blue') ? 'blue' : 'slate'
  return <SharedKpiCard icon={icon} label={label} tone={tone} value={value} />
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
