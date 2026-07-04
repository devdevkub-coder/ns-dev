'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Download } from 'lucide-react'

type OutstandingRow = { date: string; docNo: string; expectedDelivery: string; id: string; partnerName: string; productId: string; productName: string; qty: number; receivedQty?: number; remainingQty: number; remainingValue: number; soldQty?: number; status: string; unitPrice: number }
type OutstandingPayload = {
  buyRows: OutstandingRow[]
  sellRows: OutstandingRow[]
  summary: { buyCount: number; buyRemainingQty: number; buyRemainingValue: number; sellCount: number; sellRemainingQty: number; sellRemainingValue: number }
}

type PoOutstandingBuyColumnKey = 'costAllocation' | 'docNo' | 'date' | 'partnerName' | 'productName' | 'qty' | 'unitPrice' | 'receivedQty' | 'remainingQty' | 'remainingValue' | 'expectedDelivery' | 'status'

const buyColumns: Array<ResizableColumnDefinition<PoOutstandingBuyColumnKey>> = [
  { key: 'costAllocation', defaultWidth: 70, minWidth: 60 },
  { key: 'docNo', defaultWidth: 120, minWidth: 100 },
  { key: 'date', defaultWidth: 90, minWidth: 80 },
  { key: 'partnerName', defaultWidth: 160, minWidth: 120 },
  { key: 'productName', defaultWidth: 160, minWidth: 120 },
  { key: 'qty', defaultWidth: 100, minWidth: 80 },
  { key: 'unitPrice', defaultWidth: 100, minWidth: 80 },
  { key: 'receivedQty', defaultWidth: 100, minWidth: 80 },
  { key: 'remainingQty', defaultWidth: 100, minWidth: 80 },
  { key: 'remainingValue', defaultWidth: 110, minWidth: 90 },
  { key: 'expectedDelivery', defaultWidth: 100, minWidth: 80 },
  { key: 'status', defaultWidth: 80, minWidth: 70 },
]

type PoOutstandingSellColumnKey = 'docNo' | 'date' | 'partnerName' | 'productName' | 'qty' | 'unitPrice' | 'soldQty' | 'remainingQty' | 'remainingValue' | 'expectedDelivery' | 'status'

const sellColumns: Array<ResizableColumnDefinition<PoOutstandingSellColumnKey>> = [
  { key: 'docNo', defaultWidth: 120, minWidth: 100 },
  { key: 'date', defaultWidth: 90, minWidth: 80 },
  { key: 'partnerName', defaultWidth: 160, minWidth: 120 },
  { key: 'productName', defaultWidth: 160, minWidth: 120 },
  { key: 'qty', defaultWidth: 100, minWidth: 80 },
  { key: 'unitPrice', defaultWidth: 100, minWidth: 80 },
  { key: 'soldQty', defaultWidth: 100, minWidth: 80 },
  { key: 'remainingQty', defaultWidth: 100, minWidth: 80 },
  { key: 'remainingValue', defaultWidth: 110, minWidth: 90 },
  { key: 'expectedDelivery', defaultWidth: 100, minWidth: 80 },
  { key: 'status', defaultWidth: 80, minWidth: 70 },
]

