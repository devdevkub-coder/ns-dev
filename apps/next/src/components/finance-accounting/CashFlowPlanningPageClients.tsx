'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }
type Insight = { body: string; explain: string; title: string; type: 'danger' | 'ok' | 'warn' }
type DetailColumnKey = 'label' | 'value'
type DayEventColumnKey = 'amount' | 'label' | 'refNo' | 'type'
type TopPartyColumnKey = 'amount' | 'days' | 'docNo' | 'party'
type SortDirection = 'asc' | 'desc'

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

const detailColumns: Array<ResizableColumnDefinition<DetailColumnKey>> = [
  { key: 'label', defaultWidth: 360, minWidth: 220 },
  { key: 'value', defaultWidth: 190, minWidth: 140 },
]

const topPartyColumns: Array<ResizableColumnDefinition<TopPartyColumnKey>> = [
  { key: 'party', defaultWidth: 240, minWidth: 160 },
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'amount', defaultWidth: 170, minWidth: 135 },
  { key: 'days', defaultWidth: 100, minWidth: 80 },
]

const dayEventColumns: Array<ResizableColumnDefinition<DayEventColumnKey>> = [
  { key: 'type', defaultWidth: 120, minWidth: 95 },
  { key: 'refNo', defaultWidth: 150, minWidth: 120 },
  { key: 'label', defaultWidth: 320, minWidth: 190 },
  { key: 'amount', defaultWidth: 170, minWidth: 135 },
]

function compareSortValues(left: string | number, right: string | number) {
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'th', { numeric: true })
}

function useLocalTableSort<TRow, TKey extends string>(rows: TRow[], getSortValue: (row: TRow, key: TKey) => string | number) {
  const [sortKey, setSortKey] = useState<TKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [getSortValue, rows, sortDirection, sortKey])

  function handleSort(key: TKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return { handleSort, sortDirection, sortedRows, sortKey }
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-md bg-white p-3 shadow lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-semibold shrink-0">From</span>
              <DatePickerInput className="w-full text-xs" value={from} onChange={setFrom} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-semibold shrink-0">To</span>
              <DatePickerInput className="w-full text-xs" value={to} onChange={setTo} />
            </div>
          </div>
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {branchId ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-xl border-t border-slate-200 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 text-sm">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">สาขา</label>
                <select
                  aria-label="Branch select"
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  <option value="">ทุกสาขา</option>
                  {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBranchId('')
                }}
                className="flex-1 h-10 rounded-md border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="📊 กำไร vs เงินสดจริง">
          <Bar label="Net Profit (Accrual)" max={maxProfit} tone="emerald" value={data?.summary.netProfit ?? 0} />
          <Bar label="Operating Cash Flow" max={maxProfit} tone="blue" value={data?.summary.operatingCashFlow ?? 0} />
          <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-amber-700"><span>ส่วนต่าง (NP - OCF)</span><span>{money((data?.summary.netProfit ?? 0) - (data?.summary.operatingCashFlow ?? 0))}</span></div>
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <span className="text-sm font-bold">Forecast:</span>
        {[7, 30, 90].map((item) => <button key={item} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${horizon === item ? 'bg-[#0F172A] text-white' : 'bg-slate-50 border border-slate-100 text-slate-600 hover:bg-slate-100'}`} type="button" onClick={() => setHorizon(item)}>{item} วัน</button>)}
        <DateInput label="เริ่ม" value={startDate} onChange={setStartDate} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className="text-xs text-slate-500">เริ่มจาก {money(data?.summary.startCash)} → จบที่ {money(data?.summary.endCash)}</span>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-md bg-white p-3 shadow lg:hidden space-y-3">
        <div className="flex gap-2 items-center justify-between">
          <div className="flex gap-1.5 overflow-x-auto">
            {[7, 30, 90].map((item) => (
              <button
                key={item}
                className={`h-9 px-3 rounded-md text-xs font-semibold ${horizon === item ? 'bg-[#0F172A] text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}
                type="button"
                onClick={() => setHorizon(item)}
              >
                {item} วัน
              </button>
            ))}
          </div>
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none shrink-0"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {branchId ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-xl border-t border-slate-200 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 text-sm">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">เริ่มวันที่</label>
                <DatePickerInput className="w-full text-sm" value={startDate} onChange={setStartDate} />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">สาขา</label>
                <select
                  aria-label="Branch select"
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  <option value="">ทุกสาขา</option>
                  {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>

              <div className="pt-2 text-xs text-slate-500 border-t border-slate-100">
                เริ่มจาก <span className="font-bold text-slate-700">{money(data?.summary.startCash)}</span> → จบที่ <span className="font-bold text-slate-700">{money(data?.summary.endCash)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBranchId('')
                }}
                className="flex-1 h-10 rounded-md border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  return <select className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-md bg-white p-5 shadow-lg"><h3 className="mb-3 font-bold text-slate-800">{title}</h3>{children}</div>
}

