'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard, type KpiCardTone } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type DetailRow = { amount: number; date: string; description: string; href?: string; refNo: string; sourceType?: string }
type StatementLine = { amount: number; details?: DetailRow[]; label: string; level?: number; section: string; tone?: 'default' | 'good' | 'bad' | 'muted' | 'total' }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }
type DrillColumnKey = 'amount' | 'date' | 'description' | 'refNo'
type StatementColumnKey = 'amount' | 'drill' | 'label' | 'section'
type SortDirection = 'asc' | 'desc'

type PlPayload = {
  branches: BranchRow[]
  filters: { branchId: string; from: string; to: string; transactionMode?: string }
  sections: StatementLine[]
  sourceState: SourceState
  split: { stock: { cogs: number; revenue: number }; trading: { cogs: number; revenue: number } }
  summary: { assetDisposalNet?: number; cogs?: number; depreciation?: number; expenses?: number; fxNet?: number; grossProfit?: number; interest?: number; netProfitBeforeTax?: number; operatingProfit?: number; revenue?: number }
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

export function PlStatementPageClient({ initialFilters }: { initialFilters?: { branchId?: string; from?: string; to?: string } } = {}) {
  const [from, setFrom] = useState(initialFilters?.from || monthStart())
  const [to, setTo] = useState(initialFilters?.to || today())
  const [branchId, setBranchId] = useState(initialFilters?.branchId || '')
  const [mobileFrom, setMobileFrom] = useState(from)
  const [mobileTo, setMobileTo] = useState(to)
  const [mobileBranchId, setMobileBranchId] = useState(branchId)
  const url = useMemo(() => `/api/finance-accounting/pl-statement?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, to])
  const exportHref = `${url}&format=xlsx`
  const { data, error, isLoading, resolvedUrl } = useApi<PlPayload>(url)
  const [drill, setDrill] = useState<{ rows: DetailRow[]; title: string } | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const displayData = data && resolvedUrl === url && !isLoading && !error ? data : null
  const defaultFrom = monthStart()
  const defaultTo = today()
  const hasActiveFilters = from !== defaultFrom || to !== defaultTo || Boolean(branchId)
  const displayBranchId = displayData?.filters.branchId ?? branchId
  const branchLabel = (displayData?.branches ?? data?.branches ?? []).find((branch) => branch.id === displayBranchId)?.name ?? 'ทุกสาขา'

  function openMobileFilters() {
    setMobileFrom(from)
    setMobileTo(to)
    setMobileBranchId(branchId)
    setShowMobileFilters(true)
  }

  return (
    <section aria-busy={isLoading} className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="จาก" value={from} onChange={setFrom} /><DateInput label="ถึง" value={to} onChange={setTo} />
          <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
          {hasActiveFilters ? <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50" type="button" onClick={() => { setFrom(defaultFrom); setTo(defaultTo); setBranchId('') }}>ล้างตัวกรอง</button> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">ช่วงเวลา:</span>
          <QuickButton onClick={() => { const now = new Date(); setFrom(localDateInputValue(new Date(now.getFullYear(), 0, 1))); setTo(defaultTo) }}>ปีนี้</QuickButton>
          <QuickButton onClick={() => { setFrom(defaultFrom); setTo(defaultTo) }}>เดือนนี้</QuickButton>
          <a className="ml-auto inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-normal text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={exportHref}>ส่งออก Excel</a>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">ขอบเขตงบ</div>
            <div className="truncate text-sm font-bold text-slate-800">{shortThaiDate(from)} – {shortThaiDate(to)}</div>
            <div className="truncate text-xs text-slate-500">{branchLabel}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={exportHref}>Excel</a>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              onClick={openMobileFilters}
            >
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
              ตัวกรอง{hasActiveFilters ? ' (มี)' : ''}
            </button>
          </div>
        </div>
      </div>

      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองงบกำไรขาดทุน"
          onClose={() => setShowMobileFilters(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setMobileFrom(defaultFrom)
                  setMobileTo(defaultTo)
                  setMobileBranchId('')
                }}
                className="h-10 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => {
                  setFrom(mobileFrom)
                  setTo(mobileTo)
                  setBranchId(mobileBranchId)
                  setShowMobileFilters(false)
                }}
                className="h-10 rounded-md bg-blue-600 text-sm font-normal text-white transition hover:bg-blue-700"
              >
                ใช้ตัวกรอง
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600" htmlFor="pl-statement-from-mobile">จากวันที่</label>
              <DatePickerInput ariaLabel="จากวันที่" className="w-full text-sm" id="pl-statement-from-mobile" value={mobileFrom} onChange={setMobileFrom} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600" htmlFor="pl-statement-to-mobile">ถึงวันที่</label>
              <DatePickerInput ariaLabel="ถึงวันที่" className="w-full text-sm" id="pl-statement-to-mobile" value={mobileTo} onChange={setMobileTo} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="pl-statement-branch-mobile">สาขา</label>
            <Select
              aria-label="สาขา"
              className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              id="pl-statement-branch-mobile"
              value={mobileBranchId}
              onChange={(event) => setMobileBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>
        </MobileFilterSheet>
      ) : null}
      {displayData ? <SourceNotice sourceState={displayData.sourceState} /> : null}
      {!displayData && !error ? <PlLoadingState /> : null}
      {displayData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="รายได้" value={money(displayData.summary.revenue)} tone="slate" />
            <StatCard label="กำไรขั้นต้น" value={money(displayData.summary.grossProfit)} tone={signedTone(displayData.summary.grossProfit)} />
            <StatCard label="กำไรจากการดำเนินงาน" value={money(displayData.summary.operatingProfit)} tone={signedTone(displayData.summary.operatingProfit)} />
            <StatCard label="กำไรก่อนภาษี" value={money(displayData.summary.netProfitBeforeTax)} tone={signedTone(displayData.summary.netProfitBeforeTax)} />
          </div>
          <Panel title="องค์ประกอบกำไรก่อนภาษี">
            <Waterfall rows={[['รายได้', displayData.summary.revenue], ['ต้นทุนขาย', negate(displayData.summary.cogs)], ['ค่าใช้จ่ายดำเนินงาน', negate(displayData.summary.expenses)], ['ค่าเสื่อม', negate(displayData.summary.depreciation)], ['ดอกเบี้ย', negate(displayData.summary.interest)], ['กำไร/(ขาดทุน) อัตราแลกเปลี่ยน', displayData.summary.fxNet], ['กำไร/(ขาดทุน) จากจำหน่ายทรัพย์สิน', displayData.summary.assetDisposalNet]]} />
          </Panel>
          <StatementTable isLoading={false} rows={displayData.sections ?? []} tableKey="pl-statement" title="งบกำไรขาดทุน" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
        </>
      ) : null}
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
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:flex">
        <DateInput label="ณ วันที่" value={asOf} onChange={setAsOf} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <BalanceCheckPill balanced={data?.balanceCheck.balanced} difference={data?.balanceCheck.difference} />
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold shrink-0">ณ วันที่</span>
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
        <MobileFilterSheet
          title="ตัวกรองเพิ่มเติม"
          onClose={() => setShowMobileFilters(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setBranchId('')
                }}
                className="h-10 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="h-10 rounded-md bg-blue-600 text-sm font-normal text-white transition hover:bg-blue-700"
              >
                ตกลง
              </button>
            </>
          }
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">สาขา</label>
            <Select
              aria-label="Branch select"
              className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-slate-600">สถานะงบแสดงฐานะการเงิน</span>
            <BalanceCheckPill balanced={data?.balanceCheck.balanced} difference={data?.balanceCheck.difference} />
          </div>
        </MobileFilterSheet>
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MegaCard footer={`หนี้สิน + ส่วนทุน ${money(data?.summary.liabilitiesAndEquity)}`} label="สินทรัพย์รวม" tone="bs" value={money(data?.summary.totalAssets)} />
        <Panel title="สัดส่วนสินทรัพย์"><Waterfall rows={[['เงินสด', data?.summary.cash ?? 0], ['ลูกหนี้ (AR)', data?.summary.ar ?? 0], ['สต็อก', data?.summary.inventory ?? 0], ['ทรัพย์สินถาวร', data?.summary.fixedAssetNet ?? 0]]} /></Panel>
        <Panel title="หนี้สิน + ส่วนทุน"><Waterfall rows={[['เจ้าหนี้ (AP)', data?.summary.ap ?? 0], ['เงินกู้ระยะสั้น', data?.summary.currentLoan ?? 0], ['เงินกู้ระยะยาว', data?.summary.longTermLoan ?? 0], ['ส่วนทุน', data?.summary.totalEquity ?? 0]]} /></Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="เงินทุนหมุนเวียน" value={money(data?.ratios.workingCapital)} tone="blue" />
        <StatCard label="อัตราส่วนทุนหมุนเวียน" value={(data?.ratios.currentRatio ?? 0).toFixed(2)} tone="cyan" />
        <div className="col-span-2 md:col-span-1">
          <StatCard label="หนี้สิน/ส่วนทุน" value={(data?.ratios.debtToEquity ?? 0).toFixed(2)} tone="purple" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <StatementTable isLoading={isLoading} rows={data?.sections.assets ?? []} tableKey="balance-sheet-assets" title="สินทรัพย์" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
        <StatementTable isLoading={isLoading} rows={[...(data?.sections.liabilities ?? []), ...(data?.sections.equity ?? [])]} tableKey="balance-sheet-liabilities-equity" title="หนี้สิน + ส่วนทุน" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
      </div>
      {drill ? <DrillModal rows={drill.rows} title={drill.title} onClose={() => setDrill(null)} /> : null}
    </section>
  )
}

export function CashFlowStatementPageClient({ initialFilters }: { initialFilters?: { branchId?: string; from?: string; to?: string } } = {}) {
  const [from, setFrom] = useState(initialFilters?.from || monthStart())
  const [to, setTo] = useState(initialFilters?.to || today())
  const [branchId, setBranchId] = useState(initialFilters?.branchId || '')
  const url = useMemo(() => `/api/finance-accounting/cash-flow-statement?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, to])
  const { data, error, isLoading } = useApi<CashPayload>(url)
  const [drill, setDrill] = useState<{ rows: DetailRow[]; title: string } | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:flex">
        <DateInput label="จาก" value={from} onChange={setFrom} /><DateInput label="ถึง" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
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
            onClick={() => { const now = new Date(); setFrom(localDateInputValue(new Date(now.getFullYear(), 0, 1))); setTo(today()) }}
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
        <MobileFilterSheet
          title="ตัวกรองเพิ่มเติม"
          onClose={() => setShowMobileFilters(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setBranchId('')
                }}
                className="h-10 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="h-10 rounded-md bg-blue-600 text-sm font-normal text-white transition hover:bg-blue-700"
              >
                ตกลง
              </button>
            </>
          }
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">สาขา</label>
            <Select
              aria-label="Branch select"
              className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>
        </MobileFilterSheet>
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MegaCard footer={`เงินสดต้นงวด ${money(data?.summary.openingCash)} · เงินสดปลายงวด ${money(data?.summary.endingCash)}`} label="เงินสดสุทธิเพิ่ม/ลด" tone="cf" value={money(data?.summary.netChange)} />
        <Panel title="เงินสดรับตามกิจกรรม"><Waterfall rows={[['ดำเนินงาน', data?.activities.operating.inflow ?? 0], ['ลงทุน', data?.activities.investing.inflow ?? 0], ['จัดหาเงิน', data?.activities.financing.inflow ?? 0]]} /></Panel>
        <Panel title="เงินสดสุทธิจากกิจกรรม"><Waterfall rows={[['ดำเนินงาน', data?.summary.operating ?? 0], ['ลงทุน', data?.summary.investing ?? 0], ['จัดหาเงิน', data?.summary.financing ?? 0]]} /></Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="เงินสดรับ" value={money(data?.summary.totalInflow)} tone="emerald" />
        <StatCard label="เงินสดจ่าย" value={money(data?.summary.totalOutflow)} tone="red" />
        <StatCard label="โอนเงินภายใน (ไม่รวม)" value={money(data?.summary.internalTransfers)} tone="blue" />
        <StatCard label="เงินสดปลายงวด" value={money(data?.summary.endingCash)} tone="cyan" />
      </div>
      <StatementTable isLoading={isLoading} rows={data?.rows ?? []} tableKey="cash-flow-statement" title="งบกระแสเงินสด" onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
      {drill ? <DrillModal rows={drill.rows} title={drill.title} onClose={() => setDrill(null)} /> : null}
    </section>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const latestRequestRef = useRef(0)
  useEffect(() => {
    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId
    setIsLoading(true)
    setError(null)
    dailyFetchJson<T>(url)
      .then((payload) => {
        if (requestId !== latestRequestRef.current) return
        setData(payload)
        setResolvedUrl(url)
      })
      .catch((caught) => {
        if (requestId !== latestRequestRef.current) return
        setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
      })
      .finally(() => {
        if (requestId !== latestRequestRef.current) return
        setIsLoading(false)
      })
  }, [url])
  return { data, error, isLoading, resolvedUrl }
}

