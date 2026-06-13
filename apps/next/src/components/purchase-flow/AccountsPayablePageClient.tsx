'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

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
  const latestLoadRequestRef = useRef(0)
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
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<ApPayload>(`/api/finance/ap?${query.toString()}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด AP ไม่ได้')
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
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-red-600 via-rose-700 to-pink-800 p-6 text-white shadow-lg">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-md-full bg-white/10" />
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

        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">📊 Aging Buckets</div>
          <div className="space-y-2">
            {bucketRows.map((bucket) => (
              <div key={bucket.bucket} className="flex items-center gap-2 text-xs">
                <div className={`w-20 ${bucketTextClass(bucket.bucket)}`}>
                  {bucketLabel(bucket.bucket)}
                </div>
                <div className="relative h-5 flex-1 overflow-hidden rounded-md-full bg-slate-100">
                  <div className={`h-5 rounded-md-full ${bucketBarClass(bucket.bucket)}`} style={{ width: percentage(bucket.total, totalAp) }} />
                  <span className="absolute right-2 top-0 text-[10px] font-bold leading-5 text-slate-700">{bucket.bills} ใบ</span>
                </div>
                <div className="w-24 text-right font-bold text-slate-700">{formatMoney(bucket.total)}</div>
              </div>
            ))}
            {!isLoading && bucketRows.length === 0 ? <div className="py-4 text-center text-slate-400">ไม่มีเจ้าหนี้คงค้าง</div> : null}
          </div>
        </div>

        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Supplier ค้างจ่ายสูงสุด</div>
          <div className="space-y-1.5">
            {topSuppliers.map((supplier, index) => (
              <div key={supplier.supplierName} className="flex items-center gap-2 text-xs">
                <span className={`w-5 text-center font-bold ${index < 3 ? 'text-red-600' : 'text-slate-400'}`}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-700">{supplier.supplierName}</div>
                  <div className="text-[10px] text-slate-400">{supplier.bills} บิล · เกินสุด {supplier.oldest} วัน</div>
                </div>
                <div className="h-2.5 w-20 rounded-md-full bg-slate-100">
                  <div className="h-2.5 rounded-md-full bg-red-500" style={{ width: percentage(supplier.total, topSuppliers[0]?.total ?? 0) }} />
                </div>
                <div className="w-24 text-right font-bold text-red-700">{formatMoney(supplier.total)}</div>
              </div>
            ))}
            {!isLoading && topSuppliers.length === 0 ? <div className="py-4 text-center text-slate-400">ไม่มีเจ้าหนี้คงค้าง</div> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm">
        <Metric label="ค้างจ่ายรวม" tone="red" value={formatMoney(totalAp)} />
        <Metric label="เกินกำหนด" tone="amber" value={formatMoney(overdueAp)} />
        <Metric label="ครบใน 7 วัน" tone="yellow" value={formatMoney(dueIn7)} />
        <Metric label="บิลค้างจ่าย" value={`${data?.summary.bills ?? 0} ใบ`} />
        <Metric className="col-span-2 lg:col-span-1" label="Supplier ค้างจ่าย" value={`${data?.summary.suppliers ?? 0} ราย`} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {bucketRows.map((bucket) => (
          <div key={`card-${bucket.bucket}`} className={`rounded-md border-l-4 p-3 ${bucketCardClass(bucket.bucket)}`}>
            <div className="text-xs">อายุ {bucketLongLabel(bucket.bucket)}</div>
            <div className="text-base font-bold">{formatMoney(bucket.total)}</div>
            <div className="text-xs text-slate-500">{bucket.bills} ใบ</div>
          </div>
        ))}
      </div>

      <div className="rounded-md bg-white p-3 shadow">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <button className={`px-4 py-2 text-sm ${tab === 'summary' ? 'bg-red-600 text-white' : 'bg-white text-slate-600'}`} type="button" onClick={() => setTab('summary')}>📊 สรุปตาม Supplier</button>
            <button className={`border-l px-4 py-2 text-sm ${tab === 'detail' ? 'bg-red-600 text-white' : 'bg-white text-slate-600'}`} type="button" onClick={() => setTab('detail')}>📄 รายบิล</button>
          </div>
          <select className="rounded-md border px-3 py-2 text-sm" value={supplierId} onChange={(event) => { setPage(1); setSupplierId(event.target.value) }}>
            <option value="">ผู้ขายทั้งหมด</option>
            {(data?.filters.suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}</option>)}
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
          <button className="hidden md:inline-flex ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : '📥 Export .xlsx'}</button>
        </div>
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="rounded-md border px-3 py-2 text-sm lg:col-span-2" placeholder="ค้นหาเลขบิล / ผู้ขาย / ช่องทาง / สาขา" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
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
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => { setBranchId(''); setBucket(''); setChannelId(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setSupplierId(''); setTo('') }}>ล้างตัวกรอง</button>
        </div>
      </div>
      {tab === 'summary' ? <SummaryTable buckets={bucketRows} rows={data?.bySupplier ?? []} summary={data?.summary} isLoading={isLoading} /> : null}
      {tab === 'detail' ? <DetailTable isLoading={isLoading} onSort={changeSort} rows={data?.rows ?? []} selectedSort={sortKey} sortDirection={sortDirection} summaryTotal={data?.summary.total ?? 0} onOpen={setSelectedRow} /> : null}

      {/* Mobile Card list for Summary tab */}
      {tab === 'summary' && (
        <div className="block md:hidden space-y-3">
          {isLoading ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}
          
          {!isLoading && (data?.bySupplier ?? []).map((row) => (
            <div key={row.supplierName} className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2">
              <div className="flex justify-between items-start">
                <span className="font-bold text-slate-800 text-sm">{row.supplierName}</span>
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${row.oldest > 30 ? 'bg-red-100 text-red-700' : row.oldest > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                  {row.oldest > 0 ? `เกินกำหนด ${row.oldest} วัน` : 'ยังไม่ถึงกำหนด'}
                </span>
              </div>
              
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  <span className="font-semibold text-slate-500">จำนวนบิล: </span>
                  <span className="text-slate-800">{row.bills} ใบ</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60 mt-1">
                  <div>
                    <span className="font-semibold text-slate-500 block">ยอดค้างจ่ายรวม: </span>
                    <span className="text-red-700 font-bold tabular-nums">{formatMoney(row.total)} บาท</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400 block">Current (ไม่ถึงกำหนด): </span>
                    <span className="text-slate-600 tabular-nums">{formatMoney(row.current)} บาท</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!isLoading && (data?.bySupplier ?? []).length === 0 ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
              ไม่มีเจ้าหนี้คงค้าง
            </div>
          ) : null}
        </div>
      )}

      {/* Mobile Card list for Detail tab */}
      {tab === 'detail' && (
        <div className="block md:hidden space-y-3">
          {isLoading ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}
          
          {!isLoading && (data?.rows ?? []).map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2 active:bg-slate-50 cursor-pointer"
              onClick={() => setSelectedRow(row)}
            >
              <div className="flex justify-between items-start">
                <span className="font-bold text-slate-800 text-sm text-blue-600">{row.docNo}</span>
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${bucketClass(row.bucket)}`}>
                  {row.bucket} ({row.aging} วัน)
                </span>
              </div>
              
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  <span className="font-semibold text-slate-500">Supplier: </span>
                  <span className="text-slate-800">{row.supplierName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="font-semibold text-slate-500 block">วันที่บิล: </span>
                    <span className="text-slate-800">{formatDateDisplay(row.date)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 block">ครบกำหนด: </span>
                    <span className="text-slate-800">{formatDateDisplay(row.dueDate)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100/60 mt-1">
                  <div>
                    <span className="font-semibold text-slate-400 block">ยอดรวม: </span>
                    <span className="text-slate-800 tabular-nums">{formatMoney(row.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400 block">จ่ายแล้ว: </span>
                    <span className="text-emerald-600 tabular-nums">{formatMoney(row.paidAmount)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 block">ค้างจ่าย: </span>
                    <span className="text-red-700 font-bold tabular-nums">{formatMoney(row.payableBalance)}</span>
                  </div>
                </div>
                {row.channelName && (
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100/60 mt-1">
                    ช่องทาง: {row.channelName}
                  </div>
                )}
              </div>
            </div>
          ))}

          {!isLoading && (data?.rows ?? []).length === 0 ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
              ไม่มีเจ้าหนี้คงค้าง
            </div>
          ) : null}
        </div>
      )}

      {tab === 'detail' ? (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
          <span className="text-sm text-slate-600">หน้า {page} / {totalPages}</span>
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</button>
        </div>
      ) : null}
      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Metric({
  label,
  tone = 'slate',
  value,
  className = '',
}: {
  label: string
  tone?: 'red' | 'amber' | 'yellow' | 'slate'
  value: string
  className?: string
}) {
  const configs = {
    slate: {
      bg: 'bg-slate-100 text-slate-600',
      emoji: '📋',
      labelColor: 'text-slate-500',
      valueColor: 'text-slate-900',
    },
    red: {
      bg: 'bg-red-100 text-red-600',
      emoji: '💸',
      labelColor: 'text-red-600',
      valueColor: 'text-red-700',
    },
    amber: {
      bg: 'bg-amber-100 text-amber-600',
      emoji: '⚠️',
      labelColor: 'text-amber-600',
      valueColor: 'text-amber-700',
    },
    yellow: {
      bg: 'bg-yellow-100 text-yellow-600',
      emoji: '⏱️',
      labelColor: 'text-yellow-600',
      valueColor: 'text-yellow-700',
    },
  }

  const config = configs[tone]

  return (
    <div className={`bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4 ${className}`}>
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${config.bg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {config.emoji}
      </div>
      <div>
        <div className={`text-xs ${config.labelColor}`}>{label}</div>
        <div className={`font-bold ${config.valueColor}`}>{value}</div>
      </div>
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
    <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
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
    <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
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
              <td className="p-2">{formatDateDisplay(row.date)}</td>
              <td className="p-2">{formatDateDisplay(row.dueDate)}</td>
              <td className="p-2 text-center"><span className={`rounded-md px-2 py-0.5 text-xs ${bucketClass(row.bucket)}`}>{row.bucket} ({row.aging})</span></td>
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
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-3xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0">
        <DialogHeader className="p-4 bg-slate-900 text-white shrink-0 flex flex-row items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg font-bold text-white">{row.docNo}</DialogTitle>
            </div>
            <DialogDescription className="mt-1 text-xs text-slate-400">
              {row.supplierName}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4 text-sm">
          {/* ข้อมูลเอกสาร */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูลเอกสาร</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailItem label="วันที่บิล" value={formatDateDisplay(row.date)} />
              <DetailItem label="ครบกำหนด" value={formatDateDisplay(row.dueDate)} />
              <DetailItem label="Credit term" value={`${row.creditTerm} วัน`} />
              <DetailItem label="อายุหนี้" value={`${row.aging} วัน (${row.bucket})`} />
              <DetailItem label="ช่องทางซื้อ" value={row.channelName || '-'} />
              <DetailItem label="สาขา" value={row.branchName || '-'} />
              <DetailItem label="ประเภท" value={row.transactionMode || '-'} />
            </div>
          </div>

          {/* ข้อมูลการเงิน */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูลการเงิน</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <DetailItem label="ยอดบิล" value={`${formatMoney(row.totalAmount)} บาท`} />
              <DetailItem label="จ่ายแล้ว" value={`${formatMoney(row.paidAmount)} บาท`} />
              <DetailItem label="ค้างจ่าย" value={`${formatMoney(row.payableBalance)} บาท`} />
              <DetailItem label="สถานะ" value={row.status || '-'} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
          <Button className="font-normal" size="sm" type="button" variant="outline" onClick={onClose}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

