'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Sarabun } from 'next/font/google'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { KpiCard as SharedKpiCard, type KpiCardTone } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
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
type ProductApiRow = Omit<ProductRow, 'avgBuy' | 'avgSell' | 'buyAmount' | 'buyQty' | 'cogs' | 'gp' | 'gpPct' | 'profitPerKg' | 'revenue' | 'sellQty' | 'stockQty' | 'stockValue'> & {
  avgBuy: string; avgSell: string; buyAmount: string; buyQty: string; cogs: string; gp: string; gpPct: string
  profitPerKg: string; revenue: string; sellQty: string; stockQty: string; stockValue: string
}
type OptionsApiPayload = { branches: Option[]; customers: Option[]; metalGroups: string[]; purchaseChannels: Option[]; salesChannels: Option[]; suppliers: Option[] }
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
type DimensionSortKey = 'amount' | 'billCount' | 'date' | 'gp' | 'group' | 'name' | 'paid' | 'payable' | 'qty' | 'receivable' | 'received'

const productPageSizeOptions = [10, 25, 50, 100] as const
const profitKpiCardClass = 'profit-kpi-card shadow-none'
const profitTableFont = Sarabun({
  subsets: ['latin', 'thai'],
  variable: '--font-profit-table',
  weight: ['400', '500'],
})

const reportTabs: { key: Tab; label: string }[] = [
  { key: 'products', label: 'สินค้า' },
  { key: 'suppliers', label: 'ผู้ขาย' },
  { key: 'customers', label: 'ลูกค้า' },
  { key: 'channels', label: 'ช่องทาง' },
  { key: 'trend', label: 'แนวโน้ม' },
  { key: 'alerts', label: 'แจ้งเตือน' },
]

const defaultDimensionSort: Record<Exclude<Tab, 'alerts' | 'products'>, DimensionSortKey> = {
  channels: 'amount', customers: 'gp', suppliers: 'amount', trend: 'date',
}

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

function reportNumber(value: string) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('รูปแบบตัวเลขรายงานไม่ถูกต้อง')
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error('ตัวเลขรายงานอยู่นอกช่วงที่แสดงผลได้')
  return parsed
}

function decodeProductRow(row: ProductApiRow): ProductRow {
  return {
    ...row,
    avgBuy: reportNumber(row.avgBuy), avgSell: reportNumber(row.avgSell),
    buyAmount: reportNumber(row.buyAmount), buyQty: reportNumber(row.buyQty),
    cogs: reportNumber(row.cogs), gp: reportNumber(row.gp), gpPct: reportNumber(row.gpPct),
    profitPerKg: reportNumber(row.profitPerKg), revenue: reportNumber(row.revenue),
    sellQty: reportNumber(row.sellQty), stockQty: reportNumber(row.stockQty), stockValue: reportNumber(row.stockValue),
  }
}

function decodeDimensionRow(row: Record<string, string | number | null>) {
  const numeric = (key: string) => reportNumber(String(row[key]))
  return {
    amount: numeric('amount'), billCount: Number(row.billCount), buyAmount: numeric('buyAmount'), buyQty: numeric('buyQty'), cogs: numeric('cogs'),
    date: typeof row.date === 'string' ? row.date : null, gp: numeric('gp'), gpPct: numeric('gpPct'),
    group: typeof row.group === 'string' ? row.group : null, name: String(row.name), paid: numeric('paid'),
    payable: numeric('payable'), qty: numeric('qty'), receivable: numeric('receivable'), received: numeric('received'),
  }
}

function emptyProfitCostPayload(): ProfitCostPayload {
  return {
    alerts: [],
    filters: { branches: [], customers: [], dateFrom: '', dateTo: '', metalGroups: [], purchaseChannels: [], salesChannels: [], selectedMetalGroups: [], suppliers: [] },
    rows: { channels: [], customers: [], products: [], suppliers: [], trend: [] },
    sourceState: { limitations: [], writeActionsEnabled: false },
    summary: {},
    top: { byGp: [], byRevenue: [], byStockValue: [] },
  }
}

