'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TrackingPagination, trackingPageSizeOptions } from '@/components/tracking/TrackingPagination'
import { trackingCurrentYear, trackingRangeFromYearMonth, trackingScopeYear, trackingYearEnd, trackingYearStart } from '@/components/tracking/trackingDateRange'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'



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
  matchKey?: string
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
  monthlyData?: Array<{ qty: number; buyAmount: number; sellQty: number; salesAmount: number }>
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
type ProductYearCompareColumnKey =
  | 'product'
  | 'm01'
  | 'm02'
  | 'm03'
  | 'm04'
  | 'm05'
  | 'm06'
  | 'm07'
  | 'm08'
  | 'm09'
  | 'm10'
  | 'm11'
  | 'm12'
  | 'total'
type ProductYearCompareMode = 'buyQty' | 'buyAmount' | 'sellQty' | 'salesAmount'

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const productYearCompareColumns: Array<ResizableColumnDefinition<ProductYearCompareColumnKey>> = [
  { key: 'product', defaultWidth: 240, minWidth: 170 },
  ...months.map((month) => ({ key: `m${month}` as ProductYearCompareColumnKey, defaultWidth: 110, minWidth: 90 })),
  { key: 'total', defaultWidth: 130, minWidth: 110 },
]

type ProductTrackingPageClientProps = {
  initialCustomerId?: string
  initialDateFrom?: string
  initialDateTo?: string
  initialMetalGroup?: string
  initialMonth?: string
  initialProductId?: string
  initialSearch?: string
  initialSupplierId?: string
  initialYear?: string
}



const trackingColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'code', defaultWidth: 80 },
  { key: 'product', defaultWidth: 200 },
  { key: 'metalGroup', defaultWidth: 100 },
  { key: 'buyQty', defaultWidth: 100 },
  { key: 'buyAmount', defaultWidth: 110 },
  { key: 'avgBuy', defaultWidth: 100 },
  { key: 'sellQty', defaultWidth: 100 },
  { key: 'revenue', defaultWidth: 110 },
  { key: 'avgSell', defaultWidth: 100 },
  { key: 'cogs', defaultWidth: 100 },
  { key: 'gp', defaultWidth: 100 },
  { key: 'gpPct', defaultWidth: 80 },
]

