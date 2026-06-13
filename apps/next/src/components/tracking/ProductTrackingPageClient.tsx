'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

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
  type?: string
  unit?: string
}

type ProductTrackingPayload = {
  detail?: ProductTrackingDetail | null
  filters?: {
    customers: Array<{ active: boolean | null; code: string; id: string; name: string }>
    metalGroups: string[]
    products: Array<{ active: boolean | null; code: string; id: string; metalGroup: string | null; name: string }>
    suppliers: Array<{ active: boolean | null; code: string; id: string; name: string }>
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
  }
  top?: {
    byBuy?: ProductTrackingRow[]
    byGp?: ProductTrackingRow[]
    byRevenue?: ProductTrackingRow[]
  }
  topMovers?: ProductTrackingRow[]
  year: string
}

type ProductTrackingDetail = {
  product: { code: string; id: string; metalGroup: string | null; name: string; unit: string }
  purchaseLines: Array<{ amount: number; avgBuy: number; date: string; docNo: string; href: string; party: string; qty: number; status: string }>
  salesLines: Array<{ avgSell: number; cogs: number; date: string; docNo: string; gp: number; href: string; party: string; qty: number; revenue: number; status: string }>
}

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function ProductTrackingPageClient() {
  const [data, setData] = useState<ProductTrackingPayload | null>(null)
  const [detail, setDetail] = useState<ProductTrackingDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [metalGroup, setMetalGroup] = useState('')
  const [month, setMonth] = useState('')
  const [productId, setProductId] = useState('')
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year })
    if (month) params.set('month', month)
    if (metalGroup) params.set('metalGroup', metalGroup)
    if (productId) params.set('productId', productId)
    if (supplierId) params.set('supplierId', supplierId)
    if (customerId) params.set('customerId', customerId)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [customerId, metalGroup, month, productId, search, supplierId, year])

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

  const openDetail = useCallback(async (row: ProductTrackingRow) => {
    const code = row.code || row.id
    setIsDetailLoading(true)
    setDetail({ product: { code, id: code, metalGroup: row.metalGroup ?? null, name: row.name ?? row.productName ?? '-', unit: row.unit ?? 'kg' }, purchaseLines: [], salesLines: [] })
    try {
      const params = new URLSearchParams(queryString)
      params.set('detailId', code)
      const payload = await dailyFetchJson<ProductTrackingPayload>(`/api/tracking/product?${params.toString()}`)
      setDetail(payload.detail ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียด Product ไม่ได้')
      setDetail(null)
    } finally {
      setIsDetailLoading(false)
    }
  }, [queryString])

  const rows = data?.rows ?? []
  const maxMonthRevenue = Math.max(1, ...(data?.monthly ?? []).map((item) => item.revenue ?? item.salesAmount ?? item.amount ?? 0))
  const topRevenue = data?.top?.byRevenue ?? data?.topMovers ?? []
  const topBuy = data?.top?.byBuy ?? [...rows].sort((left, right) => (right.buyAmount ?? 0) - (left.buyAmount ?? 0)).slice(0, 10)
  const topGp = data?.top?.byGp ?? [...rows].sort((left, right) => (right.gp ?? 0) - (left.gp ?? 0)).slice(0, 10)
  const topGpPct = [...rows].filter((row) => (row.revenue ?? row.salesAmount ?? 0) > 0).sort((left, right) => (right.gpPct ?? 0) - (left.gpPct ?? 0)).slice(0, 10)
  const filteredProducts = (data?.filters?.products ?? []).filter((product) => !metalGroup || product.metalGroup === metalGroup)
  const exportHref = `/api/tracking/product?${queryString}&format=xlsx`

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-md bg-white p-3 shadow">
        <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <input className="rounded-md border px-3 py-2 text-sm" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <select className="rounded-md border px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">ทั้งปี</option>
            {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={metalGroup} onChange={(event) => { setMetalGroup(event.target.value); setProductId('') }}>
            <option value="">ทุกหมวด</option>
            {(data?.filters?.metalGroups ?? []).map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm md:col-span-2" value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">สินค้าทั้งหมด</option>
            {filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.code ? `${product.code} - ${product.name}` : product.name}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">ทุก Supplier</option>
            {(data?.filters?.suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">ทุก Customer</option>
            {(data?.filters?.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.code ? `${customer.code} - ${customer.name}` : customer.name}</option>)}
          </select>
          <input className="rounded-md border px-3 py-2 text-sm" placeholder="ค้นหา Product" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="rounded-md bg-orange-600 px-4 py-2 text-center text-sm font-bold text-white" href={exportHref}>📥 XLSX</a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="รายการ" value={formatMoney(data?.summary.products ?? 0)} />
        <SummaryCard label="ซื้อ (กก.)" value={formatMoney(data?.summary.buyQty ?? data?.summary.purchaseQty ?? 0)} />
        <SummaryCard label="ขาย (กก.)" value={formatMoney(data?.summary.sellQty ?? data?.summary.salesQty ?? 0)} />
        <SummaryCard label="ยอดซื้อ" value={formatMoney(data?.summary.buyAmount ?? data?.summary.purchaseAmount ?? 0)} />
        <SummaryCard label="ยอดขาย" value={formatMoney(data?.summary.revenue ?? data?.summary.salesAmount ?? 0)} />
        <SummaryCard label="GP" value={formatMoney(data?.summary.gp ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-semibold text-slate-700">ยอดขายรายเดือน {data?.year ?? year}</div>
          <div className="grid grid-cols-12 items-end gap-2">
            {(data?.monthly ?? []).map((item, index) => {
              const revenue = item.revenue ?? item.salesAmount ?? item.amount ?? 0
              return (
                <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-md-t bg-orange-500" style={{ height: `${Math.max(4, (revenue / maxMonthRevenue) * 128)}px` }} />
                  <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Product</div>
          <BarList rows={topRevenue.slice(0, 5).map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.revenue ?? row.salesAmount ?? row.amount ?? 0 }))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-md bg-white p-2 shadow">
        <Tab active={view === 'list'} label="รายการ" onClick={() => setView('list')} />
        <Tab active={view === 'top10'} label="Top 10 ในหมวด" onClick={() => setView('top10')} />
        <Tab active={view === 'yearCompare'} label="รายปี" onClick={() => setView('yearCompare')} />
      </div>

      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel rows={topRevenue.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.revenue ?? row.salesAmount ?? row.amount ?? 0 }))} title="Top 10 ยอดขาย" />
          <TopPanel rows={topBuy.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.buyAmount ?? row.purchaseAmount ?? 0 }))} title="Top 10 ยอดซื้อ" />
          <TopPanel rows={topGp.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.gp ?? 0 }))} title="Top 10 GP" />
          <TopPanel rows={topGpPct.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.gpPct ?? 0 }))} suffix="%" title="Top 10 GP%" />
        </div>
      ) : null}

      {view === 'yearCompare' ? <YearCompare monthly={data?.monthly ?? []} /> : null}

      {view === 'list' ? (
        <div className="overflow-x-auto rounded-md bg-white shadow">
          <table className="w-full min-w-[1240px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">สินค้า</th>
                <th className="p-2 text-left">หมวด</th>
                <th className="p-2 text-right">ซื้อ กก.</th>
                <th className="p-2 text-right">มูลค่าซื้อ</th>
                <th className="p-2 text-right">ซื้อเฉลี่ย</th>
                <th className="p-2 text-right">ขาย กก.</th>
                <th className="p-2 text-right">ยอดขาย</th>
                <th className="p-2 text-right">ขายเฉลี่ย</th>
                <th className="p-2 text-right">COGS</th>
                <th className="p-2 text-right">GP</th>
                <th className="p-2 text-right">GP%</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ไม่มีข้อมูล Product Tracking</td></tr> : null}
              {!isLoading && rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t hover:bg-orange-50/40" onClick={() => void openDetail(row)}>
                  <td className="p-2 font-mono text-xs text-slate-500">{row.code || '-'}</td>
                  <td className="p-2 font-medium">{row.name ?? row.productName}</td>
                  <td className="p-2">{row.metalGroup || '-'}</td>
                  <td className="p-2 text-right">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td>
                  <td className="p-2 text-right">{formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}</td>
                  <td className="p-2 text-right">{formatMoney(row.avgBuy ?? 0)}</td>
                  <td className="p-2 text-right">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td>
                  <td className="p-2 text-right font-semibold text-orange-700">{formatMoney(row.revenue ?? row.salesAmount ?? 0)}</td>
                  <td className="p-2 text-right">{formatMoney(row.avgSell ?? 0)}</td>
                  <td className="p-2 text-right text-red-700">{formatMoney(row.cogs ?? 0)}</td>
                  <td className={`p-2 text-right font-semibold ${(row.gp ?? 0) >= 0 ? 'text-orange-700' : 'text-red-700'}`}>{formatMoney(row.gp ?? 0)}</td>
                  <td className="p-2 text-right">{(row.gpPct ?? 0).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ProductDetailDialog detail={detail} isLoading={isDetailLoading} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </section>
  )
}

function ProductDetailDialog({ detail, isLoading, onOpenChange }: { detail: ProductTrackingDetail | null; isLoading: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden !p-0" fallbackTitle="Product Tracking Detail">
        <DialogHeader>
          <DialogTitle>{detail?.product.name ?? 'รายละเอียด Product'}</DialogTitle>
          <DialogDescription>{detail?.product.code ?? ''} · {detail?.product.metalGroup ?? '-'} · Purchase/Sales source lines</DialogDescription>
        </DialogHeader>
        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          {isLoading ? <div className="rounded-md bg-slate-50 p-6 text-center text-sm text-slate-500">กำลังโหลดรายละเอียด</div> : null}
          {!isLoading && detail ? (
            <>
              <DetailSection title="Purchase Lines">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'Supplier', 'น้ำหนัก', 'ยอดซื้อ', 'ซื้อเฉลี่ย', 'สถานะ']}
                  rows={detail.purchaseLines.map((row) => [formatDateDisplay(row.date), row.docNo, row.party, formatMoney(row.qty), formatMoney(row.amount), formatMoney(row.avgBuy), row.status])}
                />
              </DetailSection>
              <DetailSection title="Sales Lines">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'Customer', 'น้ำหนัก', 'ยอดขาย', 'ขายเฉลี่ย', 'COGS', 'GP', 'สถานะ']}
                  rows={detail.salesLines.map((row) => [formatDateDisplay(row.date), row.docNo, row.party, formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.avgSell), formatMoney(row.cogs), formatMoney(row.gp), row.status])}
                />
              </DetailSection>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return <section className="rounded-md border border-slate-200 bg-white"><div className="border-b bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{title}</div>{children}</section>
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-100"><tr>{headers.map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={headers.length}>ไม่มีข้อมูล</td></tr> : null}
          {rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, cellIndex) => <td key={`${index}-${headers[cellIndex]}`} className={cellIndex <= 2 || cellIndex === headers.length - 1 ? 'p-2' : 'p-2 text-right'}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-white p-4 shadow"><div className="text-xs font-semibold text-slate-500">{label}</div><div className="mt-1 truncate font-mono text-xl font-bold text-orange-700">{value}</div></div>
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={active ? 'rounded-md bg-orange-600 px-4 py-2 text-sm font-bold text-white' : 'rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600'} type="button" onClick={onClick}>{label}</button>
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <div className="space-y-2">{rows.length === 0 ? <div className="py-8 text-center text-slate-400">ไม่มีข้อมูล</div> : rows.map((row, index) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{index + 1}. {row.label}</span><b>{formatMoney(row.value)}</b></div><div className="h-2 rounded-md bg-slate-100"><div className="h-2 rounded-md bg-orange-500" style={{ width: `${Math.min(100, row.value / max * 100)}%` }} /></div></div>)}</div>
}