export function ProfitCostAnalysisPageClient() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [branchId, setBranchId] = useState('')
  const [purchaseChannelId, setPurchaseChannelId] = useState('')
  const [salesChannelId, setSalesChannelId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [selectedMetalGroup, setSelectedMetalGroup] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('products')
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null)
  const [data, setData] = useState<ProfitCostPayload>(emptyProfitCostPayload)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [rankingsError, setRankingsError] = useState<string | null>(null)
  const [tableError, setTableError] = useState<string | null>(null)
  const [isOptionsLoading, setIsOptionsLoading] = useState(true)
  const [isSummaryLoading, setIsSummaryLoading] = useState(true)
  const [isRankingsLoading, setIsRankingsLoading] = useState(true)
  const [isTableLoading, setIsTableLoading] = useState(true)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [appliedQuery, setAppliedQuery] = useState(() => new URLSearchParams({ from: monthStart(), to: today() }).toString())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof productPageSizeOptions)[number]>(25)
  const [productSortKey, setProductSortKey] = useState<ProductColumnKey>('gp')
  const [productSortDirection, setProductSortDirection] = useState<SortDirection>('desc')
  const [dimensionSortKey, setDimensionSortKey] = useState<DimensionSortKey>('amount')
  const [dimensionSortDirection, setDimensionSortDirection] = useState<SortDirection>('desc')
  const [totalRows, setTotalRows] = useState(0)

  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to })
    if (branchId) params.set('branchId', branchId)
    if (purchaseChannelId) params.set('purchaseChannelId', purchaseChannelId)
    if (salesChannelId) params.set('salesChannelId', salesChannelId)
    if (supplierId) params.set('supplierId', supplierId)
    if (customerId) params.set('customerId', customerId)
    if (selectedMetalGroup) params.set('metalGroup', selectedMetalGroup)
    return params.toString()
  }, [branchId, customerId, from, purchaseChannelId, salesChannelId, selectedMetalGroup, supplierId, to])

  useEffect(() => {
    const controller = new AbortController()
    setOptionsError(null)
    setIsOptionsLoading(true)
    dailyFetchJson<OptionsApiPayload>('/api/profit-cost-analysis/options', { signal: controller.signal })
      .then((options) => setData((current) => ({ ...current, filters: { ...current.filters, ...options } })))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setOptionsError(caught instanceof Error ? caught.message : 'โหลดตัวเลือกไม่ได้')
      })
      .finally(() => { if (!controller.signal.aborted) setIsOptionsLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setSummaryError(null)
    setIsSummaryLoading(true)
    dailyFetchJson<{ summary: Record<string, string | number> }>(`/api/profit-cost-analysis/summary?${appliedQuery}`, { signal: controller.signal })
      .then((summaryPayload) => setData((current) => ({
        ...current,
        summary: Object.fromEntries(Object.entries(summaryPayload.summary).map(([key, value]) => [key, typeof value === 'string' ? reportNumber(value) : value])),
      })))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setSummaryError(caught instanceof Error ? caught.message : 'โหลดข้อมูลสรุปไม่ได้')
      })
      .finally(() => { if (!controller.signal.aborted) setIsSummaryLoading(false) })
    return () => controller.abort()
  }, [appliedQuery])

  useEffect(() => {
    const controller = new AbortController()
    setRankingsError(null)
    setIsRankingsLoading(true)
    dailyFetchJson<{ top: { byGp: ProductApiRow[]; byRevenue: ProductApiRow[]; byStockValue: ProductApiRow[] } }>(`/api/profit-cost-analysis/rankings?${appliedQuery}`, { signal: controller.signal })
      .then((rankings) => setData((current) => ({
        ...current,
        top: {
          byGp: rankings.top.byGp.map(decodeProductRow),
          byRevenue: rankings.top.byRevenue.map(decodeProductRow),
          byStockValue: rankings.top.byStockValue.map(decodeProductRow),
        },
      })))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setRankingsError(caught instanceof Error ? caught.message : 'โหลดข้อมูลอันดับไม่ได้')
      })
      .finally(() => { if (!controller.signal.aborted) setIsRankingsLoading(false) })
    return () => controller.abort()
  }, [appliedQuery])

  useEffect(() => {
    const controller = new AbortController()
    setTableError(null)
    setIsTableLoading(true)
    const tableParams = new URLSearchParams(appliedQuery)
    tableParams.set('page', String(page))
    tableParams.set('pageSize', String(pageSize))
    tableParams.set('sortBy', activeTab === 'products' ? productSortKey : activeTab === 'alerts' ? 'amount' : dimensionSortKey)
    tableParams.set('sortDirection', activeTab === 'products' ? productSortDirection : dimensionSortDirection)
    const tableEndpoint = activeTab === 'alerts' ? 'alerts' : activeTab
    dailyFetchJson<{ alerts?: { amount: string; label: string; severity: string; type: string }[]; rows?: Array<Record<string, string | number | null>>; totalRows?: number }>(`/api/profit-cost-analysis/${tableEndpoint}?${tableParams}`, { signal: controller.signal })
      .then((tablePayload) => {
        const productRows = activeTab === 'products' ? (tablePayload.rows ?? []).map((row) => decodeProductRow(row as unknown as ProductApiRow)) : []
        const dimensionRows = (tablePayload.rows ?? []).map(decodeDimensionRow)
        setTotalRows(tablePayload.totalRows ?? tablePayload.alerts?.length ?? 0)
        setData((current) => ({
          ...current,
          alerts: activeTab === 'alerts' ? (tablePayload.alerts ?? []).map((row) => ({ ...row, amount: reportNumber(row.amount) })) : current.alerts,
          rows: {
            ...current.rows,
            ...(activeTab === 'channels' ? { channels: dimensionRows.map((row) => ({ amount: row.amount, billCount: row.billCount, gp: row.gp, gpPct: row.gpPct, group: row.group ?? '', name: row.name, qty: row.qty })) } : {}),
            ...(activeTab === 'customers' ? { customers: dimensionRows.map((row) => ({ amount: row.amount, billCount: row.billCount, cogs: row.cogs, gp: row.gp, gpPct: row.gpPct, name: row.name, receivable: row.receivable, received: row.received, qty: row.qty })) } : {}),
            ...(activeTab === 'products' ? { products: productRows } : {}),
            ...(activeTab === 'suppliers' ? { suppliers: dimensionRows.map((row) => ({ amount: row.amount, billCount: row.billCount, name: row.name, paid: row.paid, payable: row.payable, qty: row.qty })) } : {}),
            ...(activeTab === 'trend' ? { trend: dimensionRows.map((row) => ({ buyAmount: row.buyAmount, buyQty: row.buyQty, cogs: row.cogs, date: row.date ?? '', gp: row.gp, revenue: row.amount, sellQty: row.qty })) } : {}),
          },
        }))
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setTableError(caught instanceof Error ? caught.message : 'โหลดตารางไม่ได้')
      })
      .finally(() => { if (!controller.signal.aborted) setIsTableLoading(false) })
    return () => controller.abort()
  }, [activeTab, appliedQuery, dimensionSortDirection, dimensionSortKey, page, pageSize, productSortDirection, productSortKey])

  useEffect(() => { setPage(1) }, [activeTab, appliedQuery])

  const supplierSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return data.filters.suppliers.map((supplier) => ({
      id: supplier.id,
      label: supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name,
    }))
  }, [data.filters.suppliers])

  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return data.filters.customers.map((customer) => ({
      id: customer.id,
      label: customer.code ? `${customer.code} - ${customer.name}` : customer.name,
    }))
  }, [data.filters.customers])

  const error = optionsError ?? summaryError ?? rankingsError ?? tableError
  const isLoading = isOptionsLoading || isSummaryLoading || isRankingsLoading || isTableLoading
  const summary = data.summary
  const metalGroups = data.filters.metalGroups
  const metalGroupSearchOptions = useMemo<SearchComboboxOption[]>(() => data.filters.metalGroups.map((group) => ({ id: group, label: group })), [data.filters.metalGroups])
  const hasActiveFilters = from !== monthStart()
    || to !== today()
    || Boolean(branchId || purchaseChannelId || salesChannelId || supplierId || customerId)
    || Boolean(selectedMetalGroup)

  function clearFilters() {
    setFrom(monthStart())
    setTo(today())
    setBranchId('')
    setPurchaseChannelId('')
    setSalesChannelId('')
    setSupplierId('')
    setCustomerId('')
    setSelectedMetalGroup('')
  }

  function applyFilters() {
    setPage(1)
    setAppliedQuery(query)
    setShowMobileFilters(false)
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-12">
        <PairMetric
          className={`${profitKpiCardClass} col-span-2 xl:col-span-4`}
          label="ซื้อ / ขายรวม"
          left={{ label: 'ซื้อ', note: `${money(summary.purchaseQty)} กก.`, value: money(summary.purchaseAmount) }}
          right={{ label: 'ขาย', note: `${money(summary.salesQty)} กก.`, value: money(summary.revenue) }}
          tone="slate"
        />
        <Metric className={`${profitKpiCardClass} xl:col-span-2`} label="COGS" tone="slate" value={money(summary.cogs)} sub="ต้นทุนขาย" />
        <Metric className={`${profitKpiCardClass} xl:col-span-2`} label="GP" tone={(summary.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={money(summary.gp)} sub={`${pct(summary.gpPct)}%`} />
        <Metric className={`${profitKpiCardClass} xl:col-span-2`} label="สต๊อกคงเหลือ" tone="slate" value={money(summary.stockQty)} sub="กก." />
        <Metric className={`${profitKpiCardClass} xl:col-span-2`} label="มูลค่าสต๊อก" tone="slate" value={money(summary.stockValue)} sub="รวมตามตัวกรอง" />
        <PairMetric
          className={`${profitKpiCardClass} col-span-2 xl:col-span-4`}
          label="ราคาเฉลี่ย/กก."
          left={{ label: 'ซื้อ', value: money(summary.avgBuy) }}
          right={{ label: 'ขาย', value: money(summary.avgSell) }}
          tone="slate"
        />
        <PairMetric
          className={`${profitKpiCardClass} col-span-2 xl:col-span-8`}
          label="ยอดคงเหลือเจ้าหนี้ / ลูกหนี้"
          left={{ label: 'เจ้าหนี้คงเหลือ', note: `AP · ผู้ขายที่ซื้อ ${summary.supplierCount ?? 0} ราย`, value: money(summary.ap) }}
          right={{ label: 'ลูกหนี้คงเหลือ', note: `AR · ลูกค้าที่ขาย ${summary.customerCount ?? 0} ราย`, value: money(summary.ar) }}
          tone="slate"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="สินค้าขายสูงสุด 10 อันดับ">
          <BarRows rows={(data?.top.byRevenue ?? []).map((row) => ({ label: row.name, value: row.revenue }))} />
        </Panel>
        <Panel title="สินค้า GP สูงสุด 10 อันดับ">
          <BarRows rows={(data?.top.byGp ?? []).map((row) => ({ label: row.name, value: row.gp }))} />
        </Panel>
        <Panel title="มูลค่าสต๊อกสูงสุด 10 อันดับ">
          <BarRows rows={(data?.top.byStockValue ?? []).map((row) => ({ label: row.name, value: row.stockValue }))} />
        </Panel>
      </div>

      <Tabs className="gap-2" value={activeTab} onValueChange={(value) => {
        const nextTab = value as Tab
        setActiveTab(nextTab)
        if (nextTab !== 'alerts' && nextTab !== 'products') {
          setDimensionSortKey(defaultDimensionSort[nextTab])
          setDimensionSortDirection('desc')
        }
      }}>
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
            <Field label="สาขา"><Select inputId="profit-branch-select" label="สาขา" options={data?.filters.branches ?? []} value={branchId} onChange={setBranchId} /></Field>
            <Field label="ช่องทางซื้อ"><Select inputId="profit-purchase-channel-select" label="ช่องทางซื้อ" options={data?.filters.purchaseChannels ?? []} value={purchaseChannelId} onChange={setPurchaseChannelId} /></Field>
            <Field label="ช่องทางขาย"><Select inputId="profit-sales-channel-select" label="ช่องทางขาย" options={data?.filters.salesChannels ?? []} value={salesChannelId} onChange={setSalesChannelId} /></Field>
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
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="w-full sm:w-72">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
                inputId="profit-metal-group-select"
                label="หมวดสินค้า"
                options={metalGroupSearchOptions}
                placeholder="ทุกหมวดสินค้า"
                value={selectedMetalGroup}
                onChange={setSelectedMetalGroup}
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {hasActiveFilters ? (
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-200" type="button" onClick={clearFilters}>ล้างตัวกรอง</button>
              ) : null}
              <button className="h-9 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700" type="button" onClick={applyFilters}>แสดงผล</button>
            </div>
          </div>
        </div>
      </div>

      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองกำไรและต้นทุน"
          onClose={() => setShowMobileFilters(false)}
          footer={(
            <>
              <button className="h-10 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700" type="button" onClick={clearFilters}>ล้าง</button>
              <button className="h-10 rounded-md bg-blue-600 text-sm font-semibold text-white" type="button" onClick={applyFilters}>แสดงผล</button>
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
            <Field label="สาขา"><Select inputId="profit-branch-select-mobile" label="สาขา" options={data?.filters.branches ?? []} value={branchId} onChange={setBranchId} /></Field>
            <Field label="ช่องทางซื้อ"><Select inputId="profit-purchase-channel-select-mobile" label="ช่องทางซื้อ" options={data?.filters.purchaseChannels ?? []} value={purchaseChannelId} onChange={setPurchaseChannelId} /></Field>
            <Field label="ช่องทางขาย"><Select inputId="profit-sales-channel-select-mobile" label="ช่องทางขาย" options={data?.filters.salesChannels ?? []} value={salesChannelId} onChange={setSalesChannelId} /></Field>
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
              <SearchCombobox
                hideLabel
                inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
                inputId="profit-metal-group-select-mobile"
                label="หมวดสินค้า"
                options={metalGroupSearchOptions}
                placeholder="ทุกหมวดสินค้า"
                value={selectedMetalGroup}
                onChange={setSelectedMetalGroup}
              />
            </Field>
          </div>
        </MobileFilterSheet>
      ) : null}

      <TablePager page={page} pageSize={pageSize} totalRows={totalRows} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} />
      <div>
        {activeTab === 'products' ? <ProductTable rows={data?.rows.products ?? []} onSelect={setSelectedProduct} sortDirection={productSortDirection} sortKey={productSortKey} onSort={(key, direction) => { setProductSortKey(key); setProductSortDirection(direction); setPage(1) }} /> : null}
        {activeTab === 'suppliers' ? <SimpleTable tableKey="suppliers" rows={(data?.rows.suppliers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.paid), money(row.payable), String(row.billCount)])} headers={['ผู้ขาย', 'กก.', 'ซื้อ', 'จ่ายแล้ว', 'ค้างจ่าย', 'บิล']} sortKeys={['name', 'qty', 'amount', 'paid', 'payable', 'billCount']} sortDirection={dimensionSortDirection} sortKey={dimensionSortKey} onSort={(key, direction) => { setDimensionSortKey(key); setDimensionSortDirection(direction); setPage(1) }} /> : null}
        {activeTab === 'customers' ? <SimpleTable tableKey="customers" rows={(data?.rows.customers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.gp), `${pct(row.gpPct)}%`, money(row.receivable)])} headers={['ลูกค้า', 'กก.', 'ขาย', 'GP', 'GP %', 'ค้างรับ']} sortKeys={['name', 'qty', 'amount', 'gp', 'gp', 'receivable']} sortDirection={dimensionSortDirection} sortKey={dimensionSortKey} onSort={(key, direction) => { setDimensionSortKey(key); setDimensionSortDirection(direction); setPage(1) }} /> : null}
        {activeTab === 'channels' ? <SimpleTable tableKey="channels" rows={(data?.rows.channels ?? []).map((row) => [row.group, row.name, money(row.qty), money(row.amount), money(row.gp), String(row.billCount)])} headers={['กลุ่ม', 'ช่องทาง', 'กก.', 'ยอด', 'GP', 'บิล']} sortKeys={['group', 'name', 'qty', 'amount', 'gp', 'billCount']} sortDirection={dimensionSortDirection} sortKey={dimensionSortKey} onSort={(key, direction) => { setDimensionSortKey(key); setDimensionSortDirection(direction); setPage(1) }} /> : null}
        {activeTab === 'trend' ? <SimpleTable tableKey="trend" rows={(data?.rows.trend ?? []).map((row) => [formatDateDisplay(row.date), money(row.buyAmount), money(row.revenue), money(row.cogs), money(row.gp), money(row.sellQty)])} headers={['วันที่', 'ซื้อ', 'ขาย', 'COGS', 'GP', 'ขาย กก.']} sortKeys={['date', 'amount', 'amount', 'gp', 'gp', 'qty']} sortDirection={dimensionSortDirection} sortKey={dimensionSortKey} onSort={(key, direction) => { setDimensionSortKey(key); setDimensionSortDirection(direction); setPage(1) }} /> : null}
        {activeTab === 'alerts' ? <SimpleTable tableKey="alerts" rows={(data?.alerts ?? []).map((row) => [row.severity, row.type, row.label, money(row.amount)])} headers={['ระดับ', 'ประเภท', 'รายการ', 'ค่า']} /> : null}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {isLoading ? <div className="rounded-xl bg-white p-4 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      {selectedProduct ? <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </section>
  )
}

