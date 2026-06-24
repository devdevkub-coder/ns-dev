'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

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
  marketScope: string
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
  summary: { bills: number; customers: number; domestic: number; dueIn7: number; overdue: number; overseas: number; pendingIssue: { cost: number; count: number; est: number }; total: number }
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
  const [tab, setTab] = useState<'summary' | 'detail'>('summary')
  const [bucket, setBucket] = useState('')
  const [branchId, setBranchId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [customerId, setCustomerId] = useState('')

  const customerOptions = useMemo(() => {
    const list = data?.filters.customers ?? []
    return [
      { id: '', label: 'ทุก Customer' },
      ...list.map((c) => ({
        id: c.id,
        label: c.code ? `${c.code} - ${c.name}` : c.name,
        searchText: `${c.code ?? ''} ${c.name}`,
      })),
    ]
  }, [data?.filters.customers])
  const [from, setFrom] = useState(currentMonthStart())
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [status, setStatus] = useState('')
  const [to, setTo] = useState(todayDateInput())
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const hasFilters = Boolean(branchId || bucket || channelId || customerId || from || q.trim() || status || to)


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
              <span className="font-bold text-amber-700">ใบส่งของ WTO รอเปิดบิลขาย (ยังไม่เป็น AR)</span>
              <span className="ml-2 text-xs text-amber-600">— pending out จากใบส่งของ</span>
            </div>
            <span className="text-xs text-slate-600">📦 {pendingIssue.count} ใบ</span>
            <span className="text-xs">💰 ต้นทุน: <b className="text-base text-red-600">{formatMoney(pendingIssue.cost)}</b></span>
            <span className="text-xs">📈 ยอดคาด: <b className="text-emerald-700">{formatMoney(pendingIssue.est)}</b></span>
          </div>
          <Link className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white" href="/sales/bills">→ เปิดบิลขาย</Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-600 p-5 text-white shadow-xl flex flex-col justify-between min-h-[180px]">
          <div className="absolute right-3 top-2 text-6xl opacity-15">📥</div>
          <div>
            <div className="text-xs opacity-90">📥 ลูกหนี้คงเหลือรวม</div>
            <div className="mt-1 text-3xl font-bold truncate">{formatMoney(totalAr)}</div>
            <div className="mt-3 space-y-0.5 text-sm opacity-90">
              <div>📋 บิลค้าง: <b>{data?.summary.bills ?? 0}</b> ใบ</div>
              <div>⚠ เกินกำหนด: <b>{formatMoney(overdueAr)}</b> ({overduePercent}%)</div>
            </div>
          </div>
          <div className="border-t border-white/20 mt-4 pt-4">
            <div className="text-xs opacity-90 mb-2">🌍 สรุปประเภทลูกหนี้</div>
            <div className="grid grid-cols-2 gap-2 text-xs opacity-95">
              <div>
                <div className="text-[10px] opacity-75">🇹🇭 ในประเทศ</div>
                <div className="text-sm font-bold text-white mt-0.5">{formatMoney(data?.summary.domestic ?? 0)}</div>
              </div>
              <div>
                <div className="text-[10px] opacity-75">🌐 ต่างประเทศ</div>
                <div className="text-sm font-bold text-white mt-0.5">{formatMoney(data?.summary.overseas ?? 0)}</div>
              </div>
            </div>
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

        <div className="rounded-md bg-white p-4 shadow sm:col-span-2 lg:col-span-1">
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

      {/* Filters Toolbar */}
      <div className="rounded-md bg-white p-3 shadow">
        {/* Desktop View */}
        <div className="hidden lg:block space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex p-0.5 bg-slate-100 rounded-lg gap-1 border border-slate-200 h-10 items-center shrink-0">
              <button
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all h-8 ${
                  tab === 'summary' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                type="button"
                onClick={() => setTab('summary')}
              >
                📊 สรุปตาม Customer
              </button>
              <button
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all h-8 ${
                  tab === 'detail' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                type="button"
                onClick={() => setTab('detail')}
              >
                📄 รายบิล
              </button>
            </div>

            <input className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" placeholder="ค้นหาเลขบิล / ลูกค้า / ช่องทาง / สาขา" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
            
            <div className="min-w-[260px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm rounded-lg border-slate-300 focus:border-slate-400 focus:ring-0 outline-none"
                inputId="ar-customer-filter"
                label="Customer"
                options={customerOptions}
                placeholder="ทุก Customer"
                value={customerId}
                onChange={(value) => {
                  setPage(1)
                  setCustomerId(value)
                }}
              />
            </div>
            
            <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={channelId} onChange={(event) => { setPage(1); setChannelId(event.target.value) }}>
              <option value="">ทุกช่องทาง</option>
              {(data?.filters.channels ?? []).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </select>
            
            <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={bucket} onChange={(event) => { setPage(1); setBucket(event.target.value) }}>
              <option value="">ทุกอายุหนี้</option>
              <option value="Current">Current</option>
              <option value="1-30">1-30</option>
              <option value="31-60">31-60</option>
              <option value="61-90">61-90</option>
              <option value=">90">&gt;90</option>
            </select>
            
            <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-emerald-700 transition-colors flex items-center" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>{isExporting ? 'กำลัง Export...' : 'Export .xlsx'}</button>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
              <option value="">ทุกสาขา</option>
              {(data?.filters.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            
            <select className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}>
              <option value="">ทุกสถานะ</option>
              {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            
            <span className="text-xs text-slate-500">วันที่บิล:</span>
            <DatePickerInput className="w-[130px]" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
            <span className="text-slate-400">→</span>
            <DatePickerInput className="w-[130px]" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
            
            {hasFilters && (
              <button className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors" type="button" onClick={() => { setBranchId(''); setBucket(''); setChannelId(''); setCustomerId(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setTo('') }}>✕ ล้าง</button>
            )}
            
            <span className="ml-auto text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
          </div>
        </div>

        {/* Mobile View (Collapsible Filters) */}
        <div className="block lg:hidden space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <div className="flex p-0.5 bg-slate-100 rounded-lg gap-1 border border-slate-200 shrink-0">
              <button
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  tab === 'summary' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'
                }`}
                type="button"
                onClick={() => setTab('summary')}
              >
                📊 สรุปตาม Customer
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  tab === 'detail' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'
                }`}
                type="button"
                onClick={() => setTab('detail')}
              >
                📄 รายบิล
              </button>
            </div>

            <button
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง
            </button>
            <button
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 shrink-0 ml-auto"
              disabled={isExporting}
              type="button"
              onClick={() => void exportXlsx()}
            >
              {isExporting ? '...' : '📥 .xlsx'}
            </button>
          </div>

          <div className="relative w-full">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm pr-8"
              placeholder="ค้นหาบิล / ลูกค้า / ช่องทาง..."
              type="search"
              value={q}
              onChange={(event) => { setPage(1); setQ(event.target.value) }}
            />
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm rounded-lg border-slate-300 focus:border-slate-400 focus:ring-0 outline-none w-full"
                inputId="ar-customer-filter-mobile"
                label="Customer"
                options={customerOptions}
                placeholder="ทุก Customer"
                value={customerId}
                onChange={(value) => {
                  setPage(1)
                  setCustomerId(value)
                }}
              />
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={channelId} onChange={(event) => { setPage(1); setChannelId(event.target.value) }}>
                <option value="">ทุกช่องทาง</option>
                {(data?.filters.channels ?? []).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={bucket} onChange={(event) => { setPage(1); setBucket(event.target.value) }}>
                <option value="">ทุกอายุหนี้</option>
                <option value="Current">Current</option>
                <option value="1-30">1-30</option>
                <option value="31-60">31-60</option>
                <option value="61-90">61-90</option>
                <option value=">90">&gt;90</option>
              </select>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
                <option value="">ทุกสาขา</option>
                {(data?.filters.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}>
                <option value="">ทุกสถานะ</option>
                {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
                </label>
                <label className="text-[11px] text-slate-500">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
                </label>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
                <button className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={() => { setBranchId(''); setBucket(''); setChannelId(''); setCustomerId(''); setFrom(''); setPage(1); setQ(''); setStatus(''); setTo('') }}>ล้างตัวกรอง</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {tab === 'summary' ? <SummaryTable buckets={bucketRows} rows={data?.byCustomer ?? []} summary={data?.summary} isLoading={isLoading} /> : null}
      {tab === 'detail' ? <DetailTable isLoading={isLoading} onSort={changeSort} rows={data?.rows ?? []} selectedSort={sortKey} sortDirection={sortDirection} onOpen={setSelectedRow} /> : null}

      {/* Mobile Card list for Summary tab */}
      {tab === 'summary' && (
        <div className="block lg:hidden space-y-3">
          {isLoading ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}

          {!isLoading && (data?.byCustomer ?? []).map((row) => (
            <div key={row.customerName} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold text-slate-900 text-[15px] leading-snug">{row.customerName}</span>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold shrink-0 ${row.oldest > 30 ? 'bg-red-100 text-red-700' : row.oldest > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                  {row.oldest > 0 ? `เกินกำหนด ${row.oldest} วัน` : 'ยังไม่ถึงกำหนด'}
                </span>
              </div>

              <div className="text-xs text-slate-600 space-y-2">
                <div className="text-sm font-medium">
                  จำนวนบิล: <span className="text-slate-800">{row.bills} ใบ</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 font-mono text-[13px]">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold">ยอดค้างรับรวม:</span>
                    <span className="text-blue-700 font-bold tabular-nums">{formatMoney(row.total)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold">Current:</span>
                    <span className="text-slate-600 tabular-nums">{formatMoney(row.current)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!isLoading && (data?.byCustomer ?? []).length === 0 ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-200">
              ไม่มีลูกหนี้คงค้าง
            </div>
          ) : null}
        </div>
      )}

      {/* Mobile Card list for Detail tab */}
      {tab === 'detail' && (
        <div className="block lg:hidden space-y-3">
          {isLoading ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}
          {!isLoading && (data?.rows ?? []).length === 0 ? (
            <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-200">ไม่มีลูกหนี้คงค้าง</div>
          ) : null}
          {!isLoading && (data?.rows ?? []).map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm space-y-3.5 active:bg-slate-50 cursor-pointer"
              onClick={() => setSelectedRow(row)}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold text-slate-900 text-[15px] line-clamp-2 leading-snug flex-1 pr-1">{row.customerName}</span>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold shrink-0 ${row.aging > 30 ? 'bg-red-100 text-red-700' : row.aging > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {row.aging > 0 ? `เกินกำหนด ${row.aging} วัน` : 'ยังไม่ถึงกำหนด'}
                </span>
              </div>
              <div className="text-xs text-slate-600 space-y-2">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span>บิล: <span className="font-mono text-blue-600 font-semibold">{row.docNo}</span></span>
                  <span className="text-slate-400 text-xs">{row.channelName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">วันที่บิล:</span>
                    <span className="text-slate-700 font-medium">{formatDateDisplay(row.date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">ครบกำหนด:</span>
                    <span className="text-slate-700 font-medium">{formatDateDisplay(row.dueDate)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 font-mono text-[13px]">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold">ยอดรวม:</span>
                    <span className="text-slate-800 tabular-nums">{formatMoney(row.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-semibold">รับแล้ว:</span>
                    <span className="text-emerald-700 tabular-nums">{formatMoney(row.receivedAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold">ค้างรับ:</span>
                    <span className="text-amber-700 font-bold tabular-nums">{formatMoney(row.receivableBalance)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'detail' && (
        <div className="flex items-center justify-end gap-2">
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
          <span className="text-sm text-slate-600">หน้า {page} / {totalPages}</span>
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</button>
        </div>
      )}

      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

const detailColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'customerName', defaultWidth: 200 },
  { key: 'docNo', defaultWidth: 120 },
  { key: 'date', defaultWidth: 100 },
  { key: 'dueDate', defaultWidth: 100 },
  { key: 'aging', defaultWidth: 90 },
  { key: 'totalAmount', defaultWidth: 100 },
  { key: 'receivedAmount', defaultWidth: 100 },
  { key: 'receivableBalance', defaultWidth: 100 },
  { key: 'channelName', defaultWidth: 100 },
]

function DetailTable({ isLoading, onOpen, onSort, rows, selectedSort, sortDirection }: { isLoading: boolean; onOpen: (row: ArRow) => void; onSort: (key: SortKey) => void; rows: ArRow[]; selectedSort: SortKey; sortDirection: 'asc' | 'desc' }) {
  const columnResize = useResizableColumns('finance.ar.detail.v5', detailColumns)
  return (
    <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-200/60 bg-white shadow-sm overflow-hidden">
      <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
        {columnResize.hasCustomWidths ? (
          <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
      <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
        <colgroup>
          {detailColumns.map((col) => (
            <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
          ))}
        </colgroup>
        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
          <tr>
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="Customer" resizeProps={columnResize.getResizeHandleProps('customerName', 'Customer')} sortKey="customerName" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="บิล" resizeProps={columnResize.getResizeHandleProps('docNo', 'บิล')} sortKey="docNo" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} direction={sortDirection} label="Due" resizeProps={columnResize.getResizeHandleProps('dueDate', 'Due')} sortKey="dueDate" onSort={onSort} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="อายุ(วัน)" resizeProps={columnResize.getResizeHandleProps('aging', 'อายุ(วัน)')} sortKey="aging" onSort={onSort} />
            <ResizableTableHead align="right" label="ยอด" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'ยอด')} />
            <ResizableTableHead align="right" label="รับแล้ว" resizeProps={columnResize.getResizeHandleProps('receivedAmount', 'รับแล้ว')} />
            <ResizableTableHead activeSortKey={selectedSort} align="right" direction={sortDirection} label="ค้างรับ" resizeProps={columnResize.getResizeHandleProps('receivableBalance', 'ค้างรับ')} sortKey="receivableBalance" onSort={onSort} />
            <ResizableTableHead label="Channel" resizeProps={columnResize.getResizeHandleProps('channelName', 'Channel')} />
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่มีลูกหนี้คงค้าง</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.id} className={`border-t border-slate-100 ${row.aging > 30 ? 'bg-red-50/50' : row.aging > 0 ? 'bg-amber-50/30' : ''}`}>
              <td className="px-4 py-3.5">{row.customerName}</td>
              <td className="px-4 py-3.5"><button className="font-mono text-xs text-blue-600" type="button" onClick={() => onOpen(row)}>{row.docNo}</button></td>
              <td className="px-4 py-3.5">{formatDateDisplay(row.date)}</td>
              <td className="px-4 py-3.5">{formatDateDisplay(row.dueDate)}</td>
              <td className={`p-2 text-right ${row.aging > 30 ? 'font-bold text-red-600' : row.aging > 0 ? 'text-amber-600' : ''}`}>{row.aging}</td>
              <td className="px-4 py-3.5 text-right">{formatMoney(row.totalAmount)}</td>
              <td className="px-4 py-3.5 text-right text-emerald-600">{formatMoney(row.receivedAmount)}</td>
              <td className="px-4 py-3.5 text-right font-bold text-amber-700">{formatMoney(row.receivableBalance)}</td>
              <td className="px-4 py-3.5">{row.channelName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: ArRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">{row.docNo}</h2>
            <p className="text-xs text-slate-300 mt-0.5">{row.customerName}</p>
          </div>
          <button className="text-3xl text-white/80 hover:text-white" type="button" onClick={onClose}>&times;</button>
        </div>
        <div className="space-y-4 p-5">
          {/* ข้อมูลเอกสาร */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-200">ข้อมูลเอกสาร</div>
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
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-200">ข้อมูลการเงิน</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <DetailItem label="ยอดบิล" value={`${formatMoney(row.totalAmount)} บาท`} />
              <DetailItem label="รับแล้ว" value={`${formatMoney(row.receivedAmount)} บาท`} />
              <DetailItem label="ค้างรับ" value={`${formatMoney(row.receivableBalance)} บาท`} />
              <DetailItem label="สถานะ" value={row.status || '-'} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100/50" type="button" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1.5 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-sm sm:text-base font-bold text-slate-800">{value}</div>
    </div>
  )
}

function moneyOrDash(value: number) {
  return value ? formatMoney(value) : '-'
}

const summaryColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'customerName', defaultWidth: 200 },
  { key: 'bills', defaultWidth: 60 },
  { key: 'current', defaultWidth: 100 },
  { key: 'b30', defaultWidth: 100 },
  { key: 'b60', defaultWidth: 100 },
  { key: 'b90', defaultWidth: 100 },
  { key: 'gt90', defaultWidth: 100 },
  { key: 'total', defaultWidth: 120 },
  { key: 'oldest', defaultWidth: 100 },
]

function SummaryTable({
  buckets,
  isLoading,
  rows,
  summary,
}: {
  buckets: ArPayload['byBucket']
  isLoading: boolean
  rows: ArPayload['byCustomer']
  summary: ArPayload['summary'] | undefined
}) {
  const bucketTotal = (bucket: string) => buckets.find((item) => item.bucket === bucket)?.total ?? 0
  const columnResize = useResizableColumns('finance.ar.summary.v5', summaryColumns)

  return (
    <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-200/60 bg-white shadow-sm overflow-hidden">
      <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
        {columnResize.hasCustomWidths ? (
          <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
      <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
        <colgroup>
          {summaryColumns.map((col) => (
            <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
          ))}
        </colgroup>
        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
          <tr>
            <ResizableTableHead label="Customer" resizeProps={columnResize.getResizeHandleProps('customerName', 'Customer')} />
            <ResizableTableHead align="right" label="บิล" resizeProps={columnResize.getResizeHandleProps('bills', 'บิล')} />
            <ResizableTableHead align="right" label="Current" resizeProps={columnResize.getResizeHandleProps('current', 'Current')} />
            <ResizableTableHead align="right" label="1-30 วัน" resizeProps={columnResize.getResizeHandleProps('b30', '1-30 วัน')} />
            <ResizableTableHead align="right" label="31-60" resizeProps={columnResize.getResizeHandleProps('b60', '31-60')} />
            <ResizableTableHead align="right" label="61-90" resizeProps={columnResize.getResizeHandleProps('b90', '61-90')} />
            <ResizableTableHead align="right" label="&gt;90" resizeProps={columnResize.getResizeHandleProps('gt90', '&gt;90')} />
            <ResizableTableHead align="right" label="รวมค้างรับ" resizeProps={columnResize.getResizeHandleProps('total', 'รวมค้างรับ')} />
            <ResizableTableHead align="right" label="เกินกำหนดสุด" resizeProps={columnResize.getResizeHandleProps('oldest', 'เกินกำหนดสุด')} />
          </tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่มีลูกหนี้คงค้าง</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.customerName} className={`border-t border-slate-100 hover:bg-blue-50/10 ${row.oldest > 30 ? 'bg-red-50/40' : row.oldest > 0 ? 'bg-amber-50/30' : ''}`}>
              <td className="p-2 font-medium">{row.customerName}</td>
              <td className="p-2 text-right">{row.bills}</td>
              <td className="p-2 text-right text-slate-600">{moneyOrDash(row.current)}</td>
              <td className="p-2 text-right text-blue-700">{moneyOrDash(row.b30)}</td>
              <td className="p-2 text-right text-amber-700">{moneyOrDash(row.b60)}</td>
              <td className="p-2 text-right text-orange-700">{moneyOrDash(row.b90)}</td>
              <td className="p-2 text-right font-bold text-red-700">{moneyOrDash(row.gt90)}</td>
              <td className="p-2 text-right text-base font-bold text-blue-700">{formatMoney(row.total)}</td>
              <td className={`p-2 text-right ${row.oldest > 30 ? 'font-bold text-red-700' : row.oldest > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{row.oldest > 0 ? `${row.oldest} วัน` : '-'}</td>
            </tr>
          ))}
        </tbody>
        {!isLoading && rows.length > 0 ? (
          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td className="p-2">รวมทั้งหมด ({rows.length} Customer)</td>
              <td className="p-2 text-right">{summary?.bills ?? 0}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('Current'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('1-30'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('31-60'))}</td>
              <td className="p-2 text-right">{formatMoney(bucketTotal('61-90'))}</td>
              <td className="p-2 text-right text-red-700">{formatMoney(bucketTotal('>90'))}</td>
              <td className="p-2 text-right text-lg text-blue-700">{formatMoney(summary?.total ?? 0)}</td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}
