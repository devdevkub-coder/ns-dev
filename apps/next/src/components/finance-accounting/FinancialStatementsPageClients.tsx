'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, Building2, ChartColumnBig, Landmark, Scale, SlidersHorizontal, TrendingUp, Wallet } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard, KpiCardGrid, type KpiCardTone } from '@/components/ui/KpiCard'
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
  filters: { branchId: string; costBasis: 'COMPARE' | 'DEAL' | 'WAC'; from: string; to: string; transactionMode: string }
  historicalBaseline?: { cogs: number; hasData: boolean; interest: number; netProfit: number; opex: number; otherIncome: number; revenue: number; tax: number }
  sections: StatementLine[]
  sourceState: SourceState
  split: {
    stock: { cogs: number; dealCogs: number; revenue: number; wacCogs: number }
    trading: { cogs: number; dealCogs: number; revenue: number; wacCogs: number }
  }
  summary: {
    assetDisposalNet: number
    cogs: number
    cogsDeal: number
    cogsDiff: number
    cogsWac: number
    depreciation: number
    dualReplacedCount: number
    expenses: number
    fxNet: number
    grossProfit: number
    grossProfitDeal: number
    grossProfitDiff: number
    grossProfitWac: number
    interest: number
    netProfitBeforeTax: number
    netProfitBeforeTaxDeal: number
    netProfitBeforeTaxDiff: number
    netProfitBeforeTaxWac: number
    operatingProfit: number
    revenue: number
  }
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

type YearlyPlMonthRow = {
  cogs: number
  depreciation: number
  expenses: number
  fxNet: number
  grossProfit: number
  interest: number
  label: string
  month: string
  netProfitBeforeTax: number
  operatingProfit: number
  revenue: number
}

