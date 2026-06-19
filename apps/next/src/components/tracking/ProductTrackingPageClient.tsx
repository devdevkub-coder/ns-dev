'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type ProductTrackingRow = {
  amount?: number
  allocationCogs?: number
  allocationQty?: number
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
  productionInputQty?: number
  productionLossPct?: number
  productionLossQty?: number
  productionOutputQty?: number
  productionYieldPct?: number
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
    productionInputQty?: number
    productionLossQty?: number
    productionOutputQty?: number
    productionYieldPct?: number
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
  allocationLines: Array<{ allocationNo: string; date: string; matchedCogs: number; method: string; qty: number; salesDocHref: string | null; salesDocNo: string; sourceDocHref: string | null; sourceDocNo: string; sourceType: string; status: string }>
  monthly: Array<{ buyAmount: number; buyQty: number; gp: number; month: string; productionInputQty: number; productionLossQty: number; productionOutputQty: number; productionYieldPct: number; revenue: number; sellQty: number }>
  product: { code: string; id: string; metalGroup: string | null; name: string; stockBalanceHref: string; unit: string }
  productionLines: Array<{ date: string; docNo: string; href: string; inputQty: number; lossQty: number; outputQty: number; status: string; yieldPct: number }>
  productionSignals: { allocationCogs: number; allocationCount: number; allocationQty: number; inputQty: number; lossPct: number; lossQty: number; outputQty: number; productionOrderCount: number; yieldPct: number }
  purchaseLines: Array<{ amount: number; avgBuy: number; date: string; docNo: string; href: string; party: string; qty: number; status: string }>
  salesLines: Array<{ avgSell: number; cogs: number; date: string; docNo: string; gp: number; href: string; party: string; qty: number; revenue: number; status: string }>
}

type DetailCell = string | { href: string; label: string }

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

type ProductTrackingPageClientProps = {
  initialCustomerId?: string
  initialMetalGroup?: string
  initialMonth?: string
  initialProductId?: string
  initialSearch?: string
  initialSupplierId?: string
  initialYear?: string
}

