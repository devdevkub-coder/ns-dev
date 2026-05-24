'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }
type WorkingPayload = {
  branches: BranchRow[]
  calculationRows: { label: string; tone?: string; value: number }[]
  filters: { asOf: string; branchId: string; from: string; periodDays: number }
  sourceState: SourceState
  summary: {
    annualizedTurnover: number
    ap: number
    apDays: number
    ar: number
    arDays: number
    cash: number
    ccc: number
    cogs: number
    currentAssets: number
    currentLiab: number
    currentLoan: number
    currentRatio: number
    inv: number
    invDays: number
    purchases: number
    quickRatio: number
    revenue: number
    stockTurnover: number
  }
}
type StockProduct = { ageDays: number; code: string; daysSinceSale: number; id: string; marginPotential: number; metalGroup: string; name: string; qty: number; status: string; stdPrice: number; value: number; wac: number }
type StockPayload = {
  aging: { count: number; key: string; value: number }[]
  branches: BranchRow[]
  byStatus: Record<string, number>
  filters: { asOf: string; branchId: string }
  slowMoving: StockProduct[]
  sourceState: SourceState
  summary: { itemCount: number; marginPotential: number; paidValue: number; totalQty: number; totalValue: number; unpaidValue: number }
  topProducts: StockProduct[]
}
type ProfitPayload = {
  branches: BranchRow[]
  filters: { branchId: string; from: string; targetMargin: number; to: string }
  highSuppliers: { id: string; premium: number; premiumPct: number; productName: string; qty: number; supplierName: string }[]
  leakSegments: { label: string; value: number }[]
  lowCustomers: { gpPct: number; id: string; name: string; revenue: number }[]
  lowMarginBills: { customer: string; docNo: string; gpPct: number; id: string; revenue: number; shortfall: number }[]
  negMarginItems: { customer: string; date: string; docNo: string; id: string; loss: number; price: number; productName: string; qty: number; unitCost: number }[]
  outliers: { amount: number; category: string; date: string; docNo: string; id: string; mean: number; over: number; payee: string }[]
  sourceState: SourceState
  summary: { bankFee: number; fxLoss: number; interestExpense: number; negTotal: number; outlierCount: number; productionLoss: number; stockLoss: number; totalLeak: number }
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

export function WorkingCapitalPageClient() {
  const [periodDays, setPeriodDays] = useState(90)
  const [asOf, setAsOf] = useState(today())
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/working-capital?periodDays=${periodDays}&asOf=${asOf}${branchId ? `&branchId=${branchId}` : ''}`, [asOf, branchId, periodDays])
  const { data, error, isLoading } = useApi<WorkingPayload>(url)
  const s = data?.summary
  const maxDays = Math.max(s?.arDays ?? 0, s?.invDays ?? 0, s?.apDays ?? 0, 1)

  return (
    <section className="space-y-4">
      <Hero subtitle="Cash Conversion Cycle · AR/AP/Inv Days · Stock Turnover · Current/Quick Ratio" title="⚙️ Working Capital Analysis" tone="working" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <span className="text-sm">ช่วงวิเคราะห์</span>
        <select className="rounded-md border bg-white px-2 py-1.5 text-sm" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
          {[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} วันล่าสุด{days === 90 ? ' (แนะนำ)' : ''}</option>)}
        </select>
        <DateInput label="ถึง" value={asOf} onChange={setAsOf} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className="text-xs text-slate-500">ตั้งแต่ {data?.filters.from ?? '-'} ถึง {data?.filters.asOf ?? asOf}</span>
      </FilterPanel>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`relative overflow-hidden rounded-md p-5 text-white shadow-xl ${toneByCcc(s?.ccc ?? 0)}`}>
          <div className="absolute right-3 top-2 text-7xl opacity-15">⏱</div>
          <div className="text-xs opacity-80">💎 Cash Conversion Cycle</div>
          <div className="mt-1 text-5xl font-bold">{(s?.ccc ?? 0).toFixed(1)}</div>
          <div className="text-sm opacity-90">วัน · read baseline</div>
          <div className="mt-3 text-xs opacity-80">= AR ({(s?.arDays ?? 0).toFixed(0)}) + Inv ({(s?.invDays ?? 0).toFixed(0)}) - AP ({(s?.apDays ?? 0).toFixed(0)})</div>
        </div>
        <Panel className="md:col-span-2" title="📊 CCC Breakdown — แสดงเงินจมแต่ละขั้น">
          <BreakdownBar label="📥 AR Days (เก็บเงินลูกค้า)" tone="blue" value={s?.arDays ?? 0} max={maxDays} amount={s?.ar ?? 0} />
          <BreakdownBar label="📦 Inventory Days (Stock จมในมือ)" tone="amber" value={s?.invDays ?? 0} max={maxDays} amount={s?.inv ?? 0} />
          <BreakdownBar label="📤 AP Days (จ่าย Supplier ช้า = ดี)" tone="emerald" value={s?.apDays ?? 0} max={maxDays} amount={s?.ap ?? 0} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Gauge title="💧 Current Ratio" value={s?.currentRatio ?? 0} kind="current" footer="(Current Asset ÷ Current Liab)" />
        <Gauge title="⚡ Quick Ratio" value={s?.quickRatio ?? 0} kind="quick" footer="((Cash + AR) ÷ Current Liab)" />
        <Panel title="🔄 Stock Turnover">
          <div className="py-4 text-center"><div className="text-5xl font-bold text-purple-700">{(s?.stockTurnover ?? 0).toFixed(2)}<span className="text-xl">x</span></div><div className="mt-1 text-sm text-slate-500">ใน {periodDays} วัน</div><div className="mt-2 text-xs text-slate-400">= <b className="text-purple-600">{(s?.annualizedTurnover ?? 0).toFixed(1)}x</b> ต่อปี</div><div className={`mt-1 text-xs ${(s?.annualizedTurnover ?? 0) >= 6 ? 'text-emerald-600' : 'text-red-600'}`}>{(s?.annualizedTurnover ?? 0) >= 12 ? '✓ Stock หมุนดี' : (s?.annualizedTurnover ?? 0) >= 6 ? 'พอใช้' : '⚠ Stock หมุนช้า'}</div></div>
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Cash Conversion Cycle" value={`${(s?.ccc ?? 0).toFixed(1)} วัน`} tone={(s?.ccc ?? 0) < 60 ? 'emerald' : (s?.ccc ?? 0) < 90 ? 'amber' : 'red'} />
        <Kpi label="AR Days" value={(s?.arDays ?? 0).toFixed(1)} tone="blue" />
        <Kpi label="AP Days" value={(s?.apDays ?? 0).toFixed(1)} tone="emerald" />
        <Kpi label="Inventory Days" value={(s?.invDays ?? 0).toFixed(1)} tone="amber" />
        <Kpi label="Stock Turnover" value={`${(s?.stockTurnover ?? 0).toFixed(2)}x`} tone="slate" />
        <Kpi label="Current Ratio" value={(s?.currentRatio ?? 0).toFixed(2)} tone={(s?.currentRatio ?? 0) >= 1 ? 'emerald' : 'red'} />
        <Kpi label="Quick Ratio" value={(s?.quickRatio ?? 0).toFixed(2)} tone={(s?.quickRatio ?? 0) >= 0.5 ? 'emerald' : 'red'} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Insight tone="amber" title="📦 เงินจมใน Stock กี่วัน" value={`${(s?.invDays ?? 0).toFixed(0)} วัน`} body={`Stock มูลค่า ${money(s?.inv)} ÷ COGS เฉลี่ย/วัน ${money((s?.cogs ?? 0) / periodDays)}`} />
        <Insight tone="blue" title="💰 ลูกหนี้เก็บเงินกี่วัน" value={`${(s?.arDays ?? 0).toFixed(0)} วัน`} body={`AR ${money(s?.ar)} ÷ Sales เฉลี่ย/วัน ${money((s?.revenue ?? 0) / periodDays)}`} />
        <Insight tone="emerald" title="🏭 เจ้าหนี้จ่ายเงินกี่วัน" value={`${(s?.apDays ?? 0).toFixed(0)} วัน`} body={`AP ${money(s?.ap)} ÷ Purchases เฉลี่ย/วัน ${money((s?.purchases ?? 0) / periodDays)}`} />
        <Insight tone="purple" title="🔄 ซื้อของแล้วขายออกเร็วไหม?" value={`${(s?.annualizedTurnover ?? 0).toFixed(1)}x/ปี`} body="Stock Turnover (Annualized): COGS/Avg Inventory" />
      </div>
      <DetailTable isLoading={isLoading} rows={data?.calculationRows ?? []} />
    </section>
  )
}

export function StockFinancePageClient() {
  const [asOf, setAsOf] = useState(today())
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/stock-finance?asOf=${asOf}${branchId ? `&branchId=${branchId}` : ''}`, [asOf, branchId])
  const { data, error, isLoading } = useApi<StockPayload>(url)
  const total = Math.max(data?.summary.totalValue ?? 0, 1)

  return (
    <section className="space-y-4">
      <Hero subtitle="วิเคราะห์ Stock เชิงการเงิน · Paid/Unpaid · RM/WIP/FG · Aging · Slow Moving · Margin Potential" title="📦 Stock Finance Analysis" tone="stock" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel><DateInput label="As of" value={asOf} onChange={setAsOf} /><BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} /></FilterPanel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-amber-600 via-orange-700 to-red-700 p-6 text-white shadow-lg lg:col-span-2">
          <div className="relative"><div className="text-sm uppercase opacity-80">📦 มูลค่า Stock รวม (WAC)</div><div className="mt-2 text-5xl font-bold">{money(data?.summary.totalValue)}</div><div className="mt-1 text-sm opacity-90">บาท · {data?.summary.itemCount ?? 0} รายการ</div><div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/20 pt-4"><Mini label="✓ จ่ายแล้ว (Paid)" value={money(data?.summary.paidValue)} /><Mini label="⚠ ยังไม่จ่าย (Unpaid)" value={money(data?.summary.unpaidValue)} /><Mini label="💰 Margin Potential" value={money(data?.summary.marginPotential)} /></div></div>
        </div>
        <Panel title="🥧 RM / WIP / FG"><Donut values={[data?.byStatus.RM ?? 0, data?.byStatus.WIP ?? 0, data?.byStatus.FG ?? 0]} colors={['#3b82f6', '#f59e0b', '#10b981']} total={total} /><div className="mt-1 grid grid-cols-2 gap-1 text-[10px]"><div>RM: {money(data?.byStatus.RM)}</div><div>WIP: {money(data?.byStatus.WIP)}</div><div>FG: {money(data?.byStatus.FG)}</div><div>อื่นๆ: {money(data?.byStatus.OTHER)}</div></div></Panel>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="⏳ Stock Aging (มูลค่าตามอายุ)">{(data?.aging ?? []).map((row) => <AgingBar key={row.key} row={row} total={total} />)}</Panel>
        <Panel title="🏆 Top 10 สินค้า มูลค่า Stock สูงสุด">{(data?.topProducts ?? []).map((row, index) => <TopProduct key={row.id} index={index} max={data?.topProducts[0]?.value ?? 1} row={row} />)}{isLoading ? <Loading /> : null}</Panel>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Insight tone="emerald" title="✓ FG พร้อมขาย" value={money(data?.byStatus.FG)} body={`${percent(data?.byStatus.FG ?? 0, total)}% ของ Stock รวม · ปั่นเป็นเงินสดได้ทันที`} />
        <Insight tone="blue" title="🏭 RM ที่ต้องเอาไปผลิต" value={money(data?.byStatus.RM)} body={`${percent(data?.byStatus.RM ?? 0, total)}% ของ Stock รวม · ต้องเข้า Production`} />
        <Insight tone="red" title="⚠ Stock จมเงิน (90+ วัน)" value={money(data?.aging.find((row) => row.key === '90+')?.value)} body={`${data?.aging.find((row) => row.key === '90+')?.count ?? 0} รายการ — เร่งระบาย หรือลด price`} />
      </div>
      <ProductTable rows={data?.slowMoving ?? []} />
    </section>
  )
}

