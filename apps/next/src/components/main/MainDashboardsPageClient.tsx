'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

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
            <button className={`rounded-md px-3 py-1.5 text-xs font-bold ${rangeMode === key ? 'bg-amber-400 text-slate-900' : 'bg-white/10 hover:bg-white/20'}`} key={key} onClick={() => applyPeriod(key)} type="button">{label}</button>
          ))}
          <span className="mx-2 opacity-30">|</span>
          <DatePickerInput className="w-[130px] border-white/20 bg-white/10 text-white" value={rangeFrom} onChange={(value) => { setRangeMode('custom'); setRangeFrom(value) }} />
          <span>→</span>
          <DatePickerInput className="w-[130px] border-white/20 bg-white/10 text-white" value={rangeTo} onChange={(value) => { setRangeMode('custom'); setRangeTo(value) }} />
          <span className="ml-auto rounded-md bg-white/10 px-2 py-1 text-xs">📊 {filteredCount}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select className="max-w-xs rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white" value={dashboardBranchId} onChange={(event) => setDashboardBranchId(event.target.value)}><option className="text-slate-900" value="">🏢 ทุกสาขา</option>{(data?.filterOptions.branches ?? []).map((row) => <option className="text-slate-900" key={row.id} value={row.id}>{row.name}</option>)}</select>
          <select className="max-w-xs rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white" value={dashboardGroup} onChange={(event) => setDashboardGroup(event.target.value)}><option className="text-slate-900" value="">📦 ทุกหมวด</option>{(data?.filterOptions.groups ?? []).map((group) => <option className="text-slate-900" key={group} value={group}>{group}</option>)}</select>
          <select className="max-w-xs rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white" value={dashboardSupplierId} onChange={(event) => setDashboardSupplierId(event.target.value)}><option className="text-slate-900" value="">🏭 ทุก Supplier</option>{(data?.filterOptions.suppliers ?? []).map((row) => <option className="text-slate-900" key={row.id} value={row.id}>{row.name}</option>)}</select>
          <select className="max-w-xs rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white" value={dashboardCustomerId} onChange={(event) => setDashboardCustomerId(event.target.value)}><option className="text-slate-900" value="">👥 ทุก Customer</option>{(data?.filterOptions.customers ?? []).map((row) => <option className="text-slate-900" key={row.id} value={row.id}>{row.code ? `${row.code} - ${row.name}` : row.name}</option>)}</select>
          <select className="max-w-xs rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white" value={dashboardProductId} onChange={(event) => setDashboardProductId(event.target.value)}><option className="text-slate-900" value="">🏷 ทุกสินค้า</option>{(data?.filterOptions.products ?? []).slice(0, 300).map((row) => <option className="text-slate-900" key={`${row.id}-${row.code}`} value={row.id}>{row.code} - {row.name}</option>)}</select>
          <button className="ml-auto rounded-md bg-amber-500 px-3 py-1 font-bold text-slate-900 hover:bg-amber-600" onClick={clearFilters} type="button">✕ ล้าง Filter</button>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4 shadow-sm">
        {(data?.dashboard.historical.rows ?? 0) > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
            <span className="font-bold text-amber-800">📅 รวมยอด Historical:</span>
            <span className="rounded-md bg-white px-2 py-0.5">Revenue <b className="text-emerald-700">{money(data?.dashboard.historical.revenue)}</b></span>
            <span className="rounded-md bg-white px-2 py-0.5">COGS <b className="text-red-700">{money(data?.dashboard.historical.cogs)}</b></span>
            <span className="rounded-md bg-white px-2 py-0.5">Expenses <b className="text-amber-700">{money(data?.dashboard.historical.expenses)}</b></span>
            <span className="text-slate-500">({data?.dashboard.historical.rows ?? 0} rows)</span>
          </div>
        ) : <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">ℹ️ ยังไม่มีข้อมูล Historical — ไปที่เมนู <b>📅 ข้อมูลย้อนหลัง</b> เพื่อคีย์ยอด ม.ค.-เม.ย. 2026</div>}
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

      {alerts.length ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{alerts.map((alert) => <span className="mr-2 inline-flex rounded-md bg-white px-2 py-1 font-semibold" key={alert.text}>⚠ {alert.text}</span>)}</div> : null}

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

      <Section border="border-blue-500" title="📥 ฝั่งซื้อ (เดือนนี้) — Purchase / Supplier">
        <Metric label="ซื้อวันนี้" value={money(section?.purchase.today)} />
        <Metric label="ซื้อเดือนนี้" tone="blue" value={money(section?.purchase.amount)} />
        <Metric label="น้ำหนักซื้อ" value={`${money(section?.purchase.qty)} กก.`} />
        <Metric label="ราคาซื้อเฉลี่ย" value={`${money(purchaseWeight > 0 ? purchaseAmount / purchaseWeight : 0)} ฿/กก.`} />
        <Metric label="เจ้าหนี้รวม" tone="red" value={money(k.ap)} />
      </Section>
      <Section border="border-emerald-500" title="📤 ฝั่งขาย (เดือนนี้) — Sales / Customer">
        <Metric label="ขายวันนี้" value={money(section?.sales.today)} />
        <Metric label="ขายเดือนนี้" tone="emerald" value={money(section?.sales.amount)} />
        <Metric label="น้ำหนักขาย" value={`${money(section?.sales.qty)} กก.`} />
        <Metric label="Gross Profit" tone="emerald" value={money(section?.sales.gp)} />
        <Metric label="Margin %" tone={(gpPct ?? 0) >= 0 ? 'emerald' : 'red'} value={`${money(gpPct)}%`} />
      </Section>
      <Section border="border-amber-500" title="💰 ฝั่งการเงิน — Cash / Bank / OD">
        <Metric label="💵 เงินสดรวม" tone="emerald" value={money(section?.cash.cash)} />
        <Metric label="🏦 ธนาคารรวม" tone="blue" value={money(section?.cash.bank)} />
        <Metric label="💱 FCD" tone="purple" value={money(section?.cash.fcd)} />
        <Metric label="⚠ OD ใช้ / เหลือ" tone="orange" value={`${money(section?.cash.odUsed)} / ${money(section?.cash.odLimit)}`} />
        <Metric label="💎 Net Cash Position" tone="purple" value={money(section?.cash.netCash)} />
      </Section>
      <Section border="border-orange-500" title="📦 ฝั่ง Stock — Inventory / WAC">
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
  return <div className={`relative overflow-hidden rounded-md bg-gradient-to-br ${tone} p-4 text-white shadow-lg`}><div className="absolute -right-3 -top-3 text-6xl opacity-10">{icon}</div><div className="relative"><div className="text-xs font-medium opacity-80">{label}</div><div className="text-xs opacity-60">{sub}</div><div className="mt-1 font-mono text-2xl font-bold">{value}</div><div className="mt-2 inline-block rounded-md-full bg-white/20 px-2 py-0.5 text-xs">Read only</div></div></div>
}

