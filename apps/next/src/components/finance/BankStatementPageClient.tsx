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
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [tab, setTab] = useState<'summary' | 'detail'>('detail')
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

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-sky-700 to-cyan-700 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">Cash / Bank Statement</h1>
        <p className="mt-1 text-sm opacity-90">อ่าน ledger เงินเข้าออกจาก bank_statement พร้อม running balance ต่อบัญชีสำหรับ reconciliation</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="เงินเข้า" value={formatMoney(data?.summary.amountIn ?? 0)} />
        <Metric label="เงินออก" value={formatMoney(data?.summary.amountOut ?? 0)} />
        <Metric label="สุทธิ" value={formatMoney(data?.summary.netMovement ?? 0)} />
        <Metric label="รายการ" value={`${data?.summary.rows ?? 0}`} />
        <Metric label="บัญชี" value={`${data?.summary.accounts ?? 0}`} />
      </div>
      <div className="rounded-lg bg-white p-3 shadow">
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="rounded-lg border px-3 py-2 text-sm lg:col-span-2" placeholder="ค้นหาบัญชี / เลขอ้างอิง / คำอธิบาย" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={accountId} onChange={(event) => { setPage(1); setAccountId(event.target.value) }}>
            <option value="">ทุกบัญชี</option>
            {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.code ? `${account.code} - ${account.name}` : account.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={refType} onChange={(event) => { setPage(1); setRefType(event.target.value) }}>
            <option value="">ทุก ref type</option>
            {(data?.filters.refTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={type} onChange={(event) => { setPage(1); setType(event.target.value) }}>
            <option value="">ทุก type</option>
            {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : 'Export .xlsx'}</button>
          <label className="text-xs text-slate-500">
            จากวันที่
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value) }} />
          </label>
          <label className="text-xs text-slate-500">
            ถึงวันที่
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value) }} />
          </label>
          <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => { setAccountId(''); setFrom(''); setPage(1); setQ(''); setRefType(''); setTo(''); setType('') }}>ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={`rounded px-4 py-2 text-sm ${tab === 'summary' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} type="button" onClick={() => setTab('summary')}>สรุปตามบัญชี</button>
          <button className={`rounded px-4 py-2 text-sm ${tab === 'detail' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} type="button" onClick={() => setTab('detail')}>รายการเดินบัญชี</button>
          <button className="rounded bg-slate-100 px-3 py-2 text-sm" type="button" onClick={() => { setPage(1); setSortDirection((current) => current === 'asc' ? 'desc' : 'asc') }}>วันที่ {sortDirection === 'asc' ? 'เก่าไปใหม่' : 'ใหม่ไปเก่า'}</button>
          <span className="ml-auto text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
        </div>
      </div>
      {tab === 'summary' ? <SummaryTable rows={data?.byAccount ?? []} isLoading={isLoading} /> : <DetailTable rows={data?.rows ?? []} isLoading={isLoading} onOpen={setSelectedRow} />}
      {tab === 'detail' ? (
        <div className="flex items-center justify-end gap-2">
          <button className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
          <span className="text-sm text-slate-600">หน้า {page} / {totalPages}</span>
          <button className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</button>
        </div>
      ) : null}
      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-900">{value}</div></div>
}

function SummaryTable({ isLoading, rows }: { isLoading: boolean; rows: BankPayload['byAccount'] }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr><th className="p-2 text-left">บัญชี</th><th className="p-2 text-right">รายการ</th><th className="p-2 text-right">เงินเข้า</th><th className="p-2 text-right">เงินออก</th><th className="p-2 text-right">ยอดล่าสุด</th></tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={5}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={5}>ไม่พบรายการตามเงื่อนไข</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.accountId} className="border-t hover:bg-slate-50">
              <td className="p-2 font-medium">{row.accountName}</td><td className="p-2 text-right">{row.rows}</td><td className="p-2 text-right text-emerald-700">{formatMoney(row.amountIn)}</td><td className="p-2 text-right text-red-700">{formatMoney(row.amountOut)}</td><td className="p-2 text-right font-semibold">{formatMoney(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailTable({ isLoading, onOpen, rows }: { isLoading: boolean; onOpen: (row: BankRow) => void; rows: BankRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">บัญชี</th><th className="p-2 text-left">Ref</th><th className="p-2 text-left">คำอธิบาย</th><th className="p-2 text-right">เข้า</th><th className="p-2 text-right">ออก</th><th className="p-2 text-right">คงเหลือ</th></tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>ไม่พบรายการเดินบัญชีตามเงื่อนไข</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.id} className="border-t hover:bg-slate-50">
              <td className="p-2">{row.date}</td>
              <td className="p-2">{row.accountName}</td>
              <td className="p-2"><button className="font-mono text-xs text-sky-700 underline-offset-2 hover:underline" type="button" onClick={() => onOpen(row)}>{row.refNo || row.refType || '-'}</button></td>
              <td className="max-w-80 truncate p-2">{row.description || row.note || '-'}</td>
              <td className="p-2 text-right text-emerald-700">{formatMoney(row.amountIn)}</td>
              <td className="p-2 text-right text-red-700">{formatMoney(row.amountOut)}</td>
              <td className="p-2 text-right font-semibold">{formatMoney(row.runningBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: BankRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{row.refNo || row.id}</h2>
            <p className="text-sm text-slate-500">{row.accountName}</p>
          </div>
          <button className="rounded bg-slate-100 px-3 py-1 text-sm" type="button" onClick={onClose}>ปิด</button>
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
  return <div className="rounded border border-slate-200 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-900">{value}</div></div>
}
