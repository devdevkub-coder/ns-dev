'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type PoSellRow = {
  branchName: string
  channelName: string
  customerName: string
  date: string
  docNo: string
  expectedDelivery: string
  id: string
  itemCount: number
  margin: number
  marginPct: number
  matchStatus: string
  matchedCost: number
  matchedPct: number
  matchedQty: number
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  requireDelivery: boolean
  status: string
  totalAmount: number
  unitPrice: number
}

type PoSellPayload = {
  filters: { matchStatuses: string[]; statuses: string[] }
  rows: PoSellRow[]
  summary: {
    fullyMatched: number
    margin: number
    open: number
    overMatched: number
    partiallyMatched: number
    qty: number
    remainingAmount: number
    remainingQty: number
    totalAmount: number
    totalRows: number
    unmatched: number
  }
}

export function PoSellPageClient() {
  const [data, setData] = useState<PoSellPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [matchStatus, setMatchStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')

  const dateQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [fromDate, toDate])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<PoSellPayload>(`/api/sales/po-sell${dateQuery ? `?${dateQuery}` : ''}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด PO Sell ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [dateQuery])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (matchStatus !== 'all' && row.matchStatus !== matchStatus) return false
      if (status !== 'all' && row.status !== status) return false
      if (!query) return true
      return `${row.docNo} ${row.customerName} ${row.channelName} ${row.branchName} ${row.productName} ${row.status} ${row.matchStatus}`.toLowerCase().includes(query)
    })
  }, [data?.rows, matchStatus, search, status])

  const topCustomers = useMemo(() => {
    const byCustomer = new Map<string, { count: number; name: string; remaining: number; revenue: number }>()
    for (const row of data?.rows ?? []) {
      const current = byCustomer.get(row.customerName) ?? { count: 0, name: row.customerName, remaining: 0, revenue: 0 }
      current.count += 1
      current.revenue += row.totalAmount
      current.remaining += row.remainingQty
      byCustomer.set(row.customerName, current)
    }
    return Array.from(byCustomer.values()).sort((left, right) => right.revenue - left.revenue).slice(0, 5)
  }, [data?.rows])

  const outstandingRows = useMemo(() => (data?.rows ?? [])
    .filter((row) => row.requireDelivery && row.remainingQty > 0)
    .sort((left, right) => (left.expectedDelivery || left.date).localeCompare(right.expectedDelivery || right.date))
    .slice(0, 12), [data?.rows])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (status !== 'all') params.set('status', status)
    if (matchStatus !== 'all') params.set('matchStatus', matchStatus)
    return `/api/sales/po-sell?${params.toString()}`
  }, [fromDate, matchStatus, search, status, toDate])

  return (
    <section>
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <strong>📤 PO Sell = จองขายล่วงหน้า</strong> — ใช้กับ Cost Allocator เพื่อคำนวณกำไรคาดการณ์ก่อนขายจริง
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 p-4 text-white shadow" label="📋 PO ทั้งหมด" subLabel={`รายได้รวม ${formatMoney(data?.summary.totalAmount ?? 0)}`} value={`${data?.summary.totalRows ?? 0}`} valueClassName="text-2xl font-bold" />
        <Metric className="rounded-xl border-l-4 border-slate-500 bg-white p-4 shadow" label="⚪ Not Matched" subLabel="รอ Match Cost" value={`${data?.summary.unmatched ?? 0}`} valueClassName="text-2xl font-bold text-slate-700" />
        <Metric className="rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow" label="⚙ Partial" subLabel="Match บางส่วน" value={`${data?.summary.partiallyMatched ?? 0}`} valueClassName="text-2xl font-bold text-amber-700" />
        <Metric className="rounded-xl border-l-4 border-emerald-500 bg-white p-4 shadow" label="✓ Fully Matched" subLabel="พร้อมขาย" value={`${data?.summary.fullyMatched ?? 0}`} valueClassName="text-2xl font-bold text-emerald-700" />
        <Metric className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow" label="⏳ น้ำหนักรอส่ง" subLabel={`จาก ${formatMoney(data?.summary.qty ?? 0)} กก.`} value={formatMoney(data?.summary.remainingQty ?? 0)} valueClassName="text-xl font-bold text-amber-700" />
        <Metric className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow" label="💰 มูลค่ารอส่ง" subLabel="รายได้รอรับ" value={formatMoney(data?.summary.remainingAmount ?? 0)} valueClassName="text-xl font-bold text-emerald-700" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Customer (ยอดสั่งจอง)</div>
          {topCustomers.length === 0 ? <div className="text-xs text-slate-400">ไม่มีข้อมูล</div> : null}
          <div className="space-y-2">
            {topCustomers.map((customer, index) => {
              const maxRevenue = topCustomers[0]?.revenue ?? 0
              return (
                <div key={customer.name} className="text-xs">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="w-4 text-center font-bold text-slate-400">{index + 1}</span>
                    <span className="flex-1 truncate">{customer.name}</span>
                    <span className="text-slate-500">{customer.count} PO</span>
                    <span className="w-24 text-right font-bold text-emerald-700">{formatMoney(customer.revenue)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${maxRevenue > 0 ? (customer.revenue / maxRevenue) * 100 : 0}%` }} /></div>
                  {customer.remaining > 0 ? <div className="ml-6 text-xs text-amber-600">⏳ รอส่ง {formatMoney(customer.remaining)}</div> : null}
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between text-sm font-bold text-slate-700">
            <span>📋 PO ค้างส่งสินค้า ({outstandingRows.length})</span>
            <span className="text-xs font-normal text-amber-700">เรียงตามวันส่งมอบ</span>
          </div>
          {outstandingRows.length === 0 ? <div className="py-4 text-center text-xs text-emerald-600">✅ ไม่มี PO ค้างส่ง</div> : null}
          {outstandingRows.length ? (
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50"><tr><th className="p-1 text-left">เลขที่</th><th className="p-1 text-left">Customer</th><th className="p-1 text-left">สินค้า</th><th className="p-1 text-right">รอส่ง</th><th className="p-1 text-right">มูลค่า</th><th className="p-1 text-left">วันส่ง</th></tr></thead>
                <tbody>{outstandingRows.map((row) => <tr key={row.id} className="border-t hover:bg-emerald-50"><td className="p-1 font-mono text-xs">{row.docNo}</td><td className="max-w-[100px] truncate p-1">{row.customerName}</td><td className="max-w-[100px] truncate p-1">{row.productName}</td><td className="p-1 text-right font-bold text-amber-700">{formatMoney(row.remainingQty)}</td><td className="p-1 text-right text-emerald-700">{formatMoney(row.remainingAmount)}</td><td className="p-1 text-xs">{row.expectedDelivery || '-'}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-4 space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="🔍 ค้นหาเลข PO / ชื่อ Customer / ชื่อสินค้า / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <input aria-label="จากวันที่" className="rounded-lg border px-2 py-2 text-sm" title="จากวันที่" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <span className="text-slate-400">→</span>
          <input aria-label="ถึงวันที่" className="rounded-lg border px-2 py-2 text-sm" title="ถึงวันที่" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          {search || fromDate || toDate || matchStatus !== 'all' || status !== 'all' ? <button className="rounded bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={() => { setSearch(''); setFromDate(''); setToDate(''); setMatchStatus('all'); setStatus('all') }}>✕ ล้าง</button> : null}
          <button className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm text-white opacity-60" disabled title="รอออกแบบ write permission, allocation side effects, audit, and validation ก่อนเปิดใช้งาน" type="button">+ PO Sell ใหม่</button>
          <a className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white" href={exportHref}>📥 .xlsx</a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ Match:</span>
          <MatchButton active={matchStatus === 'all'} label="ทั้งหมด" onClick={() => setMatchStatus('all')} />
          <MatchButton active={matchStatus === 'Not Matched'} label="ยังไม่ Match" tone="slate" onClick={() => setMatchStatus('Not Matched')} />
          <MatchButton active={matchStatus === 'Partially Matched'} label="Partial" tone="amber" onClick={() => setMatchStatus('Partially Matched')} />
          <MatchButton active={matchStatus === 'Fully Matched'} label="Full" tone="emerald" onClick={() => setMatchStatus('Fully Matched')} />
          <MatchButton active={matchStatus === 'Over Matched'} label="Over" tone="red" onClick={() => setMatchStatus('Over Matched')} />
          <MatchButton active={status === 'Cancelled'} label="Cancelled" tone="slate" onClick={() => setStatus(status === 'Cancelled' ? 'all' : 'Cancelled')} />
          <span className="ml-auto text-xs text-slate-500">📊 พบ <b className="text-slate-700">{rows.length}</b> PO</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">Customer</th>
              <th className="p-2 text-left">รายการ</th>
              <th className="p-2 text-right">จำนวนรวม</th>
              <th className="p-2 text-right">รายได้รวม</th>
              <th className="p-2 text-right">Matched</th>
              <th className="p-2 text-right">เหลือ</th>
              <th className="p-2 text-right">Deal Margin</th>
              <th className="p-2 text-right">%</th>
              <th className="p-2 text-center">สถานะ Match</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && rows.length === 0 ? <tr><td className="py-10 text-center text-slate-400" colSpan={12}>ยังไม่มี PO Sell</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2 font-mono">{row.docNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{row.customerName}</td>
                <td className="p-2 text-xs"><div>{row.productName || '-'}</div>{row.itemCount > 1 ? <div className="text-slate-400">+ อีก {row.itemCount - 1} รายการ</div> : null}</td>
                <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                <td className="p-2 text-right font-medium text-emerald-700">{formatMoney(row.totalAmount)}</td>
                <td className="p-2 text-right text-blue-700">{formatMoney(row.matchedQty)}</td>
                <td className="p-2 text-right text-amber-700">{formatMoney(row.remainingQty)}</td>
                <td className={`p-2 text-right font-bold ${row.margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(row.margin)}</td>
                <td className={`p-2 text-right ${row.marginPct < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatPercent(row.marginPct)}</td>
                <td className="p-2 text-center"><StatusPill label={row.matchStatus} tone="match" /></td>
                <td className="whitespace-nowrap p-2 text-right"><button className="mr-2 text-xs text-blue-600 opacity-50" disabled title="รอออกแบบ write permission/audit ก่อนเปิดใช้งาน" type="button">แก้</button><button className="text-xs text-red-600 opacity-50" disabled title="รอออกแบบ cancel/reconciliation ก่อนเปิดใช้งาน" type="button">ยกเลิก</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatPercent(value: number | null | undefined) {
  return `${formatMoney(value ?? 0)}%`
}

function Metric({ className, label, subLabel, value, valueClassName }: { className: string; label: string; subLabel?: string; value: string; valueClassName: string }) {
  return <div className={className}><div className="text-xs opacity-80">{label}</div><div className={valueClassName}>{value}</div>{subLabel ? <div className="mt-1 text-xs opacity-80">{subLabel}</div> : null}</div>
}

function MatchButton({ active, label, onClick, tone = 'dark' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const activeClass = {
    amber: 'border-amber-600 bg-amber-600 text-white',
    dark: 'border-slate-700 bg-slate-700 text-white',
    emerald: 'border-emerald-600 bg-emerald-600 text-white',
    red: 'border-red-600 bg-red-600 text-white',
    slate: 'border-slate-500 bg-slate-500 text-white',
  }[tone]
  const idleClass = tone === 'amber' ? 'border-slate-300 bg-white hover:bg-amber-50' : tone === 'emerald' ? 'border-slate-300 bg-white hover:bg-emerald-50' : tone === 'red' ? 'border-slate-300 bg-white hover:bg-red-50' : 'border-slate-300 bg-white hover:bg-slate-100'
  return <button className={`rounded border px-3 py-1 text-xs font-medium ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
}

function StatusPill({ label, tone = 'status' }: { label: string; tone?: 'match' | 'status' }) {
  const color = tone === 'match' ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${color}`}>{label || '-'}</span>
}