function Bar({ label, max, tone, value }: { label: string; max: number; tone: 'blue' | 'emerald'; value: number }) {
  const color = tone === 'emerald' ? 'from-emerald-500 to-teal-500 text-emerald-700' : 'from-blue-500 to-indigo-500 text-blue-700'
  return <div className="mb-3"><div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{label}</span><span className={`font-bold ${color.split(' ').at(-1)}`}>{money(value)}</span></div><div className="h-4 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-4 rounded-full bg-gradient-to-r ${color}`} style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%` }} /></div></div>
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
  const columnResize = useResizableColumns('finance-accounting.cash-flow-analysis.detail.v1', detailColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<AnalysisPayload['detailRows'][number], DetailColumnKey>(rows, (row, key) => row[key])

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="font-bold text-slate-800">📊 ตารางรายละเอียด</h3>
        {columnResize.hasCustomWidths ? (
          <button
            className="hidden h-8 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 lg:inline-flex"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            รีเซ็ตความกว้างตาราง
          </button>
        ) : null}
      </div>
      {/* Desktop Table View */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {detailColumns.map((column, index) => {
              if (index === detailColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="รายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="label" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('label', 'รายการ')} />
              <ResizableTableHead align="right" label="มูลค่า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="value" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('value', 'มูลค่า')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="py-8 text-center text-slate-400" colSpan={detailColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {sortedRows.map((row) => (
              <tr key={row.label} className={`transition-colors hover:bg-slate-50 ${row.tone === 'warn' ? 'bg-amber-50/70' : row.tone === 'bad' ? 'bg-red-50/70' : row.label.includes('Projected') ? 'bg-blue-50/70' : ''}`}>
                <td className="px-3 py-3 text-slate-700">{row.label}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.tone === 'bad' ? 'text-red-700' : row.tone === 'good' ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {row.suffix === '%' ? row.value.toFixed(2) : money(row.value)}{row.suffix ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block divide-y divide-slate-100 lg:hidden">
        {isLoading && <div className="py-6 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
        {!isLoading && sortedRows.map((row) => (
          <div key={row.label} className={`flex justify-between items-center p-3 text-xs ${row.tone === 'warn' ? 'bg-amber-50/50' : row.tone === 'bad' ? 'bg-red-50/50' : row.label.includes('Projected') ? 'bg-blue-50/50' : ''}`}>
            <span className="text-slate-700">{row.label}</span>
            <span className={`font-bold ${row.tone === 'bad' ? 'text-red-700' : row.tone === 'good' ? 'text-emerald-700' : 'text-slate-900'}`}>
              {row.suffix === '%' ? row.value.toFixed(2) : money(row.value)}{row.suffix ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ForecastMega({ horizon, summary }: { horizon: number; summary?: ForecastPayload['summary'] }) {
  const ok = (summary?.lowestBal ?? 0) >= 0
  return <div className={`relative overflow-hidden rounded-md p-5 text-white shadow-xl ${ok ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-gradient-to-br from-red-500 to-rose-700 ring-4 ring-red-200'}`}><div className="absolute right-3 top-2 text-7xl opacity-15">{ok ? '💎' : '⚠'}</div><div className="text-xs opacity-80">{ok ? '✓ Forecast: เงินพอ' : '⚠ Forecast: เงินขาด!'}</div><div className="mt-1 text-4xl font-bold">{money(summary?.endCash)}</div><div className="mt-2 text-sm opacity-90">เงินสด ณ สิ้น {horizon} วัน</div><div className="mt-3 space-y-0.5 text-xs opacity-80"><div>เริ่มต้น: <b>{money(summary?.startCash)}</b></div><div>+ Expected In: <b>+{money(summary?.totalIn)}</b></div><div>- Expected Out: <b>-{money(summary?.totalOut)}</b></div><div>⚠ ต่ำสุด: <b>{money(summary?.lowestBal)}</b> {summary?.negCount ? `(${summary.negCount} วัน ติดลบ)` : ''}</div></div></div>
}

function ProjectionSvg({ days }: { days: ProjectionDay[] }) {
  const maxAbs = Math.max(...days.map((day) => Math.abs(day.closing)), 1)
  const points = days.map((day, index) => `${40 + (index / Math.max(1, days.length - 1)) * 740},${100 - (day.closing / maxAbs) * 90}`).join(' ')
  return <svg viewBox="0 0 800 200" className="h-[200px] w-full"><line stroke="#cbd5e1" strokeDasharray="3 3" x1="40" x2="780" y1="100" y2="100" /><text fill="#64748b" fontSize="12" textAnchor="end" x="35" y="103">0</text><polyline fill="none" points={points} stroke="#0284c7" strokeWidth="2" /><polygon fill="rgba(16,185,129,0.15)" points={`40,100 ${points} 780,100`} /><circle cx="40" cy="100" fill="#10b981" r="4" /><text fill="#0284c7" fontSize="12" fontWeight="bold" textAnchor="middle" x="40" y="195">วันนี้</text></svg>
}

function Stat({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'red'; value: string }) {
  const color = tone === 'blue' ? 'text-blue-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-red-700'
  return <div className="rounded-md bg-white p-3 shadow"><div className={`text-xs ${color}`}>{label}</div><div className={`text-lg font-bold ${color}`}>{value}</div></div>
}

function CalendarGrid({ days, isLoading, onSelect }: { days: ProjectionDay[]; isLoading: boolean; onSelect: (day: ProjectionDay) => void }) {
  if (isLoading) return <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow">กำลังโหลดข้อมูล</div>
  return <div className="overflow-x-auto rounded-md bg-white p-3 shadow"><div className="mb-1 grid grid-cols-7 gap-1">{['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map((day) => <div className="py-1 text-center text-xs font-bold text-slate-500" key={day}>{day}</div>)}</div><div className="grid grid-cols-7 gap-1" style={{ minWidth: 560 }}>{days.length ? Array.from({ length: days[0].dayOfWeek }, (_, index) => <div key={`pad${index}`} />) : null}{days.map((day) => <button key={day.date} className={`min-h-24 rounded-md border p-2 text-left text-xs transition ${day.closing < 0 ? 'border-red-300 bg-red-50' : day.isToday ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300' : 'border-slate-100 bg-white'} ${day.dayIn > 0 || day.dayOut > 0 ? 'border-2' : ''}`} type="button" onClick={() => onSelect(day)}><div className="mb-1 flex justify-between"><span className={`font-bold ${day.isToday ? 'text-blue-700' : 'text-slate-700'}`}>{day.dayOfMonth}{day.isToday ? ' (วันนี้)' : ''}</span><span className="text-slate-400">{day.date.slice(5, 7)}</span></div>{day.dayIn > 0 ? <div className="truncate text-emerald-700">+{money(day.dayIn)}</div> : null}{day.dayOut > 0 ? <div className="truncate text-red-600">-{money(day.dayOut)}</div> : null}<div className={`mt-1 truncate font-bold ${day.closing >= 0 ? 'text-slate-700' : 'text-red-700'}`}>{money(day.closing)}</div></button>)}</div></div>
}

function TopAr({ rows }: { rows: ForecastPayload['insights']['topAR'] }) {
  const headingCls = 'bg-emerald-50 text-emerald-700'
  const columnResize = useResizableColumns('finance-accounting.cash-flow-forecast.top-ar.v1', topPartyColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<ForecastPayload['insights']['topAR'][number], TopPartyColumnKey>(rows, (row, key) => {
    if (key === 'party') return row.customerName
    if (key === 'amount') return row.receivableBalance
    if (key === 'days') return row.daysOverdue
    return row.docNo
  })

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 p-3 font-bold ${headingCls}`}>
        <span>📥 ต้องเร่งเก็บลูกค้าคนไหน (Top 10 Overdue)</span>
        {columnResize.hasCustomWidths ? (
          <button
            className="hidden h-8 rounded-md bg-white/70 px-3 text-xs font-semibold text-emerald-700 hover:bg-white lg:inline-flex"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            รีเซ็ตความกว้างตาราง
          </button>
        ) : null}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {topPartyColumns.map((column, index) => {
              if (index === topPartyColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="party" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('party', 'ลูกค้า')} />
              <ResizableTableHead label="เลขที่บิล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่บิล')} />
              <ResizableTableHead align="right" label="ยอดค้าง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดค้าง')} />
              <ResizableTableHead align="right" label="ค้างมาแล้ว" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="days" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('days', 'ค้างมาแล้ว')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
                <td className="px-3 py-3 font-medium text-slate-900">{row.customerName}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-semibold text-blue-700">{row.docNo}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{money(row.receivableBalance)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-red-700">{row.daysOverdue} วัน</td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={topPartyColumns.length}>ไม่มีลูกค้าค้างเกินกำหนด ✓</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block divide-y divide-slate-100 lg:hidden">
        {!rows.length ? (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มีลูกค้าค้างเกินกำหนด ✓</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="p-3 space-y-1 text-xs hover:bg-slate-50/50 transition">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-900">{row.customerName}</span>
                <span className="font-mono text-blue-700 font-semibold">{row.docNo}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>ค้าง: <b className="text-slate-800">{money(row.receivableBalance)}</b></span>
                <span>ค้างมาแล้ว: <b className="text-red-600 font-bold">{row.daysOverdue} วัน</b></span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TopAp({ rows }: { rows: ForecastPayload['insights']['topAP'] }) {
  const headingCls = 'bg-red-50 text-red-700'
  const columnResize = useResizableColumns('finance-accounting.cash-flow-forecast.top-ap.v1', topPartyColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<ForecastPayload['insights']['topAP'][number], TopPartyColumnKey>(rows, (row, key) => {
    if (key === 'party') return row.supplierName
    if (key === 'amount') return row.payableBalance
    if (key === 'days') return row.daysToDue
    return row.docNo
  })

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-red-100 p-3 font-bold ${headingCls}`}>
        <span>📤 อาจจะต้องเลื่อนจ่าย Supplier คนไหน (Top 10 ยอดสูง)</span>
        {columnResize.hasCustomWidths ? (
          <button
            className="hidden h-8 rounded-md bg-white/70 px-3 text-xs font-semibold text-red-700 hover:bg-white lg:inline-flex"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            รีเซ็ตความกว้างตาราง
          </button>
        ) : null}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {topPartyColumns.map((column, index) => {
              if (index === topPartyColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="Supplier" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="party" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('party', 'Supplier')} />
              <ResizableTableHead label="เลขที่บิล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่บิล')} />
              <ResizableTableHead align="right" label="ยอดค้าง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดค้าง')} />
              <ResizableTableHead align="right" label="ครบกำหนดใน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="days" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('days', 'ครบกำหนดใน')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
                <td className="px-3 py-3 font-medium text-slate-900">{row.supplierName}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-semibold text-blue-700">{row.docNo}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{money(row.payableBalance)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums"><span className={row.daysToDue < 7 ? 'text-red-700' : 'text-slate-600'}>{row.daysToDue} วัน</span></td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={topPartyColumns.length}>ไม่มี AP คงเหลือ</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block divide-y divide-slate-100 lg:hidden">
        {!rows.length ? (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มี AP คงเหลือ</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="p-3 space-y-1 text-xs hover:bg-slate-50/50 transition">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-900">{row.supplierName}</span>
                <span className="font-mono text-blue-700 font-semibold">{row.docNo}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>ยอด: <b className="text-slate-800">{money(row.payableBalance)}</b></span>
                <span>ครบกำหนดใน: <b className={row.daysToDue < 7 ? 'text-red-700 font-bold' : 'text-slate-600 font-medium'}>{row.daysToDue} วัน</b></span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function DayModal({ day, onClose }: { day: ProjectionDay; onClose: () => void }) {
  const columnResize = useResizableColumns('finance-accounting.cash-flow-forecast.day-events.v1', dayEventColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<ForecastEvent, DayEventColumnKey>(day.events, (event, key) => {
    if (key === 'amount') return event.inOut === 'IN' ? event.amount : -event.amount
    return event[key]
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-md bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
          <h2 className="text-sm font-bold">📅 {day.date} · Closing {money(day.closing)}</h2>
          <button className="text-slate-300 hover:text-white text-xs font-semibold outline-none focus:ring-0" type="button" onClick={onClose}>
            ปิด
          </button>
        </div>
        {columnResize.hasCustomWidths ? (
          <div className="hidden justify-end border-b border-slate-100 bg-white px-3 py-2 lg:flex">
            <button
              className="h-8 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              รีเซ็ตความกว้างตาราง
            </button>
          </div>
        ) : null}
        <div className="max-h-[60vh] overflow-auto bg-white">
          {/* Desktop Table View */}
          <div className="hidden lg:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {dayEventColumns.map((column, index) => {
                  if (index === dayEventColumns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />
                  }
                  return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                })}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="type" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
                  <ResizableTableHead label="เลขอ้างอิง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="refNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขอ้างอิง')} />
                  <ResizableTableHead label="รายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="label" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('label', 'รายการ')} />
                  <ResizableTableHead align="right" label="จำนวนเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวนเงิน')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((event) => (
                  <tr key={`${event.type}-${event.refNo}`} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">{event.type}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-semibold text-blue-700">{event.refNo}</td>
                    <td className="min-w-0 px-3 py-3 text-slate-700"><div className="truncate">{event.label}</div></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums">
                      <span className={event.inOut === 'IN' ? 'text-emerald-700' : 'text-red-700'}>
                        {event.inOut === 'IN' ? '+' : '-'}{money(event.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
                {!day.events.length ? <tr><td className="py-5 text-center text-slate-400" colSpan={dayEventColumns.length}>ไม่มี event ในวันนี้</td></tr> : null}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="block divide-y divide-slate-100 lg:hidden">
            {!day.events.length ? (
              <div className="py-5 text-center text-slate-400 text-xs">ไม่มี event ในวันนี้</div>
            ) : (
              sortedRows.map((event) => (
                <div key={`${event.type}-${event.refNo}`} className="p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-900">{event.type}</span>
                    <span className="font-mono text-blue-700 font-semibold">{event.refNo}</span>
                  </div>
                  <div className="text-slate-600">{event.label}</div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-100/50">
                    <span className="text-slate-400">จำนวนเงิน</span>
                    <span className={`font-bold ${event.inOut === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {event.inOut === 'IN' ? '+' : '-'}{money(event.amount)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
