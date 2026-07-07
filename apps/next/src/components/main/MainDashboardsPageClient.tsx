'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type MainPayload = {
  dashboard: {
    aging: { label: string; value: number }[]
    agingBuckets: {
      ap: Record<string, number>
      ar: Record<string, number>
    }
    cashComposition: { label: string; value: number }[]
    historical: { cogs: number; expenses: number; revenue: number; rows: number }
    kpi: Record<string, number>
    monthlyTrend: { expense: number; gp: number; label: string; purchase: number; sales: number }[]
    sections: {
      cash: Record<string, number>
      purchase: Record<string, number>
      sales: Record<string, number>
      stock: Record<string, number>
    }
    stockByBranch: { name: string; qty: number; value: number }[]
    stockByGroup: { group: string; qty: number; value: number }[]
    trend: { label: string; value: number }[]
  }
  dailyReport: {
    analytics: {
      bySalesperson: { amount: number; bills: number; id: string; name: string; qty: number; suppliers: number }[]
      dailyTrend: { label: string; purchase: number; sales: number }[]
      groupSummary: { amount: number; group: string; qty: number }[]
      rangeKpi: Record<string, number>
      topCustomers: { amount: number; bills: number; gp: number; gpPct: number; id: string; name: string; qty: number }[]
      topProductsIn: { amount: number; code: string; group: string; id: string; name: string; qty: number }[]
      topProductsOut: { amount: number; code: string; group: string; id: string; name: string; qty: number }[]
      topSuppliers: { amount: number; bills: number; id: string; name: string; qty: number }[]
    }
    cashMovement: {
      accounts: { cashIn: number; cashOut: number; name: string; type: string }[]
      byType: { cashIn: number; cashOut: number; label: string }[]
      cashIn: number
      cashOut: number
      net: number
    }
    expenseByCategory: { amount: number; count: number; name: string }[]
    expenseRows: { amount: number; category: string; docNo: string; payee: string }[]
    groupBreakdown: { buyAmt: number; buyQty: number; group: string; products: { buyAmt: number; buyQty: number; productCode: string; productId: string; productName: string; sellAmt: number; sellQty: number }[]; sellAmt: number; sellQty: number }[]
    purchaseBills: { amount: number; docNo: string; name: string; qty: number }[]
    salesBills: { amount: number; docNo: string; name: string; qty: number }[]
    summary: Record<string, number>
  }
  filterOptions: {
    branches: { id: string; name: string }[]
    customers: { code?: string; id: string; name: string }[]
    groups: string[]
    products: { code: string; id: string; name: string }[]
    suppliers: { id: string; name: string }[]
  }
  filters: { date: string; from: string; to: string }
  ownerDaily: {
    actualActivity: { cashIn: number; cashOut: number; expenseOut: number; fgQty: number; fgValue: number; net: number; paymentOut: number }
    cashPlan: { available: number; expectedIn: number; expectedOut: number; gap: number }
    due: {
      ap: { amount: number; docNo: string; due: string; id: string; name: string }[]
      ar: { amount: number; daysOverdue: number; docNo: string; due: string; id: string; name: string }[]
    }
    expensesToday: { amount: number; docNo: string; id: string; payee: string; title: string }[]
    loanToday: { amount: number; contractNo: string; due: string; id: string; installmentNo: number }[]
    pending: Record<string, number>
  }
  sourceState: { limitations: string[]; writeActionsEnabled: false }
}

type Mode = 'daily-report' | 'dashboard' | 'owner-daily' | 'analytics-dashboard'
type SortDirection = 'asc' | 'desc'
type DashboardAgingSortKey = 'label' | 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'over90' | 'total'
type DashboardDetailTab = 'metrics' | 'ranking' | 'stock'
type DashboardAgingRow = {
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  key: 'ap' | 'ar'
  label: string
  over90: number
  tone: 'emerald' | 'red'
  total: number
}
type DashboardStockGroupRow = MainPayload['dashboard']['stockByGroup'][number]
type DashboardStockGroupSortKey = keyof DashboardStockGroupRow
type OwnerDueRow = { amount: number; daysOverdue?: number; docNo: string; due: string; name: string }
type OwnerDueSortKey = 'amount' | 'daysOverdue' | 'docNo' | 'due' | 'name'
type OwnerSmallRow = { amount: number; contractNo?: string; docNo?: string; installmentNo?: number; name?: string }
type OwnerSmallSortKey = 'amount' | 'detail' | 'ref'
type DailyBillRow = { amount: number; docNo: string; name: string; qty: number }
type DailyBillSortKey = keyof DailyBillRow
type DailyGroupProductRow = MainPayload['dailyReport']['groupBreakdown'][number]['products'][number]
type DailyGroupProductSortKey = keyof DailyGroupProductRow | 'spread'
type CashAccountRow = MainPayload['dailyReport']['cashMovement']['accounts'][number]
type CashAccountSortKey = keyof CashAccountRow | 'net'

const dashboardAgingColumns: ResizableColumnDefinition<DashboardAgingSortKey>[] = [
  { key: 'label', defaultWidth: 150, minWidth: 110 },
  { key: 'current', defaultWidth: 100, minWidth: 90 },
  { key: 'd1_30', defaultWidth: 95, minWidth: 85 },
  { key: 'd31_60', defaultWidth: 95, minWidth: 85 },
  { key: 'd61_90', defaultWidth: 95, minWidth: 85 },
  { key: 'over90', defaultWidth: 95, minWidth: 85 },
  { key: 'total', defaultWidth: 110, minWidth: 95 },
]

const dashboardStockGroupColumns: ResizableColumnDefinition<string>[] = [
  { key: 'group', defaultWidth: 180, minWidth: 130 },
  { key: 'qty', defaultWidth: 120, minWidth: 100 },
  { key: 'value', defaultWidth: 140, minWidth: 110 },
]

const dashboardDetailTabs: Array<{ key: DashboardDetailTab; label: string; summary: string }> = [
  { key: 'ranking', label: 'อันดับคู่ค้า', summary: 'Top Supplier / Customer' },
  { key: 'stock', label: 'Stock', summary: 'แนวโน้มและมูลค่าตามหมวด' },
  { key: 'metrics', label: 'ตัวชี้วัดย่อย', summary: 'ซื้อ ขาย เงินสด และ Stock' },
]

const ownerDueColumns: ResizableColumnDefinition<OwnerDueSortKey>[] = [
  { key: 'name', defaultWidth: 190, minWidth: 120 },
  { key: 'docNo', defaultWidth: 140, minWidth: 100 },
  { key: 'due', defaultWidth: 120, minWidth: 90 },
  { key: 'amount', defaultWidth: 130, minWidth: 100 },
  { key: 'daysOverdue', defaultWidth: 100, minWidth: 80 },
]

const ownerDueApColumns = ownerDueColumns.filter((column) => column.key !== 'daysOverdue')

const ownerSmallColumns: ResizableColumnDefinition<OwnerSmallSortKey>[] = [
  { key: 'ref', defaultWidth: 150, minWidth: 110 },
  { key: 'detail', defaultWidth: 180, minWidth: 110 },
  { key: 'amount', defaultWidth: 130, minWidth: 100 },
]

const dailyGroupProductColumns: ResizableColumnDefinition<DailyGroupProductSortKey>[] = [
  { key: 'productCode', defaultWidth: 110, minWidth: 80 },
  { key: 'productName', defaultWidth: 220, minWidth: 140 },
  { key: 'buyQty', defaultWidth: 120, minWidth: 90 },
  { key: 'buyAmt', defaultWidth: 130, minWidth: 100 },
  { key: 'sellQty', defaultWidth: 120, minWidth: 90 },
  { key: 'sellAmt', defaultWidth: 130, minWidth: 100 },
  { key: 'spread', defaultWidth: 120, minWidth: 90 },
]

const dailyBillColumns: ResizableColumnDefinition<DailyBillSortKey>[] = [
  { key: 'docNo', defaultWidth: 150, minWidth: 110 },
  { key: 'name', defaultWidth: 220, minWidth: 130 },
  { key: 'qty', defaultWidth: 120, minWidth: 90 },
  { key: 'amount', defaultWidth: 140, minWidth: 100 },
]

