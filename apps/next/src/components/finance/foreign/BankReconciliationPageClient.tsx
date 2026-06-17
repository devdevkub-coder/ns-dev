'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type AccountOption = { id: string; label: string; name: string }
type ErpRow = { date: string; id: string; in: number; out: number; refNo: string; type: string }
type ImportedRow = { date: string; desc: string; id: string; in: number; matchStatus: string; out: number }
type Payload = {
  designState: { importTable: string; matchState: string; writeBehavior: string }
  erpRows: ErpRow[]
  filters: { accounts: AccountOption[] }
  importedRows: ImportedRow[]
  stats: { erpUnmatched: number; ignored: number; matched: number; total: number; unmatched: number }
}

type ImportedColumnKey = 'date' | 'desc' | 'in' | 'out' | 'matchStatus'

const importedColumns: Array<ResizableColumnDefinition<ImportedColumnKey>> = [
  { key: 'date', defaultWidth: 100, minWidth: 80 },
  { key: 'desc', defaultWidth: 220, minWidth: 150 },
  { key: 'in', defaultWidth: 120, minWidth: 95 },
  { key: 'out', defaultWidth: 120, minWidth: 95 },
  { key: 'matchStatus', defaultWidth: 100, minWidth: 80 },
]

type ErpColumnKey = 'date' | 'type' | 'refNo' | 'in' | 'out'

const erpColumns: Array<ResizableColumnDefinition<ErpColumnKey>> = [
  { key: 'date', defaultWidth: 100, minWidth: 80 },
  { key: 'type', defaultWidth: 100, minWidth: 80 },
  { key: 'refNo', defaultWidth: 150, minWidth: 110 },
  { key: 'in', defaultWidth: 120, minWidth: 95 },
  { key: 'out', defaultWidth: 120, minWidth: 95 },
]

