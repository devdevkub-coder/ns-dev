'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { PageTitleOverride } from '@/components/layout/PageTitleOverride'
import { TrackingPagination, trackingPageSizeOptions } from '@/components/tracking/TrackingPagination'
import { trackingCurrentYear, trackingScopeYear, trackingYearEnd, trackingYearStart } from '@/components/tracking/trackingDateRange'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'

type CustomerTrackingColumnKey =
  | 'code'
  | 'customerName'
  | 'billCount'
  | 'qty'
  | 'revenue'
  | 'avgSell'
  | 'cogs'
  | 'gp'
  | 'gpPct'
  | 'profitPerKg'
  | 'receivedAmount'
  | 'receivable'
  | 'oldestArAgeDays'

const trackingColumns: Array<ResizableColumnDefinition<CustomerTrackingColumnKey>> = [
  { key: 'code', defaultWidth: 90, minWidth: 80 },
  { key: 'customerName', defaultWidth: 180, minWidth: 140 },
  { key: 'billCount', defaultWidth: 70, minWidth: 60 },
  { key: 'qty', defaultWidth: 110, minWidth: 90 },
  { key: 'revenue', defaultWidth: 120, minWidth: 100 },
  { key: 'avgSell', defaultWidth: 100, minWidth: 85 },
  { key: 'cogs', defaultWidth: 120, minWidth: 100 },
  { key: 'gp', defaultWidth: 120, minWidth: 100 },
  { key: 'gpPct', defaultWidth: 80, minWidth: 70 },
  { key: 'profitPerKg', defaultWidth: 90, minWidth: 80 },
  { key: 'receivedAmount', defaultWidth: 120, minWidth: 100 },
  { key: 'receivable', defaultWidth: 120, minWidth: 100 },
  { key: 'oldestArAgeDays', defaultWidth: 115, minWidth: 95 },
]

type CustomerTrackingRow = {
  agingBuckets: Array<{ amount: number; bucket: string; count: number }>
  avgSell: number
  billCount: number
  code: string
  cogs: number
  creditLimit: number
  creditUtilizationPct: number
  customerName: string
  gp: number
  gpPct: number
  id: string
  lowMarginBillCount: number
  negativeMarginBillCount: number
  oldestArAgeDays: number
  overdueArAmount: number
  overdueArBillCount: number
  pendingArBillCount: number
  profitPerKg: number
  qty: number
  receivable: number
  receivedAmount: number
  revenue: number
  monthlyData?: Array<{ qty: number; revenue: number }>
}
type CustomerTrackingPayload = {
  detail?: CustomerTrackingDetail | null
  filters: {
    productCategories: string[]
    products: Array<{ category: string | null; code: string | null; id: string; name: string }>
  }
  monthly: Array<{ gp: number; month: string; qty: number; revenue: number }>
  rows: CustomerTrackingRow[]
  summary: { cogs: number; customers: number; gp: number; qty: number; receivable: number; receivedAmount: number; revenue: number }
  year: string
}

type CustomerTrackingDetail = {
  bills: Array<{ ageBucket: string; ageDays: number; channelName: string; cogs: number; date: string; docNo: string; dueDate: string; gp: number; href: string; qty: number; receivable: number; received: number; referenceDateType: string; revenue: number; status: string }>
  channels: Array<{ billCount: number; channelName: string; cogs: number; gp: number; gpPct: number; qty: number; revenue: number }>
  customer: { code: string; id: string; name: string }
  monthly: Array<{ billCount: number; gp: number; month: string; qty: number; receivable: number; receiptCount: number; receivedAmount: number; revenue: number }>
  products: Array<{ avgSell: number; cogs: number; gp: number; gpPct: number; productName: string; qty: number; revenue: number }>
  receipts: Array<{ amount: number; date: string; docNo: string; href: string; method: string; netAmount: number; status: string }>
  signals: {
    agingBuckets: Array<{ amount: number; bucket: string; count: number }>
    creditLimit: number
    creditUtilizationPct: number
    gpPct: number
    lowMarginBillCount: number
    negativeMarginBillCount: number
    oldestArAgeDays: number
    overdueArAmount: number
    overdueArBillCount: number
    pendingArAmount: number
    pendingArBillCount: number
  }
}

