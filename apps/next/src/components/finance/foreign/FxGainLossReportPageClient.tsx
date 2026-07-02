'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type FxGainLossRow = {
  currency: string
  date: string
  foreignAmount: number
  fxGainLossAmount: number
  id: string
  notes: string
  originalFxRate: number
  originalThbValue: number
  reference: string
  settlementFxRate: number
  settlementThbValue: number
  transactionType: string
}

type FxGainLossPayload = {
  filters: { currencies: string[]; refTypes: string[] }
  rows: FxGainLossRow[]
  summary: { net: number; rows: number; totalGain: number; totalLoss: number }
}

type FxGainLossColumnKey =
  | 'currency'
  | 'date'
  | 'foreignAmount'
  | 'fxGainLossAmount'
  | 'originalFxRate'
  | 'originalThbValue'
  | 'reference'
  | 'settlementFxRate'
  | 'settlementThbValue'
  | 'transactionType'
type SortDirection = 'asc' | 'desc'

const fxGainLossColumns: Array<ResizableColumnDefinition<FxGainLossColumnKey>> = [
  { key: 'date', defaultWidth: 120, minWidth: 105 },
  { key: 'transactionType', defaultWidth: 150, minWidth: 120 },
  { key: 'reference', defaultWidth: 170, minWidth: 130 },
  { key: 'currency', defaultWidth: 90, minWidth: 80 },
  { key: 'foreignAmount', defaultWidth: 150, minWidth: 125 },
  { key: 'originalFxRate', defaultWidth: 140, minWidth: 115 },
  { key: 'settlementFxRate', defaultWidth: 150, minWidth: 125 },
  { key: 'originalThbValue', defaultWidth: 150, minWidth: 125 },
  { key: 'settlementThbValue', defaultWidth: 160, minWidth: 130 },
  { key: 'fxGainLossAmount', defaultWidth: 140, minWidth: 120 },
]

