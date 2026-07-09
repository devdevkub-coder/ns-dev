'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { KpiCard as SharedKpiCard, type KpiCardTone } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { formatDateDisplay } from '@/lib/format'

type Option = { active: boolean; code?: string; creditTerm?: number; id: string; name: string }
type ProductRow = {
  avgBuy: number
  avgSell: number
  buyAmount: number
  buyBillCount: number
  buyQty: number
  code: string
  cogs: number
  gp: number
  gpPct: number
  id: string
  metalGroup: string
  name: string
  profitPerKg: number
  revenue: number
  sellBillCount: number
  sellQty: number
  stockQty: number
  stockValue: number
}
type ProfitCostPayload = {
  alerts: { amount: number; label: string; severity: string; type: string }[]
  filters: {
    branches: Option[]
    customers: Option[]
    dateFrom: string
    dateTo: string
    metalGroups: string[]
    purchaseChannels: Option[]
    salesChannels: Option[]
    selectedMetalGroups: string[]
    suppliers: Option[]
  }
  rows: {
    channels: { amount: number; billCount: number; gp: number; gpPct: number; group: string; name: string; qty: number }[]
    customers: { amount: number; billCount: number; cogs: number; gp: number; gpPct: number; name: string; receivable: number; received: number; qty: number }[]
    products: ProductRow[]
    suppliers: { amount: number; billCount: number; name: string; paid: number; payable: number; qty: number }[]
    trend: { buyAmount: number; buyQty: number; cogs: number; date: string; gp: number; revenue: number; sellQty: number }[]
  }
  sourceState: { limitations: string[]; writeActionsEnabled: false }
  summary: Record<string, number>
  top: { byGp: ProductRow[]; byRevenue: ProductRow[]; byStockValue: ProductRow[] }
}

type Tab = 'alerts' | 'channels' | 'customers' | 'products' | 'suppliers' | 'trend'
type SortDirection = 'asc' | 'desc'
type ProductColumnKey = 'avgBuy' | 'avgSell' | 'buyAmount' | 'buyQty' | 'code' | 'cogs' | 'gp' | 'gpPct' | 'metalGroup' | 'name' | 'profitPerKg' | 'revenue' | 'sellQty' | 'stockQty' | 'stockValue'

const reportTabs: { key: Tab; label: string }[] = [
  { key: 'products', label: 'สินค้า' },
  { key: 'suppliers', label: 'ผู้ขาย' },
  { key: 'customers', label: 'ลูกค้า' },
  { key: 'channels', label: 'ช่องทาง' },
  { key: 'trend', label: 'แนวโน้ม' },
  { key: 'alerts', label: 'แจ้งเตือน' },
]