type YearlyPlData = {
  months: YearlyPlMonthRow[]
  totals: Omit<YearlyPlMonthRow, 'label' | 'month'>
  year: string
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
  const [activePreset, setActivePreset] = useState<'custom' | 'month' | 'quarter' | 'today' | 'week' | 'year'>('month')
  const [viewMode, setViewMode] = useState<'month' | 'period' | 'yearly'>('period')
  const [from, setFrom] = useState(initialFilters?.from || monthStart())
  const [to, setTo] = useState(initialFilters?.to || today())
  const [branchId, setBranchId] = useState(initialFilters?.branchId || '')
  const [costBasis, setCostBasis] = useState<'COMPARE' | 'DEAL' | 'WAC'>('WAC')
  const [selYear, setSelYear] = useState(String(new Date().getFullYear()))
  const [selMonth, setSelMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [mobileFrom, setMobileFrom] = useState(from)
  const [mobileTo, setMobileTo] = useState(to)
  const [mobileBranchId, setMobileBranchId] = useState(branchId)
  const [mobileCostBasis, setMobileCostBasis] = useState(costBasis)
  const [mobileViewMode, setMobileViewMode] = useState(viewMode)
  const [mobileSelYear, setMobileSelYear] = useState(selYear)
  const [mobileSelMonth, setMobileSelMonth] = useState(selMonth)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [drill, setDrill] = useState<{ rows: DetailRow[]; title: string } | null>(null)
  const [yearlyData, setYearlyData] = useState<YearlyPlData | null>(null)
  const [yearlyLoading, setYearlyLoading] = useState(false)

  const effectiveRange = useMemo(() => {
    if (viewMode === 'month') {
      const lastDay = new Date(Number(selYear), Number(selMonth), 0).getDate()
      return {
        from: `${selYear}-${selMonth}-01`,
        to: `${selYear}-${selMonth}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    if (viewMode === 'yearly') {
      return {
        from: `${selYear}-01-01`,
        to: `${selYear}-12-31`,
      }
    }
    return { from, to }
  }, [from, selMonth, selYear, to, viewMode])

  const url = useMemo(() => {
    const search = new URLSearchParams({
      from: effectiveRange.from,
      to: effectiveRange.to,
    })
    if (costBasis !== 'WAC') search.set('costBasis', costBasis)
    if (branchId) search.set('branchId', branchId)
    return `/api/finance-accounting/pl-statement?${search.toString()}`
  }, [branchId, costBasis, effectiveRange.from, effectiveRange.to])
  const exportHref = `${url}&format=xlsx`
  const { data, error, isLoading, resolvedUrl } = useApi<PlPayload>(url)

  const yearOptions = useMemo(() => {
    const years = new Set<string>([String(new Date().getFullYear())])
    const addYear = (value?: string) => {
      if (value?.slice(0, 4)) years.add(value.slice(0, 4))
    }
    addYear(data?.filters.from)
    addYear(data?.filters.to)
    return Array.from(years).sort().reverse()
  }, [data?.filters.from, data?.filters.to])

  useEffect(() => {
    if (viewMode !== 'yearly') {
      setYearlyData(null)
      setYearlyLoading(false)
      return
    }

    let mounted = true
    setYearlyLoading(true)
    Promise.all(Array.from({ length: 12 }, async (_, index) => {
      const month = String(index + 1).padStart(2, '0')
      const lastDay = new Date(Number(selYear), index + 1, 0).getDate()
      const search = new URLSearchParams({
        from: `${selYear}-${month}-01`,
        to: `${selYear}-${month}-${String(lastDay).padStart(2, '0')}`,
      })
      if (costBasis !== 'WAC') search.set('costBasis', costBasis)
      if (branchId) search.set('branchId', branchId)
      const payload = await dailyFetchJson<PlPayload>(`/api/finance-accounting/pl-statement?${search.toString()}`)
      return {
        cogs: payload.summary.cogs,
        depreciation: payload.summary.depreciation,
        expenses: payload.summary.expenses,
        fxNet: payload.summary.fxNet,
        grossProfit: payload.summary.grossProfit,
        interest: payload.summary.interest,
        label: thaiMonthLabels[index],
        month,
        netProfitBeforeTax: payload.summary.netProfitBeforeTax,
        operatingProfit: payload.summary.operatingProfit,
        revenue: payload.summary.revenue,
      }
    }))
      .then((months) => {
        if (!mounted) return
        const totals = months.reduce((acc, month) => ({
          cogs: acc.cogs + month.cogs,
          depreciation: acc.depreciation + month.depreciation,
          expenses: acc.expenses + month.expenses,
          fxNet: acc.fxNet + month.fxNet,
          grossProfit: acc.grossProfit + month.grossProfit,
          interest: acc.interest + month.interest,
          netProfitBeforeTax: acc.netProfitBeforeTax + month.netProfitBeforeTax,
          operatingProfit: acc.operatingProfit + month.operatingProfit,
          revenue: acc.revenue + month.revenue,
        }), {
          cogs: 0,
          depreciation: 0,
          expenses: 0,
          fxNet: 0,
          grossProfit: 0,
          interest: 0,
          netProfitBeforeTax: 0,
          operatingProfit: 0,
          revenue: 0,
        })
        setYearlyData({ months, totals, year: selYear })
      })
      .finally(() => {
        if (mounted) setYearlyLoading(false)
      })

    return () => { mounted = false }
  }, [branchId, costBasis, selYear, viewMode])

  const displayData = data && resolvedUrl === url && !isLoading && !error ? data : null
  const selectedBranch = (displayData?.branches ?? data?.branches ?? []).find((branch) => branch.id === branchId)?.name ?? 'ทุกสาขา'
  const periodLabel = viewMode === 'month'
    ? `${thaiMonthName(selMonth)} ${selYear}`
    : viewMode === 'yearly'
      ? `ม.ค. - ธ.ค. ${selYear}`
      : `${shortThaiDate(effectiveRange.from)} – ${shortThaiDate(effectiveRange.to)}`
  const activeBasis = costBasis === 'DEAL' ? 'Deal Cost' : costBasis === 'COMPARE' ? 'WAC + Compare' : 'WAC'
  const revenue = displayData?.summary.revenue ?? 0
  const grossProfit = displayData?.summary.grossProfit ?? 0
  const operatingProfit = displayData?.summary.operatingProfit ?? 0
  const netProfitBeforeTax = displayData?.summary.netProfitBeforeTax ?? 0
  const cogs = displayData?.summary.cogs ?? 0
  const opex = (displayData?.summary.expenses ?? 0) + (displayData?.summary.depreciation ?? 0)
  const interest = displayData?.summary.interest ?? 0
  const fxNet = displayData?.summary.fxNet ?? 0
  const stockRevenue = displayData?.split.stock.revenue ?? 0
  const stockCogs = displayData?.split.stock.cogs ?? 0
  const tradingRevenue = displayData?.split.trading.revenue ?? 0
  const tradingCogs = displayData?.split.trading.cogs ?? 0
  const grossMarginPct = revenue > 0 ? grossProfit / revenue * 100 : 0
  const operatingMarginPct = revenue > 0 ? operatingProfit / revenue * 100 : 0
  const preTaxMarginPct = revenue > 0 ? netProfitBeforeTax / revenue * 100 : 0
  const isDealView = costBasis === 'DEAL'
  const hasActiveFilters = viewMode !== 'period'
    || from !== monthStart()
    || to !== today()
    || branchId !== ''
    || costBasis !== 'WAC'

  function openMobileFilters() {
    setMobileFrom(from)
    setMobileTo(to)
    setMobileBranchId(branchId)
    setMobileCostBasis(costBasis)
    setMobileViewMode(viewMode)
    setMobileSelYear(selYear)
    setMobileSelMonth(selMonth)
    setShowMobileFilters(true)
  }

  function isPresetActive(preset: 'month' | 'quarter' | 'today' | 'week' | 'year') {
    return viewMode === 'period' && activePreset === preset
  }

  function setPreset(preset: 'month' | 'quarter' | 'today' | 'week' | 'year') {
    const now = new Date()
    const todayValue = today()
    setActivePreset(preset)
    if (preset === 'today') {
      setFrom(todayValue)
      setTo(todayValue)
    } else if (preset === 'week') {
      const start = new Date(now)
      start.setDate(start.getDate() - 6)
      setFrom(localDateInputValue(start))
      setTo(todayValue)
    } else if (preset === 'month') {
      setFrom(monthStart())
      setTo(todayValue)
    } else if (preset === 'quarter') {
      const qStart = Math.floor(now.getMonth() / 3) * 3
      setFrom(localDateInputValue(new Date(now.getFullYear(), qStart, 1)))
      setTo(localDateInputValue(new Date(now.getFullYear(), qStart + 3, 0)))
    } else {
      setFrom(`${now.getFullYear()}-01-01`)
      setTo(todayValue)
    }
    setViewMode('period')
  }

  return (
    <section aria-busy={isLoading || yearlyLoading} className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}

      {displayData?.historicalBaseline?.hasData ? (
        <AnalysisPanel subtitle="ตัวเลขก่อน Go-Live ที่ legacy ใช้เป็น baseline เดิม" title="Historical Baseline (ม.ค. - เม.ย. 2026)">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MiniMetric label="Revenue" tone="emerald" value={money(displayData.historicalBaseline.revenue)} />
            <MiniMetric label="COGS" tone="red" value={money(displayData.historicalBaseline.cogs)} />
            <MiniMetric label="Operating Expenses" tone="amber" value={money(displayData.historicalBaseline.opex)} />
            <MiniMetric label="Interest" tone="slate" value={money(displayData.historicalBaseline.interest)} />
            <MiniMetric label="Net Profit" tone={displayData.historicalBaseline.netProfit >= 0 ? 'emerald' : 'red'} value={money(displayData.historicalBaseline.netProfit)} />
          </div>
        </AnalysisPanel>
      ) : null}

      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap gap-2">
          <LineTabs
            options={[
              { label: 'ช่วงวันที่', value: 'period' },
              { label: 'รายเดือน', value: 'month' },
              { label: 'ตารางรายปี', value: 'yearly' },
            ]}
            value={viewMode}
            onChange={(value) => setViewMode(value as 'month' | 'period' | 'yearly')}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {viewMode === 'period' ? (
            <>
              <span className="text-xs text-slate-500">ดูเร็ว:</span>
              <QuickButton active={isPresetActive('year')} onClick={() => setPreset('year')}>ปีนี้</QuickButton>
              <QuickButton active={isPresetActive('quarter')} onClick={() => setPreset('quarter')}>ไตรมาส</QuickButton>
              <QuickButton active={isPresetActive('month')} onClick={() => setPreset('month')}>เดือนนี้</QuickButton>
              <QuickButton active={isPresetActive('week')} onClick={() => setPreset('week')}>7 วัน</QuickButton>
              <QuickButton active={isPresetActive('today')} onClick={() => setPreset('today')}>วันนี้</QuickButton>
              <span className="mx-1 h-6 w-px bg-slate-200" />
            </>
          ) : null}
          {viewMode === 'period' ? (
            <>
              <DateInput label="จาก" value={from} onChange={(value) => { setFrom(value); setActivePreset('custom') }} />
              <DateInput label="ถึง" value={to} onChange={(value) => { setTo(value); setActivePreset('custom') }} />
            </>
          ) : null}
          {viewMode === 'month' ? (
            <div className="flex items-center gap-2">
              <MonthSelect value={selMonth} onChange={setSelMonth} />
              <YearSelect value={selYear} years={yearOptions} onChange={setSelYear} />
            </div>
          ) : null}
          {viewMode === 'yearly' ? (
            <YearSelect value={selYear} years={yearOptions} onChange={setSelYear} />
          ) : null}
          <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={(value) => { setBranchId(value); setActivePreset('custom') }} />
          {hasActiveFilters ? <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50" type="button" onClick={() => {
            setViewMode('period')
            setFrom(monthStart())
            setTo(today())
            setBranchId('')
            setCostBasis('WAC')
            setSelYear(String(new Date().getFullYear()))
            setSelMonth(String(new Date().getMonth() + 1).padStart(2, '0'))
            setActivePreset('month')
          }}
          >
            ล้างตัวกรอง
          </button> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-600">มุมมองต้นทุน :</span>
          <LineTabs
            options={[
              { label: 'WAC', value: 'WAC' },
              { label: 'Deal Cost', value: 'DEAL' },
              { label: 'Side-by-side', value: 'COMPARE' },
            ]}
            value={costBasis}
            onChange={(value) => setCostBasis(value as 'COMPARE' | 'DEAL' | 'WAC')}
          />
          <a className="ml-auto inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-normal text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={exportHref}>ส่งออก Excel</a>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">งบกำไรขาดทุน</div>
            <div className="truncate text-sm font-bold text-slate-800">{periodLabel}</div>
            <div className="truncate text-xs text-slate-500">{selectedBranch} · {activeBasis}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={exportHref}>Excel</a>
            <button type="button" className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/40" onClick={openMobileFilters}>
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
              ตัวกรอง{branchId || costBasis !== 'WAC' ? ' (มี)' : ''}
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          <QuickPill active={viewMode === 'period'} label="ช่วงวันที่" onClick={() => setViewMode('period')} />
          <QuickPill active={viewMode === 'month'} label="รายเดือน" onClick={() => setViewMode('month')} />
          <QuickPill active={viewMode === 'yearly'} label="รายปี" onClick={() => setViewMode('yearly')} />
        </div>
      </div>

      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองงบกำไรขาดทุน"
          onClose={() => setShowMobileFilters(false)}
          footer={
            <>
              <button type="button" onClick={() => {
                setMobileViewMode('period')
                setMobileFrom(monthStart())
                setMobileTo(today())
                setMobileBranchId('')
                setMobileCostBasis('WAC')
                setMobileSelYear(String(new Date().getFullYear()))
                setMobileSelMonth(String(new Date().getMonth() + 1).padStart(2, '0'))
              }} className="h-10 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                ล้างตัวกรอง
              </button>
              <button type="button" onClick={() => {
                setViewMode(mobileViewMode)
                setFrom(mobileFrom)
                setTo(mobileTo)
                setBranchId(mobileBranchId)
                setCostBasis(mobileCostBasis)
                setSelYear(mobileSelYear)
                setSelMonth(mobileSelMonth)
                setActivePreset('custom')
                setShowMobileFilters(false)
              }} className="h-10 rounded-md bg-blue-600 text-sm font-normal text-white transition hover:bg-blue-700">
                ใช้ตัวกรอง
              </button>
            </>
          }
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">มุมมองข้อมูล</label>
            <LineTabs options={[{ label: 'ช่วงวันที่', value: 'period' }, { label: 'รายเดือน', value: 'month' }, { label: 'รายปี', value: 'yearly' }]} value={mobileViewMode} onChange={(value) => setMobileViewMode(value as 'month' | 'period' | 'yearly')} />
          </div>
          {mobileViewMode === 'period' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="pl-statement-from-mobile">จากวันที่</label>
                <DatePickerInput ariaLabel="จากวันที่" className="w-full text-sm" id="pl-statement-from-mobile" value={mobileFrom} onChange={setMobileFrom} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="pl-statement-to-mobile">ถึงวันที่</label>
                <DatePickerInput ariaLabel="ถึงวันที่" className="w-full text-sm" id="pl-statement-to-mobile" value={mobileTo} onChange={setMobileTo} />
              </div>
            </div>
          ) : null}
          {mobileViewMode !== 'period' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">ปี</label>
                <Select aria-label="ปี" className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-slate-400" value={mobileSelYear} onChange={(event) => setMobileSelYear(event.target.value)}>
                  {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                </Select>
              </div>
              {mobileViewMode === 'month' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">เดือน</label>
                  <MonthSelect value={mobileSelMonth} onChange={setMobileSelMonth} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="pl-statement-branch-mobile">สาขา</label>
            <Select aria-label="สาขา" className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400" id="pl-statement-branch-mobile" value={mobileBranchId} onChange={(event) => setMobileBranchId(event.target.value)}>
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">มุมมองต้นทุน</label>
            <LineTabs options={[{ label: 'WAC', value: 'WAC' }, { label: 'Deal', value: 'DEAL' }, { label: 'Compare', value: 'COMPARE' }]} value={mobileCostBasis} onChange={(value) => setMobileCostBasis(value as 'COMPARE' | 'DEAL' | 'WAC')} />
          </div>
        </MobileFilterSheet>
      ) : null}
      {displayData ? <SourceNotice sourceState={displayData.sourceState} /> : null}
      {!displayData && !error ? <PlLoadingState /> : null}
      {displayData ? (
        <>
      {costBasis === 'COMPARE' ? (
        <CompareSummaryPanel
          cogsDeal={displayData.summary.cogsDeal}
          cogsDiff={displayData.summary.cogsDiff}
          cogsWac={displayData.summary.cogsWac}
          grossProfitDeal={displayData.summary.grossProfitDeal}
          grossProfitDiff={displayData.summary.grossProfitDiff}
          grossProfitWac={displayData.summary.grossProfitWac}
          netDeal={displayData.summary.netProfitBeforeTaxDeal}
          netDiff={displayData.summary.netProfitBeforeTaxDiff}
          netWac={displayData.summary.netProfitBeforeTaxWac}
          revenue={revenue}
          replacedCount={displayData.summary.dualReplacedCount}
        />
      ) : null}

      <KpiCardGrid className="lg:grid-cols-4 xl:grid-cols-4">
        <SharedKpiCard className={statementKpiClassName} icon={<ChartColumnBig aria-hidden="true" className="size-5" />} label="รายได้รวม" note={`${periodLabel} · ${activeBasis}`} tone="blue" value={money(revenue)} />
        <SharedKpiCard className={statementKpiClassName} icon={<TrendingUp aria-hidden="true" className="size-5" />} label="กำไรขั้นต้น" note={`${percent(grossMarginPct)} ของรายได้`} tone={grossProfit >= 0 ? 'emerald' : 'red'} value={money(grossProfit)} />
        <SharedKpiCard className={statementKpiClassName} icon={<Building2 aria-hidden="true" className="size-5" />} label="กำไรจากการดำเนินงาน" note={`${percent(operatingMarginPct)} ของรายได้`} tone={operatingProfit >= 0 ? 'cyan' : 'red'} value={money(operatingProfit)} />
        <SharedKpiCard className={statementKpiClassName} icon={netProfitBeforeTax >= 0 ? <ArrowUpRight aria-hidden="true" className="size-5" /> : <ArrowDownRight aria-hidden="true" className="size-5" />} label="กำไรก่อนภาษี" note={`${percent(preTaxMarginPct)} ของรายได้`} tone={netProfitBeforeTax >= 0 ? 'emerald' : 'red'} value={money(netProfitBeforeTax)} />
      </KpiCardGrid>

      <div className="grid grid-cols-1 gap-4">
        <AnalysisPanel subtitle={isDealView ? 'มุมมองผู้บริหาร: แทนต้นทุน WAC ด้วย Deal Cost จาก Cost Allocator สำหรับรายการที่จับคู่ได้ (ไม่ใช่งบจริง)' : `เริ่มจากรายได้ แล้วหักต้นทุนและค่าใช้จ่ายเพื่อให้เห็นว่ากำไรหายไปตรงไหน (${activeBasis})`} title="องค์ประกอบกำไรก่อนภาษี">
          <Waterfall legacyRed rows={[['Revenue (รายได้)', revenue], [isDealView ? '-Deal Cost (ต้นทุนตามดีล)' : '-COGS (ต้นทุนขาย)', -cogs], ['= GP (กำไรขั้นต้น)', grossProfit], ['-Operating Expenses', -opex], ['-Interest', -interest], ['FX Gain/(Loss)', fxNet], ['Asset Disposal Gain/(Loss)', displayData.summary.assetDisposalNet], ['= NP (กำไรก่อนภาษี)', netProfitBeforeTax]]} />
        </AnalysisPanel>
      </div>

      <AnalysisPanel subtitle={isDealView ? 'ในมุมมองนี้ COGS ของแต่ละกลุ่มจะแสดงเป็น Deal Cost จาก Cost Allocator เพื่อใช้ดูเชิงบริหาร' : 'แยกภาพกำไรขั้นต้นตามลักษณะธุรกิจ เพื่อดูว่าส่วนไหนทำเงินหรือกินมาร์จิ้นมากกว่า'} title="Stock vs Trading Split">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:items-start">
          <div className="grid gap-3 lg:grid-cols-2">
            <MixBreakdownCard cogs={stockCogs} cogsLabel={isDealView ? 'Deal Cost / ต้นทุนตามดีล' : 'COGS'} label="Stock Business (สต็อก)" revenue={stockRevenue} tone="emerald" />
            <MixBreakdownCard cogs={tradingCogs} cogsLabel={isDealView ? 'Deal Cost / ต้นทุนตามดีล' : 'COGS'} label="Trading Business (ซื้อขาย)" revenue={tradingRevenue} tone="violet" />
          </div>
          <StockTradingGpChart stockGrossProfit={stockRevenue - stockCogs} tradingGrossProfit={tradingRevenue - tradingCogs} />
        </div>
      </AnalysisPanel>

      {isDealView ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          มุมมอง <span className="font-semibold">Deal Cost</span> ใช้ต้นทุนจาก <span className="font-semibold">Cost Allocator</span> แทน WAC สำหรับการดูเชิงบริหารในรายการที่จับคู่ได้ และไม่ใช่งบปิดจริง
        </div>
      ) : null}

      {viewMode === 'yearly' ? (
        <YearlyPlTable data={yearlyData} isLoading={yearlyLoading} year={selYear} />
      ) : (
        <StatementTable isLoading={false} rows={displayData.sections} tableKey="pl-statement" title={`งบกำไรขาดทุน (${activeBasis})`} onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined} />
      )}

      {costBasis === 'COMPARE' ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          ตารางหลักด้านล่างยังใช้สูตร WAC เป็นฐาน และแสดงบัตรเปรียบเทียบ Deal Cost แบบ side-by-side ด้านบน เพื่อคงตัวเลขปิดงบจริงไว้ชัดเจน
        </div>
      ) : null}

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
  const selectedBranch = (data?.branches ?? []).find((branch) => branch.id === branchId)?.name ?? 'ทุกสาขา'
  const asOfLabel = shortThaiDate(asOf)
  const currentAssets = (data?.summary.cash ?? 0) + (data?.summary.ar ?? 0) + (data?.summary.inventory ?? 0)
  const workingCapital = data?.ratios.workingCapital ?? 0
  const currentRatio = data?.ratios.currentRatio ?? 0
  const debtToEquity = data?.ratios.debtToEquity ?? 0
  const totalAssets = data?.summary.totalAssets ?? 0
  const totalLiabilities = data?.summary.totalLiabilities ?? 0
  const totalEquity = data?.summary.totalEquity ?? 0
  const balanceDifference = Math.abs(data?.balanceCheck.difference ?? 0)
  const debtToAsset = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}

      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <DateInput label="ณ วันที่" value={asOf} onChange={setAsOf} />
          <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50" type="button" onClick={() => { setAsOf(today()); setBranchId('') }}>ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ดูเร็ว:</span>
          <QuickButton onClick={() => setAsOf(today())}>วันนี้</QuickButton>
          <QuickButton onClick={() => {
            const now = new Date()
            setAsOf(localDateInputValue(new Date(now.getFullYear(), now.getMonth(), 0)))
          }}
          >
            สิ้นเดือนก่อน
          </QuickButton>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">งบ ณ วันที่</div>
            <div className="truncate text-sm font-bold text-slate-800">{asOfLabel}</div>
            <div className="truncate text-xs text-slate-500">{selectedBranch}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/40"
            onClick={() => setShowMobileFilters(true)}
          >
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            ตัวกรอง{branchId ? ' (มี)' : ''}
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
            <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="balance-sheet-as-of-mobile">ณ วันที่</label>
            <DatePickerInput ariaLabel="ณ วันที่" className="w-full text-sm" id="balance-sheet-as-of-mobile" value={asOf} onChange={setAsOf} />
          </div>

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

      <KpiCardGrid className="lg:grid-cols-4 xl:grid-cols-4">
        <SharedKpiCard className={statementKpiClassName} icon={<Wallet aria-hidden="true" className="size-5" />} label="Total Assets / สินทรัพย์รวม" note={`งบ ณ ${asOfLabel}`} tone="blue" value={money(totalAssets)} />
        <SharedKpiCard className={statementKpiClassName} icon={<Landmark aria-hidden="true" className="size-5" />} label="Total Liabilities / หนี้สินรวม" note={`${percent(totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0)} ของสินทรัพย์`} tone="orange" value={money(totalLiabilities)} />
        <SharedKpiCard className={statementKpiClassName} icon={<Scale aria-hidden="true" className="size-5" />} label="Total Equity / ส่วนทุนรวม" note={`D/E ${debtToEquity.toFixed(2)} เท่า`} tone="purple" value={money(totalEquity)} />
        <SharedKpiCard className={statementKpiClassName} icon={<Activity aria-hidden="true" className="size-5" />} label="Working Capital / เงินทุนหมุนเวียน" note={workingCapital >= 0 ? 'สินทรัพย์หมุนเวียนยังมากกว่าหนี้ระยะสั้น' : 'หนี้ระยะสั้นสูงกว่าสินทรัพย์หมุนเวียน'} tone={workingCapital >= 0 ? 'emerald' : 'red'} value={money(workingCapital)} />
      </KpiCardGrid>

      <AnalysisPanel subtitle={`สรุปภาพรวมของ ${selectedBranch} ณ ${asOfLabel} ก่อนลงไปอ่านตารางสินทรัพย์และหนี้สิน`} title="สรุปที่ควรอ่านก่อน">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatementInsightCard
            body={`${currentRatio.toFixed(2)} เท่า`}
            title="Current Ratio"
            tone={currentRatio >= 1 ? 'good' : 'warn'}
          />
          <StatementInsightCard
            body={`${debtToEquity.toFixed(2)} เท่า`}
            title="Debt-to-Equity"
            tone={debtToEquity <= 2 ? 'good' : 'warn'}
          />
          <StatementInsightCard
            body={percent(debtToAsset)}
            title="Debt-to-Asset"
            tone={debtToAsset < 60 ? 'good' : 'warn'}
          />
          <StatementInsightCard
            body={money(workingCapital)}
            title="Working Capital"
            tone={workingCapital >= 0 ? 'good' : 'bad'}
          />
          <StatementInsightCard
            body={data?.balanceCheck.balanced ? 'สมดุล' : money(balanceDifference)}
            title={data?.balanceCheck.balanced ? 'Balance Check ผ่าน' : 'Balance Check ยังต่าง'}
            tone={data?.balanceCheck.balanced ? 'good' : 'bad'}
          />
        </div>
      </AnalysisPanel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalysisPanel className="h-full" subtitle="อ่านเร็วว่าสินทรัพย์กองอยู่ที่เงินสด ลูกหนี้ สต็อก หรือทรัพย์สินถาวรมากแค่ไหน" title="Assets Breakdown / โครงสร้างสินทรัพย์">
          <BreakdownDonut
            centerTotal={totalAssets}
            segments={[
              { color: '#10b981', label: 'Cash / เงินสด', value: data?.summary.cash ?? 0 },
              { color: '#06b6d4', label: 'AR / ลูกหนี้', value: data?.summary.ar ?? 0 },
              { color: '#f59e0b', label: 'Stock / สต็อก', value: data?.summary.inventory ?? 0 },
              { color: '#8b5cf6', label: 'Fixed / ทรัพย์สินถาวร', value: data?.summary.fixedAssetNet ?? 0 },
            ]}
            legendMode="percent"
          />
        </AnalysisPanel>
        <AnalysisPanel className="h-full" subtitle="ช่วยแยกแรงกดจากเจ้าหนี้ เงินกู้ระยะสั้น ระยะยาว และส่วนทุน" title="Liab + Equity / โครงสร้างหนี้สิน + ส่วนทุน">
          <BreakdownDonut
            centerTotal={(data?.summary.liabilitiesAndEquity ?? 0) || (totalLiabilities + totalEquity)}
            segments={[
              { color: '#ef4444', label: 'AP / เจ้าหนี้', value: data?.summary.ap ?? 0 },
              { color: '#f97316', label: 'Loan / เงินกู้', value: (data?.summary.currentLoan ?? 0) + (data?.summary.longTermLoan ?? 0) },
              { color: '#10b981', label: 'Equity / ส่วนทุน', value: totalEquity },
            ]}
            legendMode="value"
          />
        </AnalysisPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <LegacyBalanceSheetTable
          groups={[
            {
              key: 'current-assets',
              rows: (data?.sections.assets ?? []).filter((line) => line.section === 'currentAssets'),
              title: 'Current Assets',
              tone: 'blue',
              totalLabel: 'Total Current Assets',
              totalValue: currentAssets,
            },
            {
              key: 'non-current-assets',
              rows: (data?.sections.assets ?? []).filter((line) => line.section === 'nonCurrentAssets'),
              title: 'Non-current Assets',
              tone: 'blue',
              totalLabel: 'TOTAL ASSETS',
              totalValue: totalAssets,
              totalVariant: 'grand',
            },
          ]}
          isLoading={isLoading}
          title="ASSETS / สินทรัพย์"
          titleTone="blue"
          onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined}
        />
        <LegacyBalanceSheetTable
          groups={[
            {
              key: 'current-liabilities',
              rows: (data?.sections.liabilities ?? []).filter((line) => line.section === 'currentLiabilities'),
              title: 'Current Liabilities',
              tone: 'amber',
              totalLabel: 'Total Current Liabilities',
              totalValue: (data?.summary.ap ?? 0) + (data?.summary.currentLoan ?? 0),
            },
            {
              key: 'non-current-liabilities',
              rows: (data?.sections.liabilities ?? []).filter((line) => line.section === 'nonCurrentLiabilities'),
              title: 'Non-current Liabilities',
              tone: 'amber',
              totalLabel: 'Total Liabilities',
              totalValue: totalLiabilities,
            },
            {
              key: 'equity',
              rows: data?.sections.equity ?? [],
              title: 'Equity',
              tone: 'purple',
              totalLabel: 'Total Equity',
              totalValue: totalEquity,
            },
            {
              key: 'liab-equity-total',
              rows: [],
              title: '',
              tone: 'amber',
              totalLabel: 'TOTAL LIAB + EQUITY',
              totalValue: data?.summary.liabilitiesAndEquity ?? (totalLiabilities + totalEquity),
              totalVariant: 'grand',
            },
          ]}
          isLoading={isLoading}
          title="LIABILITIES + EQUITY"
          titleTone="amber"
          onDrill={(line) => line.details?.length ? setDrill({ rows: line.details, title: line.label }) : undefined}
        />
      </div>
      {drill ? <DrillModal rows={drill.rows} title={drill.title} onClose={() => setDrill(null)} /> : null}
    </section>
  )
}

export function CashFlowStatementPageClient({ initialFilters }: { initialFilters?: { branchId?: string; from?: string; to?: string } } = {}) {
  const [from, setFrom] = useState(initialFilters?.from || monthStart())
  const [to, setTo] = useState(initialFilters?.to || today())
  const [branchId, setBranchId] = useState(initialFilters?.branchId || '')
  const [mobileFrom, setMobileFrom] = useState(from)
  const [mobileTo, setMobileTo] = useState(to)
  const [mobileBranchId, setMobileBranchId] = useState(branchId)
  const url = useMemo(() => `/api/finance-accounting/cash-flow-statement?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, to])
  const { data, error, isLoading } = useApi<CashPayload>(url)
  const [drill, setDrill] = useState<{ rows: DetailRow[]; title: string } | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const selectedBranch = (data?.branches ?? []).find((branch) => branch.id === branchId)?.name ?? 'ทุกสาขา'
  const periodLabel = `${shortThaiDate(from)} – ${shortThaiDate(to)}`
  const openingCash = data?.summary.openingCash ?? 0
  const endingCash = data?.summary.endingCash ?? 0
  const operating = data?.summary.operating ?? 0
  const investing = data?.summary.investing ?? 0
  const financing = data?.summary.financing ?? 0
  const netChange = data?.summary.netChange ?? 0
  const totalInflow = data?.summary.totalInflow ?? 0
  const totalOutflow = data?.summary.totalOutflow ?? 0
  const internalTransfers = data?.summary.internalTransfers ?? 0
  const netChangePct = openingCash !== 0 ? Math.abs(netChange) / Math.abs(openingCash) * 100 : 0

  function openMobileFilters() {
    setMobileFrom(from)
    setMobileTo(to)
    setMobileBranchId(branchId)
    setShowMobileFilters(true)
  }

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}

      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <DateInput label="จาก" value={from} onChange={setFrom} />
          <DateInput label="ถึง" value={to} onChange={setTo} />
          <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50" type="button" onClick={() => { setFrom(monthStart()); setTo(today()); setBranchId('') }}>
            ล้างตัวกรอง
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ช่วงเวลา:</span>
          <QuickButton onClick={() => { setFrom(monthStart()); setTo(today()) }}>เดือนนี้</QuickButton>
          <QuickButton onClick={() => { const now = new Date(); setFrom(localDateInputValue(new Date(now.getFullYear(), 0, 1))); setTo(today()) }}>ปีนี้</QuickButton>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">ช่วงงบที่กำลังดู</div>
            <div className="truncate text-sm font-bold text-slate-800">{periodLabel}</div>
            <div className="truncate text-xs text-slate-500">{selectedBranch}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/40"
            onClick={openMobileFilters}
          >
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            ตัวกรอง{branchId ? ' (มี)' : ''}
          </button>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => { setFrom(monthStart()); setTo(today()) }}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            เดือนนี้
          </button>
          <button
            type="button"
            onClick={() => { const now = new Date(); setFrom(localDateInputValue(new Date(now.getFullYear(), 0, 1))); setTo(today()) }}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ปีนี้
          </button>
        </div>
      </div>

      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองเพิ่มเติม"
          onClose={() => setShowMobileFilters(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setMobileFrom(monthStart())
                  setMobileTo(today())
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
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="cash-flow-statement-from-mobile">จากวันที่</label>
              <DatePickerInput ariaLabel="จากวันที่" className="w-full text-sm" id="cash-flow-statement-from-mobile" value={mobileFrom} onChange={setMobileFrom} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="cash-flow-statement-to-mobile">ถึงวันที่</label>
              <DatePickerInput ariaLabel="ถึงวันที่" className="w-full text-sm" id="cash-flow-statement-to-mobile" value={mobileTo} onChange={setMobileTo} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">สาขา</label>
            <Select
              aria-label="Branch select"
              className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              value={mobileBranchId}
              onChange={(event) => setMobileBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            ดูงบช่วง <span className="font-semibold text-slate-700">{shortThaiDate(mobileFrom)} – {shortThaiDate(mobileTo)}</span>
          </div>
        </MobileFilterSheet>
      ) : null}

      <KpiCardGrid className="lg:grid-cols-4 xl:grid-cols-4">
        <SharedKpiCard className={statementKpiClassName} icon={<Wallet aria-hidden="true" className="size-5" />} label="Beginning Cash / เงินสดต้นงวด" note={periodLabel} tone="blue" value={money(openingCash)} />
        <SharedKpiCard className={statementKpiClassName} icon={netChange >= 0 ? <ArrowUpRight aria-hidden="true" className="size-5" /> : <ArrowDownRight aria-hidden="true" className="size-5" />} label="เงินสดสุทธิเพิ่ม/ลด" note={openingCash !== 0 ? `${netChange >= 0 ? 'เปลี่ยนแปลง' : 'ลดลง'} ${percent(netChangePct)}` : 'ไม่มีฐานต้นงวดให้เทียบ'} tone={netChange >= 0 ? 'emerald' : 'red'} value={money(netChange)} />
        <SharedKpiCard className={statementKpiClassName} icon={<Activity aria-hidden="true" className="size-5" />} label="กระแสเงินสดจากดำเนินงาน" note={operating >= 0 ? 'ธุรกิจหลักสร้างเงินสดได้' : 'ธุรกิจหลักใช้เงินสดสุทธิ'} tone={operating >= 0 ? 'cyan' : 'red'} value={money(operating)} />
        <SharedKpiCard className={statementKpiClassName} icon={<Landmark aria-hidden="true" className="size-5" />} label="Ending Cash / เงินสดปลายงวด" note={`หลังรวมลงทุนและจัดหาเงิน`} tone="purple" value={money(endingCash)} />
      </KpiCardGrid>

      <div className="grid grid-cols-1 gap-4">
        <AnalysisPanel
          subtitle="เริ่มจาก Beginning Cash / เงินสดต้นงวด แล้วดูว่ากิจกรรมดำเนินงาน ลงทุน และจัดหาเงิน ทำให้ Ending Cash / เงินสดปลายงวดเปลี่ยนอย่างไร"
          title="สะพานกระแสเงินสด"
        >
          <CashFlowRealityLines endingCash={endingCash} financing={financing} investing={investing} openingCash={openingCash} operating={operating} />
        </AnalysisPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AnalysisPanel subtitle="เทียบเงินสดรับจากแต่ละกิจกรรม เพื่อดูว่าเงินเข้าในงวดนี้พึ่งพาส่วนไหนมากที่สุด" title="เงินสดรับตามกิจกรรม">
          <Waterfall rows={[['ดำเนินงาน', data?.activities.operating.inflow ?? 0], ['ลงทุน', data?.activities.investing.inflow ?? 0], ['จัดหาเงิน', data?.activities.financing.inflow ?? 0]]} />
        </AnalysisPanel>
        <AnalysisPanel subtitle="ดูผลสุทธิหลังหักเงินรับ-จ่ายของแต่ละกิจกรรม ว่าส่วนไหนเป็นตัวกดหรือหนุนเงินสด" title="เงินสดสุทธิตามกิจกรรม">
          <Waterfall rows={[['ดำเนินงาน', operating], ['ลงทุน', investing], ['จัดหาเงิน', financing]]} />
        </AnalysisPanel>
        <AnalysisPanel subtitle="ตัวเลขสรุปแบบเร็วสำหรับผู้บริหารก่อน drill ลงรายละเอียดรายการ" title="ตัวเลขรวมทั้งงวด">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <MiniMetric label="เงินสดรับรวม" tone="emerald" value={money(totalInflow)} />
            <MiniMetric label="เงินสดจ่ายรวม" tone="red" value={money(totalOutflow)} />
            <MiniMetric label="โอนเงินภายใน (ไม่รวม)" tone="slate" value={money(internalTransfers)} />
            <MiniMetric label="Ending Cash / เงินสดปลายงวด" tone={endingCash >= 0 ? 'emerald' : 'red'} value={money(endingCash)} />
          </div>
        </AnalysisPanel>
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

function percent(value: number) {
  if (!Number.isFinite(value)) return 'ไม่มีข้อมูล'
  return `${value.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function shortThaiDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(year, month - 1, day))
}

const thaiMonthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function thaiMonthName(month: string) {
  return thaiMonthLabels[Math.max(0, Number(month) - 1)] ?? month
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

function QuickButton({ active = false, children, onClick }: { active?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={`rounded-md border px-3 py-1 text-xs font-medium transition outline-none focus:ring-0 ${
        active
          ? 'border-slate-700 bg-slate-700 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function QuickPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={`h-9 rounded-md border px-3 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`} type="button" onClick={onClick}>{label}</button>
}

function LineTabs({ onChange, options, value }: { onChange: (value: string) => void; options: Array<{ label: string; value: string }>; value: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          className={`h-9 rounded-md border px-3 text-xs font-semibold transition ${value === option.value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
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

const statementKpiClassName = 'items-start sm:items-center [&_.truncate]:overflow-visible [&_.truncate]:text-clip [&_.truncate]:whitespace-normal [&>div:first-child]:hidden sm:[&>div:first-child]:flex'

function AnalysisPanel({ children, className = '', subtitle, title }: { children: ReactNode; className?: string; subtitle?: string; title: string }) {
  return (
    <section className={`rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-sm font-bold leading-snug text-slate-800 sm:text-base">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function BreakdownDonut({
  centerTotal,
  legendMode,
  segments,
}: {
  centerTotal: number
  legendMode: 'percent' | 'value'
  segments: Array<{ color: string; label: string; value: number }>
}) {
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const total = centerTotal > 0 ? centerTotal : segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0)
  const arcs = segments.reduce<{ offset: number; rows: Array<{ dash: number; offset: number; segment: (typeof segments)[number] }> }>((result, segment) => {
    const safeValue = Math.max(segment.value, 0)
    const dash = total > 0 ? (safeValue / total) * circumference : 0
    return {
      offset: result.offset + dash,
      rows: [...result.rows, { dash, offset: result.offset, segment }],
    }
  }, { offset: 0, rows: [] }).rows

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center py-2">
        <svg viewBox="0 0 200 200" className="mx-auto h-40 w-full max-w-[210px] sm:h-44 sm:max-w-[220px]">
        {total > 0 ? (
          <g transform="rotate(-90 100 100)">
            {arcs.map(({ dash, offset, segment }) => (
                <circle
                  key={`${segment.label}-${segment.value}`}
                  cx="100"
                  cy="100"
                  fill="none"
                  r={radius}
                  stroke={segment.color}
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeDashoffset={-offset}
                  strokeWidth="30"
                />
              ))}
          </g>
        ) : (
          <circle cx="100" cy="100" fill="none" r={radius} stroke="#e2e8f0" strokeWidth="30" />
        )}
        <text x="100" y="98" textAnchor="middle" fontSize="10" fill="#64748b">รวม / Total</text>
        <text x="100" y="115" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1e293b">{compactMillion(centerTotal)}</text>
        </svg>
      </div>

      <div className={`grid gap-x-3 gap-y-1.5 text-[10px] leading-snug ${legendMode === 'percent' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-start gap-1.5 text-slate-600">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }}></span>
            <span className="min-w-0 break-words">
              {segment.label}:{' '}
              {legendMode === 'percent'
                ? `${total > 0 ? Math.round((Math.max(segment.value, 0) / total) * 100) : 0}%`
                : money(segment.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function compactMillion(value: number) {
  return `${(value / 1_000_000).toFixed(1)}M`
}

function LegacyBalanceSheetTable({
  groups,
  isLoading,
  onDrill,
  title,
  titleTone,
}: {
  groups: Array<{
    key: string
    rows: StatementLine[]
    title: string
    tone: 'amber' | 'blue' | 'purple'
    totalLabel: string
    totalValue: number
    totalVariant?: 'grand' | 'normal'
  }>
  isLoading: boolean
  onDrill: (line: StatementLine) => void | undefined
  title: string
  titleTone: 'amber' | 'blue'
}) {
  const titleClassName = titleTone === 'blue' ? 'text-blue-700' : 'text-amber-700'

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`border-b border-slate-100 px-4 py-3 text-lg font-bold ${titleClassName}`}>{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400" colSpan={2}>กำลังโหลดข้อมูล</td>
              </tr>
            ) : null}
            {!isLoading && groups.flatMap((group) => group.rows).length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400" colSpan={2}>ยังไม่มีข้อมูล</td>
              </tr>
            ) : null}
            {!isLoading ? groups.map((group) => (
              <Fragment key={group.key}>
                {group.title ? (
                  <tr className={legacySectionRowClassName(group.tone)}>
                    <td className="p-2 font-bold" colSpan={2}>{group.title}</td>
                  </tr>
                ) : null}
                {group.rows.map((line) => (
                  <Fragment key={`${group.key}-${line.label}`}>
                    {line.details?.length ? (
                      <tr className="border-t border-slate-100 transition hover:bg-slate-50">
                        <td className="p-0 text-slate-700" colSpan={2}>
                          <button
                            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 pl-6 text-left"
                            type="button"
                            onClick={() => onDrill(line)}
                          >
                            <span className={line.tone === 'total' ? 'font-medium' : ''}>{line.label}</span>
                            <span className={`text-right font-mono tabular-nums ${line.amount < 0 ? 'text-red-600' : 'text-slate-800'} ${line.tone === 'total' ? 'font-medium' : ''}`}>
                              {line.label === 'Accumulated Depreciation' ? `(${formatMoney(Math.abs(line.amount))})` : money(line.amount)}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr className="border-t border-slate-100">
                        <td className="p-2 pl-6 text-slate-700">
                          <div className="flex items-center gap-1">
                            <span className={line.tone === 'total' ? 'font-medium' : ''}>{line.label}</span>
                          </div>
                        </td>
                        <td className={`p-2 text-right font-mono tabular-nums ${line.amount < 0 ? 'text-red-600' : 'text-slate-800'} ${line.tone === 'total' ? 'font-medium' : ''}`}>
                          {line.label === 'Accumulated Depreciation' ? `(${formatMoney(Math.abs(line.amount))})` : money(line.amount)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                <tr className={legacyTotalRowClassName(group.tone, group.totalVariant ?? 'normal')}>
                  <td className="p-2 font-bold">{group.totalLabel}</td>
                  <td className="p-2 text-right font-mono font-bold tabular-nums">{money(group.totalValue)}</td>
                </tr>
              </Fragment>
            )) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function legacySectionRowClassName(tone: 'amber' | 'blue' | 'purple') {
  if (tone === 'blue') return 'bg-blue-50'
  if (tone === 'purple') return 'bg-purple-50'
  return 'bg-amber-50'
}

function legacyTotalRowClassName(tone: 'amber' | 'blue' | 'purple', variant: 'grand' | 'normal') {
  if (variant === 'grand') {
    if (tone === 'blue') return 'border-t-2 border-double border-blue-200 bg-blue-200 text-base'
    if (tone === 'purple') return 'border-t-2 border-double border-purple-200 bg-purple-200 text-base'
    return 'border-t-2 border-double border-amber-200 bg-amber-200 text-base'
  }
  if (tone === 'blue') return 'border-t bg-blue-100'
  if (tone === 'purple') return 'border-t bg-purple-100'
  return 'border-t bg-amber-100'
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

function MixBreakdownCard({ cogs, cogsLabel = 'COGS', label, revenue, tone }: { cogs: number; cogsLabel?: string; label: string; revenue: number; tone: 'emerald' | 'violet' }) {
  const grossProfit = revenue - cogs
  const margin = revenue > 0 ? grossProfit / revenue * 100 : 0
  const shellClass = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/70' : 'border-violet-200 bg-violet-50/70'
  const accentClass = tone === 'emerald' ? 'text-emerald-700' : 'text-violet-700'

  return (
    <div className={`rounded-xl border p-3 ${shellClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">กลุ่มธุรกิจ</div>
          <div className="text-sm font-bold text-slate-800">{label}</div>
        </div>
        <div className={`rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold shadow-sm ${accentClass}`}>
          Margin {percent(margin)}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-slate-500">Revenue / รายได้</div>
          <div className="mt-1 font-mono font-bold text-slate-800">{money(revenue)}</div>
        </div>
        <div>
          <div className="text-slate-500">{cogsLabel}</div>
          <div className="mt-1 font-mono font-bold text-slate-800">{money(cogs)}</div>
        </div>
        <div>
          <div className="text-slate-500">GP / กำไรขั้นต้น</div>
          <div className={`mt-1 font-mono font-bold ${accentClass}`}>{money(grossProfit)}</div>
        </div>
      </div>
    </div>
  )
}

function StockTradingGpChart({ stockGrossProfit, tradingGrossProfit }: { stockGrossProfit: number; tradingGrossProfit: number }) {
  const max = Math.max(Math.abs(stockGrossProfit), Math.abs(tradingGrossProfit), 1)
  const totalGrossProfit = stockGrossProfit + tradingGrossProfit
  const chartRows = [
    { label: 'Stock', tone: 'emerald', value: stockGrossProfit },
    { label: 'Trading', tone: 'violet', value: tradingGrossProfit },
  ] as const

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-500">Stock vs Trading GP</div>
      <div className="mt-3 space-y-3">
        {chartRows.map((row) => {
          const toneClass = row.tone === 'emerald' ? 'bg-emerald-500 text-emerald-700' : 'bg-violet-500 text-violet-700'
          const width = Math.max(8, Math.min(100, Math.abs(row.value) / max * 100))

          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className={row.tone === 'emerald' ? 'font-semibold text-emerald-700' : 'font-semibold text-violet-700'}>{row.label}</span>
                <span className="font-mono font-bold text-slate-700">{money(row.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`${toneClass.split(' ')[0]} h-full rounded-full`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-2 text-center text-xs font-semibold text-slate-500">
        Total GP: <span className="font-mono text-slate-800">{money(totalGrossProfit)}</span>
      </div>
    </div>
  )
}

function MiniMetric({ label, tone, value }: { label: string; tone: 'amber' | 'emerald' | 'red' | 'slate'; value: string }) {
  const toneClass = tone === 'red'
    ? 'text-red-700'
    : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-slate-700'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

function StatementInsightCard({ body, title, tone }: { body: string; title: string; tone: 'bad' | 'default' | 'good' | 'warn' }) {
  const toneClass = tone === 'bad'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-700'

  return (
    <article className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-xs font-semibold opacity-80">{title}</div>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums">{body}</div>
    </article>
  )
}

function YearSelect({ onChange, value, years }: { onChange: (value: string) => void; value: string; years: string[] }) {
  return (
    <Select aria-label="ปี" className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-slate-400" value={value} onChange={(event) => onChange(event.target.value)}>
      {years.map((year) => <option key={year} value={year}>{year}</option>)}
    </Select>
  )
}

function MonthSelect({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <Select aria-label="เดือน" className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-slate-400" value={value} onChange={(event) => onChange(event.target.value)}>
      {thaiMonthLabels.map((label, index) => {
        const month = String(index + 1).padStart(2, '0')
        return <option key={month} value={month}>{label}</option>
      })}
    </Select>
  )
}

function CompareSummaryPanel({ cogsDeal, cogsDiff, cogsWac, grossProfitDeal, grossProfitDiff, grossProfitWac, netDeal, netDiff, netWac, replacedCount, revenue }: { cogsDeal: number; cogsDiff: number; cogsWac: number; grossProfitDeal: number; grossProfitDiff: number; grossProfitWac: number; netDeal: number; netDiff: number; netWac: number; replacedCount: number; revenue: number }) {
  const gpPctWac = revenue > 0 ? (grossProfitWac / revenue) * 100 : 0
  const gpPctDeal = revenue > 0 ? (grossProfitDeal / revenue) * 100 : 0
  const gpPctDiff = gpPctDeal - gpPctWac
  const rows = [
    {
      diff: '-',
      deal: money(revenue),
      key: 'revenue',
      label: 'Revenue',
      wac: money(revenue),
    },
    {
      diff: `${cogsDiff >= 0 ? '+' : ''}${money(cogsDiff)}`,
      deal: money(cogsDeal),
      key: 'cogs',
      label: 'COGS',
      wac: money(cogsWac),
    },
    {
      diff: `${grossProfitDiff >= 0 ? '+' : ''}${money(grossProfitDiff)}`,
      deal: money(grossProfitDeal),
      key: 'gp',
      label: 'GP',
      wac: money(grossProfitWac),
    },
    {
      diff: `${gpPctDiff >= 0 ? '+' : ''}${percent(gpPctDiff)}`,
      deal: percent(gpPctDeal),
      key: 'gpPct',
      label: 'GP %',
      wac: percent(gpPctWac),
    },
    {
      diff: `${netDiff >= 0 ? '+' : ''}${money(netDiff)}`,
      deal: money(netDeal),
      key: 'net',
      label: 'Net Profit Before Tax',
      wac: money(netWac),
    },
  ] as const

  function metricTone(value: number, kind: 'diff' | 'main' = 'main') {
    if (kind === 'diff') return value > 0 ? 'text-emerald-700' : value < 0 ? 'text-red-700' : 'text-slate-500'
    return value >= 0 ? 'text-slate-900' : 'text-red-700'
  }

  return (
    <AnalysisPanel subtitle="เทียบงบชุดเดียวกัน โดยคง Revenue เดิมไว้ แล้วดูผลต่างเมื่อสลับฐานต้นทุนจาก WAC เป็น Deal Cost" title="WAC vs Deal Cost Comparison">
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Metric</div>
          <div className="text-right">WAC View</div>
          <div className="text-right">Deal Cost View</div>
          <div className="text-right">Difference</div>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            const diffValue = row.key === 'revenue'
              ? 0
              : row.key === 'cogs'
                ? cogsDiff
                : row.key === 'gp'
                  ? grossProfitDiff
                  : row.key === 'gpPct'
                    ? gpPctDiff
                    : netDiff

            return (
              <div key={row.key} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(180px,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-3">
                <div className="text-sm font-semibold text-slate-700">{row.label}</div>
                <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 md:hidden">WAC</div>
                  <div className={`font-mono text-base font-bold tabular-nums ${metricTone(row.key === 'cogs' ? -Math.abs(cogsWac) : row.key === 'gp' ? grossProfitWac : row.key === 'net' ? netWac : revenue)}`}>{row.wac}</div>
                </div>
                <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 md:hidden">Deal Cost</div>
                  <div className={`font-mono text-base font-bold tabular-nums ${metricTone(row.key === 'cogs' ? -Math.abs(cogsDeal) : row.key === 'gp' ? grossProfitDeal : row.key === 'net' ? netDeal : revenue)}`}>{row.deal}</div>
                </div>
                <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 md:hidden">Diff</div>
                  <div className={`font-mono text-base font-bold tabular-nums ${row.key === 'revenue' ? 'text-slate-400' : metricTone(diffValue, 'diff')}`}>{row.diff}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span>Revenue คงชุดข้อมูลเดียวกันทั้งสองมุมมอง เพื่อให้เทียบผลจากฐานต้นทุนได้ตรงไปตรงมา</span>
        <span>มีบิลที่ถูกแทนต้นทุนด้วย Deal Cost ทั้งหมด <span className="font-bold text-slate-800">{replacedCount}</span> รายการ</span>
      </div>
    </AnalysisPanel>
  )
}

function YearlyPlTable({ data, isLoading, year }: { data: YearlyPlData | null; isLoading: boolean; year: string }) {
  if (isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">กำลังโหลดตารางรายปี</div>
  }
  if (!data) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">ยังไม่มีข้อมูลรายปี</div>
  }

  const rows = [
    { key: 'revenue', label: 'Revenue', tone: 'good' as const },
    { key: 'cogs', label: 'COGS', tone: 'bad' as const },
    { key: 'grossProfit', label: 'Gross Profit', tone: 'total' as const },
    { key: 'expenses', label: 'Operating Expenses', tone: 'bad' as const },
    { key: 'depreciation', label: 'Depreciation', tone: 'bad' as const },
    { key: 'operatingProfit', label: 'Operating Profit', tone: 'total' as const },
    { key: 'interest', label: 'Interest', tone: 'bad' as const },
    { key: 'fxNet', label: 'FX Gain/(Loss)', tone: 'default' as const },
    { key: 'netProfitBeforeTax', label: 'Net Profit Before Tax', tone: 'total' as const },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="text-sm font-bold text-slate-800">ตารางรายปี {year}</div>
        <div className="mt-1 text-xs text-slate-500">สรุป P&amp;L รายเดือน 12 เดือนแบบเดียวกับ legacy</div>
      </div>
      <div className="overflow-x-auto">
        <table className="ns-table min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="sticky left-0 bg-slate-100 px-3 py-2 text-left">รายการ</th>
              {data.months.map((month) => <th key={month.month} className="px-3 py-2 text-right">{month.label}</th>)}
              <th className="bg-emerald-50 px-3 py-2 text-right">รวมปี</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className={`sticky left-0 px-3 py-2 ${row.tone === 'total' ? 'bg-slate-50 font-bold' : 'bg-white'} text-slate-700`}>{row.label}</td>
                {data.months.map((month) => {
                  const value = month[row.key as keyof YearlyPlMonthRow] as number
                  return <td key={`${row.key}-${month.month}`} className={`px-3 py-2 text-right font-mono tabular-nums ${value < 0 ? 'text-red-700' : 'text-slate-800'} ${row.tone === 'total' ? 'font-bold' : ''}`}>{money(value)}</td>
                })}
                <td className={`bg-emerald-50 px-3 py-2 text-right font-mono tabular-nums ${row.tone === 'total' ? 'font-bold' : ''} ${(data.totals[row.key as keyof YearlyPlData['totals']] as number) < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {money(data.totals[row.key as keyof YearlyPlData['totals']] as number)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Waterfall({ legacyRed = false, rows }: { legacyRed?: boolean; rows: Array<[string, number]> }) {
  const max = Math.max(...rows.map((row) => Math.abs(row[1])), 1)
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="text-xs">
          <div className="mb-1 flex justify-between gap-2">
            <span className={value < 0 && legacyRed ? 'font-semibold text-red-600' : 'text-slate-600'}>{label}</span>
            <b className={value < 0 ? 'text-red-700' : legacyRed ? 'text-emerald-700' : 'text-slate-800'}>{money(value)}</b>
          </div>
          <div className={`h-2 overflow-hidden rounded-full ${legacyRed ? 'bg-red-50' : 'bg-slate-100'}`}>
            <div className={`h-full rounded-full ${value < 0 ? (legacyRed ? 'bg-red-500' : 'bg-red-400') : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function CashFlowRealityLines({
  endingCash,
  financing,
  investing,
  openingCash,
  operating,
}: {
  endingCash: number
  financing: number
  investing: number
  openingCash: number
  operating: number
}) {
  const rows = [
    { kind: 'balance' as const, label: 'Beginning Cash / เงินสดต้นงวด', value: openingCash },
    { kind: 'activity' as const, label: 'ดำเนินงาน', value: operating },
    { kind: 'activity' as const, label: 'ลงทุน', value: investing },
    { kind: 'activity' as const, label: 'จัดหาเงิน', value: financing },
    { kind: 'balance' as const, label: 'Ending Cash / เงินสดปลายงวด', value: endingCash },
  ]
  const balanceRows = rows.filter((row) => row.kind === 'balance')
  const maxMagnitude = Math.max(...rows.map((row) => Math.abs(row.value)), 1)
  const minBalance = Math.min(...balanceRows.map((row) => row.value))
  const maxBalance = Math.max(...balanceRows.map((row) => row.value))
  const balanceRange = Math.max(maxBalance - minBalance, 1)

  const balanceWidth = (value: number) => {
    const ratio = (value - minBalance) / balanceRange
    return 78 + ratio * 22
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const isBalance = row.kind === 'balance'
        const isNegative = row.value < 0
        const width = isBalance ? balanceWidth(row.value) : Math.min(100, Math.abs(row.value) / maxMagnitude * 100)
        const barClassName = isBalance
          ? 'bg-emerald-500'
          : isNegative
            ? 'bg-red-400'
            : row.value > 0
              ? 'bg-emerald-500'
              : 'bg-slate-300'
        const valueClassName = isNegative ? 'text-red-700' : isBalance || row.value > 0 ? 'text-slate-800' : 'text-slate-500'

        return (
          <div key={row.label} className="text-xs">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-slate-600">{row.label}</span>
              <b className={valueClassName}>{money(row.value)}</b>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${barClassName}`} style={{ minWidth: row.value === 0 ? '0px' : '2px', width: `${width}%` }} />
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
            {rows.map((line) => {
              const isDrillable = Boolean(line.details?.length)

              return (
              <tr
                key={`${line.section}-${line.label}`}
                className={`transition-colors ${isDrillable ? 'cursor-pointer hover:bg-blue-50/60' : 'hover:bg-slate-50'} ${line.tone === 'total' ? 'bg-slate-50/50 font-bold' : ''}`}
                onClick={isDrillable ? () => onDrill(line) : undefined}
              >
                <td className="px-3 py-3 text-slate-900"><span className={line.level ? 'pl-5' : ''}>{line.label}</span></td>
                <td className="px-3 py-3 text-right"><span className="rounded-md bg-slate-100/80 px-2 py-0.5 text-xs font-medium text-slate-500">{line.section}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">
                  <span className={line.amount < 0 ? 'font-bold text-red-700' : line.tone === 'good' ? 'font-bold text-emerald-700' : 'font-bold text-slate-900'}>
                    {money(line.amount)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  {line.details?.length ? (
                    <button aria-label={`ดูรายละเอียด ${line.label} ${line.details.length} รายการ`} className="font-semibold text-blue-600 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-blue-600" type="button" onClick={(event) => { event.stopPropagation(); onDrill(line) }}>{line.details.length}</button>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
              </tr>
            )})}
          </tbody>
        </table>

        {/* Mobile Card List View */}
        <div className="block lg:hidden divide-y divide-slate-100">
          <LoadingOrEmptyMobile isLoading={isLoading} rows={rows.length} />
          {!isLoading && rows.map((line) => {
            const isDrillable = Boolean(line.details?.length)

            return (
            <div
              key={`${line.section}-${line.label}`}
              className={`p-4 transition ${isDrillable ? 'cursor-pointer hover:bg-blue-50/60' : ''} ${line.tone === 'total' ? 'bg-slate-50/50 font-bold' : ''}`}
              onClick={isDrillable ? () => onDrill(line) : undefined}
            >
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
                    <button aria-label={`ดูรายละเอียด ${line.label} ${line.details.length} รายการ`} className="text-xs font-semibold text-blue-600 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-blue-600" type="button" onClick={(event) => { event.stopPropagation(); onDrill(line) }}>ดูรายละเอียด ({line.details.length})</button>
                  ) : null}
                </div>
              </div>
            </div>
          )})}
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
        <div data-ns-dialog-header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
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
