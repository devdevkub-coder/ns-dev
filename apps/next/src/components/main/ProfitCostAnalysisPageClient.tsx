'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
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
  { key: 'stockQty', label: 'Stock', defaultWidth: 115, minWidth: 100, align: 'right' },
  { key: 'stockValue', label: 'Stock Value', defaultWidth: 130, minWidth: 115, align: 'right' },
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

  function toggleMetalGroup(group: string) {
    setSelectedMetalGroups((current) => current.includes(group) ? current.filter((value) => value !== group) : [...current, group])
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md bg-white p-4 shadow border border-slate-100">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <Field label="จากวันที่"><DatePickerInput className="w-full" value={from} onChange={setFrom} /></Field>
          <Field label="ถึงวันที่"><DatePickerInput className="w-full" value={to} onChange={setTo} /></Field>
          <Field label="สาขา"><Select options={data?.filters.branches ?? []} value={branchId} onChange={setBranchId} /></Field>
          <Field label="ช่องทางซื้อ"><Select options={data?.filters.purchaseChannels ?? []} value={purchaseChannelId} onChange={setPurchaseChannelId} /></Field>
          <Field label="ช่องทางขาย"><Select options={data?.filters.salesChannels ?? []} value={salesChannelId} onChange={setSalesChannelId} /></Field>
          <Field label="Supplier">
            <div className="mt-1">
              <SearchCombobox
                inputId="profit-supplier-select"
                label="Supplier"
                hideLabel
                placeholder="ทั้งหมด"
                options={supplierSearchOptions}
                value={supplierId}
                onChange={setSupplierId}
              />
            </div>
          </Field>
          <Field label="Customer">
            <div className="mt-1">
              <SearchCombobox
                inputId="profit-customer-select"
                label="Customer"
                hideLabel
                placeholder="ทั้งหมด"
                options={customerSearchOptions}
                value={customerId}
                onChange={setCustomerId}
              />
            </div>
          </Field>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700">
            <span>หมวดสินค้า ({selectedMetalGroups.length ? selectedMetalGroups.length : 'ทุกหมวด'})</span>
            <button className={`${chipClass} bg-slate-900 text-white outline-none`} type="button" onClick={() => setSelectedMetalGroups(metalGroups)}>เลือกทั้งหมด</button>
            <button className={`${chipClass} bg-slate-100 text-slate-700 outline-none`} type="button" onClick={() => setSelectedMetalGroups([])}>ไม่เลือก</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {metalGroups.map((group) => <button key={group} className={`${chipClass} ${selectedMetalGroups.includes(group) ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700'} outline-none`} type="button" onClick={() => toggleMetalGroup(group)}>{group}</button>)}
            {metalGroups.length === 0 ? <span className="text-sm text-slate-400">ไม่มีหมวดสินค้า</span> : null}
          </div>
        </div>
        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white opacity-70 outline-none" disabled type="button">ส่งออก CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="ซื้อรวม" tone="blue" value={money(summary.purchaseAmount)} sub={`${money(summary.purchaseQty)} กก.`} />
        <Metric label="ขายรวม" tone="emerald" value={money(summary.revenue)} sub={`${money(summary.salesQty)} กก.`} />
        <Metric label="COGS" tone="orange" value={money(summary.cogs)} sub="ต้นทุนขาย" />
        <Metric label="GP" tone={(summary.gp ?? 0) >= 0 ? 'purple' : 'red'} value={money(summary.gp)} sub={`${pct(summary.gpPct)}%`} />
        <Metric label="Stock Qty" tone="amber" value={money(summary.stockQty)} sub="คงเหลือ กก." />
        <Metric label="Stock Value" tone="slate" value={money(summary.stockValue)} sub="มูลค่าสต๊อก" />
        <Metric label="ซื้อเฉลี่ย/กก." tone="cyan" value={money(summary.avgBuy)} sub="Avg buy" />
        <Metric label="ขายเฉลี่ย/กก." tone="emerald" value={money(summary.avgSell)} sub="Avg sell" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="เจ้าหนี้คงเหลือ" tone="red" value={money(summary.ap)} sub="AP" />
        <Metric label="ลูกหนี้คงเหลือ" tone="cyan" value={money(summary.ar)} sub="AR" />
        <Metric label="Supplier ที่ซื้อ" tone="blue" value={String(summary.supplierCount ?? 0)} sub="ราย" />
        <Metric label="Customer ที่ขาย" tone="purple" value={String(summary.customerCount ?? 0)} sub="ราย" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Revenue / GP">
          <div className="grid gap-3 md:grid-cols-2">
            <BigNumber label="Revenue" value={money(summary.revenue)} />
            <BigNumber label="Gross Profit" value={money(summary.gp)} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SmallStat label="ซื้อเฉลี่ย" value={money(summary.avgBuy)} />
            <SmallStat label="ขายเฉลี่ย" value={money(summary.avgSell)} />
            <SmallStat label="จำนวนสินค้า" value={String(summary.productCount ?? 0)} />
          </div>
        </Panel>
        <Panel title="Top 10 Product ยอดขาย">
          <BarRows rows={(data?.top.byRevenue ?? []).map((row) => ({ label: row.name, value: row.revenue }))} />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="รายได้ vs ต้นทุน vs กำไร">
          <BarRows rows={[{ label: 'รายได้', value: summary.revenue ?? 0 }, { label: 'COGS', value: summary.cogs ?? 0 }, { label: 'GP', value: summary.gp ?? 0 }]} />
        </Panel>
        <Panel title="Top 10 Product GP">
          <BarRows rows={(data?.top.byGp ?? []).map((row) => ({ label: row.name, value: row.gp }))} />
        </Panel>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/50 p-3">
          {[
            ['products', 'Product'],
            ['suppliers', 'Supplier'],
            ['customers', 'Customer'],
            ['channels', 'Channel'],
            ['trend', 'Trend'],
            ['alerts', 'Alerts'],
          ].map(([key, label]) => <button key={key} className={`rounded-lg border px-3 py-2 text-sm font-bold outline-none ${activeTab === key ? 'bg-purple-600 border-purple-600 text-white shadow-sm' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`} type="button" onClick={() => setActiveTab(key as Tab)}>{label}</button>)}
        </div>
        <div className="p-3">
          {activeTab === 'products' ? <ProductTable rows={data?.rows.products ?? []} onSelect={setSelectedProduct} /> : null}
          {activeTab === 'suppliers' ? <SimpleTable tableKey="suppliers" rows={(data?.rows.suppliers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.paid), money(row.payable), String(row.billCount)])} headers={['Supplier', 'กก.', 'ซื้อ', 'จ่ายแล้ว', 'ค้างจ่าย', 'บิล']} /> : null}
          {activeTab === 'customers' ? <SimpleTable tableKey="customers" rows={(data?.rows.customers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.gp), `${pct(row.gpPct)}%`, money(row.receivable)])} headers={['Customer', 'กก.', 'ขาย', 'GP', 'GP %', 'ค้างรับ']} /> : null}
          {activeTab === 'channels' ? <SimpleTable tableKey="channels" rows={(data?.rows.channels ?? []).map((row) => [row.group, row.name, money(row.qty), money(row.amount), money(row.gp), String(row.billCount)])} headers={['Group', 'Channel', 'กก.', 'ยอด', 'GP', 'บิล']} /> : null}
          {activeTab === 'trend' ? <SimpleTable tableKey="trend" rows={(data?.rows.trend ?? []).map((row) => [formatDateDisplay(row.date), money(row.buyAmount), money(row.revenue), money(row.cogs), money(row.gp), money(row.sellQty)])} headers={['Date', 'ซื้อ', 'ขาย', 'COGS', 'GP', 'ขาย กก.']} /> : null}
          {activeTab === 'alerts' ? <SimpleTable tableKey="alerts" rows={(data?.alerts ?? []).map((row) => [row.severity, row.type, row.label, money(row.amount)])} headers={['Severity', 'Type', 'รายการ', 'ค่า']} /> : null}
        </div>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-sm text-amber-900">
        <b>Profit & Cost read baseline</b><span className="ml-2">{data?.sourceState.limitations[0] ?? 'ไม่มี write/posting action ใน baseline นี้'}</span>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {isLoading ? <div className="rounded-md bg-white p-4 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      {selectedProduct ? <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </section>
  )
}

const controlClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100'
const chipClass = 'rounded-full px-3 py-1.5 text-xs font-bold shadow-sm'

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

function toneClass(tone: string) {
  const map: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  }
  return map[tone] ?? map.slate
}

function Metric({ label, sub, tone, value }: { label: string; sub: string; tone: string; value: string }) {
  return (
    <div className="bg-white p-4 shadow-sm border border-slate-100 rounded-xl">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold text-slate-900 truncate">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
    </div>
  )
}

function BigNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-xl shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-3">
      <div className="text-xs text-slate-500 font-semibold">{label}</div>
      <div className="font-mono text-base font-bold text-slate-800 mt-0.5">{value}</div>
    </div>
  )
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
            <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(100, Math.abs(row.value) / max * 100)}%` }} />
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
      <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        {columnResize.hasCustomWidths ? (
          <div className="flex justify-end border-b border-slate-100 px-3 py-3">
            <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[600px] overflow-y-auto">
        {sortedRows.map((row) => (
          <div key={row.id} className="p-3 bg-white rounded-lg border border-slate-100 mb-2 shadow-sm flex flex-col gap-1.5 text-xs cursor-pointer" onClick={() => onSelect(row)}>
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800">{row.name}</span>
              <span className="font-mono text-xs text-slate-400">{row.code || '-'}</span>
            </div>
            <div className="text-xs text-slate-500 font-medium">หมวด: {row.metalGroup || '-'}</div>
            <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
              <div className="bg-blue-50/50 p-2 rounded-lg text-blue-900">
                <div className="font-semibold text-xs uppercase text-blue-700">📥 ซื้อ</div>
                <div className="font-mono mt-0.5">{money(row.buyQty)} กก.</div>
                <div className="font-bold font-mono mt-0.5">{money(row.buyAmount)} ฿</div>
                <div className="text-xs opacity-75 font-mono mt-0.5">เฉลี่ย {money(row.avgBuy)} ฿/กก.</div>
              </div>
              <div className="bg-emerald-50/50 p-2 rounded-lg text-emerald-900">
                <div className="font-semibold text-xs uppercase text-emerald-700">📤 ขาย</div>
                <div className="font-mono mt-0.5">{money(row.sellQty)} กก.</div>
                <div className="font-bold font-mono mt-0.5">{money(row.revenue)} ฿</div>
                <div className="text-xs opacity-75 font-mono mt-0.5">เฉลี่ย {money(row.avgSell)} ฿/กก.</div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-slate-50 text-xs">
              <span className="text-slate-500 font-medium">Stock: {money(row.stockQty)} กก. ({money(row.stockValue)} ฿)</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl border-none">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 p-4 text-white">
          <div>
            <h2 className="text-xl font-bold">{product.name}</h2>
            <p className="text-sm text-slate-300 mt-1">{product.code || '-'} · {product.metalGroup || '-'}</p>
          </div>
          <button className="text-slate-400 hover:text-white font-semibold text-sm outline-none" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="p-4">
          {/* Desktop modal table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr>{['เอกสาร', 'จำนวน', 'มูลค่า', 'COGS', 'GP'].map((header) => <th key={header} className="p-2 text-left font-semibold">{header}</th>)}</tr></thead>
              <tbody>{lines.map((line) => <tr key={line[0]} className="border-t border-slate-100">{line.map((cell, index) => <td key={`${line[0]}-${index}`} className={`p-2 ${index > 0 ? 'text-right font-mono' : 'font-bold text-slate-700'}`}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          
          {/* Mobile modal card list */}
          <div className="block sm:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 rounded-lg">
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
      <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        {columnResize.hasCustomWidths ? (
          <div className="flex justify-end border-b border-slate-100 px-3 py-3">
            <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[500px] overflow-y-auto">
        {sortedRows.map((row, index) => (
          <div key={index} className="p-3 bg-white rounded-lg border border-slate-100 mb-2 shadow-sm flex flex-col gap-1 text-xs">
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
