'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type MatchLogRow = {
  allocationMode: string
  costType: string
  date: string
  id: string
  matchId: string
  matchType: string
  product: string
  qtyUsed: number
  sourceNo: string
  sourceType: string
  status: string
  target: string
  totalCost: number
  unitCost: number
}

type Payload = {
  filters: { costTypes: string[]; matchTypes: string[]; statuses: string[] }
  rows: MatchLogRow[]
  summary: { active: number; reversed: number; sales: number; total: number; totalCost: number; totalQty: number }
}

export function MatchLogPageClient() {
  const [costType, setCostType] = useState('all')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [matchType, setMatchType] = useState('all')
  const [poSellTarget, setPoSellTarget] = useState('all')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (costType !== 'all') params.set('costType', costType)
    if (matchType !== 'all') params.set('matchType', matchType)
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    return params.toString()
  }, [costType, matchType, search, status])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>(`/api/dual-costing/match-log?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Match Log ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const poSellOptions = useMemo(() => {
    const targets = (data?.rows ?? []).map((row) => row.target).filter((target) => target && target !== '-')
    return Array.from(new Set(targets)).sort((left, right) => left.localeCompare(right, 'th'))
  }, [data?.rows])

  useEffect(() => {
    if (poSellTarget !== 'all' && !poSellOptions.includes(poSellTarget)) setPoSellTarget('all')
  }, [poSellOptions, poSellTarget])

  const visibleRows = useMemo(() => {
    const rows = data?.rows ?? []
    if (poSellTarget === 'all') return rows
    return rows.filter((row) => row.target === poSellTarget)
  }, [data?.rows, poSellTarget])

  const visibleSummary = useMemo(() => {
    const activeRows = visibleRows.filter((row) => row.status !== 'reversed')
    return {
      active: activeRows.length,
      regrade: visibleRows.filter((row) => row.matchType === 'regrade').length,
      sales: visibleRows.filter((row) => row.matchType === 'sales').length,
      total: visibleRows.length,
      totalCost: activeRows.reduce((sum, row) => sum + row.totalCost, 0),
      totalQty: activeRows.reduce((sum, row) => sum + row.qtyUsed, 0),
    }
  }, [visibleRows])

  const exportHref = `/api/dual-costing/match-log?${queryString ? `${queryString}&` : ''}format=xlsx`

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
        <strong>📋 Match Log</strong> - บันทึกการตัดต้นทุนจาก Cost Pool ห้ามลบ - ใช้ Reverse แทน<br />
        <span className="text-xs">Reverse shell เป็น read-only ใน Next batch นี้; ยังไม่คืนต้นทุนหรือ mutation จริงจนกว่า allocation log/reverse design จะอนุมัติ</span>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Metric label="รวม Matches" value={String(visibleSummary.total)} />
        <Metric label="📤 Sales Match" tone="emerald" value={String(visibleSummary.sales)} />
        <Metric label="🔀 Regrade Match" tone="purple" value={String(visibleSummary.regrade)} />
        <Metric label="Active" tone="emerald" value={String(visibleSummary.active)} />
        <Metric label="รวม Qty" value={formatMoney(visibleSummary.totalQty)} />
        <Metric label="รวมมูลค่าต้นทุน" value={formatMoney(visibleSummary.totalCost)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="w-64 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหา match_id / source / GA..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="rounded-md border bg-amber-50 px-3 py-2 text-sm font-medium" value={matchType} onChange={(event) => setMatchType(event.target.value)}>
          <option value="all">ทุก Match Type</option>
          {(data?.filters.matchTypes ?? []).map((item) => <option key={item} value={item}>{matchTypeLabel(item)}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={costType} onChange={(event) => setCostType(event.target.value)}>
          <option value="all">ทุก Cost Type</option>
          {(data?.filters.costTypes ?? []).map((item) => <option key={item} value={item}>{costTypeLabel(item)}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" disabled={poSellOptions.length === 0} title="API ยังไม่มี po_sell_id แยก จึงกรองจาก Target / Reference ที่ส่งมา" value={poSellTarget} onChange={(event) => setPoSellTarget(event.target.value)}>
          <option value="all">ทุก PO Sell</option>
          {poSellOptions.map((target) => <option key={target} value={target}>{target}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">ทุกสถานะ</option>
          {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
        </select>
        <a className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
      </div>

      <div className="overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Match Type</th><th className="p-2 text-left">Cost Type</th><th className="p-2 text-left">Match ID</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">Target / Reference</th><th className="p-2 text-left">Source</th><th className="p-2 text-left">Source No</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">฿/หน่วย</th><th className="p-2 text-right">มูลค่า</th><th className="p-2 text-center">Mode</th><th className="p-2 text-center">สถานะ</th><th className="p-2 text-right"></th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="py-8 text-center text-slate-500" colSpan={14}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && visibleRows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={14}>ยังไม่มี Match Log ตามตัวกรอง</td></tr> : null}
            {!isLoading && visibleRows.map((row) => (
              <tr key={row.id} className={`border-t ${row.status === 'reversed' ? 'opacity-50' : ''}`}>
                <td className="p-2"><span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${matchTypeClass(row.matchType)}`}>{matchTypeBadge(row.matchType)}</span></td>
                <td className="p-2"><span className={`rounded-md px-2 py-0.5 text-[10px] ${costTypeClass(row.costType)}`}>{row.costType}</span></td>
                <td className="p-2 font-mono text-xs">{row.matchId}</td>
                <td className="p-2 text-xs">{row.date}</td>
                <td className="p-2 text-xs">{row.target}</td>
                <td className="p-2"><span className={`rounded-md px-2 py-0.5 text-[10px] ${sourceTypeClass(row.sourceType)}`}>{row.sourceType}</span></td>
                <td className="p-2 font-mono text-xs">{row.sourceNo}</td>
                <td className="p-2 text-xs">{row.product}</td>
                <td className="p-2 text-right">{formatMoney(row.qtyUsed)}</td>
                <td className="p-2 text-right">{formatMoney(row.unitCost)}</td>
                <td className="p-2 text-right font-medium">{formatMoney(row.totalCost)}</td>
                <td className="p-2 text-center text-xs">{row.allocationMode}</td>
                <td className="p-2 text-center"><span className={`rounded-md px-2 py-0.5 text-[10px] ${row.status === 'reversed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.status}</span></td>
                <td className="p-2 text-right">
                  {row.status !== 'reversed' ? (
                    <button className="text-xs text-red-600 opacity-60" disabled title="Reverse ยังเป็น read-only shell และไม่ทำ mutation" type="button">Reverse</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, tone = 'normal', value }: { label: string; tone?: 'emerald' | 'normal' | 'purple'; value: string }) {
  const classes = {
    emerald: 'bg-emerald-50 text-emerald-700',
    normal: 'bg-white text-slate-900',
    purple: 'bg-purple-50 text-purple-700',
  }[tone]
  return <div className={`rounded-md p-3 shadow ${classes}`}><div className="text-[10px] opacity-70">{label}</div><div className="text-xl font-bold">{value}</div></div>
}

function matchTypeLabel(type: string) {
  return type === 'regrade' ? '🔀 Regrade (GA)' : '📤 Sales (PO Sell)'
}

function matchTypeBadge(type: string) {
  return type === 'regrade' ? '🔀 Regrade' : '📤 Sales'
}

function matchTypeClass(type: string) {
  return type === 'regrade' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
}

function costTypeLabel(type: string) {
  if (type === 'Production') return '🏭 Production'
  if (type === 'Regrade') return '🔀 Regrade'
  return '📥 Purchase'
}

function costTypeClass(type: string) {
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}

function sourceTypeClass(type: string) {
  if (type === 'PO_Buy') return 'bg-cyan-100 text-cyan-700'
  if (type === 'Spot_Buy') return 'bg-blue-100 text-blue-700'
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade') return 'bg-purple-100 text-purple-700'
  if (type === 'Trading_Deal') return 'bg-fuchsia-100 text-fuchsia-700'
  return 'bg-slate-200 text-slate-700'
}

function statusLabel(status: string) {
  return status === 'reversed' ? '↶ Reversed' : '✓ Approved'
}