function money(value?: number) {
  if (value == null || !Number.isFinite(value)) return 'ไม่มีข้อมูล'
  const amount = Object.is(value, -0) ? 0 : value
  return amount < 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount)
}

function negate(value?: number) {
  return value == null || !Number.isFinite(value) ? undefined : -value
}

function signedTone(value?: number): KpiCardTone {
  return value != null && Number.isFinite(value) && value > 0 ? 'emerald' : value != null && Number.isFinite(value) && value < 0 ? 'red' : 'slate'
}

function shortThaiDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(year, month - 1, day))
}

function SourceNotice({ sourceState }: { sourceState: SourceState }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs leading-relaxed text-slate-600" role="note">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-md bg-slate-200/70 px-2 py-1 font-semibold text-slate-700">ข้อมูลเพื่อการบริหาร · ยังไม่ใช่งบปิดบัญชี</span>
        <span>หน่วย: บาท</span>
        <span aria-hidden="true">·</span>
        <span>เกณฑ์ข้อมูล: {sourceState.basis || 'ไม่มีข้อมูล'}</span>
      </div>
      {sourceState.limitations.length ? <p className="mt-2">ข้อจำกัด: {sourceState.limitations.join(' · ')}</p> : null}
    </div>
  )
}

function PlLoadingState() {
  return (
    <div aria-label="กำลังโหลดงบกำไรขาดทุน" className="space-y-4" role="status">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" key={index} />)}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      <span className="sr-only">กำลังโหลดข้อมูล</span>
    </div>
  )
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">{children}</div>
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 text-xs text-slate-600"><span>{label}</span><DatePickerInput ariaLabel={label} className="w-[140px]" value={value} onChange={onChange} /></label>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <Select aria-label="สาขา" className="h-9 w-64 max-w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none transition focus:border-slate-400 focus:outline-none" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select>
}

function QuickButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 outline-none focus:ring-0" type="button" onClick={onClick}>{children}</button>
}

function BalanceCheckPill({ balanced, difference }: { balanced?: boolean; difference?: number }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      {balanced ? 'สมดุล' : `ต่าง ${money(difference)}`}
    </span>
  )
}

function MegaCard({ footer, label, tone, value }: { footer: string; label: string; tone: 'bs' | 'cf' | 'pl'; value: string }) {
  const sharedTone: KpiCardTone = tone === 'pl' ? 'emerald' : tone === 'bs' ? 'blue' : 'cyan'
  return <SharedKpiCard className="lg:col-span-2" label={label} note={footer} tone={sharedTone} value={value} />
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><h2 className="mb-3 text-xs font-bold text-slate-800">{title}</h2>{children}</div>
}

function StatCard({ label, tone, value }: { label: string; tone: KpiCardTone; value: string }) {
  return <SharedKpiCard label={label} tone={tone} value={value} />
}

function SplitCard({ cogs, label, revenue, tone }: { cogs: number; label: string; revenue: number; tone: 'emerald' | 'purple' }) {
  const color = tone === 'emerald' ? 'border-emerald-100 bg-emerald-50/20 text-emerald-800' : 'border-purple-100 bg-purple-50/20 text-purple-800'
  return (
    <div className={`rounded-md border ${color} p-4 shadow-sm`}>
      <div className="text-xs font-bold">แยกตาม {label}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-slate-400 text-xs">รายได้</div><b className="text-slate-800">{money(revenue)}</b></div>
        <div><div className="text-slate-400 text-xs">COGS</div><b className="text-slate-800">{money(cogs)}</b></div>
        <div><div className="text-slate-400 text-xs">กำไรขั้นต้น</div><b className={tone === 'emerald' ? 'text-emerald-700' : 'text-purple-700'}>{money(revenue - cogs)}</b></div>
      </div>
    </div>
  )
}

