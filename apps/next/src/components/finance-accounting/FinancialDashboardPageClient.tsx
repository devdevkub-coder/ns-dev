'use client'

import Link from 'next/link'
import { Activity, ArrowDownLeft, ArrowUpRight, Gauge, Package, SlidersHorizontal, Wallet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard, KpiCardGrid, type KpiCardTone } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { Select } from '@/components/ui/Select'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type Insight = { detail: string; title: string; type: 'danger' | 'ok' | 'warn'; value: number | string }
type Payload = {
  assetComp: { color: string; name: string; value: number }[]
  branches: BranchRow[]
  cashPeriods: { cashIn: number; label: string; need: number; projected: number }[]
  fcdBalances: { currency: string; value: number }[]
  filters: { asOf: string; branchId: string; monthStart: string }
  insights: Insight[]
  monthlyPL: { cogs: number; exp: number; label: string; np: number; rev: number }[]
  sourceState: { basis: string; limitations: string[]; writeActionsEnabled: false }
  summary: Record<string, number>
}

const financialDashboardKpiClassName = 'h-full items-start transition-colors hover:border-slate-300 sm:items-center [&_.truncate]:overflow-visible [&_.truncate]:text-clip [&_.truncate]:whitespace-normal [&>div:first-child]:hidden sm:[&>div:first-child]:flex'
const cashAnalysisInsightTitles = new Set([
  'เงินสดพอจ่ายกี่วัน',
  'สภาพคล่อง 7 วัน',
  'เงินรับเทียบเงินจ่าย 30 วัน',
  'กำไรก่อนภาษีเทียบ OCF',
])