export function ProductTrackingPageClient({
  initialCustomerId = '',
  initialMetalGroup = '',
  initialMonth = '',
  initialProductId = '',
  initialSearch = '',
  initialSupplierId = '',
  initialYear,
}: ProductTrackingPageClientProps) {
  const [data, setData] = useState<ProductTrackingPayload | null>(null)
  const [detail, setDetail] = useState<ProductTrackingDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState(initialCustomerId)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [metalGroup, setMetalGroup] = useState(initialMetalGroup)
  const [month, setMonth] = useState(initialMonth)
  const [productId, setProductId] = useState(initialProductId)
  const [search, setSearch] = useState(initialSearch)
  const [supplierId, setSupplierId] = useState(initialSupplierId)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const [year, setYear] = useState(initialYear ?? String(new Date().getFullYear()))

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
    setDetail({
      allocationLines: [],
      monthly: [],
      product: { code, id: code, metalGroup: row.metalGroup ?? null, name: row.name ?? row.productName ?? '-', stockBalanceHref: `/stock/balance?productId=${encodeURIComponent(code)}`, unit: row.unit ?? 'kg' },
      productionLines: [],
      productionSignals: {
        allocationCogs: row.allocationCogs ?? 0,
        allocationCount: 0,
        allocationQty: row.allocationQty ?? 0,
        inputQty: row.productionInputQty ?? 0,
        lossPct: row.productionLossPct ?? 0,
        lossQty: row.productionLossQty ?? 0,
        outputQty: row.productionOutputQty ?? 0,
        productionOrderCount: 0,
        yieldPct: row.productionYieldPct ?? 0,
      },
      purchaseLines: [],
      salesLines: [],
    })
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

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard icon="📦" label="รายการ" tone="orange" value={formatMoney(data?.summary.products ?? 0)} />
        <SummaryCard icon="📥" label="ซื้อ (กก.)" tone="blue" value={formatMoney(data?.summary.buyQty ?? data?.summary.purchaseQty ?? 0)} />
        <SummaryCard icon="📤" label="ขาย (กก.)" tone="orange" value={formatMoney(data?.summary.sellQty ?? data?.summary.salesQty ?? 0)} />
        <SummaryCard icon="💳" label="ยอดซื้อ" tone="amber" value={formatMoney(data?.summary.buyAmount ?? data?.summary.purchaseAmount ?? 0)} />
        <SummaryCard icon="💰" label="ยอดขาย" tone="emerald" value={formatMoney(data?.summary.revenue ?? data?.summary.salesAmount ?? 0)} />
        <SummaryCard icon="📈" label="GP" tone="violet" value={formatMoney(data?.summary.gp ?? 0)} />
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-sm">
        {/* Desktop View */}
        <div className="hidden lg:block space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              type="number"
              placeholder="ปี ค.ศ."
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="">ทั้งปี</option>
              {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
            </select>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              value={metalGroup}
              onChange={(event) => { setMetalGroup(event.target.value); setProductId('') }}
            >
              <option value="">ทุกหมวด</option>
              {(data?.filters?.metalGroups ?? []).map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-[150px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">สินค้าทั้งหมด</option>
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code ? `${product.code} - ${product.name}` : product.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">ทุก Supplier</option>
              {(data?.filters?.suppliers ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">ทุก Customer</option>
              {(data?.filters?.customers ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code ? `${customer.code} - ${customer.name}` : customer.name}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-[150px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              placeholder="ค้นหา Product"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            
            <a
              className="ml-auto inline-flex h-10 items-center justify-center rounded-md bg-orange-600 px-4 text-center text-sm font-bold text-white hover:bg-orange-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              href={exportHref}
            >
              📥 Export Excel
            </a>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              placeholder="ค้นหา Product..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className={`h-10 rounded-md border px-3 text-sm font-semibold transition-colors flex items-center gap-1 shrink-0 focus-visible:outline-none ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-100'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง
            </button>
            <a
              className="h-10 inline-flex items-center justify-center rounded-md bg-orange-600 px-3 text-sm font-bold text-white shrink-0"
              href={exportHref}
            >
              📥 XLSX
            </a>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500 font-semibold">
                  ปี
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
                    type="number"
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                  />
                </label>
                <label className="text-[11px] text-slate-500 font-semibold">
                  เดือน
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  >
                    <option value="">ทั้งปี</option>
                    {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500 font-semibold">
                  หมวด
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
                    value={metalGroup}
                    onChange={(event) => { setMetalGroup(event.target.value); setProductId('') }}
                  >
                    <option value="">ทุกหมวด</option>
                    {(data?.filters?.metalGroups ?? []).map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-slate-500 font-semibold">
                  เลือกสินค้า
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                  >
                    <option value="">สินค้าทั้งหมด</option>
                    {filteredProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.code ? `${product.code} - ${product.name}` : product.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="text-[11px] text-slate-500 font-semibold">
                เลือก Supplier
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="">ทุก Supplier</option>
                  {(data?.filters?.suppliers ?? []).map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-slate-500 font-semibold">
                เลือก Customer
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">ทุก Customer</option>
                  {(data?.filters?.customers ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.code ? `${customer.code} - ${customer.name}` : customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end pt-1">
                <button
                  className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors focus-visible:outline-none"
                  type="button"
                  onClick={() => {
                    setYear(String(new Date().getFullYear()))
                    setMonth('')
                    setMetalGroup('')
                    setProductId('')
                    setSupplierId('')
                    setCustomerId('')
                    setSearch('')
                  }}
                >
                  ล้างตัวกรอง
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">ยอดขายรายเดือน {data?.year ?? year}</div>
          <div className="grid grid-cols-12 items-end gap-2">
            {(data?.monthly ?? []).map((item, index) => {
              const revenue = item.revenue ?? item.salesAmount ?? item.amount ?? 0
              return (
                <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-orange-400 to-orange-500" style={{ height: `${Math.max(4, (revenue / maxMonthRevenue) * 128)}px` }} />
                  <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Product</div>
          <BarList rows={topRevenue.slice(0, 5).map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.revenue ?? row.salesAmount ?? row.amount ?? 0 }))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl bg-white p-2 border border-slate-100 shadow-sm">
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
        <>
        <div className="space-y-3 lg:hidden">
          {isLoading ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
          {!isLoading && rows.length === 0 ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400 shadow-sm">ไม่มีข้อมูล Product Tracking</div> : null}
          {!isLoading && rows.map((row) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm active:bg-slate-50/55 cursor-pointer transition-colors focus-visible:outline-none" role="button" tabIndex={0} onClick={() => void openDetail(row)} onKeyDown={(event) => { if (event.key === 'Enter') void openDetail(row) }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{row.name ?? row.productName}</div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">{row.code || '-'} · {row.metalGroup || '-'}</div>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold shrink-0 ${(row.gp ?? 0) >= 0 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>GP {formatMoney(row.gp ?? 0)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-2 text-xs">
                <MiniLine label="ยอดขาย" tone="orange" value={formatMoney(row.revenue ?? row.salesAmount ?? 0)} />
                <MiniLine label="ยอดซื้อ" value={formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)} />
                <MiniLine label="ขาย" value={`${formatMoney(row.sellQty ?? row.salesQty ?? 0)} กก.`} />
                <MiniLine label="GP%" tone={(row.gp ?? 0) >= 0 ? 'orange' : 'red'} value={`${(row.gpPct ?? 0).toFixed(2)}%`} />
                <MiniLine label="Yield" tone="orange" value={`${(row.productionYieldPct ?? 0).toFixed(1)}%`} />
                <MiniLine label="Loss" tone={(row.productionLossQty ?? 0) > 0 ? 'red' : 'slate'} value={`${formatMoney(row.productionLossQty ?? 0)} กก.`} />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl bg-white border border-slate-100 shadow-sm lg:block">
          <table className="w-full min-w-[1240px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold">
              <tr>
                <th className="p-3 pl-4 text-left">Code</th>
                <th className="p-3 text-left">สินค้า</th>
                <th className="p-3 text-left">หมวด</th>
                <th className="p-3 text-right">ซื้อ กก.</th>
                <th className="p-3 text-right">มูลค่าซื้อ</th>
                <th className="p-3 text-right">ซื้อเฉลี่ย</th>
                <th className="p-3 text-right">ขาย กก.</th>
                <th className="p-3 text-right">ยอดขาย</th>
                <th className="p-3 text-right">ขายเฉลี่ย</th>
                <th className="p-3 text-right">COGS</th>
                <th className="p-3 text-right">GP</th>
                <th className="p-3 pr-4 text-right">GP%</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ไม่มีข้อมูล Product Tracking</td></tr> : null}
              {!isLoading && rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/30 transition-colors focus-visible:outline-none" onClick={() => void openDetail(row)}>
                  <td className="p-3 pl-4 font-mono text-xs text-slate-400">{row.code || '-'}</td>
                  <td className="p-3 font-medium text-slate-800">{row.name ?? row.productName}</td>
                  <td className="p-3 text-slate-700">{row.metalGroup || '-'}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.avgBuy ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td>
                  <td className="p-3 text-right font-mono font-semibold text-orange-700">{formatMoney(row.revenue ?? row.salesAmount ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.avgSell ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-red-600">{formatMoney(row.cogs ?? 0)}</td>
                  <td className={`p-3 text-right font-mono font-semibold ${(row.gp ?? 0) >= 0 ? 'text-orange-700' : 'text-red-600'}`}>{formatMoney(row.gp ?? 0)}</td>
                  <td className="p-3 pr-4 text-right font-mono text-slate-700">{(row.gpPct ?? 0).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : null}
      <ProductDetailDialog detail={detail} isLoading={isDetailLoading} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </section>
  )
}

function ProductDetailDialog({ detail, isLoading, onOpenChange }: { detail: ProductTrackingDetail | null; isLoading: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden !p-0" fallbackTitle="Product Tracking Detail">
        <DialogHeader className="bg-slate-900 px-5 py-4 flex flex-col space-y-1">
          <DialogTitle className="text-xl font-bold text-white">{detail?.product.name ?? 'รายละเอียด Product'}</DialogTitle>
          <DialogDescription className="text-xs text-slate-300 mt-0.5">
            {detail?.product.code ? `${detail.product.code} · ` : ''}{detail?.product.metalGroup ? `${detail.product.metalGroup} · ` : ''}Purchase / Sales / Production / Allocation
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
          {isLoading ? <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500 border border-slate-100">กำลังโหลดรายละเอียด...</div> : null}
          {!isLoading && detail ? (
            <>
              <DetailSection title="Production / Allocation Signals">
                <div className="grid grid-cols-2 gap-2.5 p-3 md:grid-cols-3 lg:grid-cols-4">
                  <SignalMetric label="Production Orders" value={`${detail.productionSignals.productionOrderCount}`} />
                  <SignalMetric label="Input" value={`${formatMoney(detail.productionSignals.inputQty)} กก.`} />
                  <SignalMetric label="Output" value={`${formatMoney(detail.productionSignals.outputQty)} กก.`} />
                  <SignalMetric label="Yield" value={`${detail.productionSignals.yieldPct.toFixed(1)}%`} />
                  <SignalMetric label="Loss" value={`${formatMoney(detail.productionSignals.lossQty)} กก.`} />
                  <SignalMetric label="Loss%" value={`${detail.productionSignals.lossPct.toFixed(1)}%`} />
                  <SignalMetric label="Allocated Qty" value={`${formatMoney(detail.productionSignals.allocationQty)} กก.`} />
                  <SignalMetric label="Allocated COGS" value={formatMoney(detail.productionSignals.allocationCogs)} />
                </div>
              </DetailSection>
              <DetailSection title="Stock Support">
                <div className="p-3">
                  <a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors focus-visible:outline-none" href={detail.product.stockBalanceHref}>
                    เปิด Stock Balance
                  </a>
                </div>
              </DetailSection>
              <DetailSection title="Purchase Lines">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'Supplier', 'น้ำหนัก', 'ยอดซื้อ', 'ซื้อเฉลี่ย', 'สถานะ']}
                  rows={detail.purchaseLines.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, row.party, formatMoney(row.qty), formatMoney(row.amount), formatMoney(row.avgBuy), row.status])}
                />
              </DetailSection>
              <DetailSection title="Sales Lines">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'Customer', 'น้ำหนัก', 'ยอดขาย', 'ขายเฉลี่ย', 'COGS', 'GP', 'สถานะ']}
                  rows={detail.salesLines.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, row.party, formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.avgSell), formatMoney(row.cogs), formatMoney(row.gp), row.status])}
                />
              </DetailSection>
              <DetailSection title="Monthly Detail">
                <SimpleTable
                  headers={['เดือน', 'ซื้อ', 'มูลค่าซื้อ', 'ขาย', 'ยอดขาย', 'GP', 'Input', 'Output', 'Loss', 'Yield']}
                  rows={detail.monthly.map((row, index) => [monthLabels[index] ?? row.month, formatMoney(row.buyQty), formatMoney(row.buyAmount), formatMoney(row.sellQty), formatMoney(row.revenue), formatMoney(row.gp), formatMoney(row.productionInputQty), formatMoney(row.productionOutputQty), formatMoney(row.productionLossQty), `${row.productionYieldPct.toFixed(1)}%`])}
                />
              </DetailSection>
              <DetailSection title="Production Lines">
                <SimpleTable
                  headers={['วันที่', 'ใบสั่งผลิต', 'Input', 'Output', 'Loss', 'Yield', 'สถานะ']}
                  rows={detail.productionLines.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, formatMoney(row.inputQty), formatMoney(row.outputQty), formatMoney(row.lossQty), `${row.yieldPct.toFixed(1)}%`, row.status])}
                />
              </DetailSection>
              <DetailSection title="Allocation / Cost Source">
                <SimpleTable
                  headers={['วันที่', 'Allocation', 'Source', 'Sales', 'Qty', 'Matched COGS', 'Method', 'สถานะ']}
                  rows={detail.allocationLines.map((row) => [
                    formatDateDisplay(row.date),
                    row.allocationNo,
                    row.sourceDocHref ? { href: row.sourceDocHref, label: row.sourceDocNo } : row.sourceDocNo,
                    row.salesDocHref ? { href: row.salesDocHref, label: row.salesDocNo } : row.salesDocNo,
                    formatMoney(row.qty),
                    formatMoney(row.matchedCogs),
                    row.method,
                    row.status,
                  ])}
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
  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden shadow-sm">
      <div className="border-b border-slate-100 bg-slate-100/60 px-4 py-2.5 text-sm font-bold text-slate-850">{title}</div>
      {children}
    </section>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: DetailCell[][] }) {
  const cellText = (cell: DetailCell) => typeof cell === 'string' ? cell : cell.label
  const isNumericCell = (cell: DetailCell) => /^-?[\d,]+(\.\d+)?%?$/.test(cellText(cell).trim())
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {headers.map((header, idx) => (
                <th key={header} className={`p-2.5 text-slate-600 font-semibold text-xs text-left ${idx === 0 ? 'pl-4' : idx === headers.length - 1 ? 'pr-4' : ''}`}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={headers.length}>ไม่มีข้อมูล</td></tr> : null}
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100 hover:bg-slate-50/30">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${index}-${headers[cellIndex]}`}
                    className={`
                      p-2.5 text-slate-700
                      ${cellIndex === 0 ? 'pl-4' : cellIndex === row.length - 1 ? 'pr-4' : ''}
                      ${cellIndex <= 2 || cellIndex === headers.length - 1 || !isNumericCell(cell) ? 'text-left' : 'text-right'}
                    `}
                  >
                    {typeof cell === 'string' ? (
                      cell
                    ) : (
                      <a className="font-mono font-semibold text-blue-600 underline-offset-2 hover:underline focus:outline-none focus-visible:outline-none focus-visible:ring-0" href={cell.href}>
                        {cell.label}
                      </a>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden space-y-3 p-3">
        {rows.length === 0 ? <div className="text-center text-xs text-slate-400 py-4 bg-white rounded-xl border border-slate-100">ไม่มีข้อมูล</div> : null}
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm space-y-2 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 font-semibold">
              <span className="text-slate-800 font-bold">
                {typeof row[0] === 'string' ? row[0] : (
                  <a className="font-mono text-blue-600 underline focus:outline-none focus-visible:outline-none focus-visible:ring-0" href={(row[0] as { href: string }).href}>
                    {row[0].label}
                  </a>
                )}
              </span>
              {row.length > 1 && (
                <span className="text-slate-600 font-bold">
                  {cellText(row[row.length - 1])}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {row.slice(1, row.length - 1).map((cell, cellIndex) => {
                const headerLabel = headers[cellIndex + 1] || ''
                const cellValue = cellText(cell)
                const isLink = typeof cell !== 'string'
                return (
                  <div key={cellIndex} className="flex justify-between items-center gap-2">
                    <span className="text-slate-500 font-semibold">{headerLabel}</span>
                    <span className="text-slate-800 font-medium font-mono text-right truncate max-w-[180px]">
                      {isLink ? (
                        <a className="text-blue-600 underline focus:outline-none focus-visible:outline-none focus-visible:ring-0" href={(cell as { href: string }).href}>
                          {cellValue}
                        </a>
                      ) : (
                        cellValue
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SummaryCard({ className = '', icon, label, tone, value }: { className?: string; icon: string; label: string; tone: 'amber' | 'blue' | 'orange' | 'violet' | 'emerald'; value: string }) {
  const colors = {
    amber: 'bg-amber-100 text-amber-700 border-amber-200/50',
    blue: 'bg-blue-100 text-blue-700 border-blue-200/50',
    orange: 'bg-orange-100 text-orange-700 border-orange-200/50',
    violet: 'bg-violet-100 text-violet-700 border-violet-200/50',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200/50',
  }[tone]
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:gap-4 sm:p-4 ${className}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl sm:h-11 sm:w-11 ${colors.split(' ')[0]}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-xs ${colors.split(' ')[1]}`}>{label}</div>
        <div className="truncate font-mono text-lg sm:text-2xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  )
}

function MiniLine({ label, tone = 'slate', value }: { label: string; tone?: 'orange' | 'red' | 'slate'; value: string }) {
  const text = tone === 'orange' ? 'text-orange-700' : tone === 'red' ? 'text-red-700' : 'text-slate-800'
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className={`font-mono font-bold ${text}`}>{value}</span>
    </div>
  )
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-bold text-slate-900 font-mono">{value}</div>
    </div>
  )
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={
        active
          ? 'rounded-md bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100'
          : 'rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200'
      }
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="py-8 text-center text-slate-400">ไม่มีข้อมูล</div>
      ) : (
        rows.map((row, index) => (
          <div key={row.label} className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>{index + 1}. {row.label}</span>
              <span className="font-mono font-bold text-slate-800">{formatMoney(row.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-300" style={{ width: `${Math.min(100, (row.value / max) * 100)}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function TopPanel({ rows, suffix = '', title }: { rows: { label: string; value: number }[]; suffix?: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white border border-slate-100 shadow-sm">
      <div className="border-b border-slate-100 bg-orange-50 p-3 font-bold text-orange-700">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${row.label}-${index}`} className="border-t border-slate-100 hover:bg-slate-50/50">
              <td className="p-2.5 pl-4 font-bold text-slate-400 w-10">{index + 1}</td>
              <td className="p-2.5 font-medium text-slate-800">{row.label}</td>
              <td className="p-2.5 pr-4 text-right font-mono font-bold text-slate-900">
                {suffix ? `${row.value.toFixed(2)}${suffix}` : formatMoney(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function YearCompare({ monthly }: { monthly: ProductTrackingPayload['monthly'] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white border border-slate-100 shadow-sm">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="p-3 pl-4 text-left font-semibold text-slate-600">เดือน</th>
            <th className="p-3 text-right font-semibold text-slate-600">ขาย กก.</th>
            <th className="p-3 text-right font-semibold text-slate-600">ยอดขาย</th>
            <th className="p-3 text-right font-semibold text-slate-600">ซื้อ กก.</th>
            <th className="p-3 text-right font-semibold text-slate-600">ยอดซื้อ</th>
            <th className="p-3 pr-4 text-right font-semibold text-slate-600">GP</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((row, index) => (
            <tr key={row.month} className="border-t border-slate-100 hover:bg-slate-50/40">
              <td className="p-3 pl-4 font-medium text-slate-800">{monthLabels[index]}</td>
              <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td>
              <td className="p-3 text-right font-mono font-semibold text-orange-700">
                {formatMoney(row.revenue ?? row.salesAmount ?? 0)}
              </td>
              <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td>
              <td className="p-3 text-right font-mono text-slate-700">
                {formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}
              </td>
              <td className="p-3 pr-4 text-right font-mono font-semibold text-emerald-700">{formatMoney(row.gp ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