const cashAccountColumns: ResizableColumnDefinition<CashAccountSortKey>[] = [
  { key: 'name', defaultWidth: 220, minWidth: 130 },
  { key: 'cashIn', defaultWidth: 130, minWidth: 100 },
  { key: 'cashOut', defaultWidth: 130, minWidth: 100 },
  { key: 'net', defaultWidth: 130, minWidth: 100 },
]

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function MainDashboardsPageClient({ mode }: { mode: Mode }) {
  const [date, setDate] = useState(today())
  const [rangeFrom, setRangeFrom] = useState(() => {
    if (mode === 'dashboard') return `${today().slice(0, 4)}-01-01`
    if (mode === 'analytics-dashboard') {
      const d = new Date()
      d.setDate(d.getDate() - 29)
      return d.toISOString().slice(0, 10)
    }
    return today()
  })
  const [rangeMode, setRangeMode] = useState(() => {
    if (mode === 'dashboard') return 'year'
    if (mode === 'analytics-dashboard') return 'last30'
    return 'today'
  })
  const [rangeTo, setRangeTo] = useState(today())
  const [dashboardBranchId, setDashboardBranchId] = useState('')
  const [dashboardCustomerId, setDashboardCustomerId] = useState('')
  const [dashboardGroup, setDashboardGroup] = useState('')
  const [dashboardProductId, setDashboardProductId] = useState('')
  const [dashboardSupplierId, setDashboardSupplierId] = useState('')
  const [data, setData] = useState<MainPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const endpoint = mode === 'dashboard' ? '/api/dashboard' : mode === 'owner-daily' ? '/api/owner-daily' : '/api/daily-report'
  const latestLoadRequestRef = useRef(0)

  useEffect(() => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    const params = new URLSearchParams({ date })
    if (mode === 'daily-report' || mode === 'dashboard' || mode === 'analytics-dashboard') {
      params.set('from', rangeFrom)
      params.set('to', rangeTo)
    }
    if (mode === 'dashboard') {
      if (dashboardBranchId) params.set('branchId', dashboardBranchId)
      if (dashboardCustomerId) params.set('customerId', dashboardCustomerId)
      if (dashboardGroup) params.set('group', dashboardGroup)
      if (dashboardProductId) params.set('productId', dashboardProductId)
      if (dashboardSupplierId) params.set('supplierId', dashboardSupplierId)
    }
    setError(null)
    setIsLoading(true)
    dailyFetchJson<MainPayload>(`${endpoint}?${params.toString()}`)
      .then((payload) => {
        if (requestId !== latestLoadRequestRef.current) return
        setData(payload)
      })
      .catch((caught) => {
        if (requestId !== latestLoadRequestRef.current) return
        setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
      })
      .finally(() => {
        if (requestId !== latestLoadRequestRef.current) return
        setIsLoading(false)
      })
  }, [dashboardBranchId, dashboardCustomerId, dashboardGroup, dashboardProductId, dashboardSupplierId, date, endpoint, mode, rangeFrom, rangeTo])

  return (
    <section className="space-y-4">
      {mode === 'dashboard' ? <DashboardView dashboardBranchId={dashboardBranchId} dashboardCustomerId={dashboardCustomerId} dashboardGroup={dashboardGroup} dashboardProductId={dashboardProductId} dashboardSupplierId={dashboardSupplierId} data={data} date={date} rangeFrom={rangeFrom} rangeMode={rangeMode} rangeTo={rangeTo} setDashboardBranchId={setDashboardBranchId} setDashboardCustomerId={setDashboardCustomerId} setDashboardGroup={setDashboardGroup} setDashboardProductId={setDashboardProductId} setDashboardSupplierId={setDashboardSupplierId} setRangeFrom={setRangeFrom} setRangeMode={setRangeMode} setRangeTo={setRangeTo} /> : null}
      {mode === 'owner-daily' ? <OwnerDailyView data={data} /> : null}
      {mode === 'daily-report' ? <DailyReportView data={data} date={date} setDate={setDate} /> : null}
      {mode === 'analytics-dashboard' ? <AnalyticsDashboardView data={data} rangeFrom={rangeFrom} rangeMode={rangeMode} rangeTo={rangeTo} setRangeFrom={setRangeFrom} setRangeMode={setRangeMode} setRangeTo={setRangeTo} /> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {isLoading ? <div className="rounded-md bg-white p-4 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
    </section>
  )
}

function DashboardView(props: {
  dashboardBranchId: string
  dashboardCustomerId: string
  dashboardGroup: string
  dashboardProductId: string
  dashboardSupplierId: string
  data: MainPayload | null
  date: string
  rangeFrom: string
  rangeMode: string
  rangeTo: string
  setDashboardBranchId: (value: string) => void
  setDashboardCustomerId: (value: string) => void
  setDashboardGroup: (value: string) => void
  setDashboardProductId: (value: string) => void
  setDashboardSupplierId: (value: string) => void
  setRangeFrom: (value: string) => void
  setRangeMode: (value: string) => void
  setRangeTo: (value: string) => void
}) {
  const { dashboardBranchId, dashboardCustomerId, dashboardGroup, dashboardProductId, dashboardSupplierId, data, date, rangeFrom, rangeMode, rangeTo, setDashboardBranchId, setDashboardCustomerId, setDashboardGroup, setDashboardProductId, setDashboardSupplierId, setRangeFrom, setRangeMode, setRangeTo } = props
  const [agingSortKey, setAgingSortKey] = useState<DashboardAgingSortKey>('total')
  const [agingSortDirection, setAgingSortDirection] = useState<SortDirection>('desc')
  const [stockGroupSortKey, setStockGroupSortKey] = useState<DashboardStockGroupSortKey>('value')
  const [stockGroupSortDirection, setStockGroupSortDirection] = useState<SortDirection>('desc')
  const [showDashboardMobileFilters, setShowDashboardMobileFilters] = useState(false)
  const [detailTab, setDetailTab] = useState<DashboardDetailTab>('ranking')
  const agingResize = useResizableColumns('main.dashboard.aging.v1', dashboardAgingColumns)
  const stockGroupResize = useResizableColumns('main.dashboard.stock-by-group.v1', dashboardStockGroupColumns)

  const supplierSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filterOptions.suppliers ?? []).map((row) => ({
      id: row.id,
      label: row.name,
    }))
  }, [data?.filterOptions.suppliers])

  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filterOptions.customers ?? []).map((row) => ({
      id: row.id,
      label: row.code ? `${row.code} - ${row.name}` : row.name,
    }))
  }, [data?.filterOptions.customers])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filterOptions.products ?? []).slice(0, 300).map((row) => ({
      id: row.id,
      label: `${row.code} - ${row.name}`,
    }))
  }, [data?.filterOptions.products])
  const k = data?.dashboard.kpi ?? {}
  const section = data?.dashboard.sections
  const analytics = data?.dailyReport.analytics
  const purchaseWeight = section?.purchase.qty ?? 0
  const purchaseAmount = section?.purchase.amount ?? 0
  const salesAmount = section?.sales.amount ?? 0
  const purchaseCount = section?.purchase.count ?? 0
  const salesCount = section?.sales.count ?? 0
  const gp = section?.sales.gp ?? 0
  const stockQty = section?.stock.qty ?? 0
  const stockValue = section?.stock.value ?? 0
  const gpPct = salesAmount > 0 ? (gp / salesAmount) * 100 : 0
  const filteredCount = `${purchaseCount.toLocaleString('th-TH')} ซื้อ · ${salesCount.toLocaleString('th-TH')} ขาย`
  const hasActiveDashboardFilters = rangeMode !== 'year' || Boolean(dashboardBranchId || dashboardGroup || dashboardSupplierId || dashboardCustomerId || dashboardProductId)
  const hasDashboardData = Boolean(
    (k.revenue ?? 0)
    || (k.expenses ?? 0)
    || (k.netProfit ?? 0)
    || (k.cashBalance ?? 0)
    || (k.ar ?? 0)
    || (k.ap ?? 0)
    || purchaseAmount
    || salesAmount
    || stockValue
    || (data?.dashboard.historical.rows ?? 0)
    || (analytics?.topSuppliers.length ?? 0)
    || (analytics?.topCustomers.length ?? 0),
  )
  const agingRows = useMemo<DashboardAgingRow[]>(() => [
    buildDashboardAgingRow('ar', 'AR ลูกหนี้', 'emerald', data?.dashboard.agingBuckets.ar, k.ar ?? 0),
    buildDashboardAgingRow('ap', 'AP เจ้าหนี้', 'red', data?.dashboard.agingBuckets.ap, k.ap ?? 0),
  ], [data?.dashboard.agingBuckets.ap, data?.dashboard.agingBuckets.ar, k.ap, k.ar])
  const sortedAgingRows = useMemo(() => {
    return [...agingRows].sort((left, right) => compareDashboardValues(dashboardAgingValue(left, agingSortKey), dashboardAgingValue(right, agingSortKey), agingSortDirection))
  }, [agingRows, agingSortDirection, agingSortKey])
  const sortedStockGroupRows = useMemo(() => {
    const stockGroupRows = data?.dashboard.stockByGroup ?? []
    return [...stockGroupRows].sort((left, right) => compareDashboardValues(left[stockGroupSortKey], right[stockGroupSortKey], stockGroupSortDirection))
  }, [data?.dashboard.stockByGroup, stockGroupSortDirection, stockGroupSortKey])

  const periodTextMap: Record<string, { buySection: string; sellSection: string; buyLabel: string; sellLabel: string }> = {
    year: {
      buySection: 'ปีนี้',
      sellSection: 'ปีนี้',
      buyLabel: 'ซื้อปีนี้',
      sellLabel: 'ขายปีนี้',
    },
    quarter: {
      buySection: 'ไตรมาสนี้',
      sellSection: 'ไตรมาสนี้',
      buyLabel: 'ซื้อไตรมาสนี้',
      sellLabel: 'ขายไตรมาสนี้',
    },
    month: {
      buySection: 'เดือนนี้',
      sellSection: 'เดือนนี้',
      buyLabel: 'ซื้อเดือนนี้',
      sellLabel: 'ขายเดือนนี้',
    },
    week: {
      buySection: '7 วันนี้',
      sellSection: '7 วันนี้',
      buyLabel: 'ซื้อ 7 วันนี้',
      sellLabel: 'ขาย 7 วันนี้',
    },
    today: {
      buySection: 'วันนี้',
      sellSection: 'วันนี้',
      buyLabel: 'ซื้อวันนี้',
      sellLabel: 'ขายวันนี้',
    },
  }
  const periodInfo = periodTextMap[rangeMode] || {
    buySection: 'ตามช่วงเวลา',
    sellSection: 'ตามช่วงเวลา',
    buyLabel: 'ซื้อสะสม',
    sellLabel: 'ขายสะสม',
  }

  const applyPeriod = (nextPeriod: string) => {
    setRangeMode(nextPeriod)
    if (nextPeriod === 'today') {
      setRangeFrom(date)
      setRangeTo(date)
    } else if (nextPeriod === 'week') {
      const start = new Date(`${date}T00:00:00`)
      start.setDate(start.getDate() - 6)
      setRangeFrom(start.toISOString().slice(0, 10))
      setRangeTo(date)
    } else if (nextPeriod === 'month') {
      setRangeFrom(`${date.slice(0, 7)}-01`)
      setRangeTo(date)
    } else if (nextPeriod === 'quarter') {
      const parsed = new Date(`${date}T00:00:00`)
      const quarterMonth = Math.floor(parsed.getMonth() / 3) * 3
      setRangeFrom(`${parsed.getFullYear()}-${String(quarterMonth + 1).padStart(2, '0')}-01`)
      setRangeTo(date)
    } else if (nextPeriod === 'year') {
      setRangeFrom(`${date.slice(0, 4)}-01-01`)
      setRangeTo(date)
    }
  }
  const clearFilters = () => {
    setDashboardBranchId('')
    setDashboardGroup('')
    setDashboardSupplierId('')
    setDashboardCustomerId('')
    setDashboardProductId('')
    applyPeriod('year')
  }
  const toggleAgingSort = (key: DashboardAgingSortKey) => {
    if (agingSortKey === key) setAgingSortDirection(agingSortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setAgingSortKey(key)
      setAgingSortDirection(key === 'label' ? 'asc' : 'desc')
    }
  }
  const toggleStockGroupSort = (key: DashboardStockGroupSortKey) => {
    if (stockGroupSortKey === key) setStockGroupSortDirection(stockGroupSortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setStockGroupSortKey(key)
      setStockGroupSortDirection(key === 'group' ? 'asc' : 'desc')
    }
  }
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-600">ช่วงเวลา:</span>
          <button className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-blue-100" type="button" onClick={() => setShowDashboardMobileFilters(true)}>
            ตัวกรอง {hasActiveDashboardFilters ? '(มี)' : ''}
          </button>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {[
            ['year', 'ปีนี้'],
            ['quarter', 'ไตรมาส'],
            ['month', 'เดือนนี้'],
            ['week', '7 วัน'],
            ['today', 'วันนี้'],
          ].map(([key, label]) => (
            <button className={`h-8 shrink-0 rounded-md px-3 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-blue-100 ${rangeMode === key ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`} key={`mobile-${key}`} onClick={() => applyPeriod(key)} type="button">{label}</button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
          <span className="min-w-0 truncate">{rangeFrom} → {rangeTo}</span>
          <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-slate-700">{filteredCount}</span>
        </div>
      </div>
      {showDashboardMobileFilters ? (
        <MobileFilterSheet
          footer={(
            <>
              <button
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={() => {
                  clearFilters()
                  setShowDashboardMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                type="button"
                onClick={() => setShowDashboardMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </>
          )}
          onClose={() => setShowDashboardMobileFilters(false)}
          title="ตัวกรอง Dashboard"
          visibleClassName="lg:hidden"
        >
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงวันที่</span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <DatePickerInput className="w-full" value={rangeFrom} onChange={(value) => { setRangeMode('custom'); setRangeFrom(value) }} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="w-full" value={rangeTo} onChange={(value) => { setRangeMode('custom'); setRangeTo(value) }} />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
            <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100" value={dashboardBranchId} onChange={(event) => setDashboardBranchId(event.target.value)}><option value="">ทุกสาขา</option>{(data?.filterOptions.branches ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">หมวดสินค้า</span>
            <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100" value={dashboardGroup} onChange={(event) => setDashboardGroup(event.target.value)}><option value="">ทุกหมวด</option>{(data?.filterOptions.groups ?? []).map((group) => <option key={group} value={group}>{group}</option>)}</select>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Supplier</span>
            <SearchCombobox inputId="dashboard-supplier-filter-mobile" label="Supplier" hideLabel placeholder="ทุก Supplier" options={supplierSearchOptions} value={dashboardSupplierId} onChange={setDashboardSupplierId} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Customer</span>
            <SearchCombobox inputId="dashboard-customer-filter-mobile" label="Customer" hideLabel placeholder="ทุก Customer" options={customerSearchOptions} value={dashboardCustomerId} onChange={setDashboardCustomerId} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">สินค้า</span>
            <SearchCombobox inputId="dashboard-product-filter-mobile" label="สินค้า" hideLabel placeholder="ทุกสินค้า" options={productSearchOptions} value={dashboardProductId} onChange={setDashboardProductId} />
          </div>
        </MobileFilterSheet>
      ) : null}
      <div className="hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2 text-slate-800">
          <span className="text-xs font-semibold text-slate-600">ช่วงเวลา:</span>
          {[
            ['year', 'ปีนี้'],
            ['quarter', 'ไตรมาส'],
            ['month', 'เดือนนี้'],
            ['week', '7 วัน'],
            ['today', 'วันนี้'],
          ].map(([key, label]) => (
            <button className={`h-8 rounded-md px-3 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-blue-100 ${rangeMode === key ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`} key={key} onClick={() => applyPeriod(key)} type="button">{label}</button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
          <DatePickerInput className="h-8 w-[136px] border-slate-200 bg-white text-slate-900 [&_input]:text-slate-900 [&_input]:placeholder:text-slate-400" value={rangeFrom} onChange={(value) => { setRangeMode('custom'); setRangeFrom(value) }} />
          <span className="text-xs text-slate-400">→</span>
          <DatePickerInput className="h-8 w-[136px] border-slate-200 bg-white text-slate-900 [&_input]:text-slate-900 [&_input]:placeholder:text-slate-400" value={rangeTo} onChange={(value) => { setRangeMode('custom'); setRangeTo(value) }} />
          <span className="ml-auto rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">{filteredCount}</span>
          <button className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-blue-100" onClick={clearFilters} type="button">ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(170px,1fr)]">
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-500">สาขา</span>
            <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-100" value={dashboardBranchId} onChange={(event) => setDashboardBranchId(event.target.value)}><option value="">ทุกสาขา</option>{(data?.filterOptions.branches ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-500">หมวดสินค้า</span>
            <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-100" value={dashboardGroup} onChange={(event) => setDashboardGroup(event.target.value)}><option value="">ทุกหมวด</option>{(data?.filterOptions.groups ?? []).map((group) => <option key={group} value={group}>{group}</option>)}</select>
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-500">Supplier</span>
            <SearchCombobox
              inputId="dashboard-supplier-filter"
              label="Supplier"
              hideLabel
              inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
              placeholder="ทุก Supplier"
              options={supplierSearchOptions}
              value={dashboardSupplierId}
              onChange={setDashboardSupplierId}
            />
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-500">Customer</span>
            <SearchCombobox
              inputId="dashboard-customer-filter"
              label="Customer"
              hideLabel
              inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
              placeholder="ทุก Customer"
              options={customerSearchOptions}
              value={dashboardCustomerId}
              onChange={setDashboardCustomerId}
            />
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-slate-500">สินค้า</span>
            <SearchCombobox
              inputId="dashboard-product-filter"
              label="สินค้า"
              hideLabel
              inputClassName="h-9 border-slate-300 bg-white font-medium text-slate-900 placeholder:text-slate-500"
              placeholder="ทุกสินค้า"
              options={productSearchOptions}
              value={dashboardProductId}
              onChange={setDashboardProductId}
            />
          </div>
        </div>
      </div>
      <div>
        {(data?.dashboard.historical.rows ?? 0) > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">
            <span className="font-bold text-slate-700">รวมยอด Historical:</span>
            <span className="rounded-md bg-white px-2 py-0.5 border border-slate-100 font-semibold text-slate-700">Revenue <b className="text-emerald-700">{money(data?.dashboard.historical.revenue)}</b></span>
            <span className="rounded-md bg-white px-2 py-0.5 border border-slate-100 font-semibold text-slate-700">COGS <b className="text-red-700">{money(data?.dashboard.historical.cogs)}</b></span>
            <span className="rounded-md bg-white px-2 py-0.5 border border-slate-100 font-semibold text-slate-700">Expenses <b className="text-amber-700">{money(data?.dashboard.historical.expenses)}</b></span>
            <span className="text-slate-500">({data?.dashboard.historical.rows ?? 0} rows)</span>
          </div>
        ) : null}
        {!hasDashboardData ? (
          <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
            ยังไม่มีข้อมูลในช่วงเวลาหรือตัวกรองนี้ ลองเปลี่ยนช่วงเวลา หรือล้างตัวกรองเพื่อดูภาพรวมทั้งหมด
          </div>
        ) : null}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <DashboardKpi label="Revenue" sub="ยอดขาย" tone="blue" value={money(k.revenue)} />
          <DashboardKpi label="Expenses" sub="ค่าใช้จ่าย + COGS" tone="red" value={money(k.expenses)} />
          <DashboardKpi label="Net Profit" sub="กำไรสุทธิ" tone={(k.netProfit ?? 0) >= 0 ? 'emerald' : 'red'} value={money(k.netProfit)} />
          <DashboardKpi label="Cash Balance" sub="เงินสด/ธนาคาร" tone="cyan" value={money(k.cashBalance)} />
          <DashboardKpi label="AR ลูกหนี้" sub="Receivable" tone="purple" value={money(k.ar)} />
          <DashboardKpi label="AP เจ้าหนี้" sub="Payable" tone="orange" value={money(k.ap)} />
        </div>
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <DashboardChartCard title="Revenue vs Expense (Monthly)">
            <BarRows rows={(data?.dashboard.monthlyTrend ?? []).flatMap((row) => [{ label: `${monthLabel(row.label)} Rev`, value: row.sales }, { label: `${monthLabel(row.label)} Exp`, value: row.expense + Math.max(0, row.sales - row.gp) }])} />
          </DashboardChartCard>
          <DashboardChartCard title="Cash Flow Overview">
            <BarRows rows={(data?.dashboard.cashComposition ?? []).map((row) => ({ label: row.label, value: row.value }))} />
          </DashboardChartCard>
        </div>
        <div className="mb-4">
          <DashboardChartCard title="Receivables & Payables Aging">
            <div className="mb-2 flex justify-end">
              {agingResize.hasCustomWidths ? (
                <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50" type="button" onClick={agingResize.resetColumnWidths}>
                  คืนค่าเดิมตาราง
                </button>
              ) : null}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full divide-y divide-slate-200 text-xs" style={{ minWidth: agingResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {dashboardAgingColumns.map((column) => (
                    <col key={column.key} style={agingResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <ResizableTableHead activeSortKey={agingSortKey} direction={agingSortDirection} label="Type" resizeProps={agingResize.getResizeHandleProps('label', 'Type')} sortKey="label" onSort={toggleAgingSort} />
                    <ResizableTableHead activeSortKey={agingSortKey} align="right" direction={agingSortDirection} label="Current" resizeProps={agingResize.getResizeHandleProps('current', 'Current')} sortKey="current" onSort={toggleAgingSort} />
                    <ResizableTableHead activeSortKey={agingSortKey} align="right" direction={agingSortDirection} label="1-30" resizeProps={agingResize.getResizeHandleProps('d1_30', '1-30')} sortKey="d1_30" onSort={toggleAgingSort} />
                    <ResizableTableHead activeSortKey={agingSortKey} align="right" direction={agingSortDirection} label="31-60" resizeProps={agingResize.getResizeHandleProps('d31_60', '31-60')} sortKey="d31_60" onSort={toggleAgingSort} />
                    <ResizableTableHead activeSortKey={agingSortKey} align="right" direction={agingSortDirection} label="61-90" resizeProps={agingResize.getResizeHandleProps('d61_90', '61-90')} sortKey="d61_90" onSort={toggleAgingSort} />
                    <ResizableTableHead activeSortKey={agingSortKey} align="right" direction={agingSortDirection} label=">90" resizeProps={agingResize.getResizeHandleProps('over90', '>90')} sortKey="over90" onSort={toggleAgingSort} />
                    <ResizableTableHead activeSortKey={agingSortKey} align="right" direction={agingSortDirection} label="Total" resizeProps={agingResize.getResizeHandleProps('total', 'Total')} sortKey="total" onSort={toggleAgingSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedAgingRows.map((row) => {
                    const textTone = row.tone === 'emerald' ? 'text-emerald-700' : 'text-red-700'
                    return (
                      <tr key={row.key} className="hover:bg-slate-50/50">
                        <td className={`p-2 font-medium ${textTone} min-w-0 overflow-hidden`}><div className="truncate" title={row.label}>{row.label}</div></td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.current)}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.d1_30)}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.d31_60)}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.d61_90)}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.over90)}</td>
                        <td className={`p-2 text-right font-bold tabular-nums whitespace-nowrap ${textTone}`}>{money(row.total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 sm:hidden">
              {sortedAgingRows.map((row) => {
                const textTone = row.tone === 'emerald' ? 'text-emerald-700' : 'text-red-700'
                return (
                  <div key={row.key} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-xs">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`font-bold ${textTone}`}>{row.label}</span>
                      <span className={`font-bold ${textTone}`}>{money(row.total)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-slate-600">
                      <span>Current: <b>{money(row.current)}</b></span>
                      <span>1-30: <b>{money(row.d1_30)}</b></span>
                      <span>31-60: <b>{money(row.d31_60)}</b></span>
                      <span>61-90: <b>{money(row.d61_90)}</b></span>
                      <span className="col-span-2">&gt;90: <b>{money(row.over90)}</b></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </DashboardChartCard>
        </div>
      </div>

      <Tabs className="gap-2" value={detailTab} onValueChange={(value) => setDetailTab(value as DashboardDetailTab)}>
        <TabsList className="w-full overflow-x-auto rounded-md bg-white px-2 shadow-sm" variant="line">
          {dashboardDetailTabs.map((tab) => {
            return (
              <TabsTrigger
                key={tab.key}
                aria-label={`${tab.label}: ${tab.summary}`}
                className="px-3 text-xs sm:text-sm"
                value={tab.key}
                variant="line"
              >
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {detailTab === 'ranking' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800">Top Ranking</h2>
            <span className="text-xs font-medium text-slate-500">อันดับคู่ค้าที่ช่วยอ่านภาพรวมเร็ว ไม่แทนรายการเอกสารต้นทาง</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2"><RankTable color="blue" rows={analytics?.topSuppliers ?? []} title="Top Suppliers" /><RankTable color="emerald" rows={analytics?.topCustomers ?? []} title="Top Customers" /></div>
        </div>
      ) : null}

      {detailTab === 'stock' ? (
        <div className="grid gap-4 lg:grid-cols-2">
        <DashboardChartCard title="แนวโน้มซื้อ-ขาย 30 วัน"><BarRows rows={(analytics?.dailyTrend ?? []).slice(-10).flatMap((row) => [{ label: `${row.label} ซื้อ`, value: row.purchase }, { label: `${row.label} ขาย`, value: row.sales }])} /></DashboardChartCard>
        <DashboardChartCard title="มูลค่าสินค้าตามหมวด">
          <div className="mb-2 flex justify-end">
            {stockGroupResize.hasCustomWidths ? (
              <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50" type="button" onClick={stockGroupResize.resetColumnWidths}>
                คืนค่าเดิมตาราง
              </button>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full divide-y divide-slate-200 text-xs" style={{ minWidth: stockGroupResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {dashboardStockGroupColumns.map((column, index) => (
                  <col key={column.key} style={index === dashboardStockGroupColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : stockGroupResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <ResizableTableHead activeSortKey={stockGroupSortKey} direction={stockGroupSortDirection} label="หมวด" resizeProps={stockGroupResize.getResizeHandleProps('group', 'หมวด')} sortKey="group" onSort={toggleStockGroupSort} />
                  <ResizableTableHead activeSortKey={stockGroupSortKey} align="right" direction={stockGroupSortDirection} label="กก." resizeProps={stockGroupResize.getResizeHandleProps('qty', 'กก.')} sortKey="qty" onSort={toggleStockGroupSort} />
                  <ResizableTableHead activeSortKey={stockGroupSortKey} align="right" direction={stockGroupSortDirection} label="มูลค่า" resizeProps={stockGroupResize.getResizeHandleProps('value', 'มูลค่า')} sortKey="value" onSort={toggleStockGroupSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedStockGroupRows.map((row) => (
                  <tr className="hover:bg-slate-50/50" key={row.group}>
                    <td className="p-2 font-medium text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.group}>{row.group}</div></td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.qty)}</td>
                    <td className="p-2 text-right font-bold text-indigo-700 tabular-nums whitespace-nowrap">{money(row.value)}</td>
                  </tr>
                ))}
                {sortedStockGroupRows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={3}>ไม่มีข้อมูล</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 sm:hidden">
            {sortedStockGroupRows.map((row) => (
              <div key={row.group} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-xs">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 truncate">{row.group}</span>
                  <span className="font-bold text-indigo-700">{money(row.value)}</span>
                </div>
                <div className="text-slate-600">น้ำหนัก: <b>{money(row.qty)} กก.</b></div>
              </div>
            ))}
            {sortedStockGroupRows.length === 0 ? <div className="py-4 text-center text-xs text-slate-400">ไม่มีข้อมูล</div> : null}
          </div>
        </DashboardChartCard>
      </div>
      ) : null}

      {detailTab === 'metrics' ? (
        <>
          <Section title={`ฝั่งซื้อ (${periodInfo.buySection}) — Purchase / Supplier`}>
            <Metric label="จำนวนบิลซื้อ" tone="blue" value={`${purchaseCount.toLocaleString('th-TH')} บิล`} />
            <Metric label="น้ำหนักซื้อ" value={`${money(section?.purchase.qty)} กก.`} />
            <Metric label="ราคาซื้อเฉลี่ย" value={`${money(purchaseWeight > 0 ? purchaseAmount / purchaseWeight : 0)} ฿/กก.`} />
          </Section>
          <Section title={`ฝั่งขาย (${periodInfo.sellSection}) — Sales / Customer`}>
            <Metric label="จำนวนบิลขาย" tone="emerald" value={`${salesCount.toLocaleString('th-TH')} บิล`} />
            <Metric label="น้ำหนักขาย" value={`${money(section?.sales.qty)} กก.`} />
            <Metric label="Gross Profit" tone="emerald" value={money(section?.sales.gp)} />
            <Metric label="Margin %" tone={(gpPct ?? 0) >= 0 ? 'emerald' : 'red'} value={`${money(gpPct)}%`} />
          </Section>
          <Section title="ฝั่งการเงิน — Cash / Bank / OD">
            <Metric label="เงินสดรวม" tone="emerald" value={money(section?.cash.cash)} />
            <Metric label="ธนาคารรวม" tone="blue" value={money(section?.cash.bank)} />
            <Metric label="FCD" tone="purple" value={money(section?.cash.fcd)} />
            <Metric label="OD ใช้ / เหลือ" tone="orange" value={`${money(section?.cash.odUsed)} / ${money(section?.cash.odLimit)}`} />
            <Metric label="Net Cash Position" tone="purple" value={money(section?.cash.netCash)} />
          </Section>
          <Section title="ฝั่ง Stock — Inventory / WAC">
            <Metric label="น้ำหนักรวม" value={`${money(section?.stock.qty)} กก.`} />
            <Metric label="มูลค่าสต๊อกรวม" tone="orange" value={money(section?.stock.value)} />
            <Metric label="ราคาต่อหน่วยเฉลี่ย" value={`${money(stockQty > 0 ? stockValue / stockQty : 0)} ฿/กก.`} />
            {(data?.dashboard.stockByBranch ?? []).slice(0, 3).map((row) => <Metric key={row.name} label={row.name} value={`${money(row.qty)} กก. · ${money(row.value)}`} />)}
          </Section>
        </>
      ) : null}
    </>
  )
}

function monthLabel(value: string) {
  const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const month = Number(value.slice(5, 7)) - 1
  return `${monthNames[month] ?? value.slice(5, 7)} ${value.slice(2, 4)}`
}

function buildDashboardAgingRow(
  key: DashboardAgingRow['key'],
  label: string,
  tone: DashboardAgingRow['tone'],
  buckets: Record<string, number> | undefined,
  total: number,
): DashboardAgingRow {
  return {
    current: buckets?.current ?? 0,
    d1_30: buckets?.['1-30'] ?? 0,
    d31_60: buckets?.['31-60'] ?? 0,
    d61_90: buckets?.['61-90'] ?? 0,
    key,
    label,
    over90: buckets?.over90 ?? 0,
    tone,
    total,
  }
}

function dashboardAgingValue(row: DashboardAgingRow, key: DashboardAgingSortKey) {
  return row[key]
}

function compareDashboardValues(left: number | string | null | undefined, right: number | string | null | undefined, direction: SortDirection) {
  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left ?? '').localeCompare(String(right ?? ''), 'th', { numeric: true, sensitivity: 'base' })

  return direction === 'asc' ? result : -result
}

function ownerDueValue(row: OwnerDueRow, key: OwnerDueSortKey) {
  if (key === 'daysOverdue') return row.daysOverdue ?? 0
  return row[key]
}

function ownerSmallValue(row: OwnerSmallRow, key: OwnerSmallSortKey) {
  if (key === 'ref') return row.docNo ?? row.contractNo ?? ''
  if (key === 'detail') return row.name ?? String(row.installmentNo ?? '')
  return row.amount
}

function dailyGroupProductValue(row: DailyGroupProductRow, key: DailyGroupProductSortKey) {
  if (key === 'spread') return row.sellQty && row.buyQty ? row.sellAmt / row.sellQty - row.buyAmt / row.buyQty : 0
  return row[key]
}

function cashAccountValue(row: CashAccountRow, key: CashAccountSortKey) {
  if (key === 'net') return row.cashIn - row.cashOut
  return row[key]
}

function DashboardKpi({ label, sub, tone, value }: { label: string; sub: string; tone: string; value: string }) {
  const toneMap: Record<string, { accent: string; text: string }> = {
    blue: { accent: 'bg-blue-500', text: 'text-blue-700' },
    cyan: { accent: 'bg-cyan-500', text: 'text-cyan-700' },
    emerald: { accent: 'bg-emerald-500', text: 'text-emerald-700' },
    orange: { accent: 'bg-orange-500', text: 'text-orange-700' },
    purple: { accent: 'bg-purple-500', text: 'text-purple-700' },
    red: { accent: 'bg-rose-500', text: 'text-rose-700' },
  }
  const style = toneMap[tone] ?? { accent: 'bg-slate-400', text: 'text-slate-800' }

  return (
    <div className="relative flex min-h-[116px] min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-4 pl-5 shadow-sm">
      <div className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
      </div>
      <div className={`mt-3 truncate font-mono text-xl font-bold tabular-nums ${style.text}`}>{value}</div>
    </div>
  )
}

function DashboardChartCard({ children, className = '', title }: { children: ReactNode; className?: string; title: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`.trim()}><div className="mb-3 text-sm font-bold text-slate-800">{title}</div>{children}</div>
}

function OwnerDailyView({ data }: { data: MainPayload | null }) {
  const plan = data?.ownerDaily.cashPlan
  const pending = data?.ownerDaily.pending ?? {}
  const actual = data?.ownerDaily.actualActivity
  const gapPositive = (plan?.gap ?? 0) >= 0
  const cardBg = gapPositive ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
  const iconColor = gapPositive ? 'text-emerald-500' : 'text-rose-500'

  return (
    <>
      <div className={`relative overflow-hidden rounded-xl p-6 shadow-sm border ${cardBg}`}>
        <div className={`absolute right-3 top-2 text-7xl opacity-20 ${iconColor}`}>{gapPositive ? '✅' : '⚠️'}</div>
        <div className="relative">
          <div className="text-sm opacity-90">{gapPositive ? '✓ คาดการณ์เงินเหลือสิ้นวัน' : '⚠ คาดการณ์เงินขาด ต้องเตรียม!'}</div>
          <div className="mt-1 font-mono text-4xl font-bold">{money(plan?.gap)}</div>
          <div className="mt-2 text-xs opacity-90 font-medium">= 💵 เงินสด {money(plan?.available)} + 📥 คาดเข้า {money(plan?.expectedIn)} − 📤 คาดออก {money(plan?.expectedOut)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <LegacyKpi label="💵 เงินสดในมือ" sub="รวม Cash + Bank" tone="blue" value={money(plan?.available)} />
        <LegacyKpi label="📥 คาดรับวันนี้" sub={`${data?.ownerDaily.due.ar.length ?? 0} ลูกค้าครบกำหนด`} tone="emerald" value={`+${money(plan?.expectedIn)}`} />
        <LegacyKpi label="📤 คาดจ่ายวันนี้" sub={`AP ${money(data?.ownerDaily.due.ap.reduce((sum, row) => sum + row.amount, 0))} · Loan ${money(data?.ownerDaily.loanToday.reduce((sum, row) => sum + row.amount, 0))} · Exp ${money(data?.ownerDaily.expensesToday.reduce((sum, row) => sum + row.amount, 0))}`} tone="red" value={`-${money(plan?.expectedOut)}`} />
      </div>
      {(pending.tradingPending ?? 0) > 0 ? <PendingBlock color="purple" cta="→ ไป Trading Matching" title="🔄 Trading Pending รับเงิน — จ่ายซื้อ Trading แล้ว แต่ยังไม่เปิดบิลขาย" cards={[['📋 บิลซื้อ Trading', String(pending.tradingPending)], ['💸 จ่ายไปแล้ว', money(pending.tradingPaidTotal)], ['✓ Match แล้ว', money(pending.tradingMatchedTotal)], ['⏳ Pending รับเงิน', money(pending.tradingPendingValue)]]} /> : null}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">📊 ที่เกิดขึ้นจริงวันนี้แล้ว</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile tone="emerald" label="📥 รับเงินจริง" value={`+${money(actual?.cashIn)}`} />
          <Tile tone="red" label="📤 จ่าย Supplier" value={`-${money(actual?.paymentOut)}`} />
          <Tile tone="orange" label="💰 ค่าใช้จ่าย" value={`-${money(actual?.expenseOut)}`} className="col-span-2 md:col-span-1" />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2"><OwnerDueTable rows={data?.ownerDaily.due.ar ?? []} title="📥 ลูกหนี้ที่ควรเก็บวันนี้" type="ar" /><OwnerDueTable rows={data?.ownerDaily.due.ap ?? []} title="📤 เจ้าหนี้ที่ต้องจ่ายวันนี้" type="ap" /></div>
      <div className="grid gap-3 lg:grid-cols-3">
        <OwnerSmallTable rows={data?.ownerDaily.loanToday ?? []} tableKey="loan" title="🏦 ค่างวด/ดอกเบี้ยวันนี้" />
        <OwnerSmallTable rows={(data?.ownerDaily.expensesToday ?? []).map((row) => ({ amount: row.amount, docNo: row.docNo, name: row.payee }))} tableKey="expense" title="💰 ค่าใช้จ่ายวันนี้" />
        <Panel title="📋 รายการรอดำเนินการ">
          <div className="space-y-3 text-sm">
            <MiniLine label="📥 บิลซื้อ Draft" value={money(pending.pendingPurchaseCount)} />
            <MiniLine label="📤 บิลขาย Draft" value={money(pending.pendingSalesCount)} />
            <MiniLine label={`📦 FG พร้อมขาย (${money(pending.fgQty)} กก.)`} value={money(pending.fgValue)} />
          </div>
        </Panel>
      </div>
    </>
  )
}

function DailyReportView({ data, date, setDate }: { data: MainPayload | null; date: string; setDate: (value: string) => void }) {
  const [expandedGroup, setExpandedGroup] = useState('')
  const summary = data?.dailyReport.summary ?? {}
  const purchaseCount = data?.dailyReport.purchaseBills.length ?? 0
  const salesCount = data?.dailyReport.salesBills.length ?? 0
  const analytics = data?.dailyReport.analytics
  const isToday = date === today()
  function shiftDate(days: number) {
    const next = new Date(`${date}T00:00:00`)
    next.setDate(next.getDate() + days)
    setDate(next.toISOString().slice(0, 10))
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-100 mb-4">
        <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 outline-none" type="button" onClick={() => shiftDate(-1)}>← วันก่อน</button>
        <DatePickerInput className="w-[140px]" value={date} onChange={setDate} />
        <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 outline-none" disabled={isToday} type="button" onClick={() => shiftDate(1)}>วันถัดไป →</button>
        <button className={isToday ? 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white outline-none' : 'rounded-lg bg-yellow-300 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-yellow-200 outline-none'} type="button" onClick={() => setDate(today())}>📍 วันนี้</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <DailyBigCard count={purchaseCount} icon="📥" label="ยอดรับซื้อ" sub={`เฉลี่ย ${money((summary.purchaseAmount ?? 0) / Math.max(1, summary.purchaseQty ?? 0))} ฿/กก.`} tone="from-blue-600 to-indigo-700" value={money(summary.purchaseAmount)} weight={money(summary.purchaseQty)} />
        <DailyBigCard count={salesCount} icon="📤" label="ยอดขาย" sub={`GP ${money(summary.salesAmount - (analytics?.rangeKpi.cogs ?? 0))} (${money(analytics?.rangeKpi.gpPct)}%)`} tone="from-emerald-600 to-teal-700" value={money(summary.salesAmount)} weight={money(summary.salesQty)} />
      </div>
      <GroupBreakdown groups={data?.dailyReport.groupBreakdown ?? []} expandedGroup={expandedGroup} setExpandedGroup={setExpandedGroup} />
      <div className="grid gap-4 lg:grid-cols-2"><DailyBillTable rows={data?.dailyReport.purchaseBills ?? []} title={`📋 บิลรับซื้อประจำวัน (${purchaseCount})`} total={summary.purchaseAmount ?? 0} tone="blue" /><DailyBillTable rows={data?.dailyReport.salesBills ?? []} title={`📋 บิลขายประจำวัน (${salesCount})`} total={summary.salesAmount ?? 0} tone="emerald" /></div>
      <ExpenseSummary rows={data?.dailyReport.expenseByCategory ?? []} total={summary.expenseAmount ?? 0} />
      <CashMovement movement={data?.dailyReport.cashMovement} />
    </>
  )
}

function AnalyticsDashboardView({ data, rangeFrom, rangeMode, rangeTo, setRangeFrom, setRangeMode, setRangeTo }: { data: MainPayload | null; rangeFrom: string; rangeMode: string; rangeTo: string; setRangeFrom: (value: string) => void; setRangeMode: (value: string) => void; setRangeTo: (value: string) => void }) {
  const analytics = data?.dailyReport.analytics
  const trendMax = useMemo(() => Math.max(1, ...(analytics?.dailyTrend ?? []).flatMap((row) => [row.purchase, row.sales])), [analytics?.dailyTrend])

  function applyRange(mode: string) {
    setRangeMode(mode)
    const end = new Date(`${today()}T00:00:00`)
    const start = new Date(end)
    if (mode === 'yesterday') {
      start.setDate(end.getDate() - 1)
      end.setDate(end.getDate() - 1)
    } else if (mode === 'last7') start.setDate(end.getDate() - 6)
    else if (mode === 'last30') start.setDate(end.getDate() - 29)
    else if (mode === 'last90') start.setDate(end.getDate() - 89)
    else if (mode === 'month') start.setDate(1)
    setRangeFrom(start.toISOString().slice(0, 10))
    setRangeTo(end.toISOString().slice(0, 10))
  }

  function printReport() {
    window.print()
  }

  const gpVal = analytics?.rangeKpi.gp ?? 0
  const gpTone = gpVal === 0 ? 'slate' : 'emerald'

  return (
    <div className="pt-2 animate-fade-in pb-16">
      <div className="mb-4 rounded-xl bg-gradient-to-r from-violet-900 to-indigo-950 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">📊 Analytics Dashboard</h2></div>
          <div className="flex flex-wrap items-center gap-2">
            {['today', 'yesterday', 'last7', 'last30', 'last90', 'month'].map((mode) => (
              <button key={mode} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all outline-none focus:ring-0 ${rangeMode === mode ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`} type="button" onClick={() => applyRange(mode)}>{rangeLabel(mode)}</button>
            ))}
            <DatePickerInput className="w-[130px] bg-white text-slate-900 border-slate-300 outline-none" value={rangeFrom} onChange={(value) => { setRangeMode('custom'); setRangeFrom(value) }} />
            <span className="text-xs">→</span>
            <DatePickerInput className="w-[130px] bg-white text-slate-900 border-slate-300 outline-none" value={rangeTo} onChange={(value) => { setRangeMode('custom'); setRangeTo(value) }} />
          </div>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AnalyticsKpiCard icon="📥" label="ยอดซื้อ" value={money(analytics?.rangeKpi.purchaseAmount)} subtext={`(${analytics?.rangeKpi.purchaseCount ?? 0} บิล)`} unit="บาท" tone="blue" />
        <AnalyticsKpiCard icon="🥧" label="กำไรขั้นต้น" value={money(gpVal)} subtext={`อัตรากำไร ${analytics?.rangeKpi.gpPct?.toFixed(2) ?? '0.00'}%`} unit="บาท" tone={gpTone} />
        <AnalyticsKpiCard icon="📤" label="ยอดขาย" value={money(analytics?.rangeKpi.salesAmount)} subtext={`(${analytics?.rangeKpi.salesCount ?? 0} บิล)`} unit="บาท" tone="emerald" />
        <AnalyticsKpiCard icon="⚖️" label="น้ำหนักขาย" value={money(analytics?.rangeKpi.salesQty)} subtext="น้ำหนักรวมของสินค้าที่ขาย" unit="กิโลกรัม" tone="cyan" />
        <div className="col-span-2 lg:col-span-1">
          <AnalyticsKpiCard icon="💸" label="ค่าใช้จ่าย" value={money(analytics?.rangeKpi.expenseAmount)} subtext="ค่าใช้จ่ายในการดำเนินงาน" unit="บาท" tone="orange" />
        </div>
      </div>
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-white p-4 shadow-sm border border-slate-200">
           <h3 className="mb-3 font-bold text-slate-700 text-sm">📈 ยอดซื้อ vs ขาย (รายวัน)</h3>
           {(analytics?.dailyTrend ?? []).map((row) => <div key={row.label} className="mb-2.5 grid grid-cols-12 items-center gap-2 text-xs"><div className="col-span-3 font-mono text-slate-600">{row.label}</div><div className="col-span-4 rounded-full bg-slate-100 h-5 overflow-hidden"><div className="rounded-full bg-blue-500 h-full text-right text-white pr-2 font-bold text-xs flex items-center justify-end" style={{ width: `${Math.max(15, row.purchase / trendMax * 100)}%` }}>{money(row.purchase)}</div></div><div className="col-span-5 rounded-full bg-slate-100 h-5 overflow-hidden"><div className="rounded-full bg-emerald-500 h-full text-right text-white pr-2 font-bold text-xs flex items-center justify-end" style={{ width: `${Math.max(15, row.sales / trendMax * 100)}%` }}>{money(row.sales)}</div></div></div>)}
        </div>
        <TopSimpleTable rows={analytics?.groupSummary ?? []} title="🥧 มูลค่าตามหมวดสินค้า" />
      </div>
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <RankTable color="blue" rows={analytics?.topSuppliers ?? []} title="🥇 Top 10 ผู้ขาย (ยอดซื้อสูงสุด)" />
        <RankTable color="emerald" rows={analytics?.topCustomers ?? []} title="🥇 Top 10 ผู้ซื้อ (ยอดขายสูงสุด)" />
      </div>
      <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <ProductRank rows={analytics?.topProductsIn ?? []} title="📦 Top 5 สินค้ารับเข้า (ตามมูลค่า)" tone="indigo" />
        <ProductRank rows={analytics?.topProductsOut ?? []} title="📦 Top 5 สินค้าขายออก (ตามมูลค่า)" tone="teal" />
      </div>
      <div className="mb-4">
        <SalespersonTable rows={analytics?.bySalesperson ?? []} />
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-50 flex flex-row gap-2">
        <button
          className="shadow-lg rounded-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 text-sm font-semibold transition-all hover:scale-105 active:scale-95 outline-none"
          type="button"
          onClick={() => {
            alert('แชร์ข้อมูลสรุปไปที่ LINE OA เรียบร้อยแล้ว')
          }}
        >
          <span>🟢</span> Share รูปภาพ - LINE
        </button>
        <button
          className="shadow-lg rounded-full px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 text-sm font-semibold transition-all hover:scale-105 active:scale-95 outline-none"
          type="button"
          onClick={printReport}
        >
          <span>🖨️</span> Export PDF / Print
        </button>
      </div>
    </div>
  )
}

function rangeLabel(mode: string) {
  const labels: Record<string, string> = { last30: '30 วัน', last7: '7 วัน', last90: '90 วัน', month: 'เดือนนี้', today: 'วันนี้', yesterday: 'เมื่อวาน' }
  return labels[mode] ?? mode
}

function LegacyKpi({ label, sub, tone, value }: { label: string; sub: string; tone: string; value: string }) {
  const toneMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    red: { bg: 'bg-red-50', text: 'text-red-600' },
  }
  const style = toneMap[tone] || { bg: 'bg-slate-50', text: 'text-slate-600' }
  const icon = label.slice(0, 2)
  const cleanLabel = label.slice(2).trim()

  return (
    <div className="flex items-center gap-3 bg-white p-4 shadow-sm border border-slate-100 rounded-xl">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.text} text-2xl`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500">{cleanLabel}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
        <div className={`mt-0.5 font-mono text-lg font-bold truncate ${style.text}`}>{value}</div>
      </div>
    </div>
  )
}

function PendingBlock({ cards, color, cta, title }: { cards: [string, string][]; color: 'amber' | 'purple'; cta: string; title: string }) {
  const text = color === 'purple' ? 'text-purple-700' : 'text-amber-700'
  const button = color === 'purple' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
  return (
    <div className="bg-white p-4 shadow-sm border border-slate-100 rounded-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className={`text-sm font-bold ${text}`}>{title}</h3>
        <button className={`rounded-lg ${button} px-3 py-1.5 text-xs font-bold opacity-80 outline-none`} disabled type="button">{cta}</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`font-mono text-lg font-bold mt-1 ${text}`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Tile({ label, sub, tone, value, className }: { label: string; sub?: string; tone: string; value: string; className?: string }) {
  const toneMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  }
  const cls = toneMap[tone] || toneMap.slate
  return (
    <div className={`rounded-xl border p-3 text-center ${cls} ${className || ''}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="font-mono text-lg font-bold mt-1">{value}</div>
      {sub ? <div className="text-xs opacity-85 mt-0.5">{sub}</div> : null}
    </div>
  )
}

function MiniLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs border border-slate-100"><span>{label}</span><span className="font-bold text-slate-800">{value}</span></div>
}

function OwnerDueTable({ rows, title, type }: { rows: OwnerDueRow[]; title: string; type: 'ap' | 'ar' }) {
  const [sortKey, setSortKey] = useState<OwnerDueSortKey>('amount')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const columns = type === 'ar' ? ownerDueColumns : ownerDueApColumns
  const columnResize = useResizableColumns(`main.owner-daily.due.${type}.v1`, columns)
  const header = type === 'ar' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => compareDashboardValues(ownerDueValue(left, sortKey), ownerDueValue(right, sortKey), sortDirection))
  }, [rows, sortDirection, sortKey])
  const handleSort = (key: OwnerDueSortKey) => {
    if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'amount' || key === 'daysOverdue' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className={`flex justify-between border-b p-3 font-bold text-sm ${header}`}>
        <span>{title} ({rows.length})</span>
        <div className="flex items-center gap-2">
          <span>{money(rows.reduce((sum, row) => sum + row.amount, 0))}</span>
          {columnResize.hasCustomWidths ? (
            <button className="rounded border border-slate-200 bg-white/70 px-2 py-0.5 text-xs font-normal text-slate-500 hover:bg-white hover:text-slate-800" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block max-h-64 overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {columns.map((column, index) => (
              <col key={column.key} style={index === columns.length - 1 ? { minWidth: column.minWidth ?? 80 } : columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ชื่อ" resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อ')} sortKey="name" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="บิล" resizeProps={columnResize.getResizeHandleProps('docNo', 'บิล')} sortKey="docNo" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="Due" resizeProps={columnResize.getResizeHandleProps('due', 'Due')} sortKey="due" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ค้าง" resizeProps={columnResize.getResizeHandleProps('amount', 'ค้าง')} sortKey="amount" onSort={handleSort} />
              {type === 'ar' ? <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="เกินวัน" resizeProps={columnResize.getResizeHandleProps('daysOverdue', 'เกินวัน')} sortKey="daysOverdue" onSort={handleSort} /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.docNo} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="p-2 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.name}>{row.name}</div></td>
                <td className="p-2 font-mono text-xs text-slate-600 whitespace-nowrap">{row.docNo}</td>
                <td className="p-2 text-xs text-slate-600 whitespace-nowrap">{row.due}</td>
                <td className="p-2 text-right font-bold text-slate-800 whitespace-nowrap tabular-nums pl-4">{money(row.amount)}</td>
                {type === 'ar' ? (
                  <td className={row.daysOverdue ? 'p-2 text-right font-bold text-red-600 whitespace-nowrap tabular-nums pl-4' : 'p-2 text-right text-slate-400 whitespace-nowrap tabular-nums pl-4'}>
                    {row.daysOverdue || '-'}
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-4 text-center text-slate-400" colSpan={columns.length}>
                  {type === 'ar' ? 'ไม่มีลูกหนี้ครบกำหนด ✓' : 'ไม่มี ✓'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view (Dense Card List) */}
      <div className="block lg:hidden max-h-64 overflow-y-auto divide-y divide-slate-100 p-2 bg-slate-50/30">
        {sortedRows.map((row) => (
          <div key={row.docNo} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">{row.name}</span>
              <span className="font-bold text-slate-900">{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-xs">
              <span>บิล: <span className="font-mono">{row.docNo}</span></span>
              <span>Due: {row.due}</span>
            </div>
            {type === 'ar' && row.daysOverdue ? (
              <div className="text-right text-xs font-semibold text-red-600">
                เกินกำหนด: {row.daysOverdue} วัน
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">
            {type === 'ar' ? 'ไม่มีลูกหนี้ครบกำหนด ✓' : 'ไม่มี ✓'}
          </div>
        )}
      </div>
    </div>
  )
}

function OwnerSmallTable({ rows, tableKey, title }: { rows: OwnerSmallRow[]; tableKey: string; title: string }) {
  const [sortKey, setSortKey] = useState<OwnerSmallSortKey>('amount')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const columnResize = useResizableColumns(`main.owner-daily.small.${tableKey}.v1`, ownerSmallColumns)
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => compareDashboardValues(ownerSmallValue(left, sortKey), ownerSmallValue(right, sortKey), sortDirection))
  }, [rows, sortDirection, sortKey])
  const handleSort = (key: OwnerSmallSortKey) => {
    if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'amount' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className="flex justify-between border-b bg-amber-50 text-amber-700 p-3 font-bold border-amber-100 text-sm">
        <span>{title} ({rows.length})</span>
        <div className="flex items-center gap-2">
          <span>{money(rows.reduce((sum, row) => sum + row.amount, 0))}</span>
          {columnResize.hasCustomWidths ? (
            <button className="rounded border border-slate-200 bg-white/70 px-2 py-0.5 text-xs font-normal text-slate-500 hover:bg-white hover:text-slate-800" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {ownerSmallColumns.map((column, index) => (
              <col key={column.key} style={index === ownerSmallColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เอกสาร" resizeProps={columnResize.getResizeHandleProps('ref', 'เอกสาร')} sortKey="ref" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="รายละเอียด" resizeProps={columnResize.getResizeHandleProps('detail', 'รายละเอียด')} sortKey="detail" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอด" resizeProps={columnResize.getResizeHandleProps('amount', 'ยอด')} sortKey="amount" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row, index) => (
              <tr key={`${row.docNo ?? row.contractNo ?? index}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="p-2 font-mono text-slate-600 whitespace-nowrap">{row.docNo ?? row.contractNo}</td>
                <td className="p-2 text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={String(row.name ?? row.installmentNo ?? '-')}>{row.name ?? row.installmentNo ?? '-'}</div></td>
                <td className="p-2 text-right font-bold text-slate-800 whitespace-nowrap tabular-nums pl-4">{money(row.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-4 text-center text-slate-400" colSpan={3}>ไม่มี ✓</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 p-2 bg-slate-50/30">
        {sortedRows.map((row, index) => (
          <div key={`${row.docNo ?? row.contractNo ?? index}`} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-mono text-slate-600">{row.docNo ?? row.contractNo}</span>
              <span className="font-bold text-slate-900">{money(row.amount)}</span>
            </div>
            <div className="text-slate-500 text-xs">
              รายละเอียด: {row.name ?? row.installmentNo ?? '-'}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มี ✓</div>
        )}
      </div>
    </div>
  )
}

function DailyBigCard({ count, icon, label, sub, tone, value, weight }: { count: number; icon: string; label: string; sub: string; tone: string; value: string; weight: string }) {
  const toneMap: Record<string, { bg: string; text: string; iconBg: string; border: string }> = {
    'from-blue-600 to-indigo-700': { bg: 'bg-white', text: 'text-blue-700', iconBg: 'bg-blue-50 text-blue-600', border: 'border-slate-100' },
    'from-emerald-600 to-teal-700': { bg: 'bg-white', text: 'text-emerald-700', iconBg: 'bg-emerald-50 text-emerald-600', border: 'border-slate-100' },
  }
  const style = toneMap[tone] || { bg: 'bg-white', text: 'text-slate-700', iconBg: 'bg-slate-50 text-slate-600', border: 'border-slate-100' }

  return (
    <div className={`relative overflow-hidden rounded-xl bg-white border ${style.border} p-5 shadow-sm flex items-start gap-4`}>
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${style.iconBg} text-3xl`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{count} บิล</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-400 font-semibold">น้ำหนักรวม</div>
            <div className="font-mono text-xl font-bold text-slate-900 leading-none mt-1">{weight} <span className="text-xs font-normal text-slate-500">กก.</span></div>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">ยอดเงินรวม</div>
            <div className="font-mono text-xl font-bold text-slate-900 leading-none mt-1">{value}</div>
            <div className="text-xs text-slate-500 mt-1">{sub}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupBreakdown({ expandedGroup, groups, setExpandedGroup }: { expandedGroup: string; groups: MainPayload['dailyReport']['groupBreakdown']; setExpandedGroup: (value: string) => void }) {
  const max = Math.max(1, ...groups.map((row) => Math.max(row.buyAmt, row.sellAmt)))
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
      <h3 className="mb-3 font-bold text-slate-800 text-sm">📊 หมวดสินค้า — ซื้อ vs ขาย <span className="text-xs font-normal text-slate-500">(กดที่หมวด → ดูรายละเอียดสินค้า)</span></h3>
      {groups.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-xs">ไม่มีรายการในวันนี้</div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, idx) => (
            <div key={`${group.group}_${idx}`} className="overflow-hidden rounded-xl border border-slate-100">
              <button className="w-full p-3 text-left hover:bg-slate-50 outline-none" type="button" onClick={() => setExpandedGroup(expandedGroup === group.group ? '' : group.group)}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-sm">{expandedGroup === group.group ? '▼' : '▶'} {group.group} <span className="text-xs font-normal text-slate-400">({group.products.length} สินค้า)</span></span>
                  <span className="text-xs text-slate-500">รวม <b>{money(group.buyAmt + group.sellAmt)}</b> บาท</span>
                </div>
                <div className="space-y-3 text-xs mt-2">
                  {/* Purchase Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <div className="flex justify-between items-center sm:w-12 sm:shrink-0">
                      <span className="text-blue-700 font-semibold">📥 ซื้อ</span>
                      <span className="block sm:hidden font-mono font-bold text-slate-700">
                        {money(group.buyQty)} กก. · {money(group.buyAmt)} ฿
                      </span>
                    </div>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden relative">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, group.buyAmt / max * 100)}%` }} />
                    </div>
                    <div className="hidden sm:block sm:w-56 sm:shrink-0 text-right font-mono font-bold text-slate-700">
                      {money(group.buyQty)} กก. · {money(group.buyAmt)} ฿
                    </div>
                  </div>

                  {/* Sales Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <div className="flex justify-between items-center sm:w-12 sm:shrink-0">
                      <span className="text-emerald-700 font-semibold">📤 ขาย</span>
                      <span className="block sm:hidden font-mono font-bold text-slate-700">
                        {money(group.sellQty)} กก. · {money(group.sellAmt)} ฿
                      </span>
                    </div>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden relative">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, group.sellAmt / max * 100)}%` }} />
                    </div>
                    <div className="hidden sm:block sm:w-56 sm:shrink-0 text-right font-mono font-bold text-slate-700">
                      {money(group.sellQty)} กก. · {money(group.sellAmt)} ฿
                    </div>
                  </div>
                </div>
              </button>
              {expandedGroup === group.group ? (
                <GroupProductTable rows={group.products} tableKey={group.group} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupProductTable({ rows, tableKey }: { rows: DailyGroupProductRow[]; tableKey: string }) {
  const [sortKey, setSortKey] = useState<DailyGroupProductSortKey>('buyAmt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const columnResize = useResizableColumns(`main.daily-report.group-products.${tableKey}.v1`, dailyGroupProductColumns)
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => compareDashboardValues(dailyGroupProductValue(left, sortKey), dailyGroupProductValue(right, sortKey), sortDirection))
  }, [rows, sortDirection, sortKey])
  const handleSort = (key: DailyGroupProductSortKey) => {
    if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'productCode' || key === 'productName' ? 'asc' : 'desc')
    }
  }

  return (
    <>
      <div className="hidden border-t border-slate-100 p-3 lg:block">
        <div className="mb-2 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-normal text-slate-500 hover:bg-slate-50 hover:text-slate-800" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {dailyGroupProductColumns.map((column, index) => (
                <col key={column.key} style={index === dailyGroupProductColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : columnResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="Code" resizeProps={columnResize.getResizeHandleProps('productCode', 'Code')} sortKey="productCode" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้า')} sortKey="productName" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ซื้อ กก." resizeProps={columnResize.getResizeHandleProps('buyQty', 'ซื้อ กก.')} sortKey="buyQty" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ซื้อ" resizeProps={columnResize.getResizeHandleProps('buyAmt', 'ซื้อ')} sortKey="buyAmt" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ขาย กก." resizeProps={columnResize.getResizeHandleProps('sellQty', 'ขาย กก.')} sortKey="sellQty" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ขาย" resizeProps={columnResize.getResizeHandleProps('sellAmt', 'ขาย')} sortKey="sellAmt" onSort={handleSort} />
                <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="Spread/กก." resizeProps={columnResize.getResizeHandleProps('spread', 'Spread/กก.')} sortKey="spread" onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map((row, idx) => (
                <tr key={`${row.productId}_${idx}`} className="border-t border-slate-100">
                  <td className="p-2 font-mono text-slate-600 whitespace-nowrap">{row.productCode}</td>
                  <td className="p-2 text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.productName}>{row.productName}</div></td>
                  <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{money(row.buyQty)}</td>
                  <td className="p-2 text-right text-blue-700 font-bold whitespace-nowrap tabular-nums pl-4">{money(row.buyAmt)}</td>
                  <td className="p-2 text-right whitespace-nowrap tabular-nums pl-4">{money(row.sellQty)}</td>
                  <td className="p-2 text-right text-emerald-700 font-bold whitespace-nowrap tabular-nums pl-4">{money(row.sellAmt)}</td>
                  <td className="p-2 text-right font-bold text-slate-700 whitespace-nowrap tabular-nums pl-4">{dailyGroupProductValue(row, 'spread') ? `${money(dailyGroupProductValue(row, 'spread') as number)} ฿/กก.` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="block border-t border-slate-100 divide-y divide-slate-100 bg-slate-50/30 p-2 lg:hidden">
        {sortedRows.map((row, idx) => (
          <div key={`${row.productId}_${idx}`} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800">{row.productName}</span>
              <span className="font-mono text-xs text-slate-400">{row.productCode}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
              <div className="text-blue-700 bg-blue-50/50 p-1.5 rounded-lg">
                <div className="font-semibold text-xs">📥 ซื้อ</div>
                <div className="mt-0.5">{money(row.buyQty)} กก.</div>
                <div className="font-bold mt-0.5">{money(row.buyAmt)} ฿</div>
              </div>
              <div className="text-emerald-700 bg-emerald-50/50 p-1.5 rounded-lg">
                <div className="font-semibold text-xs">📤 ขาย</div>
                <div className="mt-0.5">{money(row.sellQty)} กก.</div>
                <div className="font-bold mt-0.5">{money(row.sellAmt)} ฿</div>
              </div>
            </div>
            {dailyGroupProductValue(row, 'spread') ? (
              <div className="text-right text-xs font-semibold text-purple-700 mt-1">
                Spread: {money(dailyGroupProductValue(row, 'spread') as number)} ฿/กก.
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  )
}

function DailyBillTable({ rows, title, tone, total }: { rows: DailyBillRow[]; title: string; tone: 'blue' | 'emerald'; total: number }) {
  const [sortKey, setSortKey] = useState<DailyBillSortKey>('amount')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const columnResize = useResizableColumns(`main.daily-report.bills.${tone}.v1`, dailyBillColumns)
  const header = tone === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  const hover = tone === 'blue' ? 'hover:bg-blue-50/30' : 'hover:bg-emerald-50/30'
  const amountColor = tone === 'blue' ? 'text-blue-700' : 'text-emerald-700'
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => compareDashboardValues(left[sortKey], right[sortKey], sortDirection))
  }, [rows, sortDirection, sortKey])
  const handleSort = (key: DailyBillSortKey) => {
    if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'docNo' || key === 'name' ? 'asc' : 'desc')
    }
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className={`flex justify-between border-b p-3 font-bold text-sm ${header}`}>
        <h3 className="font-bold">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{money(total)}</span>
          {columnResize.hasCustomWidths ? (
            <button className="rounded border border-slate-200 bg-white/70 px-2 py-0.5 text-xs font-normal text-slate-500 hover:bg-white hover:text-slate-800" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block max-h-[300px] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {dailyBillColumns.map((column, index) => (
              <col key={column.key} style={index === dailyBillColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} sortKey="docNo" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label={tone === 'blue' ? 'Supplier' : 'Customer'} resizeProps={columnResize.getResizeHandleProps('name', tone === 'blue' ? 'Supplier' : 'Customer')} sortKey="name" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="กก." resizeProps={columnResize.getResizeHandleProps('qty', 'กก.')} sortKey="qty" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอด" resizeProps={columnResize.getResizeHandleProps('amount', 'ยอด')} sortKey="amount" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.docNo} className={`border-t border-slate-100 ${hover}`}>
                <td className="p-2 font-mono text-xs text-slate-600 whitespace-nowrap">{row.docNo}</td>
                <td className="p-2 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.name}>{row.name}</div></td>
                <td className="p-2 text-right text-slate-600 whitespace-nowrap tabular-nums pl-4">{money(row.qty)}</td>
                <td className={`p-2 text-right font-bold whitespace-nowrap tabular-nums pl-4 ${amountColor}`}>{money(row.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-400" colSpan={4}>
                  {tone === 'blue' ? 'ไม่มีบิลซื้อ' : 'ไม่มีบิลขาย'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden max-h-[300px] overflow-y-auto divide-y divide-slate-100 p-2 bg-slate-50/30">
        {sortedRows.map((row) => (
          <div key={row.docNo} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">{row.name}</span>
              <span className={`font-bold ${amountColor}`}>{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-xs">
              <span>บิล: <span className="font-mono">{row.docNo}</span></span>
              <span>น้ำหนัก: {money(row.qty)} กก.</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">
            {tone === 'blue' ? 'ไม่มีบิลซื้อ' : 'ไม่มีบิลขาย'}
          </div>
        )}
      </div>
    </div>
  )
}

function ExpenseSummary({ rows, total }: { rows: { amount: number; count: number; name: string }[]; total: number }) {
  const max = Math.max(1, ...rows.map((row) => row.amount))
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
      <div className="mb-3 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-sm">💸 ค่าใช้จ่ายประจำวัน ({rows.reduce((sum, row) => sum + row.count, 0)} รายการ)</h3>
        <span className="text-base font-bold text-red-600">รวม {money(total)} บาท</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">ไม่มีค่าใช้จ่ายวันนี้</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={`${row.name}_${idx}`}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-700">📂 {row.name} <span className="text-xs text-slate-400 font-normal">({row.count} รายการ)</span></span>
                <span className="font-mono font-bold text-red-600">{money(row.amount)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500" style={{ width: `${Math.min(100, row.amount / max * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CashMovement({ movement }: { movement?: MainPayload['dailyReport']['cashMovement'] }) {
  const [sortKey, setSortKey] = useState<CashAccountSortKey>('net')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const columnResize = useResizableColumns('main.daily-report.cash-accounts.v1', cashAccountColumns)
  const sortedAccountRows = useMemo(() => {
    const accountRows = movement?.accounts ?? []
    return [...accountRows].sort((left, right) => compareDashboardValues(cashAccountValue(left, sortKey), cashAccountValue(right, sortKey), sortDirection))
  }, [movement?.accounts, sortDirection, sortKey])
  const handleSort = (key: CashAccountSortKey) => {
    if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'name' || key === 'type' ? 'asc' : 'desc')
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-800 text-sm">💰 เงินหมุนประจำวัน</h3>
        {columnResize.hasCustomWidths ? (
          <button className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-normal text-slate-500 hover:bg-slate-50 hover:text-slate-800" type="button" onClick={columnResize.resetColumnWidths}>
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Tile tone="emerald" label="📥 เงินเข้ารวม" value={money(movement?.cashIn)} />
        <Tile tone="red" label="📤 เงินออกรวม" value={money(movement?.cashOut)} />
        <Tile tone={(movement?.net ?? 0) >= 0 ? 'blue' : 'red'} label="📊 Net Cash" value={money(movement?.net)} />
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        {(movement?.byType ?? []).map((row) => (
          <div key={row.label} className="rounded-xl bg-slate-50/50 p-3 border border-slate-100">
            <div className="text-xs text-slate-500 font-semibold">{row.label}</div>
            <div className="mt-1 flex justify-between items-center font-mono">
              <span className="text-xs font-bold text-emerald-600">+{money(row.cashIn)}</span>
              <span className="text-xs font-bold text-red-600">-{money(row.cashOut)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full divide-y divide-slate-200 text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {cashAccountColumns.map((column, index) => (
              <col key={column.key} style={index === cashAccountColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="บัญชี" resizeProps={columnResize.getResizeHandleProps('name', 'บัญชี')} sortKey="name" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="เข้า" resizeProps={columnResize.getResizeHandleProps('cashIn', 'เข้า')} sortKey="cashIn" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ออก" resizeProps={columnResize.getResizeHandleProps('cashOut', 'ออก')} sortKey="cashOut" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="Net" resizeProps={columnResize.getResizeHandleProps('net', 'Net')} sortKey="net" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedAccountRows.map((row) => (
              <tr key={row.name} className="border-t border-slate-100 hover:bg-slate-50/30">
                <td className="p-2 text-slate-700">
                  <b>{row.name}</b> <span className="text-xs text-slate-400">({row.type})</span>
                </td>
                <td className="p-2 text-right font-mono text-emerald-600">{row.cashIn > 0 ? money(row.cashIn) : '-'}</td>
                <td className="p-2 text-right font-mono text-red-600">{row.cashOut > 0 ? money(row.cashOut) : '-'}</td>
                <td className={(row.cashIn - row.cashOut) >= 0 ? 'p-2 text-right font-mono font-bold text-blue-600' : 'p-2 text-right font-mono font-bold text-rose-600'}>
                  {money(row.cashIn - row.cashOut)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 sm:hidden">
        {sortedAccountRows.map((row) => {
          const net = row.cashIn - row.cashOut
          return (
            <div key={row.name} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-xs">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-800">{row.name}</div>
                  <div className="text-slate-400">{row.type}</div>
                </div>
                <div className={net >= 0 ? 'font-bold text-blue-600' : 'font-bold text-rose-600'}>{money(net)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <span>เข้า: <b className="text-emerald-600">{row.cashIn > 0 ? money(row.cashIn) : '-'}</b></span>
                <span>ออก: <b className="text-red-600">{row.cashOut > 0 ? money(row.cashOut) : '-'}</b></span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type RankRow = {
  amount: number
  bills: number
  id: string
  name: string
  qty: number
  gp?: number
  gpPct?: number
}

const topSimpleColumns: ResizableColumnDefinition<string>[] = [
  { key: 'group', defaultWidth: 200, minWidth: 100 },
  { key: 'qty', defaultWidth: 120, minWidth: 80 },
  { key: 'amount', defaultWidth: 150, minWidth: 100 },
]

function TopSimpleTable({ rows, title }: { rows: { amount: number; group: string; qty: number }[]; title: string }) {
  const [sortKey, setSortKey] = useState<string>('amount')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const columnResize = useResizableColumns(`reports.analytics.top-simple-table.${title}`, topSimpleColumns)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let valA = a[sortKey as keyof typeof a]
      let valB = b[sortKey as keyof typeof b]

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      }

      const numA = Number(valA) || 0
      const numB = Number(valB) || 0
      return sortDirection === 'asc' ? numA - numB : numB - numA
    })
    return sorted
  }, [rows, sortKey, sortDirection])

  return (
    <div className="min-w-0 rounded-xl bg-white p-4 shadow-sm border border-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-slate-700 text-sm">{title}</h3>
        {columnResize.hasCustomWidths ? (
          <button
            className="text-xs font-normal text-slate-500 hover:text-slate-800 bg-white/60 hover:bg-white rounded px-2 py-0.5 shadow-sm border border-slate-200 transition-all outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่ากว้าง
          </button>
        ) : null}
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {topSimpleColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
            <tr>
              <ResizableTableHead label="หมวด" sortKey="group" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('group', 'หมวด')} />
              <ResizableTableHead align="right" label="กก." sortKey="qty" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qty', 'น้ำหนัก')} />
              <ResizableTableHead align="right" label="มูลค่า" sortKey="amount" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'มูลค่า')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.group} className="border-t border-slate-100 hover:bg-slate-50/30">
                <td className="p-1.5 font-medium text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.group}>{row.group}</div></td>
                <td className="p-1.5 text-right text-slate-600 whitespace-nowrap tabular-nums pl-4">{money(row.qty)}</td>
                <td className="p-1.5 text-right font-bold text-indigo-600 whitespace-nowrap tabular-nums pl-4">{money(row.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-4 text-center text-slate-400" colSpan={3}>ไม่มีข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const rankColumnsBlue: ResizableColumnDefinition<string>[] = [
  { key: 'rank', defaultWidth: 50, minWidth: 40 },
  { key: 'name', defaultWidth: 220, minWidth: 120 },
  { key: 'bills', defaultWidth: 80, minWidth: 60 },
  { key: 'qty', defaultWidth: 120, minWidth: 80 },
  { key: 'amount', defaultWidth: 140, minWidth: 100 },
]

const rankColumnsEmerald: ResizableColumnDefinition<string>[] = [
  { key: 'rank', defaultWidth: 50, minWidth: 40 },
  { key: 'name', defaultWidth: 200, minWidth: 120 },
  { key: 'bills', defaultWidth: 70, minWidth: 50 },
  { key: 'qty', defaultWidth: 100, minWidth: 70 },
  { key: 'amount', defaultWidth: 120, minWidth: 90 },
  { key: 'gp', defaultWidth: 120, minWidth: 90 },
  { key: 'gpPct', defaultWidth: 80, minWidth: 60 },
]

function RankTable({ color, rows, title }: { color: 'blue' | 'emerald'; rows: RankRow[]; title: string }) {
  const [sortKey, setSortKey] = useState<string>('amount')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showAllRows, setShowAllRows] = useState(false)

  const columns = color === 'blue' ? rankColumnsBlue : rankColumnsEmerald
  const columnResize = useResizableColumns(`reports.analytics.rank-table.${title}`, columns)

  const header = 'bg-white text-slate-800 border-slate-100'
  const hover = color === 'blue' ? 'hover:bg-blue-50/30' : 'hover:bg-emerald-50/30'
  const text = color === 'blue' ? 'text-blue-700' : 'text-emerald-700'

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let valA = a[sortKey as keyof RankRow]
      let valB = b[sortKey as keyof RankRow]
      if (valA === undefined) return 1
      if (valB === undefined) return -1

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      }

      const numA = Number(valA) || 0
      const numB = Number(valB) || 0
      return sortDirection === 'asc' ? numA - numB : numB - numA
    })
    return sorted
  }, [rows, sortKey, sortDirection])
  const visibleRows = (showAllRows ? sortedRows.slice(0, 10) : sortedRows.slice(0, 5))

  return (
    <div className="min-w-0 overflow-hidden rounded-md bg-white shadow-sm border border-slate-200">
      <div className={`border-b p-3 font-bold text-sm ${header} flex items-center justify-between`}>
        <h3 className="font-bold">{title}</h3>
        <div className="flex items-center gap-2">
          {sortedRows.length > 5 ? (
            <button
              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
              type="button"
              onClick={() => setShowAllRows((current) => !current)}
            >
              {showAllRows ? 'ย่อเหลือ 5' : `ดูครบ ${Math.min(10, sortedRows.length)}`}
            </button>
          ) : null}
          {columnResize.hasCustomWidths ? (
            <button
              className="text-xs font-normal text-slate-500 hover:text-slate-800 bg-white/60 hover:bg-white rounded px-2 py-0.5 shadow-sm border border-slate-200 transition-all outline-none"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่ากว้าง
            </button>
          ) : null}
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden min-w-0 overflow-x-auto sm:block">
        <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <ResizableTableHead label="#" resizeProps={columnResize.getResizeHandleProps('rank', '#')} />
              <ResizableTableHead label="รายชื่อ" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('name', 'รายชื่อ')} />
              <ResizableTableHead align="right" label="บิล" sortKey="bills" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('bills', 'บิล')} />
              <ResizableTableHead align="right" label="น้ำหนัก (กก.)" sortKey="qty" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qty', 'น้ำหนัก')} />
              <ResizableTableHead align="right" label="ยอดรวม" sortKey="amount" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดรวม')} />
              {color === 'emerald' && (
                <>
                  <ResizableTableHead align="right" label="GP" sortKey="gp" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('gp', 'GP')} />
                  <ResizableTableHead align="right" label="%" sortKey="gpPct" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={`${row.id || 'rank'}-${index}`} className={`border-t border-slate-100 ${hover}`}>
                <td className={`p-2 font-bold ${text} text-xs whitespace-nowrap`}>{index + 1}</td>
                <td className="p-2 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.name}>{row.name}</div></td>
                <td className="p-2 text-right text-xs text-slate-600 whitespace-nowrap tabular-nums pl-4">{row.bills}</td>
                <td className="p-2 text-right text-xs text-slate-600 whitespace-nowrap tabular-nums pl-4">{money(row.qty)}</td>
                <td className={`p-2 text-right font-bold ${text} text-xs whitespace-nowrap tabular-nums pl-4`}>{money(row.amount)}</td>
                {color === 'emerald' && (
                  <>
                    <td className="p-2 text-right text-xs text-emerald-700 font-semibold whitespace-nowrap tabular-nums pl-4">{money(row.gp)}</td>
                    <td className="p-2 text-right text-xs text-emerald-600 whitespace-nowrap tabular-nums pl-4">{row.gpPct?.toFixed(2) ?? '0.00'}%</td>
                  </>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-400 text-xs" colSpan={color === 'emerald' ? 7 : 5}>ไม่มีข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block sm:hidden divide-y divide-slate-100 p-2 bg-slate-50/30">
        {visibleRows.map((row, index) => (
          <div key={`${row.id || 'rank'}-${index}`} className="p-2.5 bg-white rounded-lg border border-slate-200 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">
                <span className={`font-bold mr-1.5 ${text}`}>#{index + 1}</span>
                {row.name}
              </span>
              <span className={`font-bold ${text}`}>{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-xs">
              <span>จำนวนบิล: {row.bills} บิล</span>
              <span>น้ำหนัก: {money(row.qty)} กก.</span>
            </div>
            {color === 'emerald' && row.gp !== undefined && (
              <div className="flex justify-between items-center text-slate-500 text-xs mt-0.5 pt-0.5 border-t border-slate-100">
                <span>กำไร (GP): <span className="font-semibold text-emerald-700">{money(row.gp)}</span></span>
                <span>อัตรากำไร: <span className="font-semibold text-emerald-600">{row.gpPct?.toFixed(2)}%</span></span>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>
        )}
      </div>
    </div>
  )
}

const productRankColumns: ResizableColumnDefinition<string>[] = [
  { key: 'rank', defaultWidth: 50, minWidth: 40 },
  { key: 'code', defaultWidth: 100, minWidth: 70 },
  { key: 'name', defaultWidth: 200, minWidth: 120 },
  { key: 'group', defaultWidth: 100, minWidth: 70 },
  { key: 'qty', defaultWidth: 120, minWidth: 80 },
  { key: 'amount', defaultWidth: 140, minWidth: 100 },
]

function ProductRank({ rows, title, tone }: { rows: { amount: number; code: string; group: string; id: string; name: string; qty: number }[]; title: string; tone: 'indigo' | 'teal' }) {
  const [sortKey, setSortKey] = useState<string>('amount')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const columnResize = useResizableColumns(`reports.analytics.product-rank.${title}`, productRankColumns)

  const header = tone === 'indigo' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-teal-50 text-teal-700 border-teal-100'
  const text = tone === 'indigo' ? 'text-indigo-700' : 'text-teal-700'
  const hover = tone === 'indigo' ? 'hover:bg-indigo-50/30' : 'hover:bg-teal-50/30'

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let valA = a[sortKey as keyof typeof a]
      let valB = b[sortKey as keyof typeof b]

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      }

      const numA = Number(valA) || 0
      const numB = Number(valB) || 0
      return sortDirection === 'asc' ? numA - numB : numB - numA
    })
    return sorted
  }, [rows, sortKey, sortDirection])

  return (
    <div className="min-w-0 overflow-hidden rounded-xl bg-white shadow-sm border border-slate-200">
      <div className={`border-b p-3 font-bold text-sm ${header} flex items-center justify-between`}>
        <h3 className="font-bold">{title}</h3>
        {columnResize.hasCustomWidths ? (
          <button
            className="text-xs font-normal text-slate-500 hover:text-slate-800 bg-white/60 hover:bg-white rounded px-2 py-0.5 shadow-sm border border-slate-200 transition-all outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่ากว้าง
          </button>
        ) : null}
      </div>

      {/* Desktop view */}
      <div className="hidden min-w-0 overflow-x-auto sm:block">
        <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {productRankColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <ResizableTableHead label="#" resizeProps={columnResize.getResizeHandleProps('rank', '#')} />
              <ResizableTableHead label="Code" sortKey="code" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('code', 'Code')} />
              <ResizableTableHead label="สินค้า" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('name', 'สินค้า')} />
              <ResizableTableHead label="หมวด" sortKey="group" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('group', 'หมวด')} />
              <ResizableTableHead align="right" label="น้ำหนัก (กก.)" sortKey="qty" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qty', 'น้ำหนัก')} />
              <ResizableTableHead align="right" label="มูลค่า" sortKey="amount" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'มูลค่า')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => (
              <tr key={`${row.id || 'prod'}-${index}`} className={`border-t border-slate-100 ${hover}`}>
                <td className={`p-2 font-bold ${text} text-xs whitespace-nowrap`}>{index + 1}</td>
                <td className="p-2 font-mono text-xs text-slate-600 whitespace-nowrap">{row.code}</td>
                <td className="p-2 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.name}>{row.name}</div></td>
                <td className="p-2 text-xs text-slate-500 min-w-0 overflow-hidden"><div className="truncate" title={row.group}>{row.group}</div></td>
                <td className="p-2 text-right text-xs text-slate-600 whitespace-nowrap tabular-nums pl-4">{money(row.qty)}</td>
                <td className={`p-2 text-right font-bold ${text} text-xs whitespace-nowrap tabular-nums pl-4`}>{money(row.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-400 text-xs" colSpan={6}>ไม่มีข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block sm:hidden divide-y divide-slate-100 p-2 bg-slate-50/30">
        {sortedRows.map((row, index) => (
          <div key={`${row.id || 'prod'}-${index}`} className="p-2.5 bg-white rounded-lg border border-slate-200 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">
                <span className={`font-bold mr-1.5 ${text}`}>#{index + 1}</span>
                {row.name}
              </span>
              <span className={`font-bold ${text}`}>{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-xs">
              <span>Code: <span className="font-mono">{row.code}</span> ({row.group})</span>
              <span>น้ำหนัก: {money(row.qty)} กก.</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>
        )}
      </div>
    </div>
  )
}

const salespersonColumns: ResizableColumnDefinition<string>[] = [
  { key: 'name', defaultWidth: 220, minWidth: 120 },
  { key: 'suppliers', defaultWidth: 120, minWidth: 90 },
  { key: 'qty', defaultWidth: 140, minWidth: 90 },
  { key: 'amount', defaultWidth: 160, minWidth: 100 },
  { key: 'bills', defaultWidth: 100, minWidth: 70 },
]

function SalespersonTable({ rows }: { rows: { amount: number; bills: number; id: string; name: string; qty: number; suppliers: number }[] }) {
  const [sortKey, setSortKey] = useState<string>('amount')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const columnResize = useResizableColumns('reports.analytics.salesperson-table', salespersonColumns)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let valA = a[sortKey as keyof typeof a]
      let valB = b[sortKey as keyof typeof b]

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      }

      const numA = Number(valA) || 0
      const numB = Number(valB) || 0
      return sortDirection === 'asc' ? numA - numB : numB - numA
    })
    return sorted
  }, [rows, sortKey, sortDirection])

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-slate-700 text-sm">🆕 ยอดซื้อแต่ละ Sale — จำนวน supplier/กก./ยอดซื้อ</h3>
        {columnResize.hasCustomWidths ? (
          <button
            className="text-xs font-normal text-slate-500 hover:text-slate-800 bg-white/60 hover:bg-white rounded px-2 py-0.5 shadow-sm border border-slate-200 transition-all outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่ากว้าง
          </button>
        ) : null}
      </div>

      {/* Desktop view */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {salespersonColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-100">
            <tr>
              <ResizableTableHead label="Sale" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('name', 'Sale')} />
              <ResizableTableHead align="right" label="Suppliers" sortKey="suppliers" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('suppliers', 'Suppliers')} />
              <ResizableTableHead align="right" label="น้ำหนัก (กก.)" sortKey="qty" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qty', 'น้ำหนัก')} />
              <ResizableTableHead align="right" label="ยอดซื้อ" sortKey="amount" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดซื้อ')} />
              <ResizableTableHead align="right" label="บิล" sortKey="bills" activeSortKey={sortKey} direction={sortDirection} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('bills', 'บิล')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => (
              <tr key={`${row.id || 'sales'}-${index}`} className="border-t border-slate-100 hover:bg-slate-50/30">
                <td className="p-2 text-slate-700 font-medium min-w-0 overflow-hidden"><div className="truncate" title={row.name}>{row.name}</div></td>
                <td className="p-2 text-right text-slate-600 whitespace-nowrap tabular-nums pl-4">{row.suppliers} supplier</td>
                <td className="p-2 text-right text-slate-600 whitespace-nowrap tabular-nums pl-4">{money(row.qty)} กก.</td>
                <td className="p-2 text-right font-bold text-blue-600 whitespace-nowrap tabular-nums pl-4">{money(row.amount)}</td>
                <td className="p-2 text-right text-slate-600 whitespace-nowrap tabular-nums pl-4">{row.bills} บิล</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-4 text-center text-slate-400" colSpan={5}>ไม่มีข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block sm:hidden divide-y divide-slate-100 p-2 bg-slate-50/30">
        {sortedRows.map((row, index) => (
          <div key={`${row.id || 'sales'}-${index}`} className="p-2.5 bg-white rounded-lg border border-slate-200 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800">{row.name}</span>
              <span className="font-bold text-blue-600">{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-xs">
              <span>ผู้ขาย: {row.suppliers} ราย</span>
              <span>น้ำหนัก: {money(row.qty)} กก. ({row.bills} บิล)</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>
        )}
      </div>
    </div>
  )
}

function AnalyticsKpiCard({
  icon,
  label,
  value,
  subtext,
  unit,
  tone = 'slate',
}: {
  icon: string
  label: string
  value: string
  subtext?: string
  unit?: string
  tone?: string
}) {
  const toneMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-50 text-blue-600', text: 'text-blue-600' },
    emerald: { bg: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600' },
    purple: { bg: 'bg-purple-50 text-purple-600', text: 'text-purple-600' },
    cyan: { bg: 'bg-cyan-50 text-cyan-600', text: 'text-cyan-600' },
    orange: { bg: 'bg-orange-50 text-orange-600', text: 'text-orange-600' },
    slate: { bg: 'bg-slate-50 text-slate-600', text: 'text-slate-600' },
  }
  const cls = toneMap[tone] || toneMap.slate

  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${cls.bg} ${cls.text} text-2xl`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="font-mono text-xl font-bold text-slate-900 truncate">{value}</span>
          {unit && <span className="text-xs text-slate-400 font-semibold">{unit}</span>}
        </div>
        {subtext && <div className="text-xs text-slate-400 mt-0.5">{subtext}</div>}
      </div>
    </div>
  )
}

function money(value?: number) {
  return formatMoney(value ?? 0)
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

function Metric({ label, tone = 'slate', value }: { label: string; tone?: string; value: string }) {
  const toneMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-50/50 text-blue-900 border-blue-100', text: 'text-blue-600' },
    emerald: { bg: 'bg-emerald-50/50 text-emerald-900 border-emerald-100', text: 'text-emerald-600' },
    red: { bg: 'bg-red-50/50 text-red-900 border-red-100', text: 'text-red-600' },
    amber: { bg: 'bg-amber-50/50 text-amber-900 border-amber-100', text: 'text-amber-600' },
    orange: { bg: 'bg-orange-50/50 text-orange-900 border-orange-100', text: 'text-orange-600' },
    purple: { bg: 'bg-purple-50/50 text-purple-900 border-purple-100', text: 'text-purple-600' },
    cyan: { bg: 'bg-cyan-50/50 text-cyan-900 border-cyan-100', text: 'text-cyan-600' },
  }
  const cls = toneMap[tone] || { bg: 'bg-slate-50/50 text-slate-900 border-slate-100', text: 'text-slate-500' }
  const icon = label.slice(0, 2)
  const isEmoji = /[\uD800-\uDFFF\u2600-\u27BF]/.test(icon)
  const cleanLabel = isEmoji ? label.slice(2).trim() : label

  return (
    <div className={`rounded-xl border p-4 shadow-sm bg-white border-slate-100 flex items-center gap-3`}>
      {isEmoji && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cls.bg} ${cls.text} text-xl`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500">{cleanLabel}</div>
        <div className="mt-0.5 font-mono text-lg font-bold text-slate-900 truncate">{value}</div>
      </div>
    </div>
  )
}

function BigCard({ label, sub, tone, value }: { label: string; sub: string; tone: string; value: string }) {
  return (
    <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{sub}</div>
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

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="space-y-3 mt-4">
      <h2 className="font-bold text-slate-800 text-sm">{title}</h2>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  )
}

function BarRows({ rows }: { rows: { label: string; value: number }[] }) {
  const visibleRows = rows.filter((row) => Number(row.value) !== 0)
  if (visibleRows.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-medium text-slate-400">ไม่มีข้อมูลในช่วงนี้</div>
  }
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return (
    <div className="space-y-2">
      {visibleRows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>{row.label}</span>
            <b className="text-slate-800">{money(row.value)}</b>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.abs(row.value) / max * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
