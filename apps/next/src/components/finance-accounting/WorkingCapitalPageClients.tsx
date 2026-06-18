'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { RotateCcw } from 'lucide-react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
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

type StockProductColumnKey = 'code' | 'name' | 'metalGroup' | 'qty' | 'wac' | 'value' | 'daysSinceSale' | 'stdPrice' | 'marginPotential'

const stockProductColumns: Array<ResizableColumnDefinition<StockProductColumnKey>> = [
  { defaultWidth: 95, key: 'code', minWidth: 80 },
  { defaultWidth: 200, key: 'name', minWidth: 140 },
  { defaultWidth: 95, key: 'metalGroup', minWidth: 80 },
  { defaultWidth: 95, key: 'qty', minWidth: 80 },
  { defaultWidth: 95, key: 'wac', minWidth: 80 },
  { defaultWidth: 110, key: 'value', minWidth: 90 },
  { defaultWidth: 120, key: 'daysSinceSale', minWidth: 90 },
  { defaultWidth: 110, key: 'stdPrice', minWidth: 80 },
  { defaultWidth: 115, key: 'marginPotential', minWidth: 90 },
]

type NegMarginColumnKey = 'date' | 'docNo' | 'customer' | 'productName' | 'qty' | 'price' | 'unitCost' | 'loss'

const negMarginColumns: Array<ResizableColumnDefinition<NegMarginColumnKey>> = [
  { defaultWidth: 95, key: 'date', minWidth: 80 },
  { defaultWidth: 115, key: 'docNo', minWidth: 90 },
  { defaultWidth: 170, key: 'customer', minWidth: 120 },
  { defaultWidth: 190, key: 'productName', minWidth: 130 },
  { defaultWidth: 90, key: 'qty', minWidth: 70 },
  { defaultWidth: 90, key: 'price', minWidth: 70 },
  { defaultWidth: 90, key: 'unitCost', minWidth: 70 },
  { defaultWidth: 110, key: 'loss', minWidth: 80 },
]

type OutlierColumnKey = 'date' | 'category' | 'docNo' | 'payee' | 'amount' | 'mean' | 'over'

const outlierColumns: Array<ResizableColumnDefinition<OutlierColumnKey>> = [
  { defaultWidth: 95, key: 'date', minWidth: 80 },
  { defaultWidth: 115, key: 'category', minWidth: 90 },
  { defaultWidth: 115, key: 'docNo', minWidth: 90 },
  { defaultWidth: 170, key: 'payee', minWidth: 120 },
  { defaultWidth: 110, key: 'amount', minWidth: 80 },
  { defaultWidth: 110, key: 'mean', minWidth: 80 },
  { defaultWidth: 120, key: 'over', minWidth: 90 },
]

type DetailColumnKey = 'label' | 'value'

const detailColumns: Array<ResizableColumnDefinition<DetailColumnKey>> = [
  { defaultWidth: 350, key: 'label', minWidth: 200 },
  { defaultWidth: 150, key: 'value', minWidth: 100 },
]

type LowMarginColumnKey = 'docNo' | 'customer' | 'gpPct' | 'shortfall'

const lowMarginColumns: Array<ResizableColumnDefinition<LowMarginColumnKey>> = [
  { defaultWidth: 100, key: 'docNo', minWidth: 80 },
  { defaultWidth: 150, key: 'customer', minWidth: 100 },
  { defaultWidth: 80, key: 'gpPct', minWidth: 60 },
  { defaultWidth: 100, key: 'shortfall', minWidth: 80 },
]

type LowCustomerColumnKey = 'name' | 'revenue' | 'gpPct'

const lowCustomerColumns: Array<ResizableColumnDefinition<LowCustomerColumnKey>> = [
  { defaultWidth: 160, key: 'name', minWidth: 110 },
  { defaultWidth: 110, key: 'revenue', minWidth: 80 },
  { defaultWidth: 80, key: 'gpPct', minWidth: 60 },
]

type HighSupplierColumnKey = 'supplierName' | 'productName' | 'premiumPct' | 'premiumValue'

