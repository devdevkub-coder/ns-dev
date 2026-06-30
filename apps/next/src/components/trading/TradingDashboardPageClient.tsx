'use client'

import Link from 'next/link'
import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

const costSourceColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'source', defaultWidth: 120 },
  { key: 'date', defaultWidth: 100 },
  { key: 'product', defaultWidth: 180 },
  { key: 'supplier', defaultWidth: 120 },
  { key: 'remainingQty', defaultWidth: 110 },
  { key: 'remainingAmount', defaultWidth: 110 },
]

const readinessColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'product', defaultWidth: 150 },
  { key: 'costPoolQty', defaultWidth: 110 },
  { key: 'costPoolValue', defaultWidth: 120 },
  { key: 'poBuyAmount', defaultWidth: 120 },
  { key: 'poSellAmount', defaultWidth: 120 },
  { key: 'netValue', defaultWidth: 120 },
  { key: 'status', defaultWidth: 100 },
]

const productColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'product', defaultWidth: 180 },
  { key: 'qty', defaultWidth: 110 },
  { key: 'sales', defaultWidth: 120 },
  { key: 'matchedCogs', defaultWidth: 120 },
  { key: 'gp', defaultWidth: 120 },
  { key: 'gpPct', defaultWidth: 100 },
]

const purchaseColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 150 },
  { key: 'date', defaultWidth: 110 },
  { key: 'supplier', defaultWidth: 180 },
  { key: 'totalAmount', defaultWidth: 120 },
  { key: 'matchedAmount', defaultWidth: 120 },
  { key: 'remainingAmount', defaultWidth: 120 },
  { key: 'status', defaultWidth: 110 },
]

const salesColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 150 },
  { key: 'date', defaultWidth: 110 },
  { key: 'customer', defaultWidth: 180 },
  { key: 'totalAmount', defaultWidth: 120 },
  { key: 'matchedCogs', defaultWidth: 120 },
  { key: 'gp', defaultWidth: 120 },
  { key: 'gpPct', defaultWidth: 100 },
  { key: 'pendingAmount', defaultWidth: 120 },
  { key: 'status', defaultWidth: 110 },
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
  { key: 'product', label: 'Trading by Product' },
  { key: 'purchase', label: 'Trading Purchase' },
  { key: 'sales', label: 'Trading Sales' },
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

