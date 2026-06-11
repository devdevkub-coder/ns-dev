'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type TradingPayload = {
  deals: Array<{ customerName: string; date: string; dealNo: string; grossProfit: number; grossProfitPct: number; id: string; matchedPurchaseAmount: number; matchedQty: number; matchedSalesAmount: number; productName: string; purchaseBillNo: string; salesBillNo: string; status: string; supplierName: string }>
  filters: { statuses: string[] }
  purchases: Array<{ date: string; docNo: string; id: string; matchedAmount: number; remainingAmount: number; supplierName: string; totalAmount: number }>
  sales: Array<{ customerName: string; date: string; docNo: string; id: string; matchedAmount: number; remainingAmount: number; totalAmount: number }>
  summary: { activeDeals: number; grossProfit: number; purchaseRemaining: number; purchaseTotal: number; salesRemaining: number; salesTotal: number }
}

type TradingDealRow = TradingPayload['deals'][number]
type TradingBillRow = TradingPayload['purchases'][number] | TradingPayload['sales'][number]

export function TradingMatchingPageClient() {
  const [data, setData] = useState<TradingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDeal, setSelectedDeal] = useState<TradingDealRow | null>(null)
  const [status, setStatus] = useState('all')
  const [showCancelled, setShowCancelled] = useState(false)
  const [tab, setTab] = useState<'match' | 'unmatched'>('match')
  const [toDate, setToDate] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<TradingPayload>('/api/trading/matching'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Trading Matching ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const deals = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.deals ?? []).filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.dealNo} ${row.purchaseBillNo} ${row.salesBillNo} ${row.supplierName} ${row.customerName} ${row.productName} ${row.status}`.toLowerCase().includes(query)
    })
  }, [data?.deals, fromDate, search, status, toDate])

  const visibleDeals = showCancelled ? deals : deals.filter((row) => !row.status.toLowerCase().includes('cancel'))
  const completedDeals = (data?.deals ?? []).filter((row) => row.status.toLowerCase().includes('complete') || row.status.toLowerCase().includes('full'))
  const partialDeals = (data?.deals ?? []).filter((row) => row.status.toLowerCase().includes('partial'))
  const cancelledDeals = (data?.deals ?? []).filter((row) => row.status.toLowerCase().includes('cancel'))
  const totalDeals = (data?.deals ?? []).length
  const totalSales = (data?.deals ?? []).reduce((sum, row) => sum + row.matchedSalesAmount, 0)
  const totalCost = (data?.deals ?? []).reduce((sum, row) => sum + row.matchedPurchaseAmount, 0)
  const totalGP = (data?.deals ?? []).reduce((sum, row) => sum + row.grossProfit, 0)
  const gpPct = totalSales > 0 ? totalGP / totalSales * 100 : 0
  const purchaseTotal = data?.summary.purchaseTotal ?? 0
  const salesTotal = data?.summary.salesTotal ?? 0
  const purchaseRemaining = data?.summary.purchaseRemaining ?? 0
  const salesRemaining = data?.summary.salesRemaining ?? 0
  const matchRatePurchase = purchaseTotal > 0 ? (purchaseTotal - purchaseRemaining) / purchaseTotal * 100 : 0
  const matchRateSales = salesTotal > 0 ? (salesTotal - salesRemaining) / salesTotal * 100 : 0
  const topPairs = Array.from((data?.deals ?? []).reduce((map, row) => {
    const pair = `${row.supplierName || '-'} → ${row.customerName || '-'}`
    const current = map.get(pair) ?? { deals: 0, gp: 0, pair, sales: 0 }
    current.deals += 1
    current.gp += row.grossProfit
    current.sales += row.matchedSalesAmount
    map.set(pair, current)
    return map
  }, new Map<string, { deals: number; gp: number; pair: string; sales: number }>()).values()).sort((left, right) => right.gp - left.gp).slice(0, 5)
  const monthlyGP = buildMonthlyGP(data?.deals ?? [])
  const unmatchedPurchases = (data?.purchases ?? []).filter((row) => row.remainingAmount > 0.01)
  const unmatchedSales = (data?.sales ?? []).filter((row) => row.remainingAmount > 0.01)

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return `/api/trading/matching?${params.toString()}`
  }, [fromDate, search, status, toDate])

  const resetFilters = () => {
    setFromDate('')
    setSearch('')
    setStatus('all')
    setToDate('')
  }

  const hasFilters = search.trim() || status !== 'all' || fromDate || toDate

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap gap-2 rounded-md bg-white p-3 shadow">
        <button className="rounded-md bg-purple-100 px-3 py-2 text-sm font-bold text-purple-700 opacity-60" type="button" disabled>🧹 ตรวจ Dup</button>
        <button className="rounded-md bg-blue-100 px-3 py-2 text-sm font-bold text-blue-800 opacity-60" type="button" disabled>📥 Pull จาก Cloud</button>
        <button className="rounded-md bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800 opacity-60" type="button" disabled>🔄 Recalc Cost</button>
        <button className="rounded-md border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 font-bold text-fuchsia-700 opacity-70" type="button" disabled>+ จับคู่ใหม่</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-fuchsia-600 via-purple-700 to-violet-800 p-6 text-white shadow-lg lg:col-span-2">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-md-full bg-white/10" />
          <div className="relative">
            <div className="text-sm uppercase tracking-wider opacity-80">💰 Trading Gross Profit รวม</div>
            <div className={`mt-2 text-5xl font-bold ${totalGP >= 0 ? '' : 'text-red-200'}`}>{formatMoney(totalGP)}</div>
            <div className="mt-1 text-sm opacity-90">บาท · GP {gpPct.toFixed(2)}% · {totalDeals} ดีล</div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/20 pt-4">
              <div><div className="text-[10px] opacity-75">ยอดขาย Trading</div><div className="text-xl font-bold">{formatMoney(totalSales)}</div></div>
              <div><div className="text-[10px] opacity-75">ต้นทุน Trading</div><div className="text-xl font-bold">{formatMoney(totalCost)}</div></div>
              <div><div className="text-[10px] opacity-75">รอจับคู่</div><div className="text-xl font-bold text-amber-200">{formatMoney(purchaseRemaining + salesRemaining)}</div></div>
            </div>
          </div>
        </div>
        <StatusDonut cancelled={cancelledDeals.length} completed={completedDeals.length} partial={partialDeals.length} total={totalDeals} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🎯 Match Rate</div>
          <Gauge color="blue" label="บิลซื้อ Trading" remaining={purchaseRemaining} total={purchaseTotal} value={matchRatePurchase} />
          <Gauge color="emerald" label="บิลขาย Trading" remaining={salesRemaining} total={salesTotal} value={matchRateSales} />
          <div className="rounded-md bg-fuchsia-50 p-2 text-center">
            <div className="text-[10px] text-fuchsia-600">GP Margin %</div>
            <div className="text-2xl font-bold text-fuchsia-700">{gpPct.toFixed(2)}%</div>
          </div>
        </div>
        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">📈 GP รายเดือน (6 เดือนล่าสุด)</div>
          <div className="flex h-32 items-end gap-3 border-b px-2">
            {monthlyGP.map((month) => (
              <div key={month.key} className="flex flex-1 flex-col items-center gap-1">
                <div className={`w-full rounded-md-t ${month.gp >= 0 ? 'bg-purple-500' : 'bg-red-500'}`} style={{ height: `${Math.max(6, Math.abs(month.gp) / Math.max(...monthlyGP.map((item) => Math.abs(item.gp)), 1) * 110)}px` }} />
                <span className="text-[10px] text-slate-500">{month.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 คู่ค้า GP สูงสุด</div>
          <div className="space-y-2">
            {topPairs.map((pair) => <div key={pair.pair} className="rounded-md-r border-l-4 border-fuchsia-500 bg-fuchsia-50 py-1 pl-2"><div className="truncate text-[11px] font-semibold text-slate-700">{pair.pair}</div><div className="flex justify-between text-[10px]"><span className="text-slate-500">{pair.deals} ดีล · ขาย {formatMoney(pair.sales)}</span><span className="font-bold text-fuchsia-700">GP {formatMoney(pair.gp)}</span></div></div>)}
            {topPairs.length === 0 ? <div className="py-4 text-center text-xs text-slate-400">ยังไม่มีดีล</div> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Deals ทั้งหมด" value={`${totalDeals}`} />
        <Metric tone="emerald" label="Completed" value={`${completedDeals.length}`} />
        <Metric tone="amber" label="Partially Matched" value={`${partialDeals.length}`} />
        <Metric tone={totalGP >= 0 ? 'purple' : 'red'} label="Total Trading GP" value={formatMoney(totalGP)} />
      </div>

      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="สถานะ" className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <DatePickerInput ariaLabel="วันที่เริ่มต้น" className="w-[130px]" value={fromDate} onChange={setFromDate} />
          <DatePickerInput ariaLabel="วันที่สิ้นสุด" className="w-[130px]" value={toDate} onChange={setToDate} />
          <input className="min-w-64 flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหา deal / PB / SB / คู่ค้า / สินค้า" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          {hasFilters ? <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={resetFilters}>ล้าง</button> : null}
          <a className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow">
        <div className="flex flex-wrap items-center border-b">
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'match' ? 'border-fuchsia-600 text-fuchsia-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('match')}>🤝 Deals ({visibleDeals.length})</button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'unmatched' ? 'border-fuchsia-600 text-fuchsia-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('unmatched')}>⚠ Unmatched</button>
          {cancelledDeals.length > 0 ? <label className="ml-auto mr-4 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"><input checked={showCancelled} type="checkbox" onChange={(event) => setShowCancelled(event.target.checked)} /><span>👁 แสดง Cancelled ({cancelledDeals.length})</span></label> : null}
        </div>
        {tab === 'match' ? (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[1220px] text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2 text-left">Deal No</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">Purchase</th><th className="p-2 text-left">Supplier</th><th className="p-2 text-left">Sales</th><th className="p-2 text-left">Customer</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Cost</th><th className="p-2 text-right">Sales Amt</th><th className="p-2 text-right">GP</th><th className="p-2 text-right">GP%</th><th className="p-2 text-center">Status</th><th></th></tr></thead>
              <tbody>
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && !error && visibleDeals.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={13}>ยังไม่มีดีล Trading — กด + จับคู่ใหม่</td></tr> : null}
                {!isLoading && visibleDeals.map((row) => <tr key={row.id} className={`border-t hover:bg-slate-50 ${row.status.toLowerCase().includes('cancel') ? 'bg-slate-50 text-slate-400 line-through' : ''}`}><td className="p-2 font-mono text-xs">{row.dealNo}</td><td className="p-2 text-xs">{formatDateDisplay(row.date)}</td><td className="p-2 font-mono text-xs">{row.purchaseBillNo || '-'}</td><td className="p-2 text-xs">{row.supplierName}</td><td className="p-2 font-mono text-xs">{row.salesBillNo || '-'}</td><td className="p-2 text-xs">{row.customerName}</td><td className="p-2 text-right">{formatMoney(row.matchedQty)}</td><td className={`p-2 text-right ${row.status.toLowerCase().includes('cancel') ? '' : 'text-red-600'}`}>{formatMoney(row.matchedPurchaseAmount)}</td><td className={`p-2 text-right ${row.status.toLowerCase().includes('cancel') ? '' : 'text-emerald-700'}`}>{formatMoney(row.matchedSalesAmount)}</td><td className={`p-2 text-right font-bold ${row.status.toLowerCase().includes('cancel') ? '' : row.grossProfit >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{formatMoney(row.grossProfit)}</td><td className="p-2 text-right">{row.grossProfitPct.toFixed(2)}%</td><td className="p-2 text-center"><span className={`rounded-md px-2 py-0.5 text-xs ${statusBadge(row.status)}`}>{row.status}</span></td><td className="whitespace-nowrap p-2"><button className="mr-2 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => setSelectedDeal(row)}>จัดการ</button><button className="mr-2 rounded-md border border-slate-300 px-2 py-1 text-xs text-blue-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled>🔄 Recalc</button><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled>Reverse</button></td></tr>)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 p-5 lg:grid-cols-2">
            <TradingBillTable rows={unmatchedPurchases} title="📥 Trading Purchases — รอจับคู่ขาย" type="purchases" />
            <TradingBillTable rows={unmatchedSales} title="📤 Trading Sales — รอจับคู่ต้นทุน" type="sales" />
          </div>
        )}
      </div>
      {selectedDeal ? <DealDetailModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} /> : null}
    </section>
  )
}

