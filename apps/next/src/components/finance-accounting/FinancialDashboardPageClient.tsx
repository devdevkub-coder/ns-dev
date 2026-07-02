'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
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
      {/* Notice Block ด้านบนสุด: ปรับเป็น AcexPOS style (border-amber-200 + bg-amber-50/40) โดยไม่ใช้ border-l-4 */}
      <div className="rounded-md border border-amber-200 bg-amber-50/40 p-4 text-sm text-amber-900 shadow-sm flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5" aria-hidden="true">⚠️</span>
        <div>
          <b className="font-semibold text-amber-950">Financial Dashboard read baseline</b>
          <span className="ml-2 text-amber-800">management dashboard จาก operational helpers ยังไม่ใช่ GL/statutory report</span>
          {data ? <div className="mt-1.5 text-xs text-amber-700/95">{data.sourceState.limitations[0]}</div> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-800 shadow-sm flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5" aria-hidden="true">🚫</span>
          <div>{error}</div>
        </div>
      ) : null}

      {/* กล่องตัวกรอง (Toolbar Filter) */}
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
          <span>As of</span>
          <DatePickerInput
            className="w-[140px] h-9 text-sm border-slate-300 focus:border-slate-400 focus:ring-0 rounded-md outline-none"
            value={asOf}
            onChange={setAsOf}
          />
        </div>
        <select
          className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-0"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
        >
          <option value="">ทุกสาขา</option>
          {(data?.branches ?? []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="📈 P&L 6 เดือนล่าสุด">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span />
            <div className="flex gap-3">
              <Legend color="bg-emerald-400" label="Revenue" />
              <Legend color="bg-rose-400" label="COGS" />
              <Legend color="bg-violet-400" label="Net Profit" />
            </div>
          </div>
          {/* ปรับสีแท่ง SVG และ Grid Lines ให้คอนทราสต์ต่ำ/พาสเทลตาม AcexPOS UI Standard */}
          <svg viewBox="0 0 600 240" className="h-60 w-full">
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} stroke="#f1f5f9" x1="40" x2="595" y1={20 + i * 40} y2={20 + i * 40} />
            ))}
            {(data?.monthlyPL ?? []).map((row, i) => (
              <g key={row.label}>
                {/* Revenue (Emerald-400) */}
                <rect fill="#34d399" height={(row.rev / maxRevenue) * 180} rx="3" width="22" x={55 + i * 90} y={220 - (row.rev / maxRevenue) * 180} />
                {/* COGS (Rose-400) */}
                <rect fill="#fb7185" height={(row.cogs / maxRevenue) * 180} rx="3" width="22" x={80 + i * 90} y={220 - (row.cogs / maxRevenue) * 180} />
                {/* Net Profit (Violet-400 / Rose-500) */}
                <rect
                  fill={row.np >= 0 ? '#a78bfa' : '#f43f5e'}
                  height={(Math.max(0, Math.abs(row.np)) / maxRevenue) * 180}
                  rx="3"
                  width="22"
                  x={105 + i * 90}
                  y={220 - (Math.max(0, Math.abs(row.np)) / maxRevenue) * 180}
                />
                <text fill="#64748b" fontSize="12" textAnchor="middle" x={88 + i * 90} y="235">{row.label}</text>
              </g>
            ))}
          </svg>
        </Panel>

        <Panel title="🥧 องค์ประกอบสินทรัพย์">
          <Donut rows={data?.assetComp ?? []} total={assetTotal} />
          <div className="mt-3 space-y-2 text-xs">
            {(data?.assetComp ?? []).map((row) => (
              <div key={row.name} className="flex justify-between items-center py-0.5">
                <span className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                  {row.name}
                </span>
                <span className="font-mono font-bold text-slate-800">{money(row.value)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="lg:col-span-3" title="💸 เงินที่ต้องจ่าย vs เงินที่จะได้รับ (วันนี้ / 7 วัน / 30 วัน)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(data?.cashPeriods ?? []).map((period) => (
              <CashPeriod key={period.label} period={period} />
            ))}
          </div>
        </Panel>
      </div>

      <Section title="💵 เงินสด & สภาพคล่อง" subtitle="— เงินที่ใช้ได้จริงตอนนี้">
        <Card label="💵 เงินสด" tone="emerald" value={money(s.cashBalance)} />
        <Card label="🏦 ธนาคาร" tone="blue" value={money(s.bankBalance)} />
        <Card label="💱 FCD" tone="purple" value={money(s.fcdBalance)} />
        <Card label="⚠ OD ใช้ไป" tone="amber" value={`${money(s.odUsed)} / ${money(s.odLimit)}`} />
        <Card label="✓ OD เหลือใช้" tone="cyan" value={money(s.odAvailable)} />
        <Card label="📊 Net Cash 30 วัน" tone={(s.netCashPos30 ?? 0) >= 0 ? 'emerald' : 'red'} value={money(s.netCashPos30)} />
      </Section>

      <Section title="📥📤 ลูกหนี้ & เจ้าหนี้" subtitle="— เงินที่จะรับเข้า/จ่ายออก">
        <Card label="📥 ลูกหนี้รวม (AR)" tone="blue" value={money(s.ar)} />
        <Card label="🔄 Trading รอจับคู่" tone="purple" value={money(s.tradingPendingValue)} note="จ่ายซื้อแล้ว รอเปิดบิลขาย" />
        <Card label="📤 เจ้าหนี้รวม (AP)" tone="red" value={money(s.ap)} />
      </Section>

      <Section title="📦 ทรัพย์สิน & หนี้สิน" subtitle="— Stock + Fixed Asset + เงินกู้">
        <Card label="📦 Stock Value (WAC)" tone="orange" value={money(s.inv)} />
        <Card label="🏗️ Fixed Asset (NBV)" tone="violet" value={money(s.totalNBV)} />
        <Card label="🏦 Loan/Leasing Outstanding" tone="rose" value={money(s.totalLoan)} />
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={`📈 ผลประกอบการ ${data?.filters.monthStart.slice(0, 7) ?? asOf.slice(0, 7)}`}>
          <Card label="📈 Revenue" tone="emerald" value={money(s.rev)} />
          <Card label="💰 Gross Profit" tone="blue" value={money(s.gp)} note={`${(s.gpPct ?? 0).toFixed(1)}%`} />
          <Card label="🎯 Net Profit" tone={(s.np ?? 0) >= 0 ? 'emerald' : 'red'} value={money(s.np)} note={`${(s.npPct ?? 0).toFixed(1)}%`} />
          <Card label="💧 Operating Cash Flow" tone={(s.opCF ?? 0) >= 0 ? 'cyan' : 'red'} value={money(s.opCF)} />
        </Section>

        {/* งบดุลรวม (Balance Sheet) */}
        <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <h3 className="font-bold text-slate-800 text-sm md:text-base">📊 งบดุลรวม (Balance Sheet)</h3>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <WideRow label="📥 Total Assets" note="Cash + AR + Stock + Fixed + Pending" tone="blue" value={money(s.totalAssets)} />
            <WideRow label="📤 Total Liabilities" note="AP + Loan + Leasing" tone="amber" value={money(s.totalLiab)} />
            <WideRow label="💎 Equity (ส่วนของเจ้าของ)" note="Assets - Liabilities" tone="violet" value={money(s.equity)} />
          </div>
        </div>
      </div>

      <Section title="🔎 วิเคราะห์เชิงลึก / Cash Health Insights" subtitle="— 7 มุมมองสำคัญ">
        {(data?.insights ?? []).map((insight) => (
          <InsightCard insight={insight} key={insight.title} />
        ))}
        {isLoading ? (
          <div className="col-span-full py-8 text-center text-sm font-medium text-slate-400 flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>กำลังโหลดข้อมูล...</span>
          </div>
        ) : null}
      </Section>
    </section>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const latestLoadRequestRef = useRef(0)
  useEffect(() => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setIsLoading(true)
    setError(null)
    dailyFetchJson<T>(url)
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
  }, [url])
  return { data, error, isLoading }
}

