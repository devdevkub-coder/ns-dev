'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type DetailRow = { amount: number; date: string; description: string; refNo: string }
type StatementLine = { amount: number; details?: DetailRow[]; label: string; level?: number; section: string; tone?: 'default' | 'good' | 'bad' | 'muted' | 'total' }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }
type DrillColumnKey = 'amount' | 'date' | 'description' | 'refNo'
type StatementColumnKey = 'amount' | 'drill' | 'label' | 'section'
type SortDirection = 'asc' | 'desc'

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

const statementColumns: Array<ResizableColumnDefinition<StatementColumnKey>> = [
  { key: 'label', defaultWidth: 280, minWidth: 190 },
  { key: 'section', defaultWidth: 165, minWidth: 125 },
  { key: 'amount', defaultWidth: 170, minWidth: 135 },
  { key: 'drill', defaultWidth: 125, minWidth: 105 },
]

const drillColumns: Array<ResizableColumnDefinition<DrillColumnKey>> = [
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'refNo', defaultWidth: 150, minWidth: 120 },
  { key: 'description', defaultWidth: 330, minWidth: 200 },
  { key: 'amount', defaultWidth: 170, minWidth: 135 },
]

function compareSortValues(left: string | number, right: string | number) {
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getStatementSortValue(line: StatementLine, key: StatementColumnKey) {
  if (key === 'drill') return line.details?.length ?? 0
  return line[key]
}

function getDrillSortValue(row: DetailRow, key: DrillColumnKey) {
  return row[key]
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <Segment active>📅 ช่วงวันที่</Segment><Segment>📆 รายเดือน</Segment><Segment>📊 ตารางรายปี (12 เดือน)</Segment>
        <QuickButton onClick={() => { const now = new Date(); setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)); setTo(today()) }}>📊 ปีนี้</QuickButton>
        <QuickButton onClick={() => setFrom(monthStart())}>เดือนนี้</QuickButton>
        <DateInput label="จาก" value={from} onChange={setFrom} /><DateInput label="ถึง" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <select className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:outline-none focus:border-slate-400 transition cursor-pointer" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="ALL">All (Stock+Trading)</option><option value="STOCK">Stock Only</option><option value="TRADING">Trading Only</option>
        </select>
        <DisabledButton>📥 Excel</DisabledButton>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-md bg-white p-3 shadow lg:hidden space-y-3">
        <div className="flex gap-2">
          <button 
            type="button" 
            onClick={() => setFrom(monthStart())}
            className="flex-1 h-9 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 outline-none"
          >
            เดือนนี้
          </button>
          <button 
            type="button" 
            onClick={() => { const now = new Date(); setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)); setTo(today()) }}
            className="flex-1 h-9 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 outline-none"
          >
            ปีนี้
          </button>
          <button
            type="button"
            className="flex-1 h-9 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(branchId || mode !== 'ALL') ? '(มี)' : ''}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">จาก</span>
            <input
              type="date"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-xs outline-none bg-white"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">ถึง</span>
            <input
              type="date"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-xs outline-none bg-white"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
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

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">ประเภทรายการ</label>
                <select
                  aria-label="Mode select"
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                >
                  <option value="ALL">All (Stock+Trading)</option>
                  <option value="STOCK">Stock Only</option>
                  <option value="TRADING">Trading Only</option>
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-semibold text-sm cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60"
                >
                  📥 Export Excel
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBranchId('')
                  setMode('ALL')
                }}
                className="flex-1 h-10 rounded-md border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
      <StatementTable isLoading={isLoading} rows={data?.sections ?? []} tableKey="pl-statement" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <DateInput label="As of" value={asOf} onChange={setAsOf} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${data?.balanceCheck.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{data?.balanceCheck.balanced ? 'BALANCED' : `OFF BY ${money(data?.balanceCheck.difference)}`}</span>
        <DisabledButton>📥 Excel</DisabledButton>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-md bg-white p-3 shadow lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold shrink-0">As of</span>
            <DatePickerInput className="w-full" value={asOf} onChange={setAsOf} />
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

              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">สถานะงบแสดงฐานะการเงิน</span>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${data?.balanceCheck.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{data?.balanceCheck.balanced ? 'BALANCED' : `OFF BY ${money(data?.balanceCheck.difference)}`}</span>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-semibold text-sm cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60"
                >
                  📥 Export Excel
                </button>
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
                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MegaCard footer={`Liabilities + Equity ${money(data?.summary.liabilitiesAndEquity)}`} label="Total Assets" tone="bs" value={money(data?.summary.totalAssets)} />
        <Panel title="🥧 Assets Breakdown"><Waterfall rows={[['Cash', data?.summary.cash ?? 0], ['AR', data?.summary.ar ?? 0], ['Inventory', data?.summary.inventory ?? 0], ['Fixed Asset', data?.summary.fixedAssetNet ?? 0]]} /></Panel>
        <Panel title="🥧 Liab + Equity"><Waterfall rows={[['AP', data?.summary.ap ?? 0], ['Current Loan', data?.summary.currentLoan ?? 0], ['Long-term Loan', data?.summary.longTermLoan ?? 0], ['Equity', data?.summary.totalEquity ?? 0]]} /></Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Working Capital" value={money(data?.ratios.workingCapital)} tone="blue" />
        <StatCard label="Current Ratio" value={(data?.ratios.currentRatio ?? 0).toFixed(2)} tone="cyan" />
        <div className="col-span-2 md:col-span-1">
          <StatCard label="Debt / Equity" value={(data?.ratios.debtToEquity ?? 0).toFixed(2)} tone="purple" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <StatementTable isLoading={isLoading} rows={data?.sections.assets ?? []} tableKey="balance-sheet-assets" title="Assets" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
        <StatementTable isLoading={isLoading} rows={[...(data?.sections.liabilities ?? []), ...(data?.sections.equity ?? [])]} tableKey="balance-sheet-liabilities-equity" title="Liabilities + Equity" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <DateInput label="จาก" value={from} onChange={setFrom} /><DateInput label="ถึง" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <DisabledButton>📥 Excel</DisabledButton>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-md bg-white p-3 shadow lg:hidden space-y-3">
        <div className="flex gap-2">
          <button 
            type="button" 
            onClick={() => setFrom(monthStart())}
            className="flex-1 h-9 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 outline-none"
          >
            เดือนนี้
          </button>
          <button 
            type="button" 
            onClick={() => { const now = new Date(); setFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)); setTo(today()) }}
            className="flex-1 h-9 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 outline-none"
          >
            ปีนี้
          </button>
          <button
            type="button"
            className="flex-1 h-9 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {branchId ? '(มี)' : ''}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">จาก</span>
            <input
              type="date"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-xs outline-none bg-white text-slate-900"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 block">ถึง</span>
            <input
              type="date"
              className="w-full h-9 rounded-md border border-slate-300 px-3 text-xs outline-none bg-white text-slate-900"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
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

              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-semibold text-sm cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60"
                >
                  📥 Export Excel
                </button>
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
                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
      <StatementTable isLoading={isLoading} rows={data?.rows ?? []} tableKey="cash-flow-statement" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
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