function TradingBillTable({ rows, title, type }: { rows: TradingBillRow[]; title: string; type: 'purchases' | 'sales' }) {
  return <div><div className={`mb-2 font-bold ${type === 'purchases' ? 'text-emerald-700' : 'text-blue-700'}`}>{title}</div><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">บิล</th><th className="p-2 text-left">{type === 'purchases' ? 'Supplier' : 'Customer'}</th><th className="p-2 text-right">มูลค่า</th><th className="p-2 text-right">{type === 'purchases' ? 'เหลือจับ' : 'รอ match cost'}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={`border-t ${type === 'sales' ? 'bg-amber-50/30' : ''}`}><td className="p-2 font-mono">{row.docNo}</td><td className="p-2">{type === 'purchases' ? 'supplierName' in row ? row.supplierName : '' : 'customerName' in row ? row.customerName : ''}</td><td className="p-2 text-right">{formatMoney(row.totalAmount)}</td><td className="p-2 text-right font-bold text-amber-700">{formatMoney(row.remainingAmount)}</td></tr>)}{rows.length === 0 ? <tr><td className="py-4 text-center text-slate-400" colSpan={4}>ทั้งหมด matched ✓</td></tr> : null}</tbody></table></div>
}

function Metric({ label, tone, value }: { label: string; tone?: 'amber' | 'emerald' | 'purple' | 'red'; value: string }) {
  const toneClass = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'purple' ? 'bg-purple-50 text-purple-700' : tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-white text-slate-900'
  return <div className={`rounded-md p-3 shadow ${toneClass}`}><div className="text-xs opacity-80">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>
}

