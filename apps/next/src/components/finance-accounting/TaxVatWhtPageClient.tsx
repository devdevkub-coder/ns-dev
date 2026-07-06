'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type TaxColumnKey = 'date' | 'no' | 'party' | 'base' | 'value' | 'hasDoc'

type CalendarColumnKey = 'periodLabel' | 'vOut' | 'vIn' | 'vatPayable' | 'vatDue' | 'wC' | 'wW' | 'whtDue'

const calendarColumns: Array<ResizableColumnDefinition<CalendarColumnKey>> = [
  { defaultWidth: 100, key: 'periodLabel', minWidth: 80 },
  { defaultWidth: 110, key: 'vOut', minWidth: 80 },
  { defaultWidth: 110, key: 'vIn', minWidth: 80 },
  { defaultWidth: 120, key: 'vatPayable', minWidth: 90 },
  { defaultWidth: 130, key: 'vatDue', minWidth: 100 },
  { defaultWidth: 110, key: 'wC', minWidth: 80 },
  { defaultWidth: 110, key: 'wW', minWidth: 80 },
  { defaultWidth: 130, key: 'whtDue', minWidth: 100 },
]

type BranchRow = { code: string; id: string; name: string }
type TaxItem = { base: number; date: string; hasDoc?: boolean; no: string; party: string; source: string; vat?: number; wht?: number }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }

type TaxPayload = {
  branches: BranchRow[]
  filters: { branchId: string; month: string; periodEnd: string; periodStart: string; year: string }
  sourceState: SourceState
  summary: { missingCount: number; vatIn: number; vatOut: number; vatPayable: number; whtChargedNet: number; whtWithheldNet: number }
  taxCalendar: Array<{ periodLabel: string; vIn: number; vOut: number; vatDue: string; vatPayable: number; wC: number; wW: number; whtDue: string }>
  vatInput: { items: TaxItem[] }
  vatOutput: { items: TaxItem[] }
  whtCharged: { items: TaxItem[] }
  whtWithheld: { items: TaxItem[] }
}

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const YEARS = [2024, 2025, 2026, 2027, 2028]

type DetailTab = 'vat-output' | 'vat-input' | 'wht-calendar'