function BaselineNotice({ sourceState }: { sourceState?: SourceState }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-xs text-amber-900 shadow-sm">
      <span className="font-bold">⚠️ Management statement / read baseline</span>
      <span className="ml-2">รายงานเพื่อผู้บริหารจากข้อมูลธุรกรรม ยังไม่ใช่งบการเงินตามบัญชี GL</span>
      {sourceState ? <div className="mt-1 text-xs text-amber-800">{sourceState.limitations[0]}</div> : null}
    </div>
  )
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">{children}</div>
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 text-xs text-slate-600"><span>{label}</span><DatePickerInput className="w-[140px]" value={value} onChange={onChange} /></label>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <select className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:outline-none focus:border-slate-400 transition cursor-pointer" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
}

function Segment({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span className={`rounded-md px-3 py-1.5 text-xs font-semibold outline-none focus:ring-0 ${active ? 'bg-[#0F172A] text-white' : 'bg-slate-50 border border-slate-100 text-slate-600 hover:bg-slate-100 transition'}`}>
      {children}
    </span>
  )
}

function QuickButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="rounded-md bg-slate-50 border border-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition outline-none focus:ring-0" type="button" onClick={onClick}>{children}</button>
}

function DisabledButton({ children }: { children: ReactNode }) {
  return <button className="rounded-lg bg-slate-100 border border-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400 opacity-60 cursor-not-allowed outline-none focus:ring-0" disabled type="button">{children}</button>
}

