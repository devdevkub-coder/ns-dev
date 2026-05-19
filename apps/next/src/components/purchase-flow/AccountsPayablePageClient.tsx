'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'

type SelectOption = {
  active: boolean | null
  code: string | null
  id: string
  name: string
}

type ApRow = {
  aging: number
  branchName: string
  bucket: string
  channelName: string
  creditTerm: number
  date: string
  docNo: string
  dueDate: string
  id: string
  paidAmount: number
  payableBalance: number
  status: string
  supplierCode: string
  supplierName: string
  totalAmount: number
  transactionMode: string
}

type ApPayload = {
  byBucket: Array<{ bucket: string; bills: number; total: number }>
  bySupplier: Array<{ bills: number; current: number; gt90: number; oldest: number; supplierName: string; total: number; b30: number; b60: number; b90: number }>
  filters: { branches: SelectOption[]; channels: SelectOption[]; statuses: string[]; suppliers: SelectOption[] }
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number }
  rows: ApRow[]
  summary: { bills: number; dueIn7: number; overdue: number; suppliers: number; total: number }
}

type SortKey = 'date' | 'docNo' | 'dueDate' | 'payableBalance' | 'supplierName' | 'aging'

function bucketClass(bucket: string) {
  if (bucket === 'Current') return 'bg-slate-100 text-slate-600'
  if (bucket === '1-30') return 'bg-yellow-100 text-yellow-700'
  if (bucket === '31-60') return 'bg-amber-100 text-amber-700'
  if (bucket === '61-90') return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

function bucketBarClass(bucket: string) {
  if (bucket === 'Current') return 'bg-slate-400'
  if (bucket === '1-30') return 'bg-yellow-500'
  if (bucket === '31-60') return 'bg-amber-500'
  if (bucket === '61-90') return 'bg-orange-500'
  return 'bg-red-500'
}

function bucketTextClass(bucket: string) {
  if (bucket === 'Current') return 'text-slate-600'
  if (bucket === '1-30') return 'text-yellow-700'
  if (bucket === '31-60') return 'text-amber-700'
  if (bucket === '61-90') return 'text-orange-700'
  return 'text-red-700'
}

function bucketCardClass(bucket: string) {
  if (bucket === 'Current') return 'border-slate-400 bg-slate-50'
  if (bucket === '1-30') return 'border-yellow-500 bg-yellow-50'
  if (bucket === '31-60') return 'border-amber-500 bg-amber-50'
  if (bucket === '61-90') return 'border-orange-500 bg-orange-50'
  return 'border-red-500 bg-red-50'
}

function bucketLabel(bucket: string) {
  return bucket === 'Current' ? 'ยังไม่ถึง' : `${bucket} วัน`
}

function bucketLongLabel(bucket: string) {
  return bucket === 'Current' ? 'ยังไม่ถึงกำหนด' : `${bucket} วัน`
}

function moneyOrDash(value: number) {
  return value ? formatMoney(value) : '-'
}

function percentage(value: number, total: number) {
  if (total <= 0 || value <= 0) return '0%'
  return `${Math.max(1, Math.min(100, (value / total) * 100))}%`
}

function currentMonthStart() {
  return `${todayDateInput().slice(0, 8)}01`
}

export function AccountsPayablePageClient() {
  const [data, setData] = useState<ApPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState<ApRow | null>(null)
  const [tab, setTab] = useState<'summary' | 'detail'>('summary')
  const [bucket, setBucket] = useState('')
  const [branchId, setBranchId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [from, setFrom] = useState(currentMonthStart())
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [status, setStatus] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [to, setTo] = useState(todayDateInput())

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '50',
      sortDirection,
      sortKey,
    })
    if (branchId) params.set('branchId', branchId)
    if (bucket) params.set('bucket', bucket)
    if (channelId) params.set('channelId', channelId)
    if (from) params.set('from', from)
    if (q.trim()) params.set('q', q.trim())
    if (status) params.set('status', status)
    if (supplierId) params.set('supplierId', supplierId)
    if (to) params.set('to', to)
    return params
  }, [branchId, bucket, channelId, from, page, q, sortDirection, sortKey, status, supplierId, to])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<ApPayload>(`/api/finance/ap?${query.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด AP ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function changeSort(nextKey: SortKey) {
    setPage(1)
    if (nextKey === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'payableBalance' || nextKey === 'aging' ? 'desc' : 'asc')
  }

  async function exportXlsx() {
    setIsExporting(true)
    setError(null)
    try {
      const exportQuery = new URLSearchParams(query)
      exportQuery.set('format', 'xlsx')
      const response = await fetch(`/api/finance/ap?${exportQuery.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Export AP ไม่สำเร็จ')
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `finance_ap_${todayDateInput()}.xlsx`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export AP ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
    }
  }

  const totalPages = data?.pagination.totalPages ?? 1
  const bucketRows = data?.byBucket ?? []
  const topSuppliers = (data?.bySupplier ?? []).slice(0, 5)
  const totalAp = data?.summary.total ?? 0
  const overdueAp = data?.summary.overdue ?? 0
  const dueIn7 = data?.summary.dueIn7 ?? 0
  const overduePercent = totalAp > 0 ? ((overdueAp / totalAp) * 100).toFixed(1) : '0.0'

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">📤 รายการค้างจ่าย / Accounts Payable</h1>
        <p className="mt-1 text-sm opacity-80">สรุปยอดค้างจ่าย Supplier · Aging Buckets · Detail per Bill</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-rose-700 to-pink-800 p-6 text-white shadow-lg">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative">
            <div className="text-sm uppercase tracking-wider opacity-80">💸 ค้างจ่าย Supplier รวม</div>
            <div className="mt-2 text-4xl font-bold">{formatMoney(totalAp)}</div>
            <div className="mt-1 text-sm opacity-90">{data?.summary.bills ?? 0} บิล · {data?.summary.suppliers ?? 0} Supplier</div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/20 pt-4">
              <div>
                <div className="text-[10px] opacity-75">⚠ เกินกำหนด</div>
                <div className="text-lg font-bold text-amber-200">{formatMoney(overdueAp)}</div>
                <div className="text-[10px] opacity-75">{overduePercent}%</div>
              </div>
              <div>
                <div className="text-[10px] opacity-75">⏰ ครบใน 7 วัน</div>
                <div className="text-lg font-bold text-yellow-200">{formatMoney(dueIn7)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">📊 Aging Buckets</div>
          <div className="space-y-2">
            {bucketRows.map((bucket) => (
              <div key={bucket.bucket} className="flex items-center gap-2 text-xs">
                <div className={`w-20 ${bucketTextClass(bucket.bucket)}`}>
                  {bucketLabel(bucket.bucket)}
                </div>
                <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-5 rounded-full ${bucketBarClass(bucket.bucket)}`} style={{ width: percentage(bucket.total, totalAp) }} />
                  <span className="absolute right-2 top-0 text-[10px] font-bold leading-5 text-slate-700">{bucket.bills} ใบ</span>
                </div>
                <div className="w-24 text-right font-bold text-slate-700">{formatMoney(bucket.total)}</div>
              </div>
            ))}
            {!isLoading && bucketRows.length === 0 ? <div className="py-4 text-center text-slate-400">ไม่มีเจ้าหนี้คงค้าง</div> : null}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Supplier ค้างจ่ายสูงสุด</div>
          <div className="space-y-1.5">
            {topSuppliers.map((supplier, index) => (
              <div key={supplier.supplierName} className="flex items-center gap-2 text-xs">
                <span className={`w-5 text-center font-bold ${index < 3 ? 'text-red-600' : 'text-slate-400'}`}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-700">{supplier.supplierName}</div>
                  <div className="text-[10px] text-slate-400">{supplier.bills} บิล · เกินสุด {supplier.oldest} วัน</div>
                </div>
                <div className="h-2.5 w-20 rounded-full bg-slate-100">
                  <div className="h-2.5 rounded-full bg-red-500" style={{ width: percentage(supplier.total, topSuppliers[0]?.total ?? 0) }} />
                </div>
                <div className="w-24 text-right font-bold text-red-700">{formatMoney(supplier.total)}</div>
              </div>
            ))}
            {!isLoading && topSuppliers.length === 0 ? <div className="py-4 text-center text-slate-400">ไม่มีเจ้าหนี้คงค้าง</div> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric className="border-red-500 bg-red-50" label="💸 ค้างจ่ายรวม" labelClassName="text-red-600" value={formatMoney(totalAp)} valueClassName="text-red-700" />
        <Metric className="border-amber-500 bg-amber-50" label="⚠ เกินกำหนด" labelClassName="text-amber-700" value={formatMoney(overdueAp)} valueClassName="text-amber-700" />
        <Metric className="border-yellow-500 bg-yellow-50" label="⏰ ครบใน 7 วัน" labelClassName="text-yellow-700" value={formatMoney(dueIn7)} valueClassName="text-yellow-700" />
        <Metric label="บิลค้างจ่าย" value={`${data?.summary.bills ?? 0} ใบ`} />
        <Metric label="Supplier ค้างจ่าย" value={`${data?.summary.suppliers ?? 0} ราย`} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {bucketRows.map((bucket) => (
          <div key={`card-${bucket.bucket}`} className={`rounded-lg border-l-4 p-3 ${bucketCardClass(bucket.bucket)}`}>
            <div className="text-xs">อายุ {bucketLongLabel(bucket.bucket)}</div>
            <div className="text-base font-bold">{formatMoney(bucket.total)}</div>
            <div className="text-xs text-slate-500">{bucket.bills} ใบ</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-white p-3 shadow">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border">
            <button className={`px-4 py-2 text-sm ${tab === 'summary' ? 'bg-red-600 text-white' : 'bg-white text-slate-600'}`} type="button" onClick={() => setTab('summary')}>📊 สรุปตาม Supplier</button>
            <button className={`border-l px-4 py-2 text-sm ${tab === 'detail' ? 'bg-red-600 text-white' : 'bg-white text-slate-600'}`} type="button" onClick={() => setTab('detail')}>📄 รายบิล</button>
          </div>
          <select className="rounded-lg border px-3 py-2 text-sm" value={supplierId} onChange={(event) => { setPage(1); setSupplierId(event.target.value) }}>
            <option value="">ผู้ขายทั้งหมด</option>
            {(data?.filters.suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={channelId} onChange={(event) => { setPage(1); setChannelId(event.target.value) }}>
            <option value="">ทุกช่องทาง</option>
            {(data?.filters.channels ?? []).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={bucket} onChange={(event) => { setPage(1); setBucket(event.target.value) }}>
            <option value="">ทุกอายุหนี้</option>
            <option value="Current">Current</option>
            <option value="1-30">1-30</option>
            <option value="31-60">31-60</option>
            <option value="61-90">61-90</option>
            <option value=">90">&gt;90</option>
          </select>
          <button className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : '📥 Export .xlsx'}</button>
        </div>
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="rounded-lg border px-3 py-2 text-sm lg:col-span-2" placeholder="ค้นหาเลขบิล / ผู้ขาย / ช่องทาง / สาขา" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
            <option value="">ทุกสาขา</option>
            {(data?.filters.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}>
            <option value="">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
          <label className="text-xs text-slate-500">
            จากวันที่
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value) }} />
          </label>
          <label className="text-xs text-slate-500">
            ถึงวันที่
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value) }} />
          </label>
          <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => { setBranchId(''); setBucket(''); setChannelId(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setSupplierId(''); setTo('') }}>ล้างตัวกรอง</button>
        </div>
      </div>
      {tab === 'summary' ? <SummaryTable buckets={bucketRows} rows={data?.bySupplier ?? []} summary={data?.summary} isLoading={isLoading} /> : null}
      {tab === 'detail' ? <DetailTable isLoading={isLoading} onSort={changeSort} rows={data?.rows ?? []} selectedSort={sortKey} sortDirection={sortDirection} summaryTotal={data?.summary.total ?? 0} onOpen={setSelectedRow} /> : null}
      {tab === 'detail' ? (
        <div className="flex items-center justify-end gap-2">
          <button className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
          <span className="text-sm text-slate-600">หน้า {page} / {totalPages}</span>
          <button className="rounded bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</button>
        </div>
      ) : null}
      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Metric({
  className = 'border-transparent bg-white',
  label,
  labelClassName = 'text-slate-500',
  value,
  valueClassName = 'text-slate-900',
}: {
  className?: string
  label: string
  labelClassName?: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className={`rounded-xl border-l-4 p-3 shadow ${className}`}>
      <div className={`text-xs ${labelClassName}`}>{label}</div>
      <div className={`mt-1 text-xl font-bold ${valueClassName}`}>{value}</div>
    </div>
  )
}

function SummaryTable({
  buckets,
  isLoading,
  rows,
  summary,
}: {
  buckets: ApPayload['byBucket']
  isLoading: boolean
  rows: ApPayload['bySupplier']
  summary: ApPayload['summary'] | undefined
}) {
  const bucketTotal = (bucket: string) => buckets.find((item) => item.bucket === bucket)?.total ?? 0

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr><th className="p-2 text-left">Supplier</th><th className="p-2 text-right">บิล</th><th className="p-2 text-right">Current</th><th className="p-2 text-right">1-30 วัน</th><th className="p-2 text-right">31-60</th><th className="p-2 text-right">61-90</th><th className="p-2 text-right">&gt;90</th><th className="p-2 text-right">รวมค้างจ่าย</th><th className="p-2 text-right">เกินกำหนดสุด</th></tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่มีเจ้าหนี้คงค้าง</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.supplierName} className={`border-t hover:bg-red-50/30 ${row.oldest > 30 ? 'bg-red-50/40' : row.oldest > 0 ? 'bg-amber-50/30' : ''}`}>
              <td className="p-2 font-medium">{row.supplierName}</td>
              <td className="p-2 text-right">{row.bills}</td>
              <td className="p-2 text-right text-slate-600">{moneyOrDash(row.current)}</td>
              <td className="p-2 text-right text-yellow-700">{moneyOrDash(row.b30)}</td>
              <td className="p-2 text-right text-amber-700">{moneyOrDash(row.b60)}</td>
              <td className="p-2 text-right text-orange-700">{moneyOrDash(row.b90)}</td>
              <td className="p-2 text-right font-bold text-red-700">{moneyOrDash(row.gt90)}</td>
              <td className="p-2 text-right text-base font-bold text-red-700">{formatMoney(row.total)}</td>
              <td className={`p-2 text-right ${row.oldest > 30 ? 'font-bold text-red-700' : row.oldest > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{row.oldest > 0 ? `${row.oldest} วัน` : '-'}</td>
            </tr>
          ))}
        </tbody>
        {!isLoading && rows.length > 0 ? (
          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td className="p-2">รวมทั้งหมด ({rows.length} Supplier)</td>
              <td className="p-2 text-right">{summary?.bills ?? 0}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('Current'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('1-30'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('31-60'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('61-90'))}</td>
              <td className="p-2 text-right text-red-700">{formatMoney(bucketTotal('>90'))}</td>
              <td className="p-2 text-right text-lg text-red-700">{formatMoney(summary?.total ?? 0)}</td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

function DetailTable({
  isLoading,
  onOpen,
  onSort,
  rows,
  selectedSort,
  sortDirection,
  summaryTotal,
}: {
  isLoading: boolean
  onOpen: (row: ApRow) => void
  onSort: (key: SortKey) => void
  rows: ApRow[]
  selectedSort: SortKey
  sortDirection: 'asc' | 'desc'
  summaryTotal: number
}) {
  const sortLabel = (key: SortKey) => selectedSort === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('supplierName')}>Supplier{sortLabel('supplierName')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('docNo')}>บิล{sortLabel('docNo')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('date')}>วันที่{sortLabel('date')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('dueDate')}>Due{sortLabel('dueDate')}</button></th>
            <th className="p-2 text-center"><button type="button" onClick={() => onSort('aging')}>Aging{sortLabel('aging')}</button></th>
            <th className="p-2 text-right">ยอด</th>
            <th className="p-2 text-right">จ่ายแล้ว</th>
            <th className="p-2 text-right"><button type="button" onClick={() => onSort('payableBalance')}>ค้างจ่าย{sortLabel('payableBalance')}</button></th>
            <th className="p-2 text-left">Channel</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่มีเจ้าหนี้คงค้าง</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.id} className={`border-t ${row.aging > 30 ? 'bg-red-50/50' : row.aging > 0 ? 'bg-amber-50/30' : ''}`}>
              <td className="p-2">{row.supplierName}</td>
              <td className="p-2"><button className="font-mono text-xs text-blue-600" type="button" onClick={() => onOpen(row)}>{row.docNo}</button></td>
              <td className="p-2">{row.date}</td>
              <td className="p-2">{row.dueDate}</td>
              <td className="p-2 text-center"><span className={`rounded px-2 py-0.5 text-xs ${bucketClass(row.bucket)}`}>{row.bucket} ({row.aging})</span></td>
              <td className="p-2 text-right">{formatMoney(row.totalAmount)}</td>
              <td className="p-2 text-right text-emerald-600">{formatMoney(row.paidAmount)}</td>
              <td className="p-2 text-right font-bold text-red-700">{formatMoney(row.payableBalance)}</td>
              <td className="p-2">{row.channelName}</td>
            </tr>
          ))}
        </tbody>
        {!isLoading && rows.length > 0 ? (
          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td className="p-2 text-right" colSpan={7}>รวมค้างจ่ายทั้งหมด</td>
              <td className="p-2 text-right text-lg text-red-700">{formatMoney(summaryTotal)}</td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: ApRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{row.docNo}</h2>
            <p className="text-sm text-slate-500">{row.supplierName}</p>
          </div>
          <button className="rounded bg-slate-100 px-3 py-1 text-sm" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="วันที่บิล" value={row.date} />
          <Info label="ครบกำหนด" value={row.dueDate} />
          <Info label="Credit term" value={`${row.creditTerm} วัน`} />
          <Info label="อายุหนี้" value={`${row.aging} วัน (${row.bucket})`} />
          <Info label="ช่องทางซื้อ" value={row.channelName} />
          <Info label="สาขา" value={row.branchName} />
          <Info label="สถานะ" value={row.status} />
          <Info label="ประเภท" value={row.transactionMode} />
          <Info label="ยอดบิล" value={formatMoney(row.totalAmount)} />
          <Info label="จ่ายแล้ว" value={formatMoney(row.paidAmount)} />
          <Info label="ค้างจ่าย" value={formatMoney(row.payableBalance)} />
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-200 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-900">{value}</div></div>
}
