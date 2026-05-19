'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AmountRow = {
  grossProfit: number
  matchedPurchaseAmount: number
  matchedQty?: number
  matchedSalesAmount: number
}

type TradingDashboardPayload = {
  filters: { statuses: string[] }
  recentDeals: Array<{
    customerName: string
    date: string
    dealNo: string
    grossProfit: number
    grossProfitPct: number
    id: string
    matchedPurchaseAmount: number
    matchedQty: number
    matchedSalesAmount: number
    productName: string
    purchaseBillNo: string
    salesBillNo: string
    status: string
    supplierName: string
  }>
  statusBreakdown: Array<AmountRow & { count: number; status: string }>
  summary: AmountRow & {
    activeDeals: number
    cancelledDeals: number
    grossProfitPct: number
    totalDeals: number
  }
  topProducts: Array<AmountRow & { matchedQty: number; productName: string }>
  trend: Array<AmountRow & { matchedQty: number; month: string }>
}

export function TradingDashboardPageClient() {
  const [data, setData] = useState<TradingDashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (status !== 'all') params.set('status', status)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const query = params.toString()
      setData(await dailyFetchJson<TradingDashboardPayload>(`/api/trading/dashboard${query ? `?${query}` : ''}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Trading Dashboard ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [fromDate, search, status, toDate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const latestTrend = useMemo(() => data?.trend.slice(-6) ?? [], [data?.trend])

  const resetFilters = () => {
    setFromDate('')
    setSearch('')
    setStatus('all')
    setToDate('')
  }

  const hasFilters = search.trim() || status !== 'all' || fromDate || toDate

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-violet-700 to-cyan-700 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">Trading Dashboard</h1>
        <p className="mt-1 text-sm opacity-90">ภาพรวมดีล trading จาก `trading_deals` สำหรับดู margin, status และ trend แบบ read-only</p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Deals ทั้งหมด" value={`${data?.summary.totalDeals ?? 0}`} />
        <Metric label="Active" value={`${data?.summary.activeDeals ?? 0}`} tone="emerald" />
        <Metric label="Cancelled" value={`${data?.summary.cancelledDeals ?? 0}`} tone="red" />
        <Metric label="Qty Matched" value={formatMoney(data?.summary.matchedQty ?? 0)} />
        <Metric label="Sales" value={formatMoney(data?.summary.matchedSalesAmount ?? 0)} />
        <Metric label="Cost" value={formatMoney(data?.summary.matchedPurchaseAmount ?? 0)} />
        <Metric label="GP" value={formatMoney(data?.summary.grossProfit ?? 0)} tone={(data?.summary.grossProfit ?? 0) < 0 ? 'red' : 'emerald'} />
        <Metric label="GP %" value={`${formatMoney(data?.summary.grossProfitPct ?? 0)}%`} />
      </div>

      <div className="rounded-lg bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="สถานะ" className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input aria-label="วันที่เริ่มต้น" className="rounded-lg border px-3 py-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input aria-label="วันที่สิ้นสุด" className="rounded-lg border px-3 py-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <input className="min-w-64 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="ค้นหา deal / PB / SB / supplier / customer / product" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          {hasFilters ? <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={resetFilters}>ล้าง</button> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Status">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">สถานะ</th><th className="p-2 text-right">Deals</th><th className="p-2 text-right">GP</th></tr></thead>
            <tbody>{(data?.statusBreakdown ?? []).map((row) => <tr key={row.status} className="border-t"><td className="p-2">{row.status}</td><td className="p-2 text-right">{row.count}</td><td className="p-2 text-right">{formatMoney(row.grossProfit)}</td></tr>)}</tbody>
          </table>
        </Panel>
        <Panel title="Trend ล่าสุด">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">เดือน</th><th className="p-2 text-right">Sales</th><th className="p-2 text-right">GP</th></tr></thead>
            <tbody>{latestTrend.map((row) => <tr key={row.month} className="border-t"><td className="p-2">{row.month}</td><td className="p-2 text-right">{formatMoney(row.matchedSalesAmount)}</td><td className="p-2 text-right">{formatMoney(row.grossProfit)}</td></tr>)}</tbody>
          </table>
        </Panel>
        <Panel title="Top Product">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">GP</th></tr></thead>
            <tbody>{(data?.topProducts ?? []).slice(0, 6).map((row) => <tr key={row.productName} className="border-t"><td className="max-w-40 truncate p-2">{row.productName}</td><td className="p-2 text-right">{formatMoney(row.matchedQty)}</td><td className="p-2 text-right">{formatMoney(row.grossProfit)}</td></tr>)}</tbody>
          </table>
        </Panel>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Deal</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-left">PB / Supplier</th><th className="p-2 text-left">SB / Customer</th><th className="p-2 text-right">Sales</th><th className="p-2 text-right">Cost</th><th className="p-2 text-right">GP</th><th className="p-2 text-center">สถานะ</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && (data?.recentDeals.length ?? 0) === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>ไม่พบข้อมูลตามเงื่อนไข</td></tr> : null}
            {!isLoading && (data?.recentDeals ?? []).map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2 font-mono text-xs">{row.dealNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{row.productName}</td>
                <td className="p-2">{row.purchaseBillNo || '-'} · {row.supplierName}</td>
                <td className="p-2">{row.salesBillNo || '-'} · {row.customerName}</td>
                <td className="p-2 text-right">{formatMoney(row.matchedSalesAmount)}</td>
                <td className="p-2 text-right">{formatMoney(row.matchedPurchaseAmount)}</td>
                <td className={`p-2 text-right font-semibold ${row.grossProfit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(row.grossProfit)}</td>
                <td className="p-2 text-center">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, tone = 'normal', value }: { label: string; tone?: 'emerald' | 'normal' | 'red'; value: string }) {
  const toneClass = { emerald: 'text-emerald-700', normal: 'text-slate-900', red: 'text-red-700' }[tone]
  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</div></div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="overflow-x-auto rounded-lg bg-white shadow"><div className="border-b p-3 text-sm font-semibold">{title}</div>{children}</div>
}