const highSupplierColumns: Array<ResizableColumnDefinition<HighSupplierColumnKey>> = [
  { defaultWidth: 150, key: 'supplierName', minWidth: 100 },
  { defaultWidth: 150, key: 'productName', minWidth: 100 },
  { defaultWidth: 80, key: 'premiumPct', minWidth: 60 },
  { defaultWidth: 100, key: 'premiumValue', minWidth: 80 },
]

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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-200">
        <span className="text-sm">ช่วงวิเคราะห์</span>
        <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
          {[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} วันล่าสุด{days === 90 ? ' (แนะนำ)' : ''}</option>)}
        </select>
        <DateInput label="ถึง" value={asOf} onChange={setAsOf} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className="text-xs text-slate-500">ตั้งแต่ {data?.filters.from ?? '-'} ถึง {data?.filters.asOf ?? asOf}</span>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <select 
            aria-label="Period days select"
            className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-slate-400 transition cursor-pointer" 
            value={periodDays} 
            onChange={(event) => setPeriodDays(Number(event.target.value))}
          >
            {[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} วัน</option>)}
          </select>
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none"
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
                <label className="mb-1 block font-semibold text-slate-600 text-xs">ถึงวันที่</label>
                <DatePickerInput className="w-full text-sm" value={asOf} onChange={setAsOf} />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">สาขา</label>
                <select
                  aria-label="Branch select"
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  <option value="">ทุกสาขา</option>
                  {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>

              <div className="pt-2 text-xs text-slate-500 border-t border-slate-100">
                ช่วงวิเคราะห์: <span className="font-semibold">{data?.filters.from ?? '-'} ถึง {data?.filters.asOf ?? asOf}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBranchId('')
                }}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="bg-white p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full ${(s?.ccc ?? 0) < 60 ? 'bg-emerald-50 text-emerald-600' : (s?.ccc ?? 0) < 90 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'} flex items-center justify-center text-xl shrink-0`}>
            ⏱
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-xs font-semibold ${(s?.ccc ?? 0) < 60 ? 'text-emerald-600' : (s?.ccc ?? 0) < 90 ? 'text-amber-600' : 'text-red-600'} truncate`}>
              {(s?.ccc ?? 0) < 60 ? 'Cash Conversion Cycle (ดี)' : (s?.ccc ?? 0) < 90 ? 'Cash Conversion Cycle (พอใช้)' : 'Cash Conversion Cycle (เสี่ยง)'}
            </div>
            <div className="mt-0.5 text-2xl font-extrabold text-slate-900 tracking-tight">{(s?.ccc ?? 0).toFixed(1)} <span className="text-xs font-medium text-slate-500">วัน</span></div>
            <div className="mt-3 text-xs text-slate-400 pt-2 border-t border-slate-100">
              AR ({(s?.arDays ?? 0).toFixed(0)}) + Inv ({(s?.invDays ?? 0).toFixed(0)}) - AP ({(s?.apDays ?? 0).toFixed(0)})
            </div>
          </div>
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-200">
        <DateInput label="As of" value={asOf} onChange={setAsOf} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold shrink-0">As of</span>
            <DatePickerInput className="w-full text-xs" value={asOf} onChange={setAsOf} />
          </div>
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none"
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
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
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
                className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
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
        <div className="bg-white p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-4 lg:col-span-2">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xl shrink-0">
            📦
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-amber-600 uppercase">มูลค่า Stock รวม (WAC)</div>
            <div className="mt-0.5 text-2xl font-extrabold text-slate-900 tracking-tight">{money(data?.summary.totalValue)} <span className="text-xs font-medium text-slate-550">({data?.summary.itemCount ?? 0} รายการ)</span></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] pt-3 border-t border-slate-100">
              <Mini label="✓ จ่ายแล้ว (Paid)" value={money(data?.summary.paidValue)} />
              <Mini label="⚠ ยังไม่จ่าย (Unpaid)" value={money(data?.summary.unpaidValue)} />
              <Mini label="💰 Margin Potential" value={money(data?.summary.marginPotential)} />
            </div>
          </div>
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-200">
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        <label className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
          <span>Target GP %</span>
          <input className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-right text-xs outline-none focus:border-slate-400 transition h-9 bg-white" step="0.1" type="number" value={targetMargin} onChange={(event) => setTargetMargin(Number(event.target.value))} />
        </label>
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-bold text-red-700">รวมรั่วไหล: {money(data?.summary.totalLeak)}</span>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-semibold shrink-0">From</span>
              <DatePickerInput className="w-full text-xs" value={from} onChange={setFrom} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-semibold shrink-0">To</span>
              <DatePickerInput className="w-full text-xs" value={to} onChange={setTo} />
            </div>
          </div>
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none shrink-0"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(branchId || targetMargin !== 5) ? '(มี)' : ''}
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
                <label className="mb-1 block font-semibold text-slate-600 text-xs">Target GP %</label>
                <input 
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-400 bg-white text-slate-900" 
                  step="0.1" 
                  type="number" 
                  value={targetMargin} 
                  onChange={(event) => setTargetMargin(Number(event.target.value))} 
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">สาขา</label>
                <select
                  aria-label="Branch select"
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  <option value="">ทุกสาขา</option>
                  {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-600">รวมเงินที่รั่วไหล</span>
                <span className="rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-bold text-red-700">{money(data?.summary.totalLeak)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBranchId('')
                  setTargetMargin(5)
                }}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="bg-white p-5 border border-red-200 rounded-xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-xl shrink-0">
            🔻
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-red-600 uppercase">💔 รวมเงินที่รั่วไหล (Profit Leak)</div>
            <div className="mt-0.5 text-2xl font-extrabold text-red-700 tracking-tight">{money(data?.summary.totalLeak)}</div>
            <div className="mt-3 space-y-1 text-[11px] pt-3 border-t border-slate-100">
              <div className="flex justify-between text-slate-500"><span>📉 ขายต่ำกว่า WAC:</span> <b className="text-slate-800">{money(data?.summary.negTotal)}</b></div>
              <div className="flex justify-between text-slate-500"><span>⚠ ค่าใช้จ่ายผิดปกติ:</span> <b className="text-slate-800">{data?.summary.outlierCount ?? 0} รายการ</b></div>
              <div className="flex justify-between text-slate-500"><span>📦 Stock Loss:</span> <b className="text-slate-800">{money(data?.summary.stockLoss)}</b></div>
              <div className="flex justify-between text-slate-500"><span>🏭 Production Loss:</span> <b className="text-slate-800">{money(data?.summary.productionLoss)}</b></div>
            </div>
          </div>
        </div>
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

function BaselineNotice({ sourceState }: { sourceState?: SourceState }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-xs text-amber-900 shadow-sm">
      <span className="font-bold">⚠️ Finance analysis read baseline</span>
      <span className="ml-2">คำนวณจากข้อมูลธุรกรรม ยังไม่ใช่ GL/statutory report และไม่มี write action</span>
      {sourceState ? <div className="mt-1 text-[11px] text-amber-800">{sourceState.limitations[0]}</div> : null}
    </div>
  )
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">{children}</div>
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 text-xs text-slate-600"><span>{label}</span><DatePickerInput className="w-[140px]" value={value} onChange={onChange} /></label>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <select className="rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs outline-none focus:outline-none focus:border-slate-400 transition cursor-pointer" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
}

function Panel({ children, className = '', title }: { children: ReactNode; className?: string; title: string }) {
  return <div className={`rounded-xl border border-slate-100 bg-white p-4 shadow-sm ${className}`}><div className="mb-3 text-xs font-bold text-slate-800">{title}</div>{children}</div>
}

function BreakdownBar({ amount, label, max, tone, value }: { amount: number; label: string; max: number; tone: 'amber' | 'blue' | 'emerald'; value: number }) {
  const cls = tone === 'blue' ? 'from-blue-400 to-blue-600 text-blue-700' : tone === 'amber' ? 'from-amber-400 to-orange-500 text-amber-700' : 'from-emerald-400 to-teal-500 text-emerald-700'
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className={`font-semibold ${cls.split(' ').at(-1)}`}>{label}</span>
        <span className="font-semibold text-slate-700">{value.toFixed(1)} วัน · {money(amount)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-gradient-to-r ${cls}`} style={{ width: `${Math.min(100, value / max * 100)}%` }} />
      </div>
    </div>
  )
}