function Gauge({ color, label, remaining, total, value }: { color: 'blue' | 'emerald'; label: string; remaining: number; total: number; value: number }) {
  const bar = color === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'
  const text = color === 'blue' ? 'text-blue-700' : 'text-emerald-700'
  return <div className="mb-3"><div className="mb-1 flex justify-between text-xs"><span className={`font-semibold ${text}`}>{label}</span><span className="font-bold">{value.toFixed(1)}%</span></div><div className="h-3 rounded-md-full bg-slate-100"><div className={`h-3 rounded-md-full ${bar}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div><div className="mt-0.5 text-[10px] text-slate-500">เหลือ {formatMoney(remaining)} จาก {formatMoney(total)}</div></div>
}

function StatusDonut({ cancelled, completed, partial, total }: { cancelled: number; completed: number; partial: number; total: number }) {
  const circumference = 439.8
  const completeLength = total > 0 ? completed / total * circumference : 0
  const partialLength = total > 0 ? partial / total * circumference : 0
  const cancelledLength = total > 0 ? cancelled / total * circumference : 0
  return <div className="rounded-md bg-white p-4 shadow"><div className="mb-2 text-xs font-bold text-slate-700">🥧 สถานะดีล</div><svg viewBox="0 0 200 200" className="h-44 w-full"><g transform="rotate(-90 100 100)"><circle cx="100" cy="100" fill="none" r="70" stroke="#10b981" strokeDasharray={`${completeLength} ${circumference}`} strokeWidth="30" /><circle cx="100" cy="100" fill="none" r="70" stroke="#f59e0b" strokeDasharray={`${partialLength} ${circumference}`} strokeDashoffset={-completeLength} strokeWidth="30" /><circle cx="100" cy="100" fill="none" r="70" stroke="#94a3b8" strokeDasharray={`${cancelledLength} ${circumference}`} strokeDashoffset={-(completeLength + partialLength)} strokeWidth="30" /></g><text fill="#64748b" fontSize="10" textAnchor="middle" x="100" y="98">ดีลทั้งหมด</text><text fill="#1e293b" fontSize="14" fontWeight="bold" textAnchor="middle" x="100" y="115">{total}</text></svg><div className="mt-1 grid grid-cols-3 gap-1 text-[10px]"><div><span className="inline-block h-2 w-2 rounded-md-sm bg-emerald-500" /> Completed: {completed}</div><div><span className="inline-block h-2 w-2 rounded-md-sm bg-amber-500" /> Partial: {partial}</div><div><span className="inline-block h-2 w-2 rounded-md-sm bg-slate-400" /> Cancelled: {cancelled}</div></div></div>
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes('cancel')) return 'bg-slate-100 text-slate-500'
  if (normalized.includes('partial')) return 'bg-amber-100 text-amber-700'
  if (normalized.includes('complete') || normalized.includes('full')) return 'bg-emerald-100 text-emerald-700'
  return 'bg-blue-100 text-blue-700'
}

function buildMonthlyGP(rows: TradingDealRow[]) {
  const formatter = new Intl.DateTimeFormat('th-TH', { month: 'short' })
  const map = new Map<string, { gp: number; key: string; label: string }>()
  rows.forEach((row) => {
    const key = row.date.slice(0, 7)
    if (!key) return
    const date = new Date(`${key}-01T00:00:00`)
    const current = map.get(key) ?? { gp: 0, key, label: formatter.format(date) }
    current.gp += row.grossProfit
    map.set(key, current)
  })
  const ordered = Array.from(map.values()).sort((left, right) => left.key.localeCompare(right.key)).slice(-6)
  return ordered.length > 0 ? ordered : Array.from({ length: 6 }, (_, index) => ({ gp: 0, key: `empty-${index}`, label: '-' }))
}

function DealDetailModal({ deal, onClose }: { deal: TradingDealRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="deal-detail-title">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-md-t-md bg-white shadow-xl md:max-w-2xl md:rounded-md">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 id="deal-detail-title" className="font-semibold">รายละเอียด {deal.dealNo}</h2>
            <p className="text-sm text-slate-500">{deal.productName}</p>
          </div>
          <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <Detail label="วันที่" value={deal.date || '-'} />
          <Detail label="สถานะ" value={deal.status || '-'} />
          <Detail label="Qty" value={formatMoney(deal.matchedQty)} />
          <Detail label="PB / Supplier" value={`${deal.purchaseBillNo || '-'} · ${deal.supplierName}`} />
          <Detail label="SB / Customer" value={`${deal.salesBillNo || '-'} · ${deal.customerName}`} />
          <Detail label="GP %" value={`${formatMoney(deal.grossProfitPct)}%`} />
          <Detail label="Cost" value={formatMoney(deal.matchedPurchaseAmount)} />
          <Detail label="Sales" value={formatMoney(deal.matchedSalesAmount)} />
          <Detail label="GP" value={formatMoney(deal.grossProfit)} />
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium">{value}</div></div>
}