export function TaxVatWhtPageClient() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [branchId, setBranchId] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('vat-output')
  const url = useMemo(() => `/api/finance-accounting/tax-vat-wht?month=${month}&year=${year}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, month, year])
  const { data, error, isLoading } = useApi<TaxPayload>(url)
  const maxCalendar = Math.max(...(data?.taxCalendar ?? []).flatMap((row) => [row.vOut, row.vIn, Math.abs(row.vatPayable)]), 1)
  const detailTabs = [
    { count: data?.vatOutput.items.length ?? 0, label: 'VAT ขาย', value: 'vat-output' },
    { count: data?.vatInput.items.length ?? 0, label: 'VAT ซื้อ', value: 'vat-input' },
    { count: data?.taxCalendar.length ?? 0, label: 'Calendar', value: 'wht-calendar' },
  ] satisfies Array<{ count: number; label: string; value: DetailTab }>

  return (
    <section className="space-y-4">
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 font-medium">งวด</label>
          <select 
            className="rounded-md border border-slate-300 px-3 py-1 bg-white text-sm outline-none focus:ring-0 focus:border-slate-400 transition-colors h-9 cursor-pointer"
            value={month} 
            onChange={(event) => setMonth(event.target.value)}
          >
            {MONTHS.map((item) => <option key={item} value={item}>เดือน {item}</option>)}
          </select>
          <select 
            className="rounded-md border border-slate-300 px-3 py-1 bg-white text-sm outline-none focus:ring-0 focus:border-slate-400 transition-colors h-9 cursor-pointer"
            value={year} 
            onChange={(event) => setYear(event.target.value)}
          >
            {YEARS.map((item) => <option key={item} value={String(item)}>ปี {item}</option>)}
          </select>
          <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">ช่วง {data?.filters.periodStart ?? `${year}-${month}-01`} ถึง {data?.filters.periodEnd ?? '-'}</span>
          <DisabledButton>📥 Excel</DisabledButton>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-md bg-white p-3 shadow lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <select 
              aria-label="Month select"
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-slate-400 transition cursor-pointer"
              value={month} 
              onChange={(event) => setMonth(event.target.value)}
            >
              {MONTHS.map((item) => <option key={item} value={item}>เดือน {item}</option>)}
            </select>
            <select 
              aria-label="Year select"
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-slate-400 transition cursor-pointer"
              value={year} 
              onChange={(event) => setYear(event.target.value)}
            >
              {YEARS.map((item) => <option key={item} value={String(item)}>ปี {item}</option>)}
            </select>
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

              <div className="pt-2 text-xs text-slate-500 border-t border-slate-100">
                ช่วงเวลา: <span className="font-semibold">{data?.filters.periodStart ?? `${year}-${month}-01`} ถึง {data?.filters.periodEnd ?? '-'}</span>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* VAT Payable Premium Box */}
        <div className="bg-white shadow-sm border border-slate-100 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">🧾 VAT Payable งวด {year}-{month}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{money(data?.summary.vatPayable)}</div>
            <div className={`mt-1 text-xs font-medium ${(data?.summary.vatPayable ?? 0) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              บาท · {(data?.summary.vatPayable ?? 0) >= 0 ? 'ต้องนำส่ง' : 'ภาษีซื้อรอใช้เครดิต'}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <MiniHero label="📤 VAT ขาย (Output)" tone="emerald" value={money(data?.summary.vatOut)} />
            <MiniHero label="📥 VAT ซื้อ (Input)" tone="blue" value={money(data?.summary.vatIn)} />
          </div>
        </div>
        
        <Panel title="🥧 VAT Output vs Input">
          <Donut output={data?.summary.vatOut ?? 0} input={data?.summary.vatIn ?? 0} net={data?.summary.vatPayable ?? 0} />
        </Panel>
        
        <Panel title="🪙 WHT Position">
          <div className="space-y-3">
            <WhtBox label="เราหักไว้ (ต้องนำส่ง ภงด.)" tone="amber" value={money(data?.summary.whtChargedNet)} />
            <WhtBox label="ลูกค้าหักจากเรา (เครดิตได้)" tone="purple" value={money(data?.summary.whtWithheldNet)} />
            <WhtBox label="⚠ ใบกำกับขาด" tone="red" value={`${data?.summary.missingCount ?? 0} รายการ`} />
          </div>
        </Panel>
      </div>

      <Panel title="📈 VAT แนวโน้ม 6 เดือน (ขาย/ซื้อ/Payable)">
        <div className="grid grid-cols-6 gap-3 overflow-x-auto pb-1">
          {(data?.taxCalendar ?? []).map((row) => <CalendarBars key={row.periodLabel} max={maxCalendar} row={row} />)}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="VAT ขาย (Output)" value={money(data?.summary.vatOut)} tone="emerald" />
        <StatCard label="VAT ซื้อ (Input)" value={money(data?.summary.vatIn)} tone="blue" />
        <StatCard label="VAT Payable" value={money(data?.summary.vatPayable)} tone="red" sub="ต้องนำส่ง / เสนอเครดิต" />
        <StatCard label="WHT เราหักไว้" value={money(data?.summary.whtChargedNet)} tone="amber" sub="ต้องนำส่งภาษี" />
        <StatCard label="WHT ถูกหักจากเรา" value={money(data?.summary.whtWithheldNet)} tone="purple" sub="ใช้เป็นเครดิตภาษี" />
        <StatCard label="เอกสารภาษีไม่ครบ" value={String(data?.summary.missingCount ?? 0)} tone="red" />
      </div>

      <Tabs className="gap-4" value={detailTab} onValueChange={(value) => setDetailTab(value as DetailTab)}>
        <TabsList className="inline-flex w-full max-w-max flex-nowrap overflow-x-auto rounded-[28px] border-4 border-rose-700 bg-white px-4 pt-4 shadow-sm" variant="line">
          {detailTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              className="min-w-fit gap-2 px-5 pb-5 pt-1 text-[15px] font-bold text-slate-500 data-[state=active]:border-blue-600 data-[state=active]:text-slate-900"
              value={tab.value}
              variant="line"
            >
              <span>{tab.label}</span>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-sm font-bold text-rose-500">
                {tab.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="vat-output">
          <TaxTable isLoading={isLoading} rows={data?.vatOutput.items ?? []} title={`📤 VAT ขาย (Output) — ${year}-${month}`} tone="emerald" valueKey="vat" tableKey="finance.tax.vat-output.v5" />
        </TabsContent>

        <TabsContent value="vat-input">
          <TaxTable hasDoc isLoading={isLoading} rows={data?.vatInput.items ?? []} title={`📥 VAT ซื้อ (Input) — ${year}-${month}`} tone="blue" valueKey="vat" tableKey="finance.tax.vat-input.v5" />
        </TabsContent>

        <TabsContent value="wht-calendar" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TaxTable isLoading={isLoading} rows={data?.whtCharged.items ?? []} title="🪙 WHT เราหักไว้ (ต้องนำส่ง ภงด.3/53)" tone="amber" valueKey="wht" tableKey="finance.tax.wht-charged.v5" />
            <TaxTable isLoading={isLoading} rows={data?.whtWithheld.items ?? []} title="💰 WHT ลูกค้าหักจากเรา (ใช้เครดิต)" tone="purple" valueKey="wht" tableKey="finance.tax.wht-withheld.v5" />
          </div>
          <CalendarTable rows={data?.taxCalendar ?? []} />
        </TabsContent>
      </Tabs>
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
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-sm text-amber-900">
      <b>Tax read/design baseline</b>
      <span className="ml-2">สรุปจาก transaction fields ยังไม่ใช่แบบยื่นภาษีหรือบัญชีภาษีปิดงวด</span>
      {sourceState ? <div className="mt-1 text-xs text-amber-800">{sourceState.limitations[0]}</div> : null}
    </div>
  )
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">{children}</div>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return (
    <select 
      className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:ring-0 focus:border-slate-400 transition-colors h-9"
      value={value} 
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">ทุกสาขา</option>
      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select>
  )
}

function DisabledButton({ children }: { children: ReactNode }) {
  return (
    <button
      className="rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white opacity-50 outline-none border border-slate-100 cursor-not-allowed"
      disabled
      type="button"
    >
      {children}
    </button>
  )
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  )
}

