'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Landmark,
  Package,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard, KpiCardGrid } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }
type Insight = { body: string; explain: string; title: string; type: 'danger' | 'ok' | 'warn' }
type DetailColumnKey = 'label' | 'value'
type DayEventColumnKey = 'amount' | 'label' | 'refNo' | 'type'
type TopPartyColumnKey = 'amount' | 'days' | 'docNo' | 'party'
type SortDirection = 'asc' | 'desc'

const analysisKpiClassName = 'items-start sm:items-center [&_.truncate]:overflow-visible [&_.truncate]:text-clip [&_.truncate]:whitespace-normal [&>div:first-child]:hidden sm:[&>div:first-child]:flex'

type AnalysisPayload = {
  branches: BranchRow[]
  charts: {
    profitVsCash: { amount: number; label: string; tone: string }[]
    projection: { basis?: string; expectedIn: number; expectedOut: number; label: string; projected: number }[]
    trap: { ar: number; cash: number; stock: number }
  }
  detailRows: { href?: string; label: string; suffix?: string; tone?: string; value: number }[]
  fcdBalances?: { currency: string; value: number }[]
  filters: { branchId: string; from: string; to: string }
  insights: Insight[]
  projectionBasis?: string
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
    netProfitBeforeTax?: number
    odLimit: number
    odUsed: number
    operatingCashFlow: number
    projected7: number
    projected30: number
    profitBeforeTax?: number
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
  projectionBasis?: string
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

export function CashFlowAnalysisPageClient({ initialFilters }: { initialFilters?: { branchId?: string; from?: string; to?: string } } = {}) {
  const [from, setFrom] = useState(initialFilters?.from || monthStart())
  const [to, setTo] = useState(initialFilters?.to || today())
  const [branchId, setBranchId] = useState(initialFilters?.branchId || '')
  const [mobileFrom, setMobileFrom] = useState(from)
  const [mobileTo, setMobileTo] = useState(to)
  const [mobileBranchId, setMobileBranchId] = useState(branchId)
  const url = useMemo(() => `/api/finance-accounting/cash-flow-analysis?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, to])
  const exportHref = `${url}&format=xlsx`
  const { data, error, isLoading, resolvedUrl } = useApi<AnalysisPayload>(url)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const displayData = data && resolvedUrl === url && !isLoading && !error ? data : null
  const displayFrom = displayData?.filters.from || from
  const displayTo = displayData?.filters.to || to
  const displayBranchId = displayData?.filters.branchId ?? branchId
  const selectedBranch = (displayData?.branches ?? data?.branches ?? []).find((branch) => branch.id === displayBranchId)?.name ?? 'ทุกสาขา'
  const periodLabel = `${shortThaiDate(displayFrom)} – ${shortThaiDate(displayTo)}`
  const hasActiveFilters = from !== monthStart() || to !== today() || Boolean(branchId)
  const profitBeforeTax = firstFinite(displayData?.summary.netProfitBeforeTax, displayData?.summary.profitBeforeTax)
  const operatingCashFlow = finiteOrUndefined(displayData?.summary.operatingCashFlow)
  const maxProfit = Math.max(...[profitBeforeTax, operatingCashFlow].filter((value): value is number => value != null).map(Math.abs), 1)
  const profitCashDifference = profitBeforeTax != null && operatingCashFlow != null ? profitBeforeTax - operatingCashFlow : undefined

  function openMobileFilters() {
    setMobileFrom(from)
    setMobileTo(to)
    setMobileBranchId(branchId)
    setShowMobileFilters(true)
  }

  return (
    <section aria-busy={isLoading} className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}

      {/* Desktop Filter Panel */}
      <div className="hidden flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:flex">
        <span className="mr-1 text-sm font-bold text-slate-700">ช่วงวันที่:</span>
        <DateInput label="จาก" value={from} onChange={setFrom} />
        <DateInput label="ถึง" value={to} onChange={setTo} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <a className="ml-auto inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-normal text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={exportHref}>ส่งออก Excel</a>
      </div>

      {/* Mobile compact filter strip */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">ช่วงวิเคราะห์</div>
            <div className="truncate text-sm font-bold text-slate-800">{periodLabel}</div>
            <div className="truncate text-xs text-slate-500">{selectedBranch}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={exportHref}>ส่งออก Excel</a>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/40"
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
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="cash-flow-analysis-from-mobile">จากวันที่</label>
              <DatePickerInput ariaLabel="จากวันที่" className="h-9 w-full text-sm" id="cash-flow-analysis-from-mobile" value={mobileFrom} onChange={setMobileFrom} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="cash-flow-analysis-to-mobile">ถึงวันที่</label>
              <DatePickerInput ariaLabel="ถึงวันที่" className="h-9 w-full text-sm" id="cash-flow-analysis-to-mobile" value={mobileTo} onChange={setMobileTo} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">สาขา</label>
            <Select
              aria-label="สาขา"
              className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              value={mobileBranchId}
              onChange={(event) => setMobileBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>
        </MobileFilterSheet>
      ) : null}

      {!displayData && !error ? <AnalysisLoadingState /> : null}

      {displayData ? (
        <>
          <KpiCardGrid className="lg:grid-cols-4 xl:grid-cols-4">
            <SharedKpiCard className={analysisKpiClassName} icon={<Wallet aria-hidden="true" className="size-5" />} label="เงินสดคงเหลือ (THB)" note={`ยอดเงินบาท ณ ${shortThaiDate(displayTo)}`} tone="blue" value={money(displayData.summary.cashNow)} />
            <SharedKpiCard className={analysisKpiClassName} icon={<ArrowDownLeft aria-hidden="true" className="size-5" />} label="ลูกหนี้การค้า (AR)" note="เงินที่คาดว่าจะได้รับ" tone="cyan" value={money(displayData.summary.arNow)} />
            <SharedKpiCard className={analysisKpiClassName} icon={<ArrowUpRight aria-hidden="true" className="size-5" />} label="เจ้าหนี้การค้า (AP)" note="เงินที่ต้องจ่าย" tone="orange" value={money(displayData.summary.apNow)} />
            <SharedKpiCard className={analysisKpiClassName} icon={<Activity aria-hidden="true" className="size-5" />} label="กระแสเงินสดดำเนินงาน" note={periodLabel} tone={signedCashTone(operatingCashFlow)} value={money(operatingCashFlow)} />
          </KpiCardGrid>

          <AnalysisSourceNotice projectionBasis={displayData.projectionBasis} sourceState={displayData.sourceState} />

          {displayData.fcdBalances?.length ? <FcdBalanceStrip rows={displayData.fcdBalances} /> : null}

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3" data-cash-analysis-columns>
            <div className="grid min-w-0 gap-4 lg:col-span-2" data-cash-analysis-primary-column>
              <AnalysisPanel
                subtitle="เปรียบเทียบผลกำไรตามเกณฑ์คงค้างกับเงินสดที่เกิดขึ้นจริง · หน่วย: บาท"
                title="กำไรก่อนภาษีเทียบกระแสเงินสดจริง"
              >
                <CashComparisonChart
                  difference={profitCashDifference}
                  max={maxProfit}
                  profitBeforeTax={profitBeforeTax}
                  operatingCashFlow={operatingCashFlow}
                />
              </AnalysisPanel>
              <AnalysisPanel
                subtitle={`เกณฑ์ประมาณการ: ${projectionBasis(displayData)}`}
                title="ประมาณการเงินสด: ปัจจุบัน / 7 วัน / 30 วัน"
              >
                <CashProjectionChart rows={displayData.charts.projection} />
              </AnalysisPanel>
            </div>

            <div className="grid min-w-0 gap-4" data-cash-analysis-supporting-column>
              <AnalysisPanel subtitle="เทียบเงินสด ลูกหนี้ และสินค้าคงคลัง · หน่วย: บาท" title="โครงสร้างเงินสดและทุนหมุนเวียน">
                <CapitalStructureChart ar={displayData.charts.trap.ar} cash={displayData.charts.trap.cash} stock={displayData.charts.trap.stock} />
              </AnalysisPanel>
              <AnalysisPanel subtitle="ประเมินความเร็วการใช้เงินและพื้นที่วงเงินคงเหลือ" title="อัตราใช้เงินสดและวงเงิน OD">
                <LiquidityRiskPanel
                  burnRate={displayData.summary.burnRate}
                  daysToODMaxed={displayData.summary.daysToODMaxed}
                  odLimit={displayData.summary.odLimit}
                  odUsed={displayData.summary.odUsed}
                />
              </AnalysisPanel>
            </div>
          </div>

          <AnalysisPanel subtitle="สัญญาณจากข้อมูลในช่วงวันที่และสาขาที่เลือก" title="ประเด็นที่ควรติดตาม">
            <div className="grid gap-x-6 md:grid-cols-2">
              {displayData.insights.map((insight) => <InsightCard insight={insight} key={insight.title} />)}
            </div>
          </AnalysisPanel>

          <DetailTable isLoading={false} rows={displayData.detailRows} />
        </>
      ) : null}
    </section>
  )
}

export function CashFlowForecastCalendarPageClient({ initialFilters }: { initialFilters?: { branchId?: string; horizon?: number; startDate?: string } } = {}) {
  const initialHorizon = initialFilters?.horizon && [7, 30, 90].includes(initialFilters.horizon) ? initialFilters.horizon : 30
  const [horizon, setHorizon] = useState(initialHorizon)
  const [startDate, setStartDate] = useState(initialFilters?.startDate || today())
  const [branchId, setBranchId] = useState(initialFilters?.branchId || '')
  const [mobileStartDate, setMobileStartDate] = useState(startDate)
  const [mobileBranchId, setMobileBranchId] = useState(branchId)
  const [modal, setModal] = useState<ProjectionDay | null>(null)
  const url = useMemo(() => `/api/finance-accounting/cf-forecast-calendar?startDate=${startDate}&horizon=${horizon}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, horizon, startDate])
  const { data, error, isLoading, resolvedUrl } = useApi<ForecastPayload>(url)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const displayData = data && resolvedUrl === url && !isLoading && !error ? data : null
  const displayBranchId = displayData?.filters.branchId ?? branchId
  const displayStartDate = displayData?.filters.startDate ?? startDate
  const selectedBranch = (displayData?.branches ?? data?.branches ?? []).find((branch) => branch.id === displayBranchId)?.name ?? 'ทุกสาขา'

  function openMobileFilters() {
    setMobileStartDate(startDate)
    setMobileBranchId(branchId)
    setShowMobileFilters(true)
  }

  return (
    <section aria-busy={isLoading} className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      
      {/* Desktop Filter Panel */}
      <div className="hidden flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:flex">
        <span className="text-sm font-bold text-slate-700">Forecast:</span>
        {[7, 30, 90].map((item) => <button key={item} className={`rounded-md border px-3 py-1 text-xs font-medium ${horizon === item ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`} type="button" onClick={() => setHorizon(item)}>{item} วัน</button>)}
        <DateInput label="เริ่ม" value={startDate} onChange={setStartDate} />
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className="text-xs text-slate-500">เริ่มจาก {money(displayData?.summary.startCash)} → จบที่ {money(displayData?.summary.endCash)}</span>
      </div>

      {/* Mobile compact filter strip */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">ช่วงคาดการณ์</div>
            <div className="truncate text-sm font-bold text-slate-800">{shortThaiDate(displayStartDate)} · {horizon} วัน</div>
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
            {[7, 30, 90].map((item) => (
              <button
                key={item}
                className={`h-9 rounded-md border px-3 text-xs font-medium ${horizon === item ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                type="button"
                onClick={() => setHorizon(item)}
              >
                {item} วัน
              </button>
            ))}
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
                  setMobileStartDate(today())
                  setMobileBranchId('')
                }}
                className="h-10 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate(mobileStartDate)
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
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="cash-flow-forecast-start-mobile">เริ่มวันที่</label>
            <DatePickerInput ariaLabel="เริ่มวันที่" className="w-full text-sm" id="cash-flow-forecast-start-mobile" value={mobileStartDate} onChange={setMobileStartDate} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">สาขา</label>
            <Select
              aria-label="สาขา"
              className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              value={mobileBranchId}
              onChange={(event) => setMobileBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>

          <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
            เริ่มจาก <span className="font-bold text-slate-700">{money(displayData?.summary.startCash)}</span> → จบที่ <span className="font-bold text-slate-700">{money(displayData?.summary.endCash)}</span>
          </div>
        </MobileFilterSheet>
      ) : null}

      {!displayData && !error ? <ForecastLoadingState /> : null}

      {displayData ? (
        <>
          <AnalysisSourceNotice projectionBasis={displayData.projectionBasis} sourceState={displayData.sourceState} />
          <KpiCardGrid className="lg:grid-cols-3 xl:grid-cols-3">
            <SharedKpiCard className={analysisKpiClassName} icon={<Wallet aria-hidden="true" className="size-5" />} label="เงินสดเริ่มต้น" note={`ณ ${shortThaiDate(displayStartDate)}`} tone="blue" value={money(displayData.summary.startCash)} />
            <SharedKpiCard className={analysisKpiClassName} icon={<ArrowDownLeft aria-hidden="true" className="size-5" />} label="Expected In" note="เงินรับที่ถึงกำหนดในช่วง forecast" tone="cyan" value={`+${money(displayData.summary.totalIn)}`} />
            <SharedKpiCard className={analysisKpiClassName} icon={<ArrowUpRight aria-hidden="true" className="size-5" />} label="Expected Out" note="เงินจ่ายที่ถึงกำหนดในช่วง forecast" tone="orange" value={`-${money(displayData.summary.totalOut)}`} />
          </KpiCardGrid>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AnalysisPanel
              subtitle="สรุปเงินสดเริ่มต้น เงินรับ เงินจ่าย และยอดต่ำสุดในช่วงที่เลือก"
              title={`ภาพรวม forecast ${horizon} วัน`}
            >
              <ForecastMega summary={displayData.summary} horizon={horizon} />
            </AnalysisPanel>
            <AnalysisPanel
              className="lg:col-span-2"
              subtitle="เส้นกราฟจะขยายตามช่วงข้อมูลจริง เพื่อให้เห็นจังหวะขึ้นลงของเงินสดแต่ละวันชัดขึ้น"
              title={`พยากรณ์เงินสดรายวัน (${horizon} วันข้างหน้า)`}
            >
              <ProjectionSvg days={displayData.dailyProjection} />
            </AnalysisPanel>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnalysisPanel
              subtitle="กดเลือกวันที่บนปฏิทินเพื่อดูรายการรับและจ่ายที่ทำให้ยอดวันนั้นเปลี่ยน"
              title="ปฏิทิน cash flow รายวัน"
            >
              <CalendarGrid days={displayData.dailyProjection} isLoading={false} onSelect={setModal} />
            </AnalysisPanel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopAr rows={displayData.insights.topAR} />
            <TopAp rows={displayData.insights.topAP} />
          </div>
        </>
      ) : null}

      {modal ? <DayModal day={modal} onClose={() => setModal(null)} /> : null}
    </section>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)
    dailyFetchJson<T>(url).then((payload) => {
      if (!mounted) return
      setData(payload)
      setResolvedUrl(url)
    }).catch((caught) => mounted ? setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้') : undefined).finally(() => mounted ? setIsLoading(false) : undefined)
    return () => { mounted = false }
  }, [url])
  return { data, error, isLoading, resolvedUrl }
}

function money(value?: number) {
  if (value == null || !Number.isFinite(value)) return 'ไม่มีข้อมูล'
  const amount = Object.is(value, -0) ? 0 : value
  return amount < 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount)
}

function finiteOrUndefined(value?: number) {
  return value != null && Number.isFinite(value) ? value : undefined
}

function firstFinite(...values: Array<number | undefined>) {
  return values.map(finiteOrUndefined).find((value) => value != null)
}

function signedCashTone(value?: number): 'emerald' | 'red' | 'slate' {
  return value != null && value > 0 ? 'emerald' : value != null && value < 0 ? 'red' : 'slate'
}

function projectionBasis(data: AnalysisPayload) {
  return data.projectionBasis?.trim() || data.charts.projection.find((row) => row.basis?.trim())?.basis || 'อิงตามรายการรับและจ่ายที่ API ส่งกลับ'
}

function AnalysisSourceNotice({ projectionBasis, sourceState }: { projectionBasis?: string; sourceState: SourceState }) {
  return (
    <details className="group rounded-xl border border-slate-200/60 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">ข้อมูลเพื่อการบริหาร</span>
          <span className="text-xs text-slate-500">หน่วยหลัก: บาท (THB)</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700">
          ดูเกณฑ์และข้อจำกัด
          <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p><span className="font-semibold text-slate-700">เกณฑ์ข้อมูล:</span> {sourceState.basis || 'ไม่มีข้อมูล'}</p>
        {projectionBasis ? <p><span className="font-semibold text-slate-700">เกณฑ์ประมาณการ:</span> {projectionBasis}</p> : null}
        {sourceState.limitations.length ? (
          <div>
            <div className="font-semibold text-slate-700">ข้อจำกัดของข้อมูล</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {sourceState.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  )
}

function FcdBalanceStrip({ rows }: { rows: NonNullable<AnalysisPayload['fcdBalances']> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
      <span className="font-semibold text-slate-700">บัญชี FCD (แยกจากยอดเงินบาท)</span>
      {rows.map((row) => <span className="font-mono font-semibold text-slate-800" key={row.currency}>{row.currency} {money(row.value)}</span>)}
    </div>
  )
}

function shortThaiDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(year, month - 1, day))
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 text-sm"><span>{label}</span><DatePickerInput ariaLabel={label} className="h-9 w-[140px]" value={value} onChange={onChange} /></label>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <Select aria-label="สาขา" className="h-9 w-64 max-w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select>
}

function AnalysisPanel({ children, className = '', subtitle, title }: { children: ReactNode; className?: string; subtitle?: string; title: string }) {
  return (
    <section className={`rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-800 sm:text-base">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function CashComparisonChart({ difference, max, operatingCashFlow, profitBeforeTax }: { difference?: number; max: number; operatingCashFlow?: number; profitBeforeTax?: number }) {
  const status = cashComparisonStatus(profitBeforeTax, operatingCashFlow)
  const StatusIcon = status.icon
  const absoluteDifference = difference == null || !Number.isFinite(difference) ? undefined : Math.abs(difference)

  return (
    <div className="space-y-5" data-cash-comparison>
      <div className={`rounded-md border px-4 py-3 ${status.panelClass}`}>
        <div className="flex items-start gap-2.5">
          <StatusIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold leading-snug">{status.title}</div>
            <p className="mt-1 text-xs leading-relaxed opacity-80">{status.description}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <ComparisonBar dataKey="profit" label="กำไรก่อนภาษี (เกณฑ์คงค้าง)" max={max} tone="emerald" value={profitBeforeTax} />
        <ComparisonBar dataKey="cash" label="กระแสเงินสดจากการดำเนินงาน" max={max} tone="blue" value={operatingCashFlow} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <div className="text-xs font-semibold text-slate-700">ช่องว่างระหว่างกำไรกับเงินสด</div>
          <div className="mt-0.5 text-xs text-slate-500">ระยะห่างของค่าทั้งสองบนสเกลเดียวกัน</div>
        </div>
        <div className="font-mono text-lg font-bold tabular-nums text-slate-900">{money(absoluteDifference)}</div>
      </div>
    </div>
  )
}

function cashComparisonStatus(profitBeforeTax?: number, operatingCashFlow?: number) {
  const profit = finiteOrUndefined(profitBeforeTax)
  const cash = finiteOrUndefined(operatingCashFlow)

  if (profit == null || cash == null) {
    return {
      description: 'ต้องมีทั้งกำไรก่อนภาษีและกระแสเงินสดจึงจะเปรียบเทียบทิศทางได้',
      icon: Gauge,
      panelClass: 'border-slate-200 bg-slate-50 text-slate-700',
      title: 'ข้อมูลสำหรับเปรียบเทียบยังไม่ครบ',
    }
  }
  if (profit > 0 && cash < 0) {
    return {
      description: 'ผลกำไรตามเกณฑ์คงค้างและเงินสดจริงกำลังเคลื่อนไปคนละทิศทาง',
      icon: AlertTriangle,
      panelClass: 'border-amber-200 bg-amber-50/70 text-amber-800',
      title: 'กำไรเป็นบวก แต่กระแสเงินสดจากการดำเนินงานติดลบ',
    }
  }
  if (profit < 0 && cash > 0) {
    return {
      description: 'เงินสดจากการดำเนินงานเป็นบวก แม้ผลกำไรก่อนภาษียังติดลบ',
      icon: Gauge,
      panelClass: 'border-amber-200 bg-amber-50/70 text-amber-800',
      title: 'กระแสเงินสดเป็นบวก แต่กำไรก่อนภาษีติดลบ',
    }
  }
  if (profit < 0 && cash < 0) {
    return {
      description: 'ทั้งผลกำไรและเงินสดจากการดำเนินงานอยู่ฝั่งติดลบในช่วงที่เลือก',
      icon: AlertTriangle,
      panelClass: 'border-rose-200 bg-rose-50/70 text-rose-800',
      title: 'กำไรและกระแสเงินสดจากการดำเนินงานติดลบ',
    }
  }
  if (profit > 0 && cash > 0) {
    return {
      description: 'ทั้งผลกำไรและเงินสดจากการดำเนินงานอยู่ฝั่งบวกในช่วงที่เลือก',
      icon: CheckCircle2,
      panelClass: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
      title: 'กำไรและกระแสเงินสดจากการดำเนินงานเป็นบวก',
    }
  }
  return {
    description: 'ค่าหนึ่งอยู่ที่ศูนย์ จึงควรอ่านขนาดและทิศทางจากแถวเปรียบเทียบด้านล่าง',
    icon: Gauge,
    panelClass: 'border-slate-200 bg-slate-50 text-slate-700',
    title: 'กำไรและกระแสเงินสดอยู่คนละระดับ',
  }
}

function ComparisonBar({ dataKey, label, max, tone, value }: { dataKey: 'cash' | 'profit'; label: string; max: number; tone: 'blue' | 'emerald'; value?: number }) {
  const normalizedValue = finiteOrUndefined(value)
  const width = normalizedValue == null ? 0 : Math.min(100, Math.abs(normalizedValue) / Math.max(max, 1) * 100)
  const direction = normalizedValue == null ? 'ไม่มีข้อมูล' : normalizedValue < 0 ? 'ติดลบ' : normalizedValue > 0 ? 'เป็นบวก' : 'ศูนย์'
  const fillClass = normalizedValue == null || normalizedValue === 0 ? 'bg-slate-300' : normalizedValue < 0 ? 'bg-rose-500' : tone === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500'
  const valueClass = normalizedValue == null || normalizedValue === 0 ? 'text-slate-700' : normalizedValue < 0 ? 'text-rose-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-blue-700'
  const badgeClass = normalizedValue == null || normalizedValue === 0 ? 'bg-slate-100 text-slate-600' : normalizedValue < 0 ? 'bg-rose-100 text-rose-700' : tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>{direction}</span>
        </div>
        <span className={`shrink-0 font-mono text-base font-bold tabular-nums ${valueClass}`}>{money(normalizedValue)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${label} ${money(normalizedValue)} บาท ขนาดเปรียบเทียบ ${width.toFixed(1)} เปอร์เซ็นต์ของค่าสูงสุด`}>
        {normalizedValue != null ? <div className={`h-full rounded-full ${fillClass}`} data-cash-comparison-bar={dataKey} style={{ width: `${width}%` }} /> : null}
      </div>
    </div>
  )
}

function CapitalStructureChart({ ar, cash, stock }: { ar: number; cash: number; stock: number }) {
  const normalizedAr = finiteOrUndefined(ar)
  const normalizedCash = finiteOrUndefined(cash)
  const normalizedStock = finiteOrUndefined(stock)
  const rows = [
    { barClass: 'bg-blue-500', icon: Wallet, iconClass: 'bg-blue-100 text-blue-700', label: 'เงินสดและธนาคาร', value: normalizedCash },
    { barClass: 'bg-cyan-500', icon: Landmark, iconClass: 'bg-cyan-100 text-cyan-700', label: 'ลูกหนี้การค้า (AR)', value: normalizedAr },
    { barClass: 'bg-amber-500', icon: Package, iconClass: 'bg-amber-100 text-amber-700', label: 'สินค้าคงคลัง', value: normalizedStock },
  ]
  const hasCompleteBase = rows.every((row) => row.value != null)
  const total = hasCompleteBase ? rows.reduce((sum, row) => sum + Math.abs(row.value ?? 0), 0) : undefined
  const max = Math.max(...rows.flatMap((row) => row.value == null ? [] : [Math.abs(row.value)]), 1)
  const stockRatioVsCash = normalizedCash != null && normalizedCash > 0 && normalizedStock != null ? normalizedStock / normalizedCash * 100 : undefined
  const arRatioVsCash = normalizedCash != null && normalizedCash > 0 && normalizedAr != null ? normalizedAr / normalizedCash * 100 : undefined
  const hasWorkingCapitalValues = normalizedAr != null && normalizedStock != null
  const dominantLabel = !hasWorkingCapitalValues ? 'ไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบ' : normalizedStock > normalizedAr * 1.5 ? 'สินค้าคงคลังจมมากกว่าลูกหนี้' : normalizedAr > normalizedStock * 1.5 ? 'ลูกหนี้จมมากกว่าสินค้าคงคลัง' : 'ลูกหนี้และสินค้าคงคลังยังใกล้กัน'
  const dominantTone = !hasWorkingCapitalValues ? 'text-slate-600' : normalizedStock > normalizedAr * 1.5 ? 'text-amber-700' : normalizedAr > normalizedStock * 1.5 ? 'text-cyan-700' : 'text-slate-700'

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const Icon = row.icon
        const percentage = row.value != null && total != null && total > 0 ? Math.abs(row.value) / total * 100 : undefined
        return (
          <div key={row.label}>
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-600">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${row.iconClass}`}>
                  <Icon aria-hidden="true" className="size-3.5" />
                </span>
                <span className="truncate">{row.label}</span>
              </div>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-slate-800">{money(row.value)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                {row.value != null ? <div className={`h-full rounded-full ${row.value < 0 ? 'bg-rose-500' : row.barClass}`} style={{ width: `${Math.abs(row.value) / max * 100}%` }} /> : null}
              </div>
              <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">{percentage == null ? 'ไม่มีข้อมูล' : `${percentage.toFixed(1)}%`}</span>
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="font-semibold text-slate-500">รวมฐานเปรียบเทียบ</span>
        <span className="font-mono font-bold tabular-nums text-slate-700">{money(total)}</span>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">เงินจมที่ไหน</div>
            <div className={`mt-1 text-sm font-bold ${dominantTone}`}>{dominantLabel}</div>
            <div className="mt-1 text-[11px] text-slate-500">AR {arRatioVsCash == null ? 'ไม่มีข้อมูล' : `${arRatioVsCash.toFixed(1)}%`} · สินค้าคงคลัง {stockRatioVsCash == null ? 'ไม่มีข้อมูล' : `${stockRatioVsCash.toFixed(1)}%`} ของเงินสด</div>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
            เทียบกับเงินสด
          </span>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">สัดส่วนคำนวณจากมูลค่าสัมบูรณ์เพื่อเปรียบเทียบขนาดของแต่ละรายการ</p>
    </div>
  )
}

function CashProjectionChart({ rows }: { rows: AnalysisPayload['charts']['projection'] }) {
  if (!rows.length) return <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีข้อมูลประมาณการในช่วงที่เลือก</div>

  const displayRows = rows.map((row) => {
    const expectedIn = finiteOrUndefined(row.expectedIn)
    const expectedOut = finiteOrUndefined(row.expectedOut)
    return {
      ...row,
      expectedIn,
      expectedOut,
      netMovement: expectedIn == null || expectedOut == null ? undefined : expectedIn - expectedOut,
      projected: finiteOrUndefined(row.projected),
    }
  })

  const movementTone = (value?: number) => value == null || value === 0
    ? 'text-slate-600'
    : value > 0
      ? 'text-emerald-700'
      : 'text-rose-700'
  const signedMoney = (value?: number) => value != null && value > 0 ? `+${money(value)}` : money(value)
  type DisplayRow = (typeof displayRows)[number]
  const finiteRows = displayRows.filter((row): row is DisplayRow & { projected: number } => row.projected != null)

  if (!finiteRows.length) {
    return <div data-cash-forecast className="py-12 text-center text-sm text-slate-400">ไม่มีข้อมูลเงินสดคาดการณ์ที่ใช้สร้างกราฟได้</div>
  }

  const values = finiteRows.map((row) => row.projected)
  const visibleMinimum = Math.min(...values)
  const visibleMaximum = Math.max(...values)
  const padding = Math.max((visibleMaximum - visibleMinimum) * 0.18, Math.abs(visibleMaximum) * 0.001, 1)
  const minimum = visibleMinimum - padding
  const maximum = visibleMaximum + padding
  const range = Math.max(1, maximum - minimum)
  const width = 800
  const height = 232
  const plotLeft = 130
  const plotRight = 770
  const plotTop = 22
  const plotBottom = 180
  const timeOffsets = displayRows.map((row, index) => {
    const match = row.label.match(/\d+/)
    return match ? Number(match[0]) : index === 0 ? 0 : index
  })
  const maxOffset = Math.max(...timeOffsets, 1)
  const points = displayRows.flatMap((row, index) => row.projected == null ? [] : [{
    ...row,
    projected: row.projected,
    x: plotLeft + (timeOffsets[index] / maxOffset) * (plotRight - plotLeft),
    y: plotTop + ((maximum - row.projected) / range) * (plotBottom - plotTop),
  }])
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const firstProjected = points[0]?.projected
  const lastProjected = points.at(-1)?.projected
  const projectedChange = firstProjected == null || lastProjected == null ? undefined : lastProjected - firstProjected
  const lineDirection = projectedChange == null || projectedChange === 0 ? 'neutral' : projectedChange > 0 ? 'positive' : 'negative'
  const lineTone = lineDirection === 'positive' ? 'stroke-emerald-600' : lineDirection === 'negative' ? 'stroke-rose-600' : 'stroke-slate-600'
  const pointTone = lineDirection === 'positive' ? 'fill-emerald-600' : lineDirection === 'negative' ? 'fill-rose-600' : 'fill-slate-600'
  const yTicks = Array.from({ length: 4 }, (_, index) => maximum - (range / 3) * index)

  return (
    <div data-cash-forecast>
      <div
        data-cash-forecast-line-chart
        data-cash-forecast-line-direction={lineDirection}
        role="figure"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <span className={`h-0.5 w-6 ${lineDirection === 'positive' ? 'bg-emerald-600' : lineDirection === 'negative' ? 'bg-rose-600' : 'bg-slate-600'}`} />
            <span>เงินสดคาดการณ์</span>
          </div>
          <span className={`font-mono font-bold tabular-nums ${movementTone(projectedChange)}`}>เทียบปัจจุบัน {signedMoney(projectedChange)}</span>
        </div>

        <div className="overflow-x-auto" tabIndex={0} aria-label="เลื่อนดูกราฟประมาณการเงินสดตามช่วงเวลา">
          <svg
            aria-label="กราฟเส้นเงินสดคาดการณ์ ปัจจุบัน 7 วัน และ 30 วัน"
            className="h-auto min-w-[680px] w-full"
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            {yTicks.map((tick, index) => {
              const y = plotTop + (index / 3) * (plotBottom - plotTop)
              return (
                <g key={`${tick}-${index}`}>
                  <line className="stroke-slate-200" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" x1={plotLeft} x2={plotRight} y1={y} y2={y} />
                  <text className="fill-slate-500" fontSize="10" textAnchor="end" x={plotLeft - 12} y={y + 3}>{money(tick)}</text>
                </g>
              )
            })}
            {points.map((point) => (
              <line className="stroke-slate-100" key={`grid-${point.label}`} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" x1={point.x} x2={point.x} y1={plotTop} y2={plotBottom} />
            ))}
            <line className="stroke-slate-300" vectorEffect="non-scaling-stroke" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} />
            <path
              className={lineTone}
              d={path}
              data-cash-forecast-line
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((point) => (
              <g key={point.label}>
                <circle
                  className={`${pointTone} stroke-white`}
                  cx={point.x}
                  cy={point.y}
                  data-cash-forecast-point={point.label}
                  r="3.5"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{point.label}: {money(point.projected)} บาท</title>
                </circle>
                <text className="fill-slate-600" fontSize="11" fontWeight="600" textAnchor="middle" x={point.x} y={plotBottom + 25}>{point.label}</text>
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-2 grid divide-y divide-slate-200 border-y border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {displayRows.map((row) => (
            <div className="px-3 py-3 sm:first:pl-0 sm:last:pr-0" data-cash-forecast-summary key={row.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-semibold text-slate-600">{row.label}</span>
                <span className="whitespace-nowrap font-mono text-[15px] font-bold tabular-nums text-slate-900" data-cash-forecast-summary-balance>{money(row.projected)}</span>
              </div>
              <div className="mt-2 space-y-1.5 text-[13px] leading-5" data-cash-forecast-summary-details>
                <div className="flex justify-between gap-3 text-slate-500"><span>เงินรับคาดการณ์</span><strong className={`font-mono tabular-nums ${row.expectedIn != null && row.expectedIn > 0 ? 'text-emerald-700' : 'text-slate-600'}`}>{row.expectedIn != null && row.expectedIn > 0 ? `+${money(row.expectedIn)}` : money(row.expectedIn)}</strong></div>
                <div className="flex justify-between gap-3 text-slate-500"><span>เงินจ่ายคาดการณ์</span><strong className={`font-mono tabular-nums ${row.expectedOut != null && row.expectedOut > 0 ? 'text-rose-700' : 'text-slate-600'}`}>{row.expectedOut != null && row.expectedOut > 0 ? `-${money(row.expectedOut)}` : money(row.expectedOut)}</strong></div>
                <div className="flex justify-between gap-3 text-[13.5px] font-semibold text-slate-600" data-cash-forecast-summary-net><span>เปลี่ยนแปลงสุทธิ</span><strong className={`font-mono tabular-nums ${movementTone(row.netMovement)}`}>{signedMoney(row.netMovement)}</strong></div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-[11px] leading-relaxed text-slate-500">
          แกน Y ปรับตามช่วงยอดเงินสดเพื่อให้เห็นการเปลี่ยนแปลงระยะสั้น · ตำแหน่งเวลาเป็นสัดส่วนปัจจุบัน / 7 วัน / 30 วัน
        </div>
      </div>
    </div>
  )
}

function LiquidityRiskPanel({ burnRate, daysToODMaxed, odLimit, odUsed }: { burnRate: number; daysToODMaxed: number; odLimit: number; odUsed: number }) {
  const normalizedBurnRate = finiteOrUndefined(burnRate)
  const normalizedDays = finiteOrUndefined(daysToODMaxed)
  const normalizedLimit = finiteOrUndefined(odLimit)
  const normalizedUsed = finiteOrUndefined(odUsed)
  const utilization = normalizedLimit != null && normalizedLimit > 0 && normalizedUsed != null ? Math.min(100, Math.max(0, normalizedUsed / normalizedLimit * 100)) : undefined
  const days = normalizedDays == null ? undefined : Math.max(0, Math.round(normalizedDays))
  const risk = normalizedLimit == null || normalizedUsed == null || normalizedLimit <= 0 || days == null ? 'unknown' : days < 30 ? 'danger' : days < 90 ? 'warn' : 'ok'
  const RiskIcon = risk === 'danger' ? AlertTriangle : risk === 'warn' ? Gauge : CheckCircle2
  const riskText = risk === 'unknown' ? 'ยังไม่มีวงเงิน OD สำหรับประเมิน' : risk === 'danger' ? 'ต้องติดตามใกล้ชิด' : risk === 'warn' ? 'ควรวางแผนล่วงหน้า' : 'สภาพคล่องยังอยู่ในเกณฑ์'
  const riskColor = risk === 'unknown' ? 'text-slate-600' : risk === 'danger' ? 'text-rose-700' : risk === 'warn' ? 'text-amber-700' : 'text-emerald-700'

  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-2 text-sm font-bold ${riskColor}`}>
        <RiskIcon aria-hidden="true" className="size-4" />
        <span>{riskText}</span>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-slate-500">อัตราใช้เงินสดเฉลี่ยต่อวัน</span>
          <span className={`font-mono text-base font-bold tabular-nums ${normalizedBurnRate != null && normalizedBurnRate > 0 ? 'text-rose-700' : 'text-slate-700'}`}>{money(normalizedBurnRate)}</span>
        </div>
        <div className="mt-1 text-right text-[11px] text-slate-400">บาท/วัน</div>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-slate-500">วงเงิน OD ที่ใช้แล้ว</span>
          <span className="font-mono text-sm font-bold tabular-nums text-slate-800">{money(normalizedUsed)} / {money(normalizedLimit)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={utilization == null ? 'ไม่มีข้อมูลสัดส่วนวงเงิน OD' : `ใช้วงเงิน OD ${utilization.toFixed(1)} เปอร์เซ็นต์`}>
          {utilization != null ? <div className={`h-full rounded-full ${utilization >= 90 ? 'bg-rose-500' : utilization >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${utilization}%` }} /> : null}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>{normalizedLimit === 0 ? 'ยังไม่ได้กำหนดวงเงิน OD' : utilization == null ? 'ไม่มีข้อมูล' : `ใช้แล้ว ${utilization.toFixed(1)}%`}</span>
          <span>{normalizedLimit != null && normalizedLimit > 0 && normalizedUsed != null ? `คงเหลือ ${money(Math.max(0, normalizedLimit - normalizedUsed))}` : null}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">คาดว่าวงเงิน OD จะเต็มใน</div>
          <div className="mt-1 text-[11px] text-slate-400">อิงจากอัตราใช้เงินสดเฉลี่ยปัจจุบัน</div>
        </div>
        <div className={`shrink-0 text-right font-mono text-2xl font-bold tabular-nums ${riskColor}`}>
          {normalizedLimit === 0 ? '—' : days == null ? <span className="text-sm">ไม่มีข้อมูล</span> : days >= 999 ? <><span className="text-xs font-semibold">มากกว่า</span> 999 <span className="text-xs font-semibold">วัน</span></> : <>{days.toLocaleString('th-TH')} <span className="text-xs font-semibold">วัน</span></>}
        </div>
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = insight.type === 'danger' ? AlertTriangle : insight.type === 'warn' ? Gauge : CheckCircle2
  const iconClass = insight.type === 'danger' ? 'bg-rose-100 text-rose-700' : insight.type === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  return (
    <article className="flex gap-3 border-t border-slate-100 py-4 first:pt-0 md:[&:nth-child(2)]:pt-0">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold leading-snug text-slate-800">{insightTitle(insight.title)}</h3>
        <div className="mt-1 break-words font-mono text-xs font-semibold leading-relaxed tabular-nums text-slate-700">{formatInsightBody(insight.body)}</div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{localizeFinancialText(insight.explain)}</p>
      </div>
    </article>
  )
}

function insightTitle(value: string) {
  return localizeFinancialText(value.replace(/^[^\p{L}\p{N}]+/u, ''))
}

function localizeFinancialText(value: string) {
  return value
    .replace(/\bSupplier\b/g, 'ผู้ขาย')
    .replace(/\bStock\b/g, 'สินค้าคงคลัง')
    .replace(/\bCash\b/g, 'เงินสด')
    .replace(/\bAR\b/g, 'ลูกหนี้')
    .replace(/\bAP\b/g, 'เจ้าหนี้')
}

function formatInsightBody(value: string) {
  const localized = localizeFinancialText(value)
    .replaceAll('Net Profit', 'กำไรก่อนภาษี')
    .replaceAll('Profit Before Tax', 'กำไรก่อนภาษี')
    .replaceAll('PBT', 'กำไรก่อนภาษี')
    .replaceAll('OCF', 'กระแสเงินสดดำเนินงาน')
    .replaceAll('Receipts', 'เงินรับ')
    .replaceAll('Sales', 'ยอดขาย')
    .replaceAll('Payments', 'เงินจ่าย')
    .replaceAll('Purchases', 'ยอดซื้อ')
    .replaceAll('Projected 7d', 'คาดการณ์ 7 วัน')
    .replaceAll('30d', '30 วัน')
    .replaceAll('Burn rate', 'อัตราใช้เงินสด')

  return localized.replace(/-?\d+(?:\.\d+)?/g, (match, offset) => {
    const following = localized.slice(offset + match.length).trimStart()
    if (following.startsWith('วัน') || following.startsWith('d')) return Math.round(Number(match)).toLocaleString('th-TH')
    if (following.startsWith('%')) return Number(match).toLocaleString('th-TH', { maximumFractionDigits: 1 })
    return Number(match).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  })
}

function AnalysisLoadingState() {
  return (
    <div aria-label="กำลังโหลดข้อมูล Cash Flow Analysis" className="space-y-4" role="status">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" key={index} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      </div>
      <span className="sr-only">กำลังโหลดข้อมูล</span>
    </div>
  )
}

function ForecastLoadingState() {
  return (
    <div aria-label="กำลังโหลดข้อมูล CF Forecast Calendar" className="space-y-4" role="status">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" key={index} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[26rem] animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2" />
        <div className="h-[26rem] animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      </div>
      <span className="sr-only">กำลังโหลดข้อมูล</span>
    </div>
  )
}

const detailLabelTranslations: Record<string, string> = {
  'Net Profit ในงบ (Accrual)': 'กำไรก่อนภาษีในงบ (เกณฑ์คงค้าง)',
  'Profit Before Tax ในงบ (Accrual)': 'กำไรก่อนภาษีในงบ (เกณฑ์คงค้าง)',
  'Operating Cash Flow จริง': 'กระแสเงินสดจากการดำเนินงาน',
  'ส่วนต่าง (NP - OCF)': 'ส่วนต่างกำไรก่อนภาษีกับกระแสเงินสด',
  'ส่วนต่าง (PBT - OCF)': 'ส่วนต่างกำไรก่อนภาษีกับกระแสเงินสด',
  'Cash Collection Rate': 'อัตราการเก็บเงินจากลูกค้า',
  'Supplier Payment Rate': 'อัตราการจ่ายผู้ขาย',
  'Projected Cash 7 วัน': 'เงินสดคาดการณ์ใน 7 วัน',
  'Projected Cash 30 วัน': 'เงินสดคาดการณ์ใน 30 วัน',
  'Burn Rate (เงินออก/วัน เฉลี่ย)': 'อัตราใช้เงินสดเฉลี่ยต่อวัน',
  'OD Used / Limit': 'วงเงิน OD ที่ใช้แล้ว',
  'วันที่ OD จะเต็มวงเงิน': 'คาดว่าวงเงิน OD จะเต็มใน',
}

function detailLabel(value: string) {
  return detailLabelTranslations[value] ?? value
}

function detailValue(row: AnalysisPayload['detailRows'][number]) {
  const value = finiteOrUndefined(row.value)
  if (value == null) return 'ไม่มีข้อมูล'
  if (row.suffix === '%') return `${value.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
  if (row.suffix?.includes('วัน')) return value >= 999 ? 'มากกว่า 999 วัน' : `${Math.round(value).toLocaleString('th-TH')} วัน`
  return money(value)
}

function DetailTable({ isLoading, rows }: { isLoading: boolean; rows: AnalysisPayload['detailRows'] }) {
  const columnResize = useResizableColumns('finance-accounting.cash-flow-analysis.detail.v1', detailColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<AnalysisPayload['detailRows'][number], DetailColumnKey>(rows, (row, key) => key === 'label' ? detailLabel(row.label) : row.value)

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="font-bold text-slate-800">รายละเอียดตัวชี้วัด</h3>
        {columnResize.hasCustomWidths ? (
          <button
            className="hidden h-8 items-center rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 md:inline-flex"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            รีเซ็ตความกว้างตาราง
          </button>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="ns-table min-w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {detailColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="รายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="label" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('label', 'รายการ')} />
              <ResizableTableHead align="right" label="มูลค่า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="value" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('value', 'มูลค่า')} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="py-8 text-center text-slate-400" colSpan={detailColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading ? sortedRows.map((row) => (
              <tr key={row.label} className="transition-colors hover:bg-slate-50">
                <td className="px-3 py-3 text-slate-700">
                  {row.href ? <a aria-label={`เปิดแหล่งข้อมูล ${detailLabel(row.label)}`} className="font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={row.href}>{detailLabel(row.label)}</a> : detailLabel(row.label)}
                </td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.tone === 'bad' ? 'text-red-700' : row.tone === 'good' ? 'text-emerald-700' : row.tone === 'warn' ? 'text-amber-700' : 'text-slate-900'}`}>
                  {detailValue(row)}
                </td>
              </tr>
            )) : null}
            {!isLoading && !sortedRows.length ? <tr><td className="py-8 text-center text-slate-400" colSpan={detailColumns.length}>ยังไม่มีข้อมูลในช่วงที่เลือก</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="block divide-y divide-slate-100 md:hidden">
        {isLoading ? <div className="py-6 text-center text-xs text-slate-400">กำลังโหลดข้อมูล</div> : null}
        {!isLoading ? sortedRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 p-3 text-xs">
            {row.href ? <a aria-label={`เปิดแหล่งข้อมูล ${detailLabel(row.label)}`} className="min-w-0 font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={row.href}>{detailLabel(row.label)}</a> : <span className="min-w-0 text-slate-700">{detailLabel(row.label)}</span>}
            <span className={`shrink-0 whitespace-nowrap font-mono font-bold tabular-nums ${row.tone === 'bad' ? 'text-red-700' : row.tone === 'good' ? 'text-emerald-700' : row.tone === 'warn' ? 'text-amber-700' : 'text-slate-900'}`}>
              {detailValue(row)}
            </span>
          </div>
        )) : null}
        {!isLoading && !sortedRows.length ? <div className="py-6 text-center text-xs text-slate-400">ยังไม่มีข้อมูลในช่วงที่เลือก</div> : null}
      </div>
    </div>
  )
}

function ForecastMega({ horizon, summary }: { horizon: number; summary?: ForecastPayload['summary'] }) {
  const lowestBalance = finiteOrUndefined(summary?.lowestBal)
  const health = lowestBalance == null ? 'unknown' : lowestBalance >= 0 ? 'ok' : 'short'
  const tone = health === 'ok' ? 'bg-emerald-50 text-emerald-700' : health === 'short' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'

  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
        {health === 'ok' ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : health === 'short' ? <AlertTriangle aria-hidden="true" className="size-3.5" /> : <Gauge aria-hidden="true" className="size-3.5" />}
        {health === 'ok' ? 'คาดการณ์: เงินพอ' : health === 'short' ? 'คาดการณ์: เงินขาด' : 'คาดการณ์: ไม่มีข้อมูล'}
      </div>
      <div>
        <div className={`break-words font-mono text-3xl font-bold leading-tight tabular-nums ${health === 'ok' ? 'text-emerald-700' : health === 'short' ? 'text-rose-700' : 'text-slate-700'}`}>{money(summary?.endCash)}</div>
        <div className="mt-1 text-sm font-medium text-slate-600">เงินสด ณ สิ้น {horizon} วัน</div>
      </div>
      {health === 'unknown' ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          ยังสรุปวันที่เงินสดติดลบไม่ได้ เพราะไม่มีข้อมูลประมาณการที่คำนวณได้
        </div>
      ) : summary?.negCount ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          เงินสดติดลบ {summary.negCount.toLocaleString('th-TH')} วัน
          {summary.negDay ? ` โดยเริ่มวันที่ ${shortThaiDate(summary.negDay.date)}` : ''}
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ไม่มีวันที่เงินสดติดลบในช่วง forecast นี้
        </div>
      )}
    </div>
  )
}

function ProjectionSvg({ days }: { days: ProjectionDay[] }) {
  const finiteDays = days.filter((day) => Number.isFinite(day.closing))
  if (!finiteDays.length) return <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีข้อมูลพยากรณ์ที่คำนวณได้ในช่วงที่เลือก</div>

  const values = finiteDays.map((day) => day.closing)
  const visibleMinimum = Math.min(...values)
  const visibleMaximum = Math.max(...values)
  const padding = Math.max((visibleMaximum - visibleMinimum) * 0.16, Math.abs(visibleMaximum) * 0.01, 1)
  const minimum = Math.min(visibleMinimum - padding, 0)
  const maximum = Math.max(visibleMaximum + padding, 0)
  const range = Math.max(1, maximum - minimum)
  const width = 760
  const height = 250
  const top = 24
  const bottom = 182
  const xStart = 56
  const xEnd = 728
  const zeroY = top + ((maximum - 0) / range) * (bottom - top)
  const points = finiteDays.map((day, index) => ({
    ...day,
    x: xStart + (index / Math.max(1, finiteDays.length - 1)) * (xEnd - xStart),
    y: top + ((maximum - day.closing) / range) * (bottom - top),
  }))
  const pointString = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaBase = values.every((value) => value >= 0) ? bottom : values.every((value) => value <= 0) ? top : zeroY
  const areaPoints = `${points[0]?.x ?? xStart},${areaBase} ${pointString} ${points.at(-1)?.x ?? xEnd},${areaBase}`
  const lowestDay = points.reduce((lowest, point) => point.closing < lowest.closing ? point : lowest, points[0])
  const highestDay = points.reduce((highest, point) => point.closing > highest.closing ? point : highest, points[0])
  const endingDay = days.at(-1)
  const endingBalance = finiteOrUndefined(endingDay?.closing)

  return (
    <div className="space-y-4">
      <svg aria-label="กราฟพยากรณ์เงินสดรายวัน" className="h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="forecastProjectionArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <line className="stroke-slate-100" strokeDasharray="3 5" x1={xStart} x2={xEnd} y1={top} y2={top} />
        <line className="stroke-slate-100" strokeDasharray="3 5" x1={xStart} x2={xEnd} y1={bottom} y2={bottom} />
        {minimum <= 0 && maximum >= 0 ? <line className="stroke-slate-300" strokeDasharray="5 5" x1={xStart - 8} x2={xEnd + 8} y1={zeroY} y2={zeroY} /> : null}
        {minimum <= 0 && maximum >= 0 ? <text className="fill-slate-500" fontSize="10" textAnchor="end" x={xStart - 12} y={zeroY + 3}>0</text> : null}
        <polygon fill="url(#forecastProjectionArea)" points={areaPoints} />
        <polyline className="stroke-cyan-600" fill="none" points={pointString} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        {points.map((point, index) => {
          const highlight = point.isToday || point.date === lowestDay.date || point.date === highestDay.date
          return (
            <g key={point.date}>
              <circle
                className={point.closing >= 0 ? 'fill-cyan-600 stroke-white' : 'fill-rose-500 stroke-white'}
                cx={point.x}
                cy={point.y}
                r={highlight ? 6 : 4}
                strokeWidth="3"
              >
                <title>{point.date}: {money(point.closing)} บาท</title>
              </circle>
              {(highlight || index === points.length - 1) ? (
                <text className={point.closing >= 0 ? 'fill-cyan-700' : 'fill-rose-700'} fontSize="10" fontWeight="700" textAnchor="middle" x={point.x} y={Math.max(14, point.y - 10)}>
                  {money(point.closing)}
                </text>
              ) : null}
            </g>
          )
        })}
        <text className="fill-blue-700" fontSize="11" fontWeight="700" textAnchor="middle" x={points[0]?.x ?? xStart} y={height - 14}>วันนี้</text>
        <text className="fill-slate-500" fontSize="11" fontWeight="600" textAnchor="middle" x={points.at(-1)?.x ?? xEnd} y={height - 14}>สิ้นช่วง</text>
      </svg>
      <div className="grid gap-2 sm:grid-cols-3">
        <ForecastChartNote label="จุดสูงสุด" tone="emerald" value={money(highestDay.closing)}>
          {shortThaiDate(highestDay.date)}
        </ForecastChartNote>
        <ForecastChartNote label="จุดต่ำสุด" tone={lowestDay.closing < 0 ? 'red' : 'slate'} value={money(lowestDay.closing)}>
          {shortThaiDate(lowestDay.date)}
        </ForecastChartNote>
        <ForecastChartNote label="ยอดสิ้นช่วง" tone={endingBalance == null ? 'slate' : endingBalance >= 0 ? 'blue' : 'red'} value={money(endingBalance)}>
          {shortThaiDate(endingDay?.date ?? '')}
        </ForecastChartNote>
      </div>
    </div>
  )
}

function ForecastChartNote({ children, label, tone, value }: { children: ReactNode; label: string; tone: 'blue' | 'emerald' | 'red' | 'slate'; value: string }) {
  const textClass = tone === 'blue'
    ? 'text-blue-700'
    : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'red'
        ? 'text-rose-700'
        : 'text-slate-700'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 break-words font-mono text-lg font-bold tabular-nums sm:text-[1.75rem] ${textClass}`}>{value}</div>
      <div className="mt-1 text-[11px] text-slate-400">{children}</div>
    </div>
  )
}

function CalendarGrid({ days, isLoading, onSelect }: { days: ProjectionDay[]; isLoading: boolean; onSelect: (day: ProjectionDay) => void }) {
  if (isLoading) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm">กำลังโหลดข้อมูล</div>
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-1 grid grid-cols-7 gap-1">{['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map((day) => <div className="py-1 text-center text-xs font-bold text-slate-500" key={day}>{day}</div>)}</div><div className="grid grid-cols-7 gap-1" style={{ minWidth: 560 }}>{days.length ? Array.from({ length: days[0].dayOfWeek }, (_, index) => <div key={`pad${index}`} />) : null}{days.map((day) => <button key={day.date} className={`min-h-24 rounded-md border p-2 text-left text-xs transition ${day.closing < 0 ? 'border-red-300 bg-red-50' : day.isToday ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300' : 'border-slate-100 bg-white'} ${day.dayIn > 0 || day.dayOut > 0 ? 'border-2' : ''}`} type="button" onClick={() => onSelect(day)}><div className="mb-1 flex justify-between"><span className={`font-bold ${day.isToday ? 'text-blue-700' : 'text-slate-700'}`}>{day.dayOfMonth}{day.isToday ? ' (วันนี้)' : ''}</span><span className="text-slate-400">{day.date.slice(5, 7)}</span></div>{day.dayIn > 0 ? <div className="truncate text-emerald-700">+{money(day.dayIn)}</div> : null}{day.dayOut > 0 ? <div className="truncate text-red-600">-{money(day.dayOut)}</div> : null}<div className={`mt-1 truncate font-bold ${day.closing >= 0 ? 'text-slate-700' : 'text-red-700'}`}>{money(day.closing)}</div></button>)}</div></div>
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
        <span> ต้องเร่งเก็บลูกค้าค้างเกินกำหนด (Top 10)</span>
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
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {topPartyColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="party" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('party', 'ลูกค้า')} />
              <ResizableTableHead align="right" label="เลขที่บิล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่บิล')} />
              <ResizableTableHead align="right" label="ยอดค้าง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดค้าง')} />
              <ResizableTableHead align="right" label="ค้างมาแล้ว" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="days" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('days', 'ค้างมาแล้ว')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
                <td className="px-3 py-3 font-medium text-slate-900">{row.customerName}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-semibold text-blue-700">{row.docNo}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{money(row.receivableBalance)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-red-700">{row.daysOverdue} วัน</td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="py-4 text-center text-slate-400" colSpan={topPartyColumns.length}>ไม่มีลูกค้าค้างเกินกำหนด</td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block divide-y divide-slate-100 lg:hidden">
        {!rows.length ? (
          <div className="py-4 text-center text-slate-400 text-xs">ไม่มีลูกค้าค้างเกินกำหนด</div>
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
        <span> อาจต้องเลื่อนจ่ายซัพพลายเออร์ (Top 10 ยอดสูง)</span>
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
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {topPartyColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead label="ผู้ขาย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="party" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('party', 'ผู้ขาย')} />
              <ResizableTableHead align="right" label="เลขที่บิล" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่บิล')} />
              <ResizableTableHead align="right" label="ยอดค้าง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดค้าง')} />
              <ResizableTableHead align="right" label="ครบกำหนดใน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="days" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('days', 'ครบกำหนดใน')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
                <td className="px-3 py-3 font-medium text-slate-900">{row.supplierName}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-semibold text-blue-700">{row.docNo}</td>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border-0 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
          <h2 className="text-sm font-bold"> {day.date} · ยอดปิดวัน {money(day.closing)}</h2>
          <button className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white outline-none hover:bg-red-700 focus:ring-0" type="button" onClick={onClose}>
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
        <div className="flex-1 overflow-auto bg-white">
          {/* Desktop Table View */}
          <div className="hidden lg:block">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {dayEventColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="type" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
                  <ResizableTableHead align="right" label="เลขอ้างอิง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="refNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขอ้างอิง')} />
                  <ResizableTableHead align="right" label="รายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="label" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('label', 'รายการ')} />
                  <ResizableTableHead align="right" label="จำนวนเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวนเงิน')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((event) => (
                  <tr key={`${event.type}-${event.refNo}`} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">{event.type}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-semibold text-blue-700">{event.refNo}</td>
                    <td className="min-w-0 px-3 py-3 text-right text-slate-700"><div className="truncate">{event.label}</div></td>
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
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{message}</div>
}
