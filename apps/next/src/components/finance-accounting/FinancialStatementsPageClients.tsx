'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type DetailRow = { amount: number; date: string; description: string; refNo: string }
type StatementLine = { amount: number; details?: DetailRow[]; label: string; level?: number; section: string; tone?: 'default' | 'good' | 'bad' | 'muted' | 'total' }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }

type PlPayload = {
  branches: BranchRow[]
  filters: { branchId: string; from: string; to: string; transactionMode: string }
  sections: StatementLine[]
  sourceState: SourceState
  split: { stock: { cogs: number; revenue: number }; trading: { cogs: number; revenue: number } }
  summary: { cogs: number; depreciation: number; expenses: number; fxNet: number; grossProfit: number; interest: number; netProfitBeforeTax: number; operatingProfit: number; revenue: number }
}

type BalancePayload = {
  balanceCheck: { balanced: boolean; difference: number }
  branches: BranchRow[]
  filters: { asOf: string; branchId: string }
  ratios: { currentRatio: number; debtToEquity: number; workingCapital: number }
  sections: { assets: StatementLine[]; equity: StatementLine[]; liabilities: StatementLine[] }
  sourceState: SourceState
  summary: { ar: number; ap: number; cash: number; currentLoan: number; fixedAssetNet: number; inventory: number; liabilitiesAndEquity: number; longTermLoan: number; totalAssets: number; totalEquity: number; totalLiabilities: number }
}

type CashActivity = {
  inflow: number
  net: number
  outflow: number
  rows: Array<DetailRow & { category: string; inflow: number; outflow: number }>
}

type CashPayload = {
  activities: { financing: CashActivity; investing: CashActivity; operating: CashActivity }
  branches: BranchRow[]
  filters: { branchId: string; from: string; method: string; to: string }
  rows: StatementLine[]
  sourceState: SourceState
  summary: { endingCash: number; financing: number; internalTransfers: number; investing: number; netChange: number; operating: number; openingCash: number; totalInflow: number; totalOutflow: number }
}

function today() {
  return localDateInputValue(new Date())
}

function monthStart() {
  const now = new Date()
  return localDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
}

function localDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PlStatementPageClient() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [branchId, setBranchId] = useState('')
  const [mode, setMode] = useState('ALL')
  const url = useMemo(() => `/api/finance-accounting/pl-statement?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}&transactionMode=${mode}`, [branchId, from, mode, to])
  const { data, error, isLoading } = useApi<PlPayload>(url)
  const [drill, setDrill] = useState<{ rows: DetailRow[]; title: string } | null>(null)

  return (
    <section className="space-y-4">
      <Hero subtitle="รายได้จาก Sales Bills · COGS จาก WAC · ค่าใช้จ่ายจาก Expense · ค่าเสื่อม · ดอกเบี้ย · FX" title="📈 Profit & Loss Statement / งบกำไรขาดทุน" tone="pl" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <Segment active>📅 ช่วงวันที่</Segment><Segment>📆 รายเดือน</Segment><Segment>📊 ตารางรายปี (12 เดือน)</Segment>
        <QuickButton onClick={() => { const now = new Date(); setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)); setTo(today()) }}>📊 ปีนี้</QuickButton>
        <QuickButton onClick={() => setFrom(monthStart())}>เดือนนี้</QuickButton>
        <DateInput label="จาก" value={from} onChange={setFrom} /><DateInput label="ถึง" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="ALL">All (Stock+Trading)</option><option value="STOCK">Stock Only</option><option value="TRADING">Trading Only</option>
        </select>
        <DisabledButton>📥 Excel</DisabledButton>
      </FilterPanel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MegaCard footer={`Gross ${money(data?.summary.grossProfit)} · OPEX ${money((data?.summary.expenses ?? 0) + (data?.summary.depreciation ?? 0))}`} label="Net Profit Before Tax" tone="pl" value={money(data?.summary.netProfitBeforeTax)} />
        <Panel title="🌊 Waterfall"><Waterfall rows={[['Revenue', data?.summary.revenue ?? 0], ['COGS', -(data?.summary.cogs ?? 0)], ['OPEX', -(data?.summary.expenses ?? 0)], ['Dep', -(data?.summary.depreciation ?? 0)], ['Interest', -(data?.summary.interest ?? 0)], ['FX', data?.summary.fxNet ?? 0]]} /></Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Revenue" value={money(data?.summary.revenue)} tone="emerald" />
        <StatCard label="COGS" value={money(data?.summary.cogs)} tone="red" />
        <StatCard label="Operating Profit" value={money(data?.summary.operatingProfit)} tone="cyan" />
        <StatCard label="FX Gain/(Loss)" value={money(data?.summary.fxNet)} tone={(data?.summary.fxNet ?? 0) >= 0 ? 'emerald' : 'red'} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SplitCard label="Stock" revenue={data?.split.stock.revenue ?? 0} cogs={data?.split.stock.cogs ?? 0} tone="emerald" />
        <SplitCard label="Trading" revenue={data?.split.trading.revenue ?? 0} cogs={data?.split.trading.cogs ?? 0} tone="purple" />
      </div>
      <StatementTable isLoading={isLoading} rows={data?.sections ?? []} onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
      {drill ? <DrillModal rows={drill.rows} title={drill.title} onClose={() => setDrill(null)} /> : null}
    </section>
  )
}