export function ProfitLeakPageClient() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [targetMargin, setTargetMargin] = useState(5)
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/profit-leak?from=${from}&to=${to}&targetMargin=${targetMargin}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, targetMargin, to])
  const { data, error } = useApi<ProfitPayload>(url)
  const totalLeak = Math.max(data?.summary.totalLeak ?? 0, 1)

  return (
    <section className="space-y-4">
      <Hero subtitle="ดูว่ากำไรหายตรงไหน · 10 จุดรั่วไหลของกำไร" title="🔻 Profit Leak Dashboard" tone="leak" />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel><DateInput label="From" value={from} onChange={setFrom} /><DateInput label="To" value={to} onChange={setTo} /><label className="flex items-center gap-2 text-sm"><span>Target GP %</span><input className="w-20 rounded-md border px-2 py-1.5 text-right text-sm" step="0.1" type="number" value={targetMargin} onChange={(event) => setTargetMargin(Number(event.target.value))} /></label><BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} /><span className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-bold text-red-700">รวมรั่วไหล: {money(data?.summary.totalLeak)}</span></FilterPanel>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-red-500 via-rose-600 to-pink-700 p-5 text-white shadow-xl"><div className="absolute right-3 top-2 text-7xl opacity-15">🔻</div><div className="text-xs opacity-90">💔 รวมเงินที่รั่วไหล</div><div className="mt-1 text-4xl font-bold">{money(data?.summary.totalLeak)}</div><div className="mt-3 space-y-0.5 text-xs opacity-90"><div>📉 ขายต่ำกว่าทุน: <b>{money(data?.summary.negTotal)}</b> ({data?.negMarginItems.length ?? 0} รายการ)</div><div>⚠ ค่าใช้จ่ายผิดปกติ: <b>{data?.summary.outlierCount ?? 0}</b> รายการ</div><div>📦 Stock Loss: <b>{money(data?.summary.stockLoss)}</b></div><div>🏭 Production Loss: <b>{money(data?.summary.productionLoss)}</b></div></div></div>
        <Panel className="md:col-span-2" title="🥧 องค์ประกอบของเงินรั่วไหล"><div className="flex flex-wrap items-center gap-4"><Donut values={(data?.leakSegments ?? []).map((row) => row.value)} colors={['#dc2626', '#a855f7', '#f43f5e', '#ec4899', '#06b6d4', '#0891b2']} total={totalLeak} /> <div className="flex-1 space-y-1 text-xs">{(data?.leakSegments ?? []).map((row, index) => <div className="flex items-center gap-2" key={row.label}><span className="h-3 w-3 rounded-md" style={{ background: ['#dc2626', '#a855f7', '#f43f5e', '#ec4899', '#06b6d4', '#0891b2'][index] }} />{row.label}<span className="ml-auto font-bold">{money(row.value)}</span></div>)}</div></div></Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Kpi label="📉 ขายต่ำกว่า WAC" value={money(data?.summary.negTotal)} tone="red" />
        <Kpi label="⬇ GP ต่ำกว่า Target" value={String(data?.lowMarginBills.length ?? 0)} tone="amber" />
        <Kpi label="⚠ ค่าใช้จ่ายผิดปกติ" value={String(data?.summary.outlierCount ?? 0)} tone="orange" />
        <Kpi label="💸 ดอกเบี้ย" value={money(data?.summary.interestExpense)} tone="purple" />
        <Kpi label="📦 Stock Loss" value={money(data?.summary.stockLoss)} tone="red" />
        <Kpi label="🏭 Production Loss" value={money(data?.summary.productionLoss)} tone="rose" />
        <Kpi label="💱 FX Loss" value={money(data?.summary.fxLoss)} tone="cyan" />
        <Kpi label="🏦 Bank Fee" value={money(data?.summary.bankFee)} tone="slate" />
        <Kpi label="👥 ลูกค้ากำไรต่ำ" value={String(data?.lowCustomers.length ?? 0)} tone="yellow" />
        <Kpi label="🏭 Supplier ราคาแพง" value={String(data?.highSuppliers.length ?? 0)} tone="emerald" />
      </div>
      <NegativeMarginTable rows={data?.negMarginItems ?? []} total={data?.summary.negTotal ?? 0} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3"><LowMarginTable rows={data?.lowMarginBills ?? []} targetMargin={targetMargin} /><LowCustomerTable rows={data?.lowCustomers ?? []} /><HighSupplierTable rows={data?.highSuppliers ?? []} /></div>
      <OutlierTable rows={data?.outliers ?? []} />
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

