'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type FcdAccount = {
  accountNo: string | null
  bankName: string
  branchName: string
  code: string | null
  currency: string
  id: string
  label: string
  name: string
  openingBalance: number
  type: string
}

type FcdRow = {
  date: string
  description: string
  foreignBal: number
  foreignIn: number
  foreignOut: number
  fxRate: number
  id: string
  refNo: string
  thbBal: number
  thbIn: number
  thbOut: number
  type: string
}

type FcdPayload = {
  account: (Omit<FcdAccount, 'label'> & { openingBalance: number }) | null
  filters: { accounts: FcdAccount[] }
  rows: FcdRow[]
  summary: { accountCount: number; currency: string; foreignBalance: number; rows: number; thbBalance: number }
}

type FcdColumnKey =
  | 'date'
  | 'description'
  | 'foreignBal'
  | 'foreignIn'
  | 'foreignOut'
  | 'fxRate'
  | 'refNo'
  | 'thbBal'
  | 'thbIn'
  | 'thbOut'
  | 'type'
type SortDirection = 'asc' | 'desc'

const fcdColumns: Array<ResizableColumnDefinition<FcdColumnKey>> = [
  { key: 'date', defaultWidth: 120, minWidth: 105 },
  { key: 'type', defaultWidth: 150, minWidth: 120 },
  { key: 'refNo', defaultWidth: 150, minWidth: 120 },
  { key: 'description', defaultWidth: 250, minWidth: 170 },
  { key: 'foreignIn', defaultWidth: 130, minWidth: 110 },
  { key: 'foreignOut', defaultWidth: 130, minWidth: 110 },
  { key: 'fxRate', defaultWidth: 115, minWidth: 95 },
  { key: 'thbIn', defaultWidth: 130, minWidth: 110 },
  { key: 'thbOut', defaultWidth: 130, minWidth: 110 },
  { key: 'foreignBal', defaultWidth: 150, minWidth: 125 },
  { key: 'thbBal', defaultWidth: 150, minWidth: 125 },
]

