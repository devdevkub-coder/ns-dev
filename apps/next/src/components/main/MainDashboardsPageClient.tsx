'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type MainPayload = {
  dashboard: {
    aging: { label: string; value: number }[]
    kpi: Record<string, number>
    sections: {
      cash: Record<string, number>
      purchase: Record<string, number>
      sales: Record<string, number>
      stock: Record<string, number>
    }
    trend: { label: string; value: number }[]
  }
  dailyReport: {
    cashMovement: { cashIn: number; cashOut: number; net: number }
    expenseRows: { amount: number; category: string; docNo: string; payee: string }[]
    purchaseBills: { amount: number; docNo: string; name: string; qty: number }[]
    salesBills: { amount: number; docNo: string; name: string; qty: number }[]
    summary: Record<string, number>
  }
  filters: { date: string; from: string; to: string }
  ownerDaily: {
    actualActivity: { cashIn: number; cashOut: number; net: number }
    cashPlan: { available: number; expectedIn: number; expectedOut: number; gap: number }
    due: {
      ap: { amount: number; docNo: string; name: string }[]
      ar: { amount: number; docNo: string; name: string }[]
    }
    pending: { pendingIssueCount: number; productionWip: number; tradingPending: number }
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
  const [data, setData] = useState<MainPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const endpoint = mode === 'dashboard' ? '/api/dashboard' : mode === 'owner-daily' ? '/api/owner-daily' : '/api/daily-report'

  useEffect(() => {
    setError(null)
    setIsLoading(true)
    dailyFetchJson<MainPayload>(`${endpoint}?date=${date}`)
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [date, endpoint])

  return (
    <section className="space-y-4">
      {mode === 'dashboard' ? <DashboardView data={data} /> : null}
      {mode === 'owner-daily' ? <OwnerDailyView data={data} /> : null}
      {mode === 'daily-report' ? <DailyReportView data={data} date={date} setDate={setDate} /> : null}
      <div className="rounded border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Main dashboard read baseline</b><span className="ml-2">{data?.sourceState.limitations[0] ?? 'ไม่มี write action ใน baseline นี้'}</span>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {isLoading ? <div className="rounded bg-white p-4 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
    </section>
  )
}

function DashboardView({ data }: { data: MainPayload | null }) {
  const k = data?.dashboard.kpi ?? {}
  const section = data?.dashboard.sections
  return (
    <>
      <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 p-4 text-white shadow-xl">
        <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-lg bg-amber-400 px-3 py-1.5 text-slate-900">เดือนนี้</span><span className="rounded-lg bg-white/10 px-3 py-1.5">Read only</span><span className="rounded-lg bg-white/10 px-3 py-1.5">{data?.filters.from} → {data?.filters.to}</span></div>
      </div>
      <Hero subtitle="Management KPI จาก purchase/sales/stock/finance helpers" title="📊 Financial Dashboard" tone="from-indigo-600 via-purple-600 to-pink-600" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Revenue" tone="blue" value={money(k.revenue)} />
        <Metric label="Expenses + COGS" tone="red" value={money(k.expenses)} />
        <Metric label="Net Profit" tone={(k.netProfit ?? 0) >= 0 ? 'emerald' : 'red'} value={money(k.netProfit)} />
        <Metric label="Cash Balance" tone="cyan" value={money(k.cashBalance)} />
        <Metric label="AR ลูกหนี้" tone="purple" value={money(k.ar)} />
        <Metric label="AP เจ้าหนี้" tone="orange" value={money(k.ap)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="📈 Revenue / Expense / GP">
          <BarRows rows={data?.dashboard.trend ?? []} />
        </Panel>
        <Panel title="AR/AP Aging">
          <BarRows rows={data?.dashboard.aging ?? []} />
        </Panel>
      </div>
      <Section border="border-blue-500" title="ซื้อ">
        <Metric label="ซื้อวันนี้" value={money(section?.purchase.today)} />
        <Metric label="ซื้อเดือนนี้" tone="blue" value={money(section?.purchase.amount)} />
        <Metric label="น้ำหนักซื้อ" value={`${money(section?.purchase.qty)} กก.`} />
      </Section>
      <Section border="border-emerald-500" title="ขาย">
        <Metric label="ขายวันนี้" value={money(section?.sales.today)} />
        <Metric label="ขายเดือนนี้" tone="emerald" value={money(section?.sales.amount)} />
        <Metric label="Gross Profit" tone="emerald" value={money(section?.sales.gp)} />
      </Section>
      <Section border="border-amber-500" title="การเงิน / Stock">
        <Metric label="เงินสด" value={money(section?.cash.cash)} />
        <Metric label="ธนาคาร" value={money(section?.cash.bank)} />
        <Metric label="OD ใช้ไป" tone="orange" value={money(section?.cash.odUsed)} />
        <Metric label="Stock Value" tone="orange" value={money(section?.stock.value)} />
      </Section>
    </>
  )
}

function OwnerDailyView({ data }: { data: MainPayload | null }) {
  const plan = data?.ownerDaily.cashPlan
  return (
    <>
      <Hero subtitle="เปิดทุกเช้าเพื่อตรวจเงินสด รับเข้า จ่ายออก และรายการรอจัดการ" title="☀️ Owner Daily Control" tone="from-amber-500 via-orange-500 to-rose-500" />
      <div className={`rounded-2xl p-6 text-white shadow-xl ${(plan?.gap ?? 0) >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-gradient-to-br from-red-500 to-rose-700'}`}>
        <div className="text-sm opacity-80">เงินพอ/ขาด 7 วัน</div><div className="text-4xl font-bold">{money(plan?.gap)}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-3"><Metric label="เงินสดที่มี" value={money(plan?.available)} /><Metric label="คาดรับ 7 วัน" tone="emerald" value={money(plan?.expectedIn)} /><Metric label="คาดจ่าย 7 วัน" tone="red" value={money(plan?.expectedOut)} /></div>
      {(data?.ownerDaily.pending.tradingPending || data?.ownerDaily.pending.pendingIssueCount) ? <Panel title="รายการที่ต้องตาม"><BarRows rows={[{ label: 'Trading Pending', value: data.ownerDaily.pending.tradingPending }, { label: 'Pending Issue', value: data.ownerDaily.pending.pendingIssueCount }]} /></Panel> : null}
      <div className="grid gap-4 lg:grid-cols-2"><DueTable rows={data?.ownerDaily.due.ar ?? []} title="AR ที่ต้องตาม" /><DueTable rows={data?.ownerDaily.due.ap ?? []} title="AP ที่ต้องจ่าย" /></div>
      <Section border="border-slate-500" title="Actual Activity">
        <Metric label="รับเงินจริง" tone="emerald" value={money(data?.ownerDaily.actualActivity.cashIn)} />
        <Metric label="จ่ายเงินจริง" tone="red" value={money(data?.ownerDaily.actualActivity.cashOut)} />
        <Metric label="Net" value={money(data?.ownerDaily.actualActivity.net)} />
      </Section>
    </>
  )
}

function DailyReportView({ data, date, setDate }: { data: MainPayload | null; date: string; setDate: (value: string) => void }) {
  return (
    <>
      <div className="rounded-2xl bg-gradient-to-r from-orange-600 to-orange-500 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">📰 Daily Report</h1><input className="rounded bg-white px-3 py-2 text-sm font-semibold text-orange-700" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BigCard label="รับซื้อประจำวัน" tone="from-blue-600 to-indigo-700" value={money(data?.dailyReport.summary.purchaseAmount)} sub={`${money(data?.dailyReport.summary.purchaseQty)} กก.`} />
        <BigCard label="ขายประจำวัน" tone="from-emerald-600 to-teal-700" value={money(data?.dailyReport.summary.salesAmount)} sub={`${money(data?.dailyReport.summary.salesQty)} กก.`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><BillTable rows={data?.dailyReport.purchaseBills ?? []} title="📋 บิลรับซื้อประจำวัน" tone="blue" /><BillTable rows={data?.dailyReport.salesBills ?? []} title="📋 บิลขายประจำวัน" tone="emerald" /></div>
      <BillTable rows={(data?.dailyReport.expenseRows ?? []).map((row) => ({ amount: row.amount, docNo: row.docNo, name: `${row.category} · ${row.payee}`, qty: 0 }))} title="🧾 ค่าใช้จ่ายประจำวัน" tone="amber" />
      <Section border="border-purple-500" title="Analytics Dashboard">
        <Metric label="Cash In" tone="emerald" value={money(data?.dailyReport.cashMovement.cashIn)} />
        <Metric label="Cash Out" tone="red" value={money(data?.dailyReport.cashMovement.cashOut)} />
        <Metric label="Net Cash" value={money(data?.dailyReport.cashMovement.net)} />
      </Section>
    </>
  )
}

function money(value?: number) {
  return formatMoney(value ?? 0)
}

function Hero({ subtitle, title, tone }: { subtitle: string; title: string; tone: string }) {
  return <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${tone} p-6 text-white shadow-2xl`}><h1 className="text-3xl font-bold">{title}</h1><p className="mt-1 text-sm opacity-85">{subtitle}</p></div>
}

function toneClass(tone: string) {
  const map: Record<string, string> = { amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', cyan: 'bg-cyan-50 text-cyan-700', emerald: 'bg-emerald-50 text-emerald-700', orange: 'bg-orange-50 text-orange-700', purple: 'bg-purple-50 text-purple-700', red: 'bg-red-50 text-red-700', slate: 'bg-slate-50 text-slate-700' }
  return map[tone] ?? map.slate
}

function Metric({ label, tone = 'slate', value }: { label: string; tone?: string; value: string }) {
  return <div className={`rounded-xl p-4 shadow ${toneClass(tone)}`}><div className="text-xs opacity-75">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>
}

function BigCard({ label, sub, tone, value }: { label: string; sub: string; tone: string; value: string }) {
  return <div className={`rounded-2xl bg-gradient-to-br ${tone} p-6 text-white shadow-lg`}><div className="text-sm opacity-80">{label}</div><div className="mt-1 text-3xl font-bold">{value}</div><div className="text-sm opacity-90">{sub}</div></div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="overflow-hidden rounded-2xl bg-white shadow-lg"><div className="border-b bg-slate-50 p-3 font-bold">{title}</div><div className="p-4">{children}</div></div>
}

function Section({ border, children, title }: { border: string; children: ReactNode; title: string }) {
  return <div className={`rounded-2xl border-l-8 ${border} bg-white p-4 shadow-sm`}><h2 className="mb-3 font-bold">{title}</h2><div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">{children}</div></div>
}

function BarRows({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return <div className="space-y-2">{rows.map((row) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{row.label}</span><b>{money(row.value)}</b></div><div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-gradient-to-r from-blue-500 to-indigo-600" style={{ width: `${Math.min(100, Math.abs(row.value) / max * 100)}%` }} /></div></div>)}</div>
}

function DueTable({ rows, title }: { rows: { amount: number; docNo: string; name: string }[]; title: string }) {
  return <Panel title={title}><table className="w-full text-sm"><tbody>{rows.map((row) => <tr key={row.docNo} className="border-t"><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{row.name}</td><td className="p-2 text-right font-bold">{money(row.amount)}</td></tr>)}{rows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={3}>ไม่มี</td></tr> : null}</tbody></table></Panel>
}

function BillTable({ rows, title, tone }: { rows: { amount: number; docNo: string; name: string; qty: number }[]; title: string; tone: 'amber' | 'blue' | 'emerald' }) {
  const header = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
  return <div className="overflow-hidden rounded-2xl bg-white shadow-lg"><div className={`border-b p-3 font-bold ${header}`}>{title}</div><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">ชื่อ</th><th className="p-2 text-right">กก.</th><th className="p-2 text-right">ยอด</th></tr></thead><tbody>{rows.map((row) => <tr key={row.docNo} className="border-t"><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{row.name}</td><td className="p-2 text-right">{row.qty ? money(row.qty) : '-'}</td><td className="p-2 text-right font-bold">{money(row.amount)}</td></tr>)}{rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={4}>ไม่มีข้อมูล</td></tr> : null}</tbody></table></div>
}