function money(value?: number) {
  const amount = value ?? 0
  return amount < 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount)
}

function Panel({ children, className = '', title }: { children: ReactNode; className?: string; title: string }) {
  return (
    <div className={`rounded-md border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}>
      <h3 className="mb-4 font-bold text-slate-800 text-sm md:text-base">{title}</h3>
      {children}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-600 font-medium">
      <span className={`h-3 w-3 rounded-md ${color}`} />
      {label}
    </span>
  )
}

function Donut({ rows, total }: { rows: Payload['assetComp']; total: number }) {
  const segments = rows.reduce<{ color: string; dash: number; name: string; offset: number; value: number }[]>((acc, row) => {
    const dash = (row.value / Math.max(1, total)) * 440
    const offset = acc.reduce((sum, item) => sum + item.dash, 0)
    return [...acc, { ...row, dash, offset }]
  }, [])
  return (
    <svg viewBox="0 0 200 200" className="mx-auto block h-[170px] w-[170px]">
      {segments.map((row) => (
        <circle
          cx="100"
          cy="100"
          fill="none"
          key={row.name}
          r="70"
          stroke={row.color}
          strokeDasharray={`${row.dash} 440`}
          strokeDashoffset={-row.offset}
          strokeWidth="32"
          transform="rotate(-90 100 100)"
        />
      ))}
      <text fill="#64748b" fontSize="12" textAnchor="middle" x="100" y="95">Total Assets</text>
      <text fill="#0f172a" fontSize="12" fontWeight="bold" textAnchor="middle" x="100" y="115">{money(total)}</text>
    </svg>
  )
}

function CashPeriod({ period }: { period: { cashIn: number; label: string; need: number } }) {
  const max = Math.max(period.need, period.cashIn, 1)
  const net = period.cashIn - period.need

  const isZero = net === 0
  const statusText = isZero ? 'สมดุล' : net >= 0 ? 'เกินดุล' : 'ขาดดุล'
  const textColor = isZero ? 'text-slate-600' : net >= 0 ? 'text-emerald-600' : 'text-rose-600'

  return (
    <div className="rounded-md border border-slate-200/60 bg-slate-50/50 p-4">
      <div className="mb-3 text-xs font-semibold text-slate-500">{period.label}</div>
      <Bar amount={period.need} color="from-rose-400 to-rose-500" label="📤 ต้องจ่าย" max={max} tone="text-rose-600" />
      <Bar amount={period.cashIn} color="from-emerald-400 to-emerald-500" label="📥 จะได้รับ" max={max} tone="text-emerald-600" />
      <div className={`flex justify-between border-t border-slate-200/60 pt-2.5 text-xs md:text-sm font-bold ${textColor}`}>
        <span>{statusText}</span>
        <span>{money(net)}</span>
      </div>
    </div>
  )
}

function Bar({ amount, color, label, max, tone }: { amount: number; color: string; label: string; max: number; tone: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
        <span>{label}</span>
        <span className={`font-mono font-bold ${tone}`}>{money(amount)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div className={`h-2 rounded-full bg-gradient-to-r ${color}`} style={{ width: `${Math.min(100, (amount / max) * 100)}%` }} />
      </div>
    </div>
  )
}

function Section({ children, subtitle, title }: { children: ReactNode; subtitle?: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <h3 className="font-bold text-slate-800 text-sm md:text-base flex items-baseline gap-2">
          {title}
          {subtitle ? <span className="text-xs font-normal text-slate-400">{subtitle}</span> : null}
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </div>
  )
}

function toneIconClass(tone: string) {
  const map: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600 border border-amber-200/50',
    blue: 'bg-blue-50 text-blue-600 border border-blue-200/50',
    cyan: 'bg-cyan-50 text-cyan-600 border border-cyan-200/50',
    emerald: 'bg-emerald-50 text-emerald-600 border border-emerald-200/50',
    orange: 'bg-orange-50 text-orange-600 border border-orange-200/50',
    purple: 'bg-purple-50 text-purple-600 border border-purple-200/50',
    red: 'bg-red-50 text-red-600 border border-red-200/50',
    rose: 'bg-rose-50 text-rose-600 border border-rose-200/50',
    violet: 'bg-violet-50 text-violet-600 border border-violet-200/50',
  }
  return map[tone] ?? map.blue
}

function Card({ label, note, tone, value }: { label: string; note?: string; tone: string; value: string }) {
  // Extract emoji if matching, otherwise fallback
  const match = label.match(/^([\p{Emoji_Presentation}\p{Emoji}\u200d\u26A0\u2714]+)\s*(.*)$/u)
  const emoji = match ? match[1] : '📊'
  const cleanLabel = match ? match[2] : label

  // Handle neutral slate for zero/none difference values
  const isZeroValue = value === '0.00' || value === '0' || value === '(0.00)' || value === '฿0.00' || value === '฿0' || value === '- ฿0.00'
  const finalIconClass = isZeroValue ? 'bg-slate-100 text-slate-500 border border-slate-200/60' : toneIconClass(tone)

  return (
    <div className="bg-white shadow-sm border border-slate-200/80 rounded-md p-4 flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg ${finalIconClass}`} aria-hidden="true">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 font-medium truncate">{cleanLabel}</div>
        <div className="text-base md:text-lg font-mono font-bold text-slate-900 truncate mt-0.5">{value}</div>
        {note ? <div className="text-xs text-slate-400 truncate mt-0.5" title={note}>{note}</div> : null}
      </div>
    </div>
  )
}