export function FcdLedgerPageClient() {
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState<FcdPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<FcdColumnKey | null>(null)
  const columnResize = useResizableColumns('finance.foreign.fcd-ledger.main.v1', fcdColumns)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    return params.toString()
  }, [accountId])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<FcdPayload>(`/api/finance/foreign/fcd-ledger${query ? `?${query}` : ''}`)
      setData(payload)
      if (!accountId && payload.account?.id) setAccountId(payload.account.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด FCD Ledger ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [accountId, query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currency = data?.summary.currency || data?.account?.currency || ''
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((a, b) => {
      const aValue = getFcdSortValue(a, sortKey)
      const bValue = getFcdSortValue(b, sortKey)
      const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'th', { numeric: true })

      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: FcdColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  const tableControls = (
    <>
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
    </>
  )

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
        <strong>FCD Ledger</strong> - เดินบัญชีเงินตราต่างประเทศ แสดงทั้งยอดสกุลต่างประเทศและมูลค่า THB equivalent
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap gap-2">
        <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm md:w-80" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.label} ({account.currency})</option>)}
          {!isLoading && (data?.filters.accounts.length ?? 0) === 0 ? <option value="">ไม่มีบัญชี FCD</option> : null}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 text-sm">
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-lg sm:text-xl shrink-0">
            🏦
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">บัญชี</div>
            <div className="truncate text-lg font-bold text-slate-800">{data?.account?.name ?? '-'}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${(data?.summary.foreignBalance ?? 0) === 0 ? 'bg-slate-100 text-slate-600' : 'bg-indigo-100 text-indigo-600'} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
            💱
          </div>
          <div>
            <div className={`text-xs ${(data?.summary.foreignBalance ?? 0) === 0 ? 'text-slate-500' : 'text-indigo-600'}`}>ยอดคงเหลือ ({currency || '-'})</div>
            <div className={`font-mono text-2xl font-bold ${(data?.summary.foreignBalance ?? 0) === 0 ? 'text-slate-900' : 'text-indigo-700'}`}>{formatMoney(data?.summary.foreignBalance ?? 0)}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${(data?.summary.thbBalance ?? 0) === 0 ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-600'} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
            💰
          </div>
          <div>
            <div className={`text-xs ${(data?.summary.thbBalance ?? 0) === 0 ? 'text-slate-500' : 'text-blue-600'}`}>ยอดคงเหลือ THB Equivalent</div>
            <div className={`font-mono text-2xl font-bold ${(data?.summary.thbBalance ?? 0) === 0 ? 'text-slate-900' : 'text-blue-700'}`}>{formatMoney(data?.summary.thbBalance ?? 0)}</div>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:hidden">
        {tableControls}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          {tableControls}
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth, width: '100%' }}>
          <colgroup>
            {fcdColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key)
              if (index === fcdColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={style} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="วันที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="type" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
              <ResizableTableHead label="เอกสาร" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="refNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('refNo', 'เอกสาร')} />
              <ResizableTableHead label="รายละเอียด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="description" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('description', 'รายละเอียด')} />
              <ResizableTableHead align="right" label="FCD เข้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="foreignIn" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('foreignIn', 'FCD เข้า')} />
              <ResizableTableHead align="right" label="FCD ออก" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="foreignOut" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('foreignOut', 'FCD ออก')} />
              <ResizableTableHead align="right" label="FX" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="fxRate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('fxRate', 'FX')} />
              <ResizableTableHead align="right" label="THB เข้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="thbIn" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('thbIn', 'THB เข้า')} />
              <ResizableTableHead align="right" label="THB ออก" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="thbOut" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('thbOut', 'THB ออก')} />
              <ResizableTableHead align="right" label="FCD Balance" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="foreignBal" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('foreignBal', 'FCD Balance')} />
              <ResizableTableHead align="right" label="THB Balance" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="thbBal" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('thbBal', 'THB Balance')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={fcdColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && sortedRows.length === 0 ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={fcdColumns.length}>ยังไม่มีรายการเดินบัญชี FCD</td></tr> : null}
            {!isLoading && sortedRows.map((row) => (
              <tr key={row.id} className={`transition-colors ${isOpeningRow(row) ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatFcdDate(row.date)}</td>
                <td className="min-w-0 truncate px-3 py-3 text-xs text-slate-700">{row.type}</td>
                <td className="min-w-0 truncate px-3 py-3 font-mono text-xs text-blue-600">{row.refNo}</td>
                <td className="min-w-0 truncate px-3 py-3 text-xs text-slate-700">{row.description || '-'}</td>
                <MoneyCell tone="in" value={row.foreignIn} />
                <MoneyCell tone="out" value={row.foreignOut} />
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{row.fxRate ? formatMoney(row.fxRate) : '-'}</td>
                <MoneyCell tone="in" value={row.thbIn} />
                <MoneyCell tone="out" value={row.thbOut} />
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-medium tabular-nums text-slate-900">{formatMoney(row.foreignBal)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-medium tabular-nums text-slate-900">{formatMoney(row.thbBal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-100">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && !error && sortedRows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มีรายการเดินบัญชี FCD</div>
        ) : null}
        {!isLoading && sortedRows.map((row) => {
          const isOpening = isOpeningRow(row)
          return (
            <div
              key={row.id}
              className={`rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2 text-xs ${isOpening ? 'bg-slate-50' : ''}`}
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-slate-500 text-xs">{formatFcdDate(row.date)}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${isOpening ? 'bg-slate-200 text-slate-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {row.type}
                </span>
              </div>
              
              {!isOpening && (
                <div className="flex justify-between">
                  <span className="font-mono text-blue-600 font-semibold">Ref: {row.refNo}</span>
                  {row.fxRate ? <span className="text-slate-400">Rate: {formatMoney(row.fxRate)}</span> : null}
                </div>
              )}
              
              <div className="text-slate-700">{row.description || '-'}</div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-slate-100/60 mt-1">
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">ต่างประเทศ ({currency})</div>
                  <div className="mt-0.5 space-y-0.5 font-mono">
                    <div className="flex justify-between"><span>เข้า:</span><span className="text-emerald-700">{row.foreignIn ? formatMoney(row.foreignIn) : '-'}</span></div>
                    <div className="flex justify-between"><span>ออก:</span><span className="text-red-600">{row.foreignOut ? formatMoney(row.foreignOut) : '-'}</span></div>
                    <div className="flex justify-between border-t border-slate-100/60 pt-0.5 font-bold"><span>คงเหลือ:</span><span className="text-slate-800">{formatMoney(row.foreignBal)}</span></div>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Equivalent (THB)</div>
                  <div className="mt-0.5 space-y-0.5 font-mono">
                    <div className="flex justify-between"><span>เข้า:</span><span className="text-emerald-700">{row.thbIn ? formatMoney(row.thbIn) : '-'}</span></div>
                    <div className="flex justify-between"><span>ออก:</span><span className="text-red-600">{row.thbOut ? formatMoney(row.thbOut) : '-'}</span></div>
                    <div className="flex justify-between border-t border-slate-100/60 pt-0.5 font-bold"><span>คงเหลือ:</span><span className="text-slate-800">{formatMoney(row.thbBal)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function formatFcdDate(value: string) {
  return value === '-' ? '-' : formatDateDisplay(value)
}

function getFcdSortValue(row: FcdRow, key: FcdColumnKey): string | number {
  if (key === 'date') {
    if (row.date === '-') return 0
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  return row[key] ?? ''
}

function isOpeningRow(row: FcdRow) {
  return row.type === 'ยอดยกมา'
}

function MoneyCell({ tone, value }: { tone: 'in' | 'out'; value: number }) {
  const color = tone === 'in' ? 'text-emerald-700' : 'text-red-600'
  return <td className={`whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums ${color}`}>{value ? formatMoney(value) : '-'}</td>
}
