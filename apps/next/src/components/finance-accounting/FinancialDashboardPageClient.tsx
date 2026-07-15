'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard, type KpiCardTone } from '@/components/ui/KpiCard'
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
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-800 shadow-sm flex items-start gap-3">
          <div>{error}</div>
        </div>
      ) : null}

      {/* กล่องตัวกรอง (Toolbar Filter) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
          <span>ณ วันที่</span>
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
        <Panel className="lg:col-span-2" title=" P&L 6 เดือนล่าสุด">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span />
            <div className="flex gap-3">
              <Legend color="bg-emerald-400" label="รายได้" />
              <Legend color="bg-rose-400" label="COGS" />
              <Legend color="bg-violet-400" label="กำไรสุทธิ" />
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
        
        <Panel title=" องค์ประกอบสินทรัพย์">
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

        <Panel className="lg:col-span-3" title=" เงินที่ต้องจ่าย vs เงินที่จะได้รับ (วันนี้ / 7 วัน / 30 วัน)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(data?.cashPeriods ?? []).map((period) => (
              <CashPeriod key={period.label} period={period} />
            ))}
          </div>
        </Panel>
      </div>

      <Section
        title=" เงินสด & สภาพคล่อง"
        gridClassName="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
      >
        <Card label=" เงินสด" tone="emerald" value={money(s.cashBalance)} />
        <Card label=" ธนาคาร" tone="blue" value={money(s.bankBalance)} />
        <Card label=" FCD" tone="purple" value={money(s.fcdBalance)} />
        <Card label=" OD ใช้ไป" tone="amber" value={`${money(s.odUsed)} / ${money(s.odLimit)}`} />
        <Card label="OD เหลือใช้" tone="cyan" value={money(s.odAvailable)} />
        <Card label="เงินสดสุทธิ 30 วัน" tone={(s.netCashPos30 ?? 0) > 0 ? 'emerald' : (s.netCashPos30 ?? 0) < 0 ? 'red' : 'slate'} value={money(s.netCashPos30)} />
      </Section>

      <Section title=" ลูกหนี้ & เจ้าหนี้">
        <Card label=" ลูกหนี้รวม (AR)" tone="blue" value={money(s.ar)} />
        <Card label=" ต้นทุนรอเปิดบิล" tone="amber" value={money(s.pendingDeliveryCost)} note="ใบส่งของที่ยังไม่เปิดบิลขาย" />
        <Card label=" Trading รอจับคู่" tone="purple" value={money(s.tradingPendingValue)} note="จ่ายซื้อแล้ว รอเปิดบิลขาย" />
        <Card label=" เจ้าหนี้รวม (AP)" tone="red" value={money(s.ap)} />
      </Section>

      <Section
        title=" ทรัพย์สิน & หนี้สิน"
        gridClassName="grid grid-cols-1 gap-4 p-4 md:grid-cols-3"
      >
        <Card label="มูลค่าสต็อก (WAC)" tone="orange" value={money(s.inv)} />
        <Card label="ทรัพย์สินถาวร (NBV)" tone="violet" value={money(s.totalNBV)} />
        <Card label="เงินกู้/ลีสซิ่งคงเหลือ" tone="rose" value={money(s.totalLoan)} />
      </Section>

      <Section
        title="กระแสเงินสด 7/30 วัน"
        subtitle="ยอดเงินที่ต้องเตรียมจ่าย vs จะได้รับ"
        gridClassName="grid grid-cols-1 gap-4 p-4 md:grid-cols-3"
      >
        {(data?.cashPeriods ?? []).map((period) => (
          <CashFlowCard key={period.label} period={period} />
        ))}
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title={` ผลประกอบการ ${data?.filters.monthStart.slice(0, 7) ?? asOf.slice(0, 7)}`}
          gridClassName="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2"
        >
          <Card label="รายได้" tone="emerald" value={money(s.rev)} />
          <Card label="กำไรขั้นต้น" tone="blue" value={money(s.gp)} note={`${(s.gpPct ?? 0).toFixed(1)}%`} />
          <Card label="กำไรสุทธิ" tone={(s.np ?? 0) > 0 ? 'emerald' : (s.np ?? 0) < 0 ? 'red' : 'slate'} value={money(s.np)} note={`${(s.npPct ?? 0).toFixed(1)}%`} />
          <Card label="กระแสเงินสดจากการดำเนินงาน" tone={(s.opCF ?? 0) > 0 ? 'cyan' : (s.opCF ?? 0) < 0 ? 'red' : 'slate'} value={money(s.opCF)} />
        </Section>
        
        {/* งบดุลรวม (Balance Sheet) */}
        <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <h3 className="font-bold text-slate-800 text-sm md:text-base"> งบดุลรวม (Balance Sheet)</h3>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <WideRow label="สินทรัพย์รวม" note="เงินสด + ลูกหนี้ + สต็อก + ทรัพย์สิน + งานค้าง" tone="blue" value={money(s.totalAssets)} />
            <WideRow label="หนี้สินรวม" note="เจ้าหนี้ + เงินกู้ + ลีสซิ่ง" tone="amber" value={money(s.totalLiab)} />
            <WideRow label="ส่วนของเจ้าของ" note="สินทรัพย์ - หนี้สิน" tone="violet" value={money(s.equity)} />
          </div>
        </div>
      </div>

      <Section title="วิเคราะห์สุขภาพเงินสด">
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
    <div className={`rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}>
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
      <text fill="#64748b" fontSize="12" textAnchor="middle" x="100" y="95">สินทรัพย์รวม</text>
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
      <Bar amount={period.need} color="from-rose-400 to-rose-500" label=" ต้องจ่าย" max={max} tone="text-rose-600" />
      <Bar amount={period.cashIn} color="from-emerald-400 to-emerald-500" label=" จะได้รับ" max={max} tone="text-emerald-600" />
      <div className={`flex justify-between border-t border-slate-200/60 pt-2.5 text-xs md:text-sm font-bold ${textColor}`}>
        <span>{statusText}</span>
        <span>{money(net)}</span>
      </div>
    </div>
  )
}

function CashFlowCard({ period }: { period: { cashIn: number; label: string; need: number } }) {
  const net = period.cashIn - period.need
  const netLabel = net >= 0 ? 'เกินดุล' : 'ขาดดุล'
  const netTone = net >= 0 ? 'text-emerald-600' : 'text-rose-600'
  const icon = period.label === 'วันนี้' ? 'วันนี้' : period.label === '7 วัน' ? '7 วันข้างหน้า' : '30 วันข้างหน้า'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 text-sm font-bold text-slate-800">{icon}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
          <div className="text-xs font-semibold text-rose-500">ต้องจ่าย</div>
          <div className="mt-1 font-mono text-xl font-bold text-rose-600">{money(period.need)}</div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="text-xs font-semibold text-emerald-500">จะได้รับ</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-600">{money(period.cashIn)}</div>
        </div>
      </div>
      <div className={`mt-4 flex items-center justify-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold ${netTone}`}>
        <span>{netLabel}</span>
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

function Section({
  children,
  gridClassName,
  subtitle,
  title,
}: {
  children: ReactNode
  gridClassName?: string
  subtitle?: string
  title: string
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <h3 className="font-bold text-slate-800 text-sm md:text-base flex items-baseline gap-2">
          {title} 
          {subtitle ? <span className="text-xs font-normal text-slate-400">{subtitle}</span> : null}
        </h3>
      </div>
      <div className={gridClassName ?? 'grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4'}>
        {children}
      </div>
    </div>
  )
}

function Card({ label, note, tone, value }: { label: string; note?: string; tone: string; value: string }) {
  const match = label.match(/^([\p{Emoji_Presentation}\p{Emoji}\u200d\u26A0\u2714]+)\s*(.*)$/u)
  const cleanLabel = (match ? match[2] : label).trim()
  return <SharedKpiCard label={cleanLabel} note={note} tone={tone as KpiCardTone} value={value} />
}

function WideRow({ label, note, tone, value }: { label: string; note: string; tone: string; value: string }) {
  const match = label.match(/^([\p{Emoji_Presentation}\p{Emoji}\u200d\u26A0\u2714]+)\s*(.*)$/u)
  const cleanLabel = match ? match[2] : label

  return (
    <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-3">
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
  
  return (
    <div className="bg-white shadow-sm border border-slate-200/80 rounded-xl p-4">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-700 font-semibold truncate">{insight.title}</div>
        <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{value}</div>
        <div className="text-xs text-slate-400 mt-1 leading-normal">{insight.detail}</div>
      </div>
    </div>
  )
}