const productColumns: Array<ResizableColumnDefinition<ProductColumnKey> & { align?: 'center' | 'left' | 'right'; label: string }> = [
  { key: 'code', label: 'รหัสสินค้า', defaultWidth: 120, minWidth: 100 },
  { key: 'name', label: 'สินค้า', defaultWidth: 220, minWidth: 160 },
  { key: 'metalGroup', label: 'หมวดโลหะ', defaultWidth: 120, minWidth: 100 },
  { key: 'buyQty', label: 'ซื้อ (กก.)', defaultWidth: 115, minWidth: 100, align: 'right' },
  { key: 'buyAmount', label: 'มูลค่าซื้อ', defaultWidth: 125, minWidth: 110, align: 'right' },
  { key: 'avgBuy', label: 'ซื้อเฉลี่ย', defaultWidth: 115, minWidth: 100, align: 'right' },
  { key: 'sellQty', label: 'ขาย (กก.)', defaultWidth: 115, minWidth: 100, align: 'right' },
  { key: 'revenue', label: 'รายได้', defaultWidth: 125, minWidth: 110, align: 'right' },
  { key: 'avgSell', label: 'ขายเฉลี่ย', defaultWidth: 115, minWidth: 100, align: 'right' },
  { key: 'cogs', label: 'COGS', defaultWidth: 120, minWidth: 105, align: 'right' },
  { key: 'gp', label: 'GP', defaultWidth: 120, minWidth: 105, align: 'right' },
  { key: 'gpPct', label: 'GP%', defaultWidth: 90, minWidth: 80, align: 'right' },
  { key: 'profitPerKg', label: 'กำไร/กก.', defaultWidth: 115, minWidth: 100, align: 'right' },
  { key: 'stockQty', label: 'สต๊อก', defaultWidth: 115, minWidth: 100, align: 'right' },
  { key: 'stockValue', label: 'มูลค่าสต๊อก', defaultWidth: 130, minWidth: 115, align: 'right' },
]

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthStart() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function ProfitCostAnalysisPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [branchId, setBranchId] = useState('')
  const [purchaseChannelId, setPurchaseChannelId] = useState('')
  const [salesChannelId, setSalesChannelId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [selectedMetalGroups, setSelectedMetalGroups] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('products')
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null)
  const [data, setData] = useState<ProfitCostPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to })
    if (branchId) params.set('branchId', branchId)
    if (purchaseChannelId) params.set('purchaseChannelId', purchaseChannelId)
    if (salesChannelId) params.set('salesChannelId', salesChannelId)
    if (supplierId) params.set('supplierId', supplierId)
    if (customerId) params.set('customerId', customerId)
    selectedMetalGroups.forEach((group) => params.append('metalGroup', group))
    return params.toString()
  }, [branchId, customerId, from, purchaseChannelId, salesChannelId, selectedMetalGroups, supplierId, to])

  useEffect(() => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    dailyFetchJson<ProfitCostPayload>(`/api/profit-cost-analysis?${query}`)
      .then((payload) => {
        if (latestLoadRequestRef.current !== requestId) return
        setData(payload)
        if (selectedMetalGroups.length === 0 && payload.filters.selectedMetalGroups.length > 0) {
          setSelectedMetalGroups(payload.filters.selectedMetalGroups)
        }
      })
      .catch((caught) => {
        if (latestLoadRequestRef.current !== requestId) return
        setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
      })
      .finally(() => {
        if (latestLoadRequestRef.current !== requestId) return
        setIsLoading(false)
      })
  }, [query, selectedMetalGroups.length])

  const supplierSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters.suppliers ?? []).map((supplier) => ({
      id: supplier.id,
      label: supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name,
    }))
  }, [data?.filters.suppliers])

  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters.customers ?? []).map((customer) => ({
      id: customer.id,
      label: customer.code ? `${customer.code} - ${customer.name}` : customer.name,
    }))
  }, [data?.filters.customers])

  const summary = data?.summary ?? {}
  const metalGroups = data?.filters.metalGroups ?? []
  const hasActiveFilters = from !== monthStart()
    || to !== today()
    || Boolean(branchId || purchaseChannelId || salesChannelId || supplierId || customerId)
    || selectedMetalGroups.length > 0

  function toggleMetalGroup(group: string) {
    setSelectedMetalGroups((current) => current.includes(group) ? current.filter((value) => value !== group) : [...current, group])
  }

  function clearFilters() {
    setFrom(monthStart())
    setTo(today())
    setBranchId('')
    setPurchaseChannelId('')
    setSalesChannelId('')
    setSupplierId('')
    setCustomerId('')
    setSelectedMetalGroups([])
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="ซื้อรวม" tone="blue" value={money(summary.purchaseAmount)} sub={`${money(summary.purchaseQty)} กก.`} />
        <Metric label="ขายรวม" tone="emerald" value={money(summary.revenue)} sub={`${money(summary.salesQty)} กก.`} />
        <Metric label="COGS" tone="orange" value={money(summary.cogs)} sub="ต้นทุนขาย" />
        <Metric label="GP" tone={(summary.gp ?? 0) >= 0 ? 'purple' : 'red'} value={money(summary.gp)} sub={`${pct(summary.gpPct)}%`} />
        <Metric label="สต๊อกคงเหลือ" tone="amber" value={money(summary.stockQty)} sub="กก." />
        <Metric label="มูลค่าสต๊อก" tone="slate" value={money(summary.stockValue)} sub="รวมตามตัวกรอง" />
        <Metric label="ซื้อเฉลี่ย/กก." tone="cyan" value={money(summary.avgBuy)} sub="ราคาซื้อเฉลี่ย" />
        <Metric label="ขายเฉลี่ย/กก." tone="emerald" value={money(summary.avgSell)} sub="ราคาขายเฉลี่ย" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="เจ้าหนี้คงเหลือ" tone="red" value={money(summary.ap)} sub="AP" />
        <Metric label="ลูกหนี้คงเหลือ" tone="cyan" value={money(summary.ar)} sub="AR" />
        <Metric label="ผู้ขายที่ซื้อ" tone="blue" value={String(summary.supplierCount ?? 0)} sub="ราย" />
        <Metric label="ลูกค้าที่ขาย" tone="purple" value={String(summary.customerCount ?? 0)} sub="ราย" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Top 10 สินค้ายอดขาย">
          <BarRows rows={(data?.top.byRevenue ?? []).map((row) => ({ label: row.name, value: row.revenue }))} />
        </Panel>
        <Panel title="Top 10 สินค้า GP">
          <BarRows rows={(data?.top.byGp ?? []).map((row) => ({ label: row.name, value: row.gp }))} />
        </Panel>
        <Panel title="Top 10 มูลค่าสต๊อก">
          <BarRows rows={(data?.top.byStockValue ?? []).map((row) => ({ label: row.name, value: row.stockValue }))} />
        </Panel>
      </div>

      <Tabs className="gap-2" value={activeTab} onValueChange={(value) => setActiveTab(value as Tab)}>
        <TabsList className="w-full overflow-x-auto" variant="line">
          {reportTabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} variant="line">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500">ช่วงวันที่</div>
            <div className="truncate text-sm font-semibold text-slate-900">{from || 'ไม่จำกัด'} → {to || 'ไม่จำกัด'}</div>
          </div>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-200"
            type="button"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง{hasActiveFilters ? ' (มี)' : ''}
          </button>
        </div>
      </div>

      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="space-y-3">
          <div className="grid items-end gap-2 md:grid-cols-2 xl:grid-cols-[minmax(300px,1.2fr)_minmax(140px,0.75fr)_minmax(160px,0.85fr)_minmax(160px,0.85fr)_minmax(220px,1fr)_minmax(220px,1fr)]">
            <Field label="วันที่">
              <div className="grid grid-cols-[minmax(135px,1fr)_auto_minmax(135px,1fr)] items-center gap-2">
                <DatePickerInput className="h-9 w-full" value={from} onChange={setFrom} />
                <span className="text-xs text-slate-400">→</span>
                <DatePickerInput className="h-9 w-full" value={to} onChange={setTo} />
              </div>
            </Field>
            <Field label="สาขา"><Select options={data?.filters.branches ?? []} value={branchId} onChange={setBranchId} /></Field>
            <Field label="ช่องทางซื้อ"><Select options={data?.filters.purchaseChannels ?? []} value={purchaseChannelId} onChange={setPurchaseChannelId} /></Field>
            <Field label="ช่องทางขาย"><Select options={data?.filters.salesChannels ?? []} value={salesChannelId} onChange={setSalesChannelId} /></Field>
            <Field label="ผู้ขาย">
              <div>
                <SearchCombobox
                  inputId="profit-supplier-select"
                  label="ผู้ขาย"
                  hideLabel
                  inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
                  placeholder="ทุกผู้ขาย"
                  options={supplierSearchOptions}
                  value={supplierId}
                  onChange={setSupplierId}
                />
              </div>
            </Field>
            <Field label="ลูกค้า">
              <div>
                <SearchCombobox
                  inputId="profit-customer-select"
                  label="ลูกค้า"
                  hideLabel
                  inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
                  placeholder="ทุกลูกค้า"
                  options={customerSearchOptions}
                  value={customerId}
                  onChange={setCustomerId}
                />
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">หมวดสินค้า:</span>
              <button className={`${segmentClass} ${selectedMetalGroups.length === 0 ? selectedSegmentClass : idleSegmentClass}`} type="button" onClick={() => setSelectedMetalGroups([])}>ทุกหมวด</button>
              {metalGroups.map((group) => <button key={group} className={`${segmentClass} ${selectedMetalGroups.includes(group) ? selectedSegmentClass : idleSegmentClass}`} type="button" onClick={() => toggleMetalGroup(group)}>{group}</button>)}
              {metalGroups.length === 0 ? <span className="text-sm text-slate-400">ไม่มีหมวดสินค้า</span> : null}
            </div>
            {hasActiveFilters ? (
              <button className="ml-auto h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-200" type="button" onClick={clearFilters}>ล้างตัวกรอง</button>
            ) : null}
          </div>
        </div>
      </div>

      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรอง Profit Cost"
          onClose={() => setShowMobileFilters(false)}
          footer={(
            <>
              <button className="h-10 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700" type="button" onClick={clearFilters}>ล้าง</button>
              <button className="h-10 rounded-md bg-blue-600 text-sm font-semibold text-white" type="button" onClick={() => setShowMobileFilters(false)}>ปิด</button>
            </>
          )}
        >
          <div className="space-y-4">
            <Field label="วันที่">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <DatePickerInput className="h-9 w-full" value={from} onChange={setFrom} />
                <span className="text-xs text-slate-400">→</span>
                <DatePickerInput className="h-9 w-full" value={to} onChange={setTo} />
              </div>
            </Field>
            <Field label="สาขา"><Select options={data?.filters.branches ?? []} value={branchId} onChange={setBranchId} /></Field>
            <Field label="ช่องทางซื้อ"><Select options={data?.filters.purchaseChannels ?? []} value={purchaseChannelId} onChange={setPurchaseChannelId} /></Field>
            <Field label="ช่องทางขาย"><Select options={data?.filters.salesChannels ?? []} value={salesChannelId} onChange={setSalesChannelId} /></Field>
            <Field label="ผู้ขาย">
              <SearchCombobox
                inputId="profit-supplier-select-mobile"
                label="ผู้ขาย"
                hideLabel
                inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
                placeholder="ทุกผู้ขาย"
                options={supplierSearchOptions}
                value={supplierId}
                onChange={setSupplierId}
              />
            </Field>
            <Field label="ลูกค้า">
              <SearchCombobox
                inputId="profit-customer-select-mobile"
                label="ลูกค้า"
                hideLabel
                inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
                placeholder="ทุกลูกค้า"
                options={customerSearchOptions}
                value={customerId}
                onChange={setCustomerId}
              />
            </Field>
            <Field label="หมวดสินค้า">
              <div className="flex flex-wrap items-center gap-2">
                <button className={`${segmentClass} ${selectedMetalGroups.length === 0 ? selectedSegmentClass : idleSegmentClass}`} type="button" onClick={() => setSelectedMetalGroups([])}>ทุกหมวด</button>
                {metalGroups.map((group) => <button key={group} className={`${segmentClass} ${selectedMetalGroups.includes(group) ? selectedSegmentClass : idleSegmentClass}`} type="button" onClick={() => toggleMetalGroup(group)}>{group}</button>)}
              </div>
            </Field>
          </div>
        </MobileFilterSheet>
      ) : null}

      <div>
        {activeTab === 'products' ? <ProductTable rows={data?.rows.products ?? []} onSelect={setSelectedProduct} /> : null}
        {activeTab === 'suppliers' ? <SimpleTable tableKey="suppliers" rows={(data?.rows.suppliers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.paid), money(row.payable), String(row.billCount)])} headers={['ผู้ขาย', 'กก.', 'ซื้อ', 'จ่ายแล้ว', 'ค้างจ่าย', 'บิล']} /> : null}
        {activeTab === 'customers' ? <SimpleTable tableKey="customers" rows={(data?.rows.customers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.gp), `${pct(row.gpPct)}%`, money(row.receivable)])} headers={['ลูกค้า', 'กก.', 'ขาย', 'GP', 'GP %', 'ค้างรับ']} /> : null}
        {activeTab === 'channels' ? <SimpleTable tableKey="channels" rows={(data?.rows.channels ?? []).map((row) => [row.group, row.name, money(row.qty), money(row.amount), money(row.gp), String(row.billCount)])} headers={['กลุ่ม', 'ช่องทาง', 'กก.', 'ยอด', 'GP', 'บิล']} /> : null}
        {activeTab === 'trend' ? <SimpleTable tableKey="trend" rows={(data?.rows.trend ?? []).map((row) => [formatDateDisplay(row.date), money(row.buyAmount), money(row.revenue), money(row.cogs), money(row.gp), money(row.sellQty)])} headers={['วันที่', 'ซื้อ', 'ขาย', 'COGS', 'GP', 'ขาย กก.']} /> : null}
        {activeTab === 'alerts' ? <SimpleTable tableKey="alerts" rows={(data?.alerts ?? []).map((row) => [row.severity, row.type, row.label, money(row.amount)])} headers={['ระดับ', 'ประเภท', 'รายการ', 'ค่า']} /> : null}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {isLoading ? <div className="rounded-xl bg-white p-4 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      {selectedProduct ? <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </section>
  )
}

const controlClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100'
const segmentClass = 'h-9 rounded-md border px-3 text-xs font-medium outline-none transition focus:ring-2 focus:ring-slate-200'
const selectedSegmentClass = 'border-slate-700 bg-slate-700 text-white shadow-sm'
const idleSegmentClass = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'

function Select({ onChange, options, value }: { onChange: (value: string) => void; options: Option[]; value: string }) {
  return <select className={controlClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทั้งหมด</option>{options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}</select>
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="space-y-1 text-xs font-bold text-slate-600"><span>{label}</span>{children}</label>
}

function money(value?: number) {
  return formatMoney(value ?? 0)
}

function pct(value?: number) {
  return (value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 1 })
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function parseSortCell(value: string) {
  const normalized = value.replace(/[^\d.-]/g, '')
  if (!normalized) return value
  const numberValue = Number(normalized)
  return Number.isFinite(numberValue) ? numberValue : value
}

function getProductSortValue(row: ProductRow, key: ProductColumnKey): string | number {
  return row[key] ?? ''
}

function formatProductCell(row: ProductRow, key: ProductColumnKey) {
  if (key === 'code') return row.code || '-'
  if (key === 'name') return row.name
  if (key === 'metalGroup') return row.metalGroup || '-'
  if (key === 'gpPct') return `${pct(row.gpPct)}%`
  return money(row[key] as number)
}

function Metric({ label, sub, tone, value }: { label: string; sub: string; tone: KpiCardTone; value: string }) {
  return <SharedKpiCard label={label} note={sub} tone={tone} value={value} />
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-700 text-sm">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function BarRows({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex justify-between gap-3 text-xs text-slate-600">
            <span className="truncate">{row.label}</span>
            <b className="text-slate-800 font-mono">{money(row.value)}</b>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.abs(row.value) / max * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ProductTable({ onSelect, rows }: { onSelect: (row: ProductRow) => void; rows: ProductRow[] }) {
  const [sortKey, setSortKey] = useState<ProductColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('main.profit-cost-analysis.products.v1', productColumns)
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getProductSortValue(left, sortKey), getProductSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function changeSort(key: ProductColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <>
      {/* Desktop view */}
      {columnResize.hasCustomWidths ? (
        <div className="mb-2 hidden justify-end lg:flex">
          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
        </div>
      ) : null}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {productColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              {productColumns.map((column) => (
                <ResizableTableHead
                  key={column.key}
                  activeSortKey={sortKey ?? undefined}
                  align={column.align}
                  direction={sortDirection}
                  label={column.label}
                  sortKey={column.key}
                  onSort={changeSort}
                  resizeProps={columnResize.getResizeHandleProps(column.key, column.label)}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => <tr key={row.id} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => onSelect(row)}>
              {productColumns.map((column) => (
                <td key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left'} ${column.key === 'gp' ? row.gp >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-700' : column.key === 'stockValue' ? 'font-bold text-slate-800' : column.key === 'name' ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                  <div className={column.align === 'right' ? 'whitespace-nowrap' : 'truncate'} title={String(formatProductCell(row, column.key))}>{formatProductCell(row, column.key)}</div>
                </td>
              ))}
            </tr>)}
            {sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={productColumns.length}>ไม่มีข้อมูล</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[600px] overflow-y-auto">
        {sortedRows.map((row) => (
          <div key={row.id} className="p-3 bg-white rounded-xl border border-slate-100 mb-2 shadow-sm flex flex-col gap-1.5 text-xs cursor-pointer" onClick={() => onSelect(row)}>
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800">{row.name}</span>
              <span className="font-mono text-xs text-slate-400">{row.code || '-'}</span>
            </div>
            <div className="text-xs text-slate-500 font-medium">หมวด: {row.metalGroup || '-'}</div>
            <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
              <div className="bg-blue-50/50 p-2 rounded-xl text-blue-900">
                <div className="font-semibold text-xs uppercase text-blue-700">📥 ซื้อ</div>
                <div className="font-mono mt-0.5">{money(row.buyQty)} กก.</div>
                <div className="font-bold font-mono mt-0.5">{money(row.buyAmount)} ฿</div>
                <div className="text-xs opacity-75 font-mono mt-0.5">เฉลี่ย {money(row.avgBuy)} ฿/กก.</div>
              </div>
              <div className="bg-emerald-50/50 p-2 rounded-xl text-emerald-900">
                <div className="font-semibold text-xs uppercase text-emerald-700">📤 ขาย</div>
                <div className="font-mono mt-0.5">{money(row.sellQty)} กก.</div>
                <div className="font-bold font-mono mt-0.5">{money(row.revenue)} ฿</div>
                <div className="text-xs opacity-75 font-mono mt-0.5">เฉลี่ย {money(row.avgSell)} ฿/กก.</div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-slate-50 text-xs">
              <span className="text-slate-500 font-medium">สต๊อก: {money(row.stockQty)} กก. ({money(row.stockValue)} ฿)</span>
              <span className={`font-bold ${row.gp >= 0 ? 'text-purple-700' : 'text-red-600'}`}>GP: {money(row.gp)} ({pct(row.gpPct)}%)</span>
            </div>
          </div>
        ))}
        {sortedRows.length === 0 && (
          <div className="py-8 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>
        )}
      </div>
    </>
  )
}

function ProductModal({ onClose, product }: { onClose: () => void; product: ProductRow }) {
  const lines = [
    ['ซื้อ', money(product.buyQty), money(product.buyAmount), '-', '-'],
    ['ขาย', money(product.sellQty), money(product.revenue), money(product.cogs), money(product.gp)],
    ['Stock', money(product.stockQty), money(product.stockValue), '-', '-'],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-md bg-slate-900 shadow-2xl border-0">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 p-4 text-white">
          <div>
            <h2 className="text-xl font-bold">{product.name}</h2>
            <p className="text-sm text-slate-300 mt-1">{product.code || '-'} · {product.metalGroup || '-'}</p>
          </div>
          <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="bg-slate-50 p-4">
          {/* Desktop modal table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="ns-table w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr>{['เอกสาร', 'จำนวน', 'มูลค่า', 'COGS', 'GP'].map((header) => <th key={header} className="p-2 text-left font-semibold">{header}</th>)}</tr></thead>
              <tbody>{lines.map((line) => <tr key={line[0]} className="border-t border-slate-100">{line.map((cell, index) => <td key={`${line[0]}-${index}`} className={`p-2 ${index > 0 ? 'text-right font-mono' : 'font-bold text-slate-700'}`}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          
          {/* Mobile modal card list */}
          <div className="block sm:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 rounded-xl">
            {lines.map((line) => (
              <div key={line[0]} className="py-2.5 flex flex-col gap-1 text-xs">
                <div className="font-bold text-slate-800">{line[0]}</div>
                <div className="grid grid-cols-2 gap-2 mt-1 font-mono text-xs text-slate-600">
                  <div>จำนวน: <span className="font-bold text-slate-800">{line[1]}</span></div>
                  <div>มูลค่า: <span className="font-bold text-slate-800">{line[2]}</span></div>
                  {line[3] !== '-' && <div>COGS: <span className="font-bold text-slate-800">{line[3]}</span></div>}
                  {line[4] !== '-' && <div>GP: <span className="font-bold text-slate-800">{line[4]}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SimpleTable({ headers, rows, tableKey }: { headers: string[]; rows: string[][]; tableKey: string }) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columns = useMemo<Array<ResizableColumnDefinition<string> & { align?: 'center' | 'left' | 'right'; label: string }>>(() => {
    return headers.map((header, index) => ({
      key: String(index),
      label: header,
      defaultWidth: index === 0 ? 180 : 120,
      minWidth: index === 0 ? 130 : 95,
      align: index > 1 ? 'right' : 'left',
    }))
  }, [headers])
  const columnResize = useResizableColumns(`main.profit-cost-analysis.${tableKey}.v1`, columns)
  const sortedRows = useMemo(() => {
    if (sortKey === null) return rows
    const index = Number(sortKey)

    return [...rows].sort((left, right) => {
      const result = compareSortValues(parseSortCell(left[index] ?? ''), parseSortCell(right[index] ?? ''))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function changeSort(key: string) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <>
      {/* Desktop view */}
      {columnResize.hasCustomWidths ? (
        <div className="mb-2 hidden justify-end lg:flex">
          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
        </div>
      ) : null}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              {columns.map((column) => (
                <ResizableTableHead
                  key={column.key}
                  activeSortKey={sortKey ?? undefined}
                  align={column.align}
                  direction={sortDirection}
                  label={column.label}
                  sortKey={column.key}
                  onSort={changeSort}
                  resizeProps={columnResize.getResizeHandleProps(column.key, column.label)}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row, index) => <tr key={`${row[0]}-${index}`} className="transition-colors hover:bg-slate-50">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`px-3 py-3 ${cellIndex > 1 ? 'text-right font-mono whitespace-nowrap tabular-nums' : 'text-slate-700 font-medium min-w-0 overflow-hidden'}`}><div className={cellIndex <= 1 ? "truncate" : ""} title={cellIndex <= 1 ? cell : undefined}>{cell}</div></td>)}</tr>)}
            {sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={headers.length}>ไม่มีข้อมูล</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[500px] overflow-y-auto">
        {sortedRows.map((row, index) => (
          <div key={index} className="p-3 bg-white rounded-xl border border-slate-100 mb-2 shadow-sm flex flex-col gap-1 text-xs">
            {row.map((cell, cellIndex) => (
              <div key={cellIndex} className="flex justify-between py-0.5">
                <span className="text-slate-500 font-medium">{headers[cellIndex]}</span>
                <span className={`font-bold ${cellIndex > 1 ? 'font-mono text-slate-950' : 'text-slate-800'}`}>{cell}</span>
              </div>
            ))}
          </div>
        ))}
        {sortedRows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>
        )}
      </div>
    </>
  )
}
