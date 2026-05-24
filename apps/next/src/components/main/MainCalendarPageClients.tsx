'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

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

const weekdays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']

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

function pct(value: number, max: number) {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
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
  const maxFlow = Math.max(1, ...(data?.days ?? []).flatMap((day) => [day.cashIn, day.cashOut]))
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
        <Metric label="Net Cash Flow" value={money((summary.totalIn ?? 0) - (summary.totalOut ?? 0))} tone={(summary.totalIn ?? 0) >= (summary.totalOut ?? 0) ? 'blue' : 'red'} />
        <Metric label="ยอดปลายเดือน" value={money(summary.endingCash)} tone="gradient" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="📈 เงินเข้า-ออกรายวัน">
          <div className="mb-3 flex gap-4 text-xs"><Legend color="bg-emerald-500" text="เงินเข้า" /><Legend color="bg-red-500" text="เงินออก" /></div>
          <div className="flex h-48 items-end gap-1 border-b border-l border-slate-200 px-2">
            {(data?.days ?? []).map((day) => <div key={day.date} className="flex h-full flex-1 items-end justify-center gap-0.5"><span className="w-1.5 rounded-md-t bg-emerald-500" style={{ height: `${pct(day.cashIn, maxFlow)}%` }} /><span className="w-1.5 rounded-md-t bg-red-500" style={{ height: `${pct(day.cashOut, maxFlow)}%` }} /></div>)}
          </div>
        </Panel>
        <Panel title="📈 ยอดเงินสะสม (Running Balance)">
          <div className="mb-3 text-xs text-slate-500">เส้นประ = ระดับ 0 บาท · จุดแดง = ติดลบ</div>
          <div className="relative h-48 overflow-hidden rounded-md bg-slate-50">
            <div className="absolute left-0 right-0 border-t border-dashed border-slate-400" style={{ top: `${100 - pct(0 - minBalance, maxBalance - minBalance)}%` }} />
            <div className="absolute inset-2 flex items-end gap-1">
              {(data?.days ?? []).map((day) => <span key={day.date} className={`flex-1 rounded-md-t ${day.ending < 0 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ height: `${pct(day.ending - minBalance, maxBalance - minBalance)}%` }} title={`${day.date} ${money(day.ending)}`} />)}
            </div>
          </div>
        </Panel>
      </div>
      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="grid grid-cols-7 bg-slate-100 text-center text-xs font-bold text-slate-700">{weekdays.map((day, index) => <div key={day} className={`p-2 ${index === 0 || index === 6 ? 'text-red-600' : ''}`}>{day}</div>)}</div>
        {(data?.weeks ?? []).map((week, weekIndex) => <div key={weekIndex} className="grid grid-cols-7 border-t">{week.map((day, dayIndex) => day ? <button key={day.date} aria-label={`ดูรายการวันที่ ${day.date}`} className={`min-h-[110px] border-r p-2 text-left text-xs transition hover:bg-blue-50 ${day.isNegative ? 'bg-red-50' : 'bg-white'} ${day.isToday ? 'ring-2 ring-yellow-300 ring-inset' : ''}`} data-cash-day={day.date} type="button" onClick={() => setSelectedDayDate(day.date)} onPointerDown={() => setSelectedDayDate(day.date)}><div className="flex items-start justify-between"><span className={`font-bold ${day.weekday === 0 || day.weekday === 6 ? 'text-red-600' : 'text-slate-700'}`}>{day.day}</span>{day.entryCount ? <span className="rounded-md-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{day.entryCount}</span> : null}</div><div className="mt-2 space-y-1"><div className="text-emerald-700">↑ {money(day.cashIn)}</div><div className="text-red-700">↓ {money(day.cashOut)}</div><div className={`border-t pt-1 font-bold ${day.ending < 0 ? 'text-red-700' : 'text-slate-700'}`}>{money(day.ending)}</div></div></button> : <div key={`empty-${weekIndex}-${dayIndex}`} className="min-h-[110px] border-r bg-slate-50" />)}</div>)}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600"><Legend color="bg-emerald-500" text="เงินเข้า" /><Legend color="bg-red-500" text="เงินออก" /><Legend color="bg-red-100" text="ยอดติดลบ" /><Legend color="bg-yellow-200" text="วันนี้" /><span>คลิกแต่ละวันเพื่อดูรายการละเอียด</span></div>
      <Notice text={data?.sourceState.limitations[0]} />{error ? <ErrorBox text={error} /> : null}
      {selectedDay ? <CashDayModal day={selectedDay} onClose={() => setSelectedDayDate('')} /> : null}
    </section>
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
      <div className="flex flex-wrap items-center gap-2">
        <MonthControls month={month} setMonth={setMonth} />
        <div className="flex flex-wrap gap-2 rounded-md bg-white p-2 shadow">{(['combined', 'purchase', 'sales', 'expense'] as Mode[]).map((item) => <ModeButton key={item} active={mode === item} mode={item} onClick={() => setMode(item)} />)}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
        <Metric label="ซื้อ" value={money(summary.purchaseAmount)} tone="blue" />
        <Metric label="ขาย" value={money(summary.saleAmount)} tone="emerald" />
        <Metric label="Actual GP" value={money(summary.gp)} tone={(summary.gp ?? 0) >= 0 ? 'purple' : 'red'} />
        <Metric label="ค่าใช้จ่าย" value={money(summary.expenseAmount)} tone="red" />
        <Metric label="รับเงิน" value={money(summary.receiptAmount)} tone="emerald" />
        <Metric label="จ่ายเงิน" value={money(summary.paymentAmount)} tone="red" />
        <Metric label="Net Cash" value={money(summary.netCash)} tone="gradient" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="📈 ซื้อ vs ขาย รายวัน">
          <div className="mb-3 flex gap-4 text-xs"><Legend color="bg-blue-500" text="ซื้อ" /><Legend color="bg-emerald-500" text="ขาย" /></div>
          <div className="flex h-48 items-end gap-1 border-b border-l border-slate-200 px-2">
            {(data?.days ?? []).map((day) => <div key={day.date} className="flex h-full flex-1 items-end justify-center gap-0.5"><span className="w-1.5 rounded-md-t bg-blue-500" style={{ height: `${pct(day.purchaseAmount, maxBuySell)}%` }} /><span className="w-1.5 rounded-md-t bg-emerald-500" style={{ height: `${pct(day.saleAmount, maxBuySell)}%` }} /></div>)}
          </div>
        </Panel>
        <Panel title="💰 GP สะสมรายวัน">
          <div className="mb-3 text-xs text-slate-500">เส้นม่วง = GP สะสม · แท่งสีจาง = GP รายวัน</div>
          <div className="flex h-48 items-end gap-1 border-b border-l border-slate-200 bg-slate-50 px-2">
            {gpRows.map((row) => <div key={row.date} className="relative flex h-full flex-1 items-end"><span className="w-full rounded-md-t bg-purple-200" style={{ height: `${pct(Math.abs(row.daily), maxRunningGp)}%` }} /><span className="absolute bottom-0 left-1/2 w-1 -translate-x-1/2 rounded-md-t bg-purple-700" style={{ height: `${pct(Math.abs(row.running), maxRunningGp)}%` }} /></div>)}
          </div>
        </Panel>
      </div>
      {mode === 'combined' ? <BusinessCombinedTable days={data?.days ?? []} /> : <BusinessModeTable days={data?.days ?? []} mode={mode} />}
      <Notice text={data?.sourceState.limitations[0]} />{error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function MonthControls({ month, setMonth }: { month: string; setMonth: (month: string) => void }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow"><button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700" type="button" onClick={() => setMonth(shiftMonth(month, -1))}>← เดือนก่อน</button><input className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700" type="button" onClick={() => setMonth(shiftMonth(month, 1))}>เดือนถัดไป →</button></div>
}

function BusinessCombinedTable({ days }: { days: BusinessDay[] }) {
  return <div className="overflow-x-auto rounded-md bg-white shadow"><table className="w-full min-w-[1040px] text-xs"><thead className="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-900 text-white"><tr>{['วัน', '📥 ซื้อ', '📤 ขาย', 'COGS', '💎 GP', '💸 ค่าใช้จ่าย', '💰 รับ', '💸 จ่าย', '📊 Net Cash', 'AR+', 'AP+'].map((header) => <th key={header} className="p-2 text-right first:text-left">{header}</th>)}</tr></thead><tbody>{days.map((day) => <tr key={day.date} className={`border-t ${day.isWeekend ? 'bg-red-50/40' : ''} ${day.purchaseAmount + day.saleAmount + day.expenseAmount + day.receiptAmount + day.paymentAmount === 0 ? 'opacity-60' : ''}`}><td className="p-2 text-left font-bold">{day.day} {day.isToday ? <span className="rounded-md bg-yellow-200 px-1 text-[10px] text-yellow-900">วันนี้</span> : null}</td><Amount value={day.purchaseAmount} /><Amount value={day.saleAmount} /><Amount value={day.cogs} /><Amount value={day.gp} signed /><Amount value={day.expenseAmount} /><Amount value={day.receiptAmount} /><Amount value={day.paymentAmount} /><Amount value={day.netCash} signed /><Amount value={day.arIncrease} /><Amount value={day.apIncrease} /></tr>)}</tbody></table></div>
}

function BusinessModeTable({ days, mode }: { days: BusinessDay[]; mode: Exclude<Mode, 'combined'> }) {
  const config = {
    expense: { docs: (day: BusinessDay) => day.expenseDocs, headers: ['วันที่', 'เลขที่', 'หมวด', 'ผู้รับเงิน', 'ยอด'], title: '💸 Expense View' },
    purchase: { docs: (day: BusinessDay) => day.purchaseDocs, headers: ['วันที่', 'เลขที่', 'น้ำหนัก', 'ยอดซื้อ'], title: '📥 Purchase View' },
    sales: { docs: (day: BusinessDay) => day.saleDocs, headers: ['วันที่', 'เลขที่', 'น้ำหนัก', 'ยอดขาย', 'COGS', 'GP'], title: '📤 Sales View' },
  }[mode]
  const rows = days.flatMap((day) => config.docs(day).map((doc) => ({ day, doc })))
  return <Panel title={config.title}><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead className="bg-slate-100"><tr>{config.headers.map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead><tbody>{rows.map(({ day, doc }) => <tr key={`${mode}-${doc.id}`} className="border-t"><td className="p-2">{day.date}</td><td className="p-2">{doc.docNo}</td>{mode === 'expense' ? <><td className="p-2">{doc.category ?? '-'}</td><td className="p-2">{doc.payee ?? '-'}</td><td className="p-2 text-right">{money(doc.amount)}</td></> : null}{mode === 'purchase' ? <><td className="p-2 text-right">{money(doc.qty)}</td><td className="p-2 text-right">{money(doc.amount)}</td></> : null}{mode === 'sales' ? <><td className="p-2 text-right">{money(doc.qty)}</td><td className="p-2 text-right">{money(doc.amount)}</td><td className="p-2 text-right">{money(doc.cogs)}</td><td className="p-2 text-right">{money(doc.gp)}</td></> : null}</tr>)}{rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={config.headers.length}>ไม่มีข้อมูล</td></tr> : null}</tbody></table></div></Panel>
}

function CashDayModal({ day, onClose }: { day: CashDay; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-md bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><h2 className="font-bold text-slate-800">รายการวันที่ {day.date}</h2><button className="rounded-md bg-slate-100 px-3 py-1 text-sm" type="button" onClick={onClose}>ปิด</button></div><div className="space-y-3 overflow-y-auto p-4"><div className="grid grid-cols-3 gap-3"><Metric label="เงินเข้า" value={money(day.cashIn)} tone="emerald" /><Metric label="เงินออก" value={money(day.cashOut)} tone="red" /><Metric label="ยอดปลายวัน" value={money(day.ending)} tone={day.ending >= 0 ? 'blue' : 'red'} /></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="bg-slate-100"><tr>{['ประเภท', 'รายละเอียด', 'บัญชี', 'Ref', 'เข้า', 'ออก'].map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead><tbody>{day.entries.map((entry) => <tr key={entry.id} className="border-t"><td className="p-2">{entry.type}</td><td className="p-2">{entry.description}</td><td className="p-2">{entry.account}</td><td className="p-2">{entry.refNo}</td><td className="p-2 text-right text-emerald-700">{money(entry.in)}</td><td className="p-2 text-right text-red-700">{money(entry.out)}</td></tr>)}{day.entries.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={6}>ไม่มีรายการ</td></tr> : null}</tbody></table></div></div></div></div>
}

function Metric({ label, tone, value }: { label: string; tone: string; value: string }) {
  const map: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    gradient: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-white text-slate-700',
  }
  return <div className={`rounded-md p-3 shadow ${map[tone] ?? map.slate}`}><div className="text-xs opacity-75">{label}</div><div className="break-words text-xl font-bold">{value}</div></div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow"><div className="border-b bg-slate-50 p-3 text-sm font-bold text-slate-700">{title}</div><div className="p-3">{children}</div></div>
}

function Legend({ color, text }: { color: string; text: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded-md ${color}`} />{text}</span>
}

function ModeButton({ active, mode, onClick }: { active: boolean; mode: Mode; onClick: () => void }) {
  const label: Record<Mode, string> = { combined: 'Combined', expense: 'Expense', purchase: 'Purchase', sales: 'Sales' }
  const activeClass: Record<Mode, string> = { combined: 'bg-purple-600 text-white', expense: 'bg-red-600 text-white', purchase: 'bg-blue-600 text-white', sales: 'bg-emerald-600 text-white' }
  return <button className={`rounded-md px-3 py-2 text-sm font-bold ${active ? activeClass[mode] : 'bg-white text-slate-600 shadow-sm'}`} type="button" onClick={onClick} onPointerDown={onClick}>{label[mode]}</button>
}

function Amount({ signed = false, value }: { signed?: boolean; value: number }) {
  const color = signed ? value >= 0 ? 'text-emerald-700' : 'text-red-700' : 'text-slate-700'
  return <td className={`p-2 text-right ${color}`}>{money(value)}</td>
}

function Notice({ text }: { text?: string }) {
  return <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"><b>Read-only baseline</b><span className="ml-2">{text ?? 'ไม่มี write action ใน baseline นี้'}</span></div>
}

function ErrorBox({ text }: { text: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{text}</div>
}