function TopPanel({ rows, suffix = '', title }: { rows: { label: string; value: number }[]; suffix?: string; title: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow"><div className="border-b bg-orange-50 p-3 font-bold text-orange-700">{title}</div><table className="w-full text-sm"><tbody>{rows.map((row, index) => <tr key={`${title}-${row.label}-${index}`} className="border-t"><td className="p-2 font-bold">{index + 1}</td><td className="p-2">{row.label}</td><td className="p-2 text-right font-semibold">{suffix ? `${row.value.toFixed(2)}${suffix}` : formatMoney(row.value)}</td></tr>)}</tbody></table></div>
}

function YearCompare({ monthly }: { monthly: ProductTrackingPayload['monthly'] }) {
  return (
    <div className="overflow-x-auto rounded-md bg-white shadow">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2 text-left">เดือน</th><th className="p-2 text-right">ขาย กก.</th><th className="p-2 text-right">ยอดขาย</th><th className="p-2 text-right">ซื้อ กก.</th><th className="p-2 text-right">ยอดซื้อ</th><th className="p-2 text-right">GP</th></tr></thead>
        <tbody>{monthly.map((row, index) => <tr key={row.month} className="border-t"><td className="p-2">{monthLabels[index]}</td><td className="p-2 text-right">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td><td className="p-2 text-right font-semibold text-orange-700">{formatMoney(row.revenue ?? row.salesAmount ?? 0)}</td><td className="p-2 text-right">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td><td className="p-2 text-right">{formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}</td><td className="p-2 text-right">{formatMoney(row.gp ?? 0)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
