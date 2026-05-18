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
  filters: { branches: SelectOption[]; statuses: string[]; suppliers: SelectOption[] }
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number }
  rows: ApRow[]
  summary: { bills: number; dueIn7: number; overdue: number; suppliers: number; total: number }
}

type SortKey = 'date' | 'docNo' | 'dueDate' | 'payableBalance' | 'supplierName' | 'aging'

function bucketClass(bucket: string) {
  if (bucket === 'Current') return 'bg-slate-100 text-slate-700'
  if (bucket === '1-30') return 'bg-yellow-100 text-yellow-800'
  if (bucket === '31-60') return 'bg-amber-100 text-amber-800'
  if (bucket === '61-90') return 'bg-orange-100 text-orange-800'
  return 'bg-red-100 text-red-800'
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
  const [branchId, setBranchId] = useState('')
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
    if (from) params.set('from', from)
    if (q.trim()) params.set('q', q.trim())
    if (status) params.set('status', status)
    if (supplierId) params.set('supplierId', supplierId)
    if (to) params.set('to', to)
    return params
  }, [branchId, from, page, q, sortDirection, sortKey, status, supplierId, to])

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

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-red-700 to-rose-700 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">รายการค้างจ่าย / Accounts Payable</h1>
        <p className="mt-1 text-sm opacity-90">อ่านจากบิลรับซื้อและรายการจ่ายเงิน Supplier เพื่อดูยอดค้างจริงตาม flow legacy</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="ค้างจ่ายรวม" value={formatMoney(data?.summary.total ?? 0)} />
        <Metric label="เกินกำหนด" value={formatMoney(data?.summary.overdue ?? 0)} />
        <Metric label="ครบใน 7 วัน" value={formatMoney(data?.summary.dueIn7 ?? 0)} />
        <Metric label="บิลค้างจ่าย" value={`${data?.summary.bills ?? 0}`} />
        <Metric label="Supplier" value={`${data?.summary.suppliers ?? 0}`} />
      </div>
      <div className="rounded-lg bg-white p-3 shadow">
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="rounded-lg border px-3 py-2 text-sm lg:col-span-2" placeholder="ค้นหาเลขบิล / ผู้ขาย / ช่องทาง / สาขา" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={supplierId} onChange={(event) => { setPage(1); setSupplierId(event.target.value) }}>
            <option value="">ผู้ขายทั้งหมด</option>
            {(data?.filters.suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
            <option value="">ทุกสาขา</option>
            {(data?.filters.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}>
            <option value="">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : 'Export .xlsx'}</button>
          <label className="text-xs text-slate-500">
            จากวันที่
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value) }} />
          </label>
          <label className="text-xs text-slate-500">
            ถึงวันที่
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value) }} />
          </label>
          <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => { setBranchId(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setSupplierId(''); setTo('') }}>ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={`rounded px-4 py-2 text-sm ${tab === 'summary' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} type="button" onClick={() => setTab('summary')}>สรุปตาม Supplier</button>
          <button className={`rounded px-4 py-2 text-sm ${tab === 'detail' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} type="button" onClick={() => setTab('detail')}>รายบิล</button>
          <span className="ml-auto text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
        </div>
      </div>
      {tab === 'summary' ? <SummaryTable rows={data?.bySupplier ?? []} isLoading={isLoading} /> : null}
      {tab === 'detail' ? <DetailTable isLoading={isLoading} onSort={changeSort} rows={data?.rows ?? []} selectedSort={sortKey} sortDirection={sortDirection} onOpen={setSelectedRow} /> : null}
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

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-900">{value}</div></div>
}

function SummaryTable({ isLoading, rows }: { isLoading: boolean; rows: ApPayload['bySupplier'] }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr><th className="p-2 text-left">Supplier</th><th className="p-2 text-right">บิล</th><th className="p-2 text-right">Current</th><th className="p-2 text-right">1-30</th><th className="p-2 text-right">31-60</th><th className="p-2 text-right">61-90</th><th className="p-2 text-right">&gt;90</th><th className="p-2 text-right">รวม</th></tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>ไม่พบเจ้าหนี้ค้างจ่ายตามเงื่อนไข</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.supplierName} className="border-t hover:bg-slate-50">
              <td className="p-2 font-medium">{row.supplierName}</td><td className="p-2 text-right">{row.bills}</td><td className="p-2 text-right">{formatMoney(row.current)}</td><td className="p-2 text-right">{formatMoney(row.b30)}</td><td className="p-2 text-right">{formatMoney(row.b60)}</td><td className="p-2 text-right">{formatMoney(row.b90)}</td><td className="p-2 text-right">{formatMoney(row.gt90)}</td><td className="p-2 text-right font-semibold text-red-700">{formatMoney(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailTable({ isLoading, onOpen, onSort, rows, selectedSort, sortDirection }: { isLoading: boolean; onOpen: (row: ApRow) => void; onSort: (key: SortKey) => void; rows: ApRow[]; selectedSort: SortKey; sortDirection: 'asc' | 'desc' }) {
  const sortLabel = (key: SortKey) => selectedSort === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('docNo')}>เลขที่{sortLabel('docNo')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('date')}>วันที่{sortLabel('date')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('dueDate')}>ครบกำหนด{sortLabel('dueDate')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('supplierName')}>ผู้ขาย{sortLabel('supplierName')}</button></th>
            <th className="p-2 text-left">สาขา</th>
            <th className="p-2 text-center"><button type="button" onClick={() => onSort('aging')}>อายุหนี้{sortLabel('aging')}</button></th>
            <th className="p-2 text-right">ยอดบิล</th>
            <th className="p-2 text-right">จ่ายแล้ว</th>
            <th className="p-2 text-right"><button type="button" onClick={() => onSort('payableBalance')}>ค้างจ่าย{sortLabel('payableBalance')}</button></th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>ไม่พบรายการค้างจ่ายตามเงื่อนไข</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.id} className="border-t hover:bg-slate-50">
              <td className="p-2"><button className="font-mono text-xs text-red-700 underline-offset-2 hover:underline" type="button" onClick={() => onOpen(row)}>{row.docNo}</button></td>
              <td className="p-2">{row.date}</td>
              <td className="p-2">{row.dueDate}</td>
              <td className="p-2">{row.supplierName}</td>
              <td className="p-2">{row.branchName}</td>
              <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs ${bucketClass(row.bucket)}`}>{row.bucket}</span></td>
              <td className="p-2 text-right">{formatMoney(row.totalAmount)}</td>
              <td className="p-2 text-right">{formatMoney(row.paidAmount)}</td>
              <td className="p-2 text-right font-semibold text-red-700">{formatMoney(row.payableBalance)}</td>
            </tr>
          ))}
        </tbody>
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