export function FxGainLossReportPageClient() {
  const [currency, setCurrency] = useState('all')
  const [data, setData] = useState<FxGainLossPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [refType, setRefType] = useState('all')
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<FxGainLossColumnKey | null>(null)
  const latestLoadRequestRef = useRef(0)
  const columnResize = useResizableColumns('finance.foreign.fx-gain-loss-report.main.v1', fxGainLossColumns)
  const hasFilters = Boolean(fromDate || toDate || currency !== 'all' || refType !== 'all')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (currency !== 'all') params.set('currency', currency)
    if (refType !== 'all') params.set('refType', refType)
    return params.toString()
  }, [currency, fromDate, refType, toDate])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<FxGainLossPayload>(`/api/finance/foreign/fx-gain-loss-report${query ? `?${query}` : ''}`)
      if (requestId !== latestLoadRequestRef.current) return
      setData(payload)
    } catch (caught) {
      if (requestId !== latestLoadRequestRef.current) return
      setError(caught instanceof Error ? caught.message : 'โหลด FX Gain/Loss ไม่ได้')
    } finally {
      if (requestId !== latestLoadRequestRef.current) return
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((a, b) => {
      const aValue = getFxGainLossSortValue(a, sortKey)
      const bValue = getFxGainLossSortValue(b, sortKey)
      const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'th', { numeric: true })

      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: FxGainLossColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <strong>FX Gain/Loss</strong> - Realized FX Gain/Loss จากการรับ-จ่ายเงินต่างประเทศจริง (ส่วนต่างระหว่าง FX rate ตอนตั้ง AR/AP กับตอนรับ/จ่ายจริง)
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {/* Filters Toolbar */}
      <div className="rounded-md bg-white p-3 shadow">
        {/* Desktop View */}
        <div className="hidden lg:flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">วันที่:</span>
          <DatePickerInput ariaLabel="จากวันที่" className="w-[130px]" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput ariaLabel="ถึงวันที่" className="w-[130px]" value={toDate} onChange={setToDate} />
          
          <select aria-label="สกุลเงิน" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="all">ทุกสกุล</option>
            {(data?.filters.currencies ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          
          <select aria-label="ประเภท" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={refType} onChange={(event) => setRefType(event.target.value)}>
            <option value="all">ทุกประเภท</option>
            {(data?.filters.refTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>

          {hasFilters && (
            <button className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors" type="button" onClick={() => { setFromDate(''); setToDate(''); setCurrency('all'); setRefType('all') }}>✕ ล้าง</button>
          )}
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2.5">
          <div className="flex gap-2">
            <button
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง {hasFilters ? '(มี)' : ''}
            </button>
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
                  สกุลเงิน
                  <select aria-label="สกุลเงิน" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                    <option value="all">ทุกสกุล</option>
                    {(data?.filters.currencies ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-500">
                  ประเภท
                  <select aria-label="ประเภท" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={refType} onChange={(event) => setRefType(event.target.value)}>
                    <option value="all">ทุกประเภท</option>
                    {(data?.filters.refTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              {hasFilters && (
                <button className="w-full rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={() => { setFromDate(''); setToDate(''); setCurrency('all'); setRefType('all') }}>ล้างตัวกรอง</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:gap-4 md:grid-cols-3 text-sm">
        <MetricCard label="FX Gain รวม" tone="gain" value={data?.summary.totalGain ?? 0} />
        <MetricCard label="FX Loss รวม" tone="loss" value={data?.summary.totalLoss ?? 0} />
        <MetricCard label="Net FX G/L" tone="net" value={data?.summary.net ?? 0} />
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
            {fxGainLossColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key)
              if (index === fxGainLossColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={style} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="วันที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="transactionType" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('transactionType', 'ประเภท')} />
              <ResizableTableHead label="Reference" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="reference" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('reference', 'Reference')} />
              <ResizableTableHead label="สกุล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="currency" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('currency', 'สกุล')} />
              <ResizableTableHead align="right" label="Foreign Amount" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="foreignAmount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('foreignAmount', 'Foreign Amount')} />
              <ResizableTableHead align="right" label="Original Rate" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="originalFxRate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('originalFxRate', 'Original Rate')} />
              <ResizableTableHead align="right" label="Settlement Rate" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="settlementFxRate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('settlementFxRate', 'Settlement Rate')} />
              <ResizableTableHead align="right" label="Original THB" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="originalThbValue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('originalThbValue', 'Original THB')} />
              <ResizableTableHead align="right" label="Settlement THB" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="settlementThbValue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('settlementThbValue', 'Settlement THB')} />
              <ResizableTableHead align="right" label="FX G/L" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fxGainLossAmount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fxGainLossAmount', 'FX G/L')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={fxGainLossColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && sortedRows.length === 0 ? <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={fxGainLossColumns.length}>ยังไม่มี FX Gain/Loss</td></tr> : null}
            {!isLoading && sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(row.date)}</td>
                <td className="min-w-0 truncate px-3 py-3 text-slate-700">{row.transactionType}</td>
                <td className="min-w-0 truncate px-3 py-3 font-mono text-xs text-slate-700">{row.reference}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.currency || '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.foreignAmount)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.originalFxRate)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.settlementFxRate)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.originalThbValue)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.settlementThbValue)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.fxGainLossAmount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.fxGainLossAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && !error && sortedRows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-200">ยังไม่มี FX Gain/Loss</div>
        ) : null}
        {!isLoading && sortedRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm space-y-2 text-sm"
          >
            <div className="flex justify-between items-start">
              <span className="font-mono text-slate-500 text-xs">{formatDateDisplay(row.date)}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${row.fxGainLossAmount >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {row.fxGainLossAmount >= 0 ? 'Gain' : 'Loss'}
              </span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-slate-800">{row.transactionType}</span>
              <span className="font-mono text-blue-600">Ref: {row.reference}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60 mt-1">
              <div>
                <span className="text-slate-400 block text-xs">Foreign Amount:</span>
                <span className="font-bold text-slate-800 font-mono text-sm">{formatMoney(row.foreignAmount)} {row.currency}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-xs">FX Gain/Loss Amount:</span>
                <span className={`font-bold tabular-nums text-sm ${row.fxGainLossAmount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMoney(row.fxGainLossAmount)} THB
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1.5 border-t border-slate-100/60 mt-1 font-mono text-xs">
              <div className="space-y-0.5">
                <div className="flex justify-between text-slate-400"><span>Original:</span></div>
                <div className="flex justify-between"><span>Rate:</span><span>{formatMoney(row.originalFxRate)}</span></div>
                <div className="flex justify-between"><span>Value:</span><span>{formatMoney(row.originalThbValue)}</span></div>
              </div>
              <div className="space-y-0.5 text-right">
                <div className="flex justify-between text-slate-400"><span>Settlement:</span></div>
                <div className="flex justify-between"><span>Rate:</span><span>{formatMoney(row.settlementFxRate)}</span></div>
                <div className="flex justify-between"><span>Value:</span><span>{formatMoney(row.settlementThbValue)}</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function getFxGainLossSortValue(row: FxGainLossRow, key: FxGainLossColumnKey): string | number {
  if (key === 'date') {
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  return row[key] ?? ''
}

function MetricCard({ label, tone, value }: { label: string; tone: 'gain' | 'loss' | 'net'; value: number }) {
  let config = { bg: 'bg-slate-100 text-slate-600', emoji: '📊', labelColor: 'text-slate-500', valueColor: 'text-slate-900' }

  if (value === 0) {
    const emojis = { gain: '📈', loss: '📉', net: '💰' }
    config = { bg: 'bg-slate-100 text-slate-600', emoji: emojis[tone] || '📊', labelColor: 'text-slate-500', valueColor: 'text-slate-900' }
  } else if (tone === 'gain') {
    config = { bg: 'bg-emerald-100 text-emerald-600', emoji: '📈', labelColor: 'text-emerald-600', valueColor: 'text-emerald-700' }
  } else if (tone === 'loss') {
    config = { bg: 'bg-rose-100 text-rose-600', emoji: '📉', labelColor: 'text-rose-600', valueColor: 'text-rose-700' }
  } else if (tone === 'net') {
    if (value > 0) {
      config = { bg: 'bg-emerald-100 text-emerald-600', emoji: '💰', labelColor: 'text-emerald-600', valueColor: 'text-emerald-700' }
    } else if (value < 0) {
      config = { bg: 'bg-rose-100 text-rose-600', emoji: '💰', labelColor: 'text-rose-600', valueColor: 'text-rose-700' }
    } else {
      config = { bg: 'bg-slate-100 text-slate-600', emoji: '💰', labelColor: 'text-slate-500', valueColor: 'text-slate-900' }
    }
  }

  return (
    <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${config.bg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {config.emoji}
      </div>
      <div>
        <div className={`text-xs ${config.labelColor}`}>{label}</div>
        <div className={`text-2xl font-bold ${config.valueColor}`}>{formatMoney(value)}</div>
      </div>
    </div>
  )
}
