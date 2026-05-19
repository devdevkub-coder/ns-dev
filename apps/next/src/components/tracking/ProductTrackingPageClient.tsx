'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type ProductMovementRow = {
  amount?: number
  avgSell?: number
  buyAmount?: number
  billCount?: number
  code?: string
  id?: string
  name?: string
  productName: string
  revenue?: number
  sellBillCount?: number
  sellQty?: number
  qty: number
  salesAmount?: number
  salesQty?: number
}

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
  turnoverDays?: number
  turnoverPct?: number
  type?: string
  unit?: string
}

type ProductTrackingPayload = {
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
  slowMovers?: ProductMovementRow[]
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
  topMovers?: ProductMovementRow[]
  year: string
}

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function ProductTrackingPageClient() {
  const [data, setData] = useState<ProductTrackingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year })
    if (month) params.set('month', month)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [month, search, year])

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
  const maxMonthAmount = Math.max(1, ...(data?.monthly ?? []).map((item) => item.revenue ?? item.salesAmount ?? item.amount ?? 0))
  const topMovers = data?.top?.byRevenue ?? data?.topMovers ?? []
  const slowMovers = data?.slowMovers ?? data?.top?.slowMovers ?? []
  const exportHref = `/api/tracking/product?${queryString}&format=xlsx`

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-slate-700 to-cyan-700 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">Product Tracking 360°</h1>
        <p className="mt-1 text-sm opacity-90">วิเคราะห์สินค้าแบบ read/report จากยอดซื้อ ยอดขาย กำไร และการเคลื่อนไหวรายเดือน</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-lg bg-white p-3 shadow">
        <div className="grid gap-2 md:grid-cols-5">
          <input className="rounded-lg border px-3 py-2 text-sm" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">ทั้งปี</option>
            {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
          </select>
          <input className="rounded-lg border px-3 py-2 text-sm md:col-span-2" placeholder="ค้นหา Product" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Metric label="ยอดขาย" value={formatMoney(data?.summary.revenue ?? data?.summary.salesAmount ?? 0)} tone="cyan" />
        <Metric label="น้ำหนักขาย" value={formatMoney(data?.summary.sellQty ?? data?.summary.salesQty ?? 0)} />
        <Metric label="ยอดซื้อ" value={formatMoney(data?.summary.buyAmount ?? data?.summary.purchaseAmount ?? 0)} />
        <Metric label="น้ำหนักซื้อ" value={formatMoney(data?.summary.buyQty ?? data?.summary.purchaseQty ?? 0)} />
        <Metric label="COGS" value={formatMoney(data?.summary.cogs ?? 0)} />
        <Metric label="GP" value={formatMoney(data?.summary.gp ?? 0)} tone="cyan" />
        <Metric label="Product" value={`${data?.summary.products ?? 0}`} />
      </div>

      <div className="rounded-lg bg-white p-4 shadow">
        <div className="mb-3 text-sm font-semibold text-slate-700">ยอดขายรายเดือน {data?.year ?? year}</div>
        <div className="grid grid-cols-12 items-end gap-2">
          {(data?.monthly ?? []).map((item, index) => (
            <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t bg-cyan-500" style={{ height: `${Math.max(4, ((item.revenue ?? item.salesAmount ?? item.amount ?? 0) / maxMonthAmount) * 128)}px` }} />
              <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
            </div>
          ))}
        </div>
      </div>

      {topMovers.length > 0 || slowMovers.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <MovementList amountLabel="ยอดขาย" qtyLabel="น้ำหนักขาย" rows={topMovers} title="Top movers" />
          <MovementList amountLabel="มูลค่า Stock" qtyLabel="Stock" rows={slowMovers} title="Slow movers" />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-right">บิลขาย</th>
              <th className="p-2 text-right">น้ำหนักขาย</th>
              <th className="p-2 text-right">ยอดขาย</th>
              <th className="p-2 text-right">ราคาเฉลี่ยขาย</th>
              <th className="p-2 text-right">บิลซื้อ</th>
              <th className="p-2 text-right">น้ำหนักซื้อ</th>
              <th className="p-2 text-right">ยอดซื้อ</th>
              <th className="p-2 text-right">ราคาเฉลี่ยซื้อ</th>
              <th className="p-2 text-right">Stock</th>
              <th className="p-2 text-right">GP</th>
              <th className="p-2 text-right">GP%</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ไม่มีข้อมูล Product Tracking</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2"><div className="font-medium">{row.name ?? row.productName}</div><div className="text-xs text-slate-500">{row.code || '-'}</div></td>
                <td className="p-2 text-right">{row.sellBillCount ?? row.salesBillCount ?? 0}</td>
                <td className="p-2 text-right">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td>
                <td className="p-2 text-right font-semibold text-cyan-700">{formatMoney(row.revenue ?? row.salesAmount ?? 0)}</td>
                <td className="p-2 text-right">{formatMoney(row.avgSell ?? 0)}</td>
                <td className="p-2 text-right">{row.buyBillCount ?? row.purchaseBillCount ?? 0}</td>
                <td className="p-2 text-right">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td>
                <td className="p-2 text-right">{formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}</td>
                <td className="p-2 text-right">{formatMoney(row.avgBuy ?? 0)}</td>
                <td className="p-2 text-right">{formatMoney(row.stockQty ?? 0)}</td>
                <td className={`p-2 text-right font-semibold ${(row.gp ?? 0) >= 0 ? 'text-cyan-700' : 'text-red-700'}`}>{formatMoney(row.gp ?? 0)}</td>
                <td className="p-2 text-right">{(row.gpPct ?? 0).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MovementList({ amountLabel, qtyLabel, rows, title }: { amountLabel: string; qtyLabel: string; rows: Array<ProductMovementRow | ProductTrackingRow>; title: string }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <div className="border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2 text-left">Product</th><th className="p-2 text-right">บิล</th><th className="p-2 text-right">{qtyLabel}</th><th className="p-2 text-right">{amountLabel}</th><th className="p-2 text-right">ราคาเฉลี่ยขาย</th></tr></thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr key={row.id ?? `${row.code ?? ''}-${row.name ?? row.productName ?? ''}`} className="border-t hover:bg-slate-50">
              <td className="p-2"><div className="font-medium">{row.name ?? row.productName}</div><div className="text-xs text-slate-500">{row.code || '-'}</div></td>
              <td className="p-2 text-right">{row.sellBillCount ?? row.billCount ?? 0}</td>
              <td className="p-2 text-right">{formatMoney(row.sellQty ?? row.salesQty ?? row.qty ?? 0)}</td>
              <td className="p-2 text-right font-semibold">{formatMoney(row.revenue ?? row.salesAmount ?? row.amount ?? 0)}</td>
              <td className="p-2 text-right">{formatMoney(row.avgSell ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, tone, value }: { label: string; tone?: 'cyan'; value: string }) {
  const color = tone === 'cyan' ? 'text-cyan-700' : 'text-slate-900'
  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${color}`}>{value}</div></div>
}
