'use client'

import Link from 'next/link'
import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

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
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trading Dashboard</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">ภาพรวมกำไรและ allocation Trading</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Trading Sales" tone="emerald" value={formatMoney(data?.summary.tradingSales ?? 0)} />
            <Metric label="Matched COGS" tone="red" value={formatMoney(data?.summary.matchedCOGS ?? 0)} />
            <Metric label="Trading GP" tone={(data?.summary.tradingGP ?? 0) >= 0 ? 'purple' : 'red'} value={formatMoney(data?.summary.tradingGP ?? 0)} />
            <Metric label="GP%" tone="slate" value={`${(data?.summary.tradingGPPct ?? 0).toFixed(2)}%`} />
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-800">Operational gaps</div>
          <div className="mt-3 grid gap-3">
            <GapLine label="Pending Buy" meta={`${data?.summary.pendingPurchaseBills ?? 0} bills`} value={formatMoney(data?.summary.pendingBuyAmount ?? 0)} />
            <GapLine label="Pending Sell" meta={`${data?.summary.pendingSalesBills ?? 0} bills`} value={formatMoney(data?.summary.pendingSellAmount ?? 0)} />
            <GapLine label="Unallocated Sales" meta={`${data?.summary.allocationFactCount ?? 0} facts`} value={formatMoney(data?.summary.unallocatedSalesAmount ?? 0)} />
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[130px_130px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto_auto]">
          <DatePickerInput ariaLabel="วันที่เริ่มต้น" className="h-9" value={visibleFromDate} onChange={setFromDate} />
          <DatePickerInput ariaLabel="วันที่สิ้นสุด" className="h-9" value={visibleToDate} onChange={setToDate} />
          <SearchCombobox hideLabel inputClassName="h-9 text-sm" inputId="trading-dashboard-supplier" label="Supplier" options={supplierOptions} placeholder="ค้นหา Supplier" value={supplierId} onChange={setSupplierId} />
          <SearchCombobox hideLabel inputClassName="h-9 text-sm" inputId="trading-dashboard-customer" label="Customer" options={customerOptions} placeholder="ค้นหา Customer" value={customerId} onChange={setCustomerId} />
          {tab === 'product' ? (
            <SearchCombobox hideLabel inputClassName="h-9 text-sm" inputId="trading-dashboard-product" label="สินค้า" options={productOptions} placeholder="ค้นหาสินค้า" value={productId} onChange={setProductId} />
          ) : <div className="hidden lg:block" />}
          <input className="h-9 rounded-md border border-slate-300 px-3 text-sm" placeholder="ค้นหาเลขบิล" value={billNo} onChange={(event) => setBillNo(event.target.value)} />
          <button className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={() => void loadData()}>Refresh</button>
          <button className="h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50" type="button" onClick={clearFilters}>ล้าง</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ReadinessPanel isLoading={isLoading} rows={data?.readinessRows ?? []} summary={data?.summary ?? null} />
        <AgingPanel aging={data?.aging ?? null} isLoading={isLoading} />
      </div>

      <div className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4">
          <div className="flex flex-wrap">
            {tabs.map((item) => (
              <button
                key={item.key}
                className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                type="button"
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 py-2">
            <button
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              type="button"
              onClick={() => setIsSourceModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Trading Cost Source
            </button>
            <Link className="rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700" href="/trading/matching">Trading Matching</Link>
            <Link className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700" href="/dual-costing/deal-margin">Deal Margin</Link>
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
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Trading Cost Source</DialogTitle>
              <DialogDescription>บันทึกต้นทุน Trading แบบไม่ผูก PB เพื่อใช้จับคู่กับบิลขาย Trading</DialogDescription>
            </div>
            <button className="rounded-md px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-white" type="button" onClick={onClose}>ปิด</button>
          </div>
        </DialogHeader>
        <div className="grid max-h-[calc(92vh-128px)] gap-4 overflow-y-auto bg-slate-50 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="trading-cost-source-date">วันที่</label>
                <DatePickerInput ariaLabel="วันที่ Trading Cost Source" className="h-9 w-full" value={form.date} onChange={(value) => update('date', value)} />
              </div>
              <SearchCombobox
                inputClassName="h-9 text-sm"
                inputId="trading-cost-source-product"
                label="สินค้า *"
                options={productOptions}
                placeholder="ค้นหาสินค้า"
                value={form.productId}
                onChange={(value) => update('productId', value)}
              />
              <SearchCombobox
                inputClassName="h-9 text-sm"
                inputId="trading-cost-source-supplier"
                label="Supplier"
                options={supplierOptions}
                placeholder="ค้นหา Supplier"
                value={form.supplierId}
                onChange={(value) => update('supplierId', value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField id="trading-cost-source-qty" label="จำนวน" value={form.qty} onChange={(value) => update('qty', value)} />
                <NumberField id="trading-cost-source-unit-cost" label="ต้นทุน/หน่วย" value={form.unitCost} onChange={(value) => update('unitCost', value)} />
              </div>
              <NumberField id="trading-cost-source-total" label="มูลค่ารวม" value={form.totalAmount} onChange={(value) => update('totalAmount', value)} />
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm">
                <div className="text-xs font-semibold text-emerald-700">ยอดที่จะบันทึก</div>
                <div className="font-bold text-emerald-900">{formatMoney(estimatedTotal)}</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="trading-cost-source-notes">หมายเหตุ</label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  id="trading-cost-source-notes"
                  value={form.notes}
                  onChange={(event) => update('notes', event.target.value)}
                />
              </div>
              {error ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
              <button
                className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={!canSubmit || isSaving}
                type="button"
                onClick={onSubmit}
              >
                {isSaving ? 'กำลังบันทึก...' : 'บันทึก Cost Source'}
              </button>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-slate-800">รายการ Cost Source ล่าสุด</div>
                <div className="text-xs text-slate-500">แสดงเฉพาะรายการ active ที่ยังเป็นต้นทุน Trading ได้</div>
              </div>
              <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <thead className="bg-slate-100 text-xs text-slate-600">
                  <tr>
                    <th className="w-32 p-2 text-left">Source</th>
                    <th className="w-24 p-2 text-left">Date</th>
                    <th className="p-2 text-left">Product</th>
                    <th className="w-32 p-2 text-left">Supplier</th>
                    <th className="w-28 p-2 text-right">Remain Qty</th>
                    <th className="w-28 p-2 text-right">Remain</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
                  {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={6}>ยังไม่มี Cost Source</td></tr> : null}
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="p-2 font-mono text-xs font-semibold text-slate-800">{row.sourceNo}</td>
                      <td className="p-2 text-xs">{formatDateDisplay(row.date)}</td>
                      <td className="p-2">{row.productCode ? `${row.productCode} - ${row.productName}` : row.productName}</td>
                      <td className="p-2">{row.supplierName}</td>
                      <td className="p-2 text-right">{formatMoney(row.remainingQty)}</td>
                      <td className="p-2 text-right font-semibold text-emerald-700">{formatMoney(row.remainingAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <button className="h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={onClose}>ปิด</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NumberField({ id, label, onChange, value }: { id: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={id}>{label}</label>
      <input
        className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-right"
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
  const visibleRows = rows.slice(0, 6)
  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
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
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600">
            <tr>
              <th className="p-2 text-left">Product</th>
              <th className="w-28 p-2 text-right">Cost Source Qty</th>
              <th className="w-32 p-2 text-right">Cost Source</th>
              <th className="w-32 p-2 text-right">PO Buy</th>
              <th className="w-32 p-2 text-right">PO Sell</th>
              <th className="w-32 p-2 text-right">Net</th>
              <th className="w-24 p-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && visibleRows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={7}>ยังไม่มี readiness ตามเงื่อนไข</td></tr> : null}
            {visibleRows.map((row) => (
              <tr key={row.productId} className="border-t border-slate-200">
                <td className="p-2 font-semibold text-slate-800">{row.productName}</td>
                <td className="p-2 text-right">{formatMoney(row.costPoolQty)} {row.unit}</td>
                <td className="p-2 text-right text-emerald-700">{formatMoney(row.costPoolValue)}</td>
                <td className="p-2 text-right text-blue-700">{formatMoney(row.poBuyAmount)}</td>
                <td className="p-2 text-right text-amber-700">{formatMoney(row.poSellAmount)}</td>
                <td className={`p-2 text-right font-bold ${row.netValue >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{formatMoney(row.netValue)}</td>
                <td className="p-2 text-center"><ReadinessStatusPill status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > visibleRows.length ? <div className="mt-2 text-xs text-slate-500">แสดง 6 รายการแรกจาก {rows.length} รายการ ใช้ Product filter เพื่อเจาะสินค้า</div> : null}
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
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[860px] table-fixed text-sm">
        <thead className="bg-slate-100 text-xs text-slate-600">
          <tr>
            <th className="p-2 text-left">Product</th>
            <th className="w-28 p-2 text-right">Qty</th>
            <th className="w-32 p-2 text-right">Sales</th>
            <th className="w-32 p-2 text-right">Matched COGS</th>
            <th className="w-32 p-2 text-right">GP</th>
            <th className="w-24 p-2 text-right">GP%</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={6}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
          {rows.map((row) => (
            <tr key={row.productId} className="border-t border-slate-200">
              <td className="p-2 font-semibold text-slate-800">{row.productName}</td>
              <td className="p-2 text-right">{formatMoney(row.qty)} {row.unit}</td>
              <td className="p-2 text-right text-emerald-700">{formatMoney(row.sales)}</td>
              <td className="p-2 text-right text-red-700">{formatMoney(row.cost)}</td>
              <td className={`p-2 text-right font-bold ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</td>
              <td className="p-2 text-right">{row.gpPct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-slate-50 font-bold">
          <tr>
            <td className="p-2">รวม</td>
            <td className="p-2 text-right">{formatMoney(totals.qty)}</td>
            <td className="p-2 text-right text-emerald-700">{formatMoney(totals.sales)}</td>
            <td className="p-2 text-right text-red-700">{formatMoney(totals.cost)}</td>
            <td className={`p-2 text-right ${totals.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(totals.gp)}</td>
            <td className="p-2 text-right">{totals.sales > 0 ? (totals.gp / totals.sales * 100).toFixed(2) : '0.00'}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function PurchaseTable({ isLoading, rows }: { isLoading: boolean; rows: DashboardPayload['purchaseRows'] }) {
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[900px] table-fixed text-sm">
        <thead className="bg-slate-100 text-xs text-slate-600">
          <tr>
            <th className="w-40 p-2 text-left">PB / Cost Source</th>
            <th className="w-28 p-2 text-left">Date</th>
            <th className="p-2 text-left">Supplier</th>
            <th className="w-32 p-2 text-right">Buy Amount</th>
            <th className="w-32 p-2 text-right">Matched Cost</th>
            <th className="w-32 p-2 text-right">Remaining</th>
            <th className="w-28 p-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={7}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-200">
              <td className="p-2 font-mono text-xs font-semibold"><Link className="text-purple-700 hover:underline" href={row.sourceUrl}>{row.docNo}</Link></td>
              <td className="p-2 text-xs">{formatDateDisplay(row.date)}</td>
              <td className="p-2">{row.partyName}</td>
              <td className="p-2 text-right">{formatMoney(row.totalAmount)}</td>
              <td className="p-2 text-right text-red-700">{formatMoney(row.matchedAmount)}</td>
              <td className="p-2 text-right font-semibold text-amber-700">{formatMoney(row.remainingAmount)}</td>
              <td className="p-2 text-center"><StatusPill status={row.allocationStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SalesTable({ isLoading, rows }: { isLoading: boolean; rows: DashboardPayload['salesRows'] }) {
  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[980px] table-fixed text-sm">
        <thead className="bg-slate-100 text-xs text-slate-600">
          <tr>
            <th className="w-40 p-2 text-left">SB</th>
            <th className="w-28 p-2 text-left">Date</th>
            <th className="p-2 text-left">Customer</th>
            <th className="w-32 p-2 text-right">Sales Amount</th>
            <th className="w-32 p-2 text-right">Matched COGS</th>
            <th className="w-32 p-2 text-right">GP</th>
            <th className="w-24 p-2 text-right">GP%</th>
            <th className="w-32 p-2 text-right">Pending</th>
            <th className="w-28 p-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>ยังไม่มีข้อมูลตามเงื่อนไข</td></tr> : null}
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-200">
              <td className="p-2 font-mono text-xs font-semibold"><Link className="text-purple-700 hover:underline" href={row.sourceUrl}>{row.docNo}</Link></td>
              <td className="p-2 text-xs">{formatDateDisplay(row.date)}</td>
              <td className="p-2">{row.partyName}</td>
              <td className="p-2 text-right text-emerald-700">{formatMoney(row.totalAmount)}</td>
              <td className="p-2 text-right text-red-700">{formatMoney(row.matchedCogs)}</td>
              <td className={`p-2 text-right font-bold ${row.gp >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</td>
              <td className="p-2 text-right">{row.gpPct.toFixed(2)}%</td>
              <td className="p-2 text-right text-amber-700">{formatMoney(row.pendingAmount)}</td>
              <td className="p-2 text-center"><StatusPill status={row.allocationStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, tone, value }: { label: string; tone: 'emerald' | 'purple' | 'red' | 'slate'; value: string }) {
  const toneClass = {
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    purple: 'text-purple-700 bg-purple-50 border-purple-100',
    red: 'text-red-700 bg-red-50 border-red-100',
    slate: 'text-slate-800 bg-slate-50 border-slate-100',
  }[tone]
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  )
}

function GapLine({ label, meta, value }: { label: string; meta: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{meta}</div>
      </div>
      <div className="text-sm font-bold text-amber-700">{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClass(status)}`}>{statusLabel(status)}</span>
}

function ReadinessStatusPill({ status }: { status: string }) {
  if (status === 'short') return <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Short</span>
  if (status === 'ready') return <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Ready</span>
  return <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">Idle</span>
}

function AgingValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-800">{formatMoney(value)}</div>
    </div>
  )
}