function MegaCard({ footer, label, tone, value }: { footer: string; label: string; tone: 'bs' | 'cf' | 'pl'; value: string }) {
  const toneColors = {
    pl: { text: 'text-emerald-600', bg: 'bg-emerald-50 text-emerald-600', icon: '📈' },
    bs: { text: 'text-blue-600', bg: 'bg-blue-50 text-blue-600', icon: '🏢' },
    cf: { text: 'text-cyan-600', bg: 'bg-cyan-50 text-cyan-600', icon: '🌊' }
  }
  const current = toneColors[tone]
  return (
    <div className="bg-white p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-4 lg:col-span-2">
      <div className={`w-12 h-12 rounded-full ${current.bg} flex items-center justify-center text-xl shrink-0`}>
        {current.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${current.text} uppercase`}>{label}</div>
        <div className="mt-0.5 text-2xl font-extrabold text-slate-900 tracking-tight">{value}</div>
        <div className="mt-3 text-xs text-slate-400 pt-2 border-t border-slate-100">{footer}</div>
      </div>
    </div>
  )
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><h2 className="mb-3 text-xs font-bold text-slate-800">{title}</h2>{children}</div>
}

function StatCard({ label, tone, value }: { label: string; tone: 'blue' | 'cyan' | 'emerald' | 'purple' | 'red'; value: string }) {
  const toneStyles = {
    blue: { text: 'text-blue-600', bg: 'bg-blue-50', icon: '💰' },
    cyan: { text: 'text-cyan-600', bg: 'bg-cyan-50', icon: '📊' },
    emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50', icon: '💵' },
    purple: { text: 'text-purple-600', bg: 'bg-purple-50', icon: '📈' },
    red: { text: 'text-red-600', bg: 'bg-red-50', icon: '📉' }
  }
  const current = toneStyles[tone]
  return (
    <div className="bg-white p-3.5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${current.bg} ${current.text} flex items-center justify-center text-lg shrink-0`}>
        {current.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs sm:text-xs font-semibold text-slate-500 truncate">{label}</div>
        <div className="mt-0.5 text-sm sm:text-base font-bold text-slate-900 tracking-tight">{value}</div>
      </div>
    </div>
  )
}

function SplitCard({ cogs, label, revenue, tone }: { cogs: number; label: string; revenue: number; tone: 'emerald' | 'purple' }) {
  const color = tone === 'emerald' ? 'border-emerald-100 bg-emerald-50/20 text-emerald-800' : 'border-purple-100 bg-purple-50/20 text-purple-800'
  return (
    <div className={`rounded-xl border ${color} p-4 shadow-sm`}>
      <div className="text-xs font-bold">{label} Split</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-slate-400 text-xs">Revenue</div><b className="text-slate-800">{money(revenue)}</b></div>
        <div><div className="text-slate-400 text-xs">COGS</div><b className="text-slate-800">{money(cogs)}</b></div>
        <div><div className="text-slate-400 text-xs">Gross Profit</div><b className={tone === 'emerald' ? 'text-emerald-700' : 'text-purple-700'}>{money(revenue - cogs)}</b></div>
      </div>
    </div>
  )
}

function Waterfall({ rows }: { rows: Array<[string, number]> }) {
  const max = Math.max(...rows.map((row) => Math.abs(row[1])), 1)
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="text-xs">
          <div className="mb-1 flex justify-between gap-2">
            <span className="text-slate-600">{label}</span>
            <b className={value < 0 ? 'text-red-700' : 'text-slate-800'}>{money(value)}</b>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${value < 0 ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function StatementTable({ isLoading, onDrill, rows, tableKey, title = 'Statement' }: { isLoading: boolean; onDrill: (line: StatementLine) => void | undefined; rows: StatementLine[]; tableKey: string; title?: string }) {
  const columnResize = useResizableColumns(`finance-accounting.financial-statements.${tableKey}.v1`, statementColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<StatementLine, StatementColumnKey>(rows, getStatementSortValue)

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="text-sm font-bold text-slate-700">{title}</div>
        {columnResize.hasCustomWidths ? (
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
      <div className="max-h-[62vh] overflow-auto">
        {/* Desktop Table View */}
        <table className="hidden min-w-full divide-y divide-slate-200 text-sm lg:table" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {statementColumns.map((column, index) => {
              if (index === statementColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            })}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <ResizableTableHead label="รายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="label" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('label', 'รายการ')} />
              <ResizableTableHead label="หมวดรายงาน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="section" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('section', 'หมวดรายงาน')} />
              <ResizableTableHead align="right" label="จำนวนเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวนเงิน')} />
              <ResizableTableHead align="center" label="รายละเอียด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="drill" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('drill', 'รายละเอียด')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <LoadingOrEmpty colSpan={statementColumns.length} isLoading={isLoading} rows={rows.length} />
            {sortedRows.map((line) => (
              <tr key={`${line.section}-${line.label}`} className={`transition-colors hover:bg-slate-50 ${line.tone === 'total' ? 'bg-slate-50/50 font-bold' : ''}`}>
                <td className="px-3 py-3 text-slate-900"><span className={line.level ? 'pl-5' : ''}>{line.label}</span></td>
                <td className="px-3 py-3"><span className="rounded-md bg-slate-100/80 px-2 py-0.5 text-xs font-medium text-slate-500">{line.section}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">
                  <span className={line.amount < 0 ? 'font-bold text-red-700' : line.tone === 'good' ? 'font-bold text-emerald-700' : 'font-bold text-slate-900'}>
                    {money(line.amount)}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  {line.details?.length ? (
                    <button className="font-semibold text-blue-600 hover:underline outline-none focus:ring-0" type="button" onClick={() => onDrill(line)}>🔍 {line.details.length}</button>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile Card List View */}
        <div className="block lg:hidden divide-y divide-slate-100">
          <LoadingOrEmptyMobile isLoading={isLoading} rows={rows.length} />
          {!isLoading && sortedRows.map((line) => (
            <div key={`${line.section}-${line.label}`} className={`p-4 transition ${line.tone === 'total' ? 'bg-slate-50/50 font-bold' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className={`${line.level ? 'pl-4' : ''} text-sm text-slate-900 font-semibold`}>
                    {line.label}
                  </div>
                  <div>
                    <span className="rounded-md bg-slate-100/80 px-2 py-0.5 text-xs text-slate-500 font-medium">
                      {line.section}
                    </span>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-sm ${line.amount < 0 ? 'font-bold text-red-700' : line.tone === 'good' ? 'font-bold text-emerald-700' : 'font-bold text-slate-900'}`}>
                    {money(line.amount)}
                  </span>
                  {line.details?.length ? (
                    <button className="text-xs font-semibold text-blue-600 hover:underline outline-none focus:ring-0" type="button" onClick={() => onDrill(line)}>🔍 ดูรายละเอียด ({line.details.length})</button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DrillModal({ onClose, rows, title }: { onClose: () => void; rows: DetailRow[]; title: string }) {
  const columnResize = useResizableColumns('finance-accounting.financial-statements.drill.v1', drillColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<DetailRow, DrillColumnKey>(rows, getDrillSortValue)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-md bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
          <h2 className="text-sm font-bold">🔍 {title}</h2>
          <button className="text-slate-300 hover:text-white text-xs font-semibold outline-none focus:ring-0" type="button" onClick={onClose}>
            ปิด
          </button>
        </div>
        {columnResize.hasCustomWidths ? (
          <div className="hidden justify-end border-b border-slate-100 bg-white px-3 py-2 lg:flex">
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          </div>
        ) : null}
        <div className="max-h-[60vh] overflow-auto">
          {/* Desktop Table View */}
          <table className="hidden min-w-full divide-y divide-slate-200 text-sm lg:table" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {drillColumns.map((column, index) => {
                if (index === drillColumns.length - 1) {
                  return <col key={column.key} style={{ minWidth: column.minWidth }} />
                }
                return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              })}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <ResizableTableHead label="วันที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
                <ResizableTableHead label="เลขที่เอกสาร" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="refNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขที่เอกสาร')} />
                <ResizableTableHead label="รายละเอียด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="description" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('description', 'รายละเอียด')} />
                <ResizableTableHead align="right" label="จำนวนเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวนเงิน')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map((row, index) => (
                <tr key={`${row.refNo}-${index}`} className="transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.date}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-blue-700">{row.refNo}</td>
                  <td className="min-w-0 px-3 py-3 text-slate-700"><div className="truncate">{row.description}</div></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums"><span className={row.amount < 0 ? 'text-red-700' : 'text-slate-800'}>{money(row.amount)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile Card List View */}
          <div className="block lg:hidden divide-y divide-slate-100">
            {sortedRows.map((row, index) => (
              <div key={`${row.refNo}-${index}`} className="p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{row.date}</span>
                  <span className="font-mono text-blue-700 font-semibold">{row.refNo}</span>
                </div>
                <div className="text-slate-700 break-words">{row.description}</div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-400">จำนวนเงิน</span>
                  <span className={`font-bold ${row.amount < 0 ? 'text-red-700' : 'text-slate-800'}`}>
                    {money(row.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingOrEmptyMobile({ isLoading, rows }: { isLoading: boolean; rows: number }) {
  if (isLoading) return <div className="py-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>
  if (rows === 0) return <div className="py-8 text-center text-slate-400 text-xs">ยังไม่มีข้อมูล</div>
  return null
}

function LoadingOrEmpty({ colSpan, isLoading, rows }: { colSpan: number; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>ยังไม่มีข้อมูล</td></tr>
  return null
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
