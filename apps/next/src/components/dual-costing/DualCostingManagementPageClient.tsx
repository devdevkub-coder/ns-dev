'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

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
    <section className="space-y-4">
      <InfoBand tone="amber" title="⏳ Waiting Allocation Queue — Dual Costing (Management View)">
        รายการขายทองแดง/ทองเหลืองที่ยังไม่ได้ allocate ต้นทุนจาก Cost Pool เป็นหน้าติดตามเพื่อผู้บริหารเท่านั้น P&L ยังใช้ WAC เสมอ และปุ่ม Allocate ยังปิดไว้จนกว่า allocation write/reverse design จะอนุมัติ
      </InfoBand>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="รวมรายการรอ" tone="amber" value={String(data?.summary.count ?? 0)} />
        <Metric label="ยังไม่เริ่ม allocate" tone="red" value={String(data?.summary.fullyPending ?? 0)} />
        <Metric label="บางส่วน" tone="amber" value={String(data?.summary.partial ?? 0)} />
        <Metric label="น้ำหนักรอ allocate" tone="blue" value={`${formatMoney(data?.summary.totalQty ?? 0)} กก.`} />
        <Metric label="มูลค่าขายรอ Match" tone="emerald" value={formatMoney(data?.summary.totalRevenue ?? 0)} />
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <h3 className="mb-2 font-semibold">สรุปตามหมวด</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">หมวด</th><th className="p-2 text-right">รายการ</th><th className="p-2 text-right">น้ำหนักรอ</th><th className="p-2 text-right">มูลค่ารอ</th></tr></thead>
            <tbody>
              {(data?.summary.byCategory ?? []).map((row) => <tr key={row.name} className="border-t"><td className="p-2"><span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{row.name}</span></td><td className="p-2 text-right">{row.count}</td><td className="p-2 text-right font-bold">{formatMoney(row.qty)} กก.</td><td className="p-2 text-right font-bold text-emerald-700">{formatMoney(row.revenue)}</td></tr>)}
              {!isLoading && (data?.summary.byCategory.length ?? 0) === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={4}>ไม่มีรายการรอ allocate ตามตัวกรอง</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="min-w-64 rounded-lg border px-3 py-2 text-sm" placeholder="ค้นหา doc no / สินค้า / ลูกค้า..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={status} onChange={setStatus}><option value="all">ทุกสถานะ</option>{(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <Select value={category} onChange={setCategory}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <span className="text-sm text-slate-500">พบ {data?.rows.length ?? 0} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">บิลขาย</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">ลูกค้า</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-center">หมวด</th><th className="p-2 text-right">ขาย (กก.)</th><th className="p-2 text-right">Allocate แล้ว</th><th className="p-2 text-right">ค้าง (กก.)</th><th className="p-2 text-right">ราคา/กก.</th><th className="p-2 text-right">มูลค่ารอ</th><th className="p-2 text-center">สถานะ</th><th className="p-2 text-center">Action</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td className="py-8 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && (data?.rows.length ?? 0) === 0 ? <tr><td className="py-8 text-center text-emerald-700" colSpan={12}>✓ ไม่มีรายการที่ค้าง allocate ตามตัวกรอง</td></tr> : null}
              {(data?.rows ?? []).map((row) => <tr key={row.id} className="border-t hover:bg-amber-50/30"><td className="p-2 font-mono">{row.docNo}</td><td className="p-2">{row.date}</td><td className="p-2">{row.customerName}</td><td className="p-2">{row.productName}</td><td className="p-2 text-center"><span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{row.metalGroup}</span></td><td className="p-2 text-right">{formatMoney(row.qty)}</td><td className="p-2 text-right text-emerald-700">{formatMoney(row.allocatedQty)}</td><td className="p-2 text-right font-bold text-amber-700">{formatMoney(row.remainingQty)}</td><td className="p-2 text-right">{formatMoney(row.unitPrice)}</td><td className="p-2 text-right text-emerald-700">{formatMoney(row.revenuePending)}</td><td className="p-2 text-center"><StatusPill status={row.allocationStatus} /></td><td className="p-2 text-center"><button className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white opacity-60" disabled type="button">🎯 Allocate</button></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function AllocationLedgerView() {
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<LedgerPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('approved')
  const [targetType, setTargetType] = useState('all')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (targetType !== 'all') params.set('targetType', targetType)
    return params.toString()
  }, [category, search, status, targetType])

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
    <section className="space-y-4">
      <InfoBand tone="indigo" title="📒 Cost Allocation Ledger — Audit Trail (Management View)">
        บันทึกการ allocate ต้นทุนจาก Cost Pool สำหรับ audit/ผู้บริหารดูเทียบเท่านั้น P&L ยังใช้ WAC เสมอ และ reverse/write ยังปิดไว้จนกว่า allocation log schema จะถูกออกแบบครบ
      </InfoBand>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="รวม Allocations" value={String(data?.summary.active ?? 0)}><span className="text-xs text-slate-400">PO {data?.summary.poCount ?? 0} · Spot {data?.summary.spotCount ?? 0}</span></Metric>
        <Metric label="น้ำหนัก allocate" tone="blue" value={`${formatMoney(data?.summary.totalQty ?? 0)} กก.`} />
        <Metric label="ต้นทุนรวม" tone="red" value={formatMoney(data?.summary.cost ?? 0)} />
        <Metric label="กำไรรวม (Deal Cost)" tone={(data?.summary.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(data?.summary.gp ?? 0)} />
      </div>
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-64 rounded-lg border px-3 py-2 text-sm" placeholder="ค้นหา match_id / doc / สินค้า..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={targetType} onChange={setTargetType}><option value="all">ทุก source_type</option>{(data?.filters.targetTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <Select value={category} onChange={setCategory}><option value="all">ทุกหมวด</option>{(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</Select>
          <Select value={status} onChange={setStatus}><option value="approved">✓ Approved</option><option value="reversed">⊘ Reversed</option><option value="all">ทั้งหมด</option></Select>
          <span className="text-sm text-slate-500">{data?.rows.length ?? 0} รายการ</span>
          <button className="ml-auto rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white opacity-60" disabled type="button">📤 Export CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Match ID</th><th className="p-2 text-center">Type</th><th className="p-2 text-left">Sale Doc</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-center">หมวด</th><th className="p-2 text-right">Sale Qty</th><th className="p-2 text-right">Allocated</th><th className="p-2 text-left">Cost Pool</th><th className="p-2 text-right">฿/กก.</th><th className="p-2 text-right">Total Cost</th><th className="p-2 text-right">Revenue</th><th className="p-2 text-right">GP</th><th className="p-2 text-right">GP%</th><th className="p-2 text-left">By</th><th className="p-2 text-center">Status</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="py-8 text-center text-slate-500" colSpan={15}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <tr><td className="py-8 text-center text-slate-500" colSpan={15}>ไม่มี allocation log ตรงกับ filter</td></tr> : null}
            {(data?.rows ?? []).map((row) => <tr key={row.id} className={`border-t hover:bg-indigo-50/30 ${row.status === 'reversed' ? 'opacity-50' : ''}`}><td className="p-2 font-mono text-xs">{row.matchId}</td><td className="p-2 text-center"><TargetPill type={row.targetType} /></td><td className="p-2 font-mono text-xs">{row.saleDocNo}</td><td className="p-2 text-xs">{row.productName}</td><td className="p-2 text-center"><span className="rounded bg-slate-100 px-2 py-0.5 text-[10px]">{row.productCategory}</span></td><td className="p-2 text-right">{formatMoney(row.saleQty)}</td><td className="p-2 text-right font-medium text-blue-700">{formatMoney(row.allocatedQty)}</td><td className="p-2 font-mono text-xs">{row.costPoolNo}</td><td className="p-2 text-right">{formatMoney(row.costPerKg)}</td><td className="p-2 text-right text-red-700">{formatMoney(row.totalCost)}</td><td className="p-2 text-right text-emerald-700">{formatMoney(row.allocatedRevenue)}</td><td className={`p-2 text-right font-bold ${row.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.grossProfit)}</td><td className="p-2 text-right text-xs">{row.gpPct.toFixed(2)}%</td><td className="p-2 text-xs">{row.allocatedBy}</td><td className="p-2 text-center"><span className={`rounded px-2 py-0.5 text-[10px] ${row.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{row.status === 'approved' ? '✓' : '⊘ rev'}</span></td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
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
    <section className="space-y-4">
      <InfoBand tone="emerald" title="📊 Dual Costing Report — Management Dashboard (ไม่ใช่ P&L)">
        รายงานนี้ใช้ Deal Cost เพื่อให้ผู้บริหารดูกำไรต่อดีล/ลอตที่ allocate เท่านั้น ไม่ใช้ปิดงบ และ P&L/งบกำไรขาดทุนยังใช้ WAC ตามหลักบัญชีมาตรฐาน
      </InfoBand>
      <ErrorBox error={error} />
      {isLoading ? <div className="rounded-xl bg-white p-6 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-gradient-to-r from-emerald-500 to-blue-500 p-4 text-white shadow md:grid-cols-4">
        <HeroMetric label="Total Revenue (Allocated)" value={formatMoney((report?.po.revenue ?? 0) + (report?.spotAllocated.revenue ?? 0))} />
        <HeroMetric label="Total Cost (Deal Cost)" value={formatMoney(report?.total.cost ?? 0)} />
        <HeroMetric label="Gross Profit" value={formatMoney(report?.total.gp ?? 0)} />
        <HeroMetric label="GP%" value={`${(report?.total.gpPct ?? 0).toFixed(2)}%`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard metric={report?.po} title="📋 ขายผ่าน PO Sell" />
        <ReportCard metric={report?.spotAllocated} title="🛒 ขาย Spot Sell (Allocated)" />
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="text-sm font-bold text-amber-800">⏳ Pending / Partial Allocation</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <Metric label="รายการค้าง" tone="amber" value={String(report?.waiting.count ?? 0)} />
          <Metric label="น้ำหนักค้าง" tone="amber" value={`${formatMoney(report?.waiting.qty ?? 0)} กก.`} />
          <Metric label="มูลค่าขายค้าง" tone="emerald" value={formatMoney(report?.waiting.revenue ?? 0)} />
        </div>
      </div>
      <div className="rounded-xl bg-white p-4 shadow">
        <h3 className="mb-3 font-semibold">สรุปตามหมวดสินค้า</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">หมวด</th><th className="p-2 text-right">Allocated Qty</th><th className="p-2 text-right">Revenue</th><th className="p-2 text-right">Cost</th><th className="p-2 text-right">GP</th><th className="p-2 text-right">GP%</th><th className="p-2 text-right">Pending Qty</th><th className="p-2 text-right">Pending Revenue</th></tr></thead>
            <tbody>
              {(report?.byCategory ?? []).map((row) => <tr key={row.category} className="border-t"><td className="p-2"><span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{row.category}</span></td><td className="p-2 text-right">{formatMoney(row.allocatedQty)}</td><td className="p-2 text-right text-blue-700">{formatMoney(row.revenue)}</td><td className="p-2 text-right text-red-700">{formatMoney(row.cost)}</td><td className={`p-2 text-right font-bold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.gp)}</td><td className="p-2 text-right">{row.gpPct.toFixed(2)}%</td><td className="p-2 text-right text-amber-700">{formatMoney(row.pendingQty)}</td><td className="p-2 text-right text-amber-700">{formatMoney(row.pendingRevenue)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function InfoBand({ children, title, tone }: { children: React.ReactNode; title: string; tone: 'amber' | 'emerald' | 'indigo' }) {
  const classes = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  }[tone]
  return <div className={`rounded-lg border p-3 text-sm ${classes}`}><strong>{title}</strong><div className="mt-1 text-xs leading-relaxed opacity-90">{children}</div></div>
}

function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null
}

function Select({ children, onChange, value }: { children: React.ReactNode; onChange: (value: string) => void; value: string }) {
  return <select className="rounded-lg border px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
}

function Metric({ children, label, tone = 'normal', value }: { children?: React.ReactNode; label: string; tone?: 'amber' | 'blue' | 'emerald' | 'normal' | 'red'; value: string }) {
  const classes = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    normal: 'bg-white text-slate-900',
    red: 'bg-red-50 text-red-700',
  }[tone]
  return <div className={`rounded-lg p-3 shadow ${classes}`}><div className="text-xs opacity-75">{label}</div><div className="text-xl font-bold">{value}</div>{children}</div>
}

function StatusPill({ status }: { status: string }) {
  return status === 'pending_allocation'
    ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">⏳ pending</span>
    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">◐ partial</span>
}

function TargetPill({ type }: { type: string }) {
  return type === 'SPOT_SELL'
    ? <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">🛒 Spot</span>
    : <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700">📋 PO</span>
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs opacity-80">{label}</div><div className="text-2xl font-bold">{value}</div></div>
}

function ReportCard({ metric, title }: { metric?: ReportMetric; title: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          <ReportLine label="รายการ Allocate" value={String(metric?.count ?? 0)} />
          <ReportLine label="น้ำหนัก" value={`${formatMoney(metric?.qty ?? 0)} กก.`} />
          <ReportLine label="Revenue" tone="blue" value={formatMoney(metric?.revenue ?? 0)} />
          <ReportLine label="Cost (Deal)" tone="red" value={formatMoney(metric?.cost ?? 0)} />
          <ReportLine label="GP" tone={(metric?.gp ?? 0) >= 0 ? 'emerald' : 'red'} value={formatMoney(metric?.gp ?? 0)} />
          <ReportLine label="GP%" value={`${(metric?.gpPct ?? 0).toFixed(2)}%`} />
        </tbody>
      </table>
    </div>
  )
}

function ReportLine({ label, tone = 'normal', value }: { label: string; tone?: 'blue' | 'emerald' | 'normal' | 'red'; value: string }) {
  const classes = { blue: 'text-blue-700', emerald: 'text-emerald-700', normal: 'text-slate-900', red: 'text-red-700' }[tone]
  return <tr className="border-t first:border-t-0"><td className="py-1 text-slate-500">{label}</td><td className={`py-1 text-right font-bold ${classes}`}>{value}</td></tr>
}
