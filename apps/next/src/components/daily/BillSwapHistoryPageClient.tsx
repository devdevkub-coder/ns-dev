'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
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

export function BillSwapHistoryPageClient() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')

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

  const enrichedRows = useMemo(() => rows.map((row) => {
    const weight = row.beforePrice > 0 ? row.beforeAmount / row.beforePrice : row.afterPrice > 0 ? row.afterAmount / row.afterPrice : 0
    return {
      ...row,
      afterSupplierName: row.afterSupplierName || row.afterSupplierId || '-',
      beforeSupplierName: row.beforeSupplierName || row.beforeSupplierId || '-',
      diffExVat: row.afterAmount - row.beforeAmount,
      productName: row.itemIndex === null ? row.billDocNo || row.billId : `รายการ #${row.itemIndex + 1}`,
      weight,
    }
  }), [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return enrichedRows.filter((row) => {
      const inDateRange = (!dateFrom || row.swapDate >= dateFrom) && (!dateTo || row.swapDate <= dateTo)
      if (!inDateRange) return false
      return !query || `${row.billDocNo} ${row.billId} ${row.beforeSupplierName} ${row.afterSupplierName} ${row.productName} ${row.reason}`.toLowerCase().includes(query)
    })
  }, [dateFrom, dateTo, enrichedRows, search])

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
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasActiveFilter = Boolean(search || dateFrom || dateTo)

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
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
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">บิลซื้อ</th>
              <th className="p-2 text-left">Supplier เดิม</th>
              <th className="p-2 text-left">Supplier ใหม่</th>
              <th className="p-2 text-left">สินค้า</th>
              <th className="p-2 text-right">น้ำหนัก (กก.)</th>
              <th className="p-2 text-right">ราคาเก่า</th>
              <th className="p-2 text-right">ราคาใหม่</th>
              <th className="p-2 text-right">ยอดเก่า (ก่อน VAT)</th>
              <th className="p-2 text-right">ยอดใหม่ (ก่อน VAT)</th>
              <th className="p-2 text-right">ส่วนต่าง (ก่อน VAT)</th>
              <th className="p-2 text-left">เหตุผล</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && pagedRows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2">{row.swapDate}</td>
                <td className="p-2 font-mono text-xs">{row.billDocNo || row.billId}</td>
                <td className="p-2 font-semibold text-rose-600">{row.beforeSupplierName}</td>
                <td className="p-2 font-semibold text-emerald-700">{row.afterSupplierName}</td>
                <td className="p-2">{row.productName}</td>
                <td className="p-2 text-right font-mono">{formatMoney(row.weight)}</td>
                <td className="p-2 text-right font-mono text-rose-600">{formatMoney(row.beforePrice)}</td>
                <td className="p-2 text-right font-mono font-bold text-emerald-700">{formatMoney(row.afterPrice)}</td>
                <td className="p-2 text-right font-mono text-rose-600">{formatMoney(row.beforeAmount)}</td>
                <td className="p-2 text-right font-mono text-emerald-700">{formatMoney(row.afterAmount)}</td>
                <td className={`p-2 text-right font-mono font-bold ${row.diffExVat >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.diffExVat)}</td>
                <td className="max-w-60 truncate p-2 text-slate-600">{row.reason || '-'}</td>
              </tr>
            ))}
            {!isLoading && totalRows === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ยังไม่มีประวัติการเปลี่ยน Supplier</td></tr> : null}
          </tbody>
          {totalRows > 0 ? (
            <tfoot>
              <tr className="bg-slate-100 font-bold">
                <td className="p-2 text-right" colSpan={5}>รวม</td>
                <td className="p-2 text-right font-mono">{formatMoney(totals.weight)}</td>
                <td className="p-2" colSpan={2} />
                <td className="p-2 text-right font-mono text-rose-600">{formatMoney(totals.before)}</td>
                <td className="p-2 text-right font-mono text-emerald-700">{formatMoney(totals.after)}</td>
                <td className={`p-2 text-right font-mono ${totals.diff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(totals.diff)}</td>
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
