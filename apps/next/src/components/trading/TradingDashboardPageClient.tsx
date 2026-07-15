'use client'

import Link from 'next/link'
import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

type CostSourceColumnKey = 'date' | 'product' | 'remainingAmount' | 'remainingQty' | 'source' | 'supplier'
type ReadinessColumnKey = 'costPoolQty' | 'costPoolValue' | 'netValue' | 'poBuyAmount' | 'poSellAmount' | 'product' | 'status'
type ProductColumnKey = 'gp' | 'gpPct' | 'matchedCogs' | 'product' | 'qty' | 'sales'
type PurchaseColumnKey = 'date' | 'docNo' | 'matchedAmount' | 'remainingAmount' | 'status' | 'supplier' | 'totalAmount'
type SalesColumnKey = 'customer' | 'date' | 'docNo' | 'gp' | 'gpPct' | 'matchedCogs' | 'pendingAmount' | 'status' | 'totalAmount'
type SortDirection = 'asc' | 'desc'

const costSourceColumns: Array<ResizableColumnDefinition<CostSourceColumnKey>> = [
  { key: 'source', defaultWidth: 120, minWidth: 95 },
  { key: 'date', defaultWidth: 100, minWidth: 90 },
  { key: 'product', defaultWidth: 180, minWidth: 150 },
  { key: 'supplier', defaultWidth: 120, minWidth: 110 },
  { key: 'remainingQty', defaultWidth: 110, minWidth: 100 },
  { key: 'remainingAmount', defaultWidth: 110, minWidth: 105 },
]

const readinessColumns: Array<ResizableColumnDefinition<ReadinessColumnKey>> = [
  { key: 'product', defaultWidth: 150, minWidth: 130 },
  { key: 'costPoolQty', defaultWidth: 110, minWidth: 100 },
  { key: 'costPoolValue', defaultWidth: 120, minWidth: 110 },
  { key: 'poBuyAmount', defaultWidth: 120, minWidth: 110 },
  { key: 'poSellAmount', defaultWidth: 120, minWidth: 110 },
  { key: 'netValue', defaultWidth: 120, minWidth: 110 },
  { key: 'status', defaultWidth: 100, minWidth: 95 },
]

const productColumns: Array<ResizableColumnDefinition<ProductColumnKey>> = [
  { key: 'product', defaultWidth: 180, minWidth: 150 },
  { key: 'qty', defaultWidth: 110, minWidth: 95 },
  { key: 'sales', defaultWidth: 120, minWidth: 105 },
  { key: 'matchedCogs', defaultWidth: 120, minWidth: 110 },
  { key: 'gp', defaultWidth: 120, minWidth: 105 },
  { key: 'gpPct', defaultWidth: 100, minWidth: 90 },
]

const purchaseColumns: Array<ResizableColumnDefinition<PurchaseColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 110, minWidth: 95 },
  { key: 'supplier', defaultWidth: 180, minWidth: 150 },
  { key: 'totalAmount', defaultWidth: 120, minWidth: 105 },
  { key: 'matchedAmount', defaultWidth: 120, minWidth: 110 },
  { key: 'remainingAmount', defaultWidth: 120, minWidth: 110 },
  { key: 'status', defaultWidth: 110, minWidth: 95 },
]

const salesColumns: Array<ResizableColumnDefinition<SalesColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 110, minWidth: 95 },
  { key: 'customer', defaultWidth: 180, minWidth: 150 },
  { key: 'totalAmount', defaultWidth: 120, minWidth: 110 },
  { key: 'matchedCogs', defaultWidth: 120, minWidth: 110 },
  { key: 'gp', defaultWidth: 120, minWidth: 105 },
  { key: 'gpPct', defaultWidth: 100, minWidth: 90 },
  { key: 'pendingAmount', defaultWidth: 120, minWidth: 110 },
  { key: 'status', defaultWidth: 110, minWidth: 95 },
]

type Option = {
  code?: string
  id: string
  name: string
}

type DashboardPayload = {
  aging: {
    pendingBuy: AgingBuckets
    pendingSell: AgingBuckets
  }
  filters: {
    from: string
    to: string
  }
  options: {
    customers: Option[]
    products: Option[]
    suppliers: Option[]
  }
  productRows: Array<{
    cost: number
    gp: number
    gpPct: number
    productId: string
    productName: string
    qty: number
    sales: number
    unallocated: number
    unit: string
  }>
  purchaseRows: Array<{
    allocationStatus: string
    date: string
    docNo: string
    id: string
    matchedAmount: number
    partyName: string
    remainingAmount: number
    sourceUrl: string
    totalAmount: number
  }>
  salesRows: Array<{
    allocationStatus: string
    date: string
    docNo: string
    gp: number
    gpPct: number
    id: string
    matchedCogs: number
    matchedSalesAmount: number
    partyName: string
    pendingAmount: number
    sourceUrl: string
    totalAmount: number
  }>
  readinessRows: Array<{
    costPoolQty: number
    costPoolValue: number
    netQty: number
    netValue: number
    poBuyAmount: number
    poBuyQty: number
    poSellAmount: number
    poSellQty: number
    productId: string
    productName: string
    status: string
    unit: string
  }>
  summary: {
    allocationFactCount: number
    matchedCOGS: number
    matchedSalesAmount: number
    pendingBuyAmount: number
    pendingPurchaseBills: number
    pendingSellAmount: number
    pendingSalesBills: number
    poBuyExposureAmount: number
    poSellExposureAmount: number
    productCount: number
    readinessShortCount: number
    readyCostPoolValue: number
    tradingGP: number
    tradingGPPct: number
    tradingPurchase: number
    tradingSales: number
    unallocatedSalesAmount: number
  }
}

