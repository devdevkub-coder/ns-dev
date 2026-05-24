'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'

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
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<BankPayload>(`/api/finance/bank?${query.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Bank Statement ไม่ได้')
    } finally {
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
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <select className="w-64 rounded-md border px-3 py-2 text-sm font-medium text-slate-900" value={accountId} onChange={(event) => { setPage(1); setAccountId(event.target.value) }}>
          {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.type})</option>)}
        </select>
        <input className="rounded-md border px-2 py-2 text-xs text-slate-900" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value) }} />
        <span className="text-xs text-slate-400">→</span>
        <input className="rounded-md border px-2 py-2 text-xs text-slate-900" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value) }} />
        <button className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : '📤 .xlsx'}</button>
        <button className="rounded-md bg-red-100 px-3 py-2 text-xs font-bold text-red-700 opacity-70" disabled title="ต้องออกแบบ audit/backup/rollback ก่อนเปิดใช้งาน" type="button">🧹 ลบ Duplicate</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-md">
          <div className="text-xs text-slate-500">🏦 บัญชี</div>
          <div className="truncate text-lg font-bold text-slate-800">{selectedAccount?.name ?? 'กำลังโหลด'}</div>
          <div className="mt-1 text-xs text-slate-400">{selectedAccount?.type ?? '-'}</div>
        </div>
        <div className="rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 shadow-md">
          <div className="text-xs text-emerald-600">📥 เงินเข้ารวม</div>
          <div className="font-mono text-2xl font-bold text-emerald-700">{formatMoney(cashIn)}</div>
          <div className="mt-1 text-xs text-emerald-500">บาท</div>
        </div>
        <div className="rounded-md border border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100 p-4 shadow-md">
          <div className="text-xs text-rose-600">📤 เงินออกรวม</div>
          <div className="font-mono text-2xl font-bold text-rose-700">{formatMoney(cashOut)}</div>
          <div className="mt-1 text-xs text-rose-500">บาท</div>
        </div>
        <div className="rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-md">
          <div className="text-xs opacity-80">💰 ยอดคงเหลือ</div>
          <div className="font-mono text-3xl font-bold">{formatMoney(closingBalance)}</div>
          <div className="mt-1 text-xs opacity-80">บาท</div>
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
                <div className={`w-full rounded-md-t ${row.runningBalance >= 0 ? 'bg-blue-500/80' : 'bg-red-500/80'}`} style={{ height: `${Math.max(6, Math.abs(row.runningBalance) / maxBalance * 220)}px` }} title={`${row.date}: ${formatMoney(row.runningBalance)}`} />
                <span className="w-full truncate text-center text-[10px] text-slate-400">{row.date === '-' ? 'ยกมา' : row.date.slice(5)}</span>
              </div>
            ))
          : chartRows.map((row) => (
              <div key={`${row.id}-flow`} className="flex min-w-5 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex w-full flex-col justify-end gap-0.5">
                  <div className="w-full rounded-md-t bg-emerald-500/80" style={{ height: `${row.amountIn > 0 ? Math.max(4, row.amountIn / maxFlow * 110) : 2}px` }} title={`เข้า ${formatMoney(row.amountIn)}`} />
                  <div className="w-full rounded-md-b bg-rose-500/80" style={{ height: `${row.amountOut > 0 ? Math.max(4, row.amountOut / maxFlow * 110) : 2}px` }} title={`ออก ${formatMoney(row.amountOut)}`} />
                </div>
                <span className="w-full truncate text-center text-[10px] text-slate-400">{row.date === '-' ? 'ยกมา' : row.date.slice(5)}</span>
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-900 text-white">
            <tr>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">ประเภท</th>
              <th className="p-2 text-left">รายละเอียด</th>
              <th className="p-2 text-left">อ้างอิง</th>
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
                <tr key={row.id} className={`border-t transition hover:bg-yellow-50 ${isOpening ? 'bg-amber-50 font-bold' : ''}`}>
                  <td className="p-2 font-mono text-xs">{row.date}</td>
                  <td className="p-2 text-xs"><span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isOpening ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>{row.type || row.refType || '-'}</span></td>
                  <td className="max-w-96 truncate p-2 text-xs">{row.description || row.note || '-'}</td>
                  <td className="p-2 font-mono text-xs text-blue-600">
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
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: BankRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-md bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{row.refNo || row.id}</h2>
            <p className="text-sm text-slate-500">{row.accountName}</p>
          </div>
          <button className="rounded-md bg-slate-100 px-3 py-1 text-sm" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="วันที่" value={row.date} />
          <Info label="บัญชี" value={row.accountName} />
          <Info label="ธนาคาร" value={row.bankName || '-'} />
          <Info label="เลขบัญชี" value={row.accountNo || '-'} />
          <Info label="Ref type" value={row.refType || '-'} />
          <Info label="Type" value={row.type || '-'} />
          <Info label="เงินเข้า" value={formatMoney(row.amountIn)} />
          <Info label="เงินออก" value={formatMoney(row.amountOut)} />
          <Info label="คงเหลือ" value={formatMoney(row.runningBalance)} />
          <Info label="Cash flow" value={row.cashFlowCategory || '-'} />
          <Info label="คำอธิบาย" value={row.description || '-'} />
          <Info label="หมายเหตุ" value={row.note || '-'} />
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-900">{value}</div></div>
}
