'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { KpiCard as SharedKpiCard, type KpiCardTone } from '@/components/ui/KpiCard'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type CashEntry = { account: string; date: string; description: string; id: string; in: number; out: number; refNo: string; type: string }
type CashDay = {
  begin: number
  cashIn: number
  cashOut: number
  date: string
  day: number
  ending: number
  entries: CashEntry[]
  entryCount: number
  isNegative: boolean
  isToday: boolean
  net: number
  weekday: number
}
type CashPayload = {
  days: CashDay[]
  month: string
  sourceState: { limitations: string[]; writeActionsEnabled: false }
  summary: Record<string, number>
  weeks: Array<Array<CashDay | null>>
}
type BusinessDoc = { amount: number; category?: string; cogs?: number; docNo: string; gp?: number; id: string; payee?: string; qty?: number }
type BusinessDay = {
  apIncrease: number
  arIncrease: number
  cogs: number
  date: string
  day: number
  expenseAmount: number
  expenseDocs: BusinessDoc[]
  gp: number
  isToday: boolean
  isWeekend: boolean
  netCash: number
  paymentAmount: number
  paymentDocs: BusinessDoc[]
  purchaseAmount: number
  purchaseDocs: BusinessDoc[]
  purchaseQty: number
  receiptAmount: number
  receiptDocs: BusinessDoc[]
  saleAmount: number
  saleDocs: BusinessDoc[]
  saleQty: number
  weekday: number
}
type BusinessPayload = {
  days: BusinessDay[]
  month: string
  sourceState: { limitations: string[]; writeActionsEnabled: false }
  summary: Record<string, number>
}
type Mode = 'combined' | 'expense' | 'purchase' | 'sales'
type SortDirection = 'asc' | 'desc'
type TableColumn<TKey extends string> = ResizableColumnDefinition<TKey> & { align?: 'center' | 'left' | 'right'; label: string }
type CashEntryColumnKey = 'account' | 'cashIn' | 'cashOut' | 'description' | 'refNo' | 'type'
type BusinessCombinedColumnKey = 'apIncrease' | 'arIncrease' | 'cogs' | 'date' | 'expenseAmount' | 'gp' | 'netCash' | 'paymentAmount' | 'purchaseAmount' | 'receiptAmount' | 'saleAmount'
type BusinessModeColumnKey = 'amount' | 'category' | 'cogs' | 'date' | 'docNo' | 'gp' | 'payee' | 'qty'
type BusinessModeRow = BusinessDoc & { date: string }