export function FinancialDashboardPageClient() {
  const [asOf, setAsOf] = useState(todayDateInput)
  const [branchId, setBranchId] = useState('')
  const [mobileAsOf, setMobileAsOf] = useState(asOf)
  const [mobileBranchId, setMobileBranchId] = useState(branchId)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const url = useMemo(() => `/api/finance-accounting/financial-dashboard?asOf=${asOf}${branchId ? `&branchId=${branchId}` : ''}`, [asOf, branchId])
  const { data, error, isLoading, resolvedUrl } = useApi<Payload>(url)
  const displayData = data && resolvedUrl === url && !isLoading && !error ? data : null
  const branchLabel = branchId ? data?.branches.find((branch) => branch.id === branchId)?.name ?? branchId : 'ทุกสาขา'

  function openMobileFilters() {
    setMobileAsOf(asOf)
    setMobileBranchId(branchId)
    setShowMobileFilters(true)
  }

  return (
    <section aria-busy={isLoading} className="space-y-4">
      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-800 shadow-sm" role="alert">
          <div>{error}</div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="hidden items-end gap-3 lg:flex">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600" htmlFor="financial-dashboard-as-of">ณ วันที่</label>
            <DatePickerInput
              ariaLabel="ณ วันที่"
              className="h-9 w-full rounded-md border-slate-300 text-sm outline-none focus:border-slate-400 focus:ring-0 sm:w-[140px]"
              id="financial-dashboard-as-of"
              readOnly
              required
              showClearButton={false}
              value={asOf}
              onChange={(value) => value ? setAsOf(value) : undefined}
            />
          </div>
          <div className="min-w-0 space-y-1 sm:w-64">
            <label className="block text-xs font-medium text-slate-600" htmlFor="financial-dashboard-branch">สาขา</label>
            <Select
              aria-label="สาขา"
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-0"
              id="financial-dashboard-branch"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500">ขอบเขตข้อมูล</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{displayDate(asOf)} · {branchLabel}</div>
          </div>
          <button
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600"
            type="button"
            onClick={openMobileFilters}
          >
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            ตัวกรอง
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700" title={data?.sourceState.limitations.join(' · ')}>
            ข้อมูลเพื่อการบริหาร · ยังไม่ใช่งบปิดบัญชี
          </span>
          <span>ขอบเขตข้อมูล ณ {displayDate(asOf)}</span>
          <span aria-hidden="true">·</span>
          <span>ประมาณการ 7/30 วัน</span>
          <span aria-hidden="true">·</span>
          <span>สาขา: {branchLabel}</span>
          <span aria-hidden="true">·</span>
          <span>หน่วยหลัก: บาท · FCD แสดงยอดตั้งต้นแยกตามสกุลและยังไม่รวมในยอดบาท/ประมาณการ</span>
        </div>
      </div>

      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรอง Financial Dashboard"
          onClose={() => setShowMobileFilters(false)}
          footer={
            <>
              <button
                className="h-10 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                type="button"
                onClick={() => {
                  setMobileAsOf(todayDateInput())
                  setMobileBranchId('')
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                className="h-10 rounded-md bg-blue-600 text-sm font-normal text-white transition hover:bg-blue-700"
                type="button"
                onClick={() => {
                  setAsOf(mobileAsOf)
                  setBranchId(mobileBranchId)
                  setShowMobileFilters(false)
                }}
              >
                ใช้ตัวกรอง
              </button>
            </>
          }
        >
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600" htmlFor="financial-dashboard-as-of-mobile">ณ วันที่</label>
            <DatePickerInput
              ariaLabel="ณ วันที่"
              className="w-full text-sm"
              id="financial-dashboard-as-of-mobile"
              readOnly
              required
              showClearButton={false}
              value={mobileAsOf}
              onChange={(value) => value ? setMobileAsOf(value) : undefined}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600" htmlFor="financial-dashboard-branch-mobile">สาขา</label>
            <Select
              aria-label="สาขา"
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none transition focus:border-slate-400"
              id="financial-dashboard-branch-mobile"
              value={mobileBranchId}
              onChange={(event) => setMobileBranchId(event.target.value)}
            >
              <option value="">ทุกสาขา</option>
              {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </div>
        </MobileFilterSheet>
      ) : null}

      {isLoading ? <DashboardLoadingState /> : displayData ? <DashboardContent data={displayData} /> : null}
    </section>
  )
}

function DashboardContent({ data }: { data: Payload }) {
  const s = data.summary
  const assetTotal = data.assetComp.reduce((sum, row) => sum + row.value, 0)
  const cashPeriods = data?.cashPeriods ?? []
  const branchSuffix = data.filters.branchId && data.filters.branchId !== 'ALL'
    ? `&branchId=${encodeURIComponent(data.filters.branchId)}`
    : ''
  const periodSearch = `from=${encodeURIComponent(data.filters.monthStart)}&to=${encodeURIComponent(data.filters.asOf)}${branchSuffix}`
  const outstandingSearch = `from=&to=${encodeURIComponent(data.filters.asOf)}${branchSuffix}`
  const asOfSearch = `asOf=${encodeURIComponent(data.filters.asOf)}${branchSuffix}`
  const plHref = `/finance-accounting/pl-statement?${periodSearch}`
  const cashAnalysisHref = `/finance-accounting/cash-flow-analysis?${periodSearch}`

  return (
    <>
      <KpiCardGrid className="lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiLink icon={<Wallet aria-hidden="true" className="size-5" />} label="เงินสดและธนาคาร" note={`ยอดบาท ณ ${displayDate(data.filters.asOf)}`} tone="slate" value={money(s.cashAndBank)} />
        <KpiLink href={`/finance/ar?${outstandingSearch}`} icon={<ArrowDownLeft aria-hidden="true" className="size-5" />} label="ลูกหนี้การค้า (AR)" note="ยอดคงค้าง" tone="slate" value={money(s.ar)} />
        <KpiLink href={`/finance/ap?${outstandingSearch}`} icon={<ArrowUpRight aria-hidden="true" className="size-5" />} label="เจ้าหนี้การค้า (AP)" note="ยอดคงค้าง" tone="slate" value={money(s.ap)} />
        <KpiLink icon={<Package aria-hidden="true" className="size-5" />} label="สินค้าคงคลัง (WAC)" note="มูลค่าต้นทุน" tone="slate" value={money(s.inv)} />
        <KpiLink href={plHref} icon={<Gauge aria-hidden="true" className="size-5" />} label="กำไรก่อนภาษี" note={`${percent(s.npPct)} ของรายได้`} tone={signedTone(s.np)} value={money(s.np)} />
        <KpiLink href={cashAnalysisHref} icon={<Activity aria-hidden="true" className="size-5" />} label="กระแสเงินสดดำเนินงาน" note="จากรายการในระบบ" tone={signedTone(s.opCF)} value={money(s.opCF)} />
      </KpiCardGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" href={plHref} subtitle="รายได้ ต้นทุนขาย และกำไรก่อนภาษี · หน่วย: บาท" title="P&L 6 เดือนล่าสุด">
          <ProfitChart rows={data.monthlyPL} />
        </Panel>
        <Panel href={`/finance-accounting/asset-overview?${asOfSearch}`} subtitle="เฉพาะองค์ประกอบหลักที่แสดง · ไม่รวม FCD · หน่วย: บาท" title="องค์ประกอบสินทรัพย์หลัก">
          <AssetBreakdown rows={data.assetComp} total={assetTotal} />
        </Panel>
      </div>

      <Panel href={cashAnalysisHref} subtitle="ประมาณการจาก AR/AP และกำหนดชำระที่มีในระบบ · หน่วย: บาท" title="ประมาณการเงินสด 7/30 วัน">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-100 pb-4 md:grid-cols-4">
          <CompactStat label="เงินสด" value={money(s.cashBalance)} />
          <CompactStat label="ธนาคาร" value={money(s.bankBalance)} />
          <CompactStat label="FCD (ยอดตั้งต้น · ไม่รวมยอดบาท)" value={fcdSummary(data.fcdBalances)} />
          <CompactStat label="OD" value={odSummary(s)} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {cashPeriods.map((period) => (
            <CashProjectionCard key={period.label} period={period} />
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel href={plHref} subtitle="เกณฑ์คงค้าง · หน่วย: บาท" title={`ผลประกอบการ ${data.filters.monthStart.slice(0, 7)}`}>
          <div className="divide-y divide-slate-100">
            <MetricRow label="รายได้" value={money(s.rev)} />
            <MetricRow label="ต้นทุนขาย (COGS)" value={money(s.cogs)} />
            <MetricRow label="กำไรขั้นต้น" note={`${percent(s.gpPct)} ของรายได้`} tone={signedTone(s.gp)} value={money(s.gp)} />
          </div>
        </Panel>

        <Panel subtitle="ข้อมูลเพื่อการบริหาร · ยังไม่ใช่งบปิดบัญชีตาม GL" title="ฐานะการเงินเพื่อการบริหาร">
          <div className="divide-y divide-slate-100">
            <MetricRow label="สินทรัพย์รวม" note="เงินสด + ลูกหนี้ + สินค้าคงคลัง + สินทรัพย์" value={money(s.totalAssets)} />
            <MetricRow label="หนี้สินรวม" note="เจ้าหนี้ + เงินกู้ + ลีสซิ่ง" value={money(s.totalLiab)} />
            <MetricRow label="ส่วนของเจ้าของ" note="สินทรัพย์ - หนี้สิน" value={money(s.equity)} />
            <MetricRow label="สินทรัพย์ถาวร (NBV)" value={money(s.totalNBV)} />
            <MetricRow label="เงินกู้/ลีสซิ่งคงเหลือ" value={money(s.totalLoan)} />
          </div>
        </Panel>
      </div>

      <section className="space-y-3" aria-labelledby="financial-dashboard-insights">
        <div>
          <h2 className="text-sm font-bold text-slate-800 md:text-base" id="financial-dashboard-insights">ประเด็นที่ควรติดตาม</h2>
          <p className="mt-1 text-xs text-slate-500">สัญญาณจากวันที่และสาขาที่เลือก · ตัวเลขสีแดง/ส้มมีความหมายเป็นความเสี่ยง</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.insights.map((insight) => <InsightCard href={cashAnalysisInsightTitles.has(insight.title) ? cashAnalysisHref : undefined} insight={insight} key={insight.title} />)}
          {(s.pendingDeliveryCost ?? 0) > 0 ? (
            <InsightCard
              href="/daily/weight-ticket-list?type=WTO"
              insight={{ detail: 'ใบส่งของที่ยังไม่เปิดบิลขาย', title: 'ต้นทุนรอเปิดบิล', type: 'warn', value: s.pendingDeliveryCost }}
            />
          ) : null}
        </div>
      </section>
    </>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const latestLoadRequestRef = useRef(0)

  useEffect(() => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setIsLoading(true)
    setError(null)
    dailyFetchJson<T>(url)
      .then((payload) => {
        if (requestId !== latestLoadRequestRef.current) return
        setData(payload)
        setResolvedUrl(url)
      })
      .catch((caught) => {
        if (requestId !== latestLoadRequestRef.current) return
        setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
      })
      .finally(() => {
        if (requestId !== latestLoadRequestRef.current) return
        setIsLoading(false)
      })
  }, [url])

  return { data, error, isLoading, resolvedUrl }
}

function DashboardLoadingState() {
  return (
    <div aria-label="กำลังโหลดข้อมูล Financial Dashboard" className="space-y-4" role="status">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" key={index} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      </div>
      <span className="sr-only">กำลังโหลดข้อมูล</span>
    </div>
  )
}

function KpiLink({ href, icon, label, note, tone, value }: { href?: string; icon: ReactNode; label: string; note: string; tone: KpiCardTone; value: string }) {
  const card = <SharedKpiCard className={financialDashboardKpiClassName} icon={icon} label={label} note={note} tone={tone} value={value} />
  return href
    ? <Link className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={href}>{card}</Link>
    : card
}

function Panel({ children, className = '', href, subtitle, title }: { children: ReactNode; className?: string; href?: string; subtitle?: string; title: string }) {
  return (
    <section className={`rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800 md:text-base">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {href ? <Link aria-label={`ดูรายละเอียด ${title}`} className="shrink-0 text-xs font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={href}>ดูรายละเอียด</Link> : null}
      </div>
      {children}
    </section>
  )
}

function ProfitChart({ rows }: { rows: Payload['monthlyPL'] }) {
  const chartFrameRef = useRef<HTMLDivElement>(null)
  const suppressHoverRef = useRef(false)
  const [tooltip, setTooltip] = useState<{ index: number; left: number; row: Payload['monthlyPL'][number]; top: number } | null>(null)
  useEffect(() => {
    if (!tooltip) return
    const dismissTooltip = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        suppressHoverRef.current = true
        setTooltip(null)
      }
    }
    document.addEventListener('keydown', dismissTooltip)
    return () => document.removeEventListener('keydown', dismissTooltip)
  }, [tooltip])
  const values = rows.flatMap((row) => [row.rev, row.cogs, row.np]).filter((value) => Number.isFinite(value))
  const hasData = values.some((value) => value !== 0)
  if (!hasData) return <div className="flex h-60 items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</div>

  const maxValue = Math.max(...values, 0)
  const minValue = Math.min(...values, 0)
  const range = maxValue - minValue
  const plotTop = 10
  const plotBottom = 170
  const valueY = (value: number) => plotTop + (maxValue - value) / range * (plotBottom - plotTop)
  const zeroY = valueY(0)
  const ticks = Array.from({ length: 5 }, (_, index) => maxValue - range * index / 4)
  if (minValue < 0 && maxValue > 0) {
    const closestToZero = ticks.reduce((closest, value, index) => Math.abs(value) < Math.abs(ticks[closest]) ? index : closest, 0)
    ticks[closestToZero] = 0
  }
  const chartMoney = (value: number) => Number.isFinite(value) ? `${money(value)} บาท` : money(value)
  const showTooltipAtTarget = (row: Payload['monthlyPL'][number], index: number, target: SVGGElement) => {
    const frame = chartFrameRef.current?.getBoundingClientRect()
    if (!frame) return
    const targetRect = target.querySelector<SVGRectElement>('[data-pl-chart-hit]')?.getBoundingClientRect() ?? target.getBoundingClientRect()
    const frameWidth = Math.max(frame.width, 240)
    const frameHeight = Math.max(frame.height, 210)
    const tooltipWidth = Math.min(272, frameWidth - 16)
    const tooltipHeight = 152
    const targetLeft = targetRect.left - frame.left
    const targetRight = targetRect.right - frame.left
    const rightCandidate = targetRight + 12
    const left = rightCandidate + tooltipWidth <= frameWidth - 8
      ? rightCandidate
      : Math.max(8, targetLeft - tooltipWidth - 12)
    const targetCenterY = targetRect.top - frame.top + targetRect.height / 2
    const top = Math.min(Math.max(targetCenterY - tooltipHeight / 2, 8), Math.max(8, frameHeight - tooltipHeight - 8))
    setTooltip({ index, left, row, top })
  }

  return (
    <div
      className="relative"
      ref={chartFrameRef}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') {
          suppressHoverRef.current = false
          setTooltip(null)
        }
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return
        if (suppressHoverRef.current) suppressHoverRef.current = false
        const target = event.target
        if (!(target instanceof Element) || (!target.closest('[data-pl-chart-interactive]') && !target.closest('[data-pl-tooltip]'))) setTooltip(null)
      }}
      onPointerDown={(event) => {
        const target = event.target
        if (!(target instanceof Element) || (!target.closest('[data-pl-chart-interactive]') && !target.closest('[data-pl-tooltip]'))) setTooltip(null)
      }}
    >
      <div className="mb-2 flex flex-wrap justify-end gap-3 text-xs">
        <Legend color="bg-emerald-400" label="รายได้" />
        <Legend color="bg-rose-400" label="ต้นทุนขาย (COGS)" />
        <Legend color="bg-violet-400" label="กำไรก่อนภาษี" />
      </div>
      <div aria-label="เลื่อนดูกราฟ P&L ตามเดือน" className="overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" role="region" tabIndex={0}>
        <svg aria-label="กราฟ P&L 6 เดือน แสดงรายได้ ต้นทุนขาย และกำไรก่อนภาษี" className="h-[210px] min-w-[720px] w-full" role="img">
          <desc>{rows.map((row) => `${row.label}: รายได้ ${chartMoney(row.rev)}, ต้นทุนขาย ${chartMoney(row.cogs)}, กำไรก่อนภาษี ${chartMoney(row.np)}`).join(' | ')}</desc>
          {ticks.map((value) => {
            const y = valueY(value)
            return (
              <g key={value}>
                <line stroke={Math.abs(value) < 0.000001 ? '#cbd5e1' : '#eef2f7'} x1="8%" x2="99%" y1={y} y2={y} />
                <text fill="#94a3b8" fontSize="10" x="0.5%" y={y + 4}>{compactMoney(value)}</text>
              </g>
            )
          })}
          {rows.map((row, index) => {
            const groupX = 13 + index * 15.8
            const bars = [
              { fill: '#34d399', value: row.rev },
              { fill: '#fb7185', value: row.cogs },
              { fill: row.np >= 0 ? '#a78bfa' : '#f43f5e', value: row.np },
            ]
            const hasVisibleBar = bars.some((bar) => Number.isFinite(bar.value) && bar.value !== 0)
            return (
              <g
                aria-describedby={hasVisibleBar && tooltip?.index === index ? 'financial-dashboard-pl-tooltip' : undefined}
                aria-label={`${row.label}: รายได้ ${chartMoney(row.rev)}, ต้นทุนขาย ${chartMoney(row.cogs)}, กำไรก่อนภาษี ${chartMoney(row.np)}`}
                data-pl-chart-group={row.label}
                data-pl-chart-interactive={hasVisibleBar ? 'true' : undefined}
                key={row.label}
                role="group"
                tabIndex={hasVisibleBar ? 0 : undefined}
                onBlur={hasVisibleBar ? () => setTooltip((current) => current?.index === index ? null : current) : undefined}
                onClick={hasVisibleBar ? (event) => {
                  suppressHoverRef.current = false
                  showTooltipAtTarget(row, index, event.currentTarget)
                } : undefined}
                onFocus={hasVisibleBar ? (event) => {
                  suppressHoverRef.current = false
                  showTooltipAtTarget(row, index, event.currentTarget)
                } : undefined}
                onPointerEnter={hasVisibleBar ? (event) => {
                  if (event.pointerType === 'mouse' && !suppressHoverRef.current) showTooltipAtTarget(row, index, event.currentTarget)
                } : undefined}
              >
                {hasVisibleBar ? <rect className={tooltip?.index === index ? 'stroke-blue-200 dark:stroke-[#3b82f6]' : 'stroke-transparent'} data-pl-chart-hit fill="#000" fillOpacity="0.001" height="180" pointerEvents="all" rx="4" strokeWidth="1" width="9.6%" x={`${groupX - 1}%`} y="0" /> : null}
                {bars.map((bar, barIndex) => {
                  if (!Number.isFinite(bar.value)) return null
                  const y = valueY(bar.value)
                  return <rect fill={bar.fill} height={Math.abs(zeroY - y)} key={bar.fill} rx="3" width="2.2%" x={`${groupX + barIndex * 2.6}%`} y={Math.min(zeroY, y)} />
                })}
                <text fill="#64748b" fontSize="12" textAnchor="middle" x={`${groupX + 3.7}%`} y="202">{row.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
      {tooltip ? (
        <div
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-100 p-3 text-slate-700 shadow-lg sm:absolute sm:z-20 sm:mt-0 sm:w-[272px]"
          data-pl-tooltip
          id="financial-dashboard-pl-tooltip"
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div className="border-b border-slate-200 pb-2 text-xs font-bold text-slate-800">P&amp;L {tooltip.row.label}</div>
          <div className="mt-2 space-y-1.5">
            {[
              { color: 'bg-emerald-400', label: 'รายได้', value: tooltip.row.rev },
              { color: 'bg-rose-400', label: 'ต้นทุนขาย (COGS)', value: tooltip.row.cogs },
              { color: tooltip.row.np >= 0 ? 'bg-violet-400' : 'bg-rose-500', label: 'กำไรก่อนภาษี', value: tooltip.row.np },
            ].map((item) => (
              <div className="flex items-center justify-between gap-4 text-xs" key={item.label}>
                <span className="flex min-w-0 items-center gap-1.5 text-slate-600"><span className={`size-2 shrink-0 rounded-sm ${item.color}`} />{item.label}</span>
                <span className="shrink-0 font-mono font-semibold text-slate-900">{chartMoney(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5 font-medium text-slate-600"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>
}

function AssetBreakdown({ rows, total }: { rows: Payload['assetComp']; total: number }) {
  if (rows.length === 0 || total <= 0) return <div className="flex h-60 items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลสินทรัพย์</div>

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const percentage = row.value / total * 100
        return (
          <div key={row.name}>
            <div className="mb-1.5 flex items-start justify-between gap-3 text-xs">
              <span className="font-medium text-slate-600">{row.name}</span>
              <span className="text-right font-mono font-bold text-slate-800">{money(row.value)} <span className="font-sans font-medium text-slate-400">({percent(percentage)})</span></span>
            </div>
            <div aria-label={`${row.name} ${percent(percentage)} ขององค์ประกอบที่แสดง`} className="h-2 overflow-hidden rounded-full bg-slate-100" role="img">
              <div className="h-full min-w-[2px] rounded-full" style={{ backgroundColor: row.color, width: `${Math.min(100, percentage)}%` }} />
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-bold text-slate-800">
        <span>รวมองค์ประกอบที่แสดง</span>
        <span className="font-mono">{money(total)}</span>
      </div>
    </div>
  )
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-1 break-words font-mono text-sm font-bold text-slate-800 sm:text-base">{value}</div></div>
}

function fcdSummary(rows: Payload['fcdBalances']) {
  return rows.length > 0 ? rows.map((row) => `${row.currency} ${money(row.value)}`).join(' · ') : 'ไม่มีรายการ'
}

function odSummary(summary: Record<string, number>) {
  const limit = summary.odLimit
  const used = summary.odUsed
  if (limit == null || used == null || !Number.isFinite(limit) || !Number.isFinite(used)) return 'ไม่มีข้อมูล'
  if (limit > 0) {
    const available = summary.odAvailable
    if (available == null || !Number.isFinite(available)) return 'ไม่มีข้อมูล'
    return `ใช้ไป ${money(used)} · วงเงิน ${money(limit)} · คงเหลือ ${money(available)}`
  }
  return used > 0 ? `ใช้ไป ${money(used)} · ยังไม่ตั้งวงเงิน` : 'ยังไม่ตั้งวงเงิน'
}

function CashProjectionCard({ period }: { period: Payload['cashPeriods'][number] }) {
  const projected = period.projected
  const hasProjection = Number.isFinite(projected)
  const hasCashIn = Number.isFinite(period.cashIn)
  const hasNeed = Number.isFinite(period.need)
  const change = hasCashIn && hasNeed ? roundMoney(period.cashIn - period.need) : undefined
  const danger = hasProjection && projected < 0
  const balanced = hasProjection && projected === 0

  return (
    <article className={`rounded-xl border p-4 ${danger ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-800">{period.label}ข้างหน้า</div>
          <div className="mt-1 text-xs text-slate-500">เงินสดคาดการณ์</div>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${danger ? 'bg-rose-100 text-rose-700' : balanced || !hasProjection ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>{!hasProjection ? 'ไม่มีข้อมูล' : danger ? 'ขาดเงิน' : balanced ? 'สมดุล' : 'คงเหลือบวก'}</span>
      </div>
      <div className={`mt-2 break-words font-mono text-lg font-bold sm:text-xl ${danger ? 'text-rose-700' : 'text-slate-900'}`}>{money(projected)}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200/70 pt-3">
        <div className="min-w-0"><div className="text-xs text-slate-500">คาดรับ</div><div className="mt-1 break-words font-mono text-sm font-bold text-emerald-700">{hasCashIn ? `+${money(period.cashIn)}` : money(period.cashIn)}</div></div>
        <div className="min-w-0"><div className="text-xs text-slate-500">คาดจ่าย</div><div className="mt-1 break-words font-mono text-sm font-bold text-rose-700">{hasNeed ? `-${money(period.need)}` : money(period.need)}</div></div>
      </div>
      <div className={`mt-3 text-xs font-medium ${change != null && change < 0 ? 'text-rose-700' : 'text-slate-600'}`}>เปลี่ยนแปลงสุทธิ {money(change)}</div>
    </article>
  )
}

function MetricRow({ label, note, tone = 'slate', value }: { label: string; note?: string; tone?: KpiCardTone; value: string }) {
  const valueClass = tone === 'red' ? 'text-rose-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0"><div className="text-xs font-semibold text-slate-700">{label}</div>{note ? <div className="mt-0.5 text-xs text-slate-400">{note}</div> : null}</div>
      <div className={`break-words text-right font-mono text-sm font-bold sm:text-base ${valueClass}`}>{value}</div>
    </div>
  )
}

function InsightCard({ href, insight }: { href?: string; insight: Insight }) {
  const styles = insight.type === 'danger'
    ? { badge: 'bg-rose-100 text-rose-700', border: 'border-rose-200 bg-rose-50/40', label: 'ต้องจัดการ' }
    : insight.type === 'warn'
      ? { badge: 'bg-amber-100 text-amber-700', border: 'border-amber-200 bg-amber-50/40', label: 'ควรติดตาม' }
      : { badge: 'bg-slate-100 text-slate-600', border: 'border-slate-200 bg-white', label: 'ปกติ' }
  const value = typeof insight.value === 'number' ? money(insight.value) : insight.value
  const content = (
    <article className={`h-full rounded-xl border p-4 shadow-sm ${styles.border}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-700">{insight.title}</h3>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}>{styles.label}</span>
      </div>
      <div className="mt-1 break-words font-mono text-base font-bold text-slate-900">{value}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{insight.detail}</p>
    </article>
  )
  return href ? <Link className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={href}>{content}</Link> : content
}

function money(value?: number) {
  if (value == null || !Number.isFinite(value)) return 'ไม่มีข้อมูล'
  return value < 0 ? `(${formatMoney(Math.abs(value))})` : formatMoney(value)
}

function percent(value?: number) {
  if (value == null || !Number.isFinite(value)) return 'ไม่มีข้อมูล'
  return `${value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 1 })}%`
}

function displayDate(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function compactMoney(value: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1, notation: 'compact' }).format(value)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function signedTone(value?: number): KpiCardTone {
  return (value ?? 0) > 0 ? 'emerald' : (value ?? 0) < 0 ? 'red' : 'slate'
}