export function BalanceSheetPageClient() {
  const [asOf, setAsOf] = useState(today())
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/balance-sheet?asOf=${asOf}${branchId ? `&branchId=${branchId}` : ''}`, [asOf, branchId])
  const { data, error, isLoading } = useApi<BalancePayload>(url)
  const [drill, setDrill] = useState<{ rows: DetailRow[]; title: string } | null>(null)

  return (
    <section className="space-y-4">
      <Hero subtitle="Cash · AR · AP · Inventory (WAC) · Fixed Asset · Loan · Equity — Balanced Check" title="⚖️ Balance Sheet / งบดุล" tone="bs" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <DateInput label="As of" value={asOf} onChange={setAsOf} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className={`rounded-full px-3 py-2 text-xs font-bold ${data?.balanceCheck.balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{data?.balanceCheck.balanced ? 'BALANCED' : `OFF BY ${money(data?.balanceCheck.difference)}`}</span>
        <DisabledButton>📥 Excel</DisabledButton>
      </FilterPanel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MegaCard footer={`Liabilities + Equity ${money(data?.summary.liabilitiesAndEquity)}`} label="Total Assets" tone="bs" value={money(data?.summary.totalAssets)} />
        <Panel title="🥧 Assets Breakdown"><Waterfall rows={[['Cash', data?.summary.cash ?? 0], ['AR', data?.summary.ar ?? 0], ['Inventory', data?.summary.inventory ?? 0], ['Fixed Asset', data?.summary.fixedAssetNet ?? 0]]} /></Panel>
        <Panel title="🥧 Liab + Equity"><Waterfall rows={[['AP', data?.summary.ap ?? 0], ['Current Loan', data?.summary.currentLoan ?? 0], ['Long-term Loan', data?.summary.longTermLoan ?? 0], ['Equity', data?.summary.totalEquity ?? 0]]} /></Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Working Capital" value={money(data?.ratios.workingCapital)} tone="blue" />
        <StatCard label="Current Ratio" value={(data?.ratios.currentRatio ?? 0).toFixed(2)} tone="cyan" />
        <StatCard label="Debt / Equity" value={(data?.ratios.debtToEquity ?? 0).toFixed(2)} tone="purple" />
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <StatementTable isLoading={isLoading} rows={data?.sections.assets ?? []} title="Assets" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
        <StatementTable isLoading={isLoading} rows={[...(data?.sections.liabilities ?? []), ...(data?.sections.equity ?? [])]} title="Liabilities + Equity" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
      </div>
      {drill ? <DrillModal rows={drill.rows} title={drill.title} onClose={() => setDrill(null)} /> : null}
    </section>
  )
}