const weekdays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']
const cashEntryColumns: Array<TableColumn<CashEntryColumnKey>> = [
  { key: 'type', label: 'ประเภท', defaultWidth: 130, minWidth: 110 },
  { key: 'description', label: 'รายละเอียด', defaultWidth: 240, minWidth: 170, align: 'right' },
  { key: 'account', label: 'บัญชี', defaultWidth: 180, minWidth: 140, align: 'right' },
  { key: 'refNo', label: 'เลขอ้างอิง', defaultWidth: 150, minWidth: 120, align: 'right' },
  { key: 'cashIn', label: 'เงินเข้า', defaultWidth: 130, minWidth: 115, align: 'right' },
  { key: 'cashOut', label: 'เงินออก', defaultWidth: 130, minWidth: 115, align: 'right' },
]
const businessCombinedColumns: Array<TableColumn<BusinessCombinedColumnKey>> = [
  { key: 'date', label: 'วัน', defaultWidth: 100, minWidth: 90 },
  { key: 'purchaseAmount', label: 'ซื้อ', defaultWidth: 125, minWidth: 110, align: 'right' },
  { key: 'saleAmount', label: 'ขาย', defaultWidth: 125, minWidth: 110, align: 'right' },
  { key: 'cogs', label: 'COGS', defaultWidth: 120, minWidth: 105, align: 'right' },
  { key: 'gp', label: 'GP', defaultWidth: 120, minWidth: 105, align: 'right' },
  { key: 'expenseAmount', label: 'ค่าใช้จ่าย', defaultWidth: 130, minWidth: 115, align: 'right' },
  { key: 'receiptAmount', label: 'รับเงิน', defaultWidth: 125, minWidth: 110, align: 'right' },
  { key: 'paymentAmount', label: 'จ่ายเงิน', defaultWidth: 125, minWidth: 110, align: 'right' },
  { key: 'netCash', label: 'เงินสดสุทธิ', defaultWidth: 130, minWidth: 115, align: 'right' },
  { key: 'arIncrease', label: 'AR เพิ่ม', defaultWidth: 120, minWidth: 105, align: 'right' },
  { key: 'apIncrease', label: 'AP เพิ่ม', defaultWidth: 120, minWidth: 105, align: 'right' },
]
const businessModeColumns: Record<Exclude<Mode, 'combined'>, Array<TableColumn<BusinessModeColumnKey>>> = {
  expense: [
    { key: 'date', label: 'วันที่จ่าย', defaultWidth: 120, minWidth: 105 },
    { key: 'docNo', label: 'เลขที่ EXP', defaultWidth: 140, minWidth: 120, align: 'right' },
    { key: 'category', label: 'หมวดค่าใช้จ่าย', defaultWidth: 190, minWidth: 150, align: 'right' },
    { key: 'payee', label: 'ผู้รับเงิน', defaultWidth: 190, minWidth: 150, align: 'right' },
    { key: 'amount', label: 'ยอดจ่าย', defaultWidth: 130, minWidth: 115, align: 'right' },
  ],
  purchase: [
    { key: 'date', label: 'วันที่เอกสาร', defaultWidth: 120, minWidth: 105 },
    { key: 'docNo', label: 'เลขที่ PB', defaultWidth: 150, minWidth: 125, align: 'right' },
    { key: 'qty', label: 'น้ำหนัก', defaultWidth: 125, minWidth: 110, align: 'right' },
    { key: 'amount', label: 'ยอดซื้อ', defaultWidth: 140, minWidth: 120, align: 'right' },
  ],
  sales: [
    { key: 'date', label: 'วันที่เอกสาร', defaultWidth: 120, minWidth: 105 },
    { key: 'docNo', label: 'เลขที่ SB', defaultWidth: 150, minWidth: 125, align: 'right' },
    { key: 'qty', label: 'น้ำหนัก', defaultWidth: 125, minWidth: 110, align: 'right' },
    { key: 'amount', label: 'ยอดขาย', defaultWidth: 140, minWidth: 120, align: 'right' },
    { key: 'cogs', label: 'COGS', defaultWidth: 130, minWidth: 115, align: 'right' },
    { key: 'gp', label: 'GP', defaultWidth: 130, minWidth: 115, align: 'right' },
  ],
}

function currentMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthIndex - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function money(value: unknown) {
  return formatMoney(typeof value === 'number' ? value : Number(value ?? 0))
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getBusinessCombinedSortValue(day: BusinessDay, key: BusinessCombinedColumnKey): string | number {
  if (key === 'date') return day.day
  return day[key]
}

function getBusinessModeSortValue(row: BusinessModeRow, key: BusinessModeColumnKey): string | number {
  return row[key] ?? ''
}

function getCashEntrySortValue(entry: CashEntry, key: CashEntryColumnKey): string | number {
  if (key === 'cashIn') return entry.in
  if (key === 'cashOut') return entry.out
  return entry[key]
}

function pct(value: number, max: number) {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

function dateLabel(date: string) {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

function compactMoney(value: number) {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000) return `${formatMoney(value / 1_000_000)}M`
  if (absolute >= 1_000) return `${formatMoney(value / 1_000)}K`
  return formatMoney(value)
}

function roundedAxisMax(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1)
  return Math.ceil(value / magnitude) * magnitude
}

export function CashFlowCalendarPageClient() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<CashPayload | null>(null)
  const [selectedDayDate, setSelectedDayDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    dailyFetchJson<CashPayload>(`/api/cash-flow-calendar?month=${month}`).then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
  }, [month])
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cash-day]') : null
      if (target?.dataset.cashDay) setSelectedDayDate(target.dataset.cashDay)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])
  const balances = data?.days.map((day) => day.ending) ?? []
  const minBalance = Math.min(0, ...balances)
  const maxBalance = Math.max(1, ...balances)
  const summary = data?.summary ?? {}
  const selectedDay = data?.days.find((day) => day.date === selectedDayDate) ?? null

  return (
    <section className="space-y-4">
      <MonthControls month={month} setMonth={setMonth} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="ยอดต้นเดือน" value={money(summary.openingCash)} tone="slate" />
        <Metric label="เงินเข้ารวม" value={money(summary.totalIn)} tone="emerald" />
        <Metric label="เงินออกรวม" value={money(summary.totalOut)} tone="red" />
        <Metric label="กระแสเงินสดสุทธิ" value={money((summary.totalIn ?? 0) - (summary.totalOut ?? 0))} tone={(summary.totalIn ?? 0) >= (summary.totalOut ?? 0) ? 'blue' : 'red'} />
        <Metric label="ยอดปลายเดือน" value={money(summary.endingCash)} tone="gradient" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="📈 เงินเข้า-ออกรายวัน">
          <DailyCashInOutChart days={data?.days ?? []} />
        </Panel>
        <Panel title="ยอดเงินคงเหลือสะสม">
          <RunningBalanceLineChart days={data?.days ?? []} maxBalance={maxBalance} minBalance={minBalance} />
        </Panel>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100 text-center text-xs font-bold text-slate-600">{weekdays.map((day, index) => <div key={day} className={`p-2.5 ${index === 0 || index === 6 ? 'text-red-500' : ''}`}>{day}</div>)}</div>
        {(data?.weeks ?? []).map((week, weekIndex) => <div key={weekIndex} className="grid grid-cols-7 border-t border-slate-100">{week.map((day, dayIndex) => day ? <button key={day.date} aria-label={`ดูรายการวันที่ ${day.date}`} className={`min-h-[110px] border-r border-slate-100 p-2 text-left text-xs transition hover:bg-slate-50/50 outline-none ${day.isNegative ? 'bg-red-50/30' : 'bg-white'} ${day.isToday ? 'ring-2 ring-amber-400 ring-inset' : ''}`} data-cash-day={day.date} type="button" onClick={() => setSelectedDayDate(day.date)} onPointerDown={() => setSelectedDayDate(day.date)}><div className="flex items-start justify-between"><span className={`font-bold ${day.weekday === 0 || day.weekday === 6 ? 'text-red-500' : 'text-slate-600'}`}>{day.day}</span>{day.entryCount ? <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-bold text-blue-700">{day.entryCount}</span> : null}</div><div className="mt-2 space-y-1 font-mono text-xs"><div className="text-emerald-700 font-semibold">↑ {money(day.cashIn)}</div><div className="text-red-700 font-semibold">↓ {money(day.cashOut)}</div><div className={`border-t border-slate-100 pt-1 font-bold ${day.ending < 0 ? 'text-red-600' : 'text-slate-700'}`}>{money(day.ending)}</div></div></button> : <div key={`empty-${weekIndex}-${dayIndex}`} className="min-h-[110px] border-r border-slate-100 bg-slate-50/50" />)}</div>)}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500"><Legend color="bg-emerald-500" text="เงินเข้า" /><Legend color="bg-red-500" text="เงินออก" /><Legend color="bg-red-100" text="ยอดติดลบ" /><Legend color="bg-amber-300" text="วันนี้" /><span>คลิกแต่ละวันเพื่อดูรายการละเอียด</span></div>
      {error ? <ErrorBox text={error} /> : null}
      {selectedDay ? <CashDayModal day={selectedDay} onClose={() => setSelectedDayDate('')} /> : null}
    </section>
  )
}

function RunningBalanceLineChart({ days, maxBalance, minBalance }: { days: CashDay[]; maxBalance: number; minBalance: number }) {
  const width = 640
  const height = 240
  const padding = { bottom: 34, left: 74, right: 18, top: 20 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const range = Math.max(1, maxBalance - minBalance)
  const ticks = Array.from({ length: 5 }, (_, index) => maxBalance - (range / 4) * index)
  const labelEvery = Math.max(1, Math.ceil(days.length / 6))
  const xFor = (index: number) => padding.left + (days.length <= 1 ? chartWidth / 2 : (chartWidth / (days.length - 1)) * index)
  const yFor = (value: number) => padding.top + chartHeight - ((value - minBalance) / range) * chartHeight
  const points = days.map((day, index) => ({ day, x: xFor(index), y: yFor(day.ending) }))
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const zeroY = yFor(0)

  if (days.length === 0) {
    return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">ไม่มีข้อมูลยอดเงินสะสมในช่วงนี้</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex gap-4">
          <Legend color="bg-blue-500" text="ยอดเงินสะสม" />
          <Legend color="bg-red-500" text="ยอดติดลบ" />
        </div>
        <div className="font-medium text-slate-500">เส้นประ = ระดับ 0 บาท</div>
      </div>
      <div className="rounded-md bg-white p-2">
        <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
          <div className="flex h-72 items-center justify-center text-xs font-bold text-slate-700 [writing-mode:vertical-rl] rotate-180">บาท</div>
          <svg aria-label="กราฟเส้นยอดเงินสะสม" className="h-72 w-full overflow-visible" preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
            <rect fill="var(--color-slate-50)" height={chartHeight} rx="8" width={chartWidth} x={padding.left} y={padding.top} />
            {ticks.map((tick, index) => (
              <g key={`${tick}-${index}`}>
                <line stroke="var(--color-slate-200)" x1={padding.left} x2={padding.left + chartWidth} y1={yFor(tick)} y2={yFor(tick)} />
                <text fill="var(--color-slate-500)" fontSize="12" textAnchor="end" x={padding.left - 10} y={yFor(tick) + 4}>
                  {compactMoney(tick)}
                </text>
              </g>
            ))}
            <line stroke="var(--color-slate-400)" strokeDasharray="5 5" x1={padding.left} x2={padding.left + chartWidth} y1={zeroY} y2={zeroY} />
            <text fill="var(--color-slate-500)" fontSize="12" textAnchor="end" x={padding.left + chartWidth - 8} y={zeroY - 6}>0 บาท</text>
            <path d={linePath} fill="none" stroke="var(--color-blue-600)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {points.map(({ day, x, y }, index) => (
              <g key={day.date}>
                <circle cx={x} cy={y} fill={day.ending < 0 ? 'var(--color-red-500)' : 'var(--color-blue-600)'} r="4">
                  <title>{`${dateLabel(day.date)} ยอดสะสม ${money(day.ending)}`}</title>
                </circle>
                {(days.length <= 8 || index % labelEvery === 0) ? (
                  <text fill="var(--color-slate-600)" fontSize="12" textAnchor="middle" x={x} y={height - 10}>
                    {dateLabel(day.date)}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}

function DailyCashInOutChart({ days }: { days: CashDay[] }) {
  const visibleDays = days.filter((day) => day.cashIn > 0 || day.cashOut > 0)
  const chartDays = visibleDays.length > 0 ? visibleDays : days
  const axisMax = roundedAxisMax(Math.max(1, ...chartDays.flatMap((day) => [day.cashIn, day.cashOut])) * 1.1)
  const ticks = Array.from({ length: 6 }, (_, index) => axisMax - (axisMax / 5) * index)
  const labelEvery = Math.max(1, Math.ceil(chartDays.length / 8))

  if (chartDays.length === 0) {
    return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">ไม่มีข้อมูลเงินเข้า/เงินออกในช่วงนี้</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-xs">
          <Legend color="bg-emerald-500" text="เงินเข้า" />
          <Legend color="bg-red-500" text="เงินออก" />
        </div>
        <div className="text-xs font-medium text-slate-500">แสดงเฉพาะวันที่มีเงินเข้า/เงินออก</div>
      </div>
      <div className="rounded-md bg-white p-2">
        <div className="grid grid-cols-[28px_72px_minmax(0,1fr)] gap-2">
          <div className="flex h-72 items-center justify-center text-xs font-bold text-slate-700 [writing-mode:vertical-rl] rotate-180">จำนวนเงิน (บาท)</div>
          <div className="relative h-72 text-xs font-medium text-slate-500">
            {ticks.map((tick, index) => (
              <div key={`${tick}-${index}`} className="absolute right-0 -translate-y-1/2 text-right tabular-nums" style={{ top: `${pct(axisMax - tick, axisMax)}%` }}>
                {compactMoney(tick)}
              </div>
            ))}
          </div>
          <div className="relative h-72 border-b border-l border-slate-300">
            {ticks.map((tick, index) => (
              <div key={`${tick}-${index}-line`} className="absolute inset-x-0 border-t border-slate-100" style={{ top: `${pct(axisMax - tick, axisMax)}%` }} />
            ))}
            <div className="absolute inset-x-3 bottom-0 top-5 flex items-end gap-2">
              {chartDays.map((day, index) => {
                const cashInHeight = pct(day.cashIn, axisMax)
                const cashOutHeight = pct(day.cashOut, axisMax)
                const showLabel = chartDays.length <= 10 || index % labelEvery === 0
                return (
                  <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-1" title={`${dateLabel(day.date)} เงินเข้า ${money(day.cashIn)} / เงินออก ${money(day.cashOut)}`}>
                    <span className="w-full max-w-5 rounded-t-md bg-emerald-500 transition group-hover:bg-emerald-600" style={{ height: day.cashIn > 0 ? `${Math.max(2, cashInHeight)}%` : 0 }} />
                    <span className="w-full max-w-5 rounded-t-md bg-red-500 transition group-hover:bg-red-600" style={{ height: day.cashOut > 0 ? `${Math.max(2, cashOutHeight)}%` : 0 }} />
                    {showLabel ? <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-slate-600">{dateLabel(day.date)}</span> : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function BusinessCalendarPageClient() {
  const [month, setMonth] = useState(currentMonth())
  const [mode, setMode] = useState<Mode>('combined')
  const [data, setData] = useState<BusinessPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    dailyFetchJson<BusinessPayload>(`/api/business-calendar?month=${month}`).then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
  }, [month])
  const summary = data?.summary ?? {}
  const maxBuySell = Math.max(1, ...(data?.days ?? []).flatMap((day) => [day.purchaseAmount, day.saleAmount]))
  const gpRows = (data?.days ?? []).reduce<Array<{ daily: number; date: string; running: number }>>((rows, day) => {
    const running = (rows.at(-1)?.running ?? 0) + day.gp
    return [...rows, { daily: day.gp, date: day.date, running }]
  }, [])
  const maxRunningGp = Math.max(1, ...gpRows.map((row) => Math.abs(row.running)))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <MonthControls month={month} setMonth={setMonth} />
        <Tabs className="gap-0" value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList aria-label="เลือกข้อมูลปฏิทินธุรกิจ" variant="line">
            <TabsTrigger value="combined" variant="line">ทั้งหมด</TabsTrigger>
            <TabsTrigger value="purchase" variant="line">ซื้อ</TabsTrigger>
            <TabsTrigger value="sales" variant="line">ขาย</TabsTrigger>
            <TabsTrigger value="expense" variant="line">ค่าใช้จ่าย</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
        <Metric label="ซื้อ" value={money(summary.purchaseAmount)} tone="blue" />
        <Metric label="ขาย" value={money(summary.saleAmount)} tone="emerald" />
        <Metric label="กำไรขั้นต้นจริง" value={money(summary.gp)} tone={(summary.gp ?? 0) >= 0 ? 'purple' : 'red'} />
        <Metric label="ค่าใช้จ่าย" value={money(summary.expenseAmount)} tone="red" />
        <Metric label="รับเงิน" value={money(summary.receiptAmount)} tone="emerald" />
        <Metric label="จ่ายเงิน" value={money(summary.paymentAmount)} tone="red" />
        <Metric label="เงินสดสุทธิ" value={money(summary.netCash)} tone="gradient" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="📈 ซื้อ vs ขาย รายวัน">
          <div className="mb-3 flex gap-4 text-xs text-slate-500"><Legend color="bg-blue-500" text="ซื้อ" /><Legend color="bg-emerald-500" text="ขาย" /></div>
          <div className="flex h-48 items-end gap-1 border-b border-l border-slate-100 px-2 pb-1 bg-slate-50/20 rounded-b-lg">
            {(data?.days ?? []).map((day) => <div key={day.date} className="flex h-full flex-1 items-end justify-center gap-0.5"><span className="w-1.5 rounded-t bg-blue-500" style={{ height: `${pct(day.purchaseAmount, maxBuySell)}%` }} /><span className="w-1.5 rounded-t bg-emerald-500" style={{ height: `${pct(day.saleAmount, maxBuySell)}%` }} /></div>)}
          </div>
        </Panel>
        <Panel title="💰 GP สะสมรายวัน">
          <div className="mb-3 text-xs text-slate-500">เส้นม่วง = GP สะสม · แท่งสีจาง = GP รายวัน</div>
          <div className="flex h-48 items-end gap-1 border-b border-l border-slate-100 bg-slate-50 px-2 pb-1 bg-slate-50/20 rounded-b-lg">
            {gpRows.map((row) => <div key={row.date} className="relative flex h-full flex-1 items-end"><span className="w-full rounded-t bg-purple-200/50" style={{ height: `${pct(Math.abs(row.daily), maxRunningGp)}%` }} /><span className="absolute bottom-0 left-1/2 w-1 -translate-x-1/2 rounded-t bg-purple-600" style={{ height: `${pct(Math.abs(row.running), maxRunningGp)}%` }} /></div>)}
          </div>
        </Panel>
      </div>
      {mode === 'combined' ? <BusinessCombinedTable days={data?.days ?? []} /> : <BusinessModeTable days={data?.days ?? []} mode={mode} />}
      {error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function MonthControls({ month, setMonth }: { month: string; setMonth: (month: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 outline-none" type="button" onClick={() => setMonth(shiftMonth(month, -1))}>← เดือนก่อน</button>
      <input className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 outline-none" type="button" onClick={() => setMonth(shiftMonth(month, 1))}>เดือนถัดไป →</button>
    </div>
  )
}

function BusinessCombinedTable({ days }: { days: BusinessDay[] }) {
  const [sortKey, setSortKey] = useState<BusinessCombinedColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('main.business-calendar.combined.v1', businessCombinedColumns)
  const sortedDays = useMemo(() => {
    if (!sortKey) return days

    return [...days].sort((left, right) => {
      const result = compareSortValues(getBusinessCombinedSortValue(left, sortKey), getBusinessCombinedSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [days, sortDirection, sortKey])

  function changeSort(key: BusinessCombinedColumnKey) {
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
          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-normal text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
        </div>
      ) : null}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {businessCombinedColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              {businessCombinedColumns.map((column) => (
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
            {sortedDays.map((day) => <tr key={day.date} className={`transition-colors hover:bg-slate-50 ${day.isWeekend ? 'bg-red-50/20' : ''} ${day.purchaseAmount + day.saleAmount + day.expenseAmount + day.receiptAmount + day.paymentAmount === 0 ? 'opacity-60' : ''}`}>
              {businessCombinedColumns.map((column) => (
                <td key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left font-semibold'} ${businessCombinedCellTone(day, column.key)}`}>
                  {column.key === 'date' ? (
                    <div className="flex items-center gap-2">
                      <span>{day.day}</span>
                      {day.isToday ? <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-bold text-yellow-800">วันนี้</span> : null}
                    </div>
                  ) : (
                    <span className="whitespace-nowrap">{money(day[column.key])}</span>
                  )}
                </td>
              ))}
            </tr>)}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[600px] overflow-y-auto">
        {sortedDays.map((day) => (
          <div key={day.date} className={`p-3 rounded-xl border mb-2 shadow-sm flex flex-col gap-1.5 text-xs bg-white ${day.isWeekend ? 'border-red-100 bg-red-50/20' : 'border-slate-100'} ${day.purchaseAmount + day.saleAmount + day.expenseAmount + day.receiptAmount + day.paymentAmount === 0 ? 'opacity-75' : ''}`}>
            <div className="flex justify-between items-center pb-1 border-b border-slate-50">
              <span className="font-bold text-slate-800">วันที่ {day.day}</span>
              {day.isToday && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-bold text-yellow-800">วันนี้</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1 text-xs font-mono text-slate-600">
              <div>📥 ซื้อ: <span className="font-bold text-slate-900">{money(day.purchaseAmount)}</span></div>
              <div>📤 ขาย: <span className="font-bold text-slate-900">{money(day.saleAmount)}</span></div>
              <div>COGS: <span className="font-bold text-slate-600">{money(day.cogs)}</span></div>
              <div>💎 GP: <span className={`font-bold ${day.gp >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(day.gp)}</span></div>
              <div>💸 ค่าใช้จ่าย: <span className="font-bold text-red-600">{money(day.expenseAmount)}</span></div>
              <div>💰 รับ: <span className="font-bold text-emerald-600">{money(day.receiptAmount)}</span></div>
              <div>💸 จ่าย: <span className="font-bold text-red-600">{money(day.paymentAmount)}</span></div>
              <div>เงินสดสุทธิ: <span className={`font-bold ${day.netCash >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{money(day.netCash)}</span></div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1 pt-1.5 border-t border-slate-50">
              <span>AR เพิ่ม: {money(day.arIncrease)}</span>
              <span>AP เพิ่ม: {money(day.apIncrease)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function businessCombinedCellTone(day: BusinessDay, key: BusinessCombinedColumnKey) {
  if (key === 'purchaseAmount') return 'text-blue-700'
  if (key === 'saleAmount' || key === 'receiptAmount') return 'text-emerald-700'
  if (key === 'expenseAmount' || key === 'paymentAmount') return 'text-red-700'
  if (key === 'gp' || key === 'netCash') return day[key] >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-700'
  if (key === 'date') return 'text-slate-700'
  return 'text-slate-700'
}

function BusinessModeTable({ days, mode }: { days: BusinessDay[]; mode: Exclude<Mode, 'combined'> }) {
  const config = {
    expense: { docs: (day: BusinessDay) => day.expenseDocs, title: '💸 มุมมองค่าใช้จ่าย' },
    purchase: { docs: (day: BusinessDay) => day.purchaseDocs, title: '📥 มุมมองซื้อ' },
    sales: { docs: (day: BusinessDay) => day.saleDocs, title: '📤 มุมมองขาย' },
  }[mode]
  const columns = businessModeColumns[mode]
  const [sortKey, setSortKey] = useState<BusinessModeColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns(`main.business-calendar.${mode}.v1`, columns)
  const rows = useMemo(() => days.flatMap((day) => config.docs(day).map((doc) => ({ ...doc, date: day.date }))), [config, days])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getBusinessModeSortValue(left, sortKey), getBusinessModeSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  function changeSort(key: BusinessModeColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <Panel title={config.title}>
      {/* Desktop view */}
      {columnResize.hasCustomWidths ? (
        <div className="mb-2 hidden justify-end lg:flex">
          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-normal text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
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
            {sortedRows.map((row) => <tr key={`${mode}-${row.id}`} className="transition-colors hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left'} ${businessModeCellTone(mode, row, column.key)}`}>
                  <div className={column.align === 'right' ? 'whitespace-nowrap' : 'truncate'} title={String(formatBusinessModeCell(row, column.key))}>{formatBusinessModeCell(row, column.key)}</div>
                </td>
              ))}
            </tr>)}
            {sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400 text-xs" colSpan={columns.length}>ไม่มีข้อมูล</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[500px] overflow-y-auto rounded-xl">
        {sortedRows.map((doc) => (
          <div key={`${mode}-${doc.id}`} className="p-3 bg-white rounded-xl border border-slate-100 mb-2 shadow-sm flex flex-col gap-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800">{doc.docNo}</span>
              <span className="text-slate-500 text-xs">{doc.date}</span>
            </div>
            {mode === 'expense' && (
              <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-slate-600">
                <div>หมวด: {doc.category ?? '-'}</div>
                <div>ผู้รับ: {doc.payee ?? '-'}</div>
                <div className="col-span-2 text-right font-bold text-red-600 mt-1 text-sm font-mono">{money(doc.amount)}</div>
              </div>
            )}
            {mode === 'purchase' && (
              <div className="flex justify-between items-center mt-1 text-xs text-slate-600">
                <span>น้ำหนัก: {money(doc.qty)} กก.</span>
                <span className="font-bold text-blue-600 font-mono text-sm">{money(doc.amount)}</span>
              </div>
            )}
            {mode === 'sales' && (
              <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-slate-600 font-mono">
                <div>น้ำหนัก: {money(doc.qty)} กก.</div>
                <div className="text-right text-emerald-600 font-bold">ยอดขาย: {money(doc.amount)}</div>
                <div>COGS: {money(doc.cogs)}</div>
                <div className={`text-right font-bold ${doc.gp && doc.gp >= 0 ? 'text-purple-600' : 'text-red-600'}`}>GP: {money(doc.gp)}</div>
              </div>
            )}
          </div>
        ))}
        {sortedRows.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>
        )}
      </div>
    </Panel>
  )
}

function formatBusinessModeCell(row: BusinessModeRow, key: BusinessModeColumnKey) {
  if (key === 'amount' || key === 'cogs' || key === 'gp' || key === 'qty') return money(row[key])
  return row[key] ?? '-'
}

function businessModeCellTone(mode: Exclude<Mode, 'combined'>, row: BusinessModeRow, key: BusinessModeColumnKey) {
  if (key === 'amount') {
    if (mode === 'expense') return 'font-bold text-red-700'
    if (mode === 'purchase') return 'font-bold text-blue-700'
    return 'font-bold text-emerald-700'
  }
  if (key === 'gp') return (row.gp ?? 0) >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-700'
  if (key === 'docNo') return 'font-mono font-semibold text-slate-700'
  return 'text-slate-700'
}

function CashDayModal({ day, onClose }: { day: CashDay; onClose: () => void }) {
  const [sortKey, setSortKey] = useState<CashEntryColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('main.cash-flow-calendar.day-entries.v1', cashEntryColumns)
  const sortedEntries = useMemo(() => {
    if (!sortKey) return day.entries

    return [...day.entries].sort((left, right) => {
      const result = compareSortValues(getCashEntrySortValue(left, sortKey), getCashEntrySortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [day.entries, sortDirection, sortKey])

  function changeSort(key: CashEntryColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-md bg-slate-900 shadow-2xl border-0">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 p-4 text-white">
          <h2 className="font-bold text-sm sm:text-base">รายการวันที่ {day.date}</h2>
          <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="space-y-4 overflow-y-auto bg-slate-50 p-4 max-h-[calc(85vh-80px)]">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="เงินเข้า" value={money(day.cashIn)} tone="emerald" />
            <Metric label="เงินออก" value={money(day.cashOut)} tone="red" />
            <Metric label="ยอดปลายวัน" value={money(day.ending)} tone={day.ending >= 0 ? 'blue' : 'red'} />
          </div>
          
          {/* Desktop Table View */}
          {columnResize.hasCustomWidths ? (
            <div className="mb-2 hidden justify-end sm:flex">
              <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-normal text-slate-600 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
            </div>
          ) : null}
          <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm sm:block">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {cashEntryColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  {cashEntryColumns.map((column) => (
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
                {sortedEntries.map((entry) => <tr key={entry.id} className="transition-colors hover:bg-slate-50">
                  {cashEntryColumns.map((column) => (
                    <td key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left'} ${cashEntryCellTone(column.key)}`}>
                      <div className={column.align === 'right' ? 'whitespace-nowrap' : 'truncate'} title={String(formatCashEntryCell(entry, column.key))}>{formatCashEntryCell(entry, column.key)}</div>
                    </td>
                  ))}
                </tr>)}
                {sortedEntries.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={cashEntryColumns.length}>ไม่มีรายการ</td></tr> : null}
              </tbody>
            </table>
          </div>

          {/* Mobile view inside Modal */}
          <div className="block sm:hidden divide-y divide-slate-100 bg-slate-50/30 p-2 max-h-[300px] overflow-y-auto rounded-xl">
            {sortedEntries.map((entry) => (
              <div key={entry.id} className="p-2.5 bg-white rounded-xl border border-slate-100 mb-1.5 last:mb-0 shadow-sm flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-slate-800">{entry.description || entry.type}</span>
                  <span className="font-mono text-xs text-slate-400">{entry.refNo}</span>
                </div>
                <div className="text-slate-500 text-xs">บัญชี: {entry.account}</div>
                <div className="flex justify-end gap-3 mt-1.5 font-mono text-xs">
                  {entry.in > 0 && <span className="text-emerald-600 font-bold">เข้า: +{money(entry.in)}</span>}
                  {entry.out > 0 && <span className="text-red-600 font-bold">ออก: -{money(entry.out)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatCashEntryCell(entry: CashEntry, key: CashEntryColumnKey) {
  if (key === 'cashIn') return money(entry.in)
  if (key === 'cashOut') return money(entry.out)
  return entry[key]
}

function cashEntryCellTone(key: CashEntryColumnKey) {
  if (key === 'cashIn') return 'font-semibold text-emerald-700'
  if (key === 'cashOut') return 'font-semibold text-red-700'
  if (key === 'refNo') return 'font-mono text-slate-600'
  return 'text-slate-700'
}

function Metric({ label, tone, value }: { label: string; tone: KpiCardTone; value: string }) {
  return <SharedKpiCard label={label} tone={tone} value={value} />
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50/50 p-3 text-sm font-bold text-slate-700">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{text}</span>
}

function ErrorBox({ text }: { text: string }) {
  return <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 text-sm text-red-800">{text}</div>
}
