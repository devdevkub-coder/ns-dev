'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }
type Insight = { body: string; explain: string; title: string; type: 'danger' | 'ok' | 'warn' }

type AnalysisPayload = {
  branches: BranchRow[]
  charts: {
    profitVsCash: { amount: number; label: string; tone: string }[]
    projection: { expectedIn: number; expectedOut: number; label: string; projected: number }[]
    trap: { ar: number; cash: number; stock: number }
  }
  detailRows: { label: string; suffix?: string; tone?: string; value: number }[]
  filters: { branchId: string; from: string; to: string }
  insights: Insight[]
  sourceState: SourceState
  summary: {
    apNow: number
    arNow: number
    burnRate: number
    cashIn7: number
    cashIn30: number
    cashNow: number
    cashOut7: number
    cashOut30: number
    daysToODMaxed: number
    netProfit: number
    odLimit: number
    odUsed: number
    operatingCashFlow: number
    projected7: number
    projected30: number
    stockNow: number
  }
}

type ForecastEvent = { amount: number; date: string; inOut: 'IN' | 'OUT'; label: string; overdue?: boolean; refNo: string; type: string }
type ProjectionDay = { closing: number; date: string; dayIn: number; dayOfMonth: number; dayOfWeek: number; dayOut: number; events: ForecastEvent[]; isToday: boolean; opening: number }
type ForecastPayload = {
  branches: BranchRow[]
  dailyProjection: ProjectionDay[]
  events: ForecastEvent[]
  filters: { branchId: string; horizon: number; startDate: string }
  insights: {
    topAP: { daysToDue: number; docNo: string; dueDate: string; id: string; payableBalance: number; supplierName: string }[]
    topAR: { customerName: string; daysOverdue: number; docNo: string; dueDate: string; id: string; receivableBalance: number }[]
  }
  sourceState: SourceState
  summary: { endCash: number; lowestBal: number; negCount: number; negDay: { closing: number; date: string } | null; startCash: number; totalIn: number; totalOut: number }
}

function today() {
  return localDateInputValue(new Date())
}

function monthStart() {
  const now = new Date()
  return localDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
}

function localDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CashFlowAnalysisPageClient() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/cash-flow-analysis?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, to])
  const { data, error, isLoading } = useApi<AnalysisPayload>(url)
  const maxProfit = Math.max(Math.abs(data?.summary.netProfit ?? 0), Math.abs(data?.summary.operatingCashFlow ?? 0), 1)

  return (
    <section className="space-y-4">
      <Hero subtitle="ตอบ 6 คำถามสำคัญ: กำไร vs เงินสด · Stock/AR Trap · Collection Rate · OD Forecast" title="🔍 Cash Flow Analysis / วิเคราะห์เชิงลึก" tone="analysis" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
      </FilterPanel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="📊 กำไร vs เงินสดจริง">
          <Bar label="Net Profit (Accrual)" max={maxProfit} tone="emerald" value={data?.summary.netProfit ?? 0} />
          <Bar label="Operating Cash Flow" max={maxProfit} tone="blue" value={data?.summary.operatingCashFlow ?? 0} />
          <div className="flex justify-between border-t pt-2 text-sm font-bold text-amber-700"><span>ส่วนต่าง (NP - OCF)</span><span>{money((data?.summary.netProfit ?? 0) - (data?.summary.operatingCashFlow ?? 0))}</span></div>
        </Panel>
        <Panel title="🪤 เงินจมที่ไหน"><TrapDonut ar={data?.summary.arNow ?? 0} cash={data?.summary.cashNow ?? 0} stock={data?.summary.stockNow ?? 0} /></Panel>
        <Panel title="🔥 Burn Rate & OD Status">
          <Bar label="⚠ OD ใช้แล้ว" max={Math.max(data?.summary.odLimit ?? 1, 1)} tone="emerald" value={data?.summary.odUsed ?? 0} />
          <div className="rounded-md bg-slate-50 p-3 text-center"><div className="text-xs text-slate-500">🔥 Burn Rate (เฉลี่ย/วัน)</div><div className="text-2xl font-bold text-rose-600">{money(data?.summary.burnRate)}</div><div className="text-xs text-slate-400">บาท/วัน</div></div>
          <div className="mt-3 rounded-md bg-emerald-50 p-3 text-center"><div className="text-xs text-emerald-700">⏰ OD จะเต็มวงเงินใน</div><div className="text-2xl font-bold text-emerald-700">{Math.round(data?.summary.daysToODMaxed ?? 0)} วัน</div></div>
        </Panel>
      </div>
      <Panel title="📈 Cash Projection (ปัจจุบัน → 7 วัน → 30 วัน)">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{(data?.charts.projection ?? []).map((row, index) => <ProjectionCard key={row.label} index={index} row={row} />)}</div>
      </Panel>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{(data?.insights ?? []).map((insight) => <InsightCard insight={insight} key={insight.title} />)}</div>
      <DetailTable isLoading={isLoading} rows={data?.detailRows ?? []} />
    </section>
  )
}

