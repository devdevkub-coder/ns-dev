'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
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
  const [mobileFrom, setMobileFrom] = useState(from)
  const [mobileTo, setMobileTo] = useState(to)
  const [mobileBranchId, setMobileBranchId] = useState(branchId)
  const url = useMemo(() => `/api/finance-accounting/cash-flow-analysis?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, from, to])
  const { data, error, isLoading, resolvedUrl } = useApi<AnalysisPayload>(url)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const displayData = data && resolvedUrl === url && !isLoading && !error ? data : null
  const displayFrom = displayData?.filters.from || from
  const displayTo = displayData?.filters.to || to
  const displayBranchId = displayData?.filters.branchId ?? branchId
  const selectedBranch = (displayData?.branches ?? data?.branches ?? []).find((branch) => branch.id === displayBranchId)?.name ?? 'ทุกสาขา'
  const periodLabel = `${shortThaiDate(displayFrom)} – ${shortThaiDate(displayTo)}`
  const netProfit = displayData?.charts.profitVsCash.find((row) => row.label.startsWith('Net Profit'))?.amount ?? displayData?.summary.netProfit ?? 0
  const operatingCashFlow = displayData?.charts.profitVsCash.find((row) => row.label.startsWith('Operating Cash Flow'))?.amount ?? displayData?.summary.operatingCashFlow ?? 0
  const maxProfit = Math.max(Math.abs(netProfit), Math.abs(operatingCashFlow), 1)
  const netProfitCashDifference = netProfit - operatingCashFlow

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
      </div>

      {/* Mobile compact filter strip */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">ช่วงวิเคราะห์</div>
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
              <DatePickerInput ariaLabel="จากวันที่" className="w-full text-sm" id="cash-flow-analysis-from-mobile" value={mobileFrom} onChange={setMobileFrom} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="cash-flow-analysis-to-mobile">ถึงวันที่</label>
              <DatePickerInput ariaLabel="ถึงวันที่" className="w-full text-sm" id="cash-flow-analysis-to-mobile" value={mobileTo} onChange={setMobileTo} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">สาขา</label>
            <select
              aria-label="สาขา"
              className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              value={mobileBranchId}
              onChange={(event) => setMobileBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>
        </MobileFilterSheet>
      ) : null}

      {!displayData && !error ? <AnalysisLoadingState /> : null}

      {displayData ? (
        <>
          <KpiCardGrid className="lg:grid-cols-4 xl:grid-cols-4">
            <SharedKpiCard className={analysisKpiClassName} icon={<Wallet aria-hidden="true" className="size-5" />} label="เงินสดคงเหลือ" note={`ณ ${shortThaiDate(displayTo)}`} tone="blue" value={money(displayData.summary.cashNow)} />
            <SharedKpiCard className={analysisKpiClassName} icon={<ArrowDownLeft aria-hidden="true" className="size-5" />} label="ลูกหนี้การค้า (AR)" note="เงินที่คาดว่าจะได้รับ" tone="cyan" value={money(displayData.summary.arNow)} />
            <SharedKpiCard className={analysisKpiClassName} icon={<ArrowUpRight aria-hidden="true" className="size-5" />} label="เจ้าหนี้การค้า (AP)" note="เงินที่ต้องจ่าย" tone="orange" value={money(displayData.summary.apNow)} />
            <SharedKpiCard className={analysisKpiClassName} icon={<Activity aria-hidden="true" className="size-5" />} label="กระแสเงินสดดำเนินงาน" note={periodLabel} tone={operatingCashFlow >= 0 ? 'emerald' : 'red'} value={money(operatingCashFlow)} />
          </KpiCardGrid>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AnalysisPanel
              className="lg:col-span-2"
              subtitle="เปรียบเทียบผลกำไรตามเกณฑ์คงค้างกับเงินสดที่เกิดขึ้นจริง · หน่วย: บาท"
              title="กำไรสุทธิเทียบกระแสเงินสดจริง"
            >
              <CashComparisonChart
                difference={netProfitCashDifference}
                max={maxProfit}
                netProfit={netProfit}
                operatingCashFlow={operatingCashFlow}
              />
            </AnalysisPanel>
            <AnalysisPanel subtitle="เทียบเงินสด ลูกหนี้ และสินค้าคงคลัง · หน่วย: บาท" title="โครงสร้างเงินสดและทุนหมุนเวียน">
              <CapitalStructureChart ar={displayData.charts.trap.ar} cash={displayData.charts.trap.cash} stock={displayData.charts.trap.stock} />
            </AnalysisPanel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AnalysisPanel
              className="lg:col-span-2"
              subtitle="ยอดคาดการณ์หลังรวมเงินรับและเงินจ่ายที่ถึงกำหนด"
              title="ประมาณการเงินสด: ปัจจุบัน / 7 วัน / 30 วัน"
            >
              <CashProjectionChart rows={displayData.charts.projection} />
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

export function CashFlowForecastCalendarPageClient() {
  const [horizon, setHorizon] = useState(30)
  const [startDate, setStartDate] = useState(today())
  const [branchId, setBranchId] = useState('')
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
            <select
              aria-label="สาขา"
              className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              value={mobileBranchId}
              onChange={(event) => setMobileBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>

          <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
            เริ่มจาก <span className="font-bold text-slate-700">{money(displayData?.summary.startCash)}</span> → จบที่ <span className="font-bold text-slate-700">{money(displayData?.summary.endCash)}</span>
          </div>
        </MobileFilterSheet>
      ) : null}

      {!displayData && !error ? <ForecastLoadingState /> : null}

      {displayData ? (
        <>
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
  const amount = value ?? 0
  return amount < 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount)
}

function shortThaiDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(year, month - 1, day))
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 text-sm"><span>{label}</span><DatePickerInput className="w-[140px]" value={value} onChange={onChange} /></label>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <select aria-label="สาขา" className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
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

function CashComparisonChart({ difference, max, netProfit, operatingCashFlow }: { difference: number; max: number; netProfit: number; operatingCashFlow: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between px-1 text-[11px] font-medium text-slate-400" aria-hidden="true">
        <span>ติดลบ</span>
        <span>0</span>
        <span>บวก</span>
      </div>
      <div className="space-y-5">
        <DivergingBar label="กำไรสุทธิ (เกณฑ์คงค้าง)" max={max} tone="emerald" value={netProfit} />
        <DivergingBar label="กระแสเงินสดจากการดำเนินงาน" max={max} tone="blue" value={operatingCashFlow} />
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">ส่วนต่างกำไรสุทธิกับกระแสเงินสด</div>
          <div className="mt-0.5 text-xs text-slate-400">ค่าบวกหมายถึงกำไรสูงกว่าเงินสดจากการดำเนินงาน</div>
        </div>
        <div className={`font-mono text-lg font-bold tabular-nums ${difference === 0 ? 'text-slate-700' : 'text-amber-700'}`}>{money(difference)}</div>
      </div>
    </div>
  )
}

function DivergingBar({ label, max, tone, value }: { label: string; max: number; tone: 'blue' | 'emerald'; value: number }) {
  const width = Math.min(50, Math.abs(value) / max * 50)
  const left = value >= 0 ? 50 : 50 - width
  const fill = value < 0 ? 'bg-rose-500' : tone === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500'
  const text = value < 0 ? 'text-rose-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-blue-700'

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className={`font-mono font-bold tabular-nums ${text}`}>{money(value)}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${label} ${money(value)} บาท`}>
        <div className="absolute inset-y-0 left-1/2 z-10 w-px bg-slate-400/70" />
        <div className={`absolute inset-y-0 rounded-full ${fill}`} style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
    </div>
  )
}