export function PoOutstandingPageClient() {
  const [data, setData] = useState<OutstandingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [sortKey, setSortKey] = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [partnerFilter, productFilter, search, tab])

  const buyResize = useResizableColumns('po-reports.outstanding.buy.v5', buyColumns)
  const sellResize = useResizableColumns('po-reports.outstanding.sell.v5', sellColumns)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<OutstandingPayload>('/api/po-reports/outstanding'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด PO Outstanding ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = tab === 'buy' ? data?.buyRows ?? [] : data?.sellRows ?? []
    return source
      .filter((row) => !partnerFilter || row.partnerName === partnerFilter)
      .filter((row) => !productFilter || row.productId === productFilter)
      .filter((row) => !query || `${row.docNo} ${row.partnerName} ${row.productName}`.toLowerCase().includes(query))
  }, [data?.buyRows, data?.sellRows, partnerFilter, productFilter, search, tab])

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (sortKey) {
      result.sort((a, b) => {
        let valA: any = a[sortKey as keyof OutstandingRow]
        let valB: any = b[sortKey as keyof OutstandingRow]

        if (sortKey === 'receivedQty' && tab === 'buy') {
          valA = a.receivedQty ?? (a.qty - a.remainingQty)
          valB = b.receivedQty ?? (b.qty - b.remainingQty)
        } else if (sortKey === 'soldQty' && tab === 'sell') {
          valA = a.soldQty ?? (a.qty - a.remainingQty)
          valB = b.soldQty ?? (b.qty - b.remainingQty)
        }

        if (valA === undefined || valA === null) return 1
        if (valB === undefined || valB === null) return -1

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA
        }

        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB), 'th', { numeric: true })
          : String(valB).localeCompare(String(valA), 'th', { numeric: true })
      })
    }
    return result
  }, [rows, sortKey, sortDirection, tab])

  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const totals = useMemo(() => ({
    lines: rows.length,
    remainingQty: rows.reduce((sum, row) => sum + row.remainingQty, 0),
    remainingValue: rows.reduce((sum, row) => sum + row.remainingValue, 0),
    totalQty: rows.reduce((sum, row) => sum + row.qty, 0),
  }), [rows])

  const partnerOptions = useMemo(() => [...new Set((tab === 'buy' ? data?.buyRows ?? [] : data?.sellRows ?? []).map((row) => row.partnerName).filter(Boolean))].sort(), [data?.buyRows, data?.sellRows, tab])
  const productOptions = useMemo(() => [...new Map((tab === 'buy' ? data?.buyRows ?? [] : data?.sellRows ?? []).filter((row) => row.productId).map((row) => [row.productId, row.productName || row.productId])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data?.buyRows, data?.sellRows, tab])

  const partnerSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return partnerOptions.map((partner) => ({
      id: partner,
      label: partner,
    }))
  }, [partnerOptions])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return productOptions.map(([id, name]) => ({
      id: id,
      label: name,
    }))
  }, [productOptions])

  function exportCsv() {
    const header = tab === 'buy'
      ? ['เลขที่', 'วันที่', 'Supplier', 'สินค้า', 'จำนวน', 'ราคา', 'รับแล้ว', 'รอรับ', 'มูลค่ารอรับ', 'สถานะ']
      : ['เลขที่', 'วันที่', 'Customer', 'สินค้า', 'จำนวน', 'ราคาขาย', 'ขายแล้ว', 'รอส่ง', 'มูลค่ารอส่ง', 'สถานะ']
    const body = rows.map((row) => tab === 'buy'
      ? [row.docNo, row.date, row.partnerName, row.productName, row.qty, row.unitPrice, row.receivedQty ?? row.qty - row.remainingQty, row.remainingQty, row.remainingValue, row.status]
      : [row.docNo, row.date, row.partnerName, row.productName, row.qty, row.unitPrice, row.soldQty ?? row.qty - row.remainingQty, row.remainingQty, row.remainingValue, row.status])
    const csv = [header, ...body].map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `po_${tab}_outstanding_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <button
          className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors outline-none focus:ring-0 ${
            tab === 'buy'
              ? 'bg-[#0F172A] text-white hover:bg-[#1E293B]'
              : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
          type="button"
          onClick={() => {
            setTab('buy')
            setPartnerFilter('')
            setProductFilter('')
            setSortKey(undefined)
          }}
        >
          PO ซื้อ คงเหลือ ({data?.summary.buyCount ?? 0})
        </button>
        <button
          className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors outline-none focus:ring-0 ${
            tab === 'sell'
              ? 'bg-[#0F172A] text-white hover:bg-[#1E293B]'
              : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
          type="button"
          onClick={() => {
            setTab('sell')
            setPartnerFilter('')
            setProductFilter('')
            setSortKey(undefined)
          }}
        >
          PO ขาย คงเหลือ ({data?.summary.sellCount ?? 0})
        </button>

        <div className="ml-auto flex items-center gap-2">
          {tab === 'buy' && buyResize.hasCustomWidths && (
            <button
              className="hidden h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 outline-none focus:ring-0 lg:inline-flex"
              type="button"
              onClick={buyResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          )}
          {tab === 'sell' && sellResize.hasCustomWidths && (
            <button
              className="hidden h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 outline-none focus:ring-0 lg:inline-flex"
              type="button"
              onClick={sellResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          )}

          <button
            className="hidden h-9 items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 outline-none focus:ring-0 lg:inline-flex"
            type="button"
            onClick={exportCsv}
          >
            <Download className="h-4 w-4" /> ส่งออก CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="รายการคงเหลือ" tone={tab === 'buy' ? 'blue' : 'emerald'} emoji="📄" value={`${totals.lines}`} />
        <Metric label="น้ำหนักรวม" tone="slate" emoji="⚖️" value={`${formatMoney(totals.totalQty)} กก.`} />
        <Metric label={tab === 'buy' ? 'รอรับของ' : 'รอส่งของ'} tone="amber" emoji="📦" value={`${formatMoney(totals.remainingQty)} กก.`} />
        <Metric label={tab === 'buy' ? 'มูลค่ารอรับ' : 'มูลค่ารอส่ง'} tone={tab === 'buy' ? 'blue' : 'emerald'} emoji="💰" value={formatMoney(totals.remainingValue)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <input
          className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-slate-400 focus:ring-0"
          placeholder="ค้นหา PO / คู่ค้า / สินค้า"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="min-w-[180px]">
          <SearchCombobox
            inputId="outstanding-partner-filter"
            label={tab === 'buy' ? 'Supplier' : 'Customer'}
            hideLabel
            placeholder={tab === 'buy' ? 'ทุก Supplier' : 'ทุก Customer'}
            options={partnerSearchOptions}
            value={partnerFilter}
            onChange={setPartnerFilter}
          />
        </div>
        <div className="min-w-[180px]">
          <SearchCombobox
            inputId="outstanding-product-filter"
            label="สินค้า"
            hideLabel
            placeholder="ทุกสินค้า"
            options={productSearchOptions}
            value={productFilter}
            onChange={setProductFilter}
          />
        </div>
      </div>

      {/* Table Card Controls */}
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
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

      {tab === 'buy' ? (
        <div className="hidden overflow-x-auto lg:block">
          <div className="rounded-t-md border-b border-amber-200 bg-amber-50/50 p-3 text-xs font-medium text-amber-800">
            ตัดต้นทุนเป็น write/cost-pool side effect ใน legacy จึงแสดงเป็นคอลัมน์อ่านอย่างเดียวใน Next จนกว่าจะออกแบบ audit และ permission
          </div>
          <table className="w-full text-xs" style={{ minWidth: buyResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {buyColumns.map((column) => {
                const style = buyResize.getColumnStyle(column.key)
                return <col key={column.key} style={style} />
              })}
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600">
              <tr>
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="center"
                  direction={sortDirection}
                  label="ตัดต้นทุน"
                  resizeProps={buyResize.getResizeHandleProps('costAllocation', 'ตัดต้นทุน')}
                  sortKey="costAllocation"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="เลขที่"
                  resizeProps={buyResize.getResizeHandleProps('docNo', 'เลขที่')}
                  sortKey="docNo"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="วันที่"
                  resizeProps={buyResize.getResizeHandleProps('date', 'วันที่')}
                  sortKey="date"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="Supplier"
                  resizeProps={buyResize.getResizeHandleProps('partnerName', 'Supplier')}
                  sortKey="partnerName"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="สินค้า"
                  resizeProps={buyResize.getResizeHandleProps('productName', 'สินค้า')}
                  sortKey="productName"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="จำนวนสั่ง"
                  resizeProps={buyResize.getResizeHandleProps('qty', 'จำนวนสั่ง')}
                  sortKey="qty"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="ราคา/หน่วย"
                  resizeProps={buyResize.getResizeHandleProps('unitPrice', 'ราคา/หน่วย')}
                  sortKey="unitPrice"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="รับแล้ว"
                  resizeProps={buyResize.getResizeHandleProps('receivedQty', 'รับแล้ว')}
                  sortKey="receivedQty"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="รอรับ"
                  resizeProps={buyResize.getResizeHandleProps('remainingQty', 'รอรับ')}
                  sortKey="remainingQty"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="มูลค่ารอรับ"
                  resizeProps={buyResize.getResizeHandleProps('remainingValue', 'มูลค่ารอรับ')}
                  sortKey="remainingValue"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="วันส่งมอบ"
                  resizeProps={buyResize.getResizeHandleProps('expectedDelivery', 'วันส่งมอบ')}
                  sortKey="expectedDelivery"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="center"
                  direction={sortDirection}
                  label="สถานะ"
                  resizeProps={buyResize.getResizeHandleProps('status', 'สถานะ')}
                  sortKey="status"
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="p-6 text-center text-slate-500" colSpan={12}>
                    กำลังโหลดข้อมูล
                  </td>
                </tr>
              ) : null}
              {!isLoading &&
                pagedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2 text-center">
                      <input className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 outline-none" disabled type="checkbox" title="รอออกแบบ cost-pool write/audit" />
                    </td>
                    <td className="p-2 font-mono text-xs text-slate-600 truncate">{row.docNo}</td>
                    <td className="p-2 text-slate-800">{formatDateDisplay(row.date)}</td>
                    <td className="p-2 text-slate-800 truncate">{row.partnerName}</td>
                    <td className="p-2 text-slate-800 truncate">{row.productName || '-'}</td>
                    <td className="p-2 text-right text-slate-800 tabular-nums">{formatMoney(row.qty)}</td>
                    <td className="p-2 text-right text-slate-800 tabular-nums">{formatMoney(row.unitPrice)}</td>
                    <td className="p-2 text-right text-emerald-700 tabular-nums">{formatMoney(row.receivedQty ?? row.qty - row.remainingQty)}</td>
                    <td className="p-2 text-right font-bold text-amber-700 tabular-nums">{formatMoney(row.remainingQty)}</td>
                    <td className="p-2 text-right font-bold text-blue-700 tabular-nums">{formatMoney(row.remainingValue)}</td>
                    <td className="p-2 text-slate-800">{formatDateDisplay(row.expectedDelivery)}</td>
                    <td className="p-2 text-center text-xs font-semibold text-slate-600">{row.status}</td>
                  </tr>
                ))}
              {!isLoading && sortedRows.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-400 font-medium" colSpan={12}>
                    ไม่มี PO ซื้อค้างรับ
                  </td>
                </tr>
              ) : null}
            </tbody>
            {sortedRows.length ? (
              <tfoot className="bg-slate-50 border-t border-slate-100 font-bold text-slate-800">
                <tr>
                  <td />
                  <td className="p-2 text-right" colSpan={7}>
                    รวม {sortedRows.length} รายการ
                  </td>
                  <td className="p-2 text-right text-amber-700 tabular-nums">{formatMoney(totals.remainingQty)}</td>
                  <td className="p-2 text-right text-blue-700 tabular-nums">{formatMoney(totals.remainingValue)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-xs" style={{ minWidth: sellResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {sellColumns.map((column) => {
                const style = sellResize.getColumnStyle(column.key)
                return <col key={column.key} style={style} />
              })}
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600">
              <tr>
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="เลขที่"
                  resizeProps={sellResize.getResizeHandleProps('docNo', 'เลขที่')}
                  sortKey="docNo"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="วันที่"
                  resizeProps={sellResize.getResizeHandleProps('date', 'วันที่')}
                  sortKey="date"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="Customer"
                  resizeProps={sellResize.getResizeHandleProps('partnerName', 'Customer')}
                  sortKey="partnerName"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="สินค้า"
                  resizeProps={sellResize.getResizeHandleProps('productName', 'สินค้า')}
                  sortKey="productName"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="จำนวนขาย"
                  resizeProps={sellResize.getResizeHandleProps('qty', 'จำนวนขาย')}
                  sortKey="qty"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="ราคาขาย"
                  resizeProps={sellResize.getResizeHandleProps('unitPrice', 'ราคาขาย')}
                  sortKey="unitPrice"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="ขายแล้ว"
                  resizeProps={sellResize.getResizeHandleProps('soldQty', 'ขายแล้ว')}
                  sortKey="soldQty"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="รอส่ง"
                  resizeProps={sellResize.getResizeHandleProps('remainingQty', 'รอส่ง')}
                  sortKey="remainingQty"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="right"
                  direction={sortDirection}
                  label="มูลค่ารอส่ง"
                  resizeProps={sellResize.getResizeHandleProps('remainingValue', 'มูลค่ารอส่ง')}
                  sortKey="remainingValue"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="left"
                  direction={sortDirection}
                  label="วันส่งมอบ"
                  resizeProps={sellResize.getResizeHandleProps('expectedDelivery', 'วันส่งมอบ')}
                  sortKey="expectedDelivery"
                  onSort={handleSort}
                />
                <ResizableTableHead
                  activeSortKey={sortKey}
                  align="center"
                  direction={sortDirection}
                  label="สถานะ"
                  resizeProps={sellResize.getResizeHandleProps('status', 'สถานะ')}
                  sortKey="status"
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="p-6 text-center text-slate-500" colSpan={11}>
                    กำลังโหลดข้อมูล
                  </td>
                </tr>
              ) : null}
              {!isLoading &&
                pagedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2 font-mono text-xs text-slate-600 truncate">{row.docNo}</td>
                    <td className="p-2 text-slate-800">{formatDateDisplay(row.date)}</td>
                    <td className="p-2 text-slate-800 truncate">{row.partnerName}</td>
                    <td className="p-2 text-slate-800 truncate">{row.productName || '-'}</td>
                    <td className="p-2 text-right text-slate-800 tabular-nums">{formatMoney(row.qty)}</td>
                    <td className="p-2 text-right text-slate-800 tabular-nums">{formatMoney(row.unitPrice)}</td>
                    <td className="p-2 text-right text-blue-700 tabular-nums">{formatMoney(row.soldQty ?? row.qty - row.remainingQty)}</td>
                    <td className="p-2 text-right font-bold text-amber-700 tabular-nums">{formatMoney(row.remainingQty)}</td>
                    <td className="p-2 text-right font-bold text-emerald-700 tabular-nums">{formatMoney(row.remainingValue)}</td>
                    <td className="p-2 text-slate-800">{formatDateDisplay(row.expectedDelivery)}</td>
                    <td className="p-2 text-center text-xs font-semibold text-slate-600">{row.status}</td>
                  </tr>
                ))}
              {!isLoading && sortedRows.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-400 font-medium" colSpan={11}>
                    ไม่มี PO ขายค้างส่ง
                  </td>
                </tr>
              ) : null}
            </tbody>
            {sortedRows.length ? (
              <tfoot className="bg-slate-50 border-t border-slate-100 font-bold text-slate-800">
                <tr>
                  <td className="p-2 text-right" colSpan={7}>
                    รวม {sortedRows.length} รายการ
                  </td>
                  <td className="p-2 text-right text-amber-700 tabular-nums">{formatMoney(totals.remainingQty)}</td>
                  <td className="p-2 text-right text-emerald-700 tabular-nums">{formatMoney(totals.remainingValue)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}

      {/* Mobile Card list */}
      <div className="block divide-y divide-slate-100 lg:hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล</div>
        ) : null}

        {!isLoading && pagedRows.map((row) => (
          <div key={row.id} className="space-y-2 p-4">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">{tab === 'buy' ? 'Supplier' : 'Customer'}: </span>
                <span className="text-slate-800 font-medium">{row.partnerName}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">สินค้า: </span>
                <span className="text-slate-800 font-medium">{row.productName || '-'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-slate-400 block">ราคา/หน่วย: </span>
                  <span className="text-slate-800 font-medium">{formatMoney(row.unitPrice)} บาท</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block">จำนวนสั่ง: </span>
                  <span className="text-slate-800 font-medium">{formatMoney(row.qty)} กก.</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 mt-1">
                <div>
                  <span className="font-semibold text-slate-400 block">{tab === 'buy' ? 'รับแล้ว' : 'ส่งแล้ว'}: </span>
                  <span className="text-emerald-600 font-medium tabular-nums">
                    {formatMoney(tab === 'buy' ? (row.receivedQty ?? row.qty - row.remainingQty) : (row.soldQty ?? row.qty - row.remainingQty))}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">{tab === 'buy' ? 'รอรับ' : 'รอส่ง'}: </span>
                  <span className="text-amber-700 font-bold tabular-nums">{formatMoney(row.remainingQty)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">มูลค่าคงค้าง: </span>
                  <span className={`font-bold tabular-nums ${tab === 'buy' ? 'text-blue-700' : 'text-emerald-700'}`}>{formatMoney(row.remainingValue)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400 pt-1 border-t border-slate-100 mt-1">
                <span>ส่งมอบ: {formatDateDisplay(row.expectedDelivery)}</span>
                <span className="font-semibold text-slate-500">{row.status}</span>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && rows.length === 0 ? (
          <div className="p-8 text-center font-medium text-slate-400">
            {tab === 'buy' ? 'ไม่มี PO ซื้อค้างรับ' : 'ไม่มี PO ขายค้างส่ง'}
          </div>
        ) : null}
      </div>
      </div>


    </section>
  )
}

function Metric({
  label,
  tone,
  value,
  emoji,
}: {
  label: string
  tone?: 'amber' | 'blue' | 'emerald' | 'slate'
  value: string
  emoji: string
}) {
  const toneClass =
    tone === 'emerald'
      ? { icon: 'bg-emerald-100 text-emerald-700', label: 'text-emerald-600' }
      : tone === 'blue'
      ? { icon: 'bg-blue-100 text-blue-700', label: 'text-blue-600' }
      : tone === 'amber'
      ? { icon: 'bg-amber-100 text-amber-700', label: 'text-amber-600' }
      : { icon: 'bg-slate-100 text-slate-600', label: 'text-slate-500' }

  return (
    <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${toneClass.icon}`}>
        {emoji}
      </div>
      <div className="min-w-0">
        <div className={`text-xs ${toneClass.label}`}>{label}</div>
        <div className="truncate font-bold text-slate-900 text-sm sm:text-base">{value}</div>
      </div>
    </div>
  )
}