function percent(value: number, total: number) {
  return total > 0 ? (value / total * 100).toFixed(1) : '0.0'
}

function Hero({ subtitle, title, tone }: { subtitle: string; title: string; tone: 'leak' | 'stock' | 'working' }) {
  const gradient = tone === 'working' ? 'from-teal-700 to-cyan-700' : tone === 'stock' ? 'from-amber-700 to-orange-700' : 'from-rose-700 to-red-700'
  return <div className={`rounded-md bg-gradient-to-r ${gradient} p-5 text-white shadow`}><h1 className="text-xl font-bold md:text-2xl">{title}</h1><p className="mt-1 text-sm opacity-80">{subtitle}</p></div>
}

function BaselineNotice({ sourceState }: { sourceState?: SourceState }) {
  return <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"><b>Finance analysis read baseline</b><span className="ml-2">คำนวณจากข้อมูลธุรกรรม ยังไม่ใช่ GL/statutory report และไม่มี write action</span>{sourceState ? <div className="mt-1 text-xs text-amber-800">{sourceState.limitations[0]}</div> : null}</div>
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

function Panel({ children, className = '', title }: { children: ReactNode; className?: string; title: string }) {
  return <div className={`rounded-md bg-white p-4 shadow ${className}`}><div className="mb-3 text-sm font-bold text-slate-700">{title}</div>{children}</div>
}

function BreakdownBar({ amount, label, max, tone, value }: { amount: number; label: string; max: number; tone: 'amber' | 'blue' | 'emerald'; value: number }) {
  const cls = tone === 'blue' ? 'from-blue-400 to-blue-600 text-blue-700' : tone === 'amber' ? 'from-amber-400 to-orange-500 text-amber-700' : 'from-emerald-400 to-teal-500 text-emerald-700'
  return <div className="mb-3"><div className="mb-1 flex justify-between text-xs"><span className={`font-bold ${cls.split(' ').at(-1)}`}>{label}</span><span className="font-bold">{value.toFixed(1)} วัน · {money(amount)}</span></div><div className="h-4 overflow-hidden rounded-md-full bg-slate-100"><div className={`h-full rounded-md-full bg-gradient-to-r ${cls}`} style={{ width: `${Math.min(100, value / max * 100)}%` }} /></div></div>
}

function Gauge({ footer, kind, title, value }: { footer: string; kind: 'current' | 'quick'; title: string; value: number }) {
  const threshold = kind === 'current' ? [1.5, 1] : [1, 0.5]
  const color = value >= threshold[0] ? '#10b981' : value >= threshold[1] ? '#f59e0b' : '#ef4444'
  const text = value >= threshold[0] ? 'ดี' : value >= threshold[1] ? 'พอใช้' : '⚠ เสี่ยง'
  const dash = Math.min(220, value * (kind === 'current' ? 73 : 110))
  return <Panel title={title}><svg viewBox="0 0 200 110" className="h-[100px] w-full"><path d="M 30 90 A 70 70 0 0 1 170 90" stroke="#e2e8f0" strokeLinecap="round" strokeWidth="14" fill="none" /><path d="M 30 90 A 70 70 0 0 1 170 90" stroke={color} strokeDasharray={`${dash} 220`} strokeLinecap="round" strokeWidth="14" fill="none" /><text fill={color} fontSize="28" fontWeight="bold" textAnchor="middle" x="100" y="80">{value.toFixed(2)}</text><text fill="#64748b" fontSize="10" textAnchor="middle" x="100" y="100">{text}</text></svg><div className="mt-1 text-center text-xs text-slate-500">{footer}</div></Panel>
}

function Kpi({ label, tone, value }: { label: string; tone: string; value: string }) {
  const map: Record<string, string> = { amber: 'border-amber-500 bg-amber-50 text-amber-700', blue: 'border-blue-500 bg-blue-50 text-blue-700', cyan: 'border-cyan-500 bg-cyan-50 text-cyan-700', emerald: 'border-emerald-500 bg-emerald-50 text-emerald-700', orange: 'border-orange-500 bg-orange-50 text-orange-700', purple: 'border-purple-500 bg-purple-50 text-purple-700', red: 'border-red-500 bg-red-50 text-red-700', rose: 'border-rose-500 bg-rose-50 text-rose-700', slate: 'border-slate-500 bg-white text-slate-700', yellow: 'border-yellow-500 bg-yellow-50 text-yellow-700' }
  const cls = map[tone] ?? map.slate
  return <div className={`rounded-md border-l-4 p-3 shadow ${cls}`}><div className="text-xs">{label}</div><div className="text-lg font-bold">{value}</div></div>
}

function Insight({ body, title, tone, value }: { body: string; title: string; tone: string; value: string }) {
  const map: Record<string, string> = { amber: 'border-amber-500 bg-amber-50 text-amber-700', blue: 'border-blue-500 bg-blue-50 text-blue-700', emerald: 'border-emerald-500 bg-emerald-50 text-emerald-700', purple: 'border-purple-500 bg-purple-50 text-purple-700', red: 'border-red-500 bg-red-50 text-red-700' }
  return <div className={`rounded-md border-l-4 p-4 ${map[tone] ?? map.blue}`}><h3 className="mb-1 font-bold text-slate-900">{title}</h3><div className="mb-1 text-2xl font-bold">{value}</div><div className="text-xs text-slate-600">{body}</div></div>
}

function DetailTable({ isLoading, rows }: { isLoading: boolean; rows: WorkingPayload['calculationRows'] }) {
  return <div className="rounded-md bg-white p-4 shadow"><h3 className="mb-3 font-bold">📋 ตารางคำนวณ</h3><table className="w-full text-sm"><tbody>{isLoading ? <tr><td className="py-6 text-center text-slate-400" colSpan={2}>กำลังโหลดข้อมูล</td></tr> : null}{rows.map((row) => <tr key={row.label} className={`border-t ${row.tone === 'blue' ? 'bg-blue-50' : row.tone === 'emerald' ? 'bg-emerald-50' : row.tone === 'amber' ? 'bg-amber-50' : row.tone === 'purple' ? 'bg-purple-50' : ''}`}><td className="p-2">{row.label}</td><td className="p-2 text-right font-bold">{money(row.value)}</td></tr>)}</tbody></table></div>
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] opacity-75">{label}</div><div className="text-xl font-bold text-yellow-100">{value}</div></div>
}

