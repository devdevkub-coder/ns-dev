'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
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
  DualCostingPanel,
  DualCostingStatCard,
} from './DualCostingPageShell'

type Mode = 'ledger' | 'report' | 'waiting'

type WaitingRow = {
  allocatedQty: number
  allocationStatus: string
  branchName: string
  customerName: string
  date: string
  docNo: string
  id: string
  metalGroup: string
  productName: string
  qty: number
  remainingQty: number
  revenuePending: number
  unitPrice: number
}

type LedgerRow = {
  allocatedAt: string
  allocatedBy: string
  allocatedQty: number
  allocatedRevenue: number
  costPerKg: number
  costPoolNo: string
  date: string
  gpPct: number
  grossProfit: number
  id: string
  matchId: string
  productCategory: string
  productName: string
  saleDocNo: string
  saleQty: number
  sourceNo: string
  status: string
  targetType: string
  totalCost: number
}

type WaitingPayload = {
  filters: { categories: string[]; statuses: string[] }
  rows: WaitingRow[]
  summary: { byCategory: { count: number; name: string; qty: number; revenue: number }[]; count: number; fullyPending: number; partial: number; totalQty: number; totalRevenue: number }
}

type LedgerPayload = {
  filters: { categories: string[]; statuses: string[]; targetTypes: string[] }
  rows: LedgerRow[]
  summary: { active: number; cost: number; gp: number; gpPct: number; poCount: number; revenue: number; reversed: number; rows: number; spotCount: number; totalQty: number }
}

type ReportPayload = {
  report: {
    byCategory: { allocatedQty: number; category: string; cost: number; gp: number; gpPct: number; pendingQty: number; pendingRevenue: number; revenue: number; rows: number }[]
    po: ReportMetric
    spotAllocated: ReportMetric
    total: ReportMetric
    waiting: { count: number; qty: number; revenue: number }
  }
}

type ReportMetric = { cost: number; count: number; gp: number; gpPct: number; qty: number; revenue: number }

export function DualCostingManagementPageClient({ mode }: { mode: Mode }) {
  if (mode === 'waiting') return <WaitingAllocationsView />
  if (mode === 'ledger') return <AllocationLedgerView />
  return <DualCostingReportView />
}

