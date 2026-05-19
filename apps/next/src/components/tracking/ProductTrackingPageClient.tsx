'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type ProductTrackingRow = {
  amount?: number
  avgBuy?: number
  avgSell?: number
  billCount?: number
  buyAmount?: number
  buyBillCount?: number
  buyQty?: number
  code?: string
  cogs?: number
  gp?: number
  gpPct?: number
  id: string
  itemStatus?: string
  metalGroup?: string
  name?: string
  productName?: string
  purchaseAmount?: number
  purchaseBillCount?: number
  purchaseQty?: number
  qty?: number
  revenue?: number
  salesAmount?: number
  salesBillCount?: number
  salesQty?: number
  sellBillCount?: number
  sellQty?: number
  stockQty?: number
  stockValue?: number
  stockWac?: number
  turnoverPct?: number
  type?: string
  unit?: string
}

type ProductTrackingPayload = {
  filters?: {
    metalGroups: string[]
    products: Array<{ active: boolean | null; code: string; id: string; metalGroup: string | null; name: string }>
  }
  monthly: Array<{
    amount?: number
    buyAmount?: number
    buyQty?: number
    gp?: number
    month: string
    purchaseAmount?: number
    purchaseQty?: number
    qty?: number
    revenue?: number
    salesAmount?: number
    salesQty?: number
    sellQty?: number
  }>
  rows: ProductTrackingRow[]
  slowMovers?: ProductTrackingRow[]
  summary: {
    buyAmount?: number
    buyQty?: number
    cogs?: number
    gp?: number
    products?: number
    purchaseAmount?: number
    purchaseQty?: number
    revenue?: number
    salesAmount?: number
    salesQty?: number
    sellQty?: number
    stockQty?: number
    stockValue?: number
  }
  top?: {
    byBuy?: ProductTrackingRow[]
    byGp?: ProductTrackingRow[]
    byRevenue?: ProductTrackingRow[]
    slowMovers?: ProductTrackingRow[]
  }
  topMovers?: ProductTrackingRow[]
  year: string
}

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function ProductTrackingPageClient() {
  const [data, setData] = useState<ProductTrackingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [metalGroup, setMetalGroup] = useState('')
  const [month, setMonth] = useState('')
  const [productId, setProductId] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year })
    if (month) params.set('month', month)
    if (metalGroup) params.set('metalGroup', metalGroup)
    if (productId) params.set('productId', productId)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [metalGroup, month, productId, search, year])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<ProductTrackingPayload>(`/api/tracking/product?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Product Tracking ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = data?.rows ?? []
  const maxMonthRevenue = Math.max(1, ...(data?.monthly ?? []).map((item) => item.revenue ?? item.salesAmount ?? item.amount ?? 0))
  const topRevenue = data?.top?.byRevenue ?? data?.topMovers ?? []
  const topBuy = data?.top?.byBuy ?? [...rows].sort((left, right) => (right.buyAmount ?? 0) - (left.buyAmount ?? 0)).slice(0, 10)
  const topGp = data?.top?.byGp ?? [...rows].sort((left, right) => (right.gp ?? 0) - (left.gp ?? 0)).slice(0, 10)
  const slowMovers = data?.top?.slowMovers ?? data?.slowMovers ?? []
  const filteredProducts = (data?.filters?.products ?? []).filter((product) => !metalGroup || product.metalGroup === metalGroup)
  const exportHref = `/api/tracking/product?${queryString}&format=xlsx`

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 p-4 text-white shadow-xl">
        <h1 className="text-xl font-bold">📦 Product Tracking 360°</h1>
        <p className="mt-1 text-sm opacity-90">วิเคราะห์สินค้าจากยอดซื้อ ยอดขาย กำไร Stock และ WAC</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-xl bg-white p-3 shadow">
        <div className="grid gap-2 md:grid-cols-7">
          <input className="rounded border px-3 py-2 text-sm" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <select className="rounded border px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">ทั้งปี</option>
            {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={metalGroup} onChange={(event) => { setMetalGroup(event.target.value); setProductId('') }}>
            <option value="">ทุกหมวด</option>
            {(data?.filters?.metalGroups ?? []).map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm md:col-span-2" value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">สินค้าทั้งหมด</option>
            {filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.code ? `${product.code} - ${product.name}` : product.name}</option>)}
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="ค้นหา Product" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="rounded bg-orange-600 px-4 py-2 text-center text-sm font-bold text-white" href={exportHref}>📥 XLSX</a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard label="💰 ยอดขาย" value={formatMoney(data?.summary.revenue ?? data?.summary.salesAmount ?? 0)} />
        <SummaryCard label="🧾 ยอดซื้อ" value={formatMoney(data?.summary.buyAmount ?? data?.summary.purchaseAmount ?? 0)} />
        <SummaryCard label="📦 Stock Value" value={formatMoney(data?.summary.stockValue ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-semibold text-slate-700">ยอดขายรายเดือน {data?.year ?? year}</div>
          <div className="grid grid-cols-12 items-end gap-2">
            {(data?.monthly ?? []).map((item, index) => {
              const revenue = item.revenue ?? item.salesAmount ?? item.amount ?? 0
              return (
                <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t bg-orange-500" style={{ height: `${Math.max(4, (revenue / maxMonthRevenue) * 128)}px` }} />
                  <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Product</div>
          <BarList rows={topRevenue.slice(0, 5).map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.revenue ?? row.salesAmount ?? row.amount ?? 0 }))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl bg-white p-2 shadow">
        <Tab active={view === 'list'} label="รายการ" onClick={() => setView('list')} />
        <Tab active={view === 'top10'} label="Top 10 ในหมวด" onClick={() => setView('top10')} />
        <Tab active={view === 'yearCompare'} label="รายปี" onClick={() => setView('yearCompare')} />
      </div>

      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel rows={topRevenue.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.revenue ?? row.salesAmount ?? row.amount ?? 0 }))} title="Top 10 ยอดขาย" />
          <TopPanel rows={topBuy.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.buyAmount ?? row.purchaseAmount ?? 0 }))} title="Top 10 ยอดซื้อ" />
          <TopPanel rows={topGp.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.gp ?? 0 }))} title="Top 10 GP" />
          <TopPanel rows={slowMovers.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.stockValue ?? row.amount ?? 0 }))} title="Slow movers / Stock" />
        </div>
      ) : null}

      {view === 'yearCompare' ? <YearCompare monthly={data?.monthly ?? []} /> : null}

      {view === 'list' ? (
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <table className="w-full min-w-[1380px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">สินค้า</th>
                <th className="p-2 text-left">หมวด</th>
                <th className="p-2 text-left">สถานะ</th>
                <th className="p-2 text-right">บิลขาย</th>
                <th className="p-2 text-right">ขาย กก.</th>
                <th className="p-2 text-right">ยอดขาย</th>
                <th className="p-2 text-right">COGS</th>
                <th className="p-2 text-right">GP</th>
                <th className="p-2 text-right">GP%</th>
                <th className="p-2 text-right">ซื้อ กก.</th>
                <th className="p-2 text-right">ยอดซื้อ</th>
                <th className="p-2 text-right">Stock</th>
                <th className="p-2 text-right">WAC</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={14}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={14}>ไม่มีข้อมูล Product Tracking</td></tr> : null}
              {!isLoading && rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-orange-50/40">
                  <td className="p-2 font-mono text-xs text-slate-500">{row.code || '-'}</td>
                  <td className="p-2 font-medium">{row.name ?? row.productName}</td>
                  <td className="p-2">{row.metalGroup || '-'}</td>
                  <td className="p-2">{row.itemStatus || '-'}</td>
                  <td className="p-2 text-right">{row.sellBillCount ?? row.salesBillCount ?? 0}</td>
                  <td className="p-2 text-right">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td>
                  <td className="p-2 text-right font-semibold text-orange-700">{formatMoney(row.revenue ?? row.salesAmount ?? 0)}</td>
                  <td className="p-2 text-right text-red-700">{formatMoney(row.cogs ?? 0)}</td>
                  <td className={`p-2 text-right font-semibold ${(row.gp ?? 0) >= 0 ? 'text-orange-700' : 'text-red-700'}`}>{formatMoney(row.gp ?? 0)}</td>
                  <td className="p-2 text-right">{(row.gpPct ?? 0).toFixed(2)}%</td>
                  <td className="p-2 text-right">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td>
                  <td className="p-2 text-right">{formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}</td>
                  <td className="p-2 text-right">{formatMoney(row.stockQty ?? 0)}</td>
                  <td className="p-2 text-right">{formatMoney(row.stockWac ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-xl"><div className="text-xs opacity-80">{label}</div><div className="mt-1 font-mono text-3xl font-bold">{value}</div></div>
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={active ? 'rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white' : 'rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600'} type="button" onClick={onClick}>{label}</button>
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <div className="space-y-2">{rows.length === 0 ? <div className="py-8 text-center text-slate-400">ไม่มีข้อมูล</div> : rows.map((row, index) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{index + 1}. {row.label}</span><b>{formatMoney(row.value)}</b></div><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-orange-500" style={{ width: `${Math.min(100, row.value / max * 100)}%` }} /></div></div>)}</div>
}

function TopPanel({ rows, title }: { rows: { label: string; value: number }[]; title: string }) {
  return <div className="overflow-hidden rounded-2xl bg-white shadow"><div className="border-b bg-orange-50 p-3 font-bold text-orange-700">{title}</div><table className="w-full text-sm"><tbody>{rows.map((row, index) => <tr key={`${title}-${row.label}-${index}`} className="border-t"><td className="p-2 font-bold">{index + 1}</td><td className="p-2">{row.label}</td><td className="p-2 text-right font-semibold">{formatMoney(row.value)}</td></tr>)}</tbody></table></div>
}

function YearCompare({ monthly }: { monthly: ProductTrackingPayload['monthly'] }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2 text-left">เดือน</th><th className="p-2 text-right">ขาย กก.</th><th className="p-2 text-right">ยอดขาย</th><th className="p-2 text-right">ซื้อ กก.</th><th className="p-2 text-right">ยอดซื้อ</th><th className="p-2 text-right">GP</th></tr></thead>
        <tbody>{monthly.map((row, index) => <tr key={row.month} className="border-t"><td className="p-2">{monthLabels[index]}</td><td className="p-2 text-right">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td><td className="p-2 text-right font-semibold text-orange-700">{formatMoney(row.revenue ?? row.salesAmount ?? 0)}</td><td className="p-2 text-right">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td><td className="p-2 text-right">{formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}</td><td className="p-2 text-right">{formatMoney(row.gp ?? 0)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