function MiniHero({ label, tone, value }: { label: string; tone: 'blue' | 'emerald'; value: string }) {
  const color = tone === 'emerald' ? 'text-emerald-600' : 'text-blue-600'
  return (
    <div>
      <div className="text-xs text-slate-400 font-medium uppercase">{label}</div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
    </div>
  )
}

function Donut({ input, net, output }: { input: number; net: number; output: number }) {
  const total = Math.max(1, input + output)
  const outputDash = output / total * 439.8
  return (
    <svg viewBox="0 0 200 200" className="h-44 w-full">
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" fill="none" r="70" stroke="#10b981" strokeDasharray={`${outputDash} 439.8`} strokeWidth="30" />
        <circle cx="100" cy="100" fill="none" r="70" stroke="#3b82f6" strokeDasharray={`${input / total * 439.8} 439.8`} strokeDashoffset={-outputDash} strokeWidth="30" />
      </g>
      <text fill="#64748b" fontSize="12" textAnchor="middle" x="100" y="98">VAT Net</text>
      <text fill={net >= 0 ? '#dc2626' : '#059669'} fontSize="13" fontWeight="bold" textAnchor="middle" x="100" y="115">{money(net)}</text>
    </svg>
  )
}

function WhtBox({ label, tone, value }: { label: string; tone: 'amber' | 'purple' | 'red'; value: string }) {
  const color = {
    amber: 'border-amber-200 bg-amber-50/30 text-amber-800',
    purple: 'border-purple-200 bg-purple-50/30 text-purple-800',
    red: 'border-red-200 bg-red-50/30 text-red-800'
  }[tone]
  return (
    <div className={`rounded-xl border p-3.5 transition-all ${color}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  )
}

function CalendarBars({ max, row }: { max: number; row: TaxPayload['taxCalendar'][number] }) {
  const height = (value: number) => `${Math.max(4, Math.abs(value) / max * 112)}px`
  return (
    <div className="min-w-[96px] rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-center text-xs">
      <div className="flex h-32 items-end justify-center gap-1.5">
        <span className="w-4 rounded-t-sm bg-emerald-500" style={{ height: height(row.vOut) }} />
        <span className="w-4 rounded-t-sm bg-blue-500" style={{ height: height(row.vIn) }} />
        <span className={`w-4 rounded-t-sm ${row.vatPayable >= 0 ? 'bg-red-500' : 'bg-emerald-700'}`} style={{ height: height(row.vatPayable) }} />
      </div>
      <div className="mt-2 font-semibold text-slate-600">{row.periodLabel.slice(5)}</div>
    </div>
  )
}

function StatCard({ label, sub, tone, value }: { label: string; sub?: string; tone: 'amber' | 'blue' | 'emerald' | 'purple' | 'red'; value: string }) {
  const toneStyles = {
    amber: { border: 'border-amber-200', bg: 'bg-amber-50/30', text: 'text-amber-700', iconBg: 'bg-amber-100/60 text-amber-600', emoji: '🪙' },
    blue: { border: 'border-blue-200', bg: 'bg-blue-50/30', text: 'text-blue-700', iconBg: 'bg-blue-100/60 text-blue-600', emoji: '📥' },
    emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50/30', text: 'text-emerald-700', iconBg: 'bg-emerald-100/60 text-emerald-600', emoji: '📤' },
    purple: { border: 'border-purple-200', bg: 'bg-purple-50/30', text: 'text-purple-700', iconBg: 'bg-purple-100/60 text-purple-600', emoji: '💰' },
    red: { border: 'border-red-200', bg: 'bg-red-50/30', text: 'text-red-700', iconBg: 'bg-red-100/60 text-red-600', emoji: '⚠️' }
  }[tone]

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm flex items-center gap-3.5 ${toneStyles.border}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${toneStyles.iconBg}`}>
        {toneStyles.emoji}
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
        <div className={`text-base font-bold mt-0.5 ${toneStyles.text}`}>{value}</div>
        {sub ? <div className="text-xs text-slate-400 font-medium mt-0.5">{sub}</div> : null}
      </div>
    </div>
  )
}

