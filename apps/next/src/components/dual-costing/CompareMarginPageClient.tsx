'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import {
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingHint,
  DualCostingPageSection,
  DualCostingPanel,
  DualCostingStatCard,
} from './DualCostingPageShell'

type Totals = {
  cost: number
  margin: number
  marginPct: number
  revenue: number
  rows: number
}

type Payload = {
  dealTotals: Totals
  diff: { cost: number; margin: number; revenue: number }
  notes: string[]
  stockTotals: Totals
}

export function CompareMarginPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [toDate, setToDate] = useState('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [fromDate, toDate])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<Payload>(`/api/dual-costing/compare-margin?${queryString}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Compare Margin ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const hasActiveFilters = Boolean(fromDate || toDate)

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="blue">
        เปรียบเทียบ <strong>Deal Margin</strong> จาก matched deals กับ <strong>Stock Margin</strong> จากบิลขายจริงและ WAC เพื่อดูความต่างเชิงบริหาร ไม่ใช่งบทางการ
      </DualCostingHint>

      <DualCostingErrorBox error={error} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MarginCard label="Deal Cost (จากการจองดีล)" tone="deal" totals={data?.dealTotals} />
        <MarginCard label="Stock Cost (จากบิลขายจริง + WAC)" tone="stock" totals={data?.stockTotals} />
      </div>

      <DualCostingPanel title="ส่วนต่าง Deal vs Stock">
        <div className="grid grid-cols-1 gap-3 text-center md:grid-cols-3">
          <DiffCard goodWhenPositive label="Revenue Diff" value={data?.diff.revenue ?? 0} />
          <DiffCard label="Cost Diff" value={data?.diff.cost ?? 0} />
          <DiffCard goodWhenPositive label="Margin Diff (จริง - คาดการณ์)" prominent value={data?.diff.margin ?? 0} />
        </div>
        <div className="mt-4 text-xs text-slate-500">
          Margin Diff อาจมาจากต้นทุนจริงต่างจาก match, รับของบางส่วน, grade adjust, production loss, WAC เปลี่ยน หรือ FX/Hedge PnL
        </div>
      </DualCostingPanel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DualCostingStatCard label="Deal Revenue" tone="purple" value={formatMoney(data?.dealTotals.revenue ?? 0)} />
        <DualCostingStatCard label="Stock Revenue" tone="emerald" value={formatMoney(data?.stockTotals.revenue ?? 0)} />
        <DualCostingStatCard label="Deal Rows" value={String(data?.dealTotals.rows ?? 0)} />
        <DualCostingStatCard label="Sales Bill Rows" value={String(data?.stockTotals.rows ?? 0)} />
      </div>

      <DualCostingFilterCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">วันที่:</span>
            <DatePickerInput id="compare-margin-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="compare-margin-to" value={toDate} onChange={setToDate} />
            {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" onClick={() => { setFromDate(''); setToDate('') }}>✕ ล้าง</Button> : null}
          </div>
          <div className="text-xs text-slate-500">ช่วงวันที่มีผลกับทั้ง deal และ sales bill comparison</div>
        </div>
      </DualCostingFilterCard>

      {isLoading ? <div className="rounded-md bg-white p-4 text-sm text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}

      {(data?.notes.length ?? 0) > 0 ? (
        <DualCostingPanel title="หมายเหตุข้อมูล">
          <ul className="space-y-1 text-sm text-slate-600">
            {(data?.notes ?? []).map((note) => <li key={note}>• {note}</li>)}
          </ul>
        </DualCostingPanel>
      ) : null}
    </DualCostingPageSection>
  )
}

function MarginCard({ label, tone, totals }: { label: string; tone: 'deal' | 'stock'; totals?: Totals }) {
  const classes = tone === 'deal' ? 'from-purple-600 to-pink-700' : 'from-emerald-600 to-teal-700'
  return (
    <div className={`rounded-md bg-gradient-to-br ${classes} p-6 text-white shadow`}>
      <div className="mb-2 text-sm opacity-80">{label}</div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span>{tone === 'deal' ? 'Total Revenue (PO Sell)' : 'Total Revenue (Sales Bills)'}</span><span className="font-bold">{formatMoney(totals?.revenue ?? 0)}</span></div>
        <div className="flex justify-between"><span>{tone === 'deal' ? 'Total Matched Cost' : 'Total COGS (จาก WAC)'}</span><span className="font-bold">{formatMoney(totals?.cost ?? 0)}</span></div>
        <div className="flex justify-between border-t border-white/30 pt-2 text-lg"><span className="font-semibold">{tone === 'deal' ? 'Gross Margin' : 'Gross Profit'}</span><span className="font-bold">{formatMoney(totals?.margin ?? 0)}</span></div>
        <div className="flex justify-between"><span>{tone === 'deal' ? 'Margin %' : 'GP %'}</span><span className="font-bold">{(totals?.marginPct ?? 0).toFixed(2)}%</span></div>
      </div>
    </div>
  )
}

function DiffCard({ goodWhenPositive = false, label, prominent = false, value }: { goodWhenPositive?: boolean; label: string; prominent?: boolean; value: number }) {
  const good = goodWhenPositive ? value >= 0 : value <= 0
  return <div className="rounded-md bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className={`${prominent ? 'text-2xl' : 'text-xl'} font-bold ${good ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(value)}</div></div>
}