export function CashFlowStatementPageClient() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/cash-flow-statement?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, to])
  const { data, error, isLoading } = useApi<CashPayload>(url)
  const [drill, setDrill] = useState<{ rows: DetailRow[]; title: string } | null>(null)

  return (
    <section className="space-y-4">
      <Hero subtitle="Direct Method · ดึงจาก Bank Statement จริง · แยก Operating/Investing/Financing · ตัด Internal Transfer" title="💧 Cash Flow Statement / งบกระแสเงินสด" tone="cf" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <DateInput label="จาก" value={from} onChange={setFrom} /><DateInput label="ถึง" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <DisabledButton>📥 Excel</DisabledButton>
      </FilterPanel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MegaCard footer={`Beginning ${money(data?.summary.openingCash)} · Ending ${money(data?.summary.endingCash)}`} label="Net Change in Cash" tone="cf" value={money(data?.summary.netChange)} />
        <Panel title="🥧 Activity Inflow"><Waterfall rows={[['Operating', data?.activities.operating.inflow ?? 0], ['Investing', data?.activities.investing.inflow ?? 0], ['Financing', data?.activities.financing.inflow ?? 0]]} /></Panel>
        <Panel title="📊 Activity Net"><Waterfall rows={[['Operating', data?.summary.operating ?? 0], ['Investing', data?.summary.investing ?? 0], ['Financing', data?.summary.financing ?? 0]]} /></Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Cash In" value={money(data?.summary.totalInflow)} tone="emerald" />
        <StatCard label="Cash Out" value={money(data?.summary.totalOutflow)} tone="red" />
        <StatCard label="Internal Transfer excluded" value={money(data?.summary.internalTransfers)} tone="blue" />
        <StatCard label="Ending Cash" value={money(data?.summary.endingCash)} tone="cyan" />
      </div>
      <StatementTable isLoading={isLoading} rows={data?.rows ?? []} onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
      {drill ? <DrillModal rows={drill.rows} title={drill.title} onClose={() => setDrill(null)} /> : null}
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

function Hero({ subtitle, title, tone }: { subtitle: string; title: string; tone: 'bs' | 'cf' | 'pl' }) {
  const tones = { bs: 'from-blue-700 to-indigo-800', cf: 'from-cyan-600 to-sky-700', pl: 'from-emerald-600 to-teal-700' }
  return <div className={`rounded-xl bg-gradient-to-r ${tones[tone]} p-5 text-white shadow`}><h1 className="text-xl font-bold md:text-2xl">{title}</h1><p className="mt-1 text-sm text-white/85">{subtitle}</p></div>
}

function BaselineNotice({ sourceState }: { sourceState?: SourceState }) {
  return <div className="rounded border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"><b>Management statement / read baseline</b><span className="ml-2">รายงานเพื่อผู้บริหารจากข้อมูลธุรกรรม ยังไม่ใช่งบการเงินตามบัญชี GL</span>{sourceState ? <div className="mt-1 text-xs text-amber-800">{sourceState.limitations[0]}</div> : null}</div>
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">{children}</div>
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 text-xs text-slate-600"><span>{label}</span><input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
}

function Segment({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return <span className={`rounded-lg px-3 py-2 text-xs font-semibold ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{children}</span>
}

function QuickButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={onClick}>{children}</button>
}

function DisabledButton({ children }: { children: ReactNode }) {
  return <button className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white opacity-50" disabled type="button">{children}</button>
}

function MegaCard({ footer, label, tone, value }: { footer: string; label: string; tone: 'bs' | 'cf' | 'pl'; value: string }) {
  const tones = { bs: 'from-blue-700 via-indigo-700 to-violet-800', cf: 'from-cyan-600 via-sky-700 to-blue-800', pl: 'from-emerald-600 via-teal-700 to-cyan-700' }
  return <div className={`rounded-2xl bg-gradient-to-br ${tones[tone]} p-6 text-white shadow-lg lg:col-span-2`}><div className="text-sm uppercase opacity-80">{label}</div><div className="mt-2 text-4xl font-bold md:text-5xl">{value}</div><div className="mt-4 border-t border-white/20 pt-3 text-sm text-white/85">{footer}</div></div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl bg-white p-4 shadow"><h2 className="mb-3 text-sm font-bold text-slate-700">{title}</h2>{children}</div>
}

function StatCard({ label, tone, value }: { label: string; tone: 'blue' | 'cyan' | 'emerald' | 'purple' | 'red'; value: string }) {
  const color = { blue: 'text-blue-700', cyan: 'text-cyan-700', emerald: 'text-emerald-700', purple: 'text-purple-700', red: 'text-red-700' }[tone]
  return <div className="rounded-xl bg-white p-4 shadow"><div className={`text-xs ${color}`}>{label}</div><div className={`mt-1 text-xl font-bold ${color}`}>{value}</div></div>
}

function SplitCard({ cogs, label, revenue, tone }: { cogs: number; label: string; revenue: number; tone: 'emerald' | 'purple' }) {
  const color = tone === 'emerald' ? 'from-emerald-50 text-emerald-800' : 'from-purple-50 text-purple-800'
  return <div className={`rounded-xl bg-gradient-to-br ${color} to-white p-4 shadow`}><div className="text-sm font-bold">{label}</div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><div>Revenue</div><b>{money(revenue)}</b></div><div><div>COGS</div><b>{money(cogs)}</b></div><div><div>Gross</div><b>{money(revenue - cogs)}</b></div></div></div>
}

function Waterfall({ rows }: { rows: Array<[string, number]> }) {
  const max = Math.max(...rows.map((row) => Math.abs(row[1])), 1)
  return <div className="space-y-2">{rows.map(([label, value]) => <div key={label} className="text-xs"><div className="mb-1 flex justify-between gap-2"><span>{label}</span><b className={value < 0 ? 'text-red-700' : 'text-slate-800'}>{money(value)}</b></div><div className="h-3 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${value < 0 ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%` }} /></div></div>)}</div>
}