function TaxTable({ hasDoc = false, isLoading, rows, title, tone, valueKey, tableKey }: { hasDoc?: boolean; isLoading: boolean; rows: TaxItem[]; title: string; tone: 'amber' | 'blue' | 'emerald' | 'purple'; valueKey: 'vat' | 'wht'; tableKey: string }) {
  const heading = { 
    amber: 'bg-amber-50/50 text-amber-700 border-amber-100', 
    blue: 'bg-blue-50/50 text-blue-700 border-blue-100', 
    emerald: 'bg-emerald-50/50 text-emerald-700 border-emerald-100', 
    purple: 'bg-purple-50/50 text-purple-700 border-purple-100' 
  }[tone]
  const valueColor = { amber: 'text-amber-700', blue: 'text-blue-700', emerald: 'text-emerald-700', purple: 'text-purple-700' }[tone]

  const columns = useMemo<Array<ResizableColumnDefinition<TaxColumnKey>>>(() => {
    const list: Array<ResizableColumnDefinition<TaxColumnKey>> = [
      { defaultWidth: 95, key: 'date', minWidth: 80 },
      { defaultWidth: 120, key: 'no', minWidth: 90 },
      { defaultWidth: 200, key: 'party', minWidth: 120 },
      { defaultWidth: 110, key: 'base', minWidth: 80 },
      { defaultWidth: 110, key: 'value', minWidth: 80 },
    ]
    if (hasDoc) {
      list.push({ defaultWidth: 80, key: 'hasDoc', minWidth: 60 })
    }
    return list
  }, [hasDoc])

  const columnResize = useResizableColumns(tableKey, columns)
  const [sortKey, setSortKey] = useState<TaxColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: TaxColumnKey) => {
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

      if (sortKey === 'value') {
        aVal = a[valueKey] ?? 0
        bVal = b[valueKey] ?? 0
      } else if (sortKey === 'hasDoc') {
        aVal = a.hasDoc ? 1 : 0
        bVal = b.hasDoc ? 1 : 0
      } else {
        aVal = a[sortKey] ?? ''
        bVal = b[sortKey] ?? ''
      }

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
  }, [rows, sortKey, sortDirection, valueKey])
  
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className={`flex justify-between items-center border-b p-3.5 font-semibold text-sm ${heading}`}>
        <span>{title}</span>
        {columnResize.hasCustomWidths && (
          <button
            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50 outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-4 w-4" /> คืนค่าเดิมตาราง
          </button>
        )}
      </div>
      
      {/* Mobile View */}
      <div className="block lg:hidden divide-y divide-slate-100">
        {isLoading ? <div className="py-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && sortedRows.length === 0 ? <div className="py-8 text-center text-slate-400 text-xs">ยังไม่มีข้อมูล</div> : null}
        {!isLoading && sortedRows.map((item) => (
          <div key={`${item.source}-${item.no}`} className="p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900">{item.party}</span>
              <span className="text-slate-500 font-mono">{item.no}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>วันที่: {item.date}</span>
              {hasDoc && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${item.hasDoc ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {item.hasDoc ? '✓ มีเอกสาร' : '✗ ขาดเอกสาร'}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100/50">
              <span className="text-slate-400">ฐาน: {money(item.base)}</span>
              <span className={`font-bold text-sm ${valueColor}`}>{valueKey === 'vat' ? 'VAT: ' : 'WHT: '}{money(item[valueKey])}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-medium">
            <tr>
              <ResizableTableHead label="วันที่" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="เลขที่" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="no" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('no', 'เลขที่')} />
              <ResizableTableHead label="คู่ค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="party" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('party', 'คู่ค้า')} />
              <ResizableTableHead align="right" label="ฐาน" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="base" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('base', 'ฐาน')} />
              <ResizableTableHead align="right" label={valueKey === 'vat' ? 'VAT' : 'WHT'} activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="value" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('value', valueKey === 'vat' ? 'VAT' : 'WHT')} />
              {hasDoc ? <ResizableTableHead align="center" label="เอกสาร" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="hasDoc" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('hasDoc', 'เอกสาร')} /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <LoadingOrEmpty colSpan={hasDoc ? 6 : 5} isLoading={isLoading} rows={sortedRows.length} />
            {!isLoading && sortedRows.map((item) => (
              <tr key={`${item.source}-${item.no}`} className="hover:bg-slate-50/50 transition-colors">
                <Td>{item.date}</Td>
                <Td><span className="font-mono text-xs text-slate-600">{item.no}</span></Td>
                <Td className="truncate max-w-[200px]">{item.party}</Td>
                <Td align="right">{money(item.base)}</Td>
                <Td align="right"><span className={`font-bold ${valueColor}`}>{money(item[valueKey])}</span></Td>
                {hasDoc ? <Td align="center">{item.hasDoc ? '✓' : '✗ ขาด'}</Td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CalendarTable({ rows }: { rows: TaxPayload['taxCalendar'] }) {
  const columnResize = useResizableColumns('finance.tax.calendar.v5', calendarColumns)
  const [sortKey, setSortKey] = useState<CalendarColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: CalendarColumnKey) => {
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
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b bg-slate-50/80 px-4 py-3.5 font-semibold text-slate-700 border-slate-100 text-sm">
        <span>📅 Tax Calendar — 6 เดือนล่าสุด</span>
        {columnResize.hasCustomWidths && (
          <button
            className="hidden h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50 lg:inline-flex outline-none"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            <RotateCcw className="h-4 w-4" /> คืนค่าเดิมตาราง
          </button>
        )}
      </div>
      
      {/* Mobile View */}
      <div className="block lg:hidden divide-y divide-slate-100">
        {sortedRows.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">ยังไม่มีข้อมูล</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.periodLabel} className="p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900">{row.periodLabel}</span>
                <span className="text-slate-400">VAT Due: {row.vatDue} / WHT Due: {row.whtDue}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-slate-600">
                <div className="flex justify-between">
                  <span>VAT ขาย:</span>
                  <span className="text-emerald-600 font-semibold">{money(row.vOut)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT ซื้อ:</span>
                  <span className="text-blue-600 font-semibold">{money(row.vIn)}</span>
                </div>
                <div className="flex justify-between">
                  <span>WHT หักไว้:</span>
                  <span className="text-amber-600 font-semibold">{money(row.wC)}</span>
                </div>
                <div className="flex justify-between">
                  <span>WHT ถูกหัก:</span>
                  <span className="text-purple-600 font-semibold">{money(row.wW)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-100/50">
                <span className="text-slate-500 font-medium">VAT Payable:</span>
                <span className={`font-bold ${row.vatPayable >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(row.vatPayable)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {calendarColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-medium">
            <tr>
              <ResizableTableHead label="งวด" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="periodLabel" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('periodLabel', 'งวด')} />
              <ResizableTableHead align="right" label="VAT ขาย" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="vOut" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('vOut', 'VAT ขาย')} />
              <ResizableTableHead align="right" label="VAT ซื้อ" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="vIn" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('vIn', 'VAT ซื้อ')} />
              <ResizableTableHead align="right" label="VAT Payable" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="vatPayable" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('vatPayable', 'VAT Payable')} />
              <ResizableTableHead label="VAT Due (PP30)" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="vatDue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('vatDue', 'VAT Due (PP30)')} />
              <ResizableTableHead align="right" label="WHT หักไว้" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="wC" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('wC', 'WHT หักไว้')} />
              <ResizableTableHead align="right" label="WHT ถูกหัก" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="wW" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('wW', 'WHT ถูกหัก')} />
              <ResizableTableHead label="WHT Due (ภงด.)" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="whtDue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('whtDue', 'WHT Due (ภงด.)')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {sortedRows.map((row) => (
              <tr key={row.periodLabel} className="hover:bg-slate-50/50 transition-colors">
                <Td><b>{row.periodLabel}</b></Td>
                <Td align="right"><span className="text-emerald-600">{money(row.vOut)}</span></Td>
                <Td align="right"><span className="text-blue-600">{money(row.vIn)}</span></Td>
                <Td align="right"><span className={`font-bold ${row.vatPayable >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(row.vatPayable)}</span></Td>
                <Td>{row.vatDue}</Td>
                <Td align="right"><span className="text-amber-600">{money(row.wC)}</span></Td>
                <Td align="right"><span className="text-purple-600">{money(row.wW)}</span></Td>
                <Td>{row.whtDue}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LoadingOrEmpty({ colSpan, isLoading, rows }: { colSpan: number; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>ยังไม่มีข้อมูล</td></tr>
  return null
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap p-3.5 font-semibold ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children, className = '' }: { align?: 'center' | 'left' | 'right'; children: ReactNode; className?: string }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap p-3.5 ${textAlign} ${className}`}>{children}</td>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