type DetailCell = string | { href: string; label: string }
type CustomerYearCompareColumnKey =
  | 'customer'
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
type CustomerYearCompareMode = 'weight' | 'sales'

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const customerYearCompareColumns: Array<ResizableColumnDefinition<CustomerYearCompareColumnKey>> = [
  { key: 'customer', defaultWidth: 240, minWidth: 170 },
  ...months.map((month) => ({ key: `m${month}` as CustomerYearCompareColumnKey, defaultWidth: 110, minWidth: 90 })),
  { key: 'total', defaultWidth: 130, minWidth: 110 },
]

export function CustomerTrackingPageClient() {
  const currentYear = trackingCurrentYear()
  const [productCategory, setProductCategory] = useState('')
  const [productId, setProductId] = useState('')
  const [data, setData] = useState<CustomerTrackingPayload | null>(null)
  const [detail, setDetail] = useState<CustomerTrackingDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(trackingYearStart(currentYear))
  const [dateTo, setDateTo] = useState(trackingYearEnd(currentYear))
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const [sortKey, setSortKey] = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof trackingPageSizeOptions)[number]>(10)
  const scopeYear = trackingScopeYear(dateFrom)

  const columnResize = useResizableColumns('tracking.customer.main.v7', trackingColumns)

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
    if (productCategory) params.set('productCategory', productCategory)
    if (productId) params.set('productId', productId)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [dateFrom, dateTo, productCategory, productId, scopeYear, search])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<CustomerTrackingPayload>(`/api/tracking/customer?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลลูกค้าไม่ได้')
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

  const openDetail = useCallback(async (row: CustomerTrackingRow) => {
    setIsDetailLoading(true)
    setDetail({
      bills: [],
      channels: [],
      customer: { code: row.code, id: row.id, name: row.customerName },
      monthly: [],
      products: [],
      receipts: [],
      signals: {
        agingBuckets: row.agingBuckets,
        creditLimit: row.creditLimit,
        creditUtilizationPct: row.creditUtilizationPct,
        gpPct: row.gpPct,
        lowMarginBillCount: row.lowMarginBillCount,
        negativeMarginBillCount: row.negativeMarginBillCount,
        oldestArAgeDays: row.oldestArAgeDays,
        overdueArAmount: row.overdueArAmount,
        overdueArBillCount: row.overdueArBillCount,
        pendingArAmount: row.receivable,
        pendingArBillCount: row.pendingArBillCount,
      },
    })
    try {
      const params = new URLSearchParams(queryString)
      params.set('detailId', row.id)
      const payload = await dailyFetchJson<CustomerTrackingPayload>(`/api/tracking/customer?${params.toString()}`)
      setDetail(payload.detail ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดลูกค้าไม่ได้')
      setDetail(null)
    } finally {
      setIsDetailLoading(false)
    }
  }, [queryString, setDetail])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey as keyof CustomerTrackingRow]
        const valB = b[sortKey as keyof CustomerTrackingRow]

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
  const overdueCustomerCount = useMemo(() => rows.filter((row) => row.overdueArAmount > 0).length, [rows])

  const topRevenue = [...rows].sort((left, right) => right.revenue - left.revenue).slice(0, 10)
  const topGp = [...rows].sort((left, right) => right.gp - left.gp).slice(0, 10)
  const topGpPct = [...rows].filter((row) => row.revenue > 0).sort((left, right) => right.gpPct - left.gpPct).slice(0, 10)
  const topReceivable = [...rows].sort((left, right) => right.receivable - left.receivable).slice(0, 10)
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

  const exportHref = `/api/tracking/customer?${queryString}&format=xlsx`
  const defaultDateFrom = trackingYearStart(currentYear)
  const defaultDateTo = trackingYearEnd(currentYear)
  const hasActiveFilters = Boolean(search || productCategory || productId || dateFrom !== defaultDateFrom || dateTo !== defaultDateTo)
  const resetFilters = () => {
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
    setProductCategory('')
    setProductId('')
    setSearch('')
  }

  return (
    <section className="space-y-4">
      <PageTitleOverride
        title="Customer Tracking 360°"
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-4">
        <SummaryCard icon="⚖️" label="น้ำหนัก" tone="blue" value={`${formatMoney(data?.summary.qty ?? 0)} กก.`} />
        <SummaryCard icon="💰" label="ยอดขาย" tone="emerald" value={formatMoney(data?.summary.revenue ?? 0)} />
        <SummaryCard icon="🧾" label="ลูกหนี้ค้าง" tone="amber" value={formatMoney(data?.summary.receivable ?? 0)} />
        <SummaryCard icon="⏰" label="ลูกค้าเกินกำหนด" tone="amber" value={`${overdueCustomerCount.toLocaleString('th-TH')} ราย`} />
      </div>

      <Tabs className="min-w-0" value={view} onValueChange={(value) => setView(value as 'list' | 'top10' | 'yearCompare')}>
        <TabsList className="w-full min-w-0 overflow-x-auto" variant="line">
          <TabsTrigger value="list" variant="line">รายการ</TabsTrigger>
          <TabsTrigger value="top10" variant="line">Top 10 + วิเคราะห์</TabsTrigger>
          <TabsTrigger value="yearCompare" variant="line">รายปี (12 เดือน)</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        {/* Desktop View */}
        <div className="hidden lg:block space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 pl-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                placeholder="ค้นหาลูกค้า"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400">→</span>
            <DatePickerInput value={dateTo} onChange={setDateTo} />

            <select
              className="h-9 w-[10rem] rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 outline-none"
              value={productCategory}
              onChange={(event) => { setProductCategory(event.target.value); setProductId('') }}
            >
              <option value="">ทุกหมวด</option>
              {(data?.filters?.productCategories ?? []).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>


            <div className="min-w-[190px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm"
                inputId="tracking-customer-filter-product"
                label="สินค้า"
                options={productSearchOptions}
                placeholder="เลือกสินค้า"
                value={productId}
                onChange={setProductId}
              />
            </div>

            <button className="h-9 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60" disabled={!hasActiveFilters} type="button" onClick={resetFilters}>ล้างตัวกรอง</button>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2">
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              placeholder="ค้นหาลูกค้า..."
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
              title="ตัวกรองลูกค้า"
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

              <label className="text-xs text-slate-500 font-semibold">
                หมวดสินค้า
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                  value={productCategory}
                  onChange={(event) => { setProductCategory(event.target.value); setProductId('') }}
                >
                  <option value="">ทุกหมวด</option>
                  {(data?.filters?.productCategories ?? []).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <SearchCombobox inputClassName="h-9 text-sm" inputId="tracking-customer-mobile-product" label="สินค้า" options={productSearchOptions} placeholder="เลือกสินค้า" value={productId} onChange={setProductId} />
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

      {view === 'yearCompare' ? <YearCompare rows={rows} /> : null}
      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel color="emerald" rows={topRevenue.map((row) => ({ label: row.customerName, value: row.revenue }))} title="Top 10 ยอดขาย" />
          <TopPanel color="teal" rows={topGp.map((row) => ({ label: row.customerName, value: row.gp }))} title="Top 10 GP" />
          <TopPanel color="blue" rows={topGpPct.map((row) => ({ label: row.customerName, value: row.gpPct }))} suffix="%" title="Top 10 GP%" />
          <TopPanel color="amber" rows={topReceivable.map((row) => ({ label: row.customerName, value: row.receivable }))} title="Top 10 ลูกหนี้" />
        </div>
      ) : null}

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
          {isLoading ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
          {!isLoading && sortedRows.length === 0 ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400 shadow-sm">ไม่มีข้อมูลลูกค้า</div> : null}
          {!isLoading && pagedRows.map((row) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50/50 cursor-pointer transition-colors focus-visible:outline-none" role="button" tabIndex={0} onClick={() => void openDetail(row)} onKeyDown={(event) => { if (event.key === 'Enter') void openDetail(row) }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{row.customerName}</div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">{row.code || '-'}</div>
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 shrink-0">{row.billCount} บิล</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-2 text-xs">
                <MiniLine label="ยอดขาย" tone="emerald" value={formatMoney(row.revenue)} />
                <MiniLine label="GP" tone={row.gp >= 0 ? 'emerald' : 'red'} value={formatMoney(row.gp)} />
                <MiniLine label="น้ำหนัก" value={`${formatMoney(row.qty)} กก.`} />
                <MiniLine label="ลูกหนี้" tone="amber" value={formatMoney(row.receivable)} />
                <MiniLine label="อายุหนี้" tone={row.overdueArAmount > 0 ? 'red' : row.receivable > 0 ? 'amber' : 'slate'} value={debtAgeLabel(row)} />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
          <table className="ns-table w-full text-sm border-collapse" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {trackingColumns.map((col) => (
                <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100/75 text-slate-700 border-b border-slate-200">
              <tr>
                <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="รหัส" resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')} sortKey="code" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="ลูกค้า" resizeProps={columnResize.getResizeHandleProps('customerName', 'ลูกค้า')} sortKey="customerName" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="บิล" resizeProps={columnResize.getResizeHandleProps('billCount', 'บิล')} sortKey="billCount" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="น้ำหนัก" resizeProps={columnResize.getResizeHandleProps('qty', 'น้ำหนัก')} sortKey="qty" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอดขาย" resizeProps={columnResize.getResizeHandleProps('revenue', 'ยอดขาย')} sortKey="revenue" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ราคาเฉลี่ย" resizeProps={columnResize.getResizeHandleProps('avgSell', 'ราคาเฉลี่ย')} sortKey="avgSell" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="COGS" resizeProps={columnResize.getResizeHandleProps('cogs', 'COGS')} sortKey="cogs" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="GP" resizeProps={columnResize.getResizeHandleProps('gp', 'GP')} sortKey="gp" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="GP%" resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} sortKey="gpPct" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="฿/กก." resizeProps={columnResize.getResizeHandleProps('profitPerKg', '฿/กก.')} sortKey="profitPerKg" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="รับเงิน" resizeProps={columnResize.getResizeHandleProps('receivedAmount', 'รับเงิน')} sortKey="receivedAmount" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ลูกหนี้" resizeProps={columnResize.getResizeHandleProps('receivable', 'ลูกหนี้')} sortKey="receivable" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="อายุหนี้" resizeProps={columnResize.getResizeHandleProps('oldestArAgeDays', 'อายุหนี้')} sortKey="oldestArAgeDays" onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-slate-400 text-center" colSpan={13}>ไม่มีข้อมูลลูกค้า</td></tr> : null}
              {!isLoading && pagedRows.map((row) => (
                <tr key={row.id} className="cursor-pointer hover:bg-slate-50 transition-colors focus-visible:outline-none" onClick={() => void openDetail(row)}>
                  <td className="p-3 pl-4 font-mono text-xs text-slate-400 min-w-0 overflow-hidden"><div className="truncate" title={row.code || ''}>{row.code || '-'}</div></td>
                  <td className="p-3 font-medium text-slate-800 min-w-0 overflow-hidden"><div className="truncate" title={row.customerName || ''}>{row.customerName}</div></td>
                  <td className="p-3 text-right text-slate-700 whitespace-nowrap tabular-nums pl-4">{row.billCount}</td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.qty)}</td>
                  <td className="p-3 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.revenue)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.avgSell)}</td>
                  <td className="p-3 text-right font-mono text-red-600 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.cogs)}</td>
                  <td className={`p-3 text-right font-mono font-semibold whitespace-nowrap tabular-nums pl-4 ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.gp)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{row.gpPct.toFixed(2)}%</td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.profitPerKg)}</td>
                  <td className="p-3 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.receivedAmount)}</td>
                  <td className="p-3 text-right font-mono text-amber-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.receivable)}</td>
                  <td className="p-3 pr-4 text-right whitespace-nowrap pl-4"><DebtAgeBadge row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : null}

      <CustomerDetailDialog detail={detail} isLoading={isDetailLoading} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </section>
  )
}function CustomerDetailDialog({ detail, isLoading, onOpenChange }: { detail: CustomerTrackingDetail | null; isLoading: boolean; onOpenChange: (open: boolean) => void }) {
  const [billStatus, setBillStatus] = useState('')
  const [receiptStatus, setReceiptStatus] = useState('')

  useEffect(() => {
    if (detail === null) {
      setBillStatus('')
      setReceiptStatus('')
    }
  }, [detail])

  const availableBillStatuses = useMemo(() => {
    if (!detail) return []
    return Array.from(new Set(detail.bills.map((b) => b.status).filter(Boolean)))
  }, [detail])

  const availableReceiptStatuses = useMemo(() => {
    if (!detail) return []
    return Array.from(new Set(detail.receipts.map((r) => r.status).filter(Boolean)))
  }, [detail])

  const filteredBills = useMemo(() => {
    if (!detail) return []
    return detail.bills.filter((b) => !billStatus || b.status === billStatus)
  }, [detail, billStatus])

  const filteredReceipts = useMemo(() => {
    if (!detail) return []
    return detail.receipts.filter((r) => !receiptStatus || r.status === receiptStatus)
  }, [detail, receiptStatus])

  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden rounded-md border-0 bg-slate-900 !p-0 shadow-2xl outline-none focus:outline-none flex flex-col" fallbackTitle="รายละเอียดลูกค้า" hideClose>
        <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-5 py-4 text-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate text-xl font-bold text-white">{detail?.customer.name ?? 'รายละเอียดลูกค้า'}</DialogTitle>
              <DialogDescription className="truncate text-xs text-slate-300">
                {detail?.customer.code ? `${detail.customer.code} · ` : ''}บิลขาย / ใบรับเงิน / รายเดือน / สรุปสินค้า
              </DialogDescription>
            </div>
            <Button className="h-9 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
          </div>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm sm:p-5">
          {isLoading ? <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 border border-slate-100">กำลังโหลดรายละเอียด...</div> : null}
          {!isLoading && detail ? (
            <>
              <DetailSection title="Decision Signals">
                <div className="grid grid-cols-2 gap-2.5 p-3 md:grid-cols-3 lg:grid-cols-5">
                  <SignalMetric label="Pending AR" value={formatMoney(detail.signals.pendingArAmount)} />
                  <SignalMetric label="บิลค้าง AR" value={`${detail.signals.pendingArBillCount} บิล`} />
                  <SignalMetric label="AR เกินกำหนด" value={formatMoney(detail.signals.overdueArAmount)} />
                  <SignalMetric label="บิลเกินกำหนด" value={`${detail.signals.overdueArBillCount} บิล`} />
                  <SignalMetric label="เก่าสุด" value={`${detail.signals.oldestArAgeDays} วัน`} />
                  <SignalMetric label="ใช้เครดิต" value={`${detail.signals.creditUtilizationPct.toFixed(1)}%`} />
                  <SignalMetric label="GP%" value={`${detail.signals.gpPct.toFixed(2)}%`} />
                  <SignalMetric label="บิล Margin ต่ำ" value={`${detail.signals.lowMarginBillCount} บิล`} />
                  <SignalMetric label="บิล GP ติดลบ" value={`${detail.signals.negativeMarginBillCount} บิล`} />
                  <SignalMetric label="Credit Limit" value={formatMoney(detail.signals.creditLimit)} />
                </div>
              </DetailSection>
              <DetailSection title="AR Aging Buckets">
                <SimpleTable
                  headers={['Bucket', 'บิล', 'ยอดค้าง']}
                  rows={detail.signals.agingBuckets.map((row) => [row.bucket, String(row.count), formatMoney(row.amount)])}
                />
              </DetailSection>
              <DetailSection
                title="Sales Bill"
                headerActions={
                  <select
                    aria-label="กรองสถานะ Sales Bill"
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 focus:outline-none"
                    value={billStatus}
                    onChange={(e) => setBillStatus(e.target.value)}
                  >
                    <option value="">ทุกสถานะ</option>
                    {availableBillStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                }
              >
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'Due', 'Bucket', 'อายุ', 'ช่องทาง', 'น้ำหนัก', 'ยอดขาย', 'COGS', 'GP', 'รับเงิน', 'ลูกหนี้', 'สถานะ']}
                  rows={filteredBills.map((row) => [
                    formatDateDisplay(row.date),
                    { href: row.href, label: row.docNo },
                    formatDateDisplay(row.dueDate),
                    row.ageBucket,
                    `${row.ageDays} วัน`,
                    row.channelName,
                    formatMoney(row.qty),
                    formatMoney(row.revenue),
                    formatMoney(row.cogs),
                    formatMoney(row.gp),
                    formatMoney(row.received),
                    formatMoney(row.receivable),
                    row.status,
                  ])}
                />
              </DetailSection>
              <DetailSection title="Channel Breakdown">
                <SimpleTable
                  headers={['ช่องทาง', 'บิล', 'น้ำหนัก', 'ยอดขาย', 'COGS', 'GP', 'GP%']}
                  rows={detail.channels.map((row) => [row.channelName, String(row.billCount), formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.cogs), formatMoney(row.gp), `${row.gpPct.toFixed(2)}%`])}
                />
              </DetailSection>
              <DetailSection
                title="Receipt"
                headerActions={
                  <select
                    aria-label="กรองสถานะ Receipt"
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 focus:outline-none"
                    value={receiptStatus}
                    onChange={(e) => setReceiptStatus(e.target.value)}
                  >
                    <option value="">ทุกสถานะ</option>
                    {availableReceiptStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                }
              >
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'วิธีรับเงิน', 'ยอดรับ', 'สุทธิ', 'สถานะ']}
                  rows={filteredReceipts.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, row.method, formatMoney(row.amount), formatMoney(row.netAmount), row.status])}
                />
              </DetailSection>
              <DetailSection title="Monthly Movement">
                <SimpleTable
                  headers={['เดือน', 'บิล', 'รับเงิน', 'น้ำหนัก', 'ยอดขาย', 'GP', 'รับแล้ว', 'ลูกหนี้']}
                  rows={detail.monthly.map((row, index) => [monthLabels[index] ?? row.month, String(row.billCount), String(row.receiptCount), formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.gp), formatMoney(row.receivedAmount), formatMoney(row.receivable)])}
                />
              </DetailSection>
              <DetailSection title="สรุปตามสินค้า">
                <SimpleTable
                  headers={['สินค้า', 'น้ำหนัก', 'ยอดขาย', 'ราคาเฉลี่ย', 'COGS', 'GP', 'GP%']}
                  rows={detail.products.map((row) => [row.productName, formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.avgSell), formatMoney(row.cogs), formatMoney(row.gp), `${row.gpPct.toFixed(2)}%`])}
                />
              </DetailSection>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
