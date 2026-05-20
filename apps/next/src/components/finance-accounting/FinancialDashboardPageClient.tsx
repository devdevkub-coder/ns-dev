'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type Payload = {
  assetComp: { color: string; name: string; value: number }[]
  branches: BranchRow[]
  cashPeriods: { cashIn: number; label: string; need: number }[]
  filters: { asOf: string; branchId: string; monthStart: string }
  insights: { detail: string; title: string; type: 'danger' | 'ok' | 'warn'; value: number | string }[]
  monthlyPL: { cogs: number; exp: number; label: string; np: number; rev: number }[]
  sourceState: { basis: string; limitations: string[]; writeActionsEnabled: false }
  summary: Record<string, number>
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function FinancialDashboardPageClient() {
  const [asOf, setAsOf] = useState(today())
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/financial-dashboard?asOf=${asOf}${branchId ? `&branchId=${branchId}` : ''}`, [asOf, branchId])
  const { data, error, isLoading } = useApi<Payload>(url)
  const s = data?.summary ?? {}
  const maxRevenue = Math.max(...(data?.monthlyPL ?? []).map((row) => row.rev), 1)
  const assetTotal = Math.max((data?.assetComp ?? []).reduce((sum, row) => sum + row.value, 0), 1)

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-violet-700 to-purple-700 p-5 text-white shadow">
        <h1 className="text-xl font-bold md:text-2xl">💼 Financial Dashboard</h1>
        <p className="mt-1 text-sm opacity-80">รายเดือน {data?.filters.monthStart.slice(0, 7) ?? asOf.slice(0, 7)} · KPI ครบ 19 ตัว + Analysis 7 มุมมอง</p>
      </div>
      <div className="rounded border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Financial Dashboard read baseline</b><span className="ml-2">management dashboard จาก operational helpers ยังไม่ใช่ GL/statutory report</span>
        {data ? <div className="mt-1 text-xs text-amber-800">{data.sourceState.limitations[0]}</div> : null}
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">
        <label className="flex items-center gap-2 text-sm"><span>As of</span><input className="rounded border px-2 py-1.5 text-sm" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label>
        <select className="rounded border bg-white px-2 py-1.5 text-sm" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">ทุกสาขา</option>{(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="📈 P&L 6 เดือนล่าสุด">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span /><div className="flex gap-3"><Legend color="bg-emerald-500" label="Revenue" /><Legend color="bg-red-500" label="COGS" /><Legend color="bg-violet-500" label="Net Profit" /></div></div>
          <svg viewBox="0 0 600 240" className="h-60 w-full">
            {[0, 1, 2, 3, 4].map((i) => <line key={i} stroke="#e5e7eb" x1="40" x2="595" y1={20 + i * 40} y2={20 + i * 40} />)}
            {(data?.monthlyPL ?? []).map((row, i) => <g key={row.label}><rect fill="#10b981" height={row.rev / maxRevenue * 180} rx="3" width="22" x={55 + i * 90} y={220 - row.rev / maxRevenue * 180} /><rect fill="#ef4444" height={row.cogs / maxRevenue * 180} rx="3" width="22" x={80 + i * 90} y={220 - row.cogs / maxRevenue * 180} /><rect fill={row.np >= 0 ? '#8b5cf6' : '#dc2626'} height={Math.max(0, row.np) / maxRevenue * 180} rx="3" width="22" x={105 + i * 90} y={220 - Math.max(0, row.np) / maxRevenue * 180} /><text fill="#475569" fontSize="11" textAnchor="middle" x={88 + i * 90} y="235">{row.label}</text></g>)}
          </svg>
        </Panel>
        <Panel title="🥧 องค์ประกอบสินทรัพย์">
          <Donut rows={data?.assetComp ?? []} total={assetTotal} />
          <div className="mt-3 space-y-1 text-xs">{(data?.assetComp ?? []).map((row) => <div key={row.name} className="flex justify-between"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded" style={{ background: row.color }} />{row.name}</span><span className="font-mono font-bold">{money(row.value)}</span></div>)}</div>
        </Panel>
        <Panel className="lg:col-span-3" title="💸 เงินที่ต้องจ่าย vs เงินที่จะได้รับ (วันนี้ / 7 วัน / 30 วัน)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{(data?.cashPeriods ?? []).map((period) => <CashPeriod key={period.label} period={period} />)}</div>
        </Panel>
      </div>

      <Section border="border-emerald-500" title="💵 เงินสด & สภาพคล่อง" subtitle="— เงินที่ใช้ได้จริงตอนนี้">
        <Card label="💵 เงินสด" tone="emerald" value={money(s.cashBalance)} />
        <Card label="🏦 ธนาคาร" tone="blue" value={money(s.bankBalance)} />
        <Card label="💱 FCD" tone="purple" value={money(s.fcdBalance)} />
        <Card label="⚠ OD ใช้ไป" tone="amber" value={`${money(s.odUsed)} / ${money(s.odLimit)}`} />
        <Card label="✓ OD เหลือใช้" tone="cyan" value={money(s.odAvailable)} />
        <Card label="📊 Net Cash 30 วัน" tone={(s.netCashPos30 ?? 0) >= 0 ? 'emerald' : 'red'} value={money(s.netCashPos30)} />
      </Section>

      <Section border="border-blue-500" title="📥📤 ลูกหนี้ & เจ้าหนี้" subtitle="— เงินที่จะรับเข้า/จ่ายออก">
        <Card label="📥 ลูกหนี้รวม (AR)" tone="blue" value={money(s.ar)} />
        <Card label="📦 ต้นทุนรอเปิดบิล" tone="amber" value={money(s.pendingIssueCost)} note="เบิกแล้ว ยังไม่เปิดบิลขาย" />
        <Card label="🔄 Trading รอจับคู่" tone="purple" value={money(s.tradingPendingValue)} note="จ่ายซื้อแล้ว รอเปิดบิลขาย" />
        <Card label="📤 เจ้าหนี้รวม (AP)" tone="red" value={money(s.ap)} />
      </Section>

      <Section border="border-orange-500" title="📦 ทรัพย์สิน & หนี้สิน" subtitle="— Stock + Fixed Asset + เงินกู้">
        <Card label="📦 Stock Value (WAC)" tone="orange" value={money(s.inv)} />
        <Card label="🏗️ Fixed Asset (NBV)" tone="violet" value={money(s.totalNBV)} />
        <Card label="🏦 Loan/Leasing Outstanding" tone="rose" value={money(s.totalLoan)} />
      </Section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section border="border-fuchsia-500" title={`📈 ผลประกอบการ ${data?.filters.monthStart.slice(0, 7) ?? asOf.slice(0, 7)}`}>
          <Card label="📈 Revenue" tone="emerald" value={money(s.rev)} />
          <Card label="💰 Gross Profit" tone="blue" value={money(s.gp)} note={`${(s.gpPct ?? 0).toFixed(1)}%`} />
          <Card label="🎯 Net Profit" tone={(s.np ?? 0) >= 0 ? 'emerald' : 'red'} value={money(s.np)} note={`${(s.npPct ?? 0).toFixed(1)}%`} />
          <Card label="💧 Operating Cash Flow" tone={(s.opCF ?? 0) >= 0 ? 'cyan' : 'red'} value={money(s.opCF)} />
        </Section>
        <Section border="border-violet-500" title="📊 งบดุลรวม (Balance Sheet)">
          <WideRow label="📥 Total Assets" note="Cash + AR + Stock + Fixed + Pending" tone="blue" value={money(s.totalAssets)} />
          <WideRow label="📤 Total Liabilities" note="AP + Loan + Leasing" tone="amber" value={money(s.totalLiab)} />
          <WideRow label="💎 Equity (ส่วนของเจ้าของ)" note="Assets - Liabilities" tone="violet" value={money(s.equity)} />
        </Section>
      </div>

      <Section border="border-pink-500" title="🔎 วิเคราะห์เชิงลึก / Cash Health Insights" subtitle="— 7 มุมมองสำคัญ">
        {(data?.insights ?? []).map((insight) => <InsightCard insight={insight} key={insight.title} />)}
        {isLoading ? <div className="py-4 text-center text-slate-400">กำลังโหลดข้อมูล</div> : null}
      </Section>
    </section>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)
    dailyFetchJson<T>(url).then((payload) => mounted ? setData(payload) : undefined).catch((caught) => mounted ? setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้') : undefined).finally(() => mounted ? setIsLoading(false) : undefined)
    return () => { mounted = false }
  }, [url])
  return { data, error, isLoading }
}

function money(value?: number) {
  const amount = value ?? 0
  return amount < 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount)
}

function Panel({ children, className = '', title }: { children: ReactNode; className?: string; title: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-lg ${className}`}><h3 className="mb-3 font-bold text-slate-800">{title}</h3>{children}</div>
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className={`h-3 w-3 rounded ${color}`} />{label}</span>
}