function Donut({ colors, total, values }: { colors: string[]; total: number; values: number[] }) {
  const segments = values.reduce<{ dash: number; offset: number; value: number }[]>((acc, value) => {
    const dash = value / Math.max(1, total) * 440
    const offset = acc.reduce((sum, row) => sum + row.dash, 0)
    return [...acc, { dash, offset, value }]
  }, [])
  return <svg viewBox="0 0 200 200" className="mx-auto h-40 w-40 shrink-0">{segments.map((segment, index) => <circle key={`${index}-${segment.value}`} cx="100" cy="100" fill="none" r="70" stroke={colors[index % colors.length]} strokeDasharray={`${segment.dash} 440`} strokeDashoffset={-segment.offset} strokeWidth="40" transform="rotate(-90 100 100)" />)}<text x="100" y="98" textAnchor="middle" fontSize="10" fill="#64748b">รวม</text><text x="100" y="115" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1e293b">{money(total)}</text></svg>
}

function AgingBar({ row, total }: { row: { count: number; key: string; value: number }; total: number }) {
  return <div className="mb-2 flex items-center gap-3 text-xs"><div className="w-20 font-semibold">{row.key} วัน</div><div className="relative h-6 flex-1 overflow-hidden rounded-md-full bg-slate-100"><div className="h-6 rounded-md-full bg-amber-500" style={{ width: `${Math.max(row.value / total * 100, row.value > 0 ? 1 : 0)}%` }} /><span className="absolute left-2 top-0.5 text-[11px] font-bold text-white">{row.count} รายการ</span><span className="absolute right-2 top-0.5 text-[11px] font-bold text-slate-700">{percent(row.value, total)}%</span></div><div className="w-28 text-right font-bold text-slate-700">{money(row.value)}</div></div>
}