function StatementTable({ isLoading, onDrill, rows, title = 'Statement' }: { isLoading: boolean; onDrill: (line: StatementLine) => void | undefined; rows: StatementLine[]; title?: string }) {
  return <div className="overflow-hidden rounded-xl bg-white shadow"><div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{title}</div><div className="max-h-[62vh] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><Th>รายการ</Th><Th>Section</Th><Th align="right">จำนวนเงิน</Th><Th align="center">Drill</Th></tr></thead><tbody><LoadingOrEmpty colSpan={4} isLoading={isLoading} rows={rows.length} />{rows.map((line) => <tr key={`${line.section}-${line.label}`} className={`border-t hover:bg-slate-50 ${line.tone === 'total' ? 'bg-slate-50 font-bold' : ''}`}><Td><span className={line.level ? 'pl-5' : ''}>{line.label}</span></Td><Td><span className="rounded bg-slate-100 px-2 py-1 text-slate-500">{line.section}</span></Td><Td align="right"><span className={line.amount < 0 ? 'font-semibold text-red-700' : line.tone === 'good' ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-900'}>{money(line.amount)}</span></Td><Td align="center">{line.details?.length ? <button className="font-semibold text-blue-600 hover:underline" type="button" onClick={() => onDrill(line)}>🔍 {line.details.length}</button> : <span className="text-slate-300">-</span>}</Td></tr>)}</tbody></table></div></div>
}

function DrillModal({ onClose, rows, title }: { onClose: () => void; rows: DetailRow[]; title: string }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b p-4"><h2 className="text-lg font-bold text-slate-800">🔍 {title}</h2><button className="rounded bg-slate-100 px-3 py-1 text-sm" type="button" onClick={onClose}>ปิด</button></div><div className="max-h-[65vh] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-100"><tr><Th>วันที่</Th><Th>เลขที่</Th><Th>รายละเอียด</Th><Th align="right">จำนวนเงิน</Th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.refNo}-${index}`} className="border-t"><Td>{row.date}</Td><Td><span className="font-mono text-blue-700">{row.refNo}</span></Td><Td>{row.description}</Td><Td align="right"><span className={row.amount < 0 ? 'text-red-700' : 'text-slate-800'}>{money(row.amount)}</span></Td></tr>)}</tbody></table></div></div></div>
}

function LoadingOrEmpty({ colSpan, isLoading, rows }: { colSpan: number; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>ยังไม่มีข้อมูล</td></tr>
  return null
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap px-3 py-2 font-semibold ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap px-3 py-2 ${textAlign} text-slate-700`}>{children}</td>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