export function CashFlowForecastCalendarPageClient() {
  const [horizon, setHorizon] = useState(30)
  const [startDate, setStartDate] = useState(today())
  const [branchId, setBranchId] = useState('')
  const [modal, setModal] = useState<ProjectionDay | null>(null)
  const url = useMemo(() => `/api/finance-accounting/cf-forecast-calendar?startDate=${startDate}&horizon=${horizon}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, horizon, startDate])
  const { data, error, isLoading } = useApi<ForecastPayload>(url)

  return (
    <section className="space-y-4">
      <Hero subtitle="พยากรณ์เงินสดรายวัน · Expected Receipt/Payment · Loan/Tax/Payroll Due · เห็นวันเงินติดลบ" title="📅 Cash Flow Forecast Calendar" tone="forecast" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <span className="text-sm font-bold">Forecast:</span>
        {[7, 30, 90].map((item) => <button key={item} className={`rounded-md px-3 py-1.5 text-sm font-medium ${horizon === item ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} type="button" onClick={() => setHorizon(item)}>{item} วัน</button>)}
        <DateInput label="เริ่ม" value={startDate} onChange={setStartDate} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className="text-xs text-slate-500">เริ่มจาก {money(data?.summary.startCash)} → จบที่ {money(data?.summary.endCash)}</span>
      </FilterPanel>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ForecastMega summary={data?.summary} horizon={horizon} />
        <div className="col-span-1 rounded-md bg-white p-4 shadow md:col-span-2"><div className="mb-3 text-sm font-bold text-slate-700">📈 พยากรณ์เงินสดรายวัน ({horizon} วันข้างหน้า)</div><ProjectionSvg days={data?.dailyProjection ?? []} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="เงินสดเริ่มต้น" tone="blue" value={money(data?.summary.startCash)} />
        <Stat label="Expected In" tone="emerald" value={`+${money(data?.summary.totalIn)}`} />
        <Stat label="Expected Out" tone="red" value={`-${money(data?.summary.totalOut)}`} />
        <Stat label="เงินสดสิ้นสุด" tone={(data?.summary.endCash ?? 0) >= 0 ? 'emerald' : 'red'} value={money(data?.summary.endCash)} />
        <Stat label="⚠ ยอดต่ำสุด" tone={(data?.summary.lowestBal ?? 0) >= 0 ? 'emerald' : 'red'} value={money(data?.summary.lowestBal)} />
      </div>
      {data?.summary.negDay ? <div className="rounded-md border-2 border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700">⚠ เงินสดจะติดลบในวันที่ {data.summary.negDay.date} (ยอด {money(data.summary.negDay.closing)}) · {data.summary.negCount} วัน</div> : null}
      <CalendarGrid days={data?.dailyProjection ?? []} isLoading={isLoading} onSelect={setModal} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><TopAr rows={data?.insights.topAR ?? []} /><TopAp rows={data?.insights.topAP ?? []} /></div>
      {modal ? <DayModal day={modal} onClose={() => setModal(null)} /> : null}
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

function Hero({ subtitle, title, tone }: { subtitle: string; title: string; tone: 'analysis' | 'forecast' }) {
  const gradient = tone === 'analysis' ? 'from-cyan-700 to-blue-800' : 'from-sky-700 to-blue-800'
  return <div className={`rounded-md bg-gradient-to-r ${gradient} p-5 text-white shadow`}><h1 className="text-xl font-bold md:text-2xl">{title}</h1><p className="mt-1 text-sm opacity-80">{subtitle}</p></div>
}