function CapitalStructureChart({ ar, cash, stock }: { ar: number; cash: number; stock: number }) {
  const rows = [
    { barClass: 'bg-blue-500', icon: Wallet, iconClass: 'bg-blue-100 text-blue-700', label: 'เงินสดและธนาคาร', value: cash },
    { barClass: 'bg-cyan-500', icon: Landmark, iconClass: 'bg-cyan-100 text-cyan-700', label: 'ลูกหนี้การค้า (AR)', value: ar },
    { barClass: 'bg-amber-500', icon: Package, iconClass: 'bg-amber-100 text-amber-700', label: 'สินค้าคงคลัง', value: stock },
  ]
  const total = rows.reduce((sum, row) => sum + Math.abs(row.value), 0)
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1)
  const stockRatioVsCash = cash > 0 ? stock / cash * 100 : 0
  const arRatioVsCash = cash > 0 ? ar / cash * 100 : 0
  const dominantLabel = stock > ar * 1.5 ? 'สินค้าคงคลังจมมากกว่าลูกหนี้' : ar > stock * 1.5 ? 'ลูกหนี้จมมากกว่าสินค้าคงคลัง' : 'ลูกหนี้และสินค้าคงคลังยังใกล้กัน'
  const dominantTone = stock > ar * 1.5 ? 'text-amber-700' : ar > stock * 1.5 ? 'text-cyan-700' : 'text-slate-700'

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const Icon = row.icon
        const percentage = total > 0 ? Math.abs(row.value) / total * 100 : 0
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
                <div className={`h-full rounded-full ${row.value < 0 ? 'bg-rose-500' : row.barClass}`} style={{ width: `${Math.abs(row.value) / max * 100}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">{percentage.toFixed(1)}%</span>
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="font-semibold text-slate-500">รวมฐานเปรียบเทียบ</span>
        <span className="font-mono font-bold tabular-nums text-slate-700">{money(total)}</span>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">เงินจมที่ไหน</div>
            <div className={`mt-1 text-sm font-bold ${dominantTone}`}>{dominantLabel}</div>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
            เทียบกับเงินสด
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-white px-3 py-2">
            <div className="text-[11px] font-semibold text-cyan-700">ลูกหนี้การค้า (AR)</div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-800">{money(ar)}</div>
            <div className="mt-1 text-[11px] text-slate-500">{arRatioVsCash.toFixed(1)}% ของเงินสด</div>
          </div>
          <div className="rounded-lg bg-white px-3 py-2">
            <div className="text-[11px] font-semibold text-amber-700">สินค้าคงคลัง</div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-800">{money(stock)}</div>
            <div className="mt-1 text-[11px] text-slate-500">{stockRatioVsCash.toFixed(1)}% ของเงินสด</div>
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">สัดส่วนคำนวณจากมูลค่าสัมบูรณ์เพื่อเปรียบเทียบขนาดของแต่ละรายการ</p>
    </div>
  )
}

function ProjectionChartSvg({ compact, rows }: { compact: boolean; rows: AnalysisPayload['charts']['projection'] }) {
  const values = rows.map((row) => row.projected)
  const rawMinimum = Math.min(...values, 0)
  const rawMaximum = Math.max(...values, 0)
  const crossesZero = values.some((value) => value < 0) && values.some((value) => value >= 0)
  const visibleMinimum = values.length ? Math.min(...values) : 0
  const visibleMaximum = values.length ? Math.max(...values) : 0
  const padding = Math.max((visibleMaximum - visibleMinimum) * 0.16, Math.abs(visibleMaximum) * 0.02, 1)
  const minimum = crossesZero ? rawMinimum : visibleMinimum - padding
  const maximum = crossesZero ? rawMaximum : visibleMaximum + padding
  const range = Math.max(1, maximum - minimum)
  const width = compact ? 360 : 720
  const height = compact ? 210 : 180
  const top = compact ? 24 : 20
  const bottom = compact ? 164 : 140
  const xStart = compact ? 56 : 80
  const xEnd = compact ? 322 : 640
  const zeroY = top + (maximum / range) * (bottom - top)
  const showZeroLine = minimum <= 0 && maximum >= 0
  const areaBaselineY = showZeroLine ? zeroY : values.every((value) => value >= 0) ? bottom : top
  const timeOffsets = rows.map((row, index) => {
    const match = row.label.match(/\d+/)
    return match ? Number(match[0]) : index === 0 ? 0 : index
  })
  const maxOffset = Math.max(...timeOffsets, 1)
  const points = rows.map((row, index) => ({
    ...row,
    x: xStart + (timeOffsets[index] / maxOffset) * (xEnd - xStart),
    y: top + ((maximum - row.projected) / range) * (bottom - top),
  }))
  const pointString = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPoints = points.length ? `${points[0].x},${areaBaselineY} ${pointString} ${points.at(-1)?.x},${areaBaselineY}` : ''
  const gradientId = compact ? 'cashProjectionAreaMobile' : 'cashProjectionAreaDesktop'

  return (
    <svg
      aria-label="กราฟประมาณการเงินสดปัจจุบัน 7 วัน และ 30 วัน"
      className={compact ? 'h-auto w-full sm:hidden' : 'hidden h-auto w-full sm:block'}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line className="stroke-slate-100" strokeDasharray="3 5" x1={xStart} x2={xEnd} y1={top} y2={top} />
      <line className="stroke-slate-100" strokeDasharray="3 5" x1={xStart} x2={xEnd} y1={bottom} y2={bottom} />
      {showZeroLine ? <line className="stroke-slate-300" strokeDasharray="5 5" x1={xStart - 8} x2={xEnd + 8} y1={zeroY} y2={zeroY} /> : null}
      {showZeroLine ? <text className="fill-slate-500" fontSize="10" textAnchor="end" x={xStart - 12} y={zeroY + 3}>0</text> : null}
      {areaPoints ? <polygon fill={`url(#${gradientId})`} points={areaPoints} /> : null}
      <polyline className="stroke-blue-500" fill="none" points={pointString} strokeLinecap="round" strokeLinejoin="round" strokeWidth={compact ? 3 : 4} />
      {points.map((point) => (
        <g key={point.label}>
          <circle className={point.projected >= 0 ? 'fill-blue-600 stroke-white' : 'fill-rose-500 stroke-white'} cx={point.x} cy={point.y} r={compact ? 6 : 7} strokeWidth="3">
            <title>{point.label}: {money(point.projected)} บาท</title>
          </circle>
          <text className="fill-slate-500" fontSize={compact ? 12 : 11} fontWeight="600" textAnchor="middle" x={point.x} y={height - 10}>{point.label}</text>
        </g>
      ))}
    </svg>
  )
}

function CashProjectionChart({ rows }: { rows: AnalysisPayload['charts']['projection'] }) {
  if (!rows.length) return <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีข้อมูลประมาณการในช่วงที่เลือก</div>

  return (
    <div>
      <ProjectionChartSvg compact rows={rows} />
      <ProjectionChartSvg compact={false} rows={rows} />
      <div className="mt-1 divide-y divide-slate-100 border-t border-slate-100 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {rows.map((row) => (
          <div className="py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0" key={row.label}>
            <div className="text-xs font-semibold text-slate-500 sm:text-sm">{row.label}</div>
            <div className={`mt-1 font-mono text-xl font-bold tabular-nums sm:text-2xl ${row.projected >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(row.projected)}</div>
            <div className="mt-2 flex flex-col gap-1 text-[11px] sm:text-xs">
              {row.expectedIn > 0 ? <span className="font-semibold text-emerald-700">คาดว่าจะรับ +{money(row.expectedIn)}</span> : <span className="text-slate-400">ไม่มีเงินรับเพิ่ม</span>}
              {row.expectedOut > 0 ? <span className="font-semibold text-rose-700">คาดว่าจะจ่าย -{money(row.expectedOut)}</span> : <span className="text-slate-400">ไม่มีเงินจ่ายเพิ่ม</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LiquidityRiskPanel({ burnRate, daysToODMaxed, odLimit, odUsed }: { burnRate: number; daysToODMaxed: number; odLimit: number; odUsed: number }) {
  const utilization = odLimit > 0 ? Math.min(100, Math.max(0, odUsed / odLimit * 100)) : 0
  const days = Math.max(0, Math.round(daysToODMaxed))
  const risk = odLimit <= 0 ? 'unknown' : days < 30 ? 'danger' : days < 90 ? 'warn' : 'ok'
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
          <span className={`font-mono text-base font-bold tabular-nums ${burnRate > 0 ? 'text-rose-700' : 'text-slate-700'}`}>{money(burnRate)}</span>
        </div>
        <div className="mt-1 text-right text-[11px] text-slate-400">บาท/วัน</div>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-slate-500">วงเงิน OD ที่ใช้แล้ว</span>
          <span className="font-mono text-sm font-bold tabular-nums text-slate-800">{money(odUsed)} / {money(odLimit)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`ใช้วงเงิน OD ${utilization.toFixed(1)} เปอร์เซ็นต์`}>
          <div className={`h-full rounded-full ${utilization >= 90 ? 'bg-rose-500' : utilization >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${utilization}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>{odLimit > 0 ? `ใช้แล้ว ${utilization.toFixed(1)}%` : 'ยังไม่ได้กำหนดวงเงิน OD'}</span>
          <span>{odLimit > 0 ? `คงเหลือ ${money(Math.max(0, odLimit - odUsed))}` : null}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">คาดว่าวงเงิน OD จะเต็มใน</div>
          <div className="mt-1 text-[11px] text-slate-400">อิงจากอัตราใช้เงินสดเฉลี่ยปัจจุบัน</div>
        </div>
        <div className={`shrink-0 text-right font-mono text-2xl font-bold tabular-nums ${riskColor}`}>
          {odLimit <= 0 ? '—' : days >= 999 ? <><span className="text-xs font-semibold">มากกว่า</span> 999 <span className="text-xs font-semibold">วัน</span></> : <>{days.toLocaleString('th-TH')} <span className="text-xs font-semibold">วัน</span></>}
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
    .replaceAll('Net Profit', 'กำไรสุทธิ')
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
  'Net Profit ในงบ (Accrual)': 'กำไรสุทธิในงบ (เกณฑ์คงค้าง)',
  'Operating Cash Flow จริง': 'กระแสเงินสดจากการดำเนินงาน',
  'ส่วนต่าง (NP - OCF)': 'ส่วนต่างกำไรสุทธิกับกระแสเงินสด',
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
  if (row.suffix === '%') return `${row.value.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
  if (row.suffix?.includes('วัน')) return row.value >= 999 ? 'มากกว่า 999 วัน' : `${Math.round(row.value).toLocaleString('th-TH')} วัน`
  return money(row.value)
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
                <td className="px-3 py-3 text-slate-700">{detailLabel(row.label)}</td>
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
            <span className="min-w-0 text-slate-700">{detailLabel(row.label)}</span>
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
  const ok = (summary?.lowestBal ?? 0) >= 0
  const tone = ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'

  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
        {ok ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : <AlertTriangle aria-hidden="true" className="size-3.5" />}
        {ok ? 'คาดการณ์: เงินพอ' : 'คาดการณ์: เงินขาด'}
      </div>
      <div>
        <div className={`break-words font-mono text-3xl font-bold leading-tight tabular-nums ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{money(summary?.endCash)}</div>
        <div className="mt-1 text-sm font-medium text-slate-600">เงินสด ณ สิ้น {horizon} วัน</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ForecastMiniStat label="เริ่มต้น" tone="blue" value={money(summary?.startCash)} />
        <ForecastMiniStat label="รับคาดการณ์" tone="emerald" value={`+${money(summary?.totalIn)}`} />
        <ForecastMiniStat label="จ่ายคาดการณ์" tone="red" value={`-${money(summary?.totalOut)}`} />
        <ForecastMiniStat label="ยอดต่ำสุด" tone={(summary?.lowestBal ?? 0) >= 0 ? 'slate' : 'red'} value={money(summary?.lowestBal)} />
      </div>
      {summary?.negCount ? (
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
  if (!days.length) return <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีข้อมูลพยากรณ์ในช่วงที่เลือก</div>

  const values = days.map((day) => day.closing)
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
  const points = days.map((day, index) => ({
    ...day,
    x: xStart + (index / Math.max(1, days.length - 1)) * (xEnd - xStart),
    y: top + ((maximum - day.closing) / range) * (bottom - top),
  }))
  const pointString = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaBase = values.every((value) => value >= 0) ? bottom : values.every((value) => value <= 0) ? top : zeroY
  const areaPoints = `${points[0]?.x ?? xStart},${areaBase} ${pointString} ${points.at(-1)?.x ?? xEnd},${areaBase}`
  const lowestDay = points.reduce((lowest, point) => point.closing < lowest.closing ? point : lowest, points[0])
  const highestDay = points.reduce((highest, point) => point.closing > highest.closing ? point : highest, points[0])

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
        <ForecastChartNote label="ยอดสิ้นช่วง" tone={days.at(-1)?.closing ?? 0 >= 0 ? 'blue' : 'red'} value={money(days.at(-1)?.closing)}>
          {shortThaiDate(days.at(-1)?.date ?? '')}
        </ForecastChartNote>
      </div>
    </div>
  )
}

function ForecastMiniStat({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'; value: string }) {
  const toneClass = tone === 'blue'
    ? 'text-blue-700 bg-blue-50 border-blue-100'
    : tone === 'emerald'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
      : tone === 'red'
        ? 'text-rose-700 bg-rose-50 border-rose-100'
        : tone === 'amber'
          ? 'text-amber-700 bg-amber-50 border-amber-100'
          : 'text-slate-700 bg-slate-50 border-slate-200'

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-[11px] font-semibold">{label}</div>
      <div className="mt-1 break-words font-mono text-base font-bold tabular-nums">{value}</div>
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
