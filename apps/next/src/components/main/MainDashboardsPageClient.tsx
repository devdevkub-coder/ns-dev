'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'

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

type Mode = 'daily-report' | 'dashboard' | 'owner-daily'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function MainDashboardsPageClient({ mode }: { mode: Mode }) {
  const [date, setDate] = useState(today())
  const [rangeFrom, setRangeFrom] = useState(() => mode === 'dashboard' ? `${today().slice(0, 4)}-01-01` : today())
  const [rangeMode, setRangeMode] = useState(mode === 'dashboard' ? 'year' : 'today')
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
    if (mode === 'daily-report' || mode === 'dashboard') {
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
      {mode === 'daily-report' ? <DailyReportView data={data} date={date} rangeFrom={rangeFrom} rangeMode={rangeMode} rangeTo={rangeTo} setDate={setDate} setRangeFrom={setRangeFrom} setRangeMode={setRangeMode} setRangeTo={setRangeTo} /> : null}
      <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Main dashboard read baseline</b><span className="ml-2">{data?.sourceState.limitations[0] ?? 'ไม่มี write action ใน baseline นี้'}</span>
      </div>
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
  const alerts = [
    { active: (k.ar ?? 0) > 0, text: `ลูกหนี้คงค้าง ${money(k.ar)}`, tone: 'purple' },
    { active: (k.ap ?? 0) > 0, text: `เจ้าหนี้คงค้าง ${money(k.ap)}`, tone: 'orange' },
    { active: (section?.cash.odUsed ?? 0) > 0, text: `OD ใช้ไป ${money(section?.cash.odUsed)}`, tone: 'amber' },
    { active: (k.cashBalance ?? 0) < (k.ap ?? 0), text: 'เงินสดต่ำกว่าเจ้าหนี้รวม', tone: 'red' },
  ].filter((alert) => alert.active)
  const purchaseWeight = section?.purchase.qty ?? 0
  const salesWeight = section?.sales.qty ?? 0
  const purchaseAmount = section?.purchase.amount ?? 0
  const salesAmount = section?.sales.amount ?? 0
  const gp = section?.sales.gp ?? 0
  const stockQty = section?.stock.qty ?? 0
  const stockValue = section?.stock.value ?? 0
  const gpPct = salesAmount > 0 ? (gp / salesAmount) * 100 : 0
  const filteredCount = `${money(section?.purchase.count)} ซื้อ · ${money(section?.sales.count)} ขาย`
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
  return (
    <>
      <div className="rounded-md bg-gradient-to-r from-slate-800 to-slate-900 p-4 text-white shadow-xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold opacity-80">📅 ช่วงเวลา:</span>
          {[
            ['year', '📊 ปีนี้'],
            ['quarter', 'ไตรมาส'],
            ['month', 'เดือนนี้'],
            ['week', '7 วัน'],
            ['today', 'วันนี้'],
          ].map(([key, label]) => (
            <button className={`rounded-md px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-400 ${rangeMode === key ? 'bg-amber-400 text-slate-900' : 'bg-white/10 hover:bg-white/20'}`} key={key} onClick={() => applyPeriod(key)} type="button">{label}</button>
          ))}
          <span className="mx-2 opacity-30">|</span>
          <DatePickerInput className="w-[130px] border-white/20 bg-white/10 text-white outline-none focus:ring-2 focus:ring-amber-400" value={rangeFrom} onChange={(value) => { setRangeMode('custom'); setRangeFrom(value) }} />
          <span>→</span>
          <DatePickerInput className="w-[130px] border-white/20 bg-white/10 text-white outline-none focus:ring-2 focus:ring-amber-400" value={rangeTo} onChange={(value) => { setRangeMode('custom'); setRangeTo(value) }} />
          <span className="ml-auto rounded-md bg-white/10 px-2 py-1 text-xs">📊 {filteredCount}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select className="max-w-xs rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white outline-none focus:ring-2 focus:ring-amber-400" value={dashboardBranchId} onChange={(event) => setDashboardBranchId(event.target.value)}><option className="text-slate-900" value="">🏢 ทุกสาขา</option>{(data?.filterOptions.branches ?? []).map((row) => <option className="text-slate-900" key={row.id} value={row.id}>{row.name}</option>)}</select>
          <select className="max-w-xs rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white outline-none focus:ring-2 focus:ring-amber-400" value={dashboardGroup} onChange={(event) => setDashboardGroup(event.target.value)}><option className="text-slate-900" value="">📦 ทุกหมวด</option>{(data?.filterOptions.groups ?? []).map((group) => <option className="text-slate-900" key={group} value={group}>{group}</option>)}</select>
          <div className="w-[180px] text-slate-800 text-sm">
            <SearchCombobox
              inputId="dashboard-supplier-filter"
              label="Supplier"
              hideLabel
              placeholder="🏭 ทุก Supplier"
              options={supplierSearchOptions}
              value={dashboardSupplierId}
              onChange={setDashboardSupplierId}
            />
          </div>
          <div className="w-[180px] text-slate-800 text-sm">
            <SearchCombobox
              inputId="dashboard-customer-filter"
              label="Customer"
              hideLabel
              placeholder="👥 ทุก Customer"
              options={customerSearchOptions}
              value={dashboardCustomerId}
              onChange={setDashboardCustomerId}
            />
          </div>
          <div className="w-[180px] text-slate-800 text-sm">
            <SearchCombobox
              inputId="dashboard-product-filter"
              label="สินค้า"
              hideLabel
              placeholder="🏷 ทุกสินค้า"
              options={productSearchOptions}
              value={dashboardProductId}
              onChange={setDashboardProductId}
            />
          </div>
          <button className="ml-auto rounded-md bg-amber-500 px-3 py-1 font-bold text-slate-900 hover:bg-amber-600 outline-none focus:ring-2 focus:ring-amber-400" onClick={clearFilters} type="button">✕ ล้าง Filter</button>
        </div>
      </div>
      <div>
        {(data?.dashboard.historical.rows ?? 0) > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
            <span className="font-bold text-amber-800">📅 รวมยอด Historical:</span>
            <span className="rounded-md bg-white px-2 py-0.5 border border-slate-100 font-semibold text-slate-700">Revenue <b className="text-emerald-700">{money(data?.dashboard.historical.revenue)}</b></span>
            <span className="rounded-md bg-white px-2 py-0.5 border border-slate-100 font-semibold text-slate-700">COGS <b className="text-red-700">{money(data?.dashboard.historical.cogs)}</b></span>
            <span className="rounded-md bg-white px-2 py-0.5 border border-slate-100 font-semibold text-slate-700">Expenses <b className="text-amber-700">{money(data?.dashboard.historical.expenses)}</b></span>
            <span className="text-slate-500">({data?.dashboard.historical.rows ?? 0} rows)</span>
          </div>
        ) : <div className="mb-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs text-slate-500">ℹ️ ยังไม่มีข้อมูล Historical — ไปที่เมนู <b>📅 ข้อมูลย้อนหลัง</b> เพื่อคีย์ยอด ม.ค.-เม.ย. 2026</div>}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <DashboardKpi icon="📈" label="Revenue" sub="ยอดขาย" tone="from-blue-500 to-blue-700" value={money(k.revenue)} />
          <DashboardKpi icon="💸" label="Expenses" sub="ค่าใช้จ่าย + COGS" tone="from-rose-500 to-red-600" value={money(k.expenses)} />
          <DashboardKpi icon="🥧" label="Net Profit" sub="กำไรสุทธิ" tone={(k.netProfit ?? 0) >= 0 ? 'from-emerald-500 to-teal-600' : 'from-red-500 to-rose-700'} value={money(k.netProfit)} />
          <DashboardKpi icon="💵" label="Cash Balance" sub="เงินสด/ธนาคาร" tone="from-cyan-500 to-blue-600" value={money(k.cashBalance)} />
          <DashboardKpi icon="👤" label="AR ลูกหนี้" sub="Receivable" tone="from-purple-500 to-fuchsia-600" value={money(k.ar)} />
          <DashboardKpi icon="📋" label="AP เจ้าหนี้" sub="Payable" tone="from-orange-500 to-red-600" value={money(k.ap)} />
        </div>
        <div className="mb-4 grid gap-3 lg:grid-cols-3">
          <DashboardChartCard title="Revenue vs Expense (Monthly)">
            <BarRows rows={(data?.dashboard.monthlyTrend ?? []).flatMap((row) => [{ label: `${monthLabel(row.label)} Rev`, value: row.sales }, { label: `${monthLabel(row.label)} Exp`, value: row.expense + Math.max(0, row.sales - row.gp) }])} />
          </DashboardChartCard>
          <DashboardChartCard title="Cash Flow Overview">
            <BarRows rows={(data?.dashboard.cashComposition ?? []).map((row) => ({ label: row.label, value: row.value }))} />
          </DashboardChartCard>
          <DashboardChartCard title="Expense Breakdown">
            <BarRows rows={(data?.dashboard.monthlyTrend ?? []).map((row) => ({ label: monthLabel(row.label), value: row.expense }))} />
          </DashboardChartCard>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <DashboardChartCard title="Receivables & Payables Aging">
            <table className="w-full text-xs">
              <thead className="text-slate-500"><tr><th className="py-1 text-left">Type</th><th className="text-right">Current</th><th className="text-right">1-30</th><th className="text-right">31-60</th><th className="text-right">61-90</th><th className="text-right">&gt;90</th><th className="text-right">Total</th></tr></thead>
              <tbody><AgingRow buckets={data?.dashboard.agingBuckets.ar} label="📥 AR ลูกหนี้" tone="emerald" total={k.ar ?? 0} /><AgingRow buckets={data?.dashboard.agingBuckets.ap} label="📤 AP เจ้าหนี้" tone="red" total={k.ap ?? 0} /></tbody>
            </table>
          </DashboardChartCard>
          <DashboardChartCard title="Channel Performance">
            <MiniLine label="📥 Purchase" value={`${money(purchaseWeight)} กก. · ${money(purchaseAmount)}`} />
            <MiniLine label="📤 Sales" value={`${money(salesWeight)} กก. · ${money(salesAmount)}`} />
            <MiniLine label="📦 Stock" value={`${money(stockQty)} กก. · ${money(stockValue)}`} />
          </DashboardChartCard>
          <DashboardChartCard title="Quick Insights">
            <MiniLine label="Gross Margin" value={`${money(gpPct)}%`} />
            <MiniLine label="Net Profit" value={money(k.netProfit)} />
            <MiniLine label="Net Cash" value={money(section?.cash.netCash)} />
          </DashboardChartCard>
        </div>
      </div>

      {alerts.length ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{alerts.map((alert) => <span className="mr-2 inline-flex rounded-md bg-white px-2 py-1 font-semibold border border-slate-100" key={alert.text}>⚠ {alert.text}</span>)}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2"><RankTable color="blue" rows={analytics?.topSuppliers ?? []} title="🥇 Top Suppliers" /><RankTable color="emerald" rows={analytics?.topCustomers ?? []} title="🥇 Top Customers" /></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardChartCard title="📈 แนวโน้มซื้อ-ขาย 30 วัน"><BarRows rows={(analytics?.dailyTrend ?? []).slice(-10).flatMap((row) => [{ label: `${row.label} ซื้อ`, value: row.purchase }, { label: `${row.label} ขาย`, value: row.sales }])} /></DashboardChartCard>
        <DashboardChartCard title="📦 มูลค่าสินค้าตามหมวด">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="p-1.5 text-left">หมวด</th><th className="p-1.5 text-right">กก.</th><th className="p-1.5 text-right">มูลค่า</th></tr></thead>
            <tbody>{(data?.dashboard.stockByGroup ?? []).map((row) => <tr className="border-t" key={row.group}><td className="p-1.5 font-medium">{row.group}</td><td className="p-1.5 text-right">{money(row.qty)}</td><td className="p-1.5 text-right font-bold text-indigo-700">{money(row.value)}</td></tr>)}</tbody>
          </table>
        </DashboardChartCard>
      </div>

      <Section title="📥 ฝั่งซื้อ (เดือนนี้) — Purchase / Supplier">
        <Metric label="ซื้อวันนี้" value={money(section?.purchase.today)} />
        <Metric label="ซื้อเดือนนี้" tone="blue" value={money(section?.purchase.amount)} />
        <Metric label="น้ำหนักซื้อ" value={`${money(section?.purchase.qty)} กก.`} />
        <Metric label="ราคาซื้อเฉลี่ย" value={`${money(purchaseWeight > 0 ? purchaseAmount / purchaseWeight : 0)} ฿/กก.`} />
        <Metric label="เจ้าหนี้รวม" tone="red" value={money(k.ap)} />
      </Section>
      <Section title="📤 ฝั่งขาย (เดือนนี้) — Sales / Customer">
        <Metric label="ขายวันนี้" value={money(section?.sales.today)} />
        <Metric label="ขายเดือนนี้" tone="emerald" value={money(section?.sales.amount)} />
        <Metric label="น้ำหนักขาย" value={`${money(section?.sales.qty)} กก.`} />
        <Metric label="Gross Profit" tone="emerald" value={money(section?.sales.gp)} />
        <Metric label="Margin %" tone={(gpPct ?? 0) >= 0 ? 'emerald' : 'red'} value={`${money(gpPct)}%`} />
      </Section>
      <Section title="💰 ฝั่งการเงิน — Cash / Bank / OD">
        <Metric label="💵 เงินสดรวม" tone="emerald" value={money(section?.cash.cash)} />
        <Metric label="🏦 ธนาคารรวม" tone="blue" value={money(section?.cash.bank)} />
        <Metric label="💱 FCD" tone="purple" value={money(section?.cash.fcd)} />
        <Metric label="⚠ OD ใช้ / เหลือ" tone="orange" value={`${money(section?.cash.odUsed)} / ${money(section?.cash.odLimit)}`} />
        <Metric label="💎 Net Cash Position" tone="purple" value={money(section?.cash.netCash)} />
      </Section>
      <Section title="📦 ฝั่ง Stock — Inventory / WAC">
        <Metric label="⚖ น้ำหนักรวม" value={`${money(section?.stock.qty)} กก.`} />
        <Metric label="💰 มูลค่าสต๊อกรวม" tone="orange" value={money(section?.stock.value)} />
        <Metric label="📊 ราคาต่อหน่วยเฉลี่ย" value={`${money(stockQty > 0 ? stockValue / stockQty : 0)} ฿/กก.`} />
        {(data?.dashboard.stockByBranch ?? []).slice(0, 3).map((row) => <Metric key={row.name} label={`🏢 ${row.name}`} value={`${money(row.qty)} กก. · ${money(row.value)}`} />)}
      </Section>
    </>
  )
}

function monthLabel(value: string) {
  const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const month = Number(value.slice(5, 7)) - 1
  return `${monthNames[month] ?? value.slice(5, 7)} ${value.slice(2, 4)}`
}

function AgingRow({ buckets, label, tone, total }: { buckets?: Record<string, number>; label: string; tone: 'emerald' | 'red'; total: number }) {
  const textTone = tone === 'emerald' ? 'text-emerald-700' : 'text-red-700'
  return <tr className="border-t"><td className={`py-1.5 font-medium ${textTone}`}>{label}</td><td className="text-right">{money(buckets?.current)}</td><td className="text-right">{money(buckets?.['1-30'])}</td><td className="text-right">{money(buckets?.['31-60'])}</td><td className="text-right">{money(buckets?.['61-90'])}</td><td className="text-right">{money(buckets?.over90)}</td><td className={`text-right font-bold ${textTone}`}>{money(total)}</td></tr>
}

function DashboardKpi({ icon, label, sub, tone, value }: { icon: string; label: string; sub: string; tone: string; value: string }) {
  const toneMap: Record<string, { bg: string; text: string }> = {
    'from-blue-500 to-blue-700': { bg: 'bg-blue-50', text: 'text-blue-600' },
    'from-rose-500 to-red-600': { bg: 'bg-red-50', text: 'text-red-600' },
    'from-emerald-500 to-teal-600': { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    'from-cyan-500 to-blue-600': { bg: 'bg-cyan-50', text: 'text-cyan-600' },
    'from-purple-500 to-fuchsia-600': { bg: 'bg-purple-50', text: 'text-purple-600' },
    'from-orange-500 to-red-600': { bg: 'bg-orange-50', text: 'text-orange-600' },
  }
  const style = toneMap[tone] || { bg: 'bg-slate-50', text: 'text-slate-600' }

  return (
    <div className="flex items-center gap-3 bg-white p-4 shadow-sm border border-slate-100 rounded-xl">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.text} text-2xl`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
        <div className="mt-0.5 font-mono text-lg font-bold text-slate-900 truncate">{value}</div>
      </div>
    </div>
  )
}

function DashboardChartCard({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div className="mb-3 text-sm font-bold text-slate-700">{title}</div>{children}</div>
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
      {(pending.pendingIssueCount ?? 0) > 0 ? <PendingBlock color="amber" cta="→ ดูทั้งหมด" title="📦 ต้นทุนรอเปิดบิล (WTO pending out) — ใบส่งของที่ยังไม่เปิดบิลขาย" cards={[['⏰ จำนวนใบ', `${pending.pendingIssueCount} ใบ`], ['⚖ น้ำหนักรวม', `${money(pending.pendingIssueQty)} กก.`], ['💰 ต้นทุน (เงินที่ค้างอยู่)', money(pending.pendingIssueCost)], ['📈 ยอดขายคาด', money(pending.pendingIssueEst)]]} /> : null}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">📊 ที่เกิดขึ้นจริงวันนี้แล้ว</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile tone="emerald" label="📥 รับเงินจริง" value={`+${money(actual?.cashIn)}`} />
          <Tile tone="red" label="📤 จ่าย Supplier" value={`-${money(actual?.paymentOut)}`} />
          <Tile tone="orange" label="💰 ค่าใช้จ่าย" value={`-${money(actual?.expenseOut)}`} />
          <Tile tone="amber" label="📦 FG พร้อมขาย" sub={`${money(actual?.fgQty)} กก.`} value={money(actual?.fgValue)} />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2"><OwnerDueTable rows={data?.ownerDaily.due.ar ?? []} title="📥 ลูกหนี้ที่ควรเก็บวันนี้" type="ar" /><OwnerDueTable rows={data?.ownerDaily.due.ap ?? []} title="📤 เจ้าหนี้ที่ต้องจ่ายวันนี้" type="ap" /></div>
      <div className="grid gap-3 lg:grid-cols-3">
        <OwnerSmallTable rows={data?.ownerDaily.loanToday ?? []} title="🏦 ค่างวด/ดอกเบี้ยวันนี้" />
        <OwnerSmallTable rows={(data?.ownerDaily.expensesToday ?? []).map((row) => ({ amount: row.amount, docNo: row.docNo, name: row.payee }))} title="💰 ค่าใช้จ่ายวันนี้" />
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

function DailyReportView({ data, date, rangeFrom, rangeMode, rangeTo, setDate, setRangeFrom, setRangeMode, setRangeTo }: { data: MainPayload | null; date: string; rangeFrom: string; rangeMode: string; rangeTo: string; setDate: (value: string) => void; setRangeFrom: (value: string) => void; setRangeMode: (value: string) => void; setRangeTo: (value: string) => void }) {
  const [expandedGroup, setExpandedGroup] = useState('')
  const summary = data?.dailyReport.summary ?? {}
  const purchaseCount = data?.dailyReport.purchaseBills.length ?? 0
  const salesCount = data?.dailyReport.salesBills.length ?? 0
  const analytics = data?.dailyReport.analytics
  const trendMax = Math.max(1, ...(analytics?.dailyTrend ?? []).flatMap((row) => [row.purchase, row.sales]))
  const isToday = date === today()
  function shiftDate(days: number) {
    const next = new Date(`${date}T00:00:00`)
    next.setDate(next.getDate() + days)
    setDate(next.toISOString().slice(0, 10))
  }
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
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-100">
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
      <div className="border-t border-slate-100 pt-4">
        <div className="mb-4 rounded-xl bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold">📊 Analytics Dashboard</h2><p className="mt-1 text-xs opacity-85">รายงานสรุปแบบช่วงเวลา + Top 10/5 + Charts</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {['today', 'yesterday', 'last7', 'last30', 'last90', 'month'].map((mode) => <button key={mode} className={rangeMode === mode ? 'rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 outline-none' : 'rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 outline-none'} type="button" onClick={() => applyRange(mode)}>{rangeLabel(mode)}</button>)}
              <DatePickerInput className="w-[130px] bg-white text-slate-900 border-slate-300 outline-none" value={rangeFrom} onChange={(value) => { setRangeMode('custom'); setRangeFrom(value) }} />
              <span className="text-xs">→</span>
              <DatePickerInput className="w-[130px] bg-white text-slate-900 border-slate-300 outline-none" value={rangeTo} onChange={(value) => { setRangeMode('custom'); setRangeTo(value) }} />
              <button className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100 outline-none" type="button" onClick={printReport}>🖨 Export PDF / Print</button>
            </div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label={`📥 ยอดซื้อ (${money(analytics?.rangeKpi.purchaseCount)} บิล)`} tone="blue" value={money(analytics?.rangeKpi.purchaseAmount)} />
          <Metric label="⚖️ น้ำหนักรับซื้อ" tone="purple" value={money(analytics?.rangeKpi.purchaseQty)} />
          <Metric label={`📤 ยอดขาย (${money(analytics?.rangeKpi.salesCount)} บิล)`} tone="emerald" value={money(analytics?.rangeKpi.salesAmount)} />
          <Metric label="⚖️ น้ำหนักขาย" tone="cyan" value={money(analytics?.rangeKpi.salesQty)} />
          <Metric label="💸 ค่าใช้จ่าย" tone="orange" value={money(analytics?.rangeKpi.expenseAmount)} />
        </div>
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
            <h3 className="mb-3 font-bold text-slate-700 text-sm">📈 ยอดซื้อ vs ขาย (รายวัน)</h3>
            {(analytics?.dailyTrend ?? []).map((row) => <div key={row.label} className="mb-2.5 grid grid-cols-12 items-center gap-2 text-xs"><div className="col-span-3 font-mono text-slate-600">{row.label}</div><div className="col-span-4 rounded-full bg-slate-100 h-5 overflow-hidden"><div className="rounded-full bg-blue-500 h-full text-right text-white pr-2 font-bold text-[10px] flex items-center justify-end" style={{ width: `${Math.max(15, row.purchase / trendMax * 100)}%` }}>{money(row.purchase)}</div></div><div className="col-span-5 rounded-full bg-slate-100 h-5 overflow-hidden"><div className="rounded-full bg-emerald-500 h-full text-right text-white pr-2 font-bold text-[10px] flex items-center justify-end" style={{ width: `${Math.max(15, row.sales / trendMax * 100)}%` }}>{money(row.sales)}</div></div></div>)}
          </div>
          <TopSimpleTable rows={analytics?.groupSummary ?? []} title="🥧 มูลค่าตามหมวดสินค้า" />
        </div>
        <div className="mb-4 grid gap-4 lg:grid-cols-2"><RankTable color="blue" rows={analytics?.topSuppliers ?? []} title="🥇 Top 10 ผู้ขาย (ยอดซื้อสูงสุด)" /><RankTable color="emerald" rows={analytics?.topCustomers ?? []} title="🥇 Top 10 ผู้ซื้อ (ยอดขายสูงสุด)" /></div>
        <div className="mb-4 grid gap-4 lg:grid-cols-2"><ProductRank rows={analytics?.topProductsIn ?? []} title="📦 Top 5 สินค้ารับเข้า (ตามมูลค่า)" tone="indigo" /><ProductRank rows={analytics?.topProductsOut ?? []} title="📦 Top 5 สินค้าขายออก (ตามมูลค่า)" tone="teal" /></div>
        <SalespersonTable rows={analytics?.bySalesperson ?? []} />
      </div>
    </>
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
        {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
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

function Tile({ label, sub, tone, value }: { label: string; sub?: string; tone: string; value: string }) {
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
    <div className={`rounded-xl border p-3 text-center ${cls}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="font-mono text-lg font-bold mt-1">{value}</div>
      {sub ? <div className="text-[10px] opacity-85 mt-0.5">{sub}</div> : null}
    </div>
  )
}

function MiniLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs border border-slate-100"><span>{label}</span><span className="font-bold text-slate-800">{value}</span></div>
}