function TopProduct({ index, max, row }: { index: number; max: number; row: StockProduct }) {
  return <div className="mb-1 flex items-center gap-2 text-xs"><span className="w-5 text-center font-bold text-amber-600">{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-700">{row.name}</div><div className="text-[10px] text-slate-400">{money(row.qty)} kg · WAC {money(row.wac)} · {row.status}</div></div><div className="h-2.5 w-24 rounded-md-full bg-slate-100"><div className="h-2.5 rounded-md-full bg-amber-500" style={{ width: `${Math.min(100, row.value / Math.max(1, max) * 100)}%` }} /></div><div className="w-24 text-right font-bold text-amber-700">{money(row.value)}</div></div>
}

function ProductTable({ rows }: { rows: StockProduct[] }) {
  return <div className="rounded-md bg-white shadow"><div className="border-b bg-red-50 p-3 font-bold text-red-700">Slow Moving / สินค้าที่ควรรีบขาย (Top 15 — ไม่ขาย &gt; 60 วัน)</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><Th>รหัส</Th><Th>ชื่อ</Th><Th>หมวด</Th><Th align="right">จำนวน</Th><Th align="right">WAC</Th><Th align="right">มูลค่า</Th><Th align="right">ครั้งสุดท้ายขาย</Th><Th align="right">ราคามาตรฐาน</Th><Th align="right">Margin Pot</Th></tr></thead><tbody>{rows.map((row) => <tr className="border-t bg-red-50/30" key={row.id}><Td mono>{row.code}</Td><Td>{row.name}</Td><Td>{row.metalGroup}</Td><Td align="right">{money(row.qty)}</Td><Td align="right">{money(row.wac)}</Td><Td align="right" strong>{money(row.value)}</Td><Td align="right">{row.daysSinceSale >= 9999 ? 'ไม่เคยขาย' : `${row.daysSinceSale} วัน`}</Td><Td align="right">{money(row.stdPrice)}</Td><Td align="right">{money(row.marginPotential)}</Td></tr>)}{!rows.length ? <tr><td className="py-8 text-center text-slate-400" colSpan={9}>ไม่มี Slow Moving ✓</td></tr> : null}</tbody></table></div></div>
}

function NegativeMarginTable({ rows, total }: { rows: ProfitPayload['negMarginItems']; total: number }) {
  return <div className="rounded-md bg-white shadow"><div className="flex justify-between border-b bg-red-50 p-3 font-bold text-red-700"><span>📉 ขายต่ำกว่า WAC ({rows.length} รายการ)</span><span>รวมขาดทุน {money(total)}</span></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><Th>วันที่</Th><Th>บิล</Th><Th>ลูกค้า</Th><Th>สินค้า</Th><Th align="right">Qty</Th><Th align="right">ราคา</Th><Th align="right">WAC</Th><Th align="right">ขาดทุน</Th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t bg-red-50/30"><Td>{row.date}</Td><Td mono>{row.docNo}</Td><Td>{row.customer}</Td><Td>{row.productName}</Td><Td align="right">{money(row.qty)}</Td><Td align="right">{money(row.price)}</Td><Td align="right">{money(row.unitCost)}</Td><Td align="right" strong>{money(row.loss)}</Td></tr>)}{!rows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={8}>ไม่มี ✓</td></tr> : null}</tbody></table></div></div>
}

function LowMarginTable({ rows, targetMargin }: { rows: ProfitPayload['lowMarginBills']; targetMargin: number }) {
  return <SmallTable heading={`⬇ บิลที่ GP < ${targetMargin}%`}><tbody>{rows.map((row) => <tr className="border-t" key={row.id}><Td mono>{row.docNo}</Td><Td>{row.customer}</Td><Td align="right">{row.gpPct.toFixed(1)}%</Td><Td align="right">{money(row.shortfall)}</Td></tr>)}{!rows.length ? <Empty colSpan={4} /> : null}</tbody></SmallTable>
}

function LowCustomerTable({ rows }: { rows: ProfitPayload['lowCustomers'] }) {
  return <SmallTable heading="👥 ลูกค้ากำไรต่ำ (Top 10)" headers={['ลูกค้า', 'ยอดขาย', 'GP%']}><tbody>{rows.map((row) => <tr className="border-t" key={row.id}><Td>{row.name}</Td><Td align="right">{money(row.revenue)}</Td><Td align="right">{row.gpPct.toFixed(1)}%</Td></tr>)}{!rows.length ? <Empty colSpan={3} /> : null}</tbody></SmallTable>
}

function HighSupplierTable({ rows }: { rows: ProfitPayload['highSuppliers'] }) {
  return <SmallTable heading="🏭 Supplier ต้นทุนสูง (Top 10)" headers={['Supplier', 'สินค้า', '+%', 'ส่วนเกิน']}><tbody>{rows.map((row) => <tr className="border-t" key={row.id}><Td>{row.supplierName}</Td><Td>{row.productName}</Td><Td align="right">{row.premiumPct.toFixed(1)}%</Td><Td align="right">{money(row.premium * row.qty)}</Td></tr>)}{!rows.length ? <Empty colSpan={4} /> : null}</tbody></SmallTable>
}

function OutlierTable({ rows }: { rows: ProfitPayload['outliers'] }) {
  return <div className="rounded-md bg-white shadow"><div className="border-b bg-orange-50 p-3 font-bold text-orange-700">⚠ ค่าใช้จ่ายผิดปกติ ({rows.length}) — สูงเกิน mean + 1.5×stddev</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><Th>วันที่</Th><Th>หมวด</Th><Th>เลขที่</Th><Th>ผู้รับ</Th><Th align="right">จำนวน</Th><Th align="right">ค่าเฉลี่ย</Th><Th align="right">เกินกว่าปกติ</Th></tr></thead><tbody>{rows.map((row) => <tr className="border-t bg-orange-50/30" key={row.id}><Td>{row.date}</Td><Td>{row.category}</Td><Td mono>{row.docNo}</Td><Td>{row.payee}</Td><Td align="right" strong>{money(row.amount)}</Td><Td align="right">{money(row.mean)}</Td><Td align="right" strong>{money(row.over)}</Td></tr>)}{!rows.length ? <Empty colSpan={7} /> : null}</tbody></table></div></div>
}

function SmallTable({ children, headers = ['บิล', 'ลูกค้า', 'GP%', 'ขาด'], heading }: { children: ReactNode; headers?: string[]; heading: string }) {
  return <div className="rounded-md bg-white shadow"><div className="border-b bg-amber-50 p-3 font-bold text-amber-700">{heading}</div><div className="max-h-64 overflow-x-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{headers.map((header, index) => <Th align={index > 0 ? 'right' : 'left'} key={header}>{header}</Th>)}</tr></thead>{children}</table></div></div>
}

function Empty({ colSpan }: { colSpan: number }) {
  return <tr><td className="py-4 text-center text-slate-400" colSpan={colSpan}>ไม่มี ✓</td></tr>
}

function Th({ align = 'left', children }: { align?: 'left' | 'right'; children: ReactNode }) {
  return <th className={`whitespace-nowrap p-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>
}

function Td({ align = 'left', children, mono = false, strong = false }: { align?: 'left' | 'right'; children: ReactNode; mono?: boolean; strong?: boolean }) {
  return <td className={`whitespace-nowrap p-2 text-xs ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'font-mono' : ''} ${strong ? 'font-bold text-red-700' : ''}`}>{children}</td>
}

function Loading() {
  return <div className="py-4 text-center text-slate-400">กำลังโหลดข้อมูล</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}

function toneByCcc(value: number) {
  if (value < 60) return 'bg-gradient-to-br from-emerald-500 to-teal-700'
  if (value < 90) return 'bg-gradient-to-br from-amber-500 to-orange-600'
  return 'bg-gradient-to-br from-red-500 to-rose-700'
}