function Gauge({ footer, kind, title, value }: { footer: string; kind: 'current' | 'quick'; title: string; value: number }) {
  const threshold = kind === 'current' ? [1.5, 1] : [1, 0.5]
  const color = value >= threshold[0] ? '#10b981' : value >= threshold[1] ? '#f59e0b' : '#ef4444'
  const text = value >= threshold[0] ? 'ดี' : value >= threshold[1] ? 'พอใช้' : '⚠ เสี่ยง'
  const dash = Math.min(220, value * (kind === 'current' ? 73 : 110))
  return <Panel title={title}><svg viewBox="0 0 200 110" className="h-[100px] w-full"><path d="M 30 90 A 70 70 0 0 1 170 90" stroke="#e2e8f0" strokeLinecap="round" strokeWidth="14" fill="none" /><path d="M 30 90 A 70 70 0 0 1 170 90" stroke={color} strokeDasharray={`${dash} 220`} strokeLinecap="round" strokeWidth="14" fill="none" /><text fill={color} fontSize="28" fontWeight="bold" textAnchor="middle" x="100" y="80">{value.toFixed(2)}</text><text fill="#64748b" fontSize="10" textAnchor="middle" x="100" y="100">{text}</text></svg><div className="mt-1 text-center text-xs text-slate-500">{footer}</div></Panel>
}

