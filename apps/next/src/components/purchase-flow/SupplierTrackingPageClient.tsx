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
import { Select } from '@/components/ui/Select'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { TrackingPagination, trackingPageSizeOptions } from '@/components/tracking/TrackingPagination'
import { trackingCurrentYear, trackingScopeYear, trackingYearEnd, trackingYearStart } from '@/components/tracking/trackingDateRange'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'



type SupplierTrackingColumnKey =
  | 'code'
  | 'supplierName'
  | 'billCount'
  | 'qty'
  | 'purchaseAmount'
  | 'avgBuy'
  | 'paidAmount'
  | 'payable'
  | 'overdueApAmount'
  | 'paidPct'

type SupplierProductBreakdownColumnKey = 'productName' | 'suppliers' | 'billCount' | 'qty' | 'amount' | 'avgBuy'
type SupplierYearCompareColumnKey =
  | 'supplierName'
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

const trackingColumns: Array<ResizableColumnDefinition<SupplierTrackingColumnKey>> = [
  { key: 'code', defaultWidth: 90, minWidth: 80 },
  { key: 'supplierName', defaultWidth: 180, minWidth: 140 },
  { key: 'billCount', defaultWidth: 70, minWidth: 60 },
  { key: 'qty', defaultWidth: 110, minWidth: 90 },
  { key: 'purchaseAmount', defaultWidth: 120, minWidth: 100 },
  { key: 'avgBuy', defaultWidth: 100, minWidth: 85 },
  { key: 'paidAmount', defaultWidth: 120, minWidth: 100 },
  { key: 'payable', defaultWidth: 120, minWidth: 100 },
  { key: 'overdueApAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'paidPct', defaultWidth: 80, minWidth: 70 },
]

const productBreakdownColumns: Array<ResizableColumnDefinition<SupplierProductBreakdownColumnKey>> = [
  { key: 'productName', defaultWidth: 260, minWidth: 180 },
  { key: 'suppliers', defaultWidth: 115, minWidth: 95 },
  { key: 'billCount', defaultWidth: 100, minWidth: 85 },
  { key: 'qty', defaultWidth: 140, minWidth: 115 },
  { key: 'amount', defaultWidth: 150, minWidth: 125 },
  { key: 'avgBuy', defaultWidth: 130, minWidth: 110 },
]

type SupplierTrackingRow = {
  agingBuckets: Array<{ amount: number; bucket: string; count: number }>
  avgBuy: number
  billCount: number
  code: string
  deliveryCompletionPct: number
  deductionPct: number
  gradeAdjustmentCount: number
  id: string
  oldestApAgeDays: number
  overdueApAmount: number
  overdueApBillCount: number
  paidAmount: number
  paidPct: number
  payable: number
  paymentCount: number
  purchaseAmount: number
  qty: number
  supplierName: string
  wtiCount: number
  monthlyData?: Array<{ qty: number; purchaseAmount: number }>
}

type SupplierTrackingPayload = {
  byProduct: Array<{ amount: number; avgBuy: number; billCount: number; productName: string; qty: number; suppliers: number }>
  detail?: SupplierTrackingDetail | null
  filters?: {
    suppliers: Array<{ active: boolean | null; code: string | null; id: string; name: string }>
    productCategories: string[]
    products: Array<{ category: string | null; code: string | null; id: string; name: string }>
  }
  monthly: Array<{ amount: number; month: string; qty: number }>
  rows: SupplierTrackingRow[]
  summary: { paidAmount: number; payable: number; purchaseAmount: number; qty: number; suppliers: number }
  year: string
}

type SupplierTrackingDetail = {
  bills: Array<{ ageBucket: string; ageDays: number; amount: number; avgBuy: number; date: string; docNo: string; dueDate: string; href: string; paidAmount: number; payable: number; qty: number; referenceDateType: string; status: string }>
  gradeAdjustments: Array<{ date: string; docNo: string; href: string; qtyDiff: number; reason: string; status: string; valueDiff: number }>
  monthly: Array<{ billCount: number; month: string; paidAmount: number; payable: number; paymentCount: number; purchaseAmount: number; qty: number }>
  payments: Array<{ amount: number; date: string; docNo: string; href: string; method: string; netAmount: number; status: string }>
  products: Array<{ amount: number; avgBuy: number; billCount: number; productName: string; qty: number }>
  qualitySignals: {
    agingBuckets: Array<{ amount: number; bucket: string; count: number }>
    deliveryCompletionPct: number
    deductionPct: number
    gradeAdjustmentCount: number
    oldestApAgeDays: number
    overdueApAmount: number
    overdueApBillCount: number
    paymentReliabilityPct: number
    returnSignalStatus: string
    wtiCount: number
  }
  supplier: { code: string; id: string; name: string }
  weightTickets: Array<{ billedWeight: number; date: string; deductWeight: number; docNo: string; grossWeight: number; href: string; netWeight: number; remainingWeight: number; status: string }>
}

type DetailCell = string | { href: string; label: string }

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const supplierYearCompareColumns: Array<ResizableColumnDefinition<SupplierYearCompareColumnKey>> = [
  { key: 'supplierName', defaultWidth: 220, minWidth: 160 },
  ...months.map((month) => ({ key: `m${month}` as SupplierYearCompareColumnKey, defaultWidth: 110, minWidth: 90 })),
  { key: 'total', defaultWidth: 130, minWidth: 110 },
]

export function SupplierTrackingPageClient() {
  const currentYear = trackingCurrentYear()
  const [data, setData] = useState<SupplierTrackingPayload | null>(null)
  const [detail, setDetail] = useState<SupplierTrackingDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(trackingYearStart(currentYear))
  const [dateTo, setDateTo] = useState(trackingYearEnd(currentYear))
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [productCategory, setProductCategory] = useState('')
  const [productId, setProductId] = useState('')
  const [view, setView] = useState<'list' | 'productBreakdown' | 'top10' | 'yearCompare'>('list')
  const [sortKey, setSortKey] = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof trackingPageSizeOptions)[number]>(10)
  const [productPage, setProductPage] = useState(1)
  const [productPageSize, setProductPageSize] = useState<(typeof trackingPageSizeOptions)[number]>(10)
  const [productSortKey, setProductSortKey] = useState<SupplierProductBreakdownColumnKey | undefined>(undefined)
  const [productSortDirection, setProductSortDirection] = useState<'asc' | 'desc'>('asc')
  const scopeYear = trackingScopeYear(dateFrom)

  const columnResize = useResizableColumns('tracking.supplier.main.v6', trackingColumns)
  const productBreakdownResize = useResizableColumns('tracking.supplier.product-breakdown.v1', productBreakdownColumns)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleProductSort = (key: SupplierProductBreakdownColumnKey) => {
    if (productSortKey === key) {
      setProductSortDirection(productSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setProductSortKey(key)
      setProductSortDirection('asc')
    }
  }

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year: scopeYear })
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (supplierId) params.set('supplierId', supplierId)
    if (productCategory) params.set('productCategory', productCategory)
    if (productId) params.set('productId', productId)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [dateFrom, dateTo, productCategory, productId, scopeYear, search, supplierId])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<SupplierTrackingPayload>(`/api/tracking/supplier?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลติดตามผู้ขายไม่ได้')
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

  useEffect(() => {
    setProductPage(1)
  }, [productSortDirection, productSortKey, queryString, view])

  const openDetail = useCallback(async (row: SupplierTrackingRow) => {
    setIsDetailLoading(true)
    setDetail({
      bills: [],
      gradeAdjustments: [],
      monthly: [],
      payments: [],
      products: [],
      qualitySignals: {
        agingBuckets: row.agingBuckets,
        deliveryCompletionPct: row.deliveryCompletionPct,
        deductionPct: row.deductionPct,
        gradeAdjustmentCount: row.gradeAdjustmentCount,
        oldestApAgeDays: row.oldestApAgeDays,
        overdueApAmount: row.overdueApAmount,
        overdueApBillCount: row.overdueApBillCount,
        paymentReliabilityPct: row.paidPct,
        returnSignalStatus: 'ยังไม่มี purchase return source table ใน schema ปัจจุบัน',
        wtiCount: row.wtiCount,
      },
      supplier: { code: row.code, id: row.id, name: row.supplierName },
      weightTickets: [],
    })
    try {
      const params = new URLSearchParams(queryString)
      params.set('detailId', row.id)
      const payload = await dailyFetchJson<SupplierTrackingPayload>(`/api/tracking/supplier?${params.toString()}`)
      setDetail(payload.detail ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดผู้ขายไม่ได้')
      setDetail(null)
    } finally {
      setIsDetailLoading(false)
    }
  }, [queryString, setDetail])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const productRows = useMemo(() => data?.byProduct ?? [], [data?.byProduct])

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey as keyof SupplierTrackingRow]
        const valB = b[sortKey as keyof SupplierTrackingRow]

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

  const sortedProductRows = useMemo(() => {
    const result = [...productRows]
    if (productSortKey) {
      result.sort((a, b) => {
        const valA = a[productSortKey]
        const valB = b[productSortKey]

        if (typeof valA === 'number' && typeof valB === 'number') {
          return productSortDirection === 'asc' ? valA - valB : valB - valA
        }

        return productSortDirection === 'asc'
          ? String(valA).localeCompare(String(valB), 'th', { numeric: true })
          : String(valB).localeCompare(String(valA), 'th', { numeric: true })
      })
    }
    return result
  }, [productRows, productSortDirection, productSortKey])

  const productTotalRows = sortedProductRows.length
  const productTotalPages = Math.max(1, Math.ceil(productTotalRows / productPageSize))
  const currentProductPage = Math.min(productPage, productTotalPages)
  const displayedProductRows = useMemo(() => {
    const start = (currentProductPage - 1) * productPageSize
    return sortedProductRows.slice(start, start + productPageSize)
  }, [currentProductPage, productPageSize, sortedProductRows])

  const topPurchase = [...rows].sort((left, right) => right.purchaseAmount - left.purchaseAmount).slice(0, 10)
  const topQty = [...rows].sort((left, right) => right.qty - left.qty).slice(0, 10)
  const cheapest = [...rows].filter((row) => row.avgBuy > 0).sort((left, right) => left.avgBuy - right.avgBuy).slice(0, 10)
  const expensive = [...rows].filter((row) => row.avgBuy > 0).sort((left, right) => right.avgBuy - left.avgBuy).slice(0, 10)
  const topPayable = [...rows].sort((left, right) => right.payable - left.payable).slice(0, 10)
  const supplierSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters?.suppliers ?? []).map((supplier) => ({
      id: supplier.id,
      label: supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name,
    }))
  }, [data?.filters?.suppliers])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    let list = data?.filters?.products ?? []
    if (productCategory) {
      list = list.filter((p) => p.category === productCategory)
    }
    return list.map((product) => ({
      id: product.id,
      label: product.code ? `${product.code} - ${product.name}` : product.name,
    }))
  }, [data?.filters?.products, productCategory])

  const exportHref = `/api/tracking/supplier?${queryString}&format=xlsx`
  const defaultDateFrom = trackingYearStart(currentYear)
  const defaultDateTo = trackingYearEnd(currentYear)
  const hasActiveFilters = Boolean(search || productCategory || productId || supplierId || dateFrom !== defaultDateFrom || dateTo !== defaultDateTo)
  const resetFilters = () => {
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
    setProductCategory('')
    setProductId('')
    setSupplierId('')
    setSearch('')
  }

  return (
    <section className="space-y-4">
      <PageTitleOverride
        title="ติดตามผู้ขาย 360°"
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-4">
        <SummaryCard icon="⚖️" label="น้ำหนัก" tone="indigo" value={`${formatMoney(data?.summary.qty ?? 0)} กก.`} />
        <SummaryCard icon="💰" label="ยอดซื้อ" tone="blue" value={formatMoney(data?.summary.purchaseAmount ?? 0)} />
        <SummaryCard icon="✅" label="จ่ายแล้ว" tone="emerald" value={formatMoney(data?.summary.paidAmount ?? 0)} />
        <SummaryCard icon="🏦" label="เจ้าหนี้ค้าง" tone="red" value={formatMoney(data?.summary.payable ?? 0)} />
      </div>

      <Tabs className="min-w-0" value={view} onValueChange={(value) => setView(value as 'list' | 'productBreakdown' | 'top10' | 'yearCompare')}>
        <TabsList className="w-full min-w-0 overflow-x-auto" variant="line">
          <TabsTrigger value="list" variant="line">รายการ</TabsTrigger>
          <TabsTrigger value="productBreakdown" variant="line">สรุปตามสินค้า</TabsTrigger>
          <TabsTrigger value="top10" variant="line">10 อันดับแรก</TabsTrigger>
          <TabsTrigger value="yearCompare" variant="line">รายปี</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="hidden space-y-2 lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                autoComplete="off"
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                placeholder="ค้นหาผู้ขาย"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400">→</span>
            <DatePickerInput value={dateTo} onChange={setDateTo} />
            <Select
              className="h-9 w-[10rem] rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={productCategory}
              onChange={(event) => { setProductCategory(event.target.value); setProductId('') }}
            >
              <option value="">ทุกหมวด</option>
              {(data?.filters?.productCategories ?? []).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
            <div className="min-w-[190px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm"
                inputId="tracking-supplier-filter-product"
                label="สินค้า"
                options={productSearchOptions}
                placeholder="เลือกสินค้า"
                value={productId}
                onChange={setProductId}
              />
            </div>
            <div className="min-w-[190px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm"
                inputId="tracking-supplier-filter-supplier"
                label="ผู้ขาย"
                options={supplierSearchOptions}
                placeholder="เลือกผู้ขาย"
                value={supplierId}
                onChange={setSupplierId}
              />
            </div>
            <button className="h-9 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60" disabled={!hasActiveFilters} type="button" onClick={resetFilters}>ล้างตัวกรอง</button>
          </div>
        </div>

        <div className="block space-y-2 lg:hidden">
          <div className="flex gap-2">
            <input
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
              placeholder="ค้นหาผู้ขาย..."
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
              title="ตัวกรองติดตามผู้ขาย"
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
                <label className="text-xs font-semibold text-slate-500">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={dateFrom} onChange={setDateFrom} />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={dateTo} onChange={setDateTo} />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-500">
                หมวดสินค้า
                <Select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={productCategory}
                  onChange={(event) => { setProductCategory(event.target.value); setProductId('') }}
                >
                  <option value="">ทุกหมวด</option>
                  {(data?.filters?.productCategories ?? []).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </Select>
              </label>
              <SearchCombobox inputClassName="h-9 text-sm" inputId="tracking-supplier-mobile-product" label="สินค้า" options={productSearchOptions} placeholder="เลือกสินค้า" value={productId} onChange={setProductId} />
              <SearchCombobox inputClassName="h-9 text-sm" inputId="tracking-supplier-mobile-supplier" label="ผู้ขาย" options={supplierSearchOptions} placeholder="เลือกผู้ขาย" value={supplierId} onChange={setSupplierId} />
            </MobileFilterSheet>
          )}
        </div>

        <div className="mt-3 hidden items-center justify-end gap-2 lg:flex">
          <a
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-center text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
            href={exportHref}
          >
            <Download aria-hidden="true" className="size-4" />
            <span>ส่งออก Excel</span>
          </a>
        </div>
      </div>

      {view === 'list' && columnResize.hasCustomWidths && (
        <div className="hidden justify-end lg:flex">
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 outline-none focus:ring-0"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        </div>
      )}

      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel rows={topPurchase.map((row) => ({ label: row.supplierName, value: row.purchaseAmount }))} title="ยอดซื้อสูงสุด 10 อันดับ" />
          <TopPanel rows={topQty.map((row) => ({ label: row.supplierName, value: row.qty }))} title="น้ำหนักสูงสุด 10 อันดับ" />
          <TopPanel rows={cheapest.map((row) => ({ label: row.supplierName, value: row.avgBuy }))} title="ราคาต่ำสุด 10 อันดับ" />
          <TopPanel rows={expensive.map((row) => ({ label: row.supplierName, value: row.avgBuy }))} title="ราคาสูงสุด 10 อันดับ" />
          <TopPanel rows={topPayable.map((row) => ({ label: row.supplierName, value: row.payable }))} title="เจ้าหนี้คงค้างสูงสุด 10 อันดับ" />
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
          {/* Mobile Card list for main tracking list */}
          <div className="block lg:hidden space-y-3 mb-4">
            {isLoading ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-100">กำลังโหลดข้อมูล</div>
            ) : null}

            {!isLoading && pagedRows.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-2" role="button" tabIndex={0} onClick={() => void openDetail(row)} onKeyDown={(event) => { if (event.key === 'Enter') void openDetail(row) }}>
                <div className="flex justify-between items-start">
                  <span className="font-bold text-slate-800 text-sm">{row.supplierName}</span>
                  <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{row.code || '-'}</span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="font-semibold text-slate-500 block">บิล: </span>
                      <span className="text-slate-800">{row.billCount} ใบ</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block">น้ำหนัก: </span>
                      <span className="text-slate-800 font-semibold">{formatMoney(row.qty)} กก.</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block">เฉลี่ย/กก: </span>
                      <span className="text-slate-800">{formatMoney(row.avgBuy)} บาท</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60 mt-1">
                    <div>
                      <span className="font-semibold text-slate-400 block">ยอดซื้อ: </span>
                      <span className="text-blue-700 font-bold tabular-nums">{formatMoney(row.purchaseAmount)} บาท</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block">ค้างจ่าย: </span>
                      <span className="text-red-700 font-bold tabular-nums">{formatMoney(row.payable)} ({row.paidPct.toFixed(0)}% จ่าย)</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60 mt-1">
                    <div className="col-span-2">
                      <span className="font-semibold text-slate-400">เกินกำหนด: </span>
                      <span className="text-red-700 font-semibold">{formatMoney(row.overdueApAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {!isLoading && sortedRows.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-100">
                ไม่มีข้อมูลติดตามผู้ขาย
              </div>
            ) : null}
          </div>

          <div className="hidden lg:block overflow-x-auto rounded-md bg-white border border-slate-200 shadow-sm mb-4">
            <table className="ns-table w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {trackingColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                <tr>
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="left"
                    direction={sortDirection}
                    label="รหัส"
                    resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')}
                    sortKey="code"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="left"
                    direction={sortDirection}
                    label="ผู้ขาย"
                    resizeProps={columnResize.getResizeHandleProps('supplierName', 'ผู้ขาย')}
                    sortKey="supplierName"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="บิล"
                    resizeProps={columnResize.getResizeHandleProps('billCount', 'บิล')}
                    sortKey="billCount"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="น้ำหนัก"
                    resizeProps={columnResize.getResizeHandleProps('qty', 'น้ำหนัก')}
                    sortKey="qty"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="ยอดซื้อ"
                    resizeProps={columnResize.getResizeHandleProps('purchaseAmount', 'ยอดซื้อ')}
                    sortKey="purchaseAmount"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="ราคาเฉลี่ย"
                    resizeProps={columnResize.getResizeHandleProps('avgBuy', 'ราคาเฉลี่ย')}
                    sortKey="avgBuy"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="จ่ายแล้ว"
                    resizeProps={columnResize.getResizeHandleProps('paidAmount', 'จ่ายแล้ว')}
                    sortKey="paidAmount"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="ค้างจ่าย"
                    resizeProps={columnResize.getResizeHandleProps('payable', 'ค้างจ่าย')}
                    sortKey="payable"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="เกินกำหนด"
                    resizeProps={columnResize.getResizeHandleProps('overdueApAmount', 'เกินกำหนด')}
                    sortKey="overdueApAmount"
                    onSort={handleSort}
                  />
                  <ResizableTableHead
                    activeSortKey={sortKey}
                    align="right"
                    direction={sortDirection}
                    label="% จ่าย"
                    resizeProps={columnResize.getResizeHandleProps('paidPct', '% จ่าย')}
                    sortKey="paidPct"
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={10}>ไม่มีข้อมูลติดตามผู้ขาย</td></tr> : null}
                {!isLoading && pagedRows.map((row) => (
                  <tr key={row.id} className="cursor-pointer border-t hover:bg-slate-50/80 transition-colors" onClick={() => void openDetail(row)}>
                    <td className="p-2 font-mono text-xs text-slate-500 min-w-0 overflow-hidden"><div className="truncate" title={row.code || ''}>{row.code || '-'}</div></td>
                    <td className="p-2 font-medium min-w-0 overflow-hidden"><div className="truncate" title={row.supplierName || ''}>{row.supplierName}</div></td>
                    <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{row.billCount}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap pl-4">{formatMoney(row.qty)}</td>
                    <td className="p-2 text-right font-semibold text-blue-700 tabular-nums whitespace-nowrap pl-4">{formatMoney(row.purchaseAmount)}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap pl-4">{formatMoney(row.avgBuy)}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap pl-4">{formatMoney(row.paidAmount)}</td>
                    <td className="p-2 text-right text-red-700 tabular-nums whitespace-nowrap pl-4">{formatMoney(row.payable)}</td>
                    <td className="p-2 text-right text-red-700 tabular-nums whitespace-nowrap pl-4">{formatMoney(row.overdueApAmount)}</td>
                    <td className="p-2 pr-4 text-right tabular-nums whitespace-nowrap pl-4">{row.paidPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {view === 'productBreakdown' ? (
        <>
          <TrackingPagination
            currentPage={currentProductPage}
            isLoading={isLoading}
            pageSize={productPageSize}
            totalPages={productTotalPages}
            totalRows={productTotalRows}
            onPageChange={setProductPage}
            onPageSizeChange={setProductPageSize}
          />

          {/* Mobile Card list for Product breakdown */}
          <div className="block lg:hidden space-y-3">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 rounded-t-md">สรุปตามสินค้าจากบิลรับซื้อ (มือถือ)</div>
            {displayedProductRows.map((row) => (
              <div key={row.productName} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-2">
                <span className="font-bold text-slate-800 text-sm block">{row.productName}</span>

                <div className="text-xs text-slate-600 grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="font-semibold text-slate-500">คู่ค้า / บิล: </span>
                    <span className="text-slate-800">{row.suppliers} ราย / {row.billCount} ใบ</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">ราคาเฉลี่ย: </span>
                    <span className="text-slate-800 font-semibold">{formatMoney(row.avgBuy)} บาท</span>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60">
                    <div>
                      <span className="font-semibold text-slate-400 block">น้ำหนักรวม: </span>
                      <span className="text-slate-800 tabular-nums">{formatMoney(row.qty)} กก.</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400 block">ยอดซื้อรวม: </span>
                      <span className="text-slate-900 font-bold tabular-nums">{formatMoney(row.amount)} บาท</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!isLoading && productRows.length === 0 ? (
              <div className="rounded-xl bg-white p-6 text-center text-xs text-slate-400 shadow-sm border border-slate-100">
                ไม่มีรายละเอียดสินค้าในสรุปตามสินค้า
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <span>สรุปตามสินค้าจากบิลรับซื้อ</span>
              {productBreakdownResize.hasCustomWidths ? (
                <button
                  className="hidden h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 outline-none focus:ring-0 lg:inline-flex"
                  type="button"
                  onClick={productBreakdownResize.resetColumnWidths}
                >
                  คืนค่าเดิมตาราง
                </button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: productBreakdownResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {productBreakdownColumns.map((column) => (
                    <col
                      key={column.key}
                      style={productBreakdownResize.getColumnStyle(column.key)}
                    />
                  ))}
                </colgroup>
                <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <tr>
                    <ResizableTableHead activeSortKey={productSortKey} direction={productSortDirection} label="สินค้า" resizeProps={productBreakdownResize.getResizeHandleProps('productName', 'สินค้า')} sortKey="productName" onSort={handleProductSort} />
                    <ResizableTableHead activeSortKey={productSortKey} align="right" direction={productSortDirection} label="ผู้ขาย" resizeProps={productBreakdownResize.getResizeHandleProps('suppliers', 'ผู้ขาย')} sortKey="suppliers" onSort={handleProductSort} />
                    <ResizableTableHead activeSortKey={productSortKey} align="right" direction={productSortDirection} label="บิล" resizeProps={productBreakdownResize.getResizeHandleProps('billCount', 'บิล')} sortKey="billCount" onSort={handleProductSort} />
                    <ResizableTableHead activeSortKey={productSortKey} align="right" direction={productSortDirection} label="น้ำหนัก" resizeProps={productBreakdownResize.getResizeHandleProps('qty', 'น้ำหนัก')} sortKey="qty" onSort={handleProductSort} />
                    <ResizableTableHead activeSortKey={productSortKey} align="right" direction={productSortDirection} label="ยอดซื้อ" resizeProps={productBreakdownResize.getResizeHandleProps('amount', 'ยอดซื้อ')} sortKey="amount" onSort={handleProductSort} />
                    <ResizableTableHead activeSortKey={productSortKey} align="right" direction={productSortDirection} label="ราคาเฉลี่ย" resizeProps={productBreakdownResize.getResizeHandleProps('avgBuy', 'ราคาเฉลี่ย')} sortKey="avgBuy" onSort={handleProductSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedProductRows.map((row) => (
                    <tr key={row.productName} className="hover:bg-slate-50">
                      <td className="p-2 font-medium min-w-0 overflow-hidden"><div className="truncate" title={row.productName || ''}>{row.productName}</div></td>
                      <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{row.suppliers}</td>
                      <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{row.billCount}</td>
                      <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{formatMoney(row.qty)}</td>
                      <td className="p-2 text-right font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.amount)}</td>
                      <td className="p-2 pr-4 text-right whitespace-nowrap tabular-nums pl-4">{formatMoney(row.avgBuy)}</td>
                    </tr>
                  ))}
                  {!isLoading && productRows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={productBreakdownColumns.length}>ไม่มีรายละเอียดสินค้าในสรุปตามสินค้า</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
      <SupplierDetailDialog detail={detail} isLoading={isDetailLoading} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </section>
  )
}

function SupplierDetailDialog({ detail, isLoading, onOpenChange }: { detail: SupplierTrackingDetail | null; isLoading: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden rounded-md border-0 bg-slate-900 !p-0 shadow-2xl outline-none focus:outline-none flex flex-col" fallbackTitle="รายละเอียดการติดตามผู้ขาย" hideClose>
        <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-5 py-4 text-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate text-xl font-bold text-white">{detail?.supplier.name ?? 'รายละเอียดผู้ขาย'}</DialogTitle>
              <DialogDescription className="truncate text-xs text-slate-300">{detail?.supplier.code ?? ''} · บิลซื้อ / จ่ายเงิน / WTI / ปรับเกรด / สัดส่วนสินค้า</DialogDescription>
            </div>
            <Button className="h-9 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
          </div>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm sm:p-5">
          {isLoading ? <div className="rounded-xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500">กำลังโหลดรายละเอียด</div> : null}
          {!isLoading && detail ? (
            <>
              <DetailSection title="สัญญาณความน่าเชื่อถือและคุณภาพ">
                <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-3">
                  <SignalMetric label="ส่งครบจาก WTI" value={`${detail.qualitySignals.deliveryCompletionPct.toFixed(1)}%`} />
                  <SignalMetric label="หักน้ำหนัก" value={`${detail.qualitySignals.deductionPct.toFixed(1)}%`} />
                  <SignalMetric label="จ่ายดี" value={`${detail.qualitySignals.paymentReliabilityPct.toFixed(1)}%`} />
                  <SignalMetric label="AP เกินกำหนด" value={formatMoney(detail.qualitySignals.overdueApAmount)} />
                  <SignalMetric label="บิลเกินกำหนด" value={`${detail.qualitySignals.overdueApBillCount} บิล`} />
                  <SignalMetric label="เก่าสุด" value={`${detail.qualitySignals.oldestApAgeDays} วัน`} />
                  <SignalMetric label="WTI" value={`${detail.qualitySignals.wtiCount} ใบ`} />
                  <SignalMetric label="ปรับเกรด" value={`${detail.qualitySignals.gradeAdjustmentCount} รายการ`} />
                  <SignalMetric label="ส่งคืน" value={detail.qualitySignals.returnSignalStatus} />
                </div>
              </DetailSection>
              <DetailSection title="อายุเจ้าหนี้คงค้าง">
                <SimpleTable
                  headers={['กลุ่มอายุ', 'บิล', 'ยอดค้าง']}
                  rows={detail.qualitySignals.agingBuckets.map((row) => [row.bucket, String(row.count), formatMoney(row.amount)])}
                />
              </DetailSection>
              <DetailSection title="บิลซื้อ">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'ครบกำหนด', 'กลุ่มอายุ', 'อายุ', 'น้ำหนัก', 'ยอดซื้อ', 'ราคาเฉลี่ย', 'จ่ายแล้ว', 'ค้างจ่าย', 'สถานะ']}
                  rows={detail.bills.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, formatDateDisplay(row.dueDate), row.ageBucket, `${row.ageDays} วัน`, formatMoney(row.qty), formatMoney(row.amount), formatMoney(row.avgBuy), formatMoney(row.paidAmount), formatMoney(row.payable), row.status])}
                />
              </DetailSection>
              <DetailSection title="การจ่ายเงิน">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'วิธีจ่าย', 'ยอดจ่าย', 'สุทธิ', 'สถานะ']}
                  rows={detail.payments.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, row.method, formatMoney(row.amount), formatMoney(row.netAmount), row.status])}
                />
              </DetailSection>
              <DetailSection title="แนวโน้มการซื้อและจ่ายเงินรายเดือน">
                <SimpleTable
                  headers={['เดือน', 'บิล', 'จ่าย', 'น้ำหนัก', 'ยอดซื้อ', 'จ่ายแล้ว', 'ค้างจ่าย']}
                  rows={detail.monthly.map((row, index) => [monthLabels[index] ?? row.month, String(row.billCount), String(row.paymentCount), formatMoney(row.qty), formatMoney(row.purchaseAmount), formatMoney(row.paidAmount), formatMoney(row.payable)])}
                />
              </DetailSection>
              <DetailSection title="WTI / การรับสินค้า">
                <SimpleTable
                  headers={['วันที่', 'WTI', 'น้ำหนักสุทธิ', 'ชั่งบิลแล้ว', 'คงเหลือ', 'หักน้ำหนัก', 'สถานะ']}
                  rows={detail.weightTickets.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, formatMoney(row.netWeight), formatMoney(row.billedWeight), formatMoney(row.remainingWeight), formatMoney(row.deductWeight), row.status])}
                />
              </DetailSection>
              <DetailSection title="ปรับเกรด">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'จำนวนต่าง', 'มูลค่าต่าง', 'เหตุผล', 'สถานะ']}
                  rows={detail.gradeAdjustments.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, formatMoney(row.qtyDiff), formatMoney(row.valueDiff), row.reason, row.status])}
                />
              </DetailSection>
              <DetailSection title="สัดส่วนสินค้า">
                <SimpleTable
                  headers={['สินค้า', 'บิล', 'น้ำหนัก', 'ยอดซื้อ', 'ราคาเฉลี่ย']}
                  rows={detail.products.map((row) => [row.productName, String(row.billCount), formatMoney(row.qty), formatMoney(row.amount), formatMoney(row.avgBuy)])}
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
    <section className="rounded-xl border border-slate-200/60 bg-slate-50 overflow-hidden shadow-sm">
      <div className="border-b border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800">{title}</div>
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
              <tr key={index} className="border-t border-slate-100 hover:bg-slate-50/50">
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
        {rows.length === 0 ? <div className="text-center text-xs text-slate-400 py-4 bg-white rounded-xl border border-slate-200">ไม่มีข้อมูล</div> : null}
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2 text-xs">
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

function SummaryCard({ className = '', icon, label, tone, value }: { className?: string; icon: string; label: string; tone: 'blue' | 'emerald' | 'indigo' | 'red'; value: string }) {
  return <SharedKpiCard className={className} icon={icon} label={label} tone={tone} value={value} />
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-bold text-slate-900 font-mono">{value}</div>
    </div>
  )
}

function TopPanel({ rows, title }: { rows: { label: string; value: number }[]; title: string }) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = rows.length > 5
  const visibleRows = rows.slice(0, expanded ? 10 : 5)

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50 p-3 font-bold text-blue-700">{title}</div>
      <table className="ns-table w-full text-sm">
        <tbody>
          {visibleRows.map((row, index) => (
            <tr key={`${title}-${row.label}-${index}`} className="border-t">
              <td className="p-2 font-bold">{index + 1}</td>
              <td className="p-2">{row.label}</td>
              <td className="p-2 text-right font-semibold">{formatMoney(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore ? (
        <button
          className="h-9 w-full border-t border-blue-100 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-50"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'ย่อเหลือ 5 รายการ' : 'ดูครบ 10 รายการ'}
        </button>
      ) : null}
    </div>
  )
}

function YearCompare({ rows }: { rows: SupplierTrackingRow[] }) {
  const [mode, setMode] = useState<'weight' | 'purchase'>('weight')
  const [sortKey, setSortKey] = useState<SupplierYearCompareColumnKey | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const columnResize = useResizableColumns('tracking.supplier.year-compare.v1', supplierYearCompareColumns)

  const monthValue = useCallback((row: SupplierTrackingRow, monthIdx: number) => {
    const val = row.monthlyData?.[monthIdx]
    return mode === 'weight' ? (val?.qty ?? 0) : (val?.purchaseAmount ?? 0)
  }, [mode])
  const rowTotal = useCallback((row: SupplierTrackingRow) => (row.monthlyData ?? []).reduce((sum, val) => sum + (mode === 'weight' ? val.qty : val.purchaseAmount), 0), [mode])

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (!sortKey) return result

    result.sort((a, b) => {
      const valA = sortKey === 'supplierName' ? a.supplierName : sortKey === 'total' ? rowTotal(a) : monthValue(a, Number(sortKey.slice(1)) - 1)
      const valB = sortKey === 'supplierName' ? b.supplierName : sortKey === 'total' ? rowTotal(b) : monthValue(b, Number(sortKey.slice(1)) - 1)

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA
      }

      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB), 'th', { numeric: true })
        : String(valB).localeCompare(String(valA), 'th', { numeric: true })
    })
    return result
  }, [monthValue, rowTotal, rows, sortDirection, sortKey])

  const monthlyTotals = Array.from({ length: 12 }, (_, monthIdx) => rows.reduce((sum, row) => sum + monthValue(row, monthIdx), 0))
  const grandTotal = monthlyTotals.reduce((sum, val) => sum + val, 0)

  const handleSort = (key: SupplierYearCompareColumnKey) => {
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
        <Tabs value={mode} onValueChange={(value) => setMode(value as 'weight' | 'purchase')} className="gap-0">
          <TabsList variant="line" className="flex-wrap overflow-x-auto">
            <TabsTrigger variant="line" value="weight">น้ำหนัก (กก.)</TabsTrigger>
            <TabsTrigger variant="line" value="purchase">ยอดซื้อ (บาท)</TabsTrigger>
          </TabsList>
        </Tabs>
        {columnResize.hasCustomWidths ? (
          <button
            className="ml-auto hidden h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 outline-none focus:ring-0 lg:inline-flex"
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
            {supplierYearCompareColumns.map((column) => (
              <col
                key={column.key}
                style={columnResize.getColumnStyle(column.key)}
              />
            ))}
          </colgroup>
          <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ผู้ขาย" resizeProps={columnResize.getResizeHandleProps('supplierName', 'ผู้ขาย')} sortKey="supplierName" onSort={handleSort} />
              {monthLabels.map((label, index) => {
                const key = `m${months[index]}` as SupplierYearCompareColumnKey
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
                    <div className="truncate" title={row.supplierName}>{row.supplierName}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5 truncate" title={row.code}>{row.code}</div>
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
                  <div className="truncate text-sm font-bold text-slate-900">{row.supplierName}</div>
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