function WaitingAllocationsView() {
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<WaitingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    return params.toString()
  }, [category, search, status])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<WaitingPayload>(`/api/dual-costing/waiting-allocations?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Waiting Allocations ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => { void loadData() }, [loadData])

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="amber">
        Waiting Allocation Queue ใช้ติดตามยอดขายที่ยังไม่ได้ allocate ต้นทุนจาก Cost Pool เพื่อการบริหารเท่านั้น และยังไม่ใช่ตัวเลขปิดงบ
      </DualCostingHint>
      <DualCostingErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <DualCostingStatCard label="รวมรายการรอ" tone="amber" value={String(data?.summary.count ?? 0)} />
        <DualCostingStatCard label="ยังไม่เริ่ม allocate" tone="red" value={String(data?.summary.fullyPending ?? 0)} />
        <DualCostingStatCard label="บางส่วน" tone="amber" value={String(data?.summary.partial ?? 0)} />
        <DualCostingStatCard label="น้ำหนักรอ allocate" tone="blue" value={`${formatMoney(data?.summary.totalQty ?? 0)} กก.`} />
        <DualCostingStatCard label="มูลค่าขายรอ Match" tone="emerald" value={formatMoney(data?.summary.totalRevenue ?? 0)} />
      </div>

      <DualCostingPanel title="สรุปตามหมวด">
        <Table>
          <TableHeader>
            <tr>
              <TableHead>หมวด</TableHead>
              <TableHead className="text-right">รายการ</TableHead>
              <TableHead className="text-right">น้ำหนักรอ</TableHead>
              <TableHead className="text-right">มูลค่ารอ</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {(data?.summary.byCategory ?? []).map((row) => <TableRow key={row.name}><TableCell><span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{row.name}</span></TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right font-bold">{formatMoney(row.qty)} กก.</TableCell><TableCell className="text-right font-bold text-emerald-700">{formatMoney(row.revenue)}</TableCell></TableRow>)}
            {!isLoading && (data?.summary.byCategory.length ?? 0) === 0 ? <TableRow><TableCell className="py-6 text-center text-slate-400" colSpan={4}>ไม่มีรายการรอ allocate ตามตัวกรอง</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </DualCostingPanel>

      <DualCostingFilterCard>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-[240px] flex-1 rounded-md" placeholder="ค้นหา doc no / สินค้า / ลูกค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select className="w-auto min-w-[160px]" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option>{(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <Select className="w-auto min-w-[160px]" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
        </div>
      </DualCostingFilterCard>

      <DualCostingCountRow countValue={data?.rows.length ?? 0} />

      <Table>
        <TableHeader>
          <tr>
            <TableHead>บิลขาย</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead>สินค้า</TableHead>
            <TableHead className="text-center">หมวด</TableHead>
            <TableHead className="text-right">ขาย (กก.)</TableHead>
            <TableHead className="text-right">Allocate แล้ว</TableHead>
            <TableHead className="text-right">ค้าง (กก.)</TableHead>
            <TableHead className="text-right">ราคา/กก.</TableHead>
            <TableHead className="text-right">มูลค่ารอ</TableHead>
            <TableHead className="text-center">สถานะ</TableHead>
            <TableHead className="text-center">Action</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell className="py-8 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
          {!isLoading && (data?.rows.length ?? 0) === 0 ? <TableRow><TableCell className="py-8 text-center text-emerald-700" colSpan={12}>ไม่มีรายการค้าง allocate ตามตัวกรอง</TableCell></TableRow> : null}
          {(data?.rows ?? []).map((row) => <TableRow key={row.id} className="hover:bg-amber-50/30"><TableCell className="font-mono">{row.docNo}</TableCell><TableCell>{formatDateDisplay(row.date)}</TableCell><TableCell>{row.customerName}</TableCell><TableCell>{row.productName}</TableCell><TableCell className="text-center"><span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{row.metalGroup}</span></TableCell><TableCell className="text-right">{formatMoney(row.qty)}</TableCell><TableCell className="text-right text-emerald-700">{formatMoney(row.allocatedQty)}</TableCell><TableCell className="text-right font-bold text-amber-700">{formatMoney(row.remainingQty)}</TableCell><TableCell className="text-right">{formatMoney(row.unitPrice)}</TableCell><TableCell className="text-right text-emerald-700">{formatMoney(row.revenuePending)}</TableCell><TableCell className="text-center"><StatusPill status={row.allocationStatus} /></TableCell><TableCell className="text-center"><Button disabled size="xs" type="button">Allocate</Button></TableCell></TableRow>)}
        </TableBody>
      </Table>
    </DualCostingPageSection>
  )
}

function AllocationLedgerView() {
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<LedgerPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('approved')
  const [targetType, setTargetType] = useState('all')
  const [toDate, setToDate] = useState('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (fromDate) params.set('from', fromDate)
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (targetType !== 'all') params.set('targetType', targetType)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [category, fromDate, search, status, targetType, toDate])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<LedgerPayload>(`/api/dual-costing/cost-allocation-ledger?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Allocation Ledger ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => { void loadData() }, [loadData])

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="indigo">
        Cost Allocation Ledger เป็น audit trail ของการ allocate ต้นทุนจริงต่อดีล ใช้ตรวจสอบย้อนกลับได้ แต่ reverse/write flow ยังปิดไว้
      </DualCostingHint>
      <DualCostingErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DualCostingStatCard label="รวม Allocations" value={String(data?.summary.active ?? 0)}><span className="text-xs text-slate-400">PO {data?.summary.poCount ?? 0} · Spot {data?.summary.spotCount ?? 0}</span></DualCostingStatCard>
        <DualCostingStatCard label="น้ำหนัก allocate" tone="blue" value={`${formatMoney(data?.summary.totalQty ?? 0)} กก.`} />
        <DualCostingStatCard label="ต้นทุนรวม" tone="red" value={formatMoney(data?.summary.cost ?? 0)} />
        <DualCostingStatCard label="กำไรรวม (Deal Cost)" tone={(data?.summary.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(data?.summary.gp ?? 0)} />
      </div>

      <DualCostingFilterCard>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-[240px] flex-1 rounded-md" placeholder="ค้นหา match id / doc / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <span className="text-xs text-slate-500">วันที่:</span>
          <DatePickerInput id="allocation-ledger-from" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput id="allocation-ledger-to" value={toDate} onChange={setToDate} />
          <Select className="w-auto min-w-[150px]" value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="all">ทุก target</option>{(data?.filters.targetTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <Select className="w-auto min-w-[150px]" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <Select className="w-auto min-w-[150px]" value={status} onChange={(event) => setStatus(event.target.value)}><option value="approved">Approved</option><option value="reversed">Reversed</option><option value="all">ทั้งหมด</option></Select>
          <Button disabled size="sm" type="button" variant="export">Export CSV</Button>
        </div>
      </DualCostingFilterCard>

      <DualCostingCountRow countValue={data?.rows.length ?? 0} />

      <Table>
        <TableHeader>
          <tr>
            <TableHead>Match ID</TableHead>
            <TableHead className="text-center">Type</TableHead>
            <TableHead>Sale Doc</TableHead>
            <TableHead>สินค้า</TableHead>
            <TableHead className="text-center">หมวด</TableHead>
            <TableHead className="text-right">Sale Qty</TableHead>
            <TableHead className="text-right">Allocated</TableHead>
            <TableHead>Cost Pool</TableHead>
            <TableHead className="text-right">฿/กก.</TableHead>
            <TableHead className="text-right">Total Cost</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">GP</TableHead>
            <TableHead className="text-right">GP%</TableHead>
            <TableHead>By</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell className="py-8 text-center text-slate-500" colSpan={15}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
          {!isLoading && (data?.rows.length ?? 0) === 0 ? <TableRow><TableCell className="py-8 text-center text-slate-500" colSpan={15}>ไม่มี allocation log ตรงกับ filter</TableCell></TableRow> : null}
          {(data?.rows ?? []).map((row) => <TableRow key={row.id} className={`hover:bg-indigo-50/30 ${row.status === 'reversed' ? 'opacity-50' : ''}`}><TableCell className="font-mono text-xs">{row.matchId}</TableCell><TableCell className="text-center"><TargetPill type={row.targetType} /></TableCell><TableCell className="font-mono text-xs">{row.saleDocNo}</TableCell><TableCell className="text-xs">{row.productName}</TableCell><TableCell className="text-center"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px]">{row.productCategory}</span></TableCell><TableCell className="text-right">{formatMoney(row.saleQty)}</TableCell><TableCell className="text-right font-medium text-blue-700">{formatMoney(row.allocatedQty)}</TableCell><TableCell className="font-mono text-xs">{row.costPoolNo}</TableCell><TableCell className="text-right">{formatMoney(row.costPerKg)}</TableCell><TableCell className="text-right text-red-700">{formatMoney(row.totalCost)}</TableCell><TableCell className="text-right text-emerald-700">{formatMoney(row.allocatedRevenue)}</TableCell><TableCell className={`text-right font-bold ${row.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.grossProfit)}</TableCell><TableCell className="text-right text-xs">{row.gpPct.toFixed(2)}%</TableCell><TableCell className="text-xs">{row.allocatedBy}</TableCell><TableCell className="text-center"><span className={`rounded-md px-2 py-0.5 text-[10px] ${row.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{row.status}</span></TableCell></TableRow>)}
        </TableBody>
      </Table>
    </DualCostingPageSection>
  )
}

function DualCostingReportView() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadData() {
      setError(null)
      setIsLoading(true)
      try {
        const payload = await dailyFetchJson<ReportPayload>('/api/dual-costing/report')
        if (mounted) setData(payload)
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : 'โหลด Dual Costing Report ไม่ได้')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadData()
    return () => { mounted = false }
  }, [])

  const report = data?.report

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="emerald">
        รายงานนี้ใช้ Deal Cost เพื่อให้ผู้บริหารดูกำไรต่อดีล/ลอตที่ allocate เท่านั้น ไม่ใช้ปิดงบ และ P&L ยังใช้ WAC ตามหลักบัญชี
      </DualCostingHint>
      <DualCostingErrorBox error={error} />
      {isLoading ? <div className="rounded-md bg-white p-6 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      <div className="grid grid-cols-2 gap-3 rounded-md bg-gradient-to-r from-emerald-500 to-blue-500 p-4 text-white shadow md:grid-cols-4">
        <HeroMetric label="Total Revenue (Allocated)" value={formatMoney((report?.po.revenue ?? 0) + (report?.spotAllocated.revenue ?? 0))} />
        <HeroMetric label="Total Cost (Deal Cost)" value={formatMoney(report?.total.cost ?? 0)} />
        <HeroMetric label="Gross Profit" value={formatMoney(report?.total.gp ?? 0)} />
        <HeroMetric label="GP%" value={`${(report?.total.gpPct ?? 0).toFixed(2)}%`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard metric={report?.po} title="ขายผ่าน PO Sell" />
        <ReportCard metric={report?.spotAllocated} title="ขาย Spot Sell (Allocated)" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <DualCostingStatCard label="รายการค้าง" tone="amber" value={String(report?.waiting.count ?? 0)} />
        <DualCostingStatCard label="น้ำหนักค้าง" tone="amber" value={`${formatMoney(report?.waiting.qty ?? 0)} กก.`} />
        <DualCostingStatCard label="มูลค่าขายค้าง" tone="emerald" value={formatMoney(report?.waiting.revenue ?? 0)} />
      </div>
      <DualCostingPanel title="สรุปตามหมวดสินค้า">
        <Table>
          <TableHeader>
            <tr>
              <TableHead>หมวด</TableHead>
              <TableHead className="text-right">Allocated Qty</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">GP</TableHead>
              <TableHead className="text-right">GP%</TableHead>
              <TableHead className="text-right">Pending Qty</TableHead>
              <TableHead className="text-right">Pending Revenue</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {(report?.byCategory ?? []).map((row) => <TableRow key={row.category}><TableCell><span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{row.category}</span></TableCell><TableCell className="text-right">{formatMoney(row.allocatedQty)}</TableCell><TableCell className="text-right text-blue-700">{formatMoney(row.revenue)}</TableCell><TableCell className="text-right text-red-700">{formatMoney(row.cost)}</TableCell><TableCell className={`text-right font-bold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.gp)}</TableCell><TableCell className="text-right">{row.gpPct.toFixed(2)}%</TableCell><TableCell className="text-right text-amber-700">{formatMoney(row.pendingQty)}</TableCell><TableCell className="text-right text-amber-700">{formatMoney(row.pendingRevenue)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </DualCostingPanel>
    </DualCostingPageSection>
  )
}

function StatusPill({ status }: { status: string }) {
  return status === 'pending_allocation'
    ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">pending</span>
    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">partial</span>
}

function TargetPill({ type }: { type: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-[10px] ${type === 'PO_SELL' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{type === 'PO_SELL' ? 'PO' : 'Spot'}</span>
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-white/80">{label}</div><div className="mt-1 text-lg font-bold">{value}</div></div>
}

function ReportCard({ metric, title }: { metric?: ReportMetric; title: string }) {
  return (
    <DualCostingPanel title={title}>
      <div className="grid grid-cols-2 gap-3">
        <DualCostingStatCard label="จำนวนรายการ" value={String(metric?.count ?? 0)} />
        <DualCostingStatCard label="น้ำหนัก" tone="blue" value={formatMoney(metric?.qty ?? 0)} />
        <DualCostingStatCard label="Revenue" tone="emerald" value={formatMoney(metric?.revenue ?? 0)} />
        <DualCostingStatCard label="Cost" tone="red" value={formatMoney(metric?.cost ?? 0)} />
        <DualCostingStatCard label="GP" tone={(metric?.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(metric?.gp ?? 0)} />
        <DualCostingStatCard label="GP%" value={`${(metric?.gpPct ?? 0).toFixed(2)}%`} />
      </div>
    </DualCostingPanel>
  )
}