function Select({ inputId, label, onChange, options, value }: { inputId: string; label: string; onChange: (value: string) => void; options: Option[]; value: string }) {
  const searchOptions = useMemo<SearchComboboxOption[]>(() => options.map((option) => ({
    id: option.id,
    label: option.code ? `${option.code} - ${option.name}` : option.name,
  })), [options])

  return <SearchCombobox hideLabel inputClassName="h-9 border-slate-300 bg-white font-semibold text-slate-800 placeholder:text-slate-500" inputId={inputId} label={label} options={searchOptions} placeholder="ทั้งหมด" value={value} onChange={onChange} />
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

function formatProductCell(row: ProductRow, key: ProductColumnKey) {
  if (key === 'code') return row.code || '-'
  if (key === 'name') return row.name
  if (key === 'metalGroup') return row.metalGroup || '-'
  if (key === 'gpPct') return `${pct(row.gpPct)}%`
  return money(row[key] as number)
}

function Metric({ className, label, sub, tone, value }: { className?: string; label: string; sub: string; tone: KpiCardTone; value: string }) {
  return <SharedKpiCard className={className} label={label} note={sub} tone={tone} value={value} />
}

function PairMetric({ className, label, left, right, tone }: {
  className?: string
  label: string
  left: { label: string; note?: string; value: string }
  right: { label: string; note?: string; value: string }
  tone: KpiCardTone
}) {
  return (
    <SharedKpiCard
      className={className}
      label={label}
      tone={tone}
      value={(
        <div className="grid grid-cols-2 gap-3">
          <PairMetricValue {...left} />
          <PairMetricValue {...right} />
        </div>
      )}
    />
  )
}

function PairMetricValue({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block font-sans text-xs font-medium text-slate-500">{label}</span>
      <span className="block truncate">{value}</span>
      {note ? <span className="block font-sans text-xs font-medium text-slate-500">{note}</span> : null}
    </div>
  )
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className="profit-top-list-header border-b border-slate-100 p-3 font-bold text-slate-700 text-sm">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function BarRows({ rows }: { rows: { label: string; value: number }[] }) {
  const [expanded, setExpanded] = useState(false)
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  const visibleRows = rows.slice(0, expanded ? 10 : 5)
  return (
    <div>
      <div className="space-y-2">
      {visibleRows.map((row) => (
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
      {rows.length > 5 ? (
        <button
          aria-expanded={expanded}
          className="mt-3 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'ย่อเหลือ 5 อันดับ' : 'ดู 10 อันดับ'}
        </button>
      ) : null}
    </div>
  )
}

function TablePager({ onPageChange, onPageSizeChange, page, pageSize, totalRows }: {
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: (typeof productPageSizeOptions)[number]) => void
  page: number
  pageSize: (typeof productPageSizeOptions)[number]
  totalRows: number
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  if (totalRows === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>แสดง {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalRows)} จาก {totalRows} รายการ</span>
      <div className="flex items-center gap-2">
        <PageSizeDropdown options={[...productPageSizeOptions]} value={pageSize} onChange={(value) => onPageSizeChange(value as (typeof productPageSizeOptions)[number])} />
        <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={page <= 1} type="button" onClick={() => onPageChange(page - 1)}>ก่อนหน้า</button>
        <span className="px-1 text-sm">หน้า {page} / {totalPages}</span>
        <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={page >= totalPages} type="button" onClick={() => onPageChange(page + 1)}>ถัดไป</button>
      </div>
    </div>
  )
}

function ProductTable({ onSelect, onSort, rows, sortDirection, sortKey }: {
  onSelect: (row: ProductRow) => void
  onSort: (key: ProductColumnKey, direction: SortDirection) => void
  rows: ProductRow[]
  sortDirection: SortDirection
  sortKey: ProductColumnKey
}) {
  const columnResize = useResizableColumns('main.profit-cost-analysis.products.v1', productColumns)

  function changeSort(key: ProductColumnKey) {
    onSort(key, sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc')
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
        <table className={`${profitTableFont.variable} profit-analysis-table ns-table min-w-full divide-y divide-slate-200 text-sm`} style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
                  className="!font-medium"
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
            {rows.map((row) => <tr key={row.id} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => onSelect(row)}>
              {productColumns.map((column) => (
                <td key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left'} ${column.key === 'gp' ? row.gp >= 0 ? 'font-medium text-emerald-700' : 'font-medium text-red-700' : column.key === 'stockValue' ? 'font-medium text-slate-800' : column.key === 'name' ? 'font-medium text-slate-800' : 'text-slate-700'}`}>
                  <div className={column.align === 'right' ? 'whitespace-nowrap' : 'truncate'} title={String(formatProductCell(row, column.key))}>{formatProductCell(row, column.key)}</div>
                </td>
              ))}
            </tr>)}
            {rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={productColumns.length}>ไม่มีข้อมูล</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[600px] overflow-y-auto">
        {rows.map((row) => (
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
        {rows.length === 0 && (
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
    ['สต๊อก', money(product.stockQty), money(product.stockValue), '-', '-'],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-md bg-slate-900 shadow-2xl border-0">
        <div data-ns-dialog-header className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 p-4 text-white">
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
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr>{['เอกสาร', 'จำนวน', 'มูลค่า', 'COGS', 'GP'].map((header, index) => <th key={header} className={`p-2 font-semibold ${index === 0 ? 'text-left' : 'text-right'}`}>{header}</th>)}</tr></thead>
              <tbody>{lines.map((line) => <tr key={line[0]} className="border-t border-slate-100">{line.map((cell, index) => <td key={`${line[0]}-${index}`} className={`p-3 ${index > 0 ? 'text-right font-mono' : 'font-bold text-slate-700'}`}>{cell}</td>)}</tr>)}</tbody>
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

function SimpleTable({ headers, onSort, rows, sortDirection, sortKey, sortKeys, tableKey }: {
  headers: string[]
  onSort?: (key: DimensionSortKey, direction: SortDirection) => void
  rows: string[][]
  sortDirection?: SortDirection
  sortKey?: DimensionSortKey
  sortKeys?: DimensionSortKey[]
  tableKey: string
}) {
  const columns = useMemo<Array<ResizableColumnDefinition<string> & { align?: 'center' | 'left' | 'right'; label: string }>>(() => {
    return headers.map((header, index) => ({
      key: String(index),
      label: header,
      defaultWidth: index === 0 ? 180 : 120,
      minWidth: index === 0 ? 130 : 95,
      align: index === 0 ? 'left' : 'right',
    }))
  }, [headers])
  const columnResize = useResizableColumns(`main.profit-cost-analysis.${tableKey}.v1`, columns)
  function changeSort(key: DimensionSortKey) {
    if (!onSort) return
    onSort(key, sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <>
      {/* Desktop view */}
      {columnResize.hasCustomWidths ? (
        <div className="mb-2 hidden justify-end lg:flex">
          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-normal text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
        </div>
      ) : null}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className={`${profitTableFont.variable} profit-analysis-table ns-table min-w-full divide-y divide-slate-200 text-sm`} style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
                  activeSortKey={sortKey}
                  align={column.align}
                  className="!font-medium"
                  direction={sortDirection}
                  label={column.label}
                  sortKey={sortKeys?.[Number(column.key)]}
                  onSort={changeSort}
                  resizeProps={columnResize.getResizeHandleProps(column.key, column.label)}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="transition-colors hover:bg-slate-50">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`px-3 py-3 ${cellIndex > 1 ? 'text-right font-mono whitespace-nowrap tabular-nums' : 'min-w-0 overflow-hidden font-normal text-slate-700'}`}><div className={cellIndex <= 1 ? "truncate" : ""} title={cellIndex <= 1 ? cell : undefined}>{cell}</div></td>)}</tr>)}
            {rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={headers.length}>ไม่มีข้อมูล</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[500px] overflow-y-auto">
        {rows.map((row, index) => (
          <div key={index} className="mb-2 flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-3 text-xs shadow-sm">
            <div className="font-bold text-slate-800">{row[0]}</div>
            {row.length > 2 ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2 py-1.5 text-slate-600">
                {row.slice(1, -1).map((cell, cellIndex) => (
                  <div key={cellIndex} className="flex min-w-0 justify-between gap-2">
                    <span className="truncate">{headers[cellIndex + 1]}</span>
                    <span className="shrink-0 text-right font-medium text-slate-800">{cell}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {row.length > 1 ? (
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-500">{headers[row.length - 1]}</span>
                <span className="font-mono font-bold text-slate-950">{row[row.length - 1]}</span>
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>
        )}
      </div>
    </>
  )
}
