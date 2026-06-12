'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type SelectOption = {
  active: boolean | null
  code: string | null
  id: string
  name: string
}

type ArRow = {
  aging: number
  branchName: string
  bucket: string
  channelName: string
  creditTerm: number
  customerCode: string
  customerName: string
  date: string
  docNo: string
  dueDate: string
  id: string
  receivableBalance: number
  receivedAmount: number
  status: string
  totalAmount: number
  transactionMode: string
}

type ArPayload = {
  byBucket: Array<{ bucket: string; bills: number; total: number }>
  byCustomer: Array<{ bills: number; current: number; customerName: string; gt90: number; oldest: number; total: number; b30: number; b60: number; b90: number }>
  filters: { branches: SelectOption[]; channels: SelectOption[]; customers: SelectOption[]; statuses: string[] }
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number }
  rows: ArRow[]
  summary: { bills: number; customers: number; dueIn7: number; overdue: number; pendingIssue: { cost: number; count: number; est: number }; total: number }
}

type SortKey = 'date' | 'docNo' | 'dueDate' | 'receivableBalance' | 'customerName' | 'aging'

function bucketClass(bucket: string) {
  if (bucket === 'Current') return 'bg-emerald-100 text-emerald-700'
  if (bucket === '1-30') return 'bg-blue-100 text-blue-700'
  if (bucket === '31-60') return 'bg-amber-100 text-amber-700'
  if (bucket === '61-90') return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

function bucketBarClass(bucket: string) {
  if (bucket === 'Current') return 'bg-emerald-500'
  if (bucket === '1-30') return 'bg-blue-500'
  if (bucket === '31-60') return 'bg-amber-500'
  if (bucket === '61-90') return 'bg-orange-500'
  return 'bg-red-500'
}

function bucketTextClass(bucket: string) {
  if (bucket === 'Current') return 'text-emerald-600'
  if (bucket === '1-30') return 'text-blue-600'
  if (bucket === '31-60') return 'text-amber-600'
  if (bucket === '61-90') return 'text-orange-600'
  return 'font-bold text-red-600'
}

function bucketLabel(bucket: string) {
  if (bucket === 'Current') return '✓ Current'
  if (bucket === '>90') return '⚠ >90 วัน'
  return `${bucket} วัน`
}

function percentage(value: number, total: number) {
  if (total <= 0 || value <= 0) return '0%'
  return `${Math.max(1, Math.min(100, (value / total) * 100))}%`
}

function currentMonthStart() {
  return `${todayDateInput().slice(0, 8)}01`
}

export function AccountsReceivablePageClient() {
  const latestLoadRequestRef = useRef(0)
  const [data, setData] = useState<ArPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState<ArRow | null>(null)
  const [bucket, setBucket] = useState('')
  const [branchId, setBranchId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [from, setFrom] = useState(currentMonthStart())
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [status, setStatus] = useState('')
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
    if (customerId) params.set('customerId', customerId)
    if (from) params.set('from', from)
    if (q.trim()) params.set('q', q.trim())
    if (status) params.set('status', status)
    if (to) params.set('to', to)
    return params
  }, [branchId, bucket, channelId, customerId, from, page, q, sortDirection, sortKey, status, to])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<ArPayload>(`/api/finance/ar?${query.toString()}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด AR ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
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
    setSortDirection(nextKey === 'receivableBalance' || nextKey === 'aging' ? 'desc' : 'asc')
  }

  async function exportXlsx() {
    setIsExporting(true)
    setError(null)
    try {
      const exportQuery = new URLSearchParams(query)
      exportQuery.set('format', 'xlsx')
      const response = await fetch(`/api/finance/ar?${exportQuery.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Export AR ไม่สำเร็จ')
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `finance_ar_${todayDateInput()}.xlsx`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export AR ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
    }
  }

  const totalPages = data?.pagination.totalPages ?? 1
  const bucketRows = data?.byBucket ?? []
  const topCustomers = (data?.byCustomer ?? []).slice(0, 5)
  const totalAr = data?.summary.total ?? 0
  const overdueAr = data?.summary.overdue ?? 0
  const overduePercent = totalAr > 0 ? ((overdueAr / totalAr) * 100).toFixed(0) : '0'
  const pendingIssue = data?.summary.pendingIssue ?? { cost: 0, count: 0, est: 0 }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {pendingIssue.count > 0 ? (
        <div className="flex items-center justify-between rounded-md border-l-4 border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 p-3 shadow">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <span className="font-bold text-amber-700">เงินค้างใน Pending Sale (ยังไม่เป็น AR)</span>
              <span className="ml-2 text-xs text-amber-600">— เบิกออกแล้วยังไม่เปิดบิลขาย</span>
            </div>
            <span className="text-xs text-slate-600">📦 {pendingIssue.count} ใบ</span>
            <span className="text-xs">💰 ต้นทุน: <b className="text-base text-red-600">{formatMoney(pendingIssue.cost)}</b></span>
            <span className="text-xs">📈 ยอดคาด: <b className="text-emerald-700">{formatMoney(pendingIssue.est)}</b></span>
          </div>
          <Link className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white" href="/sales/stock-issue">→ เปิดบิลขาย</Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-600 p-5 text-white shadow-xl">
          <div className="absolute right-3 top-2 text-7xl opacity-15">📥</div>
          <div className="text-xs opacity-90">📥 ลูกหนี้คงเหลือรวม</div>
          <div className="mt-1 text-4xl font-bold">{formatMoney(totalAr)}</div>
          <div className="mt-3 space-y-0.5 text-sm opacity-90">
            <div>📋 บิลค้าง: <b>{data?.summary.bills ?? 0}</b> ใบ</div>
            <div>⚠ เกินกำหนด: <b>{formatMoney(overdueAr)}</b> ({overduePercent}%)</div>
          </div>
        </div>

        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">📊 Aging Buckets</div>
          <div className="space-y-2 text-xs">
            {bucketRows.map((row) => (
              <div key={row.bucket}>
                <div className="mb-0.5 flex justify-between"><span className={bucketTextClass(row.bucket)}>{bucketLabel(row.bucket)}</span><b className={row.bucket === '>90' ? 'text-red-600' : ''}>{formatMoney(row.total)}</b></div>
                <div className="h-3 overflow-hidden rounded-md-full bg-slate-100"><div className={`h-full ${bucketBarClass(row.bucket)}`} style={{ width: percentage(row.total, totalAr) }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">👥 Top 5 ลูกหนี้</div>
          {!isLoading && topCustomers.length === 0 ? <div className="py-4 text-center text-xs text-emerald-600">✅ ไม่มีลูกหนี้</div> : null}
          <div className="space-y-2">
            {topCustomers.map((customer, index) => (
              <div key={customer.customerName} className="text-xs">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="w-4 text-center font-bold text-slate-400">{index + 1}</span>
                  <span className="flex-1 truncate">{customer.customerName}</span>
                  <span className="text-slate-400">{customer.bills} บิล</span>
                  <span className="w-24 text-right font-bold text-blue-700">{formatMoney(customer.total)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-md-full bg-slate-100"><div className="h-full bg-gradient-to-r from-blue-400 to-cyan-500" style={{ width: percentage(customer.total, topCustomers[0]?.total ?? 0) }} /></div>
                {customer.oldest > 0 ? <div className="ml-6 text-xs text-amber-600">⚠ เกินสุด {customer.oldest} วัน</div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md bg-white p-3 shadow">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="rounded-md border px-3 py-2 text-sm" value={customerId} onChange={(event) => { setPage(1); setCustomerId(event.target.value) }}>
            <option value="">ทุก Customer</option>
            {(data?.filters.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.code ? `${customer.code} - ${customer.name}` : customer.name}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={channelId} onChange={(event) => { setPage(1); setChannelId(event.target.value) }}>
            <option value="">ทุกช่องทาง</option>
            {(data?.filters.channels ?? []).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={bucket} onChange={(event) => { setPage(1); setBucket(event.target.value) }}>
            <option value="">ทุกอายุหนี้</option>
            <option value="Current">Current</option>
            <option value="1-30">1-30</option>
            <option value="31-60">31-60</option>
            <option value="61-90">61-90</option>
            <option value=">90">&gt;90</option>
          </select>
          <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : 'Export .xlsx'}</button>
        </div>
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" placeholder="ค้นหาเลขบิล / ลูกค้า / ช่องทาง / สาขา" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
          <select className="rounded-md border px-3 py-2 text-sm" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
            <option value="">ทุกสาขา</option>
            {(data?.filters.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}>
            <option value="">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <span className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
          <label className="text-xs text-slate-500">
            จากวันที่
            <DatePickerInput className="mt-1 w-full" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
          </label>
          <label className="text-xs text-slate-500">
            ถึงวันที่
            <DatePickerInput className="mt-1 w-full" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
          </label>
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => { setBranchId(''); setBucket(''); setChannelId(''); setCustomerId(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setTo('') }}>ล้างตัวกรอง</button>
        </div>
      </div>

      <DetailTable isLoading={isLoading} onSort={changeSort} rows={data?.rows ?? []} selectedSort={sortKey} sortDirection={sortDirection} onOpen={setSelectedRow} />

      <div className="flex items-center justify-end gap-2">
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
        <span className="text-sm text-slate-600">หน้า {page} / {totalPages}</span>
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</button>
      </div>

      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function DetailTable({ isLoading, onOpen, onSort, rows, selectedSort, sortDirection }: { isLoading: boolean; onOpen: (row: ArRow) => void; onSort: (key: SortKey) => void; rows: ArRow[]; selectedSort: SortKey; sortDirection: 'asc' | 'desc' }) {
  const sortLabel = (key: SortKey) => selectedSort === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <div className="overflow-x-auto rounded-md bg-white shadow">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('customerName')}>Customer{sortLabel('customerName')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('docNo')}>บิล{sortLabel('docNo')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('date')}>วันที่{sortLabel('date')}</button></th>
            <th className="p-2 text-left"><button type="button" onClick={() => onSort('dueDate')}>Due{sortLabel('dueDate')}</button></th>
            <th className="p-2 text-right"><button type="button" onClick={() => onSort('aging')}>อายุ(วัน){sortLabel('aging')}</button></th>
            <th className="p-2 text-right">ยอด</th>
            <th className="p-2 text-right">รับแล้ว</th>
            <th className="p-2 text-right"><button type="button" onClick={() => onSort('receivableBalance')}>ค้างรับ{sortLabel('receivableBalance')}</button></th>
            <th className="p-2 text-left">Channel</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่มีลูกหนี้คงค้าง</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.id} className={`border-t ${row.aging > 30 ? 'bg-red-50/50' : row.aging > 0 ? 'bg-amber-50/30' : ''}`}>
              <td className="p-2">{row.customerName}</td>
              <td className="p-2"><button className="font-mono text-xs text-blue-600" type="button" onClick={() => onOpen(row)}>{row.docNo}</button></td>
              <td className="p-2">{formatDateDisplay(row.date)}</td>
              <td className="p-2">{formatDateDisplay(row.dueDate)}</td>
              <td className={`p-2 text-right ${row.aging > 30 ? 'font-bold text-red-600' : row.aging > 0 ? 'text-amber-600' : ''}`}>{row.aging}</td>
              <td className="p-2 text-right">{formatMoney(row.totalAmount)}</td>
              <td className="p-2 text-right text-emerald-600">{formatMoney(row.receivedAmount)}</td>
              <td className="p-2 text-right font-bold text-amber-700">{formatMoney(row.receivableBalance)}</td>
              <td className="p-2">{row.channelName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: ArRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-md bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{row.docNo}</h2>
            <p className="text-sm text-slate-500">{row.customerName}</p>
          </div>
          <button className="rounded-md bg-slate-100 px-3 py-1 text-sm" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="space-y-4">
          {/* ข้อมูลเอกสาร */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">ข้อมูลเอกสาร</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailItem label="วันที่บิล" value={formatDateDisplay(row.date)} />
              <DetailItem label="ครบกำหนด" value={row.dueDate ? formatDateDisplay(row.dueDate) : '-'} />
              <DetailItem label="Credit term" value={`${row.creditTerm} วัน`} />
              <DetailItem label="อายุหนี้" value={`${row.aging} วัน (${row.bucket})`} />
              <DetailItem label="ช่องทางขาย" value={row.channelName || '-'} />
              <DetailItem label="สาขา" value={row.branchName || '-'} />
              <DetailItem label="ประเภท" value={row.transactionMode || '-'} />
            </div>
          </div>

          {/* ข้อมูลการเงิน */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">ข้อมูลการเงิน</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <DetailItem label="ยอดบิล" value={`${formatMoney(row.totalAmount)} บาท`} />
              <DetailItem label="รับแล้ว" value={`${formatMoney(row.receivedAmount)} บาท`} />
              <DetailItem label="ค้างรับ" value={`${formatMoney(row.receivableBalance)} บาท`} />
              <DetailItem label="สถานะ" value={row.status || '-'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1 ${className}`}>
      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