type TabKey = 'product' | 'purchase' | 'sales'
type AgingBucket = { amount: number; count: number }
type AgingBuckets = {
  '0-7': AgingBucket
  '8-14': AgingBucket
  '15-30': AgingBucket
  '31+': AgingBucket
}
type CostSourceRow = {
  date: string
  id: string
  productCode: string
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  sourceNo: string
  sourceType: string
  status: string
  supplierName: string
  totalAmount: number
  unitCost: number
}
type CostSourcesPayload = {
  rows: CostSourceRow[]
}
type CostSourceForm = {
  date: string
  notes: string
  productId: string
  qty: string
  supplierId: string
  totalAmount: string
  unitCost: string
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'product', label: 'แยกตามสินค้า' },
  { key: 'purchase', label: 'รายการซื้อ' },
  { key: 'sales', label: 'รายการขาย' },
]

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function searchOptions(options: Option[], allLabel: string): SearchComboboxOption[] {
  return [
    { id: 'all', label: allLabel, searchText: allLabel },
    ...options.map((option) => ({
      id: option.id,
      label: optionLabel(option),
      searchText: [option.code, option.name].filter(Boolean).join(' '),
    })),
  ]
}

function sourceFormDefaults(): CostSourceForm {
  return {
    date: todayDateInput(),
    notes: '',
    productId: '',
    qty: '',
    supplierId: 'none',
    totalAmount: '',
    unitCost: '',
  }
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''), 'th', { numeric: true, sensitivity: 'base' })
}

