'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type CustomerTrackingRow = {
  agingBuckets: Array<{ amount: number; bucket: string; count: number }>
  avgSell: number
  billCount: number
  code: string
  cogs: number
  creditLimit: number
  creditUtilizationPct: number
  customerName: string
  gp: number
  gpPct: number
  id: string
  lowMarginBillCount: number
  negativeMarginBillCount: number
  oldestArAgeDays: number
  overdueArAmount: number
  overdueArBillCount: number
  pendingArBillCount: number
  profitPerKg: number
  qty: number
  receivable: number
  receivedAmount: number
  revenue: number
}
type CustomerTrackingPayload = {
  detail?: CustomerTrackingDetail | null
  filters: { customers: Array<{ active: boolean | null; code: string | null; id: string; name: string }> }
  monthly: Array<{ gp: number; month: string; qty: number; revenue: number }>
  rows: CustomerTrackingRow[]
  summary: { cogs: number; customers: number; gp: number; qty: number; receivable: number; receivedAmount: number; revenue: number }
  year: string
}

type CustomerTrackingDetail = {
  bills: Array<{ ageBucket: string; ageDays: number; channelName: string; cogs: number; date: string; docNo: string; dueDate: string; gp: number; href: string; qty: number; receivable: number; received: number; referenceDateType: string; revenue: number; status: string }>
  channels: Array<{ billCount: number; channelName: string; cogs: number; gp: number; gpPct: number; qty: number; revenue: number }>
  customer: { code: string; id: string; name: string }
  monthly: Array<{ billCount: number; gp: number; month: string; qty: number; receivable: number; receiptCount: number; receivedAmount: number; revenue: number }>
  products: Array<{ avgSell: number; cogs: number; gp: number; gpPct: number; productName: string; qty: number; revenue: number }>
  receipts: Array<{ amount: number; date: string; docNo: string; href: string; method: string; netAmount: number; status: string }>
  signals: {
    agingBuckets: Array<{ amount: number; bucket: string; count: number }>
    creditLimit: number
    creditUtilizationPct: number
    gpPct: number
    lowMarginBillCount: number
    negativeMarginBillCount: number
    oldestArAgeDays: number
    overdueArAmount: number
    overdueArBillCount: number
    pendingArAmount: number
    pendingArBillCount: number
  }
}