function BaselineNotice({ sourceState }: { sourceState?: SourceState }) {
  return <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"><b>Cash planning read baseline</b><span className="ml-2">พยากรณ์/วิเคราะห์จากข้อมูลธุรกรรม ยังไม่ใช่ GL หรือ cash-flow statutory statement</span>{sourceState ? <div className="mt-1 text-xs text-amber-800">{sourceState.limitations[0]}</div> : null}</div>
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">{children}</div>
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 text-sm"><span>{label}</span><DatePickerInput className="w-[140px]" value={value} onChange={onChange} /></label>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <select className="rounded-md border bg-white px-2 py-1.5 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-md bg-white p-5 shadow-lg"><h3 className="mb-3 font-bold text-slate-800">{title}</h3>{children}</div>
}

function Bar({ label, max, tone, value }: { label: string; max: number; tone: 'blue' | 'emerald'; value: number }) {
  const color = tone === 'emerald' ? 'from-emerald-500 to-teal-500 text-emerald-700' : 'from-blue-500 to-indigo-500 text-blue-700'
  return <div className="mb-3"><div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{label}</span><span className={`font-bold ${color.split(' ').at(-1)}`}>{money(value)}</span></div><div className="h-4 w-full overflow-hidden rounded-md-full bg-slate-100"><div className={`h-4 rounded-md-full bg-gradient-to-r ${color}`} style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%` }} /></div></div>
}

function TrapDonut({ ar, cash, stock }: { ar: number; cash: number; stock: number }) {
  const total = Math.max(1, ar + cash + stock)
  const cashDash = cash / total * 440
  const arDash = ar / total * 440
  return <div><svg viewBox="0 0 200 200" className="mx-auto block h-[140px] w-[140px]"><circle cx="100" cy="100" fill="none" r="70" stroke="#10b981" strokeDasharray={`${cashDash} 440`} strokeWidth="40" transform="rotate(-90 100 100)" /><circle cx="100" cy="100" fill="none" r="70" stroke="#06b6d4" strokeDasharray={`${arDash} 440`} strokeDashoffset={-cashDash} strokeWidth="40" transform="rotate(-90 100 100)" /><circle cx="100" cy="100" fill="none" r="70" stroke="#f59e0b" strokeDasharray={`${stock / total * 440} 440`} strokeDashoffset={-(cashDash + arDash)} strokeWidth="40" transform="rotate(-90 100 100)" /></svg><div className="mt-3 space-y-1 text-xs"><Legend label="💵 Cash" value={cash} /><Legend label="📥 AR (ลูกหนี้)" value={ar} /><Legend label="📦 Stock" value={stock} /></div></div>
}

function Legend({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span>{label}</span><span className="font-bold">{money(value)}</span></div>
}

function ProjectionCard({ index, row }: { index: number; row: AnalysisPayload['charts']['projection'][number] }) {
  const cls = index === 0 ? 'from-blue-50 to-indigo-50' : index === 1 ? 'from-amber-50 to-orange-50' : 'from-emerald-50 to-teal-50'
  return <div className={`rounded-md bg-gradient-to-br ${cls} p-4 shadow`}><div className="mb-1 text-xs text-slate-500">{row.label}</div><div className={`text-3xl font-bold ${row.projected >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{money(row.projected)}</div>{row.expectedIn > 0 ? <div className="mt-2 text-xs text-emerald-600">📥 จะรับ +{money(row.expectedIn)}</div> : null}{row.expectedOut > 0 ? <div className="text-xs text-red-600">📤 จะจ่าย -{money(row.expectedOut)}</div> : null}</div>
}

function InsightCard({ insight }: { insight: Insight }) {
  const cls = insight.type === 'danger' ? 'border-red-500 bg-red-50' : insight.type === 'warn' ? 'border-amber-500 bg-amber-50' : 'border-emerald-500 bg-emerald-50'
  return <div className={`rounded-md border-l-4 p-5 shadow ${cls}`}><h3 className="mb-2 text-base font-bold">{insight.title}</h3><div className="mb-2 text-sm font-medium text-slate-700">{insight.body}</div><div className="text-xs text-slate-600">{insight.explain}</div></div>
}

function DetailTable({ isLoading, rows }: { isLoading: boolean; rows: AnalysisPayload['detailRows'] }) {
  return <div className="rounded-md bg-white p-4 shadow"><h3 className="mb-3 font-bold">📊 ตารางรายละเอียด</h3><table className="w-full text-sm"><tbody>{isLoading ? <tr><td className="py-8 text-center text-slate-400" colSpan={2}>กำลังโหลดข้อมูล</td></tr> : null}{rows.map((row) => <tr key={row.label} className={`border-t ${row.tone === 'warn' ? 'bg-amber-50' : row.tone === 'bad' ? 'bg-red-50' : row.label.includes('Projected') ? 'bg-blue-50' : ''}`}><td className="p-2">{row.label}</td><td className={`p-2 text-right font-bold ${row.tone === 'bad' ? 'text-red-700' : row.tone === 'good' ? 'text-emerald-700' : ''}`}>{row.suffix === '%' ? row.value.toFixed(2) : money(row.value)}{row.suffix ?? ''}</td></tr>)}</tbody></table></div>
}

function ForecastMega({ horizon, summary }: { horizon: number; summary?: ForecastPayload['summary'] }) {
  const ok = (summary?.lowestBal ?? 0) >= 0
  return <div className={`relative overflow-hidden rounded-md p-5 text-white shadow-xl ${ok ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-gradient-to-br from-red-500 to-rose-700 ring-4 ring-red-200'}`}><div className="absolute right-3 top-2 text-7xl opacity-15">{ok ? '💎' : '⚠'}</div><div className="text-xs opacity-80">{ok ? '✓ Forecast: เงินพอ' : '⚠ Forecast: เงินขาด!'}</div><div className="mt-1 text-4xl font-bold">{money(summary?.endCash)}</div><div className="mt-2 text-sm opacity-90">เงินสด ณ สิ้น {horizon} วัน</div><div className="mt-3 space-y-0.5 text-xs opacity-80"><div>เริ่มต้น: <b>{money(summary?.startCash)}</b></div><div>+ Expected In: <b>+{money(summary?.totalIn)}</b></div><div>- Expected Out: <b>-{money(summary?.totalOut)}</b></div><div>⚠ ต่ำสุด: <b>{money(summary?.lowestBal)}</b> {summary?.negCount ? `(${summary.negCount} วัน ติดลบ)` : ''}</div></div></div>
}

function ProjectionSvg({ days }: { days: ProjectionDay[] }) {
  const maxAbs = Math.max(...days.map((day) => Math.abs(day.closing)), 1)
  const points = days.map((day, index) => `${40 + (index / Math.max(1, days.length - 1)) * 740},${100 - (day.closing / maxAbs) * 90}`).join(' ')
  return <svg viewBox="0 0 800 200" className="h-[200px] w-full"><line stroke="#cbd5e1" strokeDasharray="3 3" x1="40" x2="780" y1="100" y2="100" /><text fill="#64748b" fontSize="9" textAnchor="end" x="35" y="103">0</text><polyline fill="none" points={points} stroke="#0284c7" strokeWidth="2" /><polygon fill="rgba(16,185,129,0.15)" points={`40,100 ${points} 780,100`} /><circle cx="40" cy="100" fill="#10b981" r="4" /><text fill="#0284c7" fontSize="9" fontWeight="bold" textAnchor="middle" x="40" y="195">วันนี้</text></svg>
}

function Stat({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'red'; value: string }) {
  const color = tone === 'blue' ? 'text-blue-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-red-700'
  return <div className="rounded-md bg-white p-3 shadow"><div className={`text-xs ${color}`}>{label}</div><div className={`text-lg font-bold ${color}`}>{value}</div></div>
}

function CalendarGrid({ days, isLoading, onSelect }: { days: ProjectionDay[]; isLoading: boolean; onSelect: (day: ProjectionDay) => void }) {
  if (isLoading) return <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow">กำลังโหลดข้อมูล</div>
  return <div className="overflow-x-auto rounded-md bg-white p-3 shadow"><div className="mb-1 grid grid-cols-7 gap-1">{['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map((day) => <div className="py-1 text-center text-xs font-bold text-slate-500" key={day}>{day}</div>)}</div><div className="grid grid-cols-7 gap-1" style={{ minWidth: 560 }}>{days.length ? Array.from({ length: days[0].dayOfWeek }, (_, index) => <div key={`pad${index}`} />) : null}{days.map((day) => <button key={day.date} className={`min-h-24 rounded-md border p-2 text-left text-xs transition ${day.closing < 0 ? 'border-red-300 bg-red-50' : day.isToday ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300' : 'border-slate-200 bg-white'} ${day.dayIn > 0 || day.dayOut > 0 ? 'border-2' : ''}`} type="button" onClick={() => onSelect(day)}><div className="mb-1 flex justify-between"><span className={`font-bold ${day.isToday ? 'text-blue-700' : 'text-slate-700'}`}>{day.dayOfMonth}{day.isToday ? ' (วันนี้)' : ''}</span><span className="text-slate-400">{day.date.slice(5, 7)}</span></div>{day.dayIn > 0 ? <div className="truncate text-emerald-700">+{money(day.dayIn)}</div> : null}{day.dayOut > 0 ? <div className="truncate text-red-600">-{money(day.dayOut)}</div> : null}<div className={`mt-1 truncate font-bold ${day.closing >= 0 ? 'text-slate-700' : 'text-red-700'}`}>{money(day.closing)}</div></button>)}</div></div>
}

function TopAr({ rows }: { rows: ForecastPayload['insights']['topAR'] }) {
  return <InsightTable empty="ไม่มีลูกค้าค้างเกินกำหนด ✓" heading="📥 ต้องเร่งเก็บลูกค้าคนไหน (Top 10 Overdue)" tone="emerald"><tbody>{rows.map((row) => <tr key={row.id} className="border-t bg-red-50/30"><Td>{row.customerName}</Td><Td mono>{row.docNo}</Td><Td align="right" strong>{money(row.receivableBalance)}</Td><Td align="right" strong>{row.daysOverdue}</Td></tr>)}{!rows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={4}>ไม่มีลูกค้าค้างเกินกำหนด ✓</td></tr> : null}</tbody></InsightTable>
}

function TopAp({ rows }: { rows: ForecastPayload['insights']['topAP'] }) {
  return <InsightTable empty="ไม่มี AP คงเหลือ" heading="📤 อาจจะต้องเลื่อนจ่าย Supplier คนไหน (Top 10 ยอดสูง)" tone="red"><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><Td>{row.supplierName}</Td><Td mono>{row.docNo}</Td><Td align="right" strong>{money(row.payableBalance)}</Td><Td align="right"><span className={row.daysToDue < 7 ? 'text-red-700' : 'text-slate-600'}>{row.daysToDue}</span></Td></tr>)}{!rows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={4}>ไม่มี AP คงเหลือ</td></tr> : null}</tbody></InsightTable>
}

function InsightTable({ children, heading, tone }: { children: ReactNode; empty: string; heading: string; tone: 'emerald' | 'red' }) {
  const cls = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
  return <div className="rounded-md bg-white shadow"><div className={`border-b p-3 font-bold ${cls}`}>{heading}</div><table className="w-full text-sm"><thead className="bg-slate-100"><tr><Th>ชื่อ</Th><Th>บิล</Th><Th align="right">ค้าง</Th><Th align="right">วัน</Th></tr></thead>{children}</table></div>
}

function DayModal({ day, onClose }: { day: ProjectionDay; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-3xl overflow-hidden rounded-md bg-white shadow-xl"><div className="flex items-center justify-between border-b p-4"><h2 className="font-bold">📅 {day.date} · Closing {money(day.closing)}</h2><button className="rounded-md bg-slate-100 px-3 py-1 text-sm" type="button" onClick={onClose}>ปิด</button></div><table className="w-full text-sm"><thead className="bg-slate-100"><tr><Th>Type</Th><Th>Ref</Th><Th>Label</Th><Th align="right">Amount</Th></tr></thead><tbody>{day.events.map((event) => <tr key={`${event.type}-${event.refNo}`} className="border-t"><Td>{event.type}</Td><Td mono>{event.refNo}</Td><Td>{event.label}</Td><Td align="right"><span className={event.inOut === 'IN' ? 'text-emerald-700' : 'text-red-700'}>{event.inOut === 'IN' ? '+' : '-'}{money(event.amount)}</span></Td></tr>)}{!day.events.length ? <tr><td className="py-5 text-center text-slate-400" colSpan={4}>ไม่มี event ในวันนี้</td></tr> : null}</tbody></table></div></div>
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap p-2 font-semibold ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children, mono = false, strong = false }: { align?: 'center' | 'left' | 'right'; children: ReactNode; mono?: boolean; strong?: boolean }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap p-2 ${textAlign} ${mono ? 'font-mono text-xs' : 'text-xs'} ${strong ? 'font-bold' : ''}`}>{children}</td>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
