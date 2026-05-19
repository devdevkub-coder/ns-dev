'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type PoSellRow = {
  branchName: string
  channelName: string
  customerName: string
  date: string
  docNo: string
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
  const [isLoading, setIsLoading] = useState(true)
  const [matchStatus, setMatchStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<PoSellPayload>('/api/sales/po-sell'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด PO Sell ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (matchStatus !== 'all' && row.matchStatus !== matchStatus) return false
      if (!query) return true
      return `${row.docNo} ${row.customerName} ${row.channelName} ${row.branchName} ${row.productName} ${row.status} ${row.matchStatus}`.toLowerCase().includes(query)
    })
  }, [data?.rows, matchStatus, search, status])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (matchStatus !== 'all') params.set('matchStatus', matchStatus)
    return `/api/sales/po-sell?${params.toString()}`
  }, [matchStatus, search, status])

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-emerald-700 to-cyan-700 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">PO Sell / จองขาย</h1>
        <p className="mt-1 text-sm opacity-90">รายงาน PO ขายและสถานะ matching สำหรับตรวจคงเหลือก่อนออก flow ส่งของหรือ allocation</p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="PO ทั้งหมด" value={`${data?.summary.totalRows ?? 0}`} />
        <Metric label="Open" value={`${data?.summary.open ?? 0}`} />
        <Metric label="Matched ครบ" value={`${data?.summary.fullyMatched ?? 0}`} tone="emerald" />
        <Metric label="Matched บางส่วน" value={`${data?.summary.partiallyMatched ?? 0}`} tone="amber" />
        <Metric label="ยังไม่ Match" value={`${data?.summary.unmatched ?? 0}`} tone="red" />
        <Metric label="Qty คงเหลือ" value={`${formatMoney(data?.summary.remainingQty ?? 0)} กก.`} tone="amber" />
        <Metric label="มูลค่าคงเหลือ" value={formatMoney(data?.summary.remainingAmount ?? 0)} />
        <Metric label="Margin" value={formatMoney(data?.summary.margin ?? 0)} tone={(data?.summary.margin ?? 0) < 0 ? 'red' : 'emerald'} />
      </div>

      <div className="rounded-lg bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="สถานะ" className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="สถานะการจับคู่" className="rounded-lg border px-3 py-2 text-sm" value={matchStatus} onChange={(event) => setMatchStatus(event.target.value)}>
            <option value="all">ทุก Matching</option>
            {(data?.filters.matchStatuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input className="min-w-64 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="ค้นหาเลขที่ PO / Customer / ช่องทาง / สาขา / สินค้า" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">Customer</th>
              <th className="p-2 text-left">ช่องทาง / สาขา</th>
              <th className="p-2 text-left">สินค้า</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">คงเหลือ</th>
              <th className="p-2 text-right">ราคา</th>
              <th className="p-2 text-right">ยอดขาย</th>
              <th className="p-2 text-right">Matched</th>
              <th className="p-2 text-right">Margin</th>
              <th className="p-2 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>ไม่พบข้อมูลตามเงื่อนไข</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{row.customerName}</td>
                <td className="p-2 text-xs"><div>{row.channelName || '-'}</div><div className="text-slate-500">{row.branchName || '-'}</div></td>
                <td className="p-2">{row.productName || '-'}<div className="text-xs text-slate-500">{row.itemCount} รายการ · {row.requireDelivery ? 'Delivery' : 'Costing'}</div></td>
                <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                <td className="p-2 text-right text-amber-700">{formatMoney(row.remainingQty)}<div className="text-xs">{formatMoney(row.remainingAmount)}</div></td>
                <td className="p-2 text-right">{formatMoney(row.unitPrice)}</td>
                <td className="p-2 text-right font-semibold">{formatMoney(row.totalAmount)}</td>
                <td className="p-2 text-right">{formatMoney(row.matchedQty)}<div className="text-xs text-slate-500">{formatPercent(row.matchedPct)}</div></td>
                <td className={`p-2 text-right font-semibold ${row.margin < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(row.margin)}<div className="text-xs">{formatPercent(row.marginPct)}</div></td>
                <td className="p-2 text-center"><StatusPill label={row.status} /><div className="mt-1"><StatusPill label={row.matchStatus} tone="match" /></div></td>
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

function Metric({ label, tone = 'normal', value }: { label: string; tone?: 'amber' | 'emerald' | 'normal' | 'red'; value: string }) {
  const toneClass = {
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
    normal: 'text-slate-900',
    red: 'text-red-700',
  }[tone]

  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</div></div>
}

function StatusPill({ label, tone = 'status' }: { label: string; tone?: 'match' | 'status' }) {
  const color = tone === 'match' ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${color}`}>{label || '-'}</span>
}