function Waterfall({ rows }: { rows: Array<[string, number | undefined]> }) {
  const finiteValues = rows.map((row) => row[1]).filter((value): value is number => value != null && Number.isFinite(value))
  const max = Math.max(...finiteValues.map(Math.abs), 1)
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => {
        const hasValue = value != null && Number.isFinite(value)
        return (
          <div key={label} className="text-xs">
            <div className="mb-1 flex justify-between gap-2">
              <span className="text-slate-600">{label}</span>
              <b className={hasValue && value < 0 ? 'text-red-700' : 'text-slate-800'}>{money(value)}</b>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              {hasValue ? <div className={`h-full rounded-full ${value < 0 ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%` }} /> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatementTable({ isLoading, onDrill, rows, tableKey, title }: { isLoading: boolean; onDrill: (line: StatementLine) => void | undefined; rows: StatementLine[]; tableKey: string; title: string }) {
  const columnResize = useResizableColumns(`finance-accounting.financial-statements.${tableKey}.v1`, statementColumns)

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="text-sm font-bold text-slate-700">{title}</div>
        {columnResize.hasCustomWidths ? (
          <button
            className="h-8 rounded-md bg-slate-100 px-3 text-xs font-normal text-slate-700 hover:bg-slate-200"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        {/* Desktop Table View */}
        <table className="ns-table hidden min-w-full divide-y divide-slate-200 text-sm lg:table" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {statementColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <ResizableTableHead label="รายการ" resizeProps={columnResize.getResizeHandleProps('label', 'รายการ')} />
              <ResizableTableHead align="right" label="หมวดรายงาน" resizeProps={columnResize.getResizeHandleProps('section', 'หมวดรายงาน')} />
              <ResizableTableHead align="right" label="จำนวนเงิน" resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวนเงิน')} />
              <ResizableTableHead align="right" label="รายละเอียด" resizeProps={columnResize.getResizeHandleProps('drill', 'รายละเอียด')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <LoadingOrEmpty colSpan={statementColumns.length} isLoading={isLoading} rows={rows.length} />
            {rows.map((line) => (
              <tr key={`${line.section}-${line.label}`} className={`transition-colors hover:bg-slate-50 ${line.tone === 'total' ? 'bg-slate-50/50 font-bold' : ''}`}>
                <td className="px-3 py-3 text-slate-900"><span className={line.level ? 'pl-5' : ''}>{line.label}</span></td>
                <td className="px-3 py-3 text-right"><span className="rounded-md bg-slate-100/80 px-2 py-0.5 text-xs font-medium text-slate-500">{line.section}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">
                  <span className={line.amount < 0 ? 'font-bold text-red-700' : line.tone === 'good' ? 'font-bold text-emerald-700' : 'font-bold text-slate-900'}>
                    {money(line.amount)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  {line.details?.length ? (
                    <button aria-label={`ดูรายละเอียด ${line.label} ${line.details.length} รายการ`} className="font-semibold text-blue-600 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-blue-600" type="button" onClick={() => onDrill(line)}>{line.details.length}</button>
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
          {!isLoading && rows.map((line) => (
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
                    <button aria-label={`ดูรายละเอียด ${line.label} ${line.details.length} รายการ`} className="text-xs font-semibold text-blue-600 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-blue-600" type="button" onClick={() => onDrill(line)}>ดูรายละเอียด ({line.details.length})</button>
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' ? onClose() : undefined
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div aria-labelledby="financial-statement-drill-title" aria-modal="true" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-md border-0 bg-slate-900 shadow-xl" role="dialog">
        <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
          <h2 className="text-sm font-bold" id="financial-statement-drill-title">{title}</h2>
          <button className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-normal text-white outline-none hover:bg-red-700 focus:ring-0" type="button" onClick={onClose}>
            ปิด
          </button>
        </div>
        {columnResize.hasCustomWidths ? (
          <div className="hidden justify-end border-b border-slate-100 bg-white px-3 py-2 lg:flex">
            <button
              className="h-8 rounded-md bg-slate-100 px-3 text-xs font-normal text-slate-700 hover:bg-slate-200"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-auto bg-white">
          {/* Desktop Table View */}
          <table className="ns-table hidden min-w-full divide-y divide-slate-200 text-sm lg:table" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {drillColumns.map((column) => (
                <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <ResizableTableHead label="วันที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
                <ResizableTableHead align="right" label="เลขที่เอกสาร" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="refNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขที่เอกสาร')} />
                <ResizableTableHead align="right" label="รายละเอียด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="description" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('description', 'รายละเอียด')} />
                <ResizableTableHead align="right" label="จำนวนเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวนเงิน')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map((row, index) => (
                <tr key={`${row.refNo}-${index}`} className="transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.date}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold text-blue-700">
                    {row.href ? <a aria-label={`เปิดเอกสารต้นทาง ${row.refNo}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={row.href}>{row.refNo}</a> : row.refNo}
                  </td>
                  <td className="min-w-0 px-3 py-3 text-right text-slate-700"><div className="truncate">{row.description}</div></td>
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
                  {row.href ? <a aria-label={`เปิดเอกสารต้นทาง ${row.refNo}`} className="font-mono font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={row.href}>{row.refNo}</a> : <span className="font-mono font-semibold text-blue-700">{row.refNo}</span>}
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
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{message}</div>
}