function statusLabel(status: string) {
  if (status === 'matched') return 'Matched'
  if (status === 'partial') return 'Partial'
  return 'Pending'
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
      setError(caught instanceof Error ? caught.message : 'โหลด Trading Dashboard ไม่ได้')
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
      setSourceError(caught instanceof Error ? caught.message : 'โหลด Trading Cost Source ไม่ได้')
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

  const supplierOptions = useMemo(() => searchOptions(data?.options.suppliers ?? [], 'ทุก Supplier'), [data?.options.suppliers])
  const customerOptions = useMemo(() => searchOptions(data?.options.customers ?? [], 'ทุก Customer'), [data?.options.customers])
  const productOptions = useMemo(() => searchOptions(data?.options.products ?? [], 'ทุกสินค้า'), [data?.options.products])
  const sourceProductOptions = useMemo<SearchComboboxOption[]>(() => (data?.options.products ?? []).map((option) => ({
    id: option.id,
    label: optionLabel(option),
    searchText: [option.code, option.name].filter(Boolean).join(' '),
  })), [data?.options.products])
  const sourceSupplierOptions = useMemo<SearchComboboxOption[]>(() => [
    { id: 'none', label: 'ไม่ระบุ Supplier', searchText: 'ไม่ระบุ Supplier manual' },
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
      setSourceError(caught instanceof Error ? caught.message : 'สร้าง Trading Cost Source ไม่ได้')
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
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trading Dashboard</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">ภาพรวมกำไรและ allocation Trading</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Trading Sales" tone="emerald" value={formatMoney(data?.summary.tradingSales ?? 0)} />
            <Metric label="Matched COGS" tone="red" value={formatMoney(data?.summary.matchedCOGS ?? 0)} />
            <Metric label="Trading GP" tone={(data?.summary.tradingGP ?? 0) >= 0 ? 'purple' : 'red'} value={formatMoney(data?.summary.tradingGP ?? 0)} />
            <Metric label="GP%" tone="slate" value={`${(data?.summary.tradingGPPct ?? 0).toFixed(2)}%`} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-800">Operational gaps</div>
          <div className="mt-3 grid gap-3">
            <GapLine label="Pending Buy" meta={`${data?.summary.pendingPurchaseBills ?? 0} bills`} value={formatMoney(data?.summary.pendingBuyAmount ?? 0)} />
            <GapLine label="Pending Sell" meta={`${data?.summary.pendingSalesBills ?? 0} bills`} value={formatMoney(data?.summary.pendingSellAmount ?? 0)} />
            <GapLine label="Unallocated Sales" meta={`${data?.summary.allocationFactCount ?? 0} facts`} value={formatMoney(data?.summary.unallocatedSalesAmount ?? 0)} />
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[140px_140px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto_auto]">
          <DatePickerInput ariaLabel="วันที่เริ่มต้น" className="h-10 text-sm" value={visibleFromDate} onChange={setFromDate} />
          <DatePickerInput ariaLabel="วันที่สิ้นสุด" className="h-10 text-sm" value={visibleToDate} onChange={setToDate} />
          <SearchCombobox hideLabel inputClassName="h-10 text-sm border-slate-300 rounded-xl focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700" inputId="trading-dashboard-supplier" label="Supplier" options={supplierOptions} placeholder="ค้นหา Supplier" value={supplierId} onChange={setSupplierId} />
          <SearchCombobox hideLabel inputClassName="h-10 text-sm border-slate-300 rounded-xl focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700" inputId="trading-dashboard-customer" label="Customer" options={customerOptions} placeholder="ค้นหา Customer" value={customerId} onChange={setCustomerId} />
          {tab === 'product' ? (
            <SearchCombobox hideLabel inputClassName="h-10 text-sm border-slate-300 rounded-xl focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700" inputId="trading-dashboard-product" label="สินค้า" options={productOptions} placeholder="ค้นหาสินค้า" value={productId} onChange={setProductId} />
          ) : <div className="hidden lg:block" />}
          <input className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" placeholder="ค้นหาเลขบิล" value={billNo} onChange={(event) => setBillNo(event.target.value)} />
          <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs cursor-pointer" type="button" onClick={() => void loadData()}>Refresh</button>
          <button className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs cursor-pointer" type="button" onClick={clearFilters}>ล้าง</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ReadinessPanel isLoading={isLoading} rows={data?.readinessRows ?? []} summary={data?.summary ?? null} />
        <AgingPanel aging={data?.aging ?? null} isLoading={isLoading} />
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4">
          <div className="flex flex-wrap">
            {tabs.map((item) => (
              <button
                key={item.key}
                className={`border-b-2 px-4 py-3 text-sm font-semibold outline-none focus:outline-none focus:ring-0 ${tab === item.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                type="button"
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 py-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs cursor-pointer"
              type="button"
              onClick={() => setIsSourceModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Trading Cost Source
            </button>
            <Link className="rounded-xl border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs flex items-center gap-1" href="/trading/matching">Trading Matching</Link>
            <Link className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs flex items-center gap-1" href="/dual-costing/deal-margin">Deal Margin</Link>
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
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden !p-0" fallbackTitle="Trading Cost Source" hideClose>
        <DialogHeader className="bg-slate-900 text-white px-6 py-4">
          <div className="flex items-start justify-between gap-3 w-full">
            <div>
              <DialogTitle className="text-white text-base font-bold">Trading Cost Source</DialogTitle>
              <DialogDescription className="text-slate-400 text-xs mt-1">บันทึกต้นทุน Trading แบบไม่ผูก PB เพื่อใช้จับคู่กับบิลขาย Trading</DialogDescription>
            </div>
            <button className="rounded-xl px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer" type="button" onClick={onClose}>✕</button>
          </div>
        </DialogHeader>
        <div className="grid max-h-[calc(92vh-128px)] gap-4 overflow-y-auto bg-slate-50 p-4 grid-cols-2 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-100 bg-white p-4 col-span-2 lg:col-span-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="trading-cost-source-date">วันที่</label>
                <DatePickerInput ariaLabel="วันที่ Trading Cost Source" className="h-10 w-full text-sm" value={form.date} onChange={(value) => update('date', value)} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <SearchCombobox
                  inputClassName="h-10 text-sm border-slate-300 rounded-xl focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700"
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
                  inputClassName="h-10 text-sm border-slate-300 rounded-xl focus:ring-1 focus:ring-slate-200 focus:border-slate-400 focus:outline-none bg-white font-medium text-slate-700"
                  inputId="trading-cost-source-supplier"
                  label="Supplier"
                  options={supplierOptions}
                  placeholder="ค้นหา Supplier"
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
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm border border-emerald-100">
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
              {error ? <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
              <button
                className="col-span-2 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 text-sm font-semibold text-white transition-colors outline-none focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
                disabled={!canSubmit || isSaving}
                type="button"
                onClick={onSubmit}
              >
                {isSaving ? 'กำลังบันทึก...' : 'บันทึก Cost Source'}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 bg-slate-50/50">
              <div>
                <div className="text-sm font-bold text-slate-800">รายการ Cost Source ล่าสุด</div>
                <div className="text-xs text-slate-500">แสดงเฉพาะรายการ active ที่ยังเป็นต้นทุน Trading ได้</div>
              </div>
              <button className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800 outline-none focus:outline-none focus:ring-0 shadow-xs cursor-pointer transition-colors" type="button" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto p-4 overflow-hidden">
              <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
                {columnResize.hasCustomWidths ? (
                  <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
                    คืนค่าเดิมตาราง
                  </button>
                ) : null}
              </div>
              <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {costSourceColumns.map((col) => (
                    <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium text-xs">
                  <tr>
                    <ResizableTableHead label="Source" resizeProps={columnResize.getResizeHandleProps('source', 'Source')} />
                    <ResizableTableHead label="Date" resizeProps={columnResize.getResizeHandleProps('date', 'Date')} />
                    <ResizableTableHead label="Product" resizeProps={columnResize.getResizeHandleProps('product', 'Product')} />
                    <ResizableTableHead label="Supplier" resizeProps={columnResize.getResizeHandleProps('supplier', 'Supplier')} />
                    <ResizableTableHead align="right" label="Remain Qty" resizeProps={columnResize.getResizeHandleProps('remainingQty', 'Remain Qty')} />
                    <ResizableTableHead align="right" label="Remain" resizeProps={columnResize.getResizeHandleProps('remainingAmount', 'Remain')} />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
                  {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={6}>ยังไม่มี Cost Source</td></tr> : null}
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="p-2 font-mono text-xs font-semibold text-slate-800 overflow-hidden truncate">{row.sourceNo}</td>
                      <td className="p-2 text-xs overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                      <td className="p-2 overflow-hidden truncate">{row.productCode ? `${row.productCode} - ${row.productName}` : row.productName}</td>
                      <td className="p-2 overflow-hidden truncate">{row.supplierName}</td>
                      <td className="p-2 text-right overflow-hidden truncate">{formatMoney(row.remainingQty)}</td>
                      <td className="p-2 text-right font-semibold text-emerald-700 overflow-hidden truncate">{formatMoney(row.remainingAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <DialogFooter className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors h-10 outline-none focus:outline-none focus:ring-0 shadow-xs cursor-pointer flex items-center justify-center" type="button" onClick={onClose}>ปิด</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NumberField({ id, label, onChange, value }: { id: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor={id}>{label}</label>
      <input
        className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-right bg-white font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
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
  const visibleRows = rows.slice(0, 6)
  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/50">
        <div>
          <div className="text-sm font-bold text-slate-800">Stock / Cost Source Readiness</div>
          <div className="text-xs text-slate-500">PO Buy + Cost Source เทียบกับ PO Sell commitment</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Cost Source {formatMoney(summary?.readyCostPoolValue ?? 0)}</span>
          <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">PO Buy {formatMoney(summary?.poBuyExposureAmount ?? 0)}</span>
          <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">PO Sell {formatMoney(summary?.poSellExposureAmount ?? 0)}</span>
          <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">Short {summary?.readinessShortCount ?? 0}</span>
        </div>
      </div>
      <div className="p-4">
        {/* Desktop View Table */}
        <div className="hidden lg:block overflow-x-auto overflow-hidden">
          <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
            {columnResize.hasCustomWidths ? (
              <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
                คืนค่าเดิมตาราง
              </button>
            ) : null}
          </div>
          <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {readinessColumns.map((col) => (
                <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-600 font-semibold">
              <tr>
                <ResizableTableHead label="Product" resizeProps={columnResize.getResizeHandleProps('product', 'Product')} />
                <ResizableTableHead align="right" label="Cost Source Qty" resizeProps={columnResize.getResizeHandleProps('costPoolQty', 'Cost Source Qty')} />
                <ResizableTableHead align="right" label="Cost Source" resizeProps={columnResize.getResizeHandleProps('costPoolValue', 'Cost Source')} />
                <ResizableTableHead align="right" label="PO Buy" resizeProps={columnResize.getResizeHandleProps('poBuyAmount', 'PO Buy')} />
                <ResizableTableHead align="right" label="PO Sell" resizeProps={columnResize.getResizeHandleProps('poSellAmount', 'PO Sell')} />
                <ResizableTableHead align="right" label="Net" resizeProps={columnResize.getResizeHandleProps('netValue', 'Net')} />
                <ResizableTableHead align="center" label="Status" resizeProps={columnResize.getResizeHandleProps('status', 'Status')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && visibleRows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={7}>ยังไม่มี readiness ตามเงื่อนไข</td></tr> : null}
              {visibleRows.map((row) => (
                <tr key={row.productId} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-2.5 font-semibold text-slate-800 min-w-0 overflow-hidden"><div className="truncate" title={row.productName || ''}>{row.productName}</div></td>
                  <td className="p-2.5 text-right font-medium text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.costPoolQty)} {row.unit}</td>
                  <td className="p-2.5 text-right text-emerald-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.costPoolValue)}</td>
                  <td className="p-2.5 text-right text-blue-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.poBuyAmount)}</td>
                  <td className="p-2.5 text-right text-amber-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.poSellAmount)}</td>
                  <td className={`p-2.5 text-right font-bold whitespace-nowrap tabular-nums pl-4 ${row.netValue >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{formatMoney(row.netValue)}</td>
                  <td className="p-2.5 text-center whitespace-nowrap"><ReadinessStatusPill status={row.status} /></td>
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
                  <span className="text-slate-400 block mb-0.5 font-medium">Cost Source Qty</span>
                  <span className="text-slate-700 font-bold">{formatMoney(row.costPoolQty)} {row.unit}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">Cost Source Value</span>
                  <span className="text-emerald-600 font-bold">{formatMoney(row.costPoolValue)} ฿</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">PO Buy</span>
                  <span className="text-blue-600 font-bold">{formatMoney(row.poBuyAmount)} ฿</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">PO Sell</span>
                  <span className="text-amber-600 font-bold">{formatMoney(row.poSellAmount)} ฿</span>
                </div>
                <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                  <span className="text-slate-500 text-xs font-medium font-semibold">Net Value:</span>
                  <span className={`font-bold text-sm ${row.netValue >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{formatMoney(row.netValue)} ฿</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {rows.length > visibleRows.length ? <div className="mt-2.5 text-xs text-slate-400 font-medium">แสดง 6 รายการแรกจาก {rows.length} รายการ ใช้ Product filter เพื่อเจาะสินค้า</div> : null}
      </div>
    </div>
  )
}

function AgingPanel({ aging, isLoading }: { aging: DashboardPayload['aging'] | null; isLoading: boolean }) {
  const buckets: Array<keyof AgingBuckets> = ['0-7', '8-14', '15-30', '31+']
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-bold text-slate-800">Pending Aging</div>
      <div className="mt-1 text-xs text-slate-500">อายุเอกสารที่ยังมี remaining/pending</div>
      <div className="mt-3 space-y-3">
        {buckets.map((bucket) => (
          <div key={bucket} className="rounded-md bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-600">{bucket} days</div>
              <div className="text-xs text-slate-500">
                {isLoading ? '...' : `${(aging?.pendingBuy[bucket].count ?? 0) + (aging?.pendingSell[bucket].count ?? 0)} docs`}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <AgingValue label="Buy" value={aging?.pendingBuy[bucket].amount ?? 0} />
              <AgingValue label="Sell" value={aging?.pendingSell[bucket].amount ?? 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductTable({ isLoading, rows, totals }: { isLoading: boolean; rows: DashboardPayload['productRows']; totals: { cost: number; gp: number; qty: number; sales: number } }) {
  const columnResize = useResizableColumns('trading.dashboard.products.v5', productColumns)
  return (
    <div className="p-4">
      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-xs">
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-600">
            <tr>
              <th className="p-2.5 text-left font-semibold">Product</th>
              <th className="w-28 p-2.5 text-right font-semibold">Qty</th>
              <th className="w-32 p-2.5 text-right font-semibold">Sales</th>
              <th className="w-32 p-2.5 text-right font-semibold">Matched COGS</th>
              <th className="w-32 p-2.5 text-right font-semibold">GP</th>
              <th className="w-24 p-2.5 text-right font-semibold">GP%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={6}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
            {rows.map((row) => (
              <tr key={row.productId} className="hover:bg-slate-50/30 transition-colors">
                <td className="p-2.5 font-semibold text-slate-800 min-w-0 overflow-hidden"><div className="truncate" title={row.productName || ''}>{row.productName}</div></td>
                <td className="p-2.5 text-right font-medium text-slate-700 whitespace-nowrap tabular-nums pl-4">{formatMoney(row.qty)} {row.unit}</td>
                <td className="p-2.5 text-right text-emerald-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.sales)}</td>
                <td className="p-2.5 text-right text-red-700 font-semibold whitespace-nowrap tabular-nums pl-4">{formatMoney(row.cost)}</td>
                <td className={`p-2.5 text-right font-bold whitespace-nowrap tabular-nums pl-4 ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</td>
                <td className="p-2.5 text-right font-medium text-slate-500 whitespace-nowrap tabular-nums pl-4">{row.gpPct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-slate-50 font-bold border-slate-200 text-slate-700">
            <tr>
              <td className="p-2.5">รวม</td>
              <td className="p-2.5 text-right">{formatMoney(totals.qty)}</td>
              <td className="p-2.5 text-right text-emerald-700">{formatMoney(totals.sales)}</td>
              <td className="p-2.5 text-right text-red-700">{formatMoney(totals.cost)}</td>
              <td className={`p-2.5 text-right ${totals.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(totals.gp)}</td>
              <td className="p-2.5 text-right">{totals.sales > 0 ? (totals.gp / totals.sales * 100).toFixed(2) : '0.00'}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile view Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.length === 0 ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && rows.map((row) => (
          <div key={row.productId} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">{row.productName}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Qty</span>
                <span className="text-slate-700 font-bold">{formatMoney(row.qty)} {row.unit}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Sales</span>
                <span className="text-emerald-600 font-bold">{formatMoney(row.sales)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Matched COGS</span>
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
  return (
    <div className="p-4">
      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {purchaseColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-700 font-semibold">
            <tr>
              <ResizableTableHead label="PB / Cost Source" resizeProps={columnResize.getResizeHandleProps('docNo', 'PB / Cost Source')} />
              <ResizableTableHead label="Date" resizeProps={columnResize.getResizeHandleProps('date', 'Date')} />
              <ResizableTableHead label="Supplier" resizeProps={columnResize.getResizeHandleProps('supplier', 'Supplier')} />
              <ResizableTableHead align="right" label="Buy Amount" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'Buy Amount')} />
              <ResizableTableHead align="right" label="Matched Cost" resizeProps={columnResize.getResizeHandleProps('matchedAmount', 'Matched Cost')} />
              <ResizableTableHead align="right" label="Remaining" resizeProps={columnResize.getResizeHandleProps('remainingAmount', 'Remaining')} />
              <ResizableTableHead align="center" label="Status" resizeProps={columnResize.getResizeHandleProps('status', 'Status')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={7}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                <td className="p-2.5 font-mono font-semibold overflow-hidden truncate"><Link className="text-purple-700 hover:underline" href={row.sourceUrl}>{row.docNo}</Link></td>
                <td className="p-2.5 text-slate-500 font-medium overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                <td className="p-2.5 text-slate-800 font-medium overflow-hidden truncate">{row.partyName}</td>
                <td className="p-2.5 text-right font-semibold text-slate-700 overflow-hidden truncate">{formatMoney(row.totalAmount)}</td>
                <td className="p-2.5 text-right text-red-700 font-semibold overflow-hidden truncate">{formatMoney(row.matchedAmount)}</td>
                <td className="p-2.5 text-right font-bold text-amber-700 overflow-hidden truncate">{formatMoney(row.remainingAmount)}</td>
                <td className="p-2.5 text-center overflow-hidden truncate"><StatusPill status={row.allocationStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.length === 0 ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && rows.map((row) => (
          <div key={row.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div className="font-mono text-xs font-semibold text-purple-700">
                <Link className="hover:underline" href={row.sourceUrl}>{row.docNo}</Link>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="col-span-2">
                <span className="text-slate-400 block mb-0.5 font-medium">Supplier</span>
                <span className="text-slate-800 font-semibold">{row.partyName}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Buy Amount</span>
                <span className="text-slate-700 font-bold">{formatMoney(row.totalAmount)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Matched Cost</span>
                <span className="text-red-600 font-bold">{formatMoney(row.matchedAmount)} ฿</span>
              </div>
              <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  <span className="text-slate-500 text-xs font-medium font-semibold">Remaining:</span>
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
  return (
    <div className="p-4">
      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {salesColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-700 font-semibold">
            <tr>
              <ResizableTableHead label="SB" resizeProps={columnResize.getResizeHandleProps('docNo', 'SB')} />
              <ResizableTableHead label="Date" resizeProps={columnResize.getResizeHandleProps('date', 'Date')} />
              <ResizableTableHead label="Customer" resizeProps={columnResize.getResizeHandleProps('customer', 'Customer')} />
              <ResizableTableHead align="right" label="Sales Amount" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'Sales Amount')} />
              <ResizableTableHead align="right" label="Matched COGS" resizeProps={columnResize.getResizeHandleProps('matchedCogs', 'Matched COGS')} />
              <ResizableTableHead align="right" label="GP" resizeProps={columnResize.getResizeHandleProps('gp', 'GP')} />
              <ResizableTableHead align="right" label="GP%" resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} />
              <ResizableTableHead align="right" label="Pending" resizeProps={columnResize.getResizeHandleProps('pendingAmount', 'Pending')} />
              <ResizableTableHead align="center" label="Status" resizeProps={columnResize.getResizeHandleProps('status', 'Status')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                <td className="p-2.5 font-mono font-semibold overflow-hidden truncate"><Link className="text-purple-700 hover:underline" href={row.sourceUrl}>{row.docNo}</Link></td>
                <td className="p-2.5 text-slate-500 font-medium overflow-hidden truncate">{formatDateDisplay(row.date)}</td>
                <td className="p-2.5 text-slate-800 font-medium overflow-hidden truncate">{row.partyName}</td>
                <td className="p-2.5 text-right text-emerald-700 font-semibold overflow-hidden truncate">{formatMoney(row.totalAmount)}</td>
                <td className="p-2.5 text-right text-red-700 font-semibold overflow-hidden truncate">{formatMoney(row.matchedCogs)}</td>
                <td className={`p-2.5 text-right font-bold overflow-hidden truncate ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</td>
                <td className="p-2.5 text-right font-medium text-slate-500 overflow-hidden truncate">{row.gpPct.toFixed(2)}%</td>
                <td className="p-2.5 text-right font-semibold text-amber-700 overflow-hidden truncate">{formatMoney(row.pendingAmount)}</td>
                <td className="p-2.5 text-center overflow-hidden truncate"><StatusPill status={row.allocationStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && rows.length === 0 ? <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">ยังไม่มีข้อมูลตามเงื่อนไข</div> : null}
        {!isLoading && rows.map((row) => (
          <div key={row.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div className="font-mono text-xs font-semibold text-purple-700">
                <Link className="hover:underline" href={row.sourceUrl}>{row.docNo}</Link>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="col-span-2">
                <span className="text-slate-400 block mb-0.5 font-medium">Customer</span>
                <span className="text-slate-800 font-semibold">{row.partyName}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Sales Amount</span>
                <span className="text-emerald-600 font-bold">{formatMoney(row.totalAmount)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Matched COGS</span>
                <span className="text-red-600 font-bold">{formatMoney(row.matchedCogs)} ฿</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">GP%</span>
                <span className="text-slate-700 font-semibold">{row.gpPct.toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Pending</span>
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
  const tones = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', emoji: '📈' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', emoji: '💰' },
    red: { bg: 'bg-red-50', text: 'text-red-600', emoji: '📉' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', emoji: '🏷️' }
  }
  const style = tones[tone] ?? tones.slate
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3 w-full">
      <div className={`w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-lg shrink-0`}>
        {style.emoji}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-semibold mb-0.5">{label}</div>
        <div className="text-lg font-bold text-slate-800 leading-tight">{value}</div>
      </div>
    </div>
  )
}

function GapLine({ label, meta, value }: { label: string; meta: string; value: string }) {
  const isPendingBuy = label.includes('Buy')
  const emoji = isPendingBuy ? '📥' : label.includes('Sell') ? '📤' : '⚖️'
  const iconBg = isPendingBuy ? 'bg-amber-50 text-amber-600' : label.includes('Sell') ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
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
  if (status === 'short') return <span className="inline-flex rounded-xl border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">Short</span>
  if (status === 'ready') return <span className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">Ready</span>
  return <span className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-600">Idle</span>
}

function AgingValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-2.5 shadow-2xs">
      <div className="text-xs text-slate-500 font-semibold mb-0.5">{label}</div>
      <div className="text-xs font-bold text-slate-800">{formatMoney(value)}</div>
    </div>
  )
}
