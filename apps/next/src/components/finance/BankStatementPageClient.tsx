'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type AccountOption = {
  accountNo: string | null
  active: boolean | null
  bankName: string | null
  branchName: string
  code: string | null
  currency: string | null
  id: string
  name: string
  openingBalance: number
  type: string
}

type BankRow = {
  accountName: string
  accountNo: string
  amountIn: number
  amountOut: number
  bankName: string
  branchName: string
  cashFlowCategory: string
  date: string
  description: string
  id: string
  movement: number
  note: string
  refNo: string
  refType: string
  runningBalance: number
  type: string
}

type BankPayload = {
  byAccount: Array<{ accountId: string; accountName: string; amountIn: number; amountOut: number; balance: number; rows: number }>
  filters: { accounts: AccountOption[]; refTypes: string[]; types: string[] }
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number }
  rows: BankRow[]
  summary: { accounts: number; amountIn: number; amountOut: number; netMovement: number; rows: number }
}

function currentMonthStart() {
  return `${todayDateInput().slice(0, 8)}01`
}

export function BankStatementPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState<BankPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(currentMonthStart())
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [refType, setRefType] = useState('')
  const [selectedRow, setSelectedRow] = useState<BankRow | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [to, setTo] = useState(todayDateInput())
  const [type, setType] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)


  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '50',
      sortDirection,
    })
    if (accountId) params.set('accountId', accountId)
    if (from) params.set('from', from)
    if (q.trim()) params.set('q', q.trim())
    if (refType) params.set('refType', refType)
    if (to) params.set('to', to)
    if (type) params.set('type', type)
    return params
  }, [accountId, from, page, q, refType, sortDirection, to, type])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<BankPayload>(`/api/finance/bank?${query.toString()}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Bank Statement ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!accountId && data?.filters.accounts[0]?.id) {
      setAccountId(data.filters.accounts[0].id)
    }
  }, [accountId, data?.filters.accounts])

  async function exportXlsx() {
    setIsExporting(true)
    setError(null)
    try {
      const exportQuery = new URLSearchParams(query)
      exportQuery.set('format', 'xlsx')
      const response = await fetch(`/api/finance/bank?${exportQuery.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Export Bank Statement ไม่สำเร็จ')
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `finance_bank_${todayDateInput()}.xlsx`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export Bank Statement ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
    }
  }

  const totalPages = data?.pagination.totalPages ?? 1
  const accounts = data?.filters.accounts ?? []
  const selectedAccount = accounts.find((account) => account.id === accountId) ?? accounts[0] ?? null
  const selectedAccountSummary = data?.byAccount.find((row) => row.accountId === selectedAccount?.id) ?? null
  const openingBalance = selectedAccount
    ? data?.rows[0]
      ? data.rows[0].runningBalance - data.rows[0].movement
      : selectedAccount.openingBalance
    : 0
  const displayRows = selectedAccount
    ? [
        {
          accountName: selectedAccount.name,
          accountNo: selectedAccount.accountNo ?? '',
          amountIn: 0,
          amountOut: 0,
          bankName: selectedAccount.bankName ?? '',
          branchName: selectedAccount.branchName,
          cashFlowCategory: '',
          date: '-',
          description: 'Opening Balance',
          id: `opening-${selectedAccount.id}`,
          movement: 0,
          note: '',
          refNo: '-',
          refType: '',
          runningBalance: openingBalance,
          type: 'ยอดยกมา',
        },
        ...(data?.rows ?? []),
      ]
    : data?.rows ?? []
  const cashIn = data?.summary.amountIn ?? 0
  const cashOut = data?.summary.amountOut ?? 0
  const closingBalance = displayRows.at(-1)?.runningBalance ?? selectedAccountSummary?.balance ?? selectedAccount?.openingBalance ?? 0

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {/* Filters Toolbar */}
      <div className="rounded-md bg-white p-3 shadow">
        {/* Desktop View */}
        <div className="hidden lg:flex flex-wrap items-center gap-2">
          <select className="w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={accountId} onChange={(event) => { setPage(1); setAccountId(event.target.value) }}>
            {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.type})</option>)}
          </select>
          <DatePickerInput className="w-[130px]" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
          <span className="text-xs text-slate-400">→</span>
          <DatePickerInput className="w-[130px]" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
          <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-emerald-700 transition-colors flex items-center justify-center" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : 'ส่งออก Excel'}</button>
          <button className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-60 disabled:cursor-not-allowed opacity-75" disabled title="ต้องออกแบบ audit/backup/rollback ก่อนเปิดใช้งาน" type="button">🧹 ลบ Duplicate</button>
        </div>

        {/* Mobile View (Collapsible Filters) */}
        <div className="block lg:hidden space-y-2.5">
          <div className="flex gap-2">
            <select className="flex-1 min-w-0 rounded-md border px-3 py-2 text-sm font-medium text-slate-900" value={accountId} onChange={(event) => { setPage(1); setAccountId(event.target.value) }}>
              {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.type})</option>)}
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
            <button
              className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60 shrink-0"
              disabled={isExporting}
              type="button"
              onClick={() => void exportXlsx()}
            >
              {isExporting ? '...' : '📥 .xlsx'}
            </button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2 items-center">
                <label className="text-xs text-slate-500">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
                </label>
                <label className="text-xs text-slate-500">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
                </label>
              </div>
              <div className="flex justify-end pt-1">
                <button className="w-full rounded-md bg-red-100 px-3 py-2 text-xs font-bold text-red-700 opacity-70" disabled title="ต้องออกแบบ audit/backup/rollback ก่อนเปิดใช้งาน" type="button">🧹 ลบ Duplicate</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-lg sm:text-xl shrink-0">
            🏦
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">บัญชี</div>
            <div className="truncate text-lg font-bold text-slate-800">{selectedAccount?.name ?? 'กำลังโหลด'}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">{selectedAccount?.type ?? '-'}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${cashIn === 0 ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-600'} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
            📥
          </div>
          <div>
            <div className={`text-xs ${cashIn === 0 ? 'text-slate-500' : 'text-emerald-600'}`}>เงินเข้ารวม</div>
            <div className={`font-mono text-2xl font-bold ${cashIn === 0 ? 'text-slate-900' : 'text-emerald-700'}`}>{formatMoney(cashIn)}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">บาท</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${cashOut === 0 ? 'bg-slate-100 text-slate-600' : 'bg-rose-100 text-rose-600'} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
            📤
          </div>
          <div>
            <div className={`text-xs ${cashOut === 0 ? 'text-slate-500' : 'text-rose-600'}`}>เงินออกรวม</div>
            <div className={`font-mono text-2xl font-bold ${cashOut === 0 ? 'text-slate-900' : 'text-rose-700'}`}>{formatMoney(cashOut)}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">บาท</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${closingBalance === 0 ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-600'} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
            💰
          </div>
          <div>
            <div className={`text-xs ${closingBalance === 0 ? 'text-slate-500' : 'text-blue-600'}`}>ยอดคงเหลือ</div>
            <div className={`font-mono text-2xl font-bold ${closingBalance === 0 ? 'text-slate-900' : 'text-blue-700'}`}>{formatMoney(closingBalance)}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">บาท</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel rows={displayRows} title="📈 ยอดคงเหลือสะสม" variant="balance" />
        <ChartPanel rows={displayRows} title="📊 กระแสเงิน (เข้า/ออก)" variant="flow" />
      </div>
      <div className="rounded-md bg-white p-3 shadow-lg">
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" placeholder="ค้นหาเลขอ้างอิง / คำอธิบาย / หมายเหตุ" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
          <select className="rounded-md border px-3 py-2 text-sm" value={refType} onChange={(event) => { setPage(1); setRefType(event.target.value) }}>
            <option value="">ทุก ref type</option>
            {(data?.filters.refTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={type} onChange={(event) => { setPage(1); setType(event.target.value) }}>
            <option value="">ทุก type</option>
            {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => { setPage(1); setSortDirection((current) => current === 'asc' ? 'desc' : 'asc') }}>วันที่ {sortDirection === 'asc' ? 'เก่าไปใหม่' : 'ใหม่ไปเก่า'}</button>
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => { setFrom(''); setPage(1); setQ(''); setRefType(''); setTo(''); setType('') }}>ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">บัญชี {selectedAccount?.code ? `${selectedAccount.code} - ` : ''}{selectedAccount?.name ?? '-'} / {selectedAccount?.bankName ?? '-'}</span>
          <span className="ml-auto text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
        </div>
      </div>
      <DetailTable rows={displayRows} isLoading={isLoading} onOpen={setSelectedRow} totalRows={displayRows.length} />
      <div className="flex items-center justify-end gap-2">
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
        <span className="text-sm text-slate-600">หน้า {page} / {totalPages}</span>
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</button>
      </div>
      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function ChartPanel({ rows, title, variant }: { rows: BankRow[]; title: string; variant: 'balance' | 'flow' }) {
  const chartRows = rows.slice(-18)
  const maxBalance = Math.max(1, ...chartRows.map((row) => Math.abs(row.runningBalance)))
  const maxFlow = Math.max(1, ...chartRows.map((row) => Math.max(row.amountIn, row.amountOut)))
  return (
    <div className="rounded-md bg-white p-4 shadow-lg">
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      <div className="flex h-[280px] items-end gap-1 rounded-md border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-3">
        {chartRows.length === 0 ? <div className="m-auto text-sm text-slate-400">ไม่มีรายการ</div> : null}
        {variant === 'balance'
          ? chartRows.map((row) => (
              <div key={`${row.id}-balance`} className="flex min-w-5 flex-1 flex-col items-center justify-end gap-1">
                <div className={`w-full rounded-md-t ${row.runningBalance >= 0 ? 'bg-blue-500/80' : 'bg-red-500/80'}`} style={{ height: `${Math.max(6, Math.abs(row.runningBalance) / maxBalance * 220)}px` }} title={`${formatDateDisplay(row.date)}: ${formatMoney(row.runningBalance)}`} />
                <span className="w-full truncate text-center text-[10px] text-slate-400">{row.date === '-' ? 'ยกมา' : formatDateDisplay(row.date).slice(0, 5)}</span>
              </div>
            ))
          : chartRows.map((row) => (
              <div key={`${row.id}-flow`} className="flex min-w-5 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex w-full flex-col justify-end gap-0.5">
                  <div className="w-full rounded-md-t bg-emerald-500/80" style={{ height: `${row.amountIn > 0 ? Math.max(4, row.amountIn / maxFlow * 110) : 2}px` }} title={`เข้า ${formatMoney(row.amountIn)}`} />
                  <div className="w-full rounded-md-b bg-rose-500/80" style={{ height: `${row.amountOut > 0 ? Math.max(4, row.amountOut / maxFlow * 110) : 2}px` }} title={`ออก ${formatMoney(row.amountOut)}`} />
                </div>
                <span className="w-full truncate text-center text-[10px] text-slate-400">{row.date === '-' ? 'ยกมา' : formatDateDisplay(row.date).slice(0, 5)}</span>
              </div>
            ))}
      </div>
    </div>
  )
}

function DetailTable({ isLoading, onOpen, rows, totalRows }: { isLoading: boolean; onOpen: (row: BankRow) => void; rows: BankRow[]; totalRows: number }) {
  return (
    <div className="overflow-hidden rounded-md bg-white shadow-lg">
      <div className="flex items-center justify-between border-b bg-slate-50 p-3">
        <h3 className="font-bold text-slate-700">📋 รายการเดินบัญชี ({totalRows} รายการ)</h3>
      </div>
      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-900 text-white">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">วันที่</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">ประเภท</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">รายละเอียด</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">อ้างอิง</th>
              <th className="bg-emerald-700/40 p-2 text-right">📥 เข้า</th>
              <th className="bg-rose-700/40 p-2 text-right">📤 ออก</th>
              <th className="bg-blue-700/40 p-2 text-right">💰 คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>ไม่มีรายการ</td></tr> : null}
            {!isLoading && rows.map((row) => {
              const isOpening = row.type === 'ยอดยกมา'
              return (
                <tr key={row.id} className={`border-t border-slate-100 transition hover:bg-yellow-50 ${isOpening ? 'bg-amber-50 font-bold' : ''}`}>
                  <td className="px-4 py-3.5 font-mono text-xs">{isOpening ? row.date : formatDateDisplay(row.date)}</td>
                  <td className="px-4 py-3.5 text-xs"><span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isOpening ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>{row.type || row.refType || '-'}</span></td>
                  <td className="max-w-96 truncate p-2 text-xs">{row.description || row.note || '-'}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-blue-600">
                    {isOpening ? '-' : <button className="underline-offset-2 hover:underline" type="button" onClick={() => onOpen(row)}>{row.refNo || row.refType || '-'}</button>}
                  </td>
                  <td className={`bg-emerald-50/30 p-2 text-right font-mono ${row.amountIn > 0 ? 'font-bold text-emerald-700' : 'text-slate-300'}`}>{row.amountIn ? formatMoney(row.amountIn) : '-'}</td>
                  <td className={`bg-rose-50/30 p-2 text-right font-mono ${row.amountOut > 0 ? 'font-bold text-rose-700' : 'text-slate-300'}`}>{row.amountOut ? formatMoney(row.amountOut) : '-'}</td>
                  <td className={`bg-blue-50/30 p-2 text-right font-mono font-bold ${row.runningBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatMoney(row.runningBalance)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3 p-3 bg-slate-50/50 border-t border-slate-100">
        {isLoading ? (
          <div className="py-6 text-center text-slate-500 text-xs">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && rows.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีรายการ</div>
        ) : null}
        {!isLoading && rows.map((row) => {
          const isOpening = row.type === 'ยอดยกมา'
          return (
            <div
              key={row.id}
              className={`rounded-md border border-slate-100 bg-white p-3.5 shadow-sm space-y-2 text-sm ${isOpening ? 'bg-amber-50/80 border-amber-200' : ''}`}
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-slate-500 text-xs">{isOpening ? row.date : formatDateDisplay(row.date)}</span>
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${isOpening ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                  {row.type || row.refType || '-'}
                </span>
              </div>
              
              <div className="text-slate-700 font-medium line-clamp-2">{row.description || row.note || '-'}</div>
              
              {!isOpening && (
                <div className="text-slate-600 font-mono text-xs">
                  อ้างอิง: <button type="button" className="text-blue-600 underline font-semibold" onClick={() => onOpen(row)}>{row.refNo || row.refType || '-'}</button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100/60 mt-1 text-right text-xs">
                <div>
                  <span className="block text-[11px] text-slate-400">เข้า:</span>
                  <span className="text-emerald-700 font-bold tabular-nums text-sm">{row.amountIn ? formatMoney(row.amountIn) : '-'}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-400">ออก:</span>
                  <span className="text-rose-700 font-bold tabular-nums text-sm">{row.amountOut ? formatMoney(row.amountOut) : '-'}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-500">คงเหลือ:</span>
                  <span className={`font-bold tabular-nums text-sm ${row.runningBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                    {formatMoney(row.runningBalance)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: BankRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-md bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{row.refNo || row.id}</h2>
            <p className="text-xs text-slate-300">{row.accountName}</p>
          </div>
          <button className="text-2xl text-white/80 hover:text-white" type="button" onClick={onClose}>&times;</button>
        </div>
        <div className="space-y-4 p-5">
          {/* ข้อมูลบัญชีและอ้างอิง */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">ข้อมูลบัญชีและอ้างอิง</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailItem label="วันที่" value={formatDateDisplay(row.date)} />
              <DetailItem label="บัญชี" value={row.accountName || '-'} />
              <DetailItem label="ธนาคาร" value={row.bankName || '-'} />
              <DetailItem label="เลขบัญชี" value={row.accountNo || '-'} />
              <DetailItem label="Ref type" value={row.refType || '-'} />
              <DetailItem label="Type" value={row.type || '-'} />
              <DetailItem label="Cash flow" value={row.cashFlowCategory || '-'} />
            </div>
          </div>

          {/* ข้อมูลการเงิน */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">ข้อมูลการเงิน</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailItem label="เงินเข้า" value={`${formatMoney(row.amountIn)} บาท`} />
              <DetailItem label="เงินออก" value={`${formatMoney(row.amountOut)} บาท`} />
              <DetailItem label="คงเหลือ" value={`${formatMoney(row.runningBalance)} บาท`} />
            </div>
          </div>

          {/* รายละเอียดและหมายเหตุ */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">รายละเอียดและหมายเหตุ</div>
            <div className="grid grid-cols-1 gap-y-3">
              <DetailItem label="คำอธิบาย" value={row.description || '-'} />
              <DetailItem label="หมายเหตุ" value={row.note || '-'} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100/50" type="button" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1.5 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-sm sm:text-base font-bold text-slate-800">{value}</div>
    </div>
  )
}