function DashboardChartCard({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-md border border-slate-100 bg-white p-4 shadow-sm"><div className="mb-3 text-sm font-bold text-slate-700">{title}</div>{children}</div>
}

function OwnerDailyView({ data }: { data: MainPayload | null }) {
  const plan = data?.ownerDaily.cashPlan
  const pending = data?.ownerDaily.pending ?? {}
  const actual = data?.ownerDaily.actualActivity
  const gapPositive = (plan?.gap ?? 0) >= 0
  return (
    <>
      <div className={`relative overflow-hidden rounded-md p-6 text-white shadow-xl ${gapPositive ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-gradient-to-br from-red-500 to-rose-700 ring-4 ring-red-200'}`}>
        <div className="absolute right-3 top-2 text-7xl opacity-15">{gapPositive ? '✅' : '⚠️'}</div>
        <div className="relative">
          <div className="text-sm opacity-80">{gapPositive ? '✓ คาดการณ์เงินเหลือสิ้นวัน' : '⚠ คาดการณ์เงินขาด ต้องเตรียม!'}</div>
          <div className="mt-1 font-mono text-5xl font-bold">{money(plan?.gap)}</div>
          <div className="mt-2 text-sm opacity-90">= 💵 เงินสด {money(plan?.available)} + 📥 คาดเข้า {money(plan?.expectedIn)} − 📤 คาดออก {money(plan?.expectedOut)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <LegacyKpi border="border-blue-500" label="💵 เงินสดในมือ" sub="รวม Cash + Bank" tone="blue" value={money(plan?.available)} />
        <LegacyKpi border="border-emerald-500" label="📥 คาดรับวันนี้" sub={`${data?.ownerDaily.due.ar.length ?? 0} ลูกค้าครบกำหนด`} tone="emerald" value={`+${money(plan?.expectedIn)}`} />
        <LegacyKpi border="border-red-500" label="📤 คาดจ่ายวันนี้" sub={`AP ${money(data?.ownerDaily.due.ap.reduce((sum, row) => sum + row.amount, 0))} · Loan ${money(data?.ownerDaily.loanToday.reduce((sum, row) => sum + row.amount, 0))} · Exp ${money(data?.ownerDaily.expensesToday.reduce((sum, row) => sum + row.amount, 0))}`} tone="red" value={`-${money(plan?.expectedOut)}`} />
      </div>
      {(pending.tradingPending ?? 0) > 0 ? <PendingBlock color="purple" cta="→ ไป Trading Matching" title="🔄 Trading Pending รับเงิน — จ่ายซื้อ Trading แล้ว แต่ยังไม่เปิดบิลขาย" cards={[['📋 บิลซื้อ Trading', String(pending.tradingPending)], ['💸 จ่ายไปแล้ว', money(pending.tradingPaidTotal)], ['✓ Match แล้ว', money(pending.tradingMatchedTotal)], ['⏳ Pending รับเงิน', money(pending.tradingPendingValue)]]} /> : null}
      {(pending.pendingIssueCount ?? 0) > 0 ? <PendingBlock color="amber" cta="→ ดูทั้งหมด" title="📦 ต้นทุนรอเปิดบิล (Pending Sale) — เงินค้างใน Stock ที่เบิกออกไปแล้ว" cards={[['⏰ จำนวนใบ', `${pending.pendingIssueCount} ใบ`], ['⚖ น้ำหนักรวม', `${money(pending.pendingIssueQty)} กก.`], ['💰 ต้นทุน (เงินที่ค้างอยู่)', money(pending.pendingIssueCost)], ['📈 ยอดขายคาด', money(pending.pendingIssueEst)]]} /> : null}
      <div className="rounded-md bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">📊 ที่เกิดขึ้นจริงวันนี้แล้ว</h3>
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
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200" type="button" onClick={() => shiftDate(-1)}>← วันก่อน</button>
        <DatePickerInput className="w-[140px]" value={date} onChange={setDate} />
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30" disabled={isToday} type="button" onClick={() => shiftDate(1)}>วันถัดไป →</button>
        <button className={isToday ? 'rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white' : 'rounded-md bg-yellow-300 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-yellow-200'} type="button" onClick={() => setDate(today())}>📍 วันนี้</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <DailyBigCard count={purchaseCount} icon="📥" label="ยอดรับซื้อ" sub={`เฉลี่ย ${money((summary.purchaseAmount ?? 0) / Math.max(1, summary.purchaseQty ?? 0))} ฿/กก.`} tone="from-blue-600 to-indigo-700" value={money(summary.purchaseAmount)} weight={money(summary.purchaseQty)} />
        <DailyBigCard count={salesCount} icon="📤" label="ยอดขาย" sub={`GP ${money(summary.salesAmount - (analytics?.rangeKpi.cogs ?? 0))} (${money(analytics?.rangeKpi.gpPct)}%)`} tone="from-emerald-600 to-teal-700" value={money(summary.salesAmount)} weight={money(summary.salesQty)} />
      </div>
      <GroupBreakdown groups={data?.dailyReport.groupBreakdown ?? []} expandedGroup={expandedGroup} setExpandedGroup={setExpandedGroup} />
      <div className="grid gap-4 lg:grid-cols-2"><DailyBillTable rows={data?.dailyReport.purchaseBills ?? []} title={`📋 บิลรับซื้อประจำวัน (${purchaseCount})`} total={summary.purchaseAmount ?? 0} tone="blue" /><DailyBillTable rows={data?.dailyReport.salesBills ?? []} title={`📋 บิลขายประจำวัน (${salesCount})`} total={summary.salesAmount ?? 0} tone="emerald" /></div>
      <ExpenseSummary rows={data?.dailyReport.expenseByCategory ?? []} total={summary.expenseAmount ?? 0} />
      <CashMovement movement={data?.dailyReport.cashMovement} />
      <div className="border-t-4 border-amber-300 pt-4">
        <div className="mb-4 rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 p-5 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-2xl font-bold">📊 Analytics Dashboard</h2><p className="mt-1 text-xs opacity-90">รายงานสรุปแบบช่วงเวลา + Top 10/5 + Charts</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {['today', 'yesterday', 'last7', 'last30', 'last90', 'month'].map((mode) => <button key={mode} className={rangeMode === mode ? 'rounded-md bg-white px-3 py-1.5 text-xs font-bold text-purple-700' : 'rounded-md bg-white/20 px-3 py-1.5 text-xs hover:bg-white/30'} type="button" onClick={() => applyRange(mode)}>{rangeLabel(mode)}</button>)}
              <DatePickerInput className="w-[130px] bg-white text-slate-900" value={rangeFrom} onChange={(value) => { setRangeMode('custom'); setRangeFrom(value) }} />
              <span className="text-xs">→</span>
              <DatePickerInput className="w-[130px] bg-white text-slate-900" value={rangeTo} onChange={(value) => { setRangeMode('custom'); setRangeTo(value) }} />
              <button className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-purple-700" type="button" onClick={printReport}>🖨 Export PDF / Print</button>
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
          <div className="rounded-md bg-white p-4 shadow-lg">
            <h3 className="mb-2 font-bold text-slate-700">📈 ยอดซื้อ vs ขาย (รายวัน)</h3>
            {(analytics?.dailyTrend ?? []).map((row) => <div key={row.label} className="mb-2 grid grid-cols-12 items-center gap-2 text-xs"><div className="col-span-3 font-mono">{row.label}</div><div className="col-span-4 rounded-md bg-blue-100"><div className="rounded-md bg-blue-500 p-1 text-right text-white" style={{ width: `${Math.max(10, row.purchase / trendMax * 100)}%` }}>{money(row.purchase)}</div></div><div className="col-span-5 rounded-md bg-emerald-100"><div className="rounded-md bg-emerald-500 p-1 text-right text-white" style={{ width: `${Math.max(10, row.sales / trendMax * 100)}%` }}>{money(row.sales)}</div></div></div>)}
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

function LegacyKpi({ border, label, sub, tone, value }: { border: string; label: string; sub: string; tone: string; value: string }) {
  const text = tone === 'blue' ? 'text-blue-700' : tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-slate-700'
  return <div className={`rounded-md border-l-4 ${border} bg-gradient-to-br from-white to-slate-50 p-4 shadow-md`}><div className={`text-xs font-bold ${text}`}>{label}</div><div className={`mt-1 font-mono text-3xl font-bold ${text}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{sub}</div></div>
}

function PendingBlock({ cards, color, cta, title }: { cards: [string, string][]; color: 'amber' | 'purple'; cta: string; title: string }) {
  const gradient = color === 'purple' ? 'from-purple-50 to-pink-50' : 'from-amber-50 to-orange-50'
  const border = color === 'purple' ? 'border-purple-500' : 'border-amber-500'
  const text = color === 'purple' ? 'text-purple-700' : 'text-amber-700'
  const button = color === 'purple' ? 'bg-purple-600' : 'bg-amber-600'
  return (
    <div className={`rounded-md border-l-4 ${border} bg-gradient-to-r ${gradient} p-4 shadow`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className={`text-sm font-bold ${text}`}>{title}</h3>
        <button className={`rounded-md ${button} px-3 py-1.5 text-xs font-bold text-white opacity-60`} disabled type="button">{cta}</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-md border bg-white p-3"><div className={`text-xs ${text}`}>{label}</div><div className={`font-mono text-2xl font-bold ${text}`}>{value}</div></div>)}</div>
    </div>
  )
}

function Tile({ label, sub, tone, value }: { label: string; sub?: string; tone: string; value: string }) {
  return <div className={`rounded-md p-3 text-center ${toneClass(tone)}`}><div className="text-xs">{label}</div><div className="font-mono text-2xl font-bold">{value}</div>{sub ? <div className="text-xs text-slate-400">{sub}</div> : null}</div>
}

function MiniLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-md bg-slate-50 p-2"><span>{label}</span><span className="font-bold text-amber-700">{value}</span></div>
}

function OwnerDueTable({ rows, title, type }: { rows: Array<{ amount: number; daysOverdue?: number; docNo: string; due: string; name: string }>; title: string; type: 'ap' | 'ar' }) {
  const header = type === 'ar' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
  return <div className="overflow-hidden rounded-md bg-white shadow"><div className={`flex justify-between border-b p-3 font-bold ${header}`}><span>{title} ({rows.length})</span><span>{money(rows.reduce((sum, row) => sum + row.amount, 0))}</span></div><div className="max-h-64 overflow-x-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2 text-left">{type === 'ar' ? 'ลูกค้า' : 'Supplier'}</th><th className="p-2 text-left">บิล</th><th className="p-2 text-left">Due</th><th className="p-2 text-right">ค้าง</th>{type === 'ar' ? <th className="p-2 text-right">เกินวัน</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.docNo} className="border-t"><td className="p-2 text-xs">{row.name}</td><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2 text-xs">{row.due}</td><td className="p-2 text-right font-bold">{money(row.amount)}</td>{type === 'ar' ? <td className={row.daysOverdue ? 'p-2 text-right font-bold text-red-700' : 'p-2 text-right text-slate-400'}>{row.daysOverdue || '-'}</td> : null}</tr>)}{rows.length === 0 ? <tr><td className="py-4 text-center text-slate-400" colSpan={type === 'ar' ? 5 : 4}>{type === 'ar' ? 'ไม่มีลูกหนี้ครบกำหนด ✓' : 'ไม่มี ✓'}</td></tr> : null}</tbody></table></div></div>
}

function OwnerSmallTable({ rows, title }: { rows: Array<{ amount: number; contractNo?: string; docNo?: string; installmentNo?: number; name?: string }>; title: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow"><div className="flex justify-between border-b bg-amber-50 p-3 font-bold text-amber-700"><span>{title} ({rows.length})</span><span>{money(rows.reduce((sum, row) => sum + row.amount, 0))}</span></div><table className="w-full text-xs"><tbody>{rows.map((row, index) => <tr key={`${row.docNo ?? row.contractNo ?? index}`} className="border-t"><td className="p-2 font-mono">{row.docNo ?? row.contractNo}</td><td className="p-2">{row.name ?? row.installmentNo ?? '-'}</td><td className="p-2 text-right font-bold">{money(row.amount)}</td></tr>)}{rows.length === 0 ? <tr><td className="py-4 text-center text-slate-400" colSpan={3}>ไม่มี ✓</td></tr> : null}</tbody></table></div>
}

function DailyBigCard({ count, icon, label, sub, tone, value, weight }: { count: number; icon: string; label: string; sub: string; tone: string; value: string; weight: string }) {
  return <div className={`relative overflow-hidden rounded-md bg-gradient-to-br ${tone} p-6 text-white shadow-xl`}><div className="absolute right-4 top-3 text-7xl opacity-15">{icon}</div><div className="relative"><div className="text-sm font-bold opacity-90">{icon} {label} ({count} บิล)</div><div className="mt-3 grid grid-cols-2 gap-6"><div><div className="text-xs opacity-80">น้ำหนัก</div><div className="font-mono text-4xl font-bold">{weight}</div><div className="text-xs opacity-80">กิโลกรัม</div></div><div><div className="text-xs opacity-80">ยอดเงิน</div><div className="font-mono text-4xl font-bold">{value}</div><div className="text-xs opacity-80">{sub}</div></div></div></div></div>
}

function GroupBreakdown({ expandedGroup, groups, setExpandedGroup }: { expandedGroup: string; groups: MainPayload['dailyReport']['groupBreakdown']; setExpandedGroup: (value: string) => void }) {
  const max = Math.max(1, ...groups.map((row) => Math.max(row.buyAmt, row.sellAmt)))
  return <div className="rounded-md bg-white p-5 shadow-lg"><h3 className="mb-3 font-bold text-slate-800">📊 หมวดสินค้า — ซื้อ vs ขาย <span className="text-xs font-normal text-slate-500">(กดที่หมวด → ดูรายละเอียดสินค้า)</span></h3>{groups.length === 0 ? <div className="py-10 text-center text-slate-400">ไม่มีรายการในวันนี้</div> : <div className="space-y-3">{groups.map((group) => <div key={group.group} className="overflow-hidden rounded-md border"><button className="w-full p-3 text-left hover:bg-slate-50" type="button" onClick={() => setExpandedGroup(expandedGroup === group.group ? '' : group.group)}><div className="mb-2 flex items-center justify-between"><span className="font-bold text-slate-700">{expandedGroup === group.group ? '▼' : '▶'} {group.group} <span className="text-xs text-slate-400">({group.products.length} สินค้า)</span></span><span className="text-xs text-slate-500">รวม <b>{money(group.buyAmt + group.sellAmt)}</b> บาท</span></div><div className="grid grid-cols-2 gap-3 text-xs"><div><div className="mb-1 flex justify-between"><span className="text-blue-700">📥 ซื้อ</span><b>{money(group.buyQty)} กก. · {money(group.buyAmt)}</b></div><div className="h-3 rounded-md-full bg-slate-100"><div className="h-3 rounded-md-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${Math.min(100, group.buyAmt / max * 100)}%` }} /></div></div><div><div className="mb-1 flex justify-between"><span className="text-emerald-700">📤 ขาย</span><b>{money(group.sellQty)} กก. · {money(group.sellAmt)}</b></div><div className="h-3 rounded-md-full bg-slate-100"><div className="h-3 rounded-md-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.min(100, group.sellAmt / max * 100)}%` }} /></div></div></div></button>{expandedGroup === group.group ? <div className="overflow-x-auto border-t p-3"><table className="w-full min-w-[760px] text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">ซื้อ กก.</th><th className="p-2 text-right">ซื้อ</th><th className="p-2 text-right">ขาย กก.</th><th className="p-2 text-right">ขาย</th><th className="p-2 text-right">Spread/กก.</th></tr></thead><tbody>{group.products.map((row) => <tr key={row.productId} className="border-t"><td className="p-2 font-mono">{row.productCode}</td><td className="p-2">{row.productName}</td><td className="p-2 text-right">{money(row.buyQty)}</td><td className="p-2 text-right text-blue-700">{money(row.buyAmt)}</td><td className="p-2 text-right">{money(row.sellQty)}</td><td className="p-2 text-right text-emerald-700">{money(row.sellAmt)}</td><td className="p-2 text-right font-bold">{row.sellQty && row.buyQty ? money(row.sellAmt / row.sellQty - row.buyAmt / row.buyQty) : '-'}</td></tr>)}</tbody></table></div> : null}</div>)}</div>}</div>
}

function DailyBillTable({ rows, title, tone, total }: { rows: { amount: number; docNo: string; name: string; qty: number }[]; title: string; tone: 'blue' | 'emerald'; total: number }) {
  const header = tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
  const hover = tone === 'blue' ? 'hover:bg-blue-50/30' : 'hover:bg-emerald-50/30'
  const amountColor = tone === 'blue' ? 'text-blue-700' : 'text-emerald-700'
  return <div className="overflow-hidden rounded-md bg-white shadow-lg"><div className={`flex justify-between border-b p-3 ${header}`}><h3 className="font-bold">{title}</h3><span className="text-sm font-bold">{money(total)}</span></div><div className="max-h-[300px] overflow-x-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">{tone === 'blue' ? 'Supplier' : 'Customer'}</th><th className="p-2 text-right">กก.</th><th className="p-2 text-right">ยอด</th></tr></thead><tbody>{rows.map((row) => <tr key={row.docNo} className={`border-t ${hover}`}><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2 text-xs">{row.name}</td><td className="p-2 text-right">{money(row.qty)}</td><td className={`p-2 text-right font-bold ${amountColor}`}>{money(row.amount)}</td></tr>)}{rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={4}>{tone === 'blue' ? 'ไม่มีบิลซื้อ' : 'ไม่มีบิลขาย'}</td></tr> : null}</tbody></table></div></div>
}

function ExpenseSummary({ rows, total }: { rows: { amount: number; count: number; name: string }[]; total: number }) {
  const max = Math.max(1, ...rows.map((row) => row.amount))
  return <div className="rounded-md bg-white p-5 shadow-lg"><div className="mb-3 flex justify-between"><h3 className="font-bold text-slate-800">💸 ค่าใช้จ่ายประจำวัน ({rows.reduce((sum, row) => sum + row.count, 0)} รายการ)</h3><span className="text-lg font-bold text-red-600">รวม {money(total)} บาท</span></div>{rows.length === 0 ? <div className="py-8 text-center text-slate-400">ไม่มีค่าใช้จ่ายวันนี้</div> : <div className="space-y-2">{rows.map((row) => <div key={row.name}><div className="mb-1 flex justify-between text-sm"><span className="font-medium">📂 {row.name} <span className="text-xs text-slate-400">({row.count} รายการ)</span></span><span className="font-mono font-bold text-red-600">{money(row.amount)}</span></div><div className="h-2 rounded-md-full bg-slate-100"><div className="h-2 rounded-md-full bg-gradient-to-r from-red-500 to-orange-500" style={{ width: `${Math.min(100, row.amount / max * 100)}%` }} /></div></div>)}</div>}</div>
}

function CashMovement({ movement }: { movement?: MainPayload['dailyReport']['cashMovement'] }) {
  return <div className="rounded-md bg-white p-5 shadow-lg"><h3 className="mb-3 font-bold text-slate-800">💰 เงินหมุนประจำวัน</h3><div className="mb-4 grid gap-3 md:grid-cols-3"><Tile tone="emerald" label="📥 เงินเข้ารวม" value={money(movement?.cashIn)} /><Tile tone="red" label="📤 เงินออกรวม" value={money(movement?.cashOut)} /><Tile tone={(movement?.net ?? 0) >= 0 ? 'blue' : 'red'} label="📊 Net Cash" value={money(movement?.net)} /></div><div className="mb-4 grid gap-2 md:grid-cols-2 lg:grid-cols-4">{(movement?.byType ?? []).map((row) => <div key={row.label} className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-600">{row.label}</div><div className="mt-1 flex justify-between"><span className="text-sm text-emerald-600">+{money(row.cashIn)}</span><span className="text-sm text-red-600">-{money(row.cashOut)}</span></div></div>)}</div><div className="overflow-x-auto"><table className="w-full border-t text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-left">บัญชี</th><th className="p-2 text-right">เข้า</th><th className="p-2 text-right">ออก</th><th className="p-2 text-right">Net</th></tr></thead><tbody>{(movement?.accounts ?? []).map((row) => <tr key={row.name} className="border-t"><td className="p-2"><b>{row.name}</b> <span className="text-xs text-slate-400">{row.type}</span></td><td className="p-2 text-right font-mono text-emerald-700">{row.cashIn > 0 ? money(row.cashIn) : '-'}</td><td className="p-2 text-right font-mono text-red-600">{row.cashOut > 0 ? money(row.cashOut) : '-'}</td><td className={(row.cashIn - row.cashOut) >= 0 ? 'p-2 text-right font-mono font-bold text-blue-700' : 'p-2 text-right font-mono font-bold text-rose-600'}>{money(row.cashIn - row.cashOut)}</td></tr>)}</tbody></table></div></div>
}

function TopSimpleTable({ rows, title }: { rows: { amount: number; group: string; qty: number }[]; title: string }) {
  return <div className="rounded-md bg-white p-4 shadow-lg"><h3 className="mb-2 font-bold text-slate-700">{title}</h3><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-1.5 text-left">หมวด</th><th className="p-1.5 text-right">กก.</th><th className="p-1.5 text-right">มูลค่า</th></tr></thead><tbody>{rows.map((row) => <tr key={row.group} className="border-t"><td className="p-1.5 font-medium">{row.group}</td><td className="p-1.5 text-right">{money(row.qty)}</td><td className="p-1.5 text-right font-bold text-indigo-700">{money(row.amount)}</td></tr>)}</tbody></table></div>
}

function RankTable({ color, rows, title }: { color: 'blue' | 'emerald'; rows: { amount: number; bills: number; id: string; name: string; qty: number }[]; title: string }) {
  const header = color === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
  const hover = color === 'blue' ? 'hover:bg-blue-50/30' : 'hover:bg-emerald-50/30'
  const text = color === 'blue' ? 'text-blue-700' : 'text-emerald-700'
  return <div className="overflow-hidden rounded-md bg-white shadow-lg"><div className={`border-b p-3 ${header}`}><h3 className="font-bold">{title}</h3></div><table className="w-full text-sm"><tbody>{rows.map((row, index) => <tr key={row.id} className={`border-t ${hover}`}><td className={`p-2 font-bold ${text}`}>{index + 1}</td><td className="p-2 text-xs">{row.name}</td><td className="p-2 text-right text-xs">{row.bills}</td><td className="p-2 text-right text-xs">{money(row.qty)}</td><td className={`p-2 text-right font-bold ${text}`}>{money(row.amount)}</td></tr>)}</tbody></table></div>
}

function ProductRank({ rows, title, tone }: { rows: { amount: number; code: string; group: string; id: string; name: string; qty: number }[]; title: string; tone: 'indigo' | 'teal' }) {
  const header = tone === 'indigo' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'
  const text = tone === 'indigo' ? 'text-indigo-700' : 'text-teal-700'
  return <div className="overflow-hidden rounded-md bg-white shadow-lg"><div className={`border-b p-3 ${header}`}><h3 className="font-bold">{title}</h3></div><table className="w-full text-sm"><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t"><td className={`p-2 font-bold ${text}`}>{index + 1}</td><td className="p-2 font-mono text-xs">{row.code}</td><td className="p-2 text-xs">{row.name}</td><td className="p-2 text-xs text-slate-500">{row.group}</td><td className="p-2 text-right text-xs">{money(row.qty)}</td><td className={`p-2 text-right font-bold ${text}`}>{money(row.amount)}</td></tr>)}</tbody></table></div>
}

function SalespersonTable({ rows }: { rows: { amount: number; bills: number; id: string; name: string; qty: number; suppliers: number }[] }) {
  return <div className="rounded-md bg-white p-4 shadow"><h3 className="mb-3 font-bold text-slate-700">🆕 ยอดซื้อแต่ละ Sale — จำนวน supplier/กก./ยอดซื้อ</h3><table className="w-full text-xs"><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="p-2">{row.name}</td><td className="p-2 text-right">{row.suppliers} supplier</td><td className="p-2 text-right">{money(row.qty)} กก.</td><td className="p-2 text-right font-bold text-blue-700">{money(row.amount)}</td><td className="p-2 text-right">{row.bills} บิล</td></tr>)}</tbody></table></div>
}

function money(value?: number) {
  return formatMoney(value ?? 0)
}

function toneClass(tone: string) {
  const map: Record<string, string> = { amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', cyan: 'bg-cyan-50 text-cyan-700', emerald: 'bg-emerald-50 text-emerald-700', orange: 'bg-orange-50 text-orange-700', purple: 'bg-purple-50 text-purple-700', red: 'bg-red-50 text-red-700', slate: 'bg-slate-50 text-slate-700' }
  return map[tone] ?? map.slate
}

function Metric({ label, tone = 'slate', value }: { label: string; tone?: string; value: string }) {
  return <div className={`rounded-md p-4 shadow ${toneClass(tone)}`}><div className="text-xs opacity-75">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>
}

function BigCard({ label, sub, tone, value }: { label: string; sub: string; tone: string; value: string }) {
  return <div className={`rounded-md bg-gradient-to-br ${tone} p-6 text-white shadow-lg`}><div className="text-sm opacity-80">{label}</div><div className="mt-1 text-3xl font-bold">{value}</div><div className="text-sm opacity-90">{sub}</div></div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow-lg"><div className="border-b bg-slate-50 p-3 font-bold">{title}</div><div className="p-4">{children}</div></div>
}

function Section({ border, children, title }: { border: string; children: ReactNode; title: string }) {
  return <div className={`rounded-md border-l-8 ${border} bg-white p-4 shadow-sm`}><h2 className="mb-3 font-bold">{title}</h2><div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">{children}</div></div>
}

function BarRows({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return <div className="space-y-2">{rows.map((row) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{row.label}</span><b>{money(row.value)}</b></div><div className="h-3 rounded-md bg-slate-100"><div className="h-3 rounded-md bg-gradient-to-r from-blue-500 to-indigo-600" style={{ width: `${Math.min(100, Math.abs(row.value) / max * 100)}%` }} /></div></div>)}</div>
}

function DueTable({ rows, title }: { rows: { amount: number; docNo: string; name: string }[]; title: string }) {
  return <Panel title={title}><table className="w-full text-sm"><tbody>{rows.map((row) => <tr key={row.docNo} className="border-t"><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{row.name}</td><td className="p-2 text-right font-bold">{money(row.amount)}</td></tr>)}{rows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={3}>ไม่มี</td></tr> : null}</tbody></table></Panel>
}

function BillTable({ rows, title, tone }: { rows: { amount: number; docNo: string; name: string; qty: number }[]; title: string; tone: 'amber' | 'blue' | 'emerald' }) {
  const header = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
  return <div className="overflow-hidden rounded-md bg-white shadow-lg"><div className={`border-b p-3 font-bold ${header}`}>{title}</div><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">ชื่อ</th><th className="p-2 text-right">กก.</th><th className="p-2 text-right">ยอด</th></tr></thead><tbody>{rows.map((row) => <tr key={row.docNo} className="border-t"><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{row.name}</td><td className="p-2 text-right">{row.qty ? money(row.qty) : '-'}</td><td className="p-2 text-right font-bold">{money(row.amount)}</td></tr>)}{rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={4}>ไม่มีข้อมูล</td></tr> : null}</tbody></table></div>
}
