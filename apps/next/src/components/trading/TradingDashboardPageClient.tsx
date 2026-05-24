'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BillSummaryRow = {
  date: string
  docNo: string
  id: string
  matchedAmount: number
  partyName: string
  remainingAmount: number
  totalAmount: number
}

type ProductRow = {
  cost: number
  gp: number
  gpPct: number
  productId: string
  productName: string
  qty: number
  sales: number
}

type TradingDashboardPayload = {
  purchases: BillSummaryRow[]
  sales: BillSummaryRow[]
  summary: {
    completedDeals: number
    grossProfit: number
    grossProfitPct: number
    matchedCOGS: number
    matchedPurchaseAmount: number
    matchedSalesAmount: number
    tradingAP: number
    tradingAR: number
    unmatchedPurchaseBills: number
    unmatchedPurchasesAmount: number
    unmatchedSalesAmount: number
    unmatchedSalesBills: number
  }
  productList: ProductRow[]
  trend: Array<{ date: string; purchase: number; sales: number }>
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function defaultFromDate() {
  const now = new Date()
  return dateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
}

function defaultToDate() {
  return dateOnly(new Date())
}

export function TradingDashboardPageClient() {
  const [data, setData] = useState<TradingDashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState(defaultFromDate)
  const [isLoading, setIsLoading] = useState(true)
  const [toDate, setToDate] = useState(defaultToDate)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('from', fromDate)
      params.set('to', toDate)
      setData(await dailyFetchJson<TradingDashboardPayload>(`/api/trading/dashboard?${params.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Trading Dashboard ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const summary = data?.summary
  const maxTrendValue = useMemo(() => Math.max(1, ...(data?.trend ?? []).map((row) => Math.max(row.purchase, row.sales))), [data?.trend])
  const maxProductGp = useMemo(() => Math.max(1, ...(data?.productList ?? []).map((row) => Math.abs(row.gp))), [data?.productList])
  const trendStep = useMemo(() => {
    const count = Math.max(1, data?.trend.length ?? 0)
    return Math.min(40, 700 / count)
  }, [data?.trend.length])
  const trendBarWidth = useMemo(() => {
    const count = Math.max(1, data?.trend.length ?? 0)
    return Math.min(15, 350 / count)
  }, [data?.trend.length])

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <label className="text-sm" htmlFor="trading-from">From</label>
        <input id="trading-from" className="rounded-md border px-2 py-1.5 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <label className="text-sm" htmlFor="trading-to">To</label>
        <input id="trading-to" className="rounded-md border px-2 py-1.5 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50" type="button" onClick={() => void loadData()}>รีเฟรช</button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-violet-600 via-fuchsia-700 to-purple-800 p-6 text-white shadow-lg lg:col-span-2">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-md-full bg-white/10" />
          <div className="relative">
            <div className="text-sm uppercase tracking-wider opacity-80">🔄 Trading Performance</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MegaStat label="📥 ซื้อ Trading" value={summary?.matchedPurchaseAmount ?? 0} />
              <MegaStat label="📤 ขาย Trading" tone="emerald" value={summary?.matchedSalesAmount ?? 0} />
              <MegaStat label="💰 Trading GP" pct={summary?.grossProfitPct ?? 0} tone={(summary?.grossProfit ?? 0) >= 0 ? 'yellow' : 'red'} value={summary?.grossProfit ?? 0} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/20 pt-4 sm:grid-cols-3">
              <MiniMega label="Matched COGS" value={summary?.matchedCOGS ?? 0} />
              <MiniMega label="⚠ Sales รอจับคู่" tone="amber" value={summary?.unmatchedSalesAmount ?? 0} />
              <MiniMega label="⚠ Purchase รอขาย" tone="amber" value={summary?.unmatchedPurchasesAmount ?? 0} />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md bg-white p-4 shadow">
          <div className="text-xs font-bold text-slate-700">💰 ฐานะการเงิน Trading</div>
          <SideFinance label="📥 Trading AR (ลูกหนี้)" tone="emerald" value={summary?.tradingAR ?? 0} />
          <SideFinance label="📤 Trading AP (เจ้าหนี้)" tone="red" value={summary?.tradingAP ?? 0} />
          <SideFinance label="✓ Deals Completed" suffix=" ดีล" tone="fuchsia" value={summary?.completedDeals ?? 0} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Kpi label="Trading Sales" tone="emerald" value={summary?.matchedSalesAmount ?? 0} />
        <Kpi label="Trading Purchase Cost" tone="red" value={summary?.matchedPurchaseAmount ?? 0} />
        <Kpi label="Matched COGS" tone="blue" value={summary?.matchedCOGS ?? 0} />
        <Kpi label="Trading GP" tone={(summary?.grossProfit ?? 0) >= 0 ? 'purple' : 'red'} value={summary?.grossProfit ?? 0} />
        <Kpi label="Trading GP%" rawValue={`${formatMoney(summary?.grossProfitPct ?? 0)}%`} tone="amber" />
        <Kpi label="Trading AR" value={summary?.tradingAR ?? 0} />
        <Kpi label="Trading AP" tone="redText" value={summary?.tradingAP ?? 0} />
        <Kpi label="⚠ Sales รอจับคู่ต้นทุน" note={`${summary?.unmatchedSalesBills ?? 0} บิล`} tone="yellow" value={summary?.unmatchedSalesAmount ?? 0} />
        <Kpi label="⚠ Purchase ยังไม่ได้ขาย" note={`${summary?.unmatchedPurchaseBills ?? 0} บิล`} tone="yellow" value={summary?.unmatchedPurchasesAmount ?? 0} />
        <Kpi label="Deals Completed" tone="emerald" value={summary?.completedDeals ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md bg-white p-5 shadow-lg lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-800">📈 Trading Trend ในช่วงที่เลือก</h3>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-rose-500" /> ซื้อ Trading</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-violet-500" /> ขาย Trading</span>
            </div>
          </div>
          <svg aria-label="Trading Trend" className="h-[220px] w-full" preserveAspectRatio="none" viewBox="0 0 800 220">
            {Array.from({ length: 5 }).map((_, index) => <line key={index} stroke="#e5e7eb" strokeWidth="1" x1="40" x2="790" y1={40 + index * 36} y2={40 + index * 36} />)}
            {(data?.trend ?? []).map((row, index) => {
              const x = 48 + index * trendStep
              const purchaseHeight = (row.purchase / maxTrendValue) * 144
              const salesHeight = (row.sales / maxTrendValue) * 144
              return (
                <g key={row.date}>
                  <rect fill="#f43f5e" height={purchaseHeight} rx="2" width={trendBarWidth} x={x} y={180 - purchaseHeight}>
                    <title>{`${row.date}: ซื้อ ${formatMoney(row.purchase)}`}</title>
                  </rect>
                  <rect fill="#8b5cf6" height={salesHeight} rx="2" width={trendBarWidth} x={x + trendBarWidth + 2} y={180 - salesHeight}>
                    <title>{`${row.date}: ขาย ${formatMoney(row.sales)}`}</title>
                  </rect>
                </g>
              )
            })}
            {!isLoading && !(data?.trend.length ?? 0) ? <text fill="#94a3b8" fontSize="14" textAnchor="middle" x="400" y="115">ไม่มีข้อมูล Trading ในช่วงที่เลือก</text> : null}
          </svg>
        </div>

        <div className="rounded-md bg-white p-5 shadow-lg">
          <h3 className="mb-3 font-bold text-slate-800">🥧 สถานะ Matching</h3>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div
              aria-label="Matching status"
              className="h-[180px] w-[180px] shrink-0 rounded-md-full"
              style={{ background: donutBackground(summary?.matchedCOGS ?? 0, summary?.unmatchedSalesAmount ?? 0) }}
            />
            <div className="w-full flex-1 space-y-2 text-sm">
              <Legend label="✓ Matched" tone="emerald" value={summary?.matchedCOGS ?? 0} />
              <Legend label="⏳ รอจับคู่" tone="amber" value={summary?.unmatchedSalesAmount ?? 0} />
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>💰 GP</span>
                <span className={(summary?.grossProfit ?? 0) >= 0 ? 'text-purple-700' : 'text-red-700'}>{formatMoney(summary?.grossProfit ?? 0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-md bg-white p-5 shadow-lg">
          <h3 className="mb-3 font-bold text-slate-800">🏆 Top สินค้า Trading (กำไร)</h3>
          {isLoading ? <Empty text="กำลังโหลดข้อมูล" /> : null}
          {!isLoading && !(data?.productList.length ?? 0) ? <Empty text="ไม่มีข้อมูล" /> : null}
          <div className="space-y-2">
            {(data?.productList ?? []).slice(0, 8).map((row) => (
              <div key={row.productId}>
                <div className="mb-0.5 flex justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{row.productName}</span>
                  <span className={`font-mono font-bold ${row.gp >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{formatMoney(row.gp)}</span>
                </div>
                <div className="h-2 w-full rounded-md-full bg-slate-100">
                  <div className={`h-2 rounded-md-full bg-gradient-to-r ${row.gp >= 0 ? 'from-violet-500 to-fuchsia-500' : 'from-red-500 to-rose-600'}`} style={{ width: `${Math.min(100, (Math.abs(row.gp) / maxProductGp) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BillTable empty="ไม่มี Trading Purchase" headerTone="emerald" matchedLabel="Match แล้ว" partyLabel="Supplier" rows={data?.purchases ?? []} title="📥 Trading Purchases" />
        <BillTable empty="ไม่มี Trading Sales" headerTone="blue" matchedLabel="COGS Matched" partyLabel="Customer" rows={data?.sales ?? []} title="📤 Trading Sales" />
      </div>

      <div className="rounded-md bg-white shadow">
        <div className="border-b bg-slate-50 p-3 font-bold">📊 Trading by Product</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">Product</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Sales</th>
                <th className="p-2 text-right">Matched COGS</th>
                <th className="p-2 text-right">GP</th>
                <th className="p-2 text-right">GP%</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="py-4 text-center text-slate-400" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && !(data?.productList.length ?? 0) ? <tr><td className="py-4 text-center text-slate-400" colSpan={6}>ไม่มีข้อมูล</td></tr> : null}
              {(data?.productList ?? []).map((row) => (
                <tr key={row.productId} className="border-t">
                  <td className="p-2">{row.productName}</td>
                  <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                  <td className="p-2 text-right text-emerald-700">{formatMoney(row.sales)}</td>
                  <td className="p-2 text-right text-red-700">{formatMoney(row.cost)}</td>
                  <td className={`p-2 text-right font-bold ${row.gp >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{formatMoney(row.gp)}</td>
                  <td className="p-2 text-right">{formatMoney(row.gpPct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function MegaStat({ label, pct, tone = 'normal', value }: { label: string; pct?: number; tone?: 'emerald' | 'normal' | 'red' | 'yellow'; value: number }) {
  const toneClass = { emerald: 'text-emerald-200', normal: '', red: 'text-red-200', yellow: 'text-yellow-200' }[tone]
  return (
    <div>
      <div className="text-xs opacity-80">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{formatMoney(value)}</div>
      {pct === undefined ? null : <div className="text-xs opacity-80">{formatMoney(pct)}%</div>}
    </div>
  )
}

function MiniMega({ label, tone = 'normal', value }: { label: string; tone?: 'amber' | 'normal'; value: number }) {
  return (
    <div>
      <div className="text-[10px] opacity-75">{label}</div>
      <div className={`text-base font-bold ${tone === 'amber' ? 'text-amber-200' : ''}`}>{formatMoney(value)}</div>
    </div>
  )
}

function SideFinance({ label, suffix = '', tone, value }: { label: string; suffix?: string; tone: 'emerald' | 'fuchsia' | 'red'; value: number }) {
  const tones = {
    emerald: 'border-emerald-500 bg-emerald-50 text-emerald-700',
    fuchsia: 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700',
    red: 'border-red-500 bg-red-50 text-red-700',
  }
  return (
    <div className={`rounded-md border-l-4 p-3 ${tones[tone]}`}>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="text-2xl font-bold">{formatMoney(value)}{suffix}</div>
    </div>
  )
}

function Kpi({ label, note, rawValue, tone = 'white', value }: { label: string; note?: string; rawValue?: string; tone?: 'amber' | 'blue' | 'emerald' | 'purple' | 'red' | 'redText' | 'white' | 'yellow'; value?: number }) {
  const tones = {
    amber: 'border-amber-500 bg-amber-50 text-amber-700',
    blue: 'border-blue-500 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-500 bg-emerald-50 text-emerald-700',
    purple: 'border-purple-500 bg-purple-50 text-purple-700',
    red: 'border-red-500 bg-red-50 text-red-700',
    redText: 'border-transparent bg-white text-red-600',
    white: 'border-transparent bg-white text-slate-900',
    yellow: 'border-yellow-500 bg-yellow-50 text-yellow-700',
  }
  return (
    <div className={`rounded-md border-l-4 p-3 shadow ${tones[tone]}`}>
      <div className="text-xs">{label}</div>
      <div className="text-lg font-bold">{rawValue ?? formatMoney(value ?? 0)}</div>
      {note ? <div className="text-xs text-slate-600">{note}</div> : null}
    </div>
  )
}

function donutBackground(matched: number, unmatched: number) {
  const total = matched + unmatched
  if (total <= 0) return 'radial-gradient(circle, white 48%, transparent 49%), conic-gradient(#e5e7eb 0 100%)'
  const matchedPct = (matched / total) * 100
  return `radial-gradient(circle, white 48%, transparent 49%), conic-gradient(#10b981 0 ${matchedPct}%, #f59e0b ${matchedPct}% 100%)`
}

function Legend({ label, tone, value }: { label: string; tone: 'amber' | 'emerald'; value: number }) {
  const color = tone === 'emerald' ? 'bg-emerald-500 text-emerald-700' : 'bg-amber-500 text-amber-700'
  return (
    <div className="flex justify-between gap-3">
      <span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-md ${color.split(' ')[0]}`} />{label}</span>
      <span className={`font-bold ${color.split(' ')[1]}`}>{formatMoney(value)}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-slate-400">{text}</div>
}

function BillTable({ empty, headerTone, matchedLabel, partyLabel, rows, title }: { empty: string; headerTone: 'blue' | 'emerald'; matchedLabel: string; partyLabel: string; rows: BillSummaryRow[]; title: string }) {
  const headerClass = headerTone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
  return (
    <div className="rounded-md bg-white shadow">
      <div className={`border-b p-3 font-bold ${headerClass}`}>{title}</div>
      <div className="max-h-72 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">บิล</th>
              <th className="p-2 text-left">{partyLabel}</th>
              <th className="p-2 text-right">มูลค่า</th>
              <th className="p-2 text-right">{matchedLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2">{row.date}</td>
                <td className="p-2 font-mono">{row.docNo}</td>
                <td className="p-2">{row.partyName}</td>
                <td className="p-2 text-right">{formatMoney(row.totalAmount)}</td>
                <td className={`p-2 text-right ${row.remainingAmount <= 0.01 ? 'text-emerald-700' : 'text-amber-600'}`}>{formatMoney(row.matchedAmount)}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={5}>{empty}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