function Kpi({ label, tone, value }: { label: string; tone: string; value: string }) {
  const map: Record<string, string> = {
    amber: 'border-amber-200 bg-amber-50/40 text-amber-800',
    blue: 'border-blue-200 bg-blue-50/40 text-blue-800',
    cyan: 'border-cyan-200 bg-cyan-50/40 text-cyan-800',
    emerald: 'border-emerald-200 bg-emerald-50/40 text-emerald-800',
    orange: 'border-orange-200 bg-orange-50/40 text-orange-800',
    purple: 'border-purple-200 bg-purple-50/40 text-purple-800',
    red: 'border-red-200 bg-red-50/40 text-red-800',
    rose: 'border-rose-200 bg-rose-50/40 text-rose-800',
    slate: 'border-slate-100 bg-slate-50/40 text-slate-800',
    yellow: 'border-yellow-200 bg-yellow-50/40 text-yellow-800'
  }
  const cls = map[tone] ?? map.slate
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${cls}`}>
      <div className="text-[10px] text-slate-500 font-semibold uppercase">{label}</div>
      <div className="text-sm font-bold tracking-tight mt-0.5">{value}</div>
    </div>
  )
}

function Insight({ body, title, tone, value }: { body: string; title: string; tone: string; value: string }) {
  const map: Record<string, string> = {
    amber: 'border-amber-200 bg-amber-50/40 text-amber-800',
    blue: 'border-blue-200 bg-blue-50/40 text-blue-800',
    emerald: 'border-emerald-200 bg-emerald-50/40 text-emerald-800',
    purple: 'border-purple-200 bg-purple-50/40 text-purple-800',
    red: 'border-red-200 bg-red-50/40 text-red-800'
  }
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${map[tone] ?? map.blue}`}>
      <h3 className="mb-1 text-xs font-bold text-slate-800">{title}</h3>
      <div className="mb-1 text-xl font-bold tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-500">{body}</div>
    </div>
  )
}

