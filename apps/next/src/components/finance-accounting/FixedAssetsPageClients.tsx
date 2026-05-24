'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AssetRegisterRow = {
  accumDep: number
  assetStatus: string
  branchName: string
  category: string
  code: string
  id: string
  location: string
  monthlyDep: number
  name: string
  nbv: number
  netAssetCost: number
  originalCost: number
  purchaseDate: string
  usefulLifeMonths: number
}

type AssetRegisterPayload = {
  byCategory: { category: string; count: number; cost: number; monthlyDep: number; nbv: number }[]
  filters: { categories: string[]; statuses: string[] }
  rows: AssetRegisterRow[]
  summary: { accumDep: number; count: number; monthlyDep: number; nbv: number; netAssetCost: number }
}

type DepreciationPayload = {
  designState: { reverseWrite: string; runWrite: string }
  pendingAssets: { accumDep: number; assetStatus: string; code: string; id: string; monthlyDep: number; name: string; nbv: number; netAssetCost: number }[]
  rows: { accumAfter: number; assetCode: string; assetName: string; date: string; depreciationAmount: number; id: string; nbvAfter: number; period: string; refNo: string; status: string }[]
  summary: { pendingAssets: number; postedRuns: number; totalDepreciation: number }
}

type DisposalPayload = {
  assetOptions: { assetStatus: string; code: string; id: string; label: string; name: string; nbv: number; purchaseDate: string }[]
  designState: { disposalTable: string; writeBehavior: string }
  rows: { assetCode: string; assetName: string; date: string; disposalType: string; gainLoss: number; id: string; nbv: number; reason: string; sellingPrice: number }[]
  summary: { activeAssets: number; disposedRows: number; gainLoss: number; proceeds: number }
}

