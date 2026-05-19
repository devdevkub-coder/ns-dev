'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type CustomerTrackingRow = {
  avgSell: number
  billCount: number
  code: string
  cogs: number
  customerName: string
  gp: number
  gpPct: number
  id: string
  profitPerKg: number
  qty: number
  receivable: number
  receivedAmount: number
  revenue: number
}
type CustomerTrackingPayload = {
  filters: { customers: Array<{ active: boolean | null; code: string | null; id: string; name: string }> }
  monthly: Array<{ gp: number; month: string; qty: number; revenue: number }>
  rows: CustomerTrackingRow[]
  summary: { cogs: number; customers: number; gp: number; qty: number; receivable: number; receivedAmount: number; revenue: number }
  year: string
}

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function CustomerTrackingPageClient() {
  const [customerId, setCustomerId] = useState('')
  const [data, setData] = useState<CustomerTrackingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
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

  const rows = data?.rows ?? []
  const topFive = rows.slice(0, 5)
  const topRevenue = [...rows].sort((left, right) => right.revenue - left.revenue).slice(0, 10)
  const topGp = [...rows].sort((left, right) => right.gp - left.gp).slice(0, 10)
  const topGpPct = [...rows].filter((row) => row.revenue > 0).sort((left, right) => right.gpPct - left.gpPct).slice(0, 10)
  const topReceivable = [...rows].sort((left, right) => right.receivable - left.receivable).slice(0, 10)
  const maxMonthRevenue = Math.max(1, ...(data?.monthly ?? []).map((item) => item.revenue))
  const exportHref = `/api/tracking/customer?${queryString}&format=xlsx`

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white shadow-xl">
        <h1 className="text-xl font-bold">👥 Customer Tracking 360°</h1>
        <p className="mt-1 text-sm opacity-90">วิเคราะห์ลูกค้าจากยอดขาย รับเงิน ลูกหนี้ และกำไรขั้นต้น</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-xl bg-white p-3 shadow">
        <div className="grid gap-2 md:grid-cols-6">
          <input className="rounded border px-3 py-2 text-sm" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <select className="rounded border px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">ทั้งปี</option>
            {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm md:col-span-2" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">ลูกค้าทั้งหมด</option>
            {(data?.filters.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.code ? `${customer.code} - ${customer.name}` : customer.name}</option>)}
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="ค้นหา Customer" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="rounded bg-emerald-600 px-4 py-2 text-center text-sm font-bold text-white" href={exportHref}>📥 XLSX</a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-5 text-white shadow-xl lg:col-span-2">
          <div className="text-xs opacity-80">💰 ยอดขายรวม</div>
          <div className="font-mono text-4xl font-bold">{formatMoney(data?.summary.revenue ?? 0)}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="ลูกค้า" value={`${data?.summary.customers ?? 0}`} />
            <MiniStat label="น้ำหนัก" value={`${formatMoney(data?.summary.qty ?? 0)} กก.`} />
            <MiniStat label="GP" value={formatMoney(data?.summary.gp ?? 0)} />
            <MiniStat label="ลูกหนี้" value={formatMoney(data?.summary.receivable ?? 0)} />
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Customer</div>
          <BarList color="emerald" rows={topFive.map((row) => ({ label: row.customerName, value: row.revenue }))} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-semibold text-slate-700">ยอดขายรายเดือน {data?.year ?? year}</div>
          <div className="grid grid-cols-12 items-end gap-2">
            {(data?.monthly ?? []).map((item, index) => (
              <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max(4, (item.revenue / maxMonthRevenue) * 128)}px` }} />
                <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-semibold text-slate-700">สัดส่วน Top 5</div>
          <BarList color="teal" rows={topFive.map((row) => ({ label: row.customerName, value: row.revenue }))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl bg-white p-2 shadow">
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
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">Customer</th>
                <th className="p-2 text-right">บิล</th>
                <th className="p-2 text-right">น้ำหนัก</th>
                <th className="p-2 text-right">ยอดขาย</th>
                <th className="p-2 text-right">ราคาเฉลี่ย</th>
                <th className="p-2 text-right">COGS</th>
                <th className="p-2 text-right">GP</th>
                <th className="p-2 text-right">GP%</th>
                <th className="p-2 text-right">฿/กก.</th>
                <th className="p-2 text-right">รับเงิน</th>
                <th className="p-2 text-right">ลูกหนี้</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ไม่มีข้อมูล Customer Tracking</td></tr> : null}
              {!isLoading && rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-emerald-50/40">
                  <td className="p-2 font-mono text-xs text-slate-500">{row.code || '-'}</td>
                  <td className="p-2 font-medium">{row.customerName}</td>
                  <td className="p-2 text-right">{row.billCount}</td>
                  <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                  <td className="p-2 text-right font-semibold text-emerald-700">{formatMoney(row.revenue)}</td>
                  <td className="p-2 text-right">{formatMoney(row.avgSell)}</td>
                  <td className="p-2 text-right text-red-700">{formatMoney(row.cogs)}</td>
                  <td className={`p-2 text-right font-semibold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.gp)}</td>
                  <td className="p-2 text-right">{row.gpPct.toFixed(2)}%</td>
                  <td className="p-2 text-right">{formatMoney(row.profitPerKg)}</td>
                  <td className="p-2 text-right">{formatMoney(row.receivedAmount)}</td>
                  <td className="p-2 text-right text-amber-700">{formatMoney(row.receivable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/15 p-3"><div className="text-xs opacity-80">{label}</div><div className="font-mono text-lg font-bold">{value}</div></div>
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={active ? 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white' : 'rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600'} type="button" onClick={onClick}>{label}</button>
}

function BarList({ color, rows }: { color: 'emerald' | 'teal'; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  const bar = color === 'emerald' ? 'bg-emerald-500' : 'bg-teal-500'
  return <div className="space-y-2">{rows.length === 0 ? <div className="py-8 text-center text-slate-400">ไม่มีข้อมูล</div> : rows.map((row, index) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{index + 1}. {row.label}</span><b>{formatMoney(row.value)}</b></div><div className="h-2 rounded bg-slate-100"><div className={`h-2 rounded ${bar}`} style={{ width: `${Math.min(100, row.value / max * 100)}%` }} /></div></div>)}</div>
}

function TopPanel({ color, rows, suffix = '', title }: { color: 'amber' | 'blue' | 'emerald' | 'teal'; rows: { label: string; value: number }[]; suffix?: string; title: string }) {
  const header = color === 'amber' ? 'bg-amber-50 text-amber-700' : color === 'blue' ? 'bg-blue-50 text-blue-700' : color === 'teal' ? 'bg-teal-50 text-teal-700' : 'bg-emerald-50 text-emerald-700'
  return <div className="overflow-hidden rounded-2xl bg-white shadow"><div className={`border-b p-3 font-bold ${header}`}>{title}</div><table className="w-full text-sm"><tbody>{rows.map((row, index) => <tr key={row.label} className="border-t"><td className="p-2 font-bold">{index + 1}</td><td className="p-2">{row.label}</td><td className="p-2 text-right font-semibold">{formatMoney(row.value)}{suffix}</td></tr>)}</tbody></table></div>
}

function YearCompare({ monthly }: { monthly: CustomerTrackingPayload['monthly'] }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2 text-left">เดือน</th><th className="p-2 text-right">น้ำหนัก</th><th className="p-2 text-right">ยอดขาย</th><th className="p-2 text-right">GP</th><th className="p-2 text-right">GP%</th></tr></thead>
        <tbody>{monthly.map((row, index) => <tr key={row.month} className="border-t"><td className="p-2">{monthLabels[index]}</td><td className="p-2 text-right">{formatMoney(row.qty)}</td><td className="p-2 text-right font-semibold text-emerald-700">{formatMoney(row.revenue)}</td><td className="p-2 text-right">{formatMoney(row.gp)}</td><td className="p-2 text-right">{row.revenue > 0 ? (row.gp / row.revenue * 100).toFixed(2) : '0.00'}%</td></tr>)}</tbody>
      </table>
    </div>
  )
}
