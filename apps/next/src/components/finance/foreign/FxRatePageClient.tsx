'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type FxRateRow = {
  active: boolean
  fromCurrency: string
  id: string
  note: string | null
  rate: number
  rateDate: string
  rateType: string
  source: string | null
  toCurrency: string
  updatedAt: string
}

type CurrencyOption = {
  code: string
  displayCode: string
  name: string
  rateToThb: number
  symbol: string | null
}

type FxRatePayload = {
  filters: {
    currencies: CurrencyOption[]
    fromCurrencies: string[]
    rateTypes: string[]
    toCurrencies: string[]
  }
  latestRates: FxRateRow[]
  rows: FxRateRow[]
  summary: {
    activeRows: number
    latestPairs: number
    rows: number
  }
}

type FormState = {
  active: boolean
  fromCurrency: string
  id: string
  note: string
  rate: string
  rateDate: string
  rateType: string
  source: string
  toCurrency: string
}

type FxRateColumnKey = 'active' | 'action' | 'fromCurrency' | 'rate' | 'rateDate' | 'rateType' | 'source' | 'toCurrency'
type SortDirection = 'asc' | 'desc'

const fxRateColumns: Array<ResizableColumnDefinition<FxRateColumnKey>> = [
  { key: 'rateDate', defaultWidth: 120, minWidth: 105 },
  { key: 'fromCurrency', defaultWidth: 95, minWidth: 80 },
  { key: 'toCurrency', defaultWidth: 90, minWidth: 75 },
  { key: 'rateType', defaultWidth: 155, minWidth: 125 },
  { key: 'rate', defaultWidth: 130, minWidth: 110 },
  { key: 'source', defaultWidth: 130, minWidth: 105 },
  { key: 'active', defaultWidth: 105, minWidth: 90 },
  { key: 'action', defaultWidth: 105, minWidth: 90 },
]

const today = new Date().toISOString().slice(0, 10)

function emptyForm(): FormState {
  return {
    active: true,
    fromCurrency: 'USD',
    id: '',
    note: '',
    rate: '',
    rateDate: today,
    rateType: 'BOT Rate',
    source: 'BOT',
    toCurrency: 'THB',
  }
}

