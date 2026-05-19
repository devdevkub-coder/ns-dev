'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type SupplierTrackingPayload = {
  byProduct: Array<{ amount: number; avgBuy: number; billCount: number; productName: string; qty: number; suppliers: number }>
  monthly: Array<{ amount: number; month: string; qty: number }>
  rows: Array<{ avgBuy: number; billCount: number; code: string; id: string; paidAmount: number; paidPct: number; payable: number; paymentCount: number; purchaseAmount: number; qty: number; supplierName: string }>
  summary: { paidAmount: number; payable: number; purchaseAmount: number; qty: number; suppliers: number }
  year: string
}

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function SupplierTrackingPageClient() {
  const [data, setData] = useState<SupplierTrackingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
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
    return (data?.rows ?? []).filter((row) => !query || `${row.code} ${row.supplierName}`.toLowerCase().includes(query))
  }, [data?.rows, search])

  const maxMonthAmount = Math.max(1, ...(data?.monthly ?? []).map((item) => item.amount))
  const exportHref = `/api/tracking/supplier?${new URLSearchParams({ year, ...(month ? { month } : {}), format: 'xlsx' }).toString()}`

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">Supplier Tracking 360°</h1>
        <p className="mt-1 text-sm opacity-90">วิเคราะห์ผู้ขายจากบิลรับซื้อและรายการจ่ายเงิน Supplier</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="rounded-lg bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="rounded-lg border px-3 py-2 text-sm" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">ทั้งปี</option>
            {monthLabels.map((label, index) => <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>)}
          </select>
          <input className="ml-auto min-w-64 rounded-lg border px-3 py-2 text-sm" placeholder="ค้นหา Supplier" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="ยอดซื้อรวม" value={formatMoney(data?.summary.purchaseAmount ?? 0)} />
        <Metric label="น้ำหนักรวม" value={formatMoney(data?.summary.qty ?? 0)} />
        <Metric label="จ่ายแล้ว" value={formatMoney(data?.summary.paidAmount ?? 0)} />
        <Metric label="เจ้าหนี้ค้าง" value={formatMoney(data?.summary.payable ?? 0)} />
        <Metric label="Supplier" value={`${data?.summary.suppliers ?? 0}`} />
      </div>
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="mb-3 text-sm font-semibold text-slate-700">ยอดซื้อรายเดือน {data?.year ?? year}</div>
        <div className="grid grid-cols-12 items-end gap-2">
          {(data?.monthly ?? []).map((item, index) => (
            <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t bg-blue-500" style={{ height: `${Math.max(4, (item.amount / maxMonthAmount) * 128)}px` }} />
              <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <div className="border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Product breakdown จากบิลรับซื้อ</div>
        <table className="w-full text-sm">
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
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Supplier</th><th className="p-2 text-right">บิล</th><th className="p-2 text-right">น้ำหนัก</th><th className="p-2 text-right">ยอดซื้อ</th><th className="p-2 text-right">ราคาเฉลี่ย</th><th className="p-2 text-right">จ่ายแล้ว</th><th className="p-2 text-right">ค้างจ่าย</th><th className="p-2 text-right">% จ่าย</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2"><div className="font-medium">{row.supplierName}</div><div className="text-xs text-slate-500">{row.code}</div></td><td className="p-2 text-right">{row.billCount}</td><td className="p-2 text-right">{formatMoney(row.qty)}</td><td className="p-2 text-right font-semibold">{formatMoney(row.purchaseAmount)}</td><td className="p-2 text-right">{formatMoney(row.avgBuy)}</td><td className="p-2 text-right">{formatMoney(row.paidAmount)}</td><td className="p-2 text-right text-red-700">{formatMoney(row.payable)}</td><td className="p-2 text-right">{row.paidPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-900">{value}</div></div>
}
