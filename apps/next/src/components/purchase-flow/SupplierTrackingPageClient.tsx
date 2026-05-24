'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type SupplierTrackingRow = {
  avgBuy: number
  billCount: number
  code: string
  id: string
  paidAmount: number
  paidPct: number
  payable: number
  paymentCount: number
  purchaseAmount: number
  qty: number
  supplierName: string
}

type SupplierTrackingPayload = {
  byProduct: Array<{ amount: number; avgBuy: number; billCount: number; productName: string; qty: number; suppliers: number }>
  monthly: Array<{ amount: number; month: string; qty: number }>
  rows: SupplierTrackingRow[]
  summary: { paidAmount: number; payable: number; purchaseAmount: number; qty: number; suppliers: number }
  year: string
}

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function SupplierTrackingPageClient() {
  const [data, setData] = useState<SupplierTrackingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ year })
      if (month) params.set('month', month)
      setData(await dailyFetchJson<SupplierTrackingPayload>(`/api/tracking/supplier?${params.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Supplier Tracking ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      const matchesSupplier = !supplierId || row.id === supplierId
      const matchesSearch = !query || `${row.code} ${row.supplierName}`.toLowerCase().includes(query)
      return matchesSupplier && matchesSearch
    })
  }, [data?.rows, search, supplierId])

  const topFive = rows.slice(0, 5)
  const topPurchase = [...rows].sort((left, right) => right.purchaseAmount - left.purchaseAmount).slice(0, 10)
  const topQty = [...rows].sort((left, right) => right.qty - left.qty).slice(0, 10)
  const cheapest = [...rows].filter((row) => row.avgBuy > 0).sort((left, right) => left.avgBuy - right.avgBuy).slice(0, 10)
  const expensive = [...rows].filter((row) => row.avgBuy > 0).sort((left, right) => right.avgBuy - left.avgBuy).slice(0, 10)
  const topPayable = [...rows].sort((left, right) => right.payable - left.payable).slice(0, 10)
  const maxMonthAmount = Math.max(1, ...(data?.monthly ?? []).map((item) => item.amount))
  const exportHref = `/api/tracking/supplier?${new URLSearchParams({ year, ...(month ? { month } : {}), format: 'xlsx' }).toString()}`
  const paidAmount = rows.reduce((sum, row) => sum + row.paidAmount, 0)
  const payable = rows.reduce((sum, row) => sum + row.payable, 0)

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-md bg-white p-3 shadow">
        <div className="grid gap-2 md:grid-cols-6">
          <input className="rounded-md border px-3 py-2 text-sm" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <select className="rounded-md border px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">ทั้งปี</option>
            {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm md:col-span-2" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">Supplier ทั้งหมด</option>
            {(data?.rows ?? []).map((row) => <option key={row.id} value={row.id}>{row.code ? `${row.code} - ${row.supplierName}` : row.supplierName}</option>)}
          </select>
          <input className="rounded-md border px-3 py-2 text-sm" placeholder="ค้นหา Supplier" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="rounded-md bg-blue-700 px-4 py-2 text-center text-sm font-bold text-white" href={exportHref}>📥 XLSX</a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard color="blue" label="💰 ยอดซื้อรวม" value={formatMoney(rows.reduce((sum, row) => sum + row.purchaseAmount, 0))} />
        <SummaryCard color="indigo" label="⚖️ น้ำหนักรวม" value={`${formatMoney(rows.reduce((sum, row) => sum + row.qty, 0))} กก.`} />
        <SummaryCard color="red" label="🏦 เจ้าหนี้ค้าง" value={formatMoney(payable)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md bg-white p-4 shadow lg:col-span-2">
          <div className="mb-3 text-sm font-semibold text-slate-700">ยอดซื้อรายเดือน {data?.year ?? year}</div>
          <div className="grid grid-cols-12 items-end gap-2">
            {(data?.monthly ?? []).map((item, index) => (
              <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-md-t bg-blue-500" style={{ height: `${Math.max(4, (item.amount / maxMonthAmount) * 128)}px` }} />
                <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Supplier</div>
          <BarList rows={topFive.map((row) => ({ label: row.supplierName, value: row.purchaseAmount }))} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <MiniMetric label="จ่ายแล้ว" value={formatMoney(paidAmount)} />
            <MiniMetric label="ค้างจ่าย" value={formatMoney(payable)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-md bg-white p-2 shadow">
        <Tab active={view === 'list'} label="รายการ" onClick={() => setView('list')} />
        <Tab active={view === 'top10'} label="Top 10" onClick={() => setView('top10')} />
        <Tab active={view === 'yearCompare'} label="รายปี" onClick={() => setView('yearCompare')} />
      </div>

      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel rows={topPurchase.map((row) => ({ label: row.supplierName, value: row.purchaseAmount }))} title="Top 10 ยอดซื้อ" />
          <TopPanel rows={topQty.map((row) => ({ label: row.supplierName, value: row.qty }))} title="Top 10 น้ำหนัก" />
          <TopPanel rows={cheapest.map((row) => ({ label: row.supplierName, value: row.avgBuy }))} title="Top 10 ราคาถูกสุด" />
          <TopPanel rows={expensive.map((row) => ({ label: row.supplierName, value: row.avgBuy }))} title="Top 10 ราคาแพงสุด" />
          <TopPanel rows={topPayable.map((row) => ({ label: row.supplierName, value: row.payable }))} title="Top 10 เจ้าหนี้ค้าง" />
        </div>
      ) : null}

      {view === 'yearCompare' ? <YearCompare monthly={data?.monthly ?? []} /> : null}

      {view === 'list' ? (
        <>
          <div className="overflow-x-auto rounded-md bg-white shadow">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Supplier</th>
                  <th className="p-2 text-right">บิล</th>
                  <th className="p-2 text-right">น้ำหนัก</th>
                  <th className="p-2 text-right">ยอดซื้อ</th>
                  <th className="p-2 text-right">ราคาเฉลี่ย</th>
                  <th className="p-2 text-right">จ่ายแล้ว</th>
                  <th className="p-2 text-right">ค้างจ่าย</th>
                  <th className="p-2 text-right">% จ่าย</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>ไม่มีข้อมูล Supplier Tracking</td></tr> : null}
                {!isLoading && rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-blue-50/40">
                    <td className="p-2 font-mono text-xs text-slate-500">{row.code || '-'}</td>
                    <td className="p-2 font-medium">{row.supplierName}</td>
                    <td className="p-2 text-right">{row.billCount}</td>
                    <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                    <td className="p-2 text-right font-semibold text-blue-700">{formatMoney(row.purchaseAmount)}</td>
                    <td className="p-2 text-right">{formatMoney(row.avgBuy)}</td>
                    <td className="p-2 text-right">{formatMoney(row.paidAmount)}</td>
                    <td className="p-2 text-right text-red-700">{formatMoney(row.payable)}</td>
                    <td className="p-2 text-right">{row.paidPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-md bg-white shadow">
            <div className="border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Product breakdown จากบิลรับซื้อ</div>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">Supplier</th><th className="p-2 text-right">บิล</th><th className="p-2 text-right">น้ำหนัก</th><th className="p-2 text-right">ยอดซื้อ</th><th className="p-2 text-right">ราคาเฉลี่ย</th></tr></thead>
              <tbody>
                {(data?.byProduct ?? []).slice(0, 20).map((row) => (
                  <tr key={row.productName} className="border-t hover:bg-slate-50">
                    <td className="p-2 font-medium">{row.productName}</td>
                    <td className="p-2 text-right">{row.suppliers}</td>
                    <td className="p-2 text-right">{row.billCount}</td>
                    <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                    <td className="p-2 text-right font-semibold">{formatMoney(row.amount)}</td>
                    <td className="p-2 text-right">{formatMoney(row.avgBuy)}</td>
                  </tr>
                ))}
                {!isLoading && (data?.byProduct ?? []).length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={6}>ไม่มี item detail สำหรับ product breakdown</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}

function SummaryCard({ color, label, value }: { color: 'blue' | 'indigo' | 'red'; label: string; value: string }) {
  const gradient = color === 'red' ? 'from-red-500 to-rose-600' : color === 'indigo' ? 'from-indigo-500 to-violet-600' : 'from-blue-500 to-indigo-600'
  return <div className={`rounded-md bg-gradient-to-br ${gradient} p-5 text-white shadow-xl`}><div className="text-xs opacity-80">{label}</div><div className="mt-1 font-mono text-3xl font-bold">{value}</div></div>
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-2"><div className="text-slate-500">{label}</div><div className="font-mono font-bold text-slate-900">{value}</div></div>
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={active ? 'rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white' : 'rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600'} type="button" onClick={onClick}>{label}</button>
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <div className="space-y-2">{rows.length === 0 ? <div className="py-8 text-center text-slate-400">ไม่มีข้อมูล</div> : rows.map((row, index) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{index + 1}. {row.label}</span><b>{formatMoney(row.value)}</b></div><div className="h-2 rounded-md bg-slate-100"><div className="h-2 rounded-md bg-blue-500" style={{ width: `${Math.min(100, row.value / max * 100)}%` }} /></div></div>)}</div>
}

function TopPanel({ rows, title }: { rows: { label: string; value: number }[]; title: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow"><div className="border-b bg-blue-50 p-3 font-bold text-blue-700">{title}</div><table className="w-full text-sm"><tbody>{rows.map((row, index) => <tr key={row.label} className="border-t"><td className="p-2 font-bold">{index + 1}</td><td className="p-2">{row.label}</td><td className="p-2 text-right font-semibold">{formatMoney(row.value)}</td></tr>)}</tbody></table></div>
}

function YearCompare({ monthly }: { monthly: SupplierTrackingPayload['monthly'] }) {
  return (
    <div className="overflow-x-auto rounded-md bg-white shadow">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2 text-left">เดือน</th><th className="p-2 text-right">น้ำหนัก</th><th className="p-2 text-right">ยอดซื้อ</th><th className="p-2 text-right">ราคาเฉลี่ย</th></tr></thead>
        <tbody>{monthly.map((row, index) => <tr key={row.month} className="border-t"><td className="p-2">{monthLabels[index]}</td><td className="p-2 text-right">{formatMoney(row.qty)}</td><td className="p-2 text-right font-semibold text-blue-700">{formatMoney(row.amount)}</td><td className="p-2 text-right">{formatMoney(row.qty > 0 ? row.amount / row.qty : 0)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