export function ProductTrackingPageClient({
  initialCustomerId = '',
  initialDateFrom = '',
  initialDateTo = '',
  initialMetalGroup = '',
  initialMonth = '',
  initialProductId = '',
  initialSearch = '',
  initialSupplierId = '',
  initialYear,
}: ProductTrackingPageClientProps) {
  const initialRange = trackingRangeFromYearMonth(initialYear ?? trackingCurrentYear(), initialMonth)
  const [data, setData] = useState<ProductTrackingPayload | null>(null)
  const [detail, setDetail] = useState<ProductTrackingDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState(initialCustomerId)
  const [dateFrom, setDateFrom] = useState(initialDateFrom || initialRange.dateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo || initialRange.dateTo)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [metalGroup, setMetalGroup] = useState(initialMetalGroup)
  const [productId, setProductId] = useState(initialProductId)
  const [search, setSearch] = useState(initialSearch)
  const [supplierId, setSupplierId] = useState(initialSupplierId)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const [sortKey, setSortKey] = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof trackingPageSizeOptions)[number]>(10)
  const scopeYear = trackingScopeYear(dateFrom)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year: scopeYear })
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (metalGroup) params.set('metalGroup', metalGroup)
    if (productId) params.set('productId', productId)
    if (supplierId) params.set('supplierId', supplierId)
    if (customerId) params.set('customerId', customerId)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [customerId, dateFrom, dateTo, metalGroup, productId, scopeYear, search, supplierId])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<ProductTrackingPayload>(`/api/tracking/product?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลติดตามสินค้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [queryString, sortDirection, sortKey, view])

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
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดสินค้าไม่ได้')
      setDetail(null)
    } finally {
      setIsDetailLoading(false)
    }
  }, [queryString])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (sortKey) {
      result.sort((a, b) => {
        let key = sortKey
        if (key === 'product') {
          key = 'productName'
        }
        const valA = a[key as keyof ProductTrackingRow]
        const valB = b[key as keyof ProductTrackingRow]

        if (valA === undefined || valA === null) return 1
        if (valB === undefined || valB === null) return -1

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA
        }

        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB), 'th', { numeric: true })
          : String(valB).localeCompare(String(valA), 'th', { numeric: true })
      })
    }
    return result
  }, [rows, sortKey, sortDirection])
  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [currentPage, pageSize, sortedRows])
  const maxMonthRevenue = Math.max(1, ...(data?.monthly ?? []).map((item) => item.revenue ?? item.salesAmount ?? item.amount ?? 0))
  const topRevenue = data?.top?.byRevenue ?? data?.topMovers ?? []
  const topBuy = data?.top?.byBuy ?? [...rows].sort((left, right) => (right.buyAmount ?? 0) - (left.buyAmount ?? 0)).slice(0, 10)
  const topGp = data?.top?.byGp ?? [...rows].sort((left, right) => (right.gp ?? 0) - (left.gp ?? 0)).slice(0, 10)
  const topGpPct = [...rows].filter((row) => (row.revenue ?? row.salesAmount ?? 0) > 0).sort((left, right) => (right.gpPct ?? 0) - (left.gpPct ?? 0)).slice(0, 10)
  const filteredProducts = (data?.filters?.products ?? []).filter((product) => !metalGroup || product.metalGroup === metalGroup)
  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return filteredProducts.map((product) => ({
      id: product.id,
      label: product.code ? `${product.code} - ${product.name}` : product.name,
    }))
  }, [filteredProducts])

  const supplierSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters?.suppliers ?? []).map((supplier) => ({
      id: supplier.id,
      label: supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name,
    }))
  }, [data?.filters?.suppliers])

  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters?.customers ?? []).map((customer) => ({
      id: customer.id,
      label: customer.code ? `${customer.code} - ${customer.name}` : customer.name,
    }))
  }, [data?.filters?.customers])
  const columnResize = useResizableColumns('tracking.product.main.v8', trackingColumns)
  const exportHref = `/api/tracking/product?${queryString}&format=xlsx`
  const currentYear = trackingCurrentYear()
  const defaultDateFrom = trackingYearStart(currentYear)
  const defaultDateTo = trackingYearEnd(currentYear)
  const hasActiveFilters = Boolean(search || metalGroup || productId || supplierId || customerId || dateFrom !== defaultDateFrom || dateTo !== defaultDateTo)
  const resetFilters = () => {
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
    setMetalGroup('')
    setProductId('')
    setSupplierId('')
    setCustomerId('')
    setSearch('')
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryCard icon="📥" label="ซื้อ (กก.)" tone="blue" value={formatMoney(data?.summary.buyQty ?? data?.summary.purchaseQty ?? 0)} />
        <SummaryCard icon="📤" label="ขาย (กก.)" tone="orange" value={formatMoney(data?.summary.sellQty ?? data?.summary.salesQty ?? 0)} />
        <SummaryCard icon="💳" label="ยอดซื้อ" tone="amber" value={formatMoney(data?.summary.buyAmount ?? data?.summary.purchaseAmount ?? 0)} />
        <SummaryCard icon="💰" label="ยอดขาย" tone="emerald" value={formatMoney(data?.summary.revenue ?? data?.summary.salesAmount ?? 0)} />
        <SummaryCard icon="📈" label="GP" tone="violet" value={formatMoney(data?.summary.gp ?? 0)} />
      </div>

      <Tabs className="min-w-0" value={view} onValueChange={(value) => setView(value as 'list' | 'top10' | 'yearCompare')}>
        <TabsList className="w-full min-w-0 overflow-x-auto" variant="line">
          <TabsTrigger value="list" variant="line">รายการ</TabsTrigger>
          <TabsTrigger value="top10" variant="line">10 อันดับในหมวด</TabsTrigger>
          <TabsTrigger value="yearCompare" variant="line">รายปี</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        {/* Desktop View */}
        <div className="hidden lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 pl-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
                placeholder="ค้นหาสินค้า"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400">→</span>
            <DatePickerInput value={dateTo} onChange={setDateTo} />
            <div className="w-[180px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm"
                inputId="tracking-product-filter-product"
                label="สินค้า"
                options={productSearchOptions}
                placeholder="เลือกสินค้า"
                value={productId}
                onChange={setProductId}
              />
            </div>
            <div className="w-[180px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm"
                inputId="tracking-product-filter-supplier"
                label="ผู้ขายฝั่งซื้อ"
                options={supplierSearchOptions}
                placeholder="ผู้ขายฝั่งซื้อ"
                value={supplierId}
                onChange={setSupplierId}
              />
            </div>
            <div className="w-[180px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm"
                inputId="tracking-product-filter-customer"
                label="ลูกค้าฝั่งขาย"
                options={customerSearchOptions}
                placeholder="ลูกค้าฝั่งขาย"
                value={customerId}
                onChange={setCustomerId}
              />
            </div>
            <select
              className="h-9 w-[10rem] rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              value={metalGroup}
              onChange={(event) => { setMetalGroup(event.target.value); setProductId('') }}
            >
              <option value="">ทุกหมวด</option>
              {(data?.filters?.metalGroups ?? []).map((group) => <option key={group} value={group}>{group}</option>)}
            </select>

            <button className="h-9 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60" disabled={!hasActiveFilters} type="button" onClick={resetFilters}>ล้างตัวกรอง</button>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <a
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-center text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              href={exportHref}
            >
              <Download aria-hidden="true" className="size-4" />
              <span>ส่งออก Excel</span>
            </a>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2">
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              placeholder="ค้นหาสินค้า..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none ${
                showMobileFilters ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              ตัวกรอง
            </button>
            <a
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700"
              href={exportHref}
            >
              <Download aria-hidden="true" className="size-4" />
              <span>ส่งออก Excel</span>
            </a>
          </div>

          {showMobileFilters && (
            <MobileFilterSheet
              title="ตัวกรองติดตามสินค้า"
              onClose={() => setShowMobileFilters(false)}
              footer={(
                <>
                  <button
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
                    type="button"
                    onClick={resetFilters}
                  >
                    ล้างตัวกรอง
                  </button>
                  <button className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white" type="button" onClick={() => setShowMobileFilters(false)}>ใช้ตัวกรอง</button>
                </>
              )}
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500 font-semibold">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={dateFrom} onChange={setDateFrom} />
                </label>
                <label className="text-xs text-slate-500 font-semibold">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={dateTo} onChange={setDateTo} />
                </label>
              </div>
              <label className="text-xs text-slate-500 font-semibold block">
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
              <SearchCombobox inputClassName="h-9 text-sm" inputId="tracking-product-mobile-product" label="สินค้า" options={productSearchOptions} placeholder="เลือกสินค้า" value={productId} onChange={setProductId} />
              <SearchCombobox inputClassName="h-9 text-sm" inputId="tracking-product-mobile-supplier" label="ผู้ขายฝั่งซื้อ" options={supplierSearchOptions} placeholder="เลือกผู้ขาย" value={supplierId} onChange={setSupplierId} />
              <SearchCombobox inputClassName="h-9 text-sm" inputId="tracking-product-mobile-customer" label="ลูกค้าฝั่งขาย" options={customerSearchOptions} placeholder="เลือกลูกค้า" value={customerId} onChange={setCustomerId} />
            </MobileFilterSheet>
          )}
        </div>

      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow">
          <div className="mb-3 text-sm font-semibold text-slate-700">ยอดขายรายเดือน {data?.year ?? scopeYear}</div>
          <div className="grid grid-cols-12 items-end gap-2">
            {(data?.monthly ?? []).map((item, index) => {
              const revenue = item.revenue ?? item.salesAmount ?? item.amount ?? 0
              return (
                <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-orange-400 to-orange-500" style={{ height: `${Math.max(4, (revenue / maxMonthRevenue) * 128)}px` }} />
                  <div className="text-xs text-slate-500">{monthLabels[index]}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">สินค้าสูงสุด 5 อันดับ</div>
          <BarList rows={topRevenue.slice(0, 5).map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.revenue ?? row.salesAmount ?? row.amount ?? 0 }))} />
        </div>
      </div>

      {columnResize.hasCustomWidths && (
        <div className="flex justify-end">
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        </div>
      )}

      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel rows={topRevenue.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.revenue ?? row.salesAmount ?? row.amount ?? 0 }))} title="ยอดขายสูงสุด 10 อันดับ" />
          <TopPanel rows={topBuy.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.buyAmount ?? row.purchaseAmount ?? 0 }))} title="ยอดซื้อสูงสุด 10 อันดับ" />
          <TopPanel rows={topGp.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.gp ?? 0 }))} title="GP สูงสุด 10 อันดับ" />
          <TopPanel rows={topGpPct.map((row) => ({ label: row.name ?? row.productName ?? '-', value: row.gpPct ?? 0 }))} suffix="%" title="GP% สูงสุด 10 อันดับ" />
        </div>
      ) : null}

      {view === 'yearCompare' ? <YearCompare rows={rows} /> : null}

      {view === 'list' ? (
        <>
        <TrackingPagination
          currentPage={currentPage}
          isLoading={isLoading}
          pageSize={pageSize}
          totalPages={totalPages}
          totalRows={totalRows}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        <div className="space-y-3 lg:hidden">
          {isLoading ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
          {!isLoading && sortedRows.length === 0 ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400 shadow">ไม่มีข้อมูลติดตามสินค้า</div> : null}
          {!isLoading && pagedRows.map((row) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm active:bg-slate-50/55 cursor-pointer transition-colors focus-visible:outline-none" role="button" tabIndex={0} onClick={() => void openDetail(row)} onKeyDown={(event) => { if (event.key === 'Enter') void openDetail(row) }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{row.name ?? row.productName}</div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">{row.code || '-'} · {row.metalGroup || '-'}</div>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold shrink-0 ${(row.gp ?? 0) >= 0 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>GP {formatMoney(row.gp ?? 0)}</span>
              </div>              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-2 text-xs">
                <MiniLine label="ยอดขาย" tone="orange" value={formatMoney(row.revenue ?? row.salesAmount ?? 0)} />
                <MiniLine label="ยอดซื้อ" value={formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)} />
                <MiniLine label="ขาย" value={`${formatMoney(row.sellQty ?? row.salesQty ?? 0)} กก.`} />
                <MiniLine label="GP%" tone={(row.gp ?? 0) >= 0 ? 'orange' : 'red'} value={`${(row.gpPct ?? 0).toFixed(2)}%`} />
                <MiniLine label="อัตราผลได้" tone="orange" value={`${(row.productionYieldPct ?? 0).toFixed(1)}%`} />
                <MiniLine label="น้ำหนักสูญเสีย" tone={(row.productionLossQty ?? 0) > 0 ? 'red' : 'slate'} value={`${formatMoney(row.productionLossQty ?? 0)} กก.`} />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-md bg-white border border-slate-200/60 shadow lg:block overflow-hidden">
          <table className="ns-table w-full text-sm border-collapse" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {trackingColumns.map((col) => (
                <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100/75 text-slate-700 border-b border-slate-200">
              <tr>
                <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="รหัส" resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')} sortKey="code" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} sortKey="product" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="หมวด" resizeProps={columnResize.getResizeHandleProps('metalGroup', 'หมวด')} sortKey="metalGroup" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ซื้อ กก." resizeProps={columnResize.getResizeHandleProps('buyQty', 'ซื้อ กก.')} sortKey="buyQty" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="มูลค่าซื้อ" resizeProps={columnResize.getResizeHandleProps('buyAmount', 'มูลค่าซื้อ')} sortKey="buyAmount" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ซื้อเฉลี่ย" resizeProps={columnResize.getResizeHandleProps('avgBuy', 'ซื้อเฉลี่ย')} sortKey="avgBuy" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ขาย กก." resizeProps={columnResize.getResizeHandleProps('sellQty', 'ขาย กก.')} sortKey="sellQty" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอดขาย" resizeProps={columnResize.getResizeHandleProps('revenue', 'ยอดขาย')} sortKey="revenue" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ขายเฉลี่ย" resizeProps={columnResize.getResizeHandleProps('avgSell', 'ขายเฉลี่ย')} sortKey="avgSell" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="COGS" resizeProps={columnResize.getResizeHandleProps('cogs', 'COGS')} sortKey="cogs" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="GP" resizeProps={columnResize.getResizeHandleProps('gp', 'GP')} sortKey="gp" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="GP%" resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} sortKey="gpPct" onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ไม่มีข้อมูลติดตามสินค้า</td></tr> : null}
              {!isLoading && pagedRows.map((row) => (
                <tr key={row.id} className="cursor-pointer hover:bg-slate-50 transition-colors focus-visible:outline-none" onClick={() => void openDetail(row)}>
                  <td className="p-3 pl-4 font-mono text-xs text-slate-400 overflow-hidden truncate">{row.code || '-'}</td>
                  <td className="p-3 font-medium text-slate-800 overflow-hidden truncate">{row.name ?? row.productName}</td>
                  <td className="p-3 text-slate-700 overflow-hidden truncate">{row.metalGroup || '-'}</td>
                  <td className="p-3 text-right font-mono text-slate-700 overflow-hidden truncate">{formatMoney(row.buyQty ?? row.purchaseQty ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 overflow-hidden truncate">{formatMoney(row.buyAmount ?? row.purchaseAmount ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 overflow-hidden truncate">{formatMoney(row.avgBuy ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 overflow-hidden truncate">{formatMoney(row.sellQty ?? row.salesQty ?? 0)}</td>
                  <td className="p-3 text-right font-mono font-semibold text-orange-700 overflow-hidden truncate">{formatMoney(row.revenue ?? row.salesAmount ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 overflow-hidden truncate">{formatMoney(row.avgSell ?? 0)}</td>
                  <td className="p-3 text-right font-mono text-red-600 overflow-hidden truncate">{formatMoney(row.cogs ?? 0)}</td>
                  <td className={`p-3 text-right font-mono font-semibold ${(row.gp ?? 0) >= 0 ? 'text-orange-700' : 'text-red-600'}`}>{formatMoney(row.gp ?? 0)}</td>
                  <td className="p-3 pr-4 text-right font-mono text-slate-700 overflow-hidden truncate">{(row.gpPct ?? 0).toFixed(2)}%</td>
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
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden rounded-md border-0 bg-slate-900 !p-0 shadow-2xl outline-none focus:outline-none flex flex-col" fallbackTitle="รายละเอียดการติดตามสินค้า" hideClose>
        <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-5 py-4 text-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate text-xl font-bold text-white">{detail?.product.name ?? 'รายละเอียดสินค้า'}</DialogTitle>
              <DialogDescription className="truncate text-xs text-slate-300">
                {detail?.product.code ? `${detail.product.code} · ` : ''}{detail?.product.metalGroup ? `${detail.product.metalGroup} · ` : ''}ซื้อ / ขาย / ผลิต / จัดสรร
              </DialogDescription>
            </div>
            <Button className="h-9 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
          </div>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm sm:p-5">
          {isLoading ? <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 border border-slate-100">กำลังโหลดรายละเอียด...</div> : null}
          {!isLoading && detail ? (
            <>
              <DetailSection title="สัญญาณการผลิตและการจัดสรร">
                <div className="grid grid-cols-2 gap-2.5 p-3 md:grid-cols-3 lg:grid-cols-4">
                  <SignalMetric label="ใบสั่งผลิต" value={`${detail.productionSignals.productionOrderCount}`} />
                  <SignalMetric label="วัตถุดิบเข้า" value={`${formatMoney(detail.productionSignals.inputQty)} กก.`} />
                  <SignalMetric label="ผลผลิต" value={`${formatMoney(detail.productionSignals.outputQty)} กก.`} />
                  <SignalMetric label="อัตราผลได้" value={`${detail.productionSignals.yieldPct.toFixed(1)}%`} />
                  <SignalMetric label="น้ำหนักสูญเสีย" value={`${formatMoney(detail.productionSignals.lossQty)} กก.`} />
                  <SignalMetric label="อัตราสูญเสีย" value={`${detail.productionSignals.lossPct.toFixed(1)}%`} />
                  <SignalMetric label="จำนวนจัดสรร" value={`${formatMoney(detail.productionSignals.allocationQty)} กก.`} />
                  <SignalMetric label="COGS ที่จัดสรร" value={formatMoney(detail.productionSignals.allocationCogs)} />
                </div>
              </DetailSection>
              <DetailSection title="ข้อมูลสต๊อกประกอบ">
                <div className="p-3">
                  <a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors focus-visible:outline-none" href={detail.product.stockBalanceHref}>
                    เปิดยอดคงเหลือสต๊อก
                  </a>
                </div>
              </DetailSection>
              <DetailSection title="รายการซื้อ">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'ผู้ขาย', 'น้ำหนัก', 'ยอดซื้อ', 'ซื้อเฉลี่ย', 'สถานะ']}
                  rows={detail.purchaseLines.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, row.party, formatMoney(row.qty), formatMoney(row.amount), formatMoney(row.avgBuy), row.status])}
                />
              </DetailSection>
              <DetailSection title="รายการขาย">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'ลูกค้า', 'น้ำหนัก', 'ยอดขาย', 'ขายเฉลี่ย', 'COGS', 'GP', 'สถานะ']}
                  rows={detail.salesLines.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, row.party, formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.avgSell), formatMoney(row.cogs), formatMoney(row.gp), row.status])}
                />
              </DetailSection>
              <DetailSection title="รายละเอียดรายเดือน">
                <SimpleTable
                  headers={['เดือน', 'ซื้อ', 'มูลค่าซื้อ', 'ขาย', 'ยอดขาย', 'GP', 'วัตถุดิบเข้า', 'ผลผลิต', 'สูญเสีย', 'อัตราผลได้']}
                  rows={detail.monthly.map((row, index) => [monthLabels[index] ?? row.month, formatMoney(row.buyQty), formatMoney(row.buyAmount), formatMoney(row.sellQty), formatMoney(row.revenue), formatMoney(row.gp), formatMoney(row.productionInputQty), formatMoney(row.productionOutputQty), formatMoney(row.productionLossQty), `${row.productionYieldPct.toFixed(1)}%`])}
                />
              </DetailSection>
              <DetailSection title="สายการผลิต">
                <SimpleTable
                  headers={['วันที่', 'ใบสั่งผลิต', 'วัตถุดิบเข้า', 'ผลผลิต', 'สูญเสีย', 'อัตราผลได้', 'สถานะ']}
                  rows={detail.productionLines.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, formatMoney(row.inputQty), formatMoney(row.outputQty), formatMoney(row.lossQty), `${row.yieldPct.toFixed(1)}%`, row.status])}
                />
              </DetailSection>
              <DetailSection title="การจัดสรรและแหล่งต้นทุน">
                <SimpleTable
                  headers={['วันที่', 'การจัดสรร', 'ต้นทาง', 'ขาย', 'จำนวน', 'COGS ที่จับคู่', 'วิธีการ', 'สถานะ']}
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
    <section className="rounded-md border border-slate-100 bg-slate-50 overflow-hidden shadow">
      <div className="border-b border-slate-100 bg-slate-100/60 px-4 py-2.5 text-sm font-bold text-slate-800">{title}</div>
      {children}
    </section>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: DetailCell[][] }) {
  const cellText = (cell: DetailCell) => typeof cell === 'string' ? cell : cell.label
  const rightAlignedColumns = headers.map((_, columnIndex) => columnIndex > 0)
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto bg-white">
        <table className="ns-table w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {headers.map((header, idx) => (
                <th key={header} className={`p-2 text-slate-600 font-semibold text-xs ${rightAlignedColumns[idx] ? 'text-right' : 'text-left'} ${idx === 0 ? 'pl-4' : idx === headers.length - 1 ? 'pr-4' : ''}`}>
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
                      p-3 text-slate-700
                      ${cellIndex === 0 ? 'pl-4' : cellIndex === row.length - 1 ? 'pr-4' : ''}
                      ${rightAlignedColumns[cellIndex] ? 'text-right' : 'text-left'}
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
          <div key={index} className="rounded-xl border border-slate-100 bg-white p-3.5 shadow space-y-2 text-xs">
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
  return <SharedKpiCard className={className} icon={icon} label={label} tone={tone} value={value} />
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
    <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-bold text-slate-900 font-mono">{value}</div>
    </div>
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
  const [expanded, setExpanded] = useState(false)
  const hasMore = rows.length > 5
  const visibleRows = rows.slice(0, expanded ? 10 : 5)

  return (
    <div className="overflow-hidden rounded-md bg-white border border-slate-100 shadow">
      <div className="border-b border-slate-100 bg-orange-50 p-3 font-bold text-orange-700">{title}</div>
      <table className="ns-table w-full text-sm">
        <tbody>
          {visibleRows.map((row, index) => (
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
      {hasMore ? (
        <button
          className="h-9 w-full border-t border-slate-100 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-50"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'ย่อเหลือ 5 รายการ' : 'ดูครบ 10 รายการ'}
        </button>
      ) : null}
    </div>
  )
}

function YearCompare({ rows }: { rows: ProductTrackingRow[] }) {
  const [mode, setMode] = useState<ProductYearCompareMode>('buyQty')
  const [sortKey, setSortKey] = useState<ProductYearCompareColumnKey | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const columnResize = useResizableColumns('tracking.product.year-compare.v1', productYearCompareColumns)

  const monthValue = useCallback((row: ProductTrackingRow, monthIdx: number) => {
    const val = row.monthlyData?.[monthIdx]
    return (
      mode === 'buyQty' ? (val?.qty ?? 0) :
      mode === 'buyAmount' ? (val?.buyAmount ?? 0) :
      mode === 'sellQty' ? (val?.sellQty ?? 0) :
      (val?.salesAmount ?? 0)
    )
  }, [mode])

  const rowTotal = useCallback((row: ProductTrackingRow) => (row.monthlyData ?? []).reduce((sum, val) => {
    return sum + (
      mode === 'buyQty' ? val.qty :
      mode === 'buyAmount' ? val.buyAmount :
      mode === 'sellQty' ? val.sellQty :
      val.salesAmount
    )
  }, 0), [mode])

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (!sortKey) return result

    result.sort((left, right) => {
      const valueA = sortKey === 'product' ? (left.name ?? left.productName ?? '') : sortKey === 'total' ? rowTotal(left) : monthValue(left, Number(sortKey.slice(1)) - 1)
      const valueB = sortKey === 'product' ? (right.name ?? right.productName ?? '') : sortKey === 'total' ? rowTotal(right) : monthValue(right, Number(sortKey.slice(1)) - 1)

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return sortDirection === 'asc' ? valueA - valueB : valueB - valueA
      }

      return sortDirection === 'asc'
        ? String(valueA).localeCompare(String(valueB), 'th', { numeric: true })
        : String(valueB).localeCompare(String(valueA), 'th', { numeric: true })
    })
    return result
  }, [monthValue, rowTotal, rows, sortDirection, sortKey])

  const monthlyTotals = Array.from({ length: 12 }, (_, monthIdx) => rows.reduce((sum, row) => sum + monthValue(row, monthIdx), 0))
  const grandTotal = monthlyTotals.reduce((sum, val) => sum + val, 0)

  const handleSort = (key: ProductYearCompareColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">แสดงผล:</span>
        <Tabs value={mode} onValueChange={(value) => setMode(value as ProductYearCompareMode)} className="gap-0">
          <TabsList variant="line" className="flex-wrap overflow-x-auto">
            <TabsTrigger variant="line" value="buyQty">ซื้อ กก.</TabsTrigger>
            <TabsTrigger variant="line" value="buyAmount">ยอดซื้อ</TabsTrigger>
            <TabsTrigger variant="line" value="sellQty">ขาย กก.</TabsTrigger>
            <TabsTrigger variant="line" value="salesAmount">ยอดขาย</TabsTrigger>
          </TabsList>
        </Tabs>
        {columnResize.hasCustomWidths ? (
          <button
            className="ml-auto hidden h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 outline-none focus:ring-0 lg:inline-flex"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {productYearCompareColumns.map((column) => (
              <col
                key={column.key}
                style={columnResize.getColumnStyle(column.key)}
              />
            ))}
          </colgroup>
          <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} sortKey="product" onSort={handleSort} />
              {monthLabels.map((label, index) => {
                const key = `m${months[index]}` as ProductYearCompareColumnKey
                return (
                  <ResizableTableHead key={key} activeSortKey={sortKey} align="right" direction={sortDirection} label={label} resizeProps={columnResize.getResizeHandleProps(key, label)} sortKey={key} onSort={handleSort} />
                )
              })}
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="รวม" resizeProps={columnResize.getResizeHandleProps('total', 'รวม')} sortKey="total" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {sortedRows.map((row) => {
              const total = rowTotal(row)

              return (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 pl-4 font-medium text-slate-800 min-w-0 overflow-hidden">
                    <div className="truncate" title={row.name ?? row.productName}>{row.name ?? row.productName}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5 truncate" title={row.code}>{row.code || '-'}</div>
                  </td>
                  {Array.from({ length: 12 }).map((_, monthIdx) => {
                    const val = monthValue(row, monthIdx)
                    return (
                      <td key={monthIdx} className="p-3 text-right font-mono text-xs whitespace-nowrap tabular-nums">
                        {val > 0 ? formatMoney(val) : '-'}
                      </td>
                    )
                  })}
                  <td className="p-3 pr-4 text-right font-mono font-semibold text-xs text-slate-900 whitespace-nowrap tabular-nums">
                    {total > 0 ? formatMoney(total) : '-'}
                  </td>
                </tr>
              )
            })}

            <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
              <td className="p-3 pl-4 text-slate-800">ยอดรวมทั้งหมด</td>
              {monthlyTotals.map((val, idx) => (
                <td key={idx} className="p-3 text-right font-mono text-xs whitespace-nowrap tabular-nums">
                  {val > 0 ? formatMoney(val) : '-'}
                </td>
              ))}
              <td className="p-3 pr-4 text-right font-mono text-xs text-slate-900 whitespace-nowrap tabular-nums">
                {grandTotal > 0 ? formatMoney(grandTotal) : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-3 lg:hidden">
        {sortedRows.map((row) => {
          const total = rowTotal(row)
          return (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm text-xs">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">{row.name ?? row.productName}</div>
                  <div className="truncate font-mono text-slate-400">{row.code || '-'}</div>
                </div>
                <div className="shrink-0 text-right font-mono font-bold text-slate-900">{total > 0 ? formatMoney(total) : '-'}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {monthLabels.map((label, monthIdx) => {
                  const val = monthValue(row, monthIdx)
                  return (
                    <div key={label} className="rounded-md bg-slate-50 p-2 text-right">
                      <div className="font-semibold text-slate-500">{label}</div>
                      <div className="font-mono font-semibold text-slate-800">{val > 0 ? formatMoney(val) : '-'}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {sortedRows.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-400 shadow-sm">ไม่มีข้อมูลรายปี</div> : null}
      </div>
    </div>
  )
}