function useDashboardTableSort<TRow, TKey extends string>(rows: TRow[], getSortValue: (row: TRow, key: TKey) => string | number) {
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<TKey | null>(null)
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((left, right) => {
      const result = compareSortValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [getSortValue, rows, sortDirection, sortKey])

  const changeSort = (key: TKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  return { changeSort, sortDirection, sortedRows, sortKey }
}

function getCostSourceSortValue(row: CostSourceRow, key: CostSourceColumnKey) {
  if (key === 'source') return `${row.sourceType} ${row.sourceNo}`
  if (key === 'product') return `${row.productCode} ${row.productName}`
  if (key === 'supplier') return row.supplierName
  return row[key]
}

function getReadinessSortValue(row: DashboardPayload['readinessRows'][number], key: ReadinessColumnKey) {
  if (key === 'product') return row.productName
  return row[key]
}

function getProductSortValue(row: DashboardPayload['productRows'][number], key: ProductColumnKey) {
  if (key === 'product') return row.productName
  if (key === 'matchedCogs') return row.cost
  return row[key]
}

function getPurchaseSortValue(row: DashboardPayload['purchaseRows'][number], key: PurchaseColumnKey) {
  if (key === 'supplier') return row.partyName
  if (key === 'status') return row.allocationStatus
  return row[key]
}

function getSalesSortValue(row: DashboardPayload['salesRows'][number], key: SalesColumnKey) {
  if (key === 'customer') return row.partyName
  if (key === 'status') return row.allocationStatus
  return row[key]
}

function statusLabel(status: string) {
  if (status === 'matched') return 'จับคู่แล้ว'
  if (status === 'partial') return 'จับคู่บางส่วน'
  return 'รอจับคู่'
}

function statusClass(status: string) {
  if (status === 'matched') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'partial') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

export function TradingDashboardPageClient() {
  const [billNo, setBillNo] = useState('')
  const [customerId, setCustomerId] = useState('all')
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false)
  const [productId, setProductId] = useState('all')
  const [sourceForm, setSourceForm] = useState<CostSourceForm>(() => sourceFormDefaults())
  const [sourceRows, setSourceRows] = useState<CostSourceRow[]>([])
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [sourceSaving, setSourceSaving] = useState(false)
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [supplierId, setSupplierId] = useState('all')
  const [tab, setTab] = useState<TabKey>('product')
  const [toDate, setToDate] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      if (supplierId !== 'all') params.set('supplierId', supplierId)
      if (customerId !== 'all') params.set('customerId', customerId)
      if (tab === 'product' && productId !== 'all') params.set('productId', productId)
      if (billNo.trim()) params.set('billNo', billNo.trim())
      const query = params.toString()
      const payload = await dailyFetchJson<DashboardPayload>(`/api/trading/dashboard${query ? `?${query}` : ''}`)
      setData(payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดแดชบอร์ดซื้อมาขายไปไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [billNo, customerId, fromDate, productId, supplierId, tab, toDate])

  const loadCostSources = useCallback(async () => {
    setSourceError(null)
    setSourcesLoading(true)
    try {
      const payload = await dailyFetchJson<CostSourcesPayload>('/api/trading/cost-sources')
      setSourceRows(payload.rows)
    } catch (caught) {
      setSourceError(caught instanceof Error ? caught.message : 'โหลดต้นทุนซื้อมาขายไปไม่ได้')
    } finally {
      setSourcesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (isSourceModalOpen) void loadCostSources()
  }, [isSourceModalOpen, loadCostSources])

  const visibleFromDate = fromDate || data?.filters.from || ''
  const visibleToDate = toDate || data?.filters.to || ''

  const productTotals = useMemo(() => {
    return (data?.productRows ?? []).reduce(
      (total, row) => ({
        cost: total.cost + row.cost,
        gp: total.gp + row.gp,
        qty: total.qty + row.qty,
        sales: total.sales + row.sales,
      }),
      { cost: 0, gp: 0, qty: 0, sales: 0 },
    )
  }, [data?.productRows])

  const supplierOptions = useMemo(() => searchOptions(data?.options.suppliers ?? [], 'ผู้ขายทั้งหมด'), [data?.options.suppliers])
  const customerOptions = useMemo(() => searchOptions(data?.options.customers ?? [], 'ลูกค้าทั้งหมด'), [data?.options.customers])
  const productOptions = useMemo(() => searchOptions(data?.options.products ?? [], 'ทุกสินค้า'), [data?.options.products])
  const sourceProductOptions = useMemo<SearchComboboxOption[]>(() => (data?.options.products ?? []).map((option) => ({
    id: option.id,
    label: optionLabel(option),
    searchText: [option.code, option.name].filter(Boolean).join(' '),
  })), [data?.options.products])
  const sourceSupplierOptions = useMemo<SearchComboboxOption[]>(() => [
    { id: 'none', label: 'ไม่ระบุผู้ขาย', searchText: 'ไม่ระบุผู้ขาย manual' },
    ...(data?.options.suppliers ?? []).map((option) => ({
      id: option.id,
      label: optionLabel(option),
      searchText: [option.code, option.name].filter(Boolean).join(' '),
    })),
  ], [data?.options.suppliers])

  const submitCostSource = async () => {
    setSourceError(null)
    setSourceSaving(true)
    try {
      await dailyFetchJson<{ sourceNo: string }>('/api/trading/cost-sources', {
        body: JSON.stringify({
          date: sourceForm.date,
          notes: sourceForm.notes.trim() || null,
          productId: sourceForm.productId,
          qty: Number(sourceForm.qty),
          supplierId: sourceForm.supplierId === 'none' ? null : sourceForm.supplierId,
          totalAmount: sourceForm.totalAmount.trim() ? Number(sourceForm.totalAmount) : undefined,
          unitCost: sourceForm.unitCost.trim() ? Number(sourceForm.unitCost) : undefined,
        }),
        method: 'POST',
      })
      setSourceForm(sourceFormDefaults())
      await Promise.all([loadCostSources(), loadData()])
    } catch (caught) {
      setSourceError(caught instanceof Error ? caught.message : 'สร้างต้นทุนซื้อมาขายไปไม่ได้')
    } finally {
      setSourceSaving(false)
    }
  }

  const clearFilters = () => {
    setBillNo('')
    setCustomerId('all')
    setFromDate('')
    setProductId('all')
    setSupplierId('all')
    setToDate('')
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-slate-500">แดชบอร์ดซื้อมาขายไป</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">ภาพรวมกำไรและการจัดสรรซื้อมาขายไป</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="ยอดขายซื้อมาขายไป" tone="emerald" value={formatMoney(data?.summary.tradingSales ?? 0)} />
            <Metric label="ต้นทุนที่จับคู่แล้ว" tone="red" value={formatMoney(data?.summary.matchedCOGS ?? 0)} />
            <Metric label="กำไรขั้นต้นซื้อมาขายไป" tone={(data?.summary.tradingGP ?? 0) >= 0 ? 'purple' : 'red'} value={formatMoney(data?.summary.tradingGP ?? 0)} />
            <Metric label="อัตรากำไรขั้นต้น" tone="slate" value={`${(data?.summary.tradingGPPct ?? 0).toFixed(2)}%`} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-800">รายการที่ต้องติดตาม</div>
          <div className="mt-3 grid gap-3">
            <GapLine label="รอจับคู่ฝั่งซื้อ" meta={`${data?.summary.pendingPurchaseBills ?? 0} ใบ`} value={formatMoney(data?.summary.pendingBuyAmount ?? 0)} />
            <GapLine label="รอจับคู่ฝั่งขาย" meta={`${data?.summary.pendingSalesBills ?? 0} ใบ`} value={formatMoney(data?.summary.pendingSellAmount ?? 0)} />
            <GapLine label="ยอดขายที่ยังไม่จัดสรร" meta={`${data?.summary.allocationFactCount ?? 0} รายการ`} value={formatMoney(data?.summary.unallocatedSalesAmount ?? 0)} />
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabsList className="flex-wrap" variant="line">
          {tabs.map((item) => (
            <TabsTrigger key={item.key} value={item.key} variant="line">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" placeholder="ค้นหาเลขบิล" value={billNo} onChange={(event) => setBillNo(event.target.value)} />
            <DatePickerInput ariaLabel="วันที่เริ่มต้น" className="h-9 w-[11rem] text-sm" value={visibleFromDate} onChange={setFromDate} />
            <DatePickerInput ariaLabel="วันที่สิ้นสุด" className="h-9 w-[11rem] text-sm" value={visibleToDate} onChange={setToDate} />
            <div className="min-w-[180px]">
              <SearchCombobox hideLabel inputClassName="h-9 text-sm border-slate-300 rounded-md focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700" inputId="trading-dashboard-supplier" label="ผู้ขาย" options={supplierOptions} placeholder="ค้นหาผู้ขาย" value={supplierId} onChange={setSupplierId} />
            </div>
            <div className="min-w-[180px]">
              <SearchCombobox hideLabel inputClassName="h-9 text-sm border-slate-300 rounded-md focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700" inputId="trading-dashboard-customer" label="ลูกค้า" options={customerOptions} placeholder="ค้นหาลูกค้า" value={customerId} onChange={setCustomerId} />
            </div>
            {tab === 'product' ? (
              <div className="min-w-[180px]">
                <SearchCombobox hideLabel inputClassName="h-9 text-sm border-slate-300 rounded-md focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700" inputId="trading-dashboard-product" label="สินค้า" options={productOptions} placeholder="ค้นหาสินค้า" value={productId} onChange={setProductId} />
              </div>
            ) : null}
            <button className="h-9 rounded-md border border-slate-300 px-4 text-sm font-normal text-slate-600 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-0" type="button" onClick={clearFilters}>ล้าง</button>
          </div>
          <div className="flex justify-end">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-normal text-slate-700 shadow-xs transition-colors hover:bg-slate-50 focus:outline-none focus:ring-0" type="button" onClick={() => void loadData()}>รีเฟรช</button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ReadinessPanel isLoading={isLoading} rows={data?.readinessRows ?? []} summary={data?.summary ?? null} />
        <AgingPanel aging={data?.aging ?? null} isLoading={isLoading} />
      </div>

      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 px-4">
          <div className="flex gap-2 py-2">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition-colors hover:bg-slate-50 outline-none focus:outline-none focus:ring-0 shadow-xs cursor-pointer"
              type="button"
              onClick={() => setIsSourceModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              บันทึกต้นทุนซื้อมาขายไป
            </button>
            <Link className="flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-800 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs" href="/trading/matching">จับคู่ดีล</Link>
            <Link className="flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-800 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs" href="/dual-costing/deal-margin">วิเคราะห์ส่วนต่างต้นทุน</Link>
          </div>
        </div>

        {tab === 'product' ? <ProductTable isLoading={isLoading} rows={data?.productRows ?? []} totals={productTotals} /> : null}
        {tab === 'purchase' ? <PurchaseTable isLoading={isLoading} rows={data?.purchaseRows ?? []} /> : null}
        {tab === 'sales' ? <SalesTable isLoading={isLoading} rows={data?.salesRows ?? []} /> : null}
      </div>

      <CostSourceModal
        error={sourceError}
        form={sourceForm}
        isLoading={sourcesLoading}
        isOpen={isSourceModalOpen}
        isSaving={sourceSaving}
        productOptions={sourceProductOptions}
        rows={sourceRows}
        supplierOptions={sourceSupplierOptions}
        onClose={() => setIsSourceModalOpen(false)}
        onFormChange={setSourceForm}
        onRefresh={loadCostSources}
        onSubmit={submitCostSource}
      />
    </section>
  )
}

function CostSourceModal({
  error,
  form,
  isLoading,
  isOpen,
  isSaving,
  onClose,
  onFormChange,
  onRefresh,
  onSubmit,
  productOptions,
  rows,
  supplierOptions,
}: {
  error: string | null
  form: CostSourceForm
  isLoading: boolean
  isOpen: boolean
  isSaving: boolean
  onClose: () => void
  onFormChange: (form: CostSourceForm) => void
  onRefresh: () => void
  onSubmit: () => void
  productOptions: SearchComboboxOption[]
  rows: CostSourceRow[]
  supplierOptions: SearchComboboxOption[]
}) {
  const columnResize = useResizableColumns('trading.dashboard.cost-source.v5', costSourceColumns)
  const { changeSort, sortDirection, sortedRows, sortKey } = useDashboardTableSort(rows, getCostSourceSortValue)
  const unitCost = Number(form.unitCost)
  const qty = Number(form.qty)
  const totalAmount = Number(form.totalAmount)
  const estimatedTotal = Number.isFinite(totalAmount) && totalAmount > 0
    ? totalAmount
    : Number.isFinite(unitCost) && Number.isFinite(qty)
      ? unitCost * qty
      : 0
  const canSubmit = Boolean(form.date && form.productId && Number(form.qty) > 0 && (Number(form.unitCost) > 0 || Number(form.totalAmount) > 0))
  const update = <K extends keyof CostSourceForm>(key: K, value: CostSourceForm[K]) => onFormChange({ ...form, [key]: value })

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden rounded-md border-0 bg-slate-900 !p-0 shadow-2xl outline-none focus:outline-none flex flex-col" fallbackTitle="ต้นทุนซื้อมาขายไป" hideClose>
        <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-6 py-4 text-white">
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-white text-base font-bold">ต้นทุนซื้อมาขายไป</DialogTitle>
              <DialogDescription className="text-slate-300 text-xs mt-1">บันทึกต้นทุนซื้อมาขายไปแบบไม่ผูก PB เพื่อใช้จับคู่กับบิลขาย</DialogDescription>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button className="h-9 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={!canSubmit || isSaving} type="button" variant="outline" onClick={onSubmit}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
              <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
            </div>
          </div>
        </DialogHeader>
        <div className="grid flex-1 gap-4 overflow-y-auto bg-slate-50 p-4 text-sm sm:p-5 grid-cols-2 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-100 bg-white p-4 col-span-2 lg:col-span-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="trading-cost-source-date">วันที่</label>
                <DatePickerInput ariaLabel="วันที่ต้นทุนซื้อมาขายไป" className="h-10 w-full text-sm" value={form.date} onChange={(value) => update('date', value)} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <SearchCombobox
                  inputClassName="h-10 text-sm border-slate-300 rounded-md focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700"
                  inputId="trading-cost-source-product"
                  label="สินค้า *"
                  options={productOptions}
                  placeholder="ค้นหาสินค้า"
                  value={form.productId}
                  onChange={(value) => update('productId', value)}
                />
              </div>
              <div className="col-span-2">
                <SearchCombobox
                  inputClassName="h-10 text-sm border-slate-300 rounded-md focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700"
                  inputId="trading-cost-source-supplier"
                  label="ผู้ขาย"
                  options={supplierOptions}
                  placeholder="ค้นหาผู้ขาย"
                  value={form.supplierId}
                  onChange={(value) => update('supplierId', value)}
                />
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <NumberField id="trading-cost-source-qty" label="จำนวน" value={form.qty} onChange={(value) => update('qty', value)} />
                <NumberField id="trading-cost-source-unit-cost" label="ต้นทุน/หน่วย" value={form.unitCost} onChange={(value) => update('unitCost', value)} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <NumberField id="trading-cost-source-total" label="มูลค่ารวม" value={form.totalAmount} onChange={(value) => update('totalAmount', value)} />
              </div>
              <div className="col-span-2 sm:col-span-1 flex flex-col justify-end">
                <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm border border-emerald-100">
                  <div className="text-xs font-semibold text-emerald-700">ยอดที่จะบันทึก</div>
                  <div className="font-bold text-emerald-900">{formatMoney(estimatedTotal)}</div>
                </div>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="trading-cost-source-notes">หมายเหตุ</label>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
                  id="trading-cost-source-notes"
                  value={form.notes}
                  onChange={(event) => update('notes', event.target.value)}
                />
              </div>
              {error ? <div className="col-span-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-xs col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 bg-slate-50/50">
              <div>
                <div className="text-sm font-bold text-slate-800">รายการต้นทุนล่าสุด</div>
                <div className="text-xs text-slate-500">แสดงเฉพาะรายการที่ยังใช้เป็นต้นทุนซื้อมาขายไปได้</div>
              </div>
              <button className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-normal text-slate-600 hover:bg-slate-50 hover:text-slate-800 outline-none focus:outline-none focus:ring-0 shadow-xs cursor-pointer transition-colors" type="button" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
                รีเฟรช
              </button>
            </div>
            <div className="overflow-x-auto p-4 overflow-hidden">
              <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
                {columnResize.hasCustomWidths ? (
                  <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
                ) : null}
              </div>
              <table className="ns-table w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {costSourceColumns.map((col) => (
                    <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium text-xs">
                  <tr>
                    <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="แหล่งที่มา" resizeProps={columnResize.getResizeHandleProps('source', 'แหล่งที่มา')} sortKey="source" onSort={changeSort} />
                    <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
                    <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} sortKey="product" onSort={changeSort} />
                    <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ผู้ขาย" resizeProps={columnResize.getResizeHandleProps('supplier', 'ผู้ขาย')} sortKey="supplier" onSort={changeSort} />
                    <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="จำนวนคงเหลือ" resizeProps={columnResize.getResizeHandleProps('remainingQty', 'จำนวนคงเหลือ')} sortKey="remainingQty" onSort={changeSort} />
                    <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="มูลค่าคงเหลือ" resizeProps={columnResize.getResizeHandleProps('remainingAmount', 'มูลค่าคงเหลือ')} sortKey="remainingAmount" onSort={changeSort} />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
                  {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={6}>ยังไม่มีรายการต้นทุน</td></tr> : null}
                  {sortedRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="p-3 font-mono text-xs font-semibold text-slate-800 overflow-hidden truncate">{row.sourceNo}</td>
                      <td className="p-3 text-right text-xs overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                      <td className="p-3 text-right overflow-hidden truncate">{row.productCode ? `${row.productCode} - ${row.productName}` : row.productName}</td>
                      <td className="p-3 text-right overflow-hidden truncate">{row.supplierName}</td>
                      <td className="p-3 text-right overflow-hidden truncate">{formatMoney(row.remainingQty)}</td>
                      <td className="p-3 text-right font-semibold text-emerald-700 overflow-hidden truncate">{formatMoney(row.remainingAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NumberField({ id, label, onChange, value }: { id: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor={id}>{label}</label>
      <input
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-right bg-white font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
        id={id}
        inputMode="decimal"
        min="0"
        step="0.01"
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function ReadinessPanel({ isLoading, rows, summary }: { isLoading: boolean; rows: DashboardPayload['readinessRows']; summary: DashboardPayload['summary'] | null }) {
  const columnResize = useResizableColumns('trading.dashboard.readiness.v5', readinessColumns)
  const { changeSort, sortDirection, sortedRows, sortKey } = useDashboardTableSort(rows, getReadinessSortValue)
  const visibleRows = sortedRows.slice(0, 6)
  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/50">
        <div>
          <div className="text-sm font-bold text-slate-800">ความพร้อมของสต็อกและต้นทุน</div>
          <div className="text-xs text-slate-500">เปรียบเทียบ PO ซื้อและต้นทุนกับภาระ PO ขาย</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">มูลค่าต้นทุน {formatMoney(summary?.readyCostPoolValue ?? 0)}</span>
          <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">PO ซื้อ {formatMoney(summary?.poBuyExposureAmount ?? 0)}</span>
          <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">PO ขาย {formatMoney(summary?.poSellExposureAmount ?? 0)}</span>
          <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">ขาด {summary?.readinessShortCount ?? 0}</span>
        </div>
      </div>
      <div className="p-4">
        {/* Desktop View Table */}
        <div className="hidden lg:block overflow-x-auto overflow-hidden">
          <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
            {columnResize.hasCustomWidths ? (
              <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
            ) : null}
          </div>
          <table className="ns-table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {readinessColumns.map((col) => (
                <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-600 font-semibold">
              <tr>
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} sortKey="product" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="จำนวนต้นทุน" resizeProps={columnResize.getResizeHandleProps('costPoolQty', 'จำนวนต้นทุน')} sortKey="costPoolQty" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="มูลค่าต้นทุน" resizeProps={columnResize.getResizeHandleProps('costPoolValue', 'มูลค่าต้นทุน')} sortKey="costPoolValue" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="PO ซื้อ" resizeProps={columnResize.getResizeHandleProps('poBuyAmount', 'PO ซื้อ')} sortKey="poBuyAmount" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="PO ขาย" resizeProps={columnResize.getResizeHandleProps('poSellAmount', 'PO ขาย')} sortKey="poSellAmount" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="มูลค่าสุทธิ" resizeProps={columnResize.getResizeHandleProps('netValue', 'มูลค่าสุทธิ')} sortKey="netValue" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && visibleRows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={7}>ยังไม่มี readiness ตามเงื่อนไข</td></tr> : null}
              {visibleRows.map((row) => (
                <tr key={row.productId} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-semibold text-slate-800 min-w-0 overflow-hidden"><div className="truncate" title={row.productName || ''}>{row.productName}</div></td>
                  <td className="p-3 text-right font-medium text-slate-700 whitespace-nowrap tabular-nums">{formatMoney(row.costPoolQty)} {row.unit}</td>
                  <td className="p-3 text-right text-emerald-700 font-semibold whitespace-nowrap tabular-nums">{formatMoney(row.costPoolValue)}</td>
                  <td className="p-3 text-right text-blue-700 font-semibold whitespace-nowrap tabular-nums">{formatMoney(row.poBuyAmount)}</td>
                  <td className="p-3 text-right text-amber-700 font-semibold whitespace-nowrap tabular-nums">{formatMoney(row.poSellAmount)}</td>
                  <td className={`p-3 text-right font-bold whitespace-nowrap tabular-nums ${row.netValue >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{formatMoney(row.netValue)}</td>
                  <td className="p-3 text-right whitespace-nowrap"><ReadinessStatusPill status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View Card List */}
        <div className="block lg:hidden space-y-3">
          {isLoading ? <div className="p-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">กำลังโหลดข้อมูล</div> : null}
          {!isLoading && visibleRows.length === 0 ? <div className="p-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">ยังไม่มี readiness ตามเงื่อนไข</div> : null}
          {!isLoading && visibleRows.map((row) => (
            <div key={row.productId} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                <div className="font-bold text-slate-900 text-sm">{row.productName}</div>
                <ReadinessStatusPill status={row.status} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                <span className="text-slate-400 block mb-0.5 font-medium">จำนวนต้นทุน</span>
                  <span className="text-slate-700 font-bold">{formatMoney(row.costPoolQty)} {row.unit}</span>
                </div>
                <div>
                <span className="text-slate-400 block mb-0.5 font-medium">มูลค่าต้นทุน</span>
                  <span className="text-emerald-600 font-bold">{formatMoney(row.costPoolValue)} ฿</span>
                </div>
                <div>
                <span className="text-slate-400 block mb-0.5 font-medium">PO ซื้อ</span>
                  <span className="text-blue-600 font-bold">{formatMoney(row.poBuyAmount)} ฿</span>
                </div>
                <div>
                <span className="text-slate-400 block mb-0.5 font-medium">PO ขาย</span>
                  <span className="text-amber-600 font-bold">{formatMoney(row.poSellAmount)} ฿</span>
                </div>
                <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                  <span className="text-slate-500 text-xs font-medium font-semibold">มูลค่าสุทธิ:</span>
                  <span className={`font-bold text-sm ${row.netValue >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{formatMoney(row.netValue)} ฿</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {rows.length > visibleRows.length ? <div className="mt-2.5 text-xs text-slate-400 font-medium">แสดง 6 รายการแรกจาก {rows.length} รายการ ใช้ตัวกรองสินค้าเพื่อเจาะสินค้า</div> : null}
      </div>
    </div>
  )
}

function AgingPanel({ aging, isLoading }: { aging: DashboardPayload['aging'] | null; isLoading: boolean }) {
  const buckets: Array<keyof AgingBuckets> = ['0-7', '8-14', '15-30', '31+']
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-bold text-slate-800">อายุรายการรอจับคู่</div>
      <div className="mt-1 text-xs text-slate-500">อายเอกสารที่ยังมียอดคงเหลือหรือรอจับคู่</div>
      <div className="mt-3 space-y-3">
        {buckets.map((bucket) => (
          <div key={bucket} className="rounded-md bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-600">{bucket} วัน</div>
              <div className="text-xs text-slate-500">
                {isLoading ? '...' : `${(aging?.pendingBuy[bucket].count ?? 0) + (aging?.pendingSell[bucket].count ?? 0)} ใบ`}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <AgingValue label="ซื้อ" value={aging?.pendingBuy[bucket].amount ?? 0} />
              <AgingValue label="ขาย" value={aging?.pendingSell[bucket].amount ?? 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductTable({ isLoading, rows, totals }: { isLoading: boolean; rows: DashboardPayload['productRows']; totals: { cost: number; gp: number; qty: number; sales: number } }) {
  const columnResize = useResizableColumns('trading.dashboard.products.v5', productColumns)
  const { changeSort, sortDirection, sortedRows, sortKey } = useDashboardTableSort(rows, getProductSortValue)
  return (
    <div className="p-4">
      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          ) : null}
        </div>
        <table className="ns-table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {productColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-600">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} sortKey="product" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="จำนวน" resizeProps={columnResize.getResizeHandleProps('qty', 'จำนวน')} sortKey="qty" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ยอดขาย" resizeProps={columnResize.getResizeHandleProps('sales', 'ยอดขาย')} sortKey="sales" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ต้นทุนที่จับคู่แล้ว" resizeProps={columnResize.getResizeHandleProps('matchedCogs', 'ต้นทุนที่จับคู่แล้ว')} sortKey="matchedCogs" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="GP" resizeProps={columnResize.getResizeHandleProps('gp', 'GP')} sortKey="gp" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="GP%" resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} sortKey="gpPct" onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={6}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
            {sortedRows.map((row) => (
              <tr key={row.productId} className="hover:bg-slate-50/30 transition-colors">
                <td className="p-3 font-semibold text-slate-800 min-w-0 overflow-hidden"><div className="truncate" title={row.productName || ''}>{row.productName}</div></td>
                <td className="p-3 text-right font-medium text-slate-700 whitespace-nowrap tabular-nums">{formatMoney(row.qty)} {row.unit}</td>
                <td className="p-3 text-right text-emerald-700 font-semibold whitespace-nowrap tabular-nums">{formatMoney(row.sales)}</td>
                <td className="p-3 text-right text-red-700 font-semibold whitespace-nowrap tabular-nums">{formatMoney(row.cost)}</td>
                <td className={`p-3 text-right font-bold whitespace-nowrap tabular-nums ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</td>
                <td className="p-3 text-right font-medium text-slate-500 whitespace-nowrap tabular-nums">{row.gpPct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-slate-50 font-bold border-slate-200 text-slate-700">
            <tr>
              <td className="p-3">รวม</td>
              <td className="p-3 text-right">{formatMoney(totals.qty)}</td>
              <td className="p-3 text-right text-emerald-700">{formatMoney(totals.sales)}</td>
              <td className="p-3 text-right text-red-700">{formatMoney(totals.cost)}</td>
              <td className={`p-3 text-right ${totals.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(totals.gp)}</td>
              <td className="p-3 text-right">{totals.sales > 0 ? (totals.gp / totals.sales * 100).toFixed(2) : '0.00'}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile view Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && sortedRows.length === 0 ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && sortedRows.map((row) => (
          <div key={row.productId} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">{row.productName}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">จำนวน</span>
                <span className="text-slate-700 font-bold">{formatMoney(row.qty)} {row.unit}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">ยอดขาย</span>
                <span className="text-emerald-600 font-bold">{formatMoney(row.sales)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">ต้นทุนที่จับคู่แล้ว</span>
                <span className="text-red-600 font-bold">{formatMoney(row.cost)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">GP%</span>
                <span className="text-slate-700 font-semibold">{row.gpPct.toFixed(2)}%</span>
              </div>
              <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                <span className="text-slate-500 text-xs font-medium">GP:</span>
                <span className={`font-bold text-sm ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)} ฿</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PurchaseTable({ isLoading, rows }: { isLoading: boolean; rows: DashboardPayload['purchaseRows'] }) {
  const columnResize = useResizableColumns('trading.dashboard.purchases.v5', purchaseColumns)
  const { changeSort, sortDirection, sortedRows, sortKey } = useDashboardTableSort(rows, getPurchaseSortValue)
  return (
    <div className="p-4">
      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          ) : null}
        </div>
        <table className="ns-table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {purchaseColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-700 font-semibold">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="PB / ต้นทุนซื้อมาขายไป" resizeProps={columnResize.getResizeHandleProps('docNo', 'PB / ต้นทุนซื้อมาขายไป')} sortKey="docNo" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ผู้ขาย" resizeProps={columnResize.getResizeHandleProps('supplier', 'ผู้ขาย')} sortKey="supplier" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ยอดซื้อ" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'ยอดซื้อ')} sortKey="totalAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ต้นทุนที่จับคู่แล้ว" resizeProps={columnResize.getResizeHandleProps('matchedAmount', 'ต้นทุนที่จับคู่แล้ว')} sortKey="matchedAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ยอดคงเหลือ" resizeProps={columnResize.getResizeHandleProps('remainingAmount', 'ยอดคงเหลือ')} sortKey="remainingAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={7}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
            {sortedRows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                <td className="p-3 font-mono font-semibold overflow-hidden truncate"><Link className="text-purple-700 hover:underline" href={row.sourceUrl}>{row.docNo}</Link></td>
                <td className="p-3 text-right text-slate-500 font-medium overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                <td className="p-3 text-right text-slate-800 font-medium overflow-hidden truncate">{row.partyName}</td>
                <td className="p-3 text-right font-semibold text-slate-700 overflow-hidden truncate">{formatMoney(row.totalAmount)}</td>
                <td className="p-3 text-right text-red-700 font-semibold overflow-hidden truncate">{formatMoney(row.matchedAmount)}</td>
                <td className="p-3 text-right font-bold text-amber-700 overflow-hidden truncate">{formatMoney(row.remainingAmount)}</td>
                <td className="p-3 text-right overflow-hidden truncate"><StatusPill status={row.allocationStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && sortedRows.length === 0 ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && sortedRows.map((row) => (
          <div key={row.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div className="font-mono text-xs font-semibold text-purple-700">
                <Link className="hover:underline" href={row.sourceUrl}>{row.docNo}</Link>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="col-span-2">
                <span className="text-slate-400 block mb-0.5 font-medium">ผู้ขาย</span>
                <span className="text-slate-800 font-semibold">{row.partyName}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">ยอดซื้อ</span>
                <span className="text-slate-700 font-bold">{formatMoney(row.totalAmount)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">ต้นทุนที่จับคู่แล้ว</span>
                <span className="text-red-600 font-bold">{formatMoney(row.matchedAmount)} ฿</span>
              </div>
              <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  <span className="text-slate-500 text-xs font-medium font-semibold">ยอดคงเหลือ:</span>
                  <span className="text-amber-700 font-bold">{formatMoney(row.remainingAmount)} ฿</span>
                </div>
                <StatusPill status={row.allocationStatus} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SalesTable({ isLoading, rows }: { isLoading: boolean; rows: DashboardPayload['salesRows'] }) {
  const columnResize = useResizableColumns('trading.dashboard.sales.v5', salesColumns)
  const { changeSort, sortDirection, sortedRows, sortKey } = useDashboardTableSort(rows, getSalesSortValue)
  return (
    <div className="p-4">
      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          ) : null}
        </div>
        <table className="ns-table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {salesColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-700 font-semibold">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="SB" resizeProps={columnResize.getResizeHandleProps('docNo', 'SB')} sortKey="docNo" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ลูกค้า" resizeProps={columnResize.getResizeHandleProps('customer', 'ลูกค้า')} sortKey="customer" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ยอดขาย" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'ยอดขาย')} sortKey="totalAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ต้นทุนที่จับคู่แล้ว" resizeProps={columnResize.getResizeHandleProps('matchedCogs', 'ต้นทุนที่จับคู่แล้ว')} sortKey="matchedCogs" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="GP" resizeProps={columnResize.getResizeHandleProps('gp', 'GP')} sortKey="gp" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="GP%" resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} sortKey="gpPct" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="รอจับคู่" resizeProps={columnResize.getResizeHandleProps('pendingAmount', 'รอจับคู่')} sortKey="pendingAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
            {sortedRows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                <td className="p-3 font-mono font-semibold overflow-hidden truncate"><Link className="text-purple-700 hover:underline" href={row.sourceUrl}>{row.docNo}</Link></td>
                <td className="p-3 text-right text-slate-500 font-medium overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                <td className="p-3 text-right text-slate-800 font-medium overflow-hidden truncate">{row.partyName}</td>
                <td className="p-3 text-right text-emerald-700 font-semibold overflow-hidden truncate">{formatMoney(row.totalAmount)}</td>
                <td className="p-3 text-right text-red-700 font-semibold overflow-hidden truncate">{formatMoney(row.matchedCogs)}</td>
                <td className={`p-3 text-right font-bold overflow-hidden truncate ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</td>
                <td className="p-3 text-right font-medium text-slate-500 overflow-hidden truncate">{row.gpPct.toFixed(2)}%</td>
                <td className="p-3 text-right font-semibold text-amber-700 overflow-hidden truncate">{formatMoney(row.pendingAmount)}</td>
                <td className="p-3 text-right overflow-hidden truncate"><StatusPill status={row.allocationStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && sortedRows.length === 0 ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && sortedRows.map((row) => (
          <div key={row.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div className="font-mono text-xs font-semibold text-purple-700">
                <Link className="hover:underline" href={row.sourceUrl}>{row.docNo}</Link>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="col-span-2">
                <span className="text-slate-400 block mb-0.5 font-medium">ลูกค้า</span>
                <span className="text-slate-800 font-semibold">{row.partyName}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">ยอดขาย</span>
                <span className="text-emerald-600 font-bold">{formatMoney(row.totalAmount)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">ต้นทุนที่จับคู่แล้ว</span>
                <span className="text-red-600 font-bold">{formatMoney(row.matchedCogs)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">GP%</span>
                <span className="text-slate-700 font-semibold">{row.gpPct.toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">รอจับคู่</span>
                <span className="text-amber-700 font-bold">{formatMoney(row.pendingAmount)} ฿</span>
              </div>
              <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  <span className="text-slate-500 text-xs font-medium font-semibold">GP:</span>
                  <span className={`font-bold text-sm ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)} ฿</span>
                </div>
                <StatusPill status={row.allocationStatus} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, tone, value }: { label: string; tone: 'emerald' | 'purple' | 'red' | 'slate'; value: string }) {
  return <SharedKpiCard label={label} tone={tone} value={value} />
}

function GapLine({ label, meta, value }: { label: string; meta: string; value: string }) {
  const isPendingBuy = label.includes('ซื้อ')
  const emoji = isPendingBuy ? '📥' : label.includes('ขาย') ? '📤' : '⚖️'
  const iconBg = isPendingBuy ? 'bg-amber-50 text-amber-600' : label.includes('ขาย') ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center text-base shrink-0`}>
          {emoji}
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800 leading-snug">{label}</div>
          <div className="text-xs text-slate-500 mt-0.5">{meta}</div>
        </div>
      </div>
      <div className="text-sm font-bold text-amber-700">{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex rounded-xl border px-2.5 py-0.5 text-xs font-semibold ${statusClass(status)}`}>{statusLabel(status)}</span>
}

function ReadinessStatusPill({ status }: { status: string }) {
  if (status === 'short') return <span className="inline-flex rounded-xl border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">ขาด</span>
  if (status === 'ready') return <span className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">พร้อม</span>
  return <span className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-600">รอข้อมูล</span>
}

function AgingValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-2.5 shadow-2xs">
      <div className="text-xs text-slate-500 font-semibold mb-0.5">{label}</div>
      <div className="text-xs font-bold text-slate-800">{formatMoney(value)}</div>
    </div>
  )
}