function DetailTable({ isLoading, rows }: { isLoading: boolean; rows: WorkingPayload['calculationRows'] }) {
  const columnResize = useResizableColumns('finance.working-capital.calculation.v5', detailColumns)
  const [sortKey, setSortKey] = useState<DetailColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: DetailColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-700 text-sm">
        <span>📋 ตารางคำนวณ</span>
        {columnResize.hasCustomWidths && (
          <button
            className="hidden lg:inline-flex items-center gap-1 h-7 rounded bg-white border border-slate-200 px-2.5 text-xs text-slate-700 hover:bg-slate-50 font-normal transition outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-3 w-3" /> คืนค่าเดิมตาราง
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* Desktop View */}
        <table className="hidden lg:table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {detailColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
            <tr>
              <ResizableTableHead label="คำอธิบาย" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="label" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('label', 'คำอธิบาย')} />
              <ResizableTableHead align="right" label="มูลค่า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="value" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('value', 'มูลค่า')} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="py-6 text-center text-slate-400" colSpan={2}>กำลังโหลดข้อมูล</td></tr>
            ) : null}
            {sortedRows.map((row) => {
              const bgCls = row.tone === 'blue' ? 'bg-blue-50/30' : row.tone === 'emerald' ? 'bg-emerald-50/30' : row.tone === 'amber' ? 'bg-amber-50/30' : row.tone === 'purple' ? 'bg-purple-50/30' : ''
              return (
                <tr key={row.label} className={`border-t border-slate-100 hover:bg-slate-50/50 transition ${bgCls}`}>
                  <Td className="font-medium">{row.label}</Td>
                  <Td align="right" className="font-bold text-slate-900">{money(row.value)}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Mobile View */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {isLoading && <div className="py-6 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
          {!isLoading && sortedRows.map((row) => {
            const bgCls = row.tone === 'blue' ? 'bg-blue-50/30' : row.tone === 'emerald' ? 'bg-emerald-50/30' : row.tone === 'amber' ? 'bg-amber-50/30' : row.tone === 'purple' ? 'bg-purple-50/30' : ''
            return (
              <div key={row.label} className={`flex justify-between items-center p-3 text-xs ${bgCls}`}>
                <span className="font-medium text-slate-700">{row.label}</span>
                <span className="font-bold text-slate-900">{money(row.value)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 font-medium">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
    </div>
  )
}

function Donut({ colors, total, values }: { colors: string[]; total: number; values: number[] }) {
  const segments = values.reduce<{ dash: number; offset: number; value: number }[]>((acc, value) => {
    const dash = value / Math.max(1, total) * 440
    const offset = acc.reduce((sum, row) => sum + row.dash, 0)
    return [...acc, { dash, offset, value }]
  }, [])
  return <svg viewBox="0 0 200 200" className="mx-auto h-36 w-36 shrink-0">{segments.map((segment, index) => <circle key={`${index}-${segment.value}`} cx="100" cy="100" fill="none" r="70" stroke={colors[index % colors.length]} strokeDasharray={`${segment.dash} 440`} strokeDashoffset={-segment.offset} strokeWidth="36" transform="rotate(-90 100 100)" />)}<text x="100" y="98" textAnchor="middle" fontSize="10" fill="#64748b">รวม</text><text x="100" y="115" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1e293b">{money(total)}</text></svg>
}

function AgingBar({ row, total }: { row: { count: number; key: string; value: number }; total: number }) {
  return (
    <div className="mb-2 flex items-center gap-3 text-xs">
      <div className="w-20 font-semibold text-slate-600">{row.key} วัน</div>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(row.value / total * 100, row.value > 0 ? 1 : 0)}%` }} />
        <span className="absolute left-2 top-0.5 text-[9px] font-bold text-white">{row.count} รายการ</span>
        <span className="absolute right-2 top-0.5 text-[9px] font-bold text-slate-700">{percent(row.value, total)}%</span>
      </div>
      <div className="w-24 text-right font-bold text-slate-700">{money(row.value)}</div>
    </div>
  )
}

function TopProduct({ index, max, row }: { index: number; max: number; row: StockProduct }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 text-xs">
      <span className="w-5 text-center font-bold text-amber-600 shrink-0">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-slate-800">{row.name}</div>
        <div className="text-[10px] text-slate-400 font-medium">{money(row.qty)} kg · WAC {money(row.wac)} · {row.status}</div>
      </div>
      <div className="h-2 w-16 rounded-full bg-slate-100 shrink-0 overflow-hidden">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, row.value / Math.max(1, max) * 100)}%` }} />
      </div>
      <div className="w-20 text-right font-bold text-amber-700 shrink-0">{money(row.value)}</div>
    </div>
  )
}

function ProductTable({ rows }: { rows: StockProduct[] }) {
  const columnResize = useResizableColumns('finance.stock-finance.slow-moving.v5', stockProductColumns)
  const [sortKey, setSortKey] = useState<StockProductColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: StockProductColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-red-100 bg-red-50/50 px-4 py-3 font-bold text-red-700 text-sm">
        <span>Slow Moving / สินค้าที่ควรรีบขาย (Top 15 — ไม่ขาย &gt; 60 วัน)</span>
        {columnResize.hasCustomWidths && (
          <button
            className="hidden lg:inline-flex items-center gap-1 h-7 rounded bg-white border border-red-200 px-2.5 text-xs text-red-700 hover:bg-red-50 font-normal transition outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-3 w-3" /> คืนค่าเดิมตาราง
          </button>
        )}
      </div>
      
      {/* Desktop View */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {stockProductColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
            <tr>
              <ResizableTableHead label="รหัส" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="code" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('code', 'รหัส')} />
              <ResizableTableHead label="ชื่อ" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="name" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อ')} />
              <ResizableTableHead label="หมวด" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="metalGroup" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('metalGroup', 'หมวด')} />
              <ResizableTableHead align="right" label="จำนวน" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="qty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qty', 'จำนวน')} />
              <ResizableTableHead align="right" label="WAC" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="wac" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('wac', 'WAC')} />
              <ResizableTableHead align="right" label="มูลค่า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="value" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('value', 'มูลค่า')} />
              <ResizableTableHead align="right" label="ครั้งสุดท้ายขาย" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="daysSinceSale" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('daysSinceSale', 'ครั้งสุดท้ายขาย')} />
              <ResizableTableHead align="right" label="ราคามาตรฐาน" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="stdPrice" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('stdPrice', 'ราคามาตรฐาน')} />
              <ResizableTableHead align="right" label="Margin Pot" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="marginPotential" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('marginPotential', 'Margin Pot')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition" key={row.id}>
                <Td mono className="font-bold text-amber-700">{row.code}</Td>
                <Td className="font-semibold text-slate-900">{row.name}</Td>
                <Td>{row.metalGroup}</Td>
                <Td align="right">{money(row.qty)}</Td>
                <Td align="right">{money(row.wac)}</Td>
                <Td align="right" className="font-bold text-slate-900">{money(row.value)}</Td>
                <Td align="right">{row.daysSinceSale >= 9999 ? 'ไม่เคยขาย' : `${row.daysSinceSale} วัน`}</Td>
                <Td align="right">{money(row.stdPrice)}</Td>
                <Td align="right" className="text-emerald-700 font-semibold">{money(row.marginPotential)}</Td>
              </tr>
            ))}
            {!sortedRows.length ? <tr><td className="py-8 text-center text-slate-400" colSpan={9}>ไม่มี Slow Moving ✓</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="block lg:hidden divide-y divide-slate-100">
        {!sortedRows.length ? (
          <div className="py-8 text-center text-slate-400 text-xs">ไม่มี Slow Moving ✓</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="p-4 space-y-2 text-xs hover:bg-slate-50/50 transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-mono text-amber-700 font-bold block">{row.code}</span>
                  <span className="font-bold text-slate-900 text-sm block">{row.name}</span>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{row.metalGroup}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
                <div><span className="text-slate-400">จำนวน:</span> <span className="font-semibold text-slate-800">{money(row.qty)} kg</span></div>
                <div><span className="text-slate-400">มูลค่า Stock:</span> <span className="font-bold text-slate-900">{money(row.value)}</span></div>
                <div><span className="text-slate-400">WAC:</span> <span className="font-medium text-slate-600">{money(row.wac)}</span></div>
                <div><span className="text-slate-400">ราคามาตรฐาน:</span> <span className="font-medium text-slate-600">{money(row.stdPrice)}</span></div>
                <div><span className="text-slate-400">ไม่ขายมาแล้ว:</span> <span className="font-semibold text-red-600">{row.daysSinceSale >= 9999 ? 'ไม่เคยขาย' : `${row.daysSinceSale} วัน`}</span></div>
                <div><span className="text-slate-400">Margin Pot:</span> <span className="font-bold text-emerald-700">{money(row.marginPotential)}</span></div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function NegativeMarginTable({ rows, total }: { rows: ProfitPayload['negMarginItems']; total: number }) {
  const columnResize = useResizableColumns('finance.profit-leak.neg-margin.v5', negMarginColumns)
  const [sortKey, setSortKey] = useState<NegMarginColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: NegMarginColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-red-100 bg-red-50/50 px-4 py-3 font-bold text-red-700 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span>📉 ขายต่ำกว่า WAC ({rows.length} รายการ)</span>
          <span className="font-semibold">รวมขาดทุน {money(total)}</span>
        </div>
        {columnResize.hasCustomWidths && (
          <button
            className="hidden lg:inline-flex items-center gap-1 h-7 rounded bg-white border border-red-200 px-2.5 text-xs text-red-700 hover:bg-red-50 font-normal transition outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-3 w-3" /> คืนค่าเดิมตาราง
          </button>
        )}
      </div>
      
      {/* Desktop View */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {negMarginColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
            <tr>
              <ResizableTableHead label="วันที่" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="บิล" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'บิล')} />
              <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="customer" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('customer', 'ลูกค้า')} />
              <ResizableTableHead label="สินค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="productName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้า')} />
              <ResizableTableHead align="right" label="Qty" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="qty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qty', 'Qty')} />
              <ResizableTableHead align="right" label="ราคา" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="price" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('price', 'ราคา')} />
              <ResizableTableHead align="right" label="WAC" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="unitCost" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('unitCost', 'WAC')} />
              <ResizableTableHead align="right" label="ขาดทุน" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="loss" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('loss', 'ขาดทุน')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors transition">
                <Td>{row.date}</Td>
                <Td mono className="font-semibold text-slate-800">{row.docNo}</Td>
                <Td>{row.customer}</Td>
                <Td className="font-medium text-slate-900">{row.productName}</Td>
                <Td align="right">{money(row.qty)}</Td>
                <Td align="right">{money(row.price)}</Td>
                <Td align="right">{money(row.unitCost)}</Td>
                <Td align="right" className="font-bold text-red-700">{money(row.loss)}</Td>
              </tr>
            ))}
            {!sortedRows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={8}>ไม่มี ✓</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="block lg:hidden divide-y divide-slate-100">
        {!sortedRows.length ? (
          <div className="py-8 text-center text-slate-400 text-xs">ไม่มี ✓</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="p-4 space-y-2 text-xs hover:bg-slate-50/50 transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-mono text-slate-800 font-semibold block">{row.docNo}</span>
                  <span className="text-slate-400 text-[10px] block">{row.date} · {row.customer}</span>
                </div>
                <span className="rounded bg-red-50 border border-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">ขาดทุน {money(row.loss)}</span>
              </div>
              <div className="font-bold text-slate-900">{row.productName}</div>
              <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
                <div><span className="text-slate-400 block text-[10px]">จำนวน</span><span className="font-semibold text-slate-800">{money(row.qty)} kg</span></div>
                <div><span className="text-slate-400 block text-[10px]">ราคาขาย</span><span className="font-semibold text-slate-800">{money(row.price)}</span></div>
                <div><span className="text-slate-400 block text-[10px]">ต้นทุน WAC</span><span className="font-semibold text-slate-800">{money(row.unitCost)}</span></div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function LowMarginTable({ rows, targetMargin }: { rows: ProfitPayload['lowMarginBills']; targetMargin: number }) {
  const columnResize = useResizableColumns('finance.profit-leak.low-margin.v5', lowMarginColumns)
  const [sortKey, setSortKey] = useState<LowMarginColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: LowMarginColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-700 text-xs">
        <span>⬇ บิลที่ GP &lt; {targetMargin}%</span>
        {columnResize.hasCustomWidths && (
          <button
            className="inline-flex items-center gap-1 h-5 rounded bg-white border border-slate-200 px-1.5 text-[10px] text-slate-700 hover:bg-slate-50 font-normal transition outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-2.5 w-2.5" /> รีเซ็ต
          </button>
        )}
      </div>
      
      {/* Desktop View */}
      <div className="hidden lg:block max-h-64 overflow-auto">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {lowMarginColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 font-medium z-10">
            <tr>
              <ResizableTableHead label="บิล" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'บิล')} />
              <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="customer" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('customer', 'ลูกค้า')} />
              <ResizableTableHead align="right" label="GP%" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="gpPct" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} />
              <ResizableTableHead align="right" label="ขาด" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="shortfall" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('shortfall', 'ขาด')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition" key={row.id}>
                <Td mono className="font-semibold text-slate-800">{row.docNo}</Td>
                <Td>{row.customer}</Td>
                <Td align="right" className="font-semibold text-slate-700">{row.gpPct.toFixed(1)}%</Td>
                <Td align="right" className="font-bold text-red-600">{money(row.shortfall)}</Td>
              </tr>
            ))}
            {!sortedRows.length ? <Empty colSpan={4} /> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="block lg:hidden divide-y divide-slate-100 max-h-64 overflow-auto">
        {!sortedRows.length ? (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มี ✓</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="p-3 space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono text-slate-800 font-semibold">{row.docNo}</span>
                <span className="font-bold text-red-600">ขาด {money(row.shortfall)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>{row.customer}</span>
                <span>GP: <b className="text-slate-700">{row.gpPct.toFixed(1)}%</b></span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function LowCustomerTable({ rows }: { rows: ProfitPayload['lowCustomers'] }) {
  const columnResize = useResizableColumns('finance.profit-leak.low-customers.v5', lowCustomerColumns)
  const [sortKey, setSortKey] = useState<LowCustomerColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: LowCustomerColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-700 text-xs">
        <span>👥 ลูกค้ากำไรต่ำ (Top 10)</span>
        {columnResize.hasCustomWidths && (
          <button
            className="inline-flex items-center gap-1 h-5 rounded bg-white border border-slate-200 px-1.5 text-[10px] text-slate-700 hover:bg-slate-50 font-normal transition outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-2.5 w-2.5" /> รีเซ็ต
          </button>
        )}
      </div>
      
      {/* Desktop View */}
      <div className="hidden lg:block max-h-64 overflow-auto">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {lowCustomerColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 font-medium z-10">
            <tr>
              <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="name" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('name', 'ลูกค้า')} />
              <ResizableTableHead align="right" label="ยอดขาย" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="revenue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('revenue', 'ยอดขาย')} />
              <ResizableTableHead align="right" label="GP%" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="gpPct" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('gpPct', 'GP%')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition" key={row.id}>
                <Td className="font-semibold text-slate-850">{row.name}</Td>
                <Td align="right" className="font-bold text-slate-900">{money(row.revenue)}</Td>
                <Td align="right" className="font-bold text-red-600">{row.gpPct.toFixed(1)}%</Td>
              </tr>
            ))}
            {!sortedRows.length ? <Empty colSpan={3} /> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="block lg:hidden divide-y divide-slate-100 max-h-64 overflow-auto">
        {!sortedRows.length ? (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มี ✓</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="p-3 flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-850">{row.name}</span>
                <div className="text-[10px] text-slate-400">ยอดขาย: {money(row.revenue)}</div>
              </div>
              <span className="font-bold text-red-600">{row.gpPct.toFixed(1)}%</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function HighSupplierTable({ rows }: { rows: ProfitPayload['highSuppliers'] }) {
  const columnResize = useResizableColumns('finance.profit-leak.high-suppliers.v5', highSupplierColumns)
  const [sortKey, setSortKey] = useState<HighSupplierColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: HighSupplierColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      if (sortKey === 'premiumValue') {
        aVal = a.premium * a.qty
        bVal = b.premium * b.qty
      } else {
        aVal = a[sortKey]
        bVal = b[sortKey]
      }

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-700 text-xs">
        <span>🏭 Supplier ต้นทุนสูง (Top 10)</span>
        {columnResize.hasCustomWidths && (
          <button
            className="inline-flex items-center gap-1 h-5 rounded bg-white border border-slate-200 px-1.5 text-[10px] text-slate-700 hover:bg-slate-50 font-normal transition outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-2.5 w-2.5" /> รีเซ็ต
          </button>
        )}
      </div>
      
      {/* Desktop View */}
      <div className="hidden lg:block max-h-64 overflow-auto">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {highSupplierColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 font-medium z-10">
            <tr>
              <ResizableTableHead label="Supplier" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="supplierName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('supplierName', 'Supplier')} />
              <ResizableTableHead label="สินค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="productName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้า')} />
              <ResizableTableHead align="right" label="+%" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="premiumPct" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('premiumPct', '+%')} />
              <ResizableTableHead align="right" label="ส่วนเกิน" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="premiumValue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('premiumValue', 'ส่วนเกิน')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition" key={row.id}>
                <Td className="font-semibold text-slate-850">{row.supplierName}</Td>
                <Td>{row.productName}</Td>
                <Td align="right" className="font-semibold text-red-600">{row.premiumPct.toFixed(1)}%</Td>
                <Td align="right" className="font-bold text-red-600">{money(row.premium * row.qty)}</Td>
              </tr>
            ))}
            {!sortedRows.length ? <Empty colSpan={4} /> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="block lg:hidden divide-y divide-slate-100 max-h-64 overflow-auto">
        {!sortedRows.length ? (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มี ✓</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="p-3 space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-850">{row.supplierName}</span>
                <span className="font-bold text-red-600">+{row.premiumPct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>{row.productName}</span>
                <span>ส่วนเกิน: <b className="text-slate-700">{money(row.premium * row.qty)}</b></span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function OutlierTable({ rows }: { rows: ProfitPayload['outliers'] }) {
  const columnResize = useResizableColumns('finance.profit-leak.outliers.v5', outlierColumns)
  const [sortKey, setSortKey] = useState<OutlierColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: OutlierColumnKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-orange-100 bg-orange-50/50 px-4 py-3 font-bold text-orange-700 text-sm">
        <span>⚠ ค่าใช้จ่ายผิดปกติ ({rows.length}) — สูงเกิน mean + 1.5×stddev</span>
        {columnResize.hasCustomWidths && (
          <button
            className="hidden lg:inline-flex items-center gap-1 h-7 rounded bg-white border border-orange-200 px-2.5 text-xs text-orange-700 hover:bg-orange-50 font-normal transition outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-3 w-3" /> คืนค่าเดิมตาราง
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* Desktop View */}
        <table className="hidden lg:table w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {outlierColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
            <tr>
              <ResizableTableHead label="วันที่" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="หมวด" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="category" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('category', 'หมวด')} />
              <ResizableTableHead label="เลขที่" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead label="ผู้รับ" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="payee" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('payee', 'ผู้รับ')} />
              <ResizableTableHead align="right" label="จำนวน" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวน')} />
              <ResizableTableHead align="right" label="ค่าเฉลี่ย" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="mean" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('mean', 'ค่าเฉลี่ย')} />
              <ResizableTableHead align="right" label="เกินกว่าปกติ" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="over" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('over', 'เกินกว่าปกติ')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition" key={row.id}>
                <Td>{row.date}</Td><Td>{row.category}</Td><Td mono className="font-semibold text-slate-800">{row.docNo}</Td><Td>{row.payee}</Td>
                <Td align="right" className="font-bold text-slate-900">{money(row.amount)}</Td>
                <Td align="right" className="text-slate-500">{money(row.mean)}</Td>
                <Td align="right" className="font-bold text-red-700">{money(row.over)}</Td>
              </tr>
            ))}
            {!sortedRows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={7}>ไม่มี ✓</td></tr> : null}
          </tbody>
        </table>

        {/* Mobile View */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {!sortedRows.length ? (
            <div className="py-4 text-center text-slate-400 text-xs">ไม่มี ✓</div>
          ) : (
            sortedRows.map((row) => (
              <div key={row.id} className="p-4 space-y-2 text-xs hover:bg-slate-50/50 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-slate-800 font-semibold block">{row.docNo}</span>
                    <span className="text-slate-400 text-[10px] block">{row.date} · {row.category}</span>
                  </div>
                  <span className="rounded bg-red-50 border border-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">เกินปกติ {money(row.over)}</span>
                </div>
                <div className="text-slate-700"><span className="text-slate-400">ผู้รับ:</span> {row.payee}</div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-50">
                  <div><span className="text-slate-400">จำนวน:</span> <span className="font-bold text-slate-900">{money(row.amount)}</span></div>
                  <div><span className="text-slate-400">ค่าเฉลี่ย:</span> <span className="text-slate-650">{money(row.mean)}</span></div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Empty({ colSpan }: { colSpan: number }) {
  return <tr><td className="py-4 text-center text-slate-400" colSpan={colSpan}>ไม่มี ✓</td></tr>
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap px-4 py-2.5 font-bold text-slate-600 bg-slate-50 border-b border-slate-100 ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children, mono = false, className = '' }: { align?: 'center' | 'left' | 'right'; children: ReactNode; mono?: boolean; className?: string }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap px-4 py-3 border-b border-slate-100/60 ${textAlign} text-slate-700 ${mono ? 'font-mono' : ''} ${className}`}>{children}</td>
}

function Loading() {
  return <div className="py-4 text-center text-slate-400">กำลังโหลดข้อมูล</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