export function BankReconciliationPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const importedColumnResize = useResizableColumns('finance.bank-reconciliation.imported.v5', importedColumns)
  const erpColumnResize = useResizableColumns('finance.bank-reconciliation.erp.v5', erpColumns)

  const [importedSortKey, setImportedSortKey] = useState<ImportedColumnKey>('date')
  const [importedSortDirection, setImportedSortDirection] = useState<'asc' | 'desc'>('desc')

  const [erpSortKey, setErpSortKey] = useState<ErpColumnKey>('date')
  const [erpSortDirection, setErpSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleImportedSort = useCallback((key: ImportedColumnKey) => {
    if (importedSortKey === key) {
      setImportedSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setImportedSortKey(key)
      setImportedSortDirection('asc')
    }
  }, [importedSortKey])

  const handleErpSort = useCallback((key: ErpColumnKey) => {
    if (erpSortKey === key) {
      setErpSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setErpSortKey(key)
      setErpSortDirection('asc')
    }
  }, [erpSortKey])

  const sortedImportedRows = useMemo(() => {
    const rows = data?.importedRows ?? []
    return [...rows].sort((left, right) => {
      let leftVal = left[importedSortKey]
      let rightVal = right[importedSortKey]

      if (leftVal === undefined) leftVal = ''
      if (rightVal === undefined) rightVal = ''

      const multiplier = importedSortDirection === 'asc' ? 1 : -1

      if (typeof leftVal === 'number' && typeof rightVal === 'number') {
        return (leftVal - rightVal) * multiplier
      }
      return String(leftVal).localeCompare(String(rightVal), 'th', { numeric: true }) * multiplier
    })
  }, [data?.importedRows, importedSortKey, importedSortDirection])

  const sortedErpRows = useMemo(() => {
    const rows = data?.erpRows ?? []
    return [...rows].sort((left, right) => {
      let leftVal = left[erpSortKey]
      let rightVal = right[erpSortKey]

      if (leftVal === undefined) leftVal = ''
      if (rightVal === undefined) rightVal = ''

      const multiplier = erpSortDirection === 'asc' ? 1 : -1

      if (typeof leftVal === 'number' && typeof rightVal === 'number') {
        return (leftVal - rightVal) * multiplier
      }
      return String(leftVal).localeCompare(String(rightVal), 'th', { numeric: true }) * multiplier
    })
  }, [data?.erpRows, erpSortKey, erpSortDirection])


  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [accountId, fromDate, toDate])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<Payload>(`/api/finance/foreign/bank-reconciliation${query ? `?${query}` : ''}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
      if (!accountId && payload.filters.accounts[0]?.id) setAccountId(payload.filters.accounts[0].id)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Bank Reconciliation ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [accountId, query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <strong>Bank Reconciliation</strong> - Import Statement จากธนาคาร (CSV) แล้ว Auto-Match กับรายการใน ERP จากวันที่+จำนวนเงิน
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {/* Filters Toolbar */}
      <div className="rounded-md bg-white p-3 shadow">
        {/* Desktop View */}
        <div className="hidden lg:flex flex-wrap items-center gap-2">
          <select className="w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
          <span className="text-xs text-slate-500">วันที่:</span>
          <DatePickerInput ariaLabel="จากวันที่" className="w-[130px]" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput ariaLabel="ถึงวันที่" className="w-[130px]" value={toDate} onChange={setToDate} />
          {Boolean(fromDate || toDate) && (
            <button className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors" type="button" onClick={() => { setFromDate(''); setToDate('') }}>✕ ล้าง</button>
          )}
          <button className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-60 flex items-center" disabled type="button">นำเข้า CSV</button>
          <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white opacity-60 flex items-center" disabled type="button">จับคู่อัตโนมัติ</button>
        </div>

        {/* Mobile View (Collapsible Filters) */}
        <div className="block lg:hidden space-y-2.5">
          <div className="flex gap-2">
            <select className="flex-1 min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
            <button
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-100'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง
            </button>
            <button className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white opacity-60 shrink-0" disabled type="button">CSV</button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2 items-center">
                <label className="text-xs text-slate-500">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={fromDate} onChange={setFromDate} />
                </label>
                <label className="text-xs text-slate-500">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={toDate} onChange={setToDate} />
                </label>
              </div>
              <div className="flex justify-between gap-2 pt-1">
                {Boolean(fromDate || toDate) && (
                  <button className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={() => { setFromDate(''); setToDate('') }}>ล้างตัวกรอง</button>
                )}
                <button className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white opacity-60" disabled type="button">จับคู่อัตโนมัติ</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm">
        <Stat label="Bank รายการรวม" value={data?.stats.total ?? 0} />
        <Stat label="Matched" tone="matched" value={data?.stats.matched ?? 0} />
        <Stat label="Bank Unmatched" tone="unmatched" value={data?.stats.unmatched ?? 0} />
        <Stat label="Ignored" tone="ignored" value={data?.stats.ignored ?? 0} />
        <Stat label="ERP ไม่มีใน Bank" tone="erp" value={data?.stats.erpUnmatched ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Bank Statement (Imported)"
          tone="bank"
          hasCustomWidths={importedColumnResize.hasCustomWidths}
          onResetWidths={importedColumnResize.resetColumnWidths}
        >
          <ImportedTable
            columnResize={importedColumnResize}
            isLoading={isLoading}
            rows={sortedImportedRows}
            sortDirection={importedSortDirection}
            sortKey={importedSortKey}
            onSort={handleImportedSort}
          />
        </Panel>
        <Panel
          title="ERP Bank Statement"
          tone="erp"
          hasCustomWidths={erpColumnResize.hasCustomWidths}
          onResetWidths={erpColumnResize.resetColumnWidths}
        >
          <ErpTable
            columnResize={erpColumnResize}
            isLoading={isLoading}
            rows={sortedErpRows}
            sortDirection={erpSortDirection}
            sortKey={erpSortKey}
            onSort={handleErpSort}
          />
        </Panel>
      </div>
    </section>
  )
}

function Stat({ label, tone, value }: { label: string; tone?: 'matched' | 'unmatched' | 'ignored' | 'erp'; value: number }) {
  const configs = {
    matched: { bg: 'bg-emerald-100 text-emerald-600', emoji: '✅', labelColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
    unmatched: { bg: 'bg-amber-100 text-amber-600', emoji: '⚠️', labelColor: 'text-amber-600', valueColor: 'text-amber-700' },
    erp: { bg: 'bg-red-100 text-red-600', emoji: '🚨', labelColor: 'text-red-600', valueColor: 'text-red-700' },
    ignored: { bg: 'bg-slate-100 text-slate-600', emoji: '🚫', labelColor: 'text-slate-500', valueColor: 'text-slate-900' },
    slate: { bg: 'bg-blue-100 text-blue-600', emoji: '📊', labelColor: 'text-blue-500', valueColor: 'text-blue-900' },
  }

  const isZero = value === 0
  const config = isZero
    ? {
        bg: 'bg-slate-100 text-slate-600',
        emoji: configs[tone || 'slate'].emoji,
        labelColor: 'text-slate-500',
        valueColor: 'text-slate-900',
      }
    : configs[tone || 'slate']

  return (
    <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${config.bg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {config.emoji}
      </div>
      <div>
        <div className={`text-xs ${config.labelColor}`}>{label}</div>
        <div className={`text-xl font-bold ${config.valueColor}`}>{value}</div>
      </div>
    </div>
  )
}

function Panel({
  children,
  title,
  tone,
  onResetWidths,
  hasCustomWidths,
}: {
  children: React.ReactNode
  title: string
  tone: 'bank' | 'erp'
  onResetWidths?: () => void
  hasCustomWidths?: boolean
}) {
  const heading = tone === 'bank' ? 'bg-blue-50/50 text-blue-900' : 'bg-emerald-50/50 text-emerald-900'
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-sm">
      <div className={`border-b border-slate-100 px-4 py-3 flex items-center justify-between ${heading}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hasCustomWidths && onResetWidths && (
          <button
            className="rounded bg-white/85 px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors"
            type="button"
            onClick={onResetWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-auto">{children}</div>
    </div>
  )
}

function ImportedTable({
  isLoading,
  rows,
  columnResize,
  sortKey,
  sortDirection,
  onSort,
}: {
  isLoading: boolean
  rows: ImportedRow[]
  columnResize: {
    tableMinWidth: string
    getColumnStyle: (key: ImportedColumnKey) => React.CSSProperties
    getResizeHandleProps: (key: ImportedColumnKey, label: string) => any
  }
  sortKey: ImportedColumnKey
  sortDirection: 'asc' | 'desc'
  onSort: (key: ImportedColumnKey) => void
}) {
  return (
    <>
      <table className="hidden lg:table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
        <colgroup>
          {importedColumns.map((column) => (
            <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="รายละเอียด" resizeProps={columnResize.getResizeHandleProps('desc', 'รายละเอียด')} sortKey="desc" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="เข้า" resizeProps={columnResize.getResizeHandleProps('in', 'เข้า')} sortKey="in" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ออก" resizeProps={columnResize.getResizeHandleProps('out', 'ออก')} sortKey="out" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="Match" resizeProps={columnResize.getResizeHandleProps('matchStatus', 'Match')} sortKey="matchStatus" onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-100">
          {isLoading ? (
            <TableRow>
              <TableCell className="py-6 text-center text-slate-400" colSpan={5}>
                กำลังโหลดข้อมูล
              </TableCell>
            </TableRow>
          ) : null}
          {!isLoading && rows.length === 0 ? (
            <TableRow>
              <TableCell className="py-6 text-center text-slate-400" colSpan={5}>
                ยังไม่ได้ import statement
              </TableCell>
            </TableRow>
          ) : null}
          {!isLoading && rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-slate-50/50 transition-colors">
              <TableCell className="px-4 py-3.5 text-left text-slate-600 font-medium">
                {formatDateDisplay(row.date)}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-left text-slate-700 max-w-xs truncate" title={row.desc}>
                {row.desc || '-'}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-right font-bold font-mono text-emerald-600">
                {row.in ? formatMoney(row.in) : '-'}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-right font-bold font-mono text-red-600">
                {row.out ? formatMoney(row.out) : '-'}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-center">
                <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                  row.matchStatus === 'Matched' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {row.matchStatus}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>

      {/* Mobile view */}
      <div className="block lg:hidden space-y-2.5 p-3 bg-slate-50/50">
        {isLoading ? (
          <div className="py-6 text-center text-slate-500 text-xs">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && rows.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">ยังไม่ได้ import statement</div>
        ) : null}
        {!isLoading && rows.map((row) => (
          <div key={row.id} className="rounded-md border border-slate-100 bg-white p-3.5 shadow-sm space-y-2 text-sm">
            <div className="flex justify-between items-start">
              <span className="font-mono text-slate-500 text-xs">{formatDateDisplay(row.date)}</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${row.matchStatus === 'Matched' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {row.matchStatus}
              </span>
            </div>
            <div className="text-slate-700 font-medium">{row.desc || '-'}</div>
            <div className="flex justify-end gap-4 pt-2 border-t border-slate-100/60 text-right text-xs">
              <div>
                <span className="text-[11px] text-slate-400 mr-1">เข้า:</span>
                <span className="text-emerald-700 font-bold tabular-nums text-sm">{row.in ? formatMoney(row.in) : '-'}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 mr-1">ออก:</span>
                <span className="text-rose-700 font-bold tabular-nums text-sm">{row.out ? formatMoney(row.out) : '-'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function ErpTable({
  isLoading,
  rows,
  columnResize,
  sortKey,
  sortDirection,
  onSort,
}: {
  isLoading: boolean
  rows: ErpRow[]
  columnResize: {
    tableMinWidth: string
    getColumnStyle: (key: ErpColumnKey) => React.CSSProperties
    getResizeHandleProps: (key: ErpColumnKey, label: string) => any
  }
  sortKey: ErpColumnKey
  sortDirection: 'asc' | 'desc'
  onSort: (key: ErpColumnKey) => void
}) {
  return (
    <>
      <table className="hidden lg:table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
        <colgroup>
          {erpColumns.map((column) => (
            <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} sortKey="type" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="Ref" resizeProps={columnResize.getResizeHandleProps('refNo', 'Ref')} sortKey="refNo" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="เข้า" resizeProps={columnResize.getResizeHandleProps('in', 'เข้า')} sortKey="in" onSort={onSort} />
            <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ออก" resizeProps={columnResize.getResizeHandleProps('out', 'ออก')} sortKey="out" onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-100">
          {isLoading ? (
            <TableRow>
              <TableCell className="py-6 text-center text-slate-400" colSpan={5}>
                กำลังโหลดข้อมูล
              </TableCell>
            </TableRow>
          ) : null}
          {!isLoading && rows.length === 0 ? (
            <TableRow>
              <TableCell className="py-6 text-center text-slate-400" colSpan={5}>
                ไม่มีรายการใน ERP
              </TableCell>
            </TableRow>
          ) : null}
          {!isLoading && rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-slate-50/50 transition-colors">
              <TableCell className="px-4 py-3.5 text-left text-slate-600 font-medium">{formatDateDisplay(row.date)}</TableCell>
              <TableCell className="px-4 py-3.5 text-left text-slate-700">{row.type}</TableCell>
              <TableCell className="px-4 py-3.5 text-left font-mono text-blue-600 font-medium">{row.refNo}</TableCell>
              <TableCell className="px-4 py-3.5 text-right font-bold font-mono text-emerald-600">
                {row.in ? formatMoney(row.in) : '-'}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-right font-bold font-mono text-red-600">
                {row.out ? formatMoney(row.out) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>

      {/* Mobile view */}
      <div className="block lg:hidden space-y-2.5 p-3 bg-slate-50/50">
        {isLoading ? (
          <div className="py-6 text-center text-slate-500 text-xs">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && rows.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีรายการใน ERP</div>
        ) : null}
        {!isLoading && rows.map((row) => (
          <div key={row.id} className="rounded-md border border-slate-100 bg-white p-3.5 shadow-sm space-y-2 text-sm">
            <div className="flex justify-between items-start">
              <span className="font-mono text-slate-500 text-xs">{formatDateDisplay(row.date)}</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{row.type}</span>
            </div>
            <div className="font-mono text-xs text-blue-600 font-medium">Ref: {row.refNo}</div>
            <div className="flex justify-end gap-4 pt-2 border-t border-slate-100/60 text-right text-xs">
              <div>
                <span className="text-[11px] text-slate-400 mr-1">เข้า:</span>
                <span className="text-emerald-700 font-bold tabular-nums text-sm">{row.in ? formatMoney(row.in) : '-'}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 mr-1">ออก:</span>
                <span className="text-rose-700 font-bold tabular-nums text-sm">{row.out ? formatMoney(row.out) : '-'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
