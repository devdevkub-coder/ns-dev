'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { formatDateDisplay } from '@/lib/format'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import {
  DualCostingCountRow,
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingPageSection,
  DualCostingPanel,
  DualCostingStatCard,
} from './DualCostingPageShell'

type DealMarginRow = {
  avgCost: number
  channel: string
  customer: string
  date: string
  docNo: string
  id: string
  margin: number
  marginPct: number
  matchedCost: number
  matchedQty: number
  product: string
  sellQty: number
  statusMatch: string
  totalRevenue: number
  unitPrice: number
}

type Payload = {
  filters: { channels: string[] }
  rows: DealMarginRow[]
  summary: { cost: number; fullyMatched: number; margin: number; marginPct: number; none: number; partial: number; revenue: number; rows: number }
  topDeals: DealMarginRow[]
}

export function DealMarginPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [channel, setChannel] = useState('all')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (channel !== 'all') params.set('channel', channel)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [channel, fromDate, toDate])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<Payload>(`/api/dual-costing/deal-margin?${queryString}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Deal Margin ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const exportHref = `/api/dual-costing/deal-margin?${queryString ? `${queryString}&` : ''}format=xlsx`
  const marginPositive = (data?.summary.margin ?? 0) >= 0
  const hasActiveFilters = Boolean(fromDate || toDate || channel !== 'all')

  function clearFilters() {
    setChannel('all')
    setFromDate('')
    setToDate('')
  }

  return (
    <DualCostingPageSection>
      <DualCostingErrorBox error={error} />

      <div className="grid gap-3 md:grid-cols-3">
        <div className={`rounded-xl p-5 text-white shadow ${marginPositive ? 'bg-gradient-to-br from-purple-600 to-pink-700' : 'bg-gradient-to-br from-red-500 to-rose-700'}`}>
          <div className="text-xs opacity-90 font-semibold">Gross Margin (Deal)</div>
          <div className="mt-1 text-4xl font-bold">{formatMoney(data?.summary.margin ?? 0)}</div>
          <div className="mt-2 text-sm opacity-90 font-medium">Margin {(data?.summary.marginPct ?? 0).toFixed(1)}%</div>
          <div className="mt-3 space-y-0.5 text-xs opacity-80 font-mono">
            <div>Revenue: <b>{formatMoney(data?.summary.revenue ?? 0)}</b></div>
            <div>Cost: <b>{formatMoney(data?.summary.cost ?? 0)}</b></div>
            <div className="mt-1">{data?.summary.rows ?? 0} Deals · {data?.summary.fullyMatched ?? 0} Fully Matched</div>
          </div>
        </div>

        <DualCostingPanel title="Top 5 Deal กำไรสูงสุด">
          {(data?.topDeals.length ?? 0) === 0 ? <div className="text-xs text-slate-400 py-4 text-center">ไม่มีข้อมูล</div> : null}
          <div className="space-y-2">
            {(data?.topDeals ?? []).map((row, index) => (
              <div key={row.id} className="text-xs">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="w-4 text-center font-bold text-slate-400">{index + 1}</span>
                  <span className="flex-1 truncate text-slate-700">{row.docNo} · {row.customer}</span>
                  <span className={`w-20 text-right font-bold ${row.margin >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{formatMoney(row.margin)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-gradient-to-r from-purple-400 to-pink-500" style={{ width: `${Math.min(100, Math.max(0, row.margin) / Math.max(data?.topDeals[0]?.margin || 1, 1) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </DualCostingPanel>

        <DualCostingPanel title="สถานะการ Match">
          <MatchStatusDonut
            fully={data?.summary.fullyMatched ?? 0}
            none={data?.summary.none ?? 0}
            partial={data?.summary.partial ?? 0}
            total={data?.summary.rows ?? 0}
          />
        </DualCostingPanel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DualCostingStatCard label="Total Revenue (Deal)" tone="emerald" value={formatMoney(data?.summary.revenue ?? 0)} />
        <DualCostingStatCard label="Total Matched Cost" tone="red" value={formatMoney(data?.summary.cost ?? 0)} />
        <DualCostingStatCard label="Gross Margin (Deal)" tone="purple" value={formatMoney(data?.summary.margin ?? 0)} />
        <DualCostingStatCard label="Margin %" tone={marginPositive ? 'emerald' : 'red'} value={`${(data?.summary.marginPct ?? 0).toFixed(2)}%`} />
      </div>

      <DualCostingFilterCard>
        {/* Desktop View */}
        <div className="hidden lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">วันที่:</span>
            <DatePickerInput id="deal-margin-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="deal-margin-to" value={toDate} onChange={setToDate} />
            <Select className="w-auto min-w-[180px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="all">ทุกช่องทาง</option>
              {(data?.filters.channels ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" className="rounded-lg h-9" onClick={clearFilters}>✕ ล้าง</Button> : null}
            <Button asChild size="sm" variant="export" className="ml-auto rounded-lg h-9 px-3 text-xs font-semibold focus-visible:ring-slate-100">
              <a href={exportHref}>Export XLSX</a>
            </Button>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2">
          <div className="flex gap-2">
            <button
              className={`flex-1 h-10 rounded-md border px-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง
            </button>
            <Button asChild size="sm" variant="export" className="h-10 rounded-md shrink-0">
              <a href={exportHref}>📥 XLSX</a>
            </Button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500 font-semibold">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={fromDate} onChange={setFromDate} />
                </label>
                <label className="text-xs text-slate-500 font-semibold">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={toDate} onChange={setToDate} />
                </label>
              </div>
              <label className="text-xs text-slate-500 font-semibold">
                ช่องทาง
                <Select className="mt-1 w-full h-9 border-slate-300 focus-visible:ring-emerald-100 text-sm" value={channel} onChange={(event) => setChannel(event.target.value)}>
                  <option value="all">ทุกช่องทาง</option>
                  {(data?.filters.channels ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
              {hasActiveFilters && (
                <div className="flex justify-end pt-1">
                  <button
                    className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors focus-visible:outline-none"
                    type="button"
                    onClick={clearFilters}
                  >
                    ล้างตัวกรอง
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </DualCostingFilterCard>

      <DualCostingCountRow countValue={data?.rows.length ?? 0} />

      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <Table className="text-xs">
          <TableHeader className="bg-slate-50 border-b border-slate-200/60 font-semibold text-slate-600">
            <tr>
              <TableHead className="p-3 pl-4">PO Sell</TableHead>
              <TableHead className="p-3">วันที่</TableHead>
              <TableHead className="p-3">Customer</TableHead>
              <TableHead className="p-3">Channel</TableHead>
              <TableHead className="p-3">สินค้า</TableHead>
              <TableHead className="p-3 text-right">Sell Qty</TableHead>
              <TableHead className="p-3 text-right">ราคา</TableHead>
              <TableHead className="p-3 text-right">Revenue</TableHead>
              <TableHead className="p-3 text-right">Matched Qty</TableHead>
              <TableHead className="p-3 text-right">Avg Cost</TableHead>
              <TableHead className="p-3 text-right">Cost</TableHead>
              <TableHead className="p-3 text-right">Margin</TableHead>
              <TableHead className="p-3 text-right">%</TableHead>
              <TableHead className="p-3 pr-4 text-center">Match Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={14}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={14}>ยังไม่มี PO Sell</TableCell></TableRow> : null}
            {!isLoading && (data?.rows ?? []).map((row) => (
              <TableRow key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <TableCell className="p-3 pl-4 font-mono text-slate-700">{row.docNo}</TableCell>
                <TableCell className="p-3 whitespace-nowrap text-slate-600">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="p-3 text-slate-800 font-medium">{row.customer}</TableCell>
                <TableCell className="p-3 text-slate-600">{row.channel}</TableCell>
                <TableCell className="p-3 text-xs text-slate-700">{row.product}</TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.sellQty)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.unitPrice)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-emerald-700 font-semibold">{formatMoney(row.totalRevenue)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.matchedQty)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.avgCost)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-red-600 font-semibold">{formatMoney(row.matchedCost)}</TableCell>
                <TableCell className={`p-3 text-right font-mono font-bold ${row.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.margin)}</TableCell>
                <TableCell className={`p-3 pr-2 text-right font-mono font-semibold ${row.marginPct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{row.marginPct.toFixed(2)}%</TableCell>
                <TableCell className="p-3 pr-4 text-center"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${row.statusMatch === 'Fully' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : row.statusMatch === 'Partial' ? 'bg-amber-50 text-amber-700 border border-amber-200/50' : 'bg-slate-100 text-slate-600 border border-slate-200/50'}`}>{row.statusMatch}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && (data?.rows.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm">ยังไม่มี PO Sell</div>
        ) : null}
        {!isLoading && (data?.rows ?? []).map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-mono text-xs font-bold text-slate-800">{row.docNo}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatDateDisplay(row.date)}</div>
              </div>
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${row.statusMatch === 'Fully' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : row.statusMatch === 'Partial' ? 'bg-amber-50 text-amber-700 border border-amber-200/50' : 'bg-slate-100 text-slate-600 border border-slate-200/50'}`}>{row.statusMatch}</span>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">{row.customer}</div>
              <div className="text-xs text-slate-600 mt-0.5">{row.product}</div>
              <div className="text-xs text-slate-500 mt-1">ช่องทาง: <span className="font-semibold">{row.channel}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">Sell Qty / ราคา</span>
                <span className="font-mono text-slate-700">{formatMoney(row.sellQty)} / {formatMoney(row.unitPrice)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Revenue</span>
                <span className="font-mono text-emerald-700 font-semibold">{formatMoney(row.totalRevenue)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Matched Qty / Avg Cost</span>
                <span className="font-mono text-slate-700">{formatMoney(row.matchedQty)} / {formatMoney(row.avgCost)}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Cost</span>
                <span className="font-mono text-red-600 font-semibold">{formatMoney(row.matchedCost)}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="text-slate-500">Margin (%)</span>
              <span className={`font-mono font-bold ${row.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.margin)} ({row.marginPct.toFixed(2)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </DualCostingPageSection>
  )
}

function MatchStatusDonut({ fully, none, partial, total }: { fully: number; none: number; partial: number; total: number }) {
  const circumference = 440
  const fullyArc = total > 0 ? (fully / total) * circumference : 0
  const partialArc = total > 0 ? (partial / total) * circumference : 0
  const noneArc = total > 0 ? (none / total) * circumference : 0
  const fullyPct = total > 0 ? (fully / total) * 100 : 0

  return (
    <>
      <svg aria-label="Match status distribution" className="mx-auto block h-[140px] w-[140px]" role="img" viewBox="0 0 200 200">
        {total > 0 ? (
          <>
            <circle cx="100" cy="100" r="70" fill="none" stroke="#10b981" strokeDasharray={`${fullyArc} ${circumference}`} strokeWidth="40" transform="rotate(-90 100 100)" />
            <circle cx="100" cy="100" r="70" fill="none" stroke="#f59e0b" strokeDasharray={`${partialArc} ${circumference}`} strokeDashoffset={-fullyArc} strokeWidth="40" transform="rotate(-90 100 100)" />
            <circle cx="100" cy="100" r="70" fill="none" stroke="#94a3b8" strokeDasharray={`${noneArc} ${circumference}`} strokeDashoffset={-(fullyArc + partialArc)} strokeWidth="40" transform="rotate(-90 100 100)" />
          </>
        ) : null}
        <text x="100" y="95" fill="#64748b" fontSize="12" textAnchor="middle">{total} Deals</text>
        <text x="100" y="115" fill="#0f172a" fontSize="14" fontWeight="bold" textAnchor="middle">{fullyPct.toFixed(0)}%</text>
      </svg>
      <div className="mt-1 flex justify-center gap-2 text-xs">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-emerald-500" />Fully</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-amber-500" />Partial</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md bg-slate-400" />None</span>
      </div>
    </>
  )
}