function DetailSection({ children, title, headerActions }: { children: ReactNode; title: string; headerActions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden shadow-sm">
      <div className="border-b border-slate-100 bg-slate-100/60 px-4 py-2.5 text-sm font-bold text-slate-800 flex items-center justify-between">
        <span>{title}</span>
        {headerActions}
      </div>
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
        <table className="ns-table w-full min-w-[760px] text-sm">
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
                      ${cellIndex === headers.length - 1 || !isNumericCell(cell) ? 'text-left' : 'text-right'}
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

function debtAgeLabel(row: Pick<CustomerTrackingRow, 'oldestArAgeDays' | 'overdueArAmount' | 'receivable'>) {
  if (row.overdueArAmount > 0) return `เกิน ${Math.max(0, row.oldestArAgeDays).toLocaleString('th-TH')} วัน`
  if (row.receivable > 0) return 'ยังไม่ถึงกำหนด'
  return 'ไม่มีลูกหนี้'
}

function DebtAgeBadge({ row }: { row: Pick<CustomerTrackingRow, 'oldestArAgeDays' | 'overdueArAmount' | 'receivable'> }) {
  const tone = row.overdueArAmount > 0
    ? 'border-red-100 bg-red-50 text-red-700'
    : row.receivable > 0
      ? 'border-amber-100 bg-amber-50 text-amber-700'
      : 'border-slate-100 bg-slate-50 text-slate-500'

  return (
    <span className={`inline-flex min-w-[6.5rem] justify-center rounded-md border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {debtAgeLabel(row)}
    </span>
  )
}

function MiniLine({ label, tone = 'slate', value }: { label: string; tone?: 'amber' | 'emerald' | 'red' | 'slate'; value: string }) {
  const text = tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-slate-800'
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className={`font-mono font-bold ${text}`}>{value}</span>
    </div>
  )
}

function SummaryCard({ className = '', icon, label, tone, value }: { className?: string; icon: string; label: string; tone: 'amber' | 'blue' | 'emerald' | 'violet'; value: string }) {
  return <SharedKpiCard className={className} icon={icon} label={label} tone={tone} value={value} />
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-bold text-slate-900 font-mono">{value}</div>
    </div>
  )
}

function TopPanel({ color, rows, suffix = '', title }: { color: 'amber' | 'blue' | 'emerald' | 'teal'; rows: { label: string; value: number }[]; suffix?: string; title: string }) {
  const [expanded, setExpanded] = useState(false)
  const header = color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-100' : color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' : color === 'teal' ? 'bg-teal-50 text-teal-700 border-teal-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  const hasMore = rows.length > 5
  const visibleRows = rows.slice(0, expanded ? 10 : 5)

  return (
    <div className="overflow-hidden rounded-md bg-white border border-slate-100 shadow-sm">
      <div className={`border-b border-slate-100 p-3 font-bold ${header}`}>{title}</div>
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

function YearCompare({ rows }: { rows: CustomerTrackingRow[] }) {
  const [mode, setMode] = useState<CustomerYearCompareMode>('weight')
  const [sortKey, setSortKey] = useState<CustomerYearCompareColumnKey | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const columnResize = useResizableColumns('tracking.customer.year-compare.v1', customerYearCompareColumns)

  const monthValue = useCallback((row: CustomerTrackingRow, monthIdx: number) => {
    const val = row.monthlyData?.[monthIdx]
    return mode === 'weight' ? (val?.qty ?? 0) : (val?.revenue ?? 0)
  }, [mode])

  const rowTotal = useCallback((row: CustomerTrackingRow) => (row.monthlyData ?? []).reduce((sum, val) => {
    return sum + (mode === 'weight' ? val.qty : val.revenue)
  }, 0), [mode])

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (!sortKey) return result

    result.sort((left, right) => {
      const valueA = sortKey === 'customer' ? left.customerName : sortKey === 'total' ? rowTotal(left) : monthValue(left, Number(sortKey.slice(1)) - 1)
      const valueB = sortKey === 'customer' ? right.customerName : sortKey === 'total' ? rowTotal(right) : monthValue(right, Number(sortKey.slice(1)) - 1)

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

  const handleSort = (key: CustomerYearCompareColumnKey) => {
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
        <Tabs value={mode} onValueChange={(value) => setMode(value as CustomerYearCompareMode)} className="gap-0">
          <TabsList variant="line" className="flex-wrap overflow-x-auto">
            <TabsTrigger variant="line" value="weight">น้ำหนัก (กก.)</TabsTrigger>
            <TabsTrigger variant="line" value="sales">ยอดขาย</TabsTrigger>
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
            {customerYearCompareColumns.map((column, index) => (
              <col
                key={column.key}
                style={index === customerYearCompareColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : columnResize.getColumnStyle(column.key)}
              />
            ))}
          </colgroup>
          <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ลูกค้า" resizeProps={columnResize.getResizeHandleProps('customer', 'ลูกค้า')} sortKey="customer" onSort={handleSort} />
              {monthLabels.map((label, index) => {
                const key = `m${months[index]}` as CustomerYearCompareColumnKey
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
                    <div className="truncate" title={row.customerName || ''}>{row.customerName}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5 truncate" title={row.code || ''}>{row.code || '-'}</div>
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
                  <div className="truncate text-sm font-bold text-slate-900">{row.customerName}</div>
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
