'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import {
  DualCostingCountRow,
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingHint,
  DualCostingPageSection,
  DualCostingStatCard,
} from './DualCostingPageShell'

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
  const hasActiveFilters = Boolean(search || matchType !== 'all' || costType !== 'all' || poSellTarget !== 'all' || status !== 'all')

  function clearFilters() {
    setCostType('all')
    setMatchType('all')
    setPoSellTarget('all')
    setSearch('')
    setStatus('all')
  }

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="slate">
        <strong>Match Log</strong> เป็น audit trail ของการดึงต้นทุนจาก Cost Pool การย้อนรายการยังคงเป็น read-only shell ตาม design ปัจจุบันและต้องใช้ reverse flow แยกใน batch ถัดไป
      </DualCostingHint>

      <DualCostingErrorBox error={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <DualCostingStatCard label="รวม Matches" value={String(visibleSummary.total)} />
        <DualCostingStatCard label="Sales Match" tone="emerald" value={String(visibleSummary.sales)} />
        <DualCostingStatCard label="Regrade Match" tone="purple" value={String(visibleSummary.regrade)} />
        <DualCostingStatCard label="Active" tone="emerald" value={String(visibleSummary.active)} />
        <DualCostingStatCard label="รวม Qty" value={formatMoney(visibleSummary.totalQty)} />
        <DualCostingStatCard label="รวมมูลค่าต้นทุน" value={formatMoney(visibleSummary.totalCost)} />
      </div>

      <DualCostingFilterCard>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[240px] flex-1 rounded-md"
            placeholder="ค้นหา match id / source / target..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select className="w-auto min-w-[160px]" value={matchType} onChange={(event) => setMatchType(event.target.value)}>
            <option value="all">ทุก Match Type</option>
            {(data?.filters.matchTypes ?? []).map((item) => <option key={item} value={item}>{matchTypeLabel(item)}</option>)}
          </Select>
          <Select className="w-auto min-w-[150px]" value={costType} onChange={(event) => setCostType(event.target.value)}>
            <option value="all">ทุก Cost Type</option>
            {(data?.filters.costTypes ?? []).map((item) => <option key={item} value={item}>{costTypeLabel(item)}</option>)}
          </Select>
          <Select className="w-auto min-w-[180px]" disabled={poSellOptions.length === 0} title="API ยังไม่มี po_sell_id แยก จึงกรองจาก target ที่ส่งมา" value={poSellTarget} onChange={(event) => setPoSellTarget(event.target.value)}>
            <option value="all">ทุก PO Sell</option>
            {poSellOptions.map((target) => <option key={target} value={target}>{target}</option>)}
          </Select>
          <Select className="w-auto min-w-[150px]" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
          </Select>
          {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
          <Button asChild size="sm" variant="export">
            <a href={exportHref}>Export XLSX</a>
          </Button>
        </div>
      </DualCostingFilterCard>

      <DualCostingCountRow countValue={visibleRows.length} />

      <Table className="[&_tbody_tr]:border-slate-100">
        <TableHeader>
          <tr>
            <TableHead>Match Type</TableHead>
            <TableHead>Cost Type</TableHead>
            <TableHead>Match ID</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>Target / Reference</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Source No</TableHead>
            <TableHead>สินค้า</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">฿/หน่วย</TableHead>
            <TableHead className="text-right">มูลค่า</TableHead>
            <TableHead className="text-center">Mode</TableHead>
            <TableHead className="text-center">สถานะ</TableHead>
            <TableHead className="text-right">จัดการ</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={14}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
          {!isLoading && visibleRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={14}>ยังไม่มี Match Log ตามตัวกรอง</TableCell></TableRow> : null}
          {!isLoading && visibleRows.map((row) => (
            <TableRow key={row.id} className={`hover:bg-slate-50 ${row.status === 'reversed' ? 'opacity-50' : ''}`}>
              <TableCell><span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${matchTypeClass(row.matchType)}`}>{matchTypeBadge(row.matchType)}</span></TableCell>
              <TableCell><span className={`rounded-md px-2 py-0.5 text-[10px] ${costTypeClass(row.costType)}`}>{row.costType}</span></TableCell>
              <TableCell className="font-mono text-xs">{row.matchId}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{formatDateDisplay(row.date)}</TableCell>
              <TableCell className="text-xs">{row.target}</TableCell>
              <TableCell><span className={`rounded-md px-2 py-0.5 text-[10px] ${sourceTypeClass(row.sourceType)}`}>{row.sourceType}</span></TableCell>
              <TableCell className="font-mono text-xs">{row.sourceNo}</TableCell>
              <TableCell className="text-xs">{row.product}</TableCell>
              <TableCell className="text-right">{formatMoney(row.qtyUsed)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.unitCost)}</TableCell>
              <TableCell className="text-right font-medium">{formatMoney(row.totalCost)}</TableCell>
              <TableCell className="text-center text-xs">{row.allocationMode}</TableCell>
              <TableCell className="text-center"><span className={`rounded-md px-2 py-0.5 text-[10px] ${row.status === 'reversed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{statusLabel(row.status)}</span></TableCell>
              <TableCell className="text-right">
                {row.status !== 'reversed' ? <button className="text-xs text-red-600 opacity-60" disabled title="Reverse ยังเป็น read-only shell" type="button">Reverse</button> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DualCostingPageSection>
  )
}

function matchTypeLabel(type: string) {
  return type === 'regrade' ? 'Regrade (GA)' : 'Sales (PO Sell)'
}

function matchTypeBadge(type: string) {
  return type === 'regrade' ? 'Regrade' : 'Sales'
}

function matchTypeClass(type: string) {
  return type === 'regrade' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
}

function costTypeLabel(type: string) {
  if (type === 'Production') return 'Production'
  if (type === 'Regrade') return 'Regrade'
  return 'Purchase'
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
  return status === 'reversed' ? 'Reversed' : 'Approved'
}