function OwnerDueTable({ rows, title, type }: { rows: Array<{ amount: number; daysOverdue?: number; docNo: string; due: string; name: string }>; title: string; type: 'ap' | 'ar' }) {
  const header = type === 'ar' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className={`flex justify-between border-b p-3 font-bold text-sm ${header}`}>
        <span>{title} ({rows.length})</span>
        <span>{money(rows.reduce((sum, row) => sum + row.amount, 0))}</span>
      </div>
      
      {/* Desktop view */}
      <div className="hidden lg:block max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <th className="p-2 text-left font-semibold">ชื่อ</th>
              <th className="p-2 text-left font-semibold">บิล</th>
              <th className="p-2 text-left font-semibold">Due</th>
              <th className="p-2 text-right font-semibold">ค้าง</th>
              {type === 'ar' ? <th className="p-2 text-right font-semibold">เกินวัน</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.docNo} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="p-2 text-xs text-slate-700">{row.name}</td>
                <td className="p-2 font-mono text-xs text-slate-600">{row.docNo}</td>
                <td className="p-2 text-xs text-slate-600">{row.due}</td>
                <td className="p-2 text-right font-bold text-slate-800">{money(row.amount)}</td>
                {type === 'ar' ? (
                  <td className={row.daysOverdue ? 'p-2 text-right font-bold text-red-600' : 'p-2 text-right text-slate-400'}>
                    {row.daysOverdue || '-'}
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-4 text-center text-slate-400" colSpan={type === 'ar' ? 5 : 4}>
                  {type === 'ar' ? 'ไม่มีลูกหนี้ครบกำหนด ✓' : 'ไม่มี ✓'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view (Dense Card List) */}
      <div className="block lg:hidden max-h-64 overflow-y-auto divide-y divide-slate-100 p-2 bg-slate-50/30">
        {rows.map((row) => (
          <div key={row.docNo} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">{row.name}</span>
              <span className="font-bold text-slate-900">{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-[11px]">
              <span>บิล: <span className="font-mono">{row.docNo}</span></span>
              <span>Due: {row.due}</span>
            </div>
            {type === 'ar' && row.daysOverdue ? (
              <div className="text-right text-[11px] font-semibold text-red-600">
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

function OwnerSmallTable({ rows, title }: { rows: Array<{ amount: number; contractNo?: string; docNo?: string; installmentNo?: number; name?: string }>; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className="flex justify-between border-b bg-amber-50 text-amber-700 p-3 font-bold border-amber-100 text-sm">
        <span>{title} ({rows.length})</span>
        <span>{money(rows.reduce((sum, row) => sum + row.amount, 0))}</span>
      </div>
      
      {/* Desktop view */}
      <div className="hidden lg:block">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.docNo ?? row.contractNo ?? index}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="p-2 font-mono text-slate-600">{row.docNo ?? row.contractNo}</td>
                <td className="p-2 text-slate-700">{row.name ?? row.installmentNo ?? '-'}</td>
                <td className="p-2 text-right font-bold text-slate-800">{money(row.amount)}</td>
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
        {rows.map((row, index) => (
          <div key={`${row.docNo ?? row.contractNo ?? index}`} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-mono text-slate-600">{row.docNo ?? row.contractNo}</span>
              <span className="font-bold text-slate-900">{money(row.amount)}</span>
            </div>
            <div className="text-slate-500 text-[11px]">
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
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{count} บิล</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-slate-400 font-semibold">น้ำหนักรวม</div>
            <div className="font-mono text-xl font-bold text-slate-900 leading-none mt-1">{weight} <span className="text-xs font-normal text-slate-500">กก.</span></div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-semibold">ยอดเงินรวม</div>
            <div className="font-mono text-xl font-bold text-slate-900 leading-none mt-1">{value}</div>
            <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
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
          {groups.map((group) => (
            <div key={group.group} className="overflow-hidden rounded-xl border border-slate-100">
              <button className="w-full p-3 text-left hover:bg-slate-50 outline-none" type="button" onClick={() => setExpandedGroup(expandedGroup === group.group ? '' : group.group)}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-sm">{expandedGroup === group.group ? '▼' : '▶'} {group.group} <span className="text-xs font-normal text-slate-400">({group.products.length} สินค้า)</span></span>
                  <span className="text-xs text-slate-500">รวม <b>{money(group.buyAmt + group.sellAmt)}</b> บาท</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="mb-1 flex justify-between"><span className="text-blue-700 font-medium">📥 ซื้อ</span><b>{money(group.buyQty)} กก. · {money(group.buyAmt)}</b></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, group.buyAmt / max * 100)}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between"><span className="text-emerald-700 font-medium">📤 ขาย</span><b>{money(group.sellQty)} กก. · {money(group.sellAmt)}</b></div>
                    <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, group.sellAmt / max * 100)}%` }} /></div>
                  </div>
                </div>
              </button>
              {expandedGroup === group.group ? (
                <>
                  {/* Desktop view */}
                  <div className="hidden lg:block overflow-x-auto border-t border-slate-100 p-3">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="p-2 text-left font-semibold">Code</th>
                          <th className="p-2 text-left font-semibold">สินค้า</th>
                          <th className="p-2 text-right font-semibold">ซื้อ กก.</th>
                          <th className="p-2 text-right font-semibold">ซื้อ</th>
                          <th className="p-2 text-right font-semibold">ขาย กก.</th>
                          <th className="p-2 text-right font-semibold">ขาย</th>
                          <th className="p-2 text-right font-semibold">Spread/กก.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.products.map((row) => (
                          <tr key={row.productId} className="border-t border-slate-100">
                            <td className="p-2 font-mono text-slate-600">{row.productCode}</td>
                            <td className="p-2 text-slate-700">{row.productName}</td>
                            <td className="p-2 text-right">{money(row.buyQty)}</td>
                            <td className="p-2 text-right text-blue-700 font-bold">{money(row.buyAmt)}</td>
                            <td className="p-2 text-right">{money(row.sellQty)}</td>
                            <td className="p-2 text-right text-emerald-700 font-bold">{money(row.sellAmt)}</td>
                            <td className="p-2 text-right font-bold text-slate-700">{row.sellQty && row.buyQty ? money(row.sellAmt / row.sellQty - row.buyAmt / row.buyQty) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Mobile view */}
                  <div className="block lg:hidden border-t border-slate-100 divide-y divide-slate-100 bg-slate-50/30 p-2">
                    {group.products.map((row) => (
                      <div key={row.productId} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-slate-800">{row.productName}</span>
                          <span className="font-mono text-[10px] text-slate-400">{row.productCode}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-1 text-[11px]">
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
                        {row.sellQty && row.buyQty ? (
                          <div className="text-right text-[11px] font-semibold text-purple-700 mt-1">
                            Spread: {money(row.sellAmt / row.sellQty - row.buyAmt / row.buyQty)} ฿/กก.
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DailyBillTable({ rows, title, tone, total }: { rows: { amount: number; docNo: string; name: string; qty: number }[]; title: string; tone: 'blue' | 'emerald'; total: number }) {
  const header = tone === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  const hover = tone === 'blue' ? 'hover:bg-blue-50/30' : 'hover:bg-emerald-50/30'
  const amountColor = tone === 'blue' ? 'text-blue-700' : 'text-emerald-700'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className={`flex justify-between border-b p-3 font-bold text-sm ${header}`}>
        <h3 className="font-bold">{title}</h3>
        <span className="text-sm font-bold">{money(total)}</span>
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block max-h-[300px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <th className="p-2 text-left font-semibold">เลขที่</th>
              <th className="p-2 text-left font-semibold">{tone === 'blue' ? 'Supplier' : 'Customer'}</th>
              <th className="p-2 text-right font-semibold">กก.</th>
              <th className="p-2 text-right font-semibold">ยอด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.docNo} className={`border-t border-slate-100 ${hover}`}>
                <td className="p-2 font-mono text-xs text-slate-600">{row.docNo}</td>
                <td className="p-2 text-xs text-slate-700">{row.name}</td>
                <td className="p-2 text-right text-slate-600">{money(row.qty)}</td>
                <td className={`p-2 text-right font-bold ${amountColor}`}>{money(row.amount)}</td>
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
        {rows.map((row) => (
          <div key={row.docNo} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">{row.name}</span>
              <span className={`font-bold ${amountColor}`}>{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-[11px]">
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
          {rows.map((row) => (
            <div key={row.name}>
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
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
      <h3 className="mb-3 font-bold text-slate-800 text-sm">💰 เงินหมุนประจำวัน</h3>
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
      <div className="overflow-x-auto">
        <table className="w-full border-t border-slate-100 text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-2 text-left font-semibold">บัญชี</th>
              <th className="p-2 text-right font-semibold">เข้า</th>
              <th className="p-2 text-right font-semibold">ออก</th>
              <th className="p-2 text-right font-semibold">Net</th>
            </tr>
          </thead>
          <tbody>
            {(movement?.accounts ?? []).map((row) => (
              <tr key={row.name} className="border-t border-slate-100 hover:bg-slate-50/30">
                <td className="p-2 text-slate-700">
                  <b>{row.name}</b> <span className="text-[10px] text-slate-400">({row.type})</span>
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
    </div>
  )
}

function TopSimpleTable({ rows, title }: { rows: { amount: number; group: string; qty: number }[]; title: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
      <h3 className="mb-2 font-bold text-slate-700 text-sm">{title}</h3>
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="p-1.5 text-left font-semibold">หมวด</th>
            <th className="p-1.5 text-right font-semibold">กก.</th>
            <th className="p-1.5 text-right font-semibold">มูลค่า</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.group} className="border-t border-slate-100">
              <td className="p-1.5 font-medium text-slate-700">{row.group}</td>
              <td className="p-1.5 text-right text-slate-600">{money(row.qty)}</td>
              <td className="p-1.5 text-right font-bold text-indigo-600">{money(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RankTable({ color, rows, title }: { color: 'blue' | 'emerald'; rows: { amount: number; bills: number; id: string; name: string; qty: number }[]; title: string }) {
  const header = color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  const hover = color === 'blue' ? 'hover:bg-blue-50/30' : 'hover:bg-emerald-50/30'
  const text = color === 'blue' ? 'text-blue-700' : 'text-emerald-700'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className={`border-b p-3 font-bold text-sm ${header}`}>
        <h3 className="font-bold">{title}</h3>
      </div>
      
      {/* Desktop view */}
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <th className="p-2 text-left font-semibold w-10">#</th>
              <th className="p-2 text-left font-semibold">รายชื่อ</th>
              <th className="p-2 text-right font-semibold">บิล</th>
              <th className="p-2 text-right font-semibold">น้ำหนัก (กก.)</th>
              <th className="p-2 text-right font-semibold">ยอดรวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className={`border-t border-slate-100 ${hover}`}>
                <td className={`p-2 font-bold ${text}`}>{index + 1}</td>
                <td className="p-2 text-xs text-slate-700">{row.name}</td>
                <td className="p-2 text-right text-xs text-slate-600">{row.bills}</td>
                <td className="p-2 text-right text-xs text-slate-600">{money(row.qty)}</td>
                <td className={`p-2 text-right font-bold ${text}`}>{money(row.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-400 text-xs" colSpan={5}>ไม่มีข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block sm:hidden divide-y divide-slate-100 p-2 bg-slate-50/30">
        {rows.map((row, index) => (
          <div key={row.id} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">
                <span className={`font-bold mr-1.5 ${text}`}>#{index + 1}</span>
                {row.name}
              </span>
              <span className={`font-bold ${text}`}>{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-[11px]">
              <span>จำนวนบิล: {row.bills} บิล</span>
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

function ProductRank({ rows, title, tone }: { rows: { amount: number; code: string; group: string; id: string; name: string; qty: number }[]; title: string; tone: 'indigo' | 'teal' }) {
  const header = tone === 'indigo' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-teal-50 text-teal-700 border-teal-100'
  const text = tone === 'indigo' ? 'text-indigo-700' : 'text-teal-700'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className={`border-b p-3 font-bold text-sm ${header}`}>
        <h3 className="font-bold">{title}</h3>
      </div>
      
      {/* Desktop view */}
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs">
            <tr>
              <th className="p-2 text-left font-semibold w-10">#</th>
              <th className="p-2 text-left font-semibold">Code</th>
              <th className="p-2 text-left font-semibold">สินค้า</th>
              <th className="p-2 text-left font-semibold">หมวด</th>
              <th className="p-2 text-right font-semibold">น้ำหนัก (กก.)</th>
              <th className="p-2 text-right font-semibold">มูลค่า</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/30">
                <td className={`p-2 font-bold ${text}`}>{index + 1}</td>
                <td className="p-2 font-mono text-xs text-slate-600">{row.code}</td>
                <td className="p-2 text-xs text-slate-700">{row.name}</td>
                <td className="p-2 text-xs text-slate-500">{row.group}</td>
                <td className="p-2 text-right text-xs text-slate-600">{money(row.qty)}</td>
                <td className={`p-2 text-right font-bold ${text}`}>{money(row.amount)}</td>
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
        {rows.map((row, index) => (
          <div key={row.id} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 line-clamp-1">
                <span className={`font-bold mr-1.5 ${text}`}>#{index + 1}</span>
                {row.name}
              </span>
              <span className={`font-bold ${text}`}>{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-[11px]">
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

function SalespersonTable({ rows }: { rows: { amount: number; bills: number; id: string; name: string; qty: number; suppliers: number }[] }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
      <h3 className="mb-3 font-bold text-slate-700 text-sm">🆕 ยอดซื้อแต่ละ Sale — จำนวน supplier/กก./ยอดซื้อ</h3>
      
      {/* Desktop view */}
      <div className="hidden sm:block">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-2 text-left font-semibold">Sale</th>
              <th className="p-2 text-right font-semibold">Suppliers</th>
              <th className="p-2 text-right font-semibold">น้ำหนัก (กก.)</th>
              <th className="p-2 text-right font-semibold">ยอดซื้อ</th>
              <th className="p-2 text-right font-semibold">บิล</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/30">
                <td className="p-2 text-slate-700 font-medium">{row.name}</td>
                <td className="p-2 text-right text-slate-600">{row.suppliers} supplier</td>
                <td className="p-2 text-right text-slate-600">{money(row.qty)} กก.</td>
                <td className="p-2 text-right font-bold text-blue-600">{money(row.amount)}</td>
                <td className="p-2 text-right text-slate-600">{row.bills} บิล</td>
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
        {rows.map((row) => (
          <div key={row.id} className="p-2.5 bg-white rounded-lg border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800">{row.name}</span>
              <span className="font-bold text-blue-600">{money(row.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-[11px]">
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
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return (
    <div className="space-y-2">
      {rows.map((row) => (
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

function DueTable({ rows, title }: { rows: { amount: number; docNo: string; name: string }[]; title: string }) {
  return (
    <Panel title={title}>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((row) => (
            <tr key={row.docNo} className="border-t border-slate-100 hover:bg-slate-50/30">
              <td className="p-2 font-mono text-xs text-slate-600">{row.docNo}</td>
              <td className="p-2 text-slate-700">{row.name}</td>
              <td className="p-2 text-right font-bold text-slate-800">{money(row.amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="py-6 text-center text-slate-400 text-xs" colSpan={3}>ไม่มี</td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  )
}

function BillTable({ rows, title, tone }: { rows: { amount: number; docNo: string; name: string; qty: number }[]; title: string; tone: 'amber' | 'blue' | 'emerald' }) {
  const header = tone === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className={`border-b p-3 font-bold text-sm ${header}`}>{title}</div>
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="p-2 text-left font-semibold">เลขที่</th>
            <th className="p-2 text-left font-semibold">ชื่อ</th>
            <th className="p-2 text-right font-semibold">กก.</th>
            <th className="p-2 text-right font-semibold">ยอด</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.docNo} className="border-t border-slate-100 hover:bg-slate-50/30">
              <td className="p-2 font-mono text-xs text-slate-600">{row.docNo}</td>
              <td className="p-2 text-slate-700">{row.name}</td>
              <td className="p-2 text-right text-slate-600">{row.qty ? money(row.qty) : '-'}</td>
              <td className="p-2 text-right font-bold text-slate-800">{money(row.amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="py-8 text-center text-slate-400 text-xs" colSpan={4}>ไม่มีข้อมูล</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