export function AssetRegisterPageClient() {
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<AssetRegisterPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    setIsLoading(true)
    dailyFetchJson<AssetRegisterPayload>('/api/finance-accounting/asset-register')
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดทะเบียนทรัพย์สินไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      const matchesSearch = !needle || [row.code, row.name, row.location, row.branchName].join(' ').toLowerCase().includes(needle)
      const matchesCategory = category === 'all' || row.category === category
      const matchesStatus = status === 'all' || row.assetStatus === status
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [category, data?.rows, search, status])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-md bg-white p-3 shadow">
        <DisabledButton>📄 Template</DisabledButton>
        <DisabledButton>📥 Import</DisabledButton>
        <DisabledButton>📤 Export CSV</DisabledButton>
        <DisabledButton strong>+ เพิ่มทรัพย์สิน</DisabledButton>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-md bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-5 text-white shadow">
          <div className="text-sm opacity-90">Net Book Value</div>
          <div className="mt-2 text-3xl font-bold">{formatMoney(data?.summary.nbv)} ฿</div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><div className="opacity-80">ต้นทุนสุทธิ</div><div className="font-semibold">{formatMoney(data?.summary.netAssetCost)}</div></div>
            <div><div className="opacity-80">ค่าเสื่อมสะสม</div><div className="font-semibold">{formatMoney(data?.summary.accumDep)}</div></div>
          </div>
        </div>
        <Panel title="NBV ตามหมวด">
          <div className="space-y-2">
            {(data?.byCategory ?? []).slice(0, 6).map((item) => <Bar key={item.category} label={`${item.category} (${item.count})`} max={data?.summary.nbv ?? 0} value={item.nbv} />)}
            {!isLoading && (data?.byCategory.length ?? 0) === 0 ? <EmptyText>ยังไม่มีทรัพย์สิน</EmptyText> : null}
          </div>
        </Panel>
        <Panel title="ค่าเสื่อม/เดือน">
          <div className="text-2xl font-bold text-amber-700">{formatMoney(data?.summary.monthlyDep)} ฿</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <MiniStat label="รายการ" value={data?.summary.count ?? 0} />
            <MiniStat label="แสดงผล" value={rows.length} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="จำนวนทรัพย์สิน" value={data?.summary.count ?? 0} />
        <StatCard label="ต้นทุนสุทธิ" value={formatMoney(data?.summary.netAssetCost)} />
        <StatCard label="ค่าเสื่อมสะสม" value={formatMoney(data?.summary.accumDep)} tone="amber" />
        <StatCard label="NBV" value={formatMoney(data?.summary.nbv)} tone="emerald" />
      </div>

      <FilterPanel>
        <input className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="ค้นหา รหัส / ชื่อ / สถานที่ / สาขา" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">ทุกหมวด</option>
          {(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">ทุกสถานะ</option>
          {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <DisabledButton>CSV</DisabledButton>
      </FilterPanel>

      <TableShell>
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr><Th>รหัส</Th><Th>ชื่อ + location</Th><Th>หมวด</Th><Th>สาขา</Th><Th>วันที่ซื้อ</Th><Th align="right">ต้นทุน/Net Cost</Th><Th align="right">ค่าเสื่อมสะสม</Th><Th align="right">NBV</Th><Th align="right">ค่าเสื่อม/เดือน</Th><Th align="center">สถานะ</Th><Th align="center">actions</Th></tr>
          </thead>
          <tbody>
            <LoadingOrEmpty colSpan={11} isLoading={isLoading} rows={rows.length} />
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                <Td><span className="font-mono font-semibold text-amber-700">{row.code}</span></Td>
                <Td><div className="font-medium text-slate-900">{row.name}</div><div className="text-slate-400">{row.location || '-'}</div></Td>
                <Td>{row.category}</Td><Td>{row.branchName}</Td><Td>{row.purchaseDate || '-'}</Td>
                <Td align="right">{formatMoney(row.netAssetCost)}</Td><Td align="right">{formatMoney(row.accumDep)}</Td><Td align="right" strong>{formatMoney(row.nbv)}</Td><Td align="right">{formatMoney(row.monthlyDep)}</Td>
                <Td align="center"><StatusPill status={row.assetStatus} /></Td>
                <Td align="center"><span className="text-slate-400">แก้ไข · ลบ</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </section>
  )
}

export function DepreciationPageClient() {
  const [data, setData] = useState<DepreciationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [year, setYear] = useState(String(now.getFullYear()))

  const loadData = useCallback(() => {
    setIsLoading(true)
    dailyFetchJson<DepreciationPayload>('/api/finance-accounting/depreciation')
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดค่าเสื่อมราคาไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => loadData(), [loadData])

  const periodDate = useMemo(() => new Date(Number(year), Number(month), 0).toISOString().slice(0, 10), [month, year])

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
          {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>เดือน {item}</option>)}
        </select>
        <input className="w-28 rounded-md border border-slate-200 px-3 py-2 text-sm" value={year} onChange={(event) => setYear(event.target.value)} />
        <input className="rounded-md border border-slate-200 px-3 py-2 text-sm" readOnly value={periodDate} />
        <Chip tone="blue">Asset ที่คิดค่าเสื่อม {data?.pendingAssets.length ?? 0}</Chip>
        <Chip tone="emerald">Run แล้วงวดนี้ 0</Chip>
        <Chip tone="amber">รอ Run {data?.pendingAssets.length ?? 0}</Chip>
        <span className="flex-1" />
        <DisabledButton strong>▶ Run ค่าเสื่อมงวดนี้</DisabledButton>
      </FilterPanel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard label="Asset ที่รอ Run" value={data?.summary.pendingAssets ?? 0} tone="amber" />
        <StatCard label="ประวัติ Dep." value={data?.summary.postedRuns ?? 0} />
        <StatCard label="ค่าเสื่อมรวม" value={formatMoney(data?.summary.totalDepreciation)} tone="red" />
      </div>
      <Panel title="Asset รอ Run ค่าเสื่อม">
        <MiniAssetTable isLoading={isLoading} rows={data?.pendingAssets ?? []} />
      </Panel>
      <TableShell title="Depreciation History">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><Th>DEP ID</Th><Th>งวด</Th><Th>Asset</Th><Th align="right">Acc หลัง</Th><Th align="right">ค่าเสื่อมงวด</Th><Th align="right">NBV หลัง</Th><Th align="center">สถานะ</Th><Th align="center">action</Th></tr></thead>
          <tbody>
            <LoadingOrEmpty colSpan={8} isLoading={isLoading} rows={data?.rows.length ?? 0} />
            {(data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                <Td><span className="font-mono text-red-700">{row.refNo}</span></Td><Td>{row.period}</Td><Td><div className="font-medium">{row.assetCode}</div><div className="text-slate-400">{row.assetName}</div></Td>
                <Td align="right">{formatMoney(row.accumAfter)}</Td><Td align="right">{formatMoney(row.depreciationAmount)}</Td><Td align="right">{formatMoney(row.nbvAfter)}</Td>
                <Td align="center"><Chip tone="emerald">posted</Chip></Td><Td align="center"><span className="text-slate-400">Reverse</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </section>
  )
}

export function AssetDisposalPageClient() {
  const [data, setData] = useState<DisposalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    dailyFetchJson<DisposalPayload>('/api/finance-accounting/asset-disposal')
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลจำหน่ายทรัพย์สินไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <span className="text-sm text-slate-500">รายการจำหน่ายทรัพย์สินแบบ read-only baseline</span>
        <span className="flex-1" />
        <DisabledButton strong>+ Disposal</DisabledButton>
      </FilterPanel>
      <TableShell>
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600"><tr><Th>วันที่</Th><Th>Asset</Th><Th>ประเภท</Th><Th align="right">ราคาขาย</Th><Th align="right">NBV ณ วันที่</Th><Th align="right">Gain/(Loss)</Th><Th>เหตุผล</Th></tr></thead>
          <tbody>
            <LoadingOrEmpty colSpan={7} isLoading={isLoading} rows={data?.rows.length ?? 0} emptyText="ยังไม่มีรายการจำหน่ายทรัพย์สิน" />
          </tbody>
        </table>
      </TableShell>
    </section>
  )
}

function DisabledButton({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <button className={`${strong ? 'bg-white text-slate-800' : 'bg-white/15 text-white'} rounded-md px-3 py-2 text-sm font-medium shadow-sm opacity-60`} disabled type="button">{children}</button>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-md bg-white p-4 shadow"><h2 className="mb-3 font-semibold text-slate-900">{title}</h2>{children}</div>
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">{children}</div>
}

function TableShell({ children, title }: { children: ReactNode; title?: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow">{title ? <h2 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">{title}</h2> : null}<div className="max-h-[60vh] overflow-auto">{children}</div></div>
}

function StatCard({ label, tone, value }: { label: string; tone?: 'amber' | 'emerald' | 'red'; value: number | string }) {
  const color = tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900'
  return <div className="rounded-md bg-white p-4 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-xl font-bold ${color}`}>{value}</div></div>
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">{label}</div><div className="font-semibold text-slate-900">{value}</div></div>
}

function Bar({ label, max, value }: { label: string; max: number; value: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return <div><div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{label}</span><span className="font-medium text-slate-900">{formatMoney(value)}</span></div><div className="h-2 rounded-md-full bg-slate-100"><div className="h-2 rounded-md-full bg-amber-500" style={{ width: `${width}%` }} /></div></div>
}

function MiniAssetTable({ isLoading, rows }: { isLoading: boolean; rows: DepreciationPayload['pendingAssets'] }) {
  return <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-amber-50 text-amber-800"><tr><Th>รหัส</Th><Th>ชื่อ</Th><Th align="right">Net Cost</Th><Th align="right">Acc Dep ปัจจุบัน</Th><Th align="right">NBV</Th><Th align="right">ค่าเสื่อม/เดือน</Th><Th align="center">สถานะ</Th></tr></thead><tbody><LoadingOrEmpty colSpan={7} isLoading={isLoading} rows={rows.length} />{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><Td><span className="font-mono">{row.code}</span></Td><Td>{row.name}</Td><Td align="right">{formatMoney(row.netAssetCost)}</Td><Td align="right">{formatMoney(row.accumDep)}</Td><Td align="right">{formatMoney(row.nbv)}</Td><Td align="right">{formatMoney(row.monthlyDep)}</Td><Td align="center"><StatusPill status={row.assetStatus} /></Td></tr>)}</tbody></table></div>
}

function LoadingOrEmpty({ colSpan, emptyText = 'ยังไม่มีข้อมูล', isLoading, rows }: { colSpan: number; emptyText?: string; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>{emptyText}</td></tr>
  return null
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap px-3 py-2 font-semibold ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children, strong = false }: { align?: 'center' | 'left' | 'right'; children: ReactNode; strong?: boolean }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap px-3 py-2 ${textAlign} ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{children}</td>
}

function Chip({ children, tone }: { children: ReactNode; tone: 'amber' | 'blue' | 'emerald' }) {
  const color = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
  return <span className={`rounded-md-full px-3 py-1 text-xs font-semibold ${color}`}>{children}</span>
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'Active' ? 'bg-emerald-50 text-emerald-700' : status === 'Fully Depreciated' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-md-full px-2 py-1 text-xs font-medium ${color}`}>{status}</span>
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-400">{children}</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