function WideRow({ label, note, tone, value }: { label: string; note: string; tone: string; value: string }) {
  const match = label.match(/^([\p{Emoji_Presentation}\p{Emoji}\u200d\u26A0\u2714]+)\s*(.*)$/u)
  const emoji = match ? match[1] : '📊'
  const cleanLabel = match ? match[2] : label

  const isZeroValue = value === '0.00' || value === '0' || value === '(0.00)' || value === '฿0.00' || value === '฿0' || value === '- ฿0.00'
  const finalIconClass = isZeroValue ? 'bg-slate-100 text-slate-500 border border-slate-200/60' : toneIconClass(tone)

  return (
    <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-md p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base ${finalIconClass}`} aria-hidden="true">
          {emoji}
        </div>
        <div>
          <div className="text-xs text-slate-700 font-semibold">{cleanLabel}</div>
          <div className="text-xs text-slate-400 mt-0.5">{note}</div>
        </div>
      </div>
      <div className="text-xl font-bold font-mono text-slate-900">{value}</div>
    </div>
  )
}

function InsightCard({ insight }: { insight: Payload['insights'][number] }) {
  const tone = insight.type === 'danger' ? 'red' : insight.type === 'warn' ? 'amber' : 'emerald'
  const value = typeof insight.value === 'number' ? money(insight.value) : insight.value

  const isZeroValue = value === '0.00' || value === '0' || value === '(0.00)' || value === '฿0.00' || value === '฿0'
  const finalIconClass = isZeroValue ? 'bg-slate-100 text-slate-500 border border-slate-200/60' : toneIconClass(tone)

  let emoji = '🔎'
  if (insight.type === 'danger') emoji = '🚨'
  else if (insight.type === 'warn') emoji = '⚠️'
  else if (insight.type === 'ok') emoji = '✅'

  return (
    <div className="bg-white shadow-sm border border-slate-200/80 rounded-md p-4 flex gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base ${finalIconClass}`} aria-hidden="true">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-700 font-semibold truncate">{insight.title}</div>
        <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{value}</div>
        <div className="text-xs text-slate-400 mt-1 leading-normal">{insight.detail}</div>
      </div>
    </div>
  )
}