type DetailCell = string | { href: string; label: string }

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function CustomerTrackingPageClient() {
  const [customerId, setCustomerId] = useState('')
  const [data, setData] = useState<CustomerTrackingPayload | null>(null)
  const [detail, setDetail] = useState<CustomerTrackingDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year })
    if (month) params.set('month', month)
    if (customerId) params.set('customerId', customerId)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [customerId, month, search, year])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<CustomerTrackingPayload>(`/api/tracking/customer?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Customer Tracking ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openDetail = useCallback(async (row: CustomerTrackingRow) => {
    setIsDetailLoading(true)
    setDetail({
      bills: [],
      channels: [],
      customer: { code: row.code, id: row.id, name: row.customerName },
      monthly: [],
      products: [],
      receipts: [],
      signals: {
        agingBuckets: row.agingBuckets,
        creditLimit: row.creditLimit,
        creditUtilizationPct: row.creditUtilizationPct,
        gpPct: row.gpPct,
        lowMarginBillCount: row.lowMarginBillCount,
        negativeMarginBillCount: row.negativeMarginBillCount,
        oldestArAgeDays: row.oldestArAgeDays,
        overdueArAmount: row.overdueArAmount,
        overdueArBillCount: row.overdueArBillCount,
        pendingArAmount: row.receivable,
        pendingArBillCount: row.pendingArBillCount,
      },
    })
    try {
      const params = new URLSearchParams(queryString)
      params.set('detailId', row.id)
      const payload = await dailyFetchJson<CustomerTrackingPayload>(`/api/tracking/customer?${params.toString()}`)
      setDetail(payload.detail ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียด Customer ไม่ได้')
      setDetail(null)
    } finally {
      setIsDetailLoading(false)
    }
  }, [queryString])

  const rows = data?.rows ?? []
  const topRevenue = [...rows].sort((left, right) => right.revenue - left.revenue).slice(0, 10)
  const topGp = [...rows].sort((left, right) => right.gp - left.gp).slice(0, 10)
  const topGpPct = [...rows].filter((row) => row.revenue > 0).sort((left, right) => right.gpPct - left.gpPct).slice(0, 10)
  const topReceivable = [...rows].sort((left, right) => right.receivable - left.receivable).slice(0, 10)
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const exportHref = `/api/tracking/customer?${queryString}&format=xlsx`

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-5">
        <SummaryCard icon="👥" label="ลูกค้า" tone="emerald" value={`${data?.summary.customers ?? 0}`} />
        <SummaryCard icon="⚖️" label="น้ำหนัก" tone="blue" value={`${formatMoney(data?.summary.qty ?? 0)} กก.`} />
        <SummaryCard icon="💰" label="ยอดขาย" tone="emerald" value={formatMoney(data?.summary.revenue ?? 0)} />
        <SummaryCard icon="📈" label="GP" tone="violet" value={formatMoney(data?.summary.gp ?? 0)} />
        <SummaryCard className="col-span-2 lg:col-span-1" icon="🧾" label="ลูกหนี้" tone="amber" value={formatMoney(data?.summary.receivable ?? 0)} />
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-sm">
        {/* Desktop View */}
        <div className="hidden lg:block space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              type="number"
              placeholder="ปี ค.ศ."
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="">ทั้งปี</option>
              {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
            </select>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-[200px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">ลูกค้าทั้งหมด</option>
              {(data?.filters.customers ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code ? `${customer.code} - ${customer.name}` : customer.name}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-[200px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              placeholder="ค้นหา Customer"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            
            <a
              className="ml-auto inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-center text-sm font-bold text-white hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              href={exportHref}
            >
              📥 Export Excel
            </a>
          </div>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
              placeholder="ค้นหา Customer..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className={`h-10 rounded-md border px-3 text-sm font-semibold transition-colors flex items-center gap-1 shrink-0 focus-visible:outline-none ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-100'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง
            </button>
            <a
              className="h-10 inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-bold text-white shrink-0"
              href={exportHref}
            >
              📥 XLSX
            </a>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500 font-semibold">
                  ปี
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                    type="number"
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                  />
                </label>
                <label className="text-[11px] text-slate-500 font-semibold">
                  เดือน
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  >
                    <option value="">ทั้งปี</option>
                    {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
                  </select>
                </label>
              </div>
              <label className="text-[11px] text-slate-500 font-semibold">
                เลือกลูกค้า
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">ลูกค้าทั้งหมด</option>
                  {(data?.filters.customers ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.code ? `${customer.code} - ${customer.name}` : customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end pt-1">
                <button
                  className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors focus-visible:outline-none"
                  type="button"
                  onClick={() => {
                    setYear(String(new Date().getFullYear()))
                    setMonth('')
                    setCustomerId('')
                    setSearch('')
                  }}
                >
                  ล้างตัวกรอง
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl bg-white p-2 border border-slate-100 shadow-sm">
        <Tab active={view === 'list'} label="รายการ + สถิติ" onClick={() => setView('list')} />
        <Tab active={view === 'top10'} label="Top 10 + วิเคราะห์" onClick={() => setView('top10')} />
        <Tab active={view === 'yearCompare'} label="รายปี (12 เดือน)" onClick={() => setView('yearCompare')} />
      </div>

      {view === 'yearCompare' ? <YearCompare monthly={data?.monthly ?? []} /> : null}
      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel color="emerald" rows={topRevenue.map((row) => ({ label: row.customerName, value: row.revenue }))} title="Top 10 ยอดขาย" />
          <TopPanel color="teal" rows={topGp.map((row) => ({ label: row.customerName, value: row.gp }))} title="Top 10 GP" />
          <TopPanel color="blue" rows={topGpPct.map((row) => ({ label: row.customerName, value: row.gpPct }))} suffix="%" title="Top 10 GP%" />
          <TopPanel color="amber" rows={topReceivable.map((row) => ({ label: row.customerName, value: row.receivable }))} title="Top 10 ลูกหนี้" />
        </div>
      ) : null}

      {view === 'list' ? (
        <>
        <div className="space-y-3 lg:hidden">
          {isLoading ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
          {!isLoading && rows.length === 0 ? <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400 shadow-sm">ไม่มีข้อมูล Customer Tracking</div> : null}
          {!isLoading && rows.map((row) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm active:bg-slate-50/50 cursor-pointer transition-colors focus-visible:outline-none" role="button" tabIndex={0} onClick={() => void openDetail(row)} onKeyDown={(event) => { if (event.key === 'Enter') void openDetail(row) }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{row.customerName}</div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">{row.code || '-'}</div>
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 shrink-0">{row.billCount} บิล</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-2 text-xs">
                <MiniLine label="ยอดขาย" tone="emerald" value={formatMoney(row.revenue)} />
                <MiniLine label="GP" tone={row.gp >= 0 ? 'emerald' : 'red'} value={formatMoney(row.gp)} />
                <MiniLine label="น้ำหนัก" value={`${formatMoney(row.qty)} กก.`} />
                <MiniLine label="ลูกหนี้" tone="amber" value={formatMoney(row.receivable)} />
                <MiniLine label="เกินกำหนด" tone={row.overdueArAmount > 0 ? 'red' : 'slate'} value={formatMoney(row.overdueArAmount)} />
                <MiniLine label="บิลค้าง AR" tone="amber" value={`${row.pendingArBillCount}`} />
                <MiniLine label="เก่าสุด" tone={row.oldestArAgeDays > 30 ? 'red' : 'slate'} value={`${row.oldestArAgeDays} วัน`} />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl bg-white border border-slate-100 shadow-sm lg:block">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold">
              <tr>
                <th className="p-3 pl-4 text-left">Code</th>
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-right">บิล</th>
                <th className="p-3 text-right">น้ำหนัก</th>
                <th className="p-3 text-right">ยอดขาย</th>
                <th className="p-3 text-right">ราคาเฉลี่ย</th>
                <th className="p-3 text-right">COGS</th>
                <th className="p-3 text-right">GP</th>
                <th className="p-3 text-right">GP%</th>
                <th className="p-3 text-right">฿/กก.</th>
                <th className="p-3 text-right">รับเงิน</th>
                <th className="p-3 text-right">ลูกหนี้</th>
                <th className="p-3 text-right">เกินกำหนด</th>
                <th className="p-3 text-right">เก่าสุด</th>
                <th className="p-3 text-right">บิลค้าง AR</th>
                <th className="p-3 pr-4 text-right">ใช้เครดิต</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={16}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={16}>ไม่มีข้อมูล Customer Tracking</td></tr> : null}
              {!isLoading && rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t border-slate-100 hover:bg-emerald-50/30 transition-colors focus-visible:outline-none" onClick={() => void openDetail(row)}>
                  <td className="p-3 pl-4 font-mono text-xs text-slate-400">{row.code || '-'}</td>
                  <td className="p-3 font-medium text-slate-800">{row.customerName}</td>
                  <td className="p-3 text-right text-slate-700">{row.billCount}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.qty)}</td>
                  <td className="p-3 text-right font-mono font-semibold text-emerald-700">{formatMoney(row.revenue)}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.avgSell)}</td>
                  <td className="p-3 text-right font-mono text-red-600">{formatMoney(row.cogs)}</td>
                  <td className={`p-3 text-right font-mono font-semibold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(row.gp)}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{row.gpPct.toFixed(2)}%</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.profitPerKg)}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.receivedAmount)}</td>
                  <td className="p-3 text-right font-mono text-amber-700 font-semibold">{formatMoney(row.receivable)}</td>
                  <td className="p-3 text-right font-mono text-red-600">{formatMoney(row.overdueArAmount)}</td>
                  <td className={`p-3 text-right font-mono ${row.oldestArAgeDays > 30 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>{row.oldestArAgeDays}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{row.pendingArBillCount}</td>
                  <td className={`p-3 pr-4 text-right font-mono ${row.creditUtilizationPct >= 100 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>{row.creditUtilizationPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : null}

      <CustomerDetailDialog detail={detail} isLoading={isDetailLoading} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </section>
  )
}

function CustomerDetailDialog({ detail, isLoading, onOpenChange }: { detail: CustomerTrackingDetail | null; isLoading: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden !p-0" fallbackTitle="Customer Tracking Detail">
        <DialogHeader className="bg-slate-900 px-5 py-4 flex flex-col space-y-1">
          <DialogTitle className="text-xl font-bold text-white">{detail?.customer.name ?? 'รายละเอียด Customer'}</DialogTitle>
          <DialogDescription className="text-xs text-slate-300 mt-0.5">
            {detail?.customer.code ? `${detail.customer.code} · ` : ''}Sales Bills / Receipts / Monthly movement / Product breakdown
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
          {isLoading ? <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500 border border-slate-100">กำลังโหลดรายละเอียด...</div> : null}
          {!isLoading && detail ? (
            <>
              <DetailSection title="Decision Signals">
                <div className="grid grid-cols-2 gap-2.5 p-3 md:grid-cols-3 lg:grid-cols-5">
                  <SignalMetric label="Pending AR" value={formatMoney(detail.signals.pendingArAmount)} />
                  <SignalMetric label="บิลค้าง AR" value={`${detail.signals.pendingArBillCount} บิล`} />
                  <SignalMetric label="AR เกินกำหนด" value={formatMoney(detail.signals.overdueArAmount)} />
                  <SignalMetric label="บิลเกินกำหนด" value={`${detail.signals.overdueArBillCount} บิล`} />
                  <SignalMetric label="เก่าสุด" value={`${detail.signals.oldestArAgeDays} วัน`} />
                  <SignalMetric label="ใช้เครดิต" value={`${detail.signals.creditUtilizationPct.toFixed(1)}%`} />
                  <SignalMetric label="GP%" value={`${detail.signals.gpPct.toFixed(2)}%`} />
                  <SignalMetric label="บิล Margin ต่ำ" value={`${detail.signals.lowMarginBillCount} บิล`} />
                  <SignalMetric label="บิล GP ติดลบ" value={`${detail.signals.negativeMarginBillCount} บิล`} />
                  <SignalMetric label="Credit Limit" value={formatMoney(detail.signals.creditLimit)} />
                </div>
              </DetailSection>
              <DetailSection title="AR Aging Buckets">
                <SimpleTable
                  headers={['Bucket', 'บิล', 'ยอดค้าง']}
                  rows={detail.signals.agingBuckets.map((row) => [row.bucket, String(row.count), formatMoney(row.amount)])}
                />
              </DetailSection>
              <DetailSection title="Sales Bill">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'Due', 'Bucket', 'อายุ', 'ช่องทาง', 'น้ำหนัก', 'ยอดขาย', 'COGS', 'GP', 'รับเงิน', 'ลูกหนี้', 'สถานะ']}
                  rows={detail.bills.map((row) => [
                    formatDateDisplay(row.date),
                    { href: row.href, label: row.docNo },
                    formatDateDisplay(row.dueDate),
                    row.ageBucket,
                    `${row.ageDays} วัน`,
                    row.channelName,
                    formatMoney(row.qty),
                    formatMoney(row.revenue),
                    formatMoney(row.cogs),
                    formatMoney(row.gp),
                    formatMoney(row.received),
                    formatMoney(row.receivable),
                    row.status,
                  ])}
                />
              </DetailSection>
              <DetailSection title="Channel Breakdown">
                <SimpleTable
                  headers={['ช่องทาง', 'บิล', 'น้ำหนัก', 'ยอดขาย', 'COGS', 'GP', 'GP%']}
                  rows={detail.channels.map((row) => [row.channelName, String(row.billCount), formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.cogs), formatMoney(row.gp), `${row.gpPct.toFixed(2)}%`])}
                />
              </DetailSection>
              <DetailSection title="Receipt">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'วิธีรับเงิน', 'ยอดรับ', 'สุทธิ', 'สถานะ']}
                  rows={detail.receipts.map((row) => [formatDateDisplay(row.date), { href: row.href, label: row.docNo }, row.method, formatMoney(row.amount), formatMoney(row.netAmount), row.status])}
                />
              </DetailSection>
              <DetailSection title="Monthly Movement">
                <SimpleTable
                  headers={['เดือน', 'บิล', 'รับเงิน', 'น้ำหนัก', 'ยอดขาย', 'GP', 'รับแล้ว', 'ลูกหนี้']}
                  rows={detail.monthly.map((row, index) => [monthLabels[index] ?? row.month, String(row.billCount), String(row.receiptCount), formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.gp), formatMoney(row.receivedAmount), formatMoney(row.receivable)])}
                />
              </DetailSection>
              <DetailSection title="Product Breakdown">
                <SimpleTable
                  headers={['สินค้า', 'น้ำหนัก', 'ยอดขาย', 'ราคาเฉลี่ย', 'COGS', 'GP', 'GP%']}
                  rows={detail.products.map((row) => [row.productName, formatMoney(row.qty), formatMoney(row.revenue), formatMoney(row.avgSell), formatMoney(row.cogs), formatMoney(row.gp), `${row.gpPct.toFixed(2)}%`])}
                />
              </DetailSection>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden shadow-sm">
      <div className="border-b border-slate-100 bg-slate-100/60 px-4 py-2.5 text-sm font-bold text-slate-850">{title}</div>
      {children}
    </section>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: DetailCell[][] }) {
  const cellText = (cell: DetailCell) => typeof cell === 'string' ? cell : cell.label
  const isNumericCell = (cell: DetailCell) => /^-?[\d,]+(\.\d+)?%?$/.test(cellText(cell).trim())
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {headers.map((header, idx) => (
                <th key={header} className={`p-2.5 text-slate-600 font-semibold text-xs text-left ${idx === 0 ? 'pl-4' : idx === headers.length - 1 ? 'pr-4' : ''}`}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={headers.length}>ไม่มีข้อมูล</td></tr> : null}
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100 hover:bg-slate-50/30">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${index}-${headers[cellIndex]}`}
                    className={`
                      p-2.5 text-slate-700
                      ${cellIndex === 0 ? 'pl-4' : cellIndex === row.length - 1 ? 'pr-4' : ''}
                      ${cellIndex === headers.length - 1 || !isNumericCell(cell) ? 'text-left' : 'text-right'}
                    `}
                  >
                    {typeof cell === 'string' ? (
                      cell
                    ) : (
                      <a className="font-mono font-semibold text-blue-600 underline-offset-2 hover:underline focus:outline-none focus-visible:outline-none focus-visible:ring-0" href={cell.href}>
                        {cell.label}
                      </a>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden space-y-3 p-3">
        {rows.length === 0 ? <div className="text-center text-xs text-slate-400 py-4 bg-white rounded-xl border border-slate-100">ไม่มีข้อมูล</div> : null}
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm space-y-2 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 font-semibold">
              <span className="text-slate-800 font-bold">
                {typeof row[0] === 'string' ? row[0] : (
                  <a className="font-mono text-blue-600 underline focus:outline-none focus-visible:outline-none focus-visible:ring-0" href={(row[0] as { href: string }).href}>
                    {row[0].label}
                  </a>
                )}
              </span>
              {row.length > 1 && (
                <span className="text-slate-600 font-bold">
                  {cellText(row[row.length - 1])}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {row.slice(1, row.length - 1).map((cell, cellIndex) => {
                const headerLabel = headers[cellIndex + 1] || ''
                const cellValue = cellText(cell)
                const isLink = typeof cell !== 'string'
                return (
                  <div key={cellIndex} className="flex justify-between items-center gap-2">
                    <span className="text-slate-500 font-semibold">{headerLabel}</span>
                    <span className="text-slate-800 font-medium font-mono text-right truncate max-w-[180px]">
                      {isLink ? (
                        <a className="text-blue-600 underline focus:outline-none focus-visible:outline-none focus-visible:ring-0" href={(cell as { href: string }).href}>
                          {cellValue}
                        </a>
                      ) : (
                        cellValue
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function MiniLine({ label, tone = 'slate', value }: { label: string; tone?: 'amber' | 'emerald' | 'red' | 'slate'; value: string }) {
  const text = tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-slate-800'
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className={`font-mono font-bold ${text}`}>{value}</span>
    </div>
  )
}

function SummaryCard({ className = '', icon, label, tone, value }: { className?: string; icon: string; label: string; tone: 'amber' | 'blue' | 'emerald' | 'violet'; value: string }) {
  const colors = {
    amber: 'bg-amber-100 text-amber-700 border-amber-200/50',
    blue: 'bg-blue-100 text-blue-700 border-blue-200/50',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200/50',
    violet: 'bg-violet-100 text-violet-700 border-violet-200/50',
  }[tone]
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:gap-4 sm:p-5 ${className}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl sm:h-12 sm:w-12 ${colors.split(' ')[0]}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-xs ${colors.split(' ')[1]}`}>{label}</div>
        <div className="truncate font-mono text-lg sm:text-2xl font-bold text-slate-900">{value}</div>
      </div>
    </div>
  )
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-bold text-slate-900 font-mono">{value}</div>
    </div>
  )
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={
        active
          ? 'rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100'
          : 'rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200'
      }
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function TopPanel({ color, rows, suffix = '', title }: { color: 'amber' | 'blue' | 'emerald' | 'teal'; rows: { label: string; value: number }[]; suffix?: string; title: string }) {
  const header = color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-100' : color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' : color === 'teal' ? 'bg-teal-50 text-teal-700 border-teal-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  return (
    <div className="overflow-hidden rounded-xl bg-white border border-slate-100 shadow-sm">
      <div className={`border-b border-slate-100 p-3 font-bold ${header}`}>{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label} className="border-t border-slate-100 hover:bg-slate-50/50">
              <td className="p-2.5 pl-4 font-bold text-slate-400 w-10">{index + 1}</td>
              <td className="p-2.5 font-medium text-slate-800">{row.label}</td>
              <td className="p-2.5 pr-4 text-right font-mono font-bold text-slate-900">{formatMoney(row.value)}{suffix}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function YearCompare({ monthly }: { monthly: CustomerTrackingPayload['monthly'] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white border border-slate-100 shadow-sm">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="p-3 pl-4 text-left font-semibold text-slate-600">เดือน</th>
            <th className="p-3 text-right font-semibold text-slate-600">น้ำหนัก</th>
            <th className="p-3 text-right font-semibold text-slate-600">ยอดขาย</th>
            <th className="p-3 text-right font-semibold text-slate-600">GP</th>
            <th className="p-3 pr-4 text-right font-semibold text-slate-600">GP%</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((row, index) => (
            <tr key={row.month} className="border-t border-slate-100 hover:bg-slate-50/40">
              <td className="p-3 pl-4 font-medium text-slate-800">{monthLabels[index]}</td>
              <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.qty)}</td>
              <td className="p-3 text-right font-mono font-semibold text-emerald-700">{formatMoney(row.revenue)}</td>
              <td className="p-3 text-right font-mono text-slate-700">{formatMoney(row.gp)}</td>
              <td className="p-3 pr-4 text-right font-mono text-slate-700">
                {row.revenue > 0 ? (row.gp / row.revenue * 100).toFixed(2) : '0.00'}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