function Donut({ rows, total }: { rows: Payload['assetComp']; total: number }) {
  const segments = rows.reduce<{ color: string; dash: number; name: string; offset: number; value: number }[]>((acc, row) => {
    const dash = row.value / Math.max(1, total) * 440
    const offset = acc.reduce((sum, item) => sum + item.dash, 0)
    return [...acc, { ...row, dash, offset }]
  }, [])
  return <svg viewBox="0 0 200 200" className="mx-auto block h-[170px] w-[170px]">{segments.map((row) => <circle cx="100" cy="100" fill="none" key={row.name} r="70" stroke={row.color} strokeDasharray={`${row.dash} 440`} strokeDashoffset={-row.offset} strokeWidth="40" transform="rotate(-90 100 100)" />)}<text fill="#64748b" fontSize="10" textAnchor="middle" x="100" y="95">Total Assets</text><text fill="#0f172a" fontSize="12" fontWeight="bold" textAnchor="middle" x="100" y="115">{money(total)}</text></svg>
}

function CashPeriod({ period }: { period: { cashIn: number; label: string; need: number } }) {
  const max = Math.max(period.need, period.cashIn, 1)
  const net = period.cashIn - period.need
  return <div className="rounded-xl bg-slate-50 p-4"><div className="mb-2 text-xs text-slate-500">{period.label}</div><Bar amount={period.need} color="from-red-500 to-orange-500" label="📤 ต้องจ่าย" max={max} tone="text-red-700" /><Bar amount={period.cashIn} color="from-emerald-500 to-teal-500" label="📥 จะได้รับ" max={max} tone="text-emerald-700" /><div className={`flex justify-between border-t pt-2 text-sm font-bold ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><span>{net >= 0 ? 'เกินดุล' : 'ขาดดุล'}</span><span>{money(net)}</span></div></div>
}

function Bar({ amount, color, label, max, tone }: { amount: number; color: string; label: string; max: number; tone: string }) {
  return <div className="mb-2"><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className={`font-bold ${tone}`}>{money(amount)}</span></div><div className="h-3 w-full rounded-full bg-slate-100"><div className={`h-3 rounded-full bg-gradient-to-r ${color}`} style={{ width: `${Math.min(100, amount / max * 100)}%` }} /></div></div>
}

function Section({ border, children, subtitle, title }: { border: string; children: ReactNode; subtitle?: string; title: string }) {
  return <div className={`overflow-hidden rounded-2xl border-l-4 ${border} bg-white shadow`}><div className="border-b bg-slate-50 px-4 py-2"><h3 className="font-bold text-slate-800">{title} {subtitle ? <span className="text-xs font-normal text-slate-500">{subtitle}</span> : null}</h3></div><div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div></div>
}

function toneClass(tone: string) {
  const map: Record<string, string> = { amber: 'border-amber-500 bg-amber-50 text-amber-700', blue: 'border-blue-500 bg-blue-50 text-blue-700', cyan: 'border-cyan-500 bg-cyan-50 text-cyan-700', emerald: 'border-emerald-500 bg-emerald-50 text-emerald-700', orange: 'border-orange-500 bg-orange-50 text-orange-700', purple: 'border-purple-500 bg-purple-50 text-purple-700', red: 'border-red-500 bg-red-50 text-red-700', rose: 'border-rose-500 bg-rose-50 text-rose-700', violet: 'border-violet-500 bg-violet-50 text-violet-700' }
  return map[tone] ?? map.blue
}

function Card({ label, note, tone, value }: { label: string; note?: string; tone: string; value: string }) {
  return <div className={`rounded-xl border-l-4 p-3 ${toneClass(tone)}`}><div className="text-xs text-slate-600">{label}</div><div className="text-lg font-bold">{value}</div>{note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}</div>
}

function WideRow({ label, note, tone, value }: { label: string; note: string; tone: string; value: string }) {
  return <div className={`flex items-center justify-between rounded-xl p-3 ${toneClass(tone)}`}><div><div className="text-xs text-slate-600">{label}</div><div className="text-[10px] text-slate-500">{note}</div></div><div className="text-2xl font-bold">{value}</div></div>
}

function InsightCard({ insight }: { insight: Payload['insights'][number] }) {
  const tone = insight.type === 'danger' ? 'red' : insight.type === 'warn' ? 'amber' : 'emerald'
  const value = typeof insight.value === 'number' ? money(insight.value) : insight.value
  return <div className={`rounded-lg border-l-4 p-3 ${toneClass(tone)}`}><div className="mb-1 text-xs font-semibold text-slate-600">{insight.title}</div><div className="mb-1 text-lg font-bold">{value}</div><div className="text-[11px] leading-tight text-slate-500">{insight.detail}</div></div>
}