export function FxRatePageClient() {
  const latestLoadRequestRef = useRef(0)
  const [active, setActive] = useState('true')
  const [data, setData] = useState<FxRatePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState>(emptyForm)
  const [fromCurrency, setFromCurrency] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<FxRateColumnKey | null>(null)
  const columnResize = useResizableColumns('finance.foreign.fx-rate.main.v1', fxRateColumns)
  const hasFilters = Boolean(fromDate || toDate || fromCurrency !== 'all' || active !== 'true')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (fromCurrency !== 'all') params.set('fromCurrency', fromCurrency)
    if (active !== 'all') params.set('active', active)
    return params.toString()
  }, [active, fromCurrency, fromDate, toDate])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<FxRatePayload>(`/api/finance/foreign/fx-rate${queryString ? `?${queryString}` : ''}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด FX Rate ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currencyOptions = useMemo(() => {
    const displays = data?.filters.currencies.map((currency) => currency.displayCode).filter(Boolean) ?? []
    return Array.from(new Set(['THB', 'USD', 'CNY', 'JPY', 'EUR', 'SGD', ...displays])).sort()
  }, [data?.filters.currencies])

  const latestRates = useMemo(() => {
    const order = ['USD', 'CNY', 'JPY', 'EUR', 'SGD']
    return [...(data?.latestRates ?? [])].sort((left, right) => {
      const leftIndex = order.indexOf(left.fromCurrency)
      const rightIndex = order.indexOf(right.fromCurrency)
      return (leftIndex === -1 ? order.length : leftIndex) - (rightIndex === -1 ? order.length : rightIndex)
    })
  }, [data?.latestRates])

  const rateTypeOptions = useMemo(() => {
    return Array.from(new Set(['BOT Rate', 'TT Buying', 'TT Selling', ...(data?.filters.rateTypes ?? [])]))
  }, [data?.filters.rateTypes])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((a, b) => {
      const aValue = getFxRateSortValue(a, sortKey)
      const bValue = getFxRateSortValue(b, sortKey)
      const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'th', { numeric: true })

      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: FxRateColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function openCreate() {
    setForm(emptyForm())
    setFieldErrors({})
    setShowForm(true)
  }

  function openEdit(row: FxRateRow) {
    setForm({
      active: row.active,
      fromCurrency: row.fromCurrency,
      id: row.id,
      note: row.note ?? '',
      rate: String(row.rate),
      rateDate: row.rateDate,
      rateType: row.rateType,
      source: row.source ?? '',
      toCurrency: row.toCurrency,
    })
    setFieldErrors({})
    setShowForm(true)
  }

  function validateForm() {
    const nextErrors: Record<string, string> = {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.rateDate)) nextErrors.rateDate = 'เลือกวันที่'
    if (!/^[A-Z0-9]{3,6}$/.test(form.fromCurrency)) nextErrors.fromCurrency = 'เลือกสกุลต้นทาง'
    if (!/^[A-Z0-9]{3,6}$/.test(form.toCurrency)) nextErrors.toCurrency = 'เลือกสกุลปลายทาง'
    if (form.fromCurrency === form.toCurrency) nextErrors.toCurrency = 'สกุลต้องไม่ซ้ำกัน'
    if (!form.rateType.trim()) nextErrors.rateType = 'กรอกประเภท Rate'
    if (!Number.isFinite(Number(form.rate)) || Number(form.rate) <= 0) nextErrors.rate = 'Rate ต้องมากกว่า 0'
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function saveRate() {
    if (!validateForm()) return
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/finance/foreign/fx-rate', {
        body: JSON.stringify({ ...form, rate: Number(form.rate) }),
        headers: { 'Content-Type': 'application/json' },
        method: form.id ? 'PATCH' : 'POST',
      })
      setShowForm(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึก FX Rate ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <strong>FX Rate Management</strong> - เก็บอัตราแลกเปลี่ยนตามวันที่ ระบบจะใช้ rate ล่าสุด ณ วันที่ทำธุรกรรม
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-5 text-sm">
        {latestRates.slice(0, 5).map((rate) => (
          <div key={rate.id} className="bg-white border border-slate-200 rounded-xl p-3.5 text-center shadow-sm hover:shadow-md transition-shadow">
            <div className="text-xs font-semibold text-slate-500">{rate.fromCurrency} &rarr; {rate.toCurrency}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatRate(rate.rate)}</div>
            <div className="mt-1.5 text-xs font-medium text-slate-400">{formatDateDisplay(rate.rateDate)}</div>
          </div>
        ))}
        {!isLoading && (data?.latestRates.length ?? 0) === 0 ? <div className="col-span-full rounded-xl bg-white border border-slate-200 p-6 text-center text-sm text-slate-500 shadow-sm">ยังไม่มี FX Rate</div> : null}
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-md bg-white p-3 shadow">
        {/* Desktop View */}
        <div className="hidden lg:flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-semibold text-slate-950">FX Rate History</h2>
          <span className="text-xs text-slate-500">วันที่:</span>
          <DatePickerInput ariaLabel="จากวันที่" className="w-[130px]" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput ariaLabel="ถึงวันที่" className="w-[130px]" value={toDate} onChange={setToDate} />
          
          <select aria-label="สกุลต้นทาง" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value)}>
            <option value="all">ทุกสกุล</option>
            {(data?.filters.fromCurrencies ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          
          <select aria-label="สถานะ" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">ทั้งหมด</option>
          </select>

          {hasFilters && (
            <button className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors" type="button" onClick={() => { setFromDate(''); setToDate(''); setFromCurrency('all'); setActive('true') }}>✕ ล้าง</button>
          )}

          <button className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors flex items-center justify-center" type="button" onClick={openCreate}>+ เพิ่ม FX Rate</button>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2.5">
          <div className="flex gap-2">
            <button
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-100'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง {hasFilters ? '(มี)' : ''}
            </button>
            <button className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white flex items-center justify-center" type="button" onClick={openCreate}>+ เพิ่ม</button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={fromDate} onChange={setFromDate} />
                </label>
                <label className="text-xs text-slate-500">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={toDate} onChange={setToDate} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">
                  สกุลต้นทาง
                  <select aria-label="สกุลต้นทาง" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value)}>
                    <option value="all">ทุกสกุล</option>
                    {(data?.filters.fromCurrencies ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-500">
                  สถานะ
                  <select aria-label="สถานะ" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={active} onChange={(event) => setActive(event.target.value)}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                    <option value="all">ทั้งหมด</option>
                  </select>
                </label>
              </div>
              {hasFilters && (
                <button className="w-full rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={() => { setFromDate(''); setToDate(''); setFromCurrency('all'); setActive('true') }}>ล้างตัวกรอง</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{sortedRows.length}</span> รายการ
        </div>
        {columnResize.hasCustomWidths ? (
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}>
          <colgroup>
            {fxRateColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key)
              if (index === fxRateColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={style} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="วันที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="rateDate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('rateDate', 'วันที่')} />
              <ResizableTableHead label="From" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fromCurrency" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fromCurrency', 'From')} />
              <ResizableTableHead label="To" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="toCurrency" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('toCurrency', 'To')} />
              <ResizableTableHead label="Rate Type" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="rateType" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('rateType', 'Rate Type')} />
              <ResizableTableHead align="right" label="Rate" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="rate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('rate', 'Rate')} />
              <ResizableTableHead label="Source" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="source" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('source', 'Source')} />
              <ResizableTableHead align="center" label="Active" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="active" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('active', 'Active')} />
              <ResizableTableHead align="right" label="" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={fxRateColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && sortedRows.length === 0 ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={fxRateColumns.length}>ยังไม่มี FX Rate</td></tr> : null}
            {!isLoading && sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(row.rateDate)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">{row.fromCurrency}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">{row.toCurrency}</td>
                <td className="min-w-0 truncate px-3 py-3 text-xs text-slate-700">{row.rateType}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{formatRate(row.rate)}</td>
                <td className="min-w-0 truncate px-3 py-3 text-xs text-slate-700">{row.source || '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-center text-xs text-slate-600">{row.active ? 'Yes' : 'No'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right"><button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => openEdit(row)}>จัดการ</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-100">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && !error && sortedRows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มี FX Rate</div>
        ) : null}
        {!isLoading && sortedRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2 text-sm"
          >
            <div className="flex justify-between items-start">
              <span className="font-mono text-slate-500 text-xs">{formatDateDisplay(row.rateDate)}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {row.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <div>
                <span className="font-bold text-slate-800 text-sm">{row.fromCurrency} &rarr; {row.toCurrency}</span>
                <span className="text-slate-400 text-xs ml-2 font-medium">({row.rateType})</span>
              </div>
              <span className="text-lg font-bold text-blue-700 font-mono">{formatRate(row.rate)}</span>
            </div>
            
            <div className="flex justify-between pt-1.5 border-t border-slate-100/60 mt-1 text-slate-500 text-xs items-center">
              <span>Source: {row.source || '-'}</span>
              <button
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={() => openEdit(row)}
              >
                จัดการ
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-10" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-md bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-5 py-4">
              <h3 className="font-bold text-white">{form.id ? 'แก้ไข FX Rate' : 'เพิ่ม FX Rate'}</h3>
              <button className="text-2xl text-white/80 hover:text-white" type="button" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="grid gap-3 p-5 text-sm md:grid-cols-2">
              <Field label="วันที่" error={fieldErrors.rateDate}><DatePickerInput className="w-full h-9 text-sm" value={form.rateDate} onChange={(value) => setForm({ ...form, rateDate: value })} /></Field>
              <Field label="Rate Type" error={fieldErrors.rateType}><select className="w-full rounded-md border px-2 py-1.5 h-9 text-sm outline-none" value={form.rateType} onChange={(event) => setForm({ ...form, rateType: event.target.value })}>{rateTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
              <Field label="From" error={fieldErrors.fromCurrency}><CurrencySelect options={currencyOptions} value={form.fromCurrency} onChange={(value) => setForm({ ...form, fromCurrency: value })} /></Field>
              <Field label="To" error={fieldErrors.toCurrency}><CurrencySelect options={currencyOptions} value={form.toCurrency} onChange={(value) => setForm({ ...form, toCurrency: value })} /></Field>
              <Field label="Rate" error={fieldErrors.rate}><input className="w-full rounded-md border px-2 py-1.5 text-right font-bold h-9 text-sm outline-none" inputMode="decimal" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} /></Field>
              <Field label="Source"><input className="w-full rounded-md border px-2 py-1.5 h-9 text-sm outline-none" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></Field>
              <Field label="สถานะ"><select className="w-full rounded-md border px-2 py-1.5 h-9 text-sm outline-none" value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
              <Field label="หมายเหตุ"><input className="w-full rounded-md border px-2 py-1.5 h-9 text-sm outline-none" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100/50" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-md bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-colors" disabled={isSaving} type="button" onClick={() => void saveRate()}>{isSaving ? 'กำลังบันทึก' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function getFxRateSortValue(row: FxRateRow, key: FxRateColumnKey): string | number {
  if (key === 'rateDate') {
    const timestamp = Date.parse(row.rateDate)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }
  if (key === 'active') return row.active ? 1 : 0
  if (key === 'action') return ''

  return row[key] ?? ''
}

function formatRate(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 6, minimumFractionDigits: 2 })
}

function Field({ children, error, label }: { children: ReactNode; error?: string; label: string }) {
  return <label className="block"><span className="mb-1 block text-xs text-slate-600">{label}</span>{children}{error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}</label>
}

function CurrencySelect({ onChange, options, value }: { onChange: (value: string) => void; options: string[]; value: string }) {
  return <select className="w-full rounded-md border px-2 py-1.5" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
}
