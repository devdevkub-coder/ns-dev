'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type CustomerFilter = {
  active: boolean | null
  code: string | null
  id: string
  name: string
}

type CustomerAdvanceRow = {
  accountName: string
  accountNo: string
  amount: number
  amountThb: number
  currency: string
  customerCode: string
  customerId: string
  customerName: string
  date: string
  description: string
  docNo: string
  fxRate: number
  id: string
  remainingAmount: number
  status: string
  usedAmount: number
}

type CustomerAdvancePayload = {
  filters: {
    customers: CustomerFilter[]
    statuses: string[]
  }
  pagination: {
    page: number
    pageSize: number
    totalPages: number
    totalRows: number
  }
  rows: CustomerAdvanceRow[]
  schemaState: {
    allocationSource: string
    missingTables: string[]
    sourceTable: string
  }
  summary: {
    activeCount: number
    sourceRows: number
    totalAdvanceThb: number
    totalRemainingThb: number
    totalUsedThb: number
  }
}

export function CustomerAdvancePageClient() {
  const [data, setData] = useState<CustomerAdvancePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState({
    customerId: '',
    from: '',
    q: '',
    status: '',
    to: '',
  })

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: '100' })
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    return params.toString()
  }, [query])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<CustomerAdvancePayload>(`/api/finance/customer-advance?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Customer Advance ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const exportHref = `/api/finance/customer-advance?${queryString}&format=xlsx`

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <strong>Customer Advance</strong> = รับเงินล่วงหน้าจากลูกค้าก่อนออกบิลขาย เป็นหนี้สินของบริษัท หน้านี้เป็น read baseline จาก Bank Statement เท่านั้น ยังไม่ตัด allocation
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Advance คงเหลือรวม" value={formatMoney(data?.summary.totalRemainingThb ?? 0)} tone="emerald" />
        <Metric label="Advance ทั้งหมด" value={formatMoney(data?.summary.totalAdvanceThb ?? 0)} />
        <Metric label="ใช้แล้ว" value={formatMoney(data?.summary.totalUsedThb ?? 0)} />
        <Metric label="รายการ Active" value={`${data?.summary.activeCount ?? 0}`} />
      </div>

      <div className="rounded-lg bg-white p-4 shadow">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-600">ค้นหา</span>
            <input className="w-full rounded border border-slate-300 px-3 py-2" placeholder="เลขที่ / Customer / บัญชี" value={query.q} onChange={(event) => setQuery((current) => ({ ...current, q: event.target.value }))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Customer</span>
            <select className="w-full rounded border border-slate-300 px-3 py-2" value={query.customerId} onChange={(event) => setQuery((current) => ({ ...current, customerId: event.target.value }))}>
              <option value="">ทั้งหมด</option>
              {(data?.filters.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.code ? `${customer.code} - ${customer.name}` : customer.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">สถานะ</span>
            <select className="w-full rounded border border-slate-300 px-3 py-2" value={query.status} onChange={(event) => setQuery((current) => ({ ...current, status: event.target.value }))}>
              <option value="">ทั้งหมด</option>
              {(data?.filters.statuses ?? []).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">จากวันที่</span>
            <input className="w-full rounded border border-slate-300 px-3 py-2" type="date" value={query.from} onChange={(event) => setQuery((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">ถึงวันที่</span>
            <input className="w-full rounded border border-slate-300 px-3 py-2" type="date" value={query.to} onChange={(event) => setQuery((current) => ({ ...current, to: event.target.value }))} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
          <div className="text-slate-500">Source: {data?.schemaState.sourceTable ?? 'bank_statement'} / missing: {(data?.schemaState.missingTables ?? []).join(', ') || '-'}</div>
          <a className="rounded bg-slate-900 px-4 py-2 font-medium text-white" href={exportHref}>Export XLSX</a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">Customer</th>
              <th className="p-2 text-left">บัญชีรับ</th>
              <th className="p-2 text-left">สกุล</th>
              <th className="p-2 text-right">จำนวน</th>
              <th className="p-2 text-right">มูลค่า THB</th>
              <th className="p-2 text-right">ใช้แล้ว</th>
              <th className="p-2 text-right">คงเหลือ</th>
              <th className="p-2 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows ?? []).length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={10}>ยังไม่มี Customer Advance ใน Bank Statement</td></tr> : null}
            {!isLoading && (data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2"><div className="font-medium">{row.customerName}</div><div className="text-xs text-slate-500">{row.customerCode || '-'}</div></td>
                <td className="p-2"><div>{row.accountName}</div><div className="font-mono text-xs text-slate-500">{row.accountNo || '-'}</div></td>
                <td className="p-2">{row.currency}</td>
                <td className="p-2 text-right">{formatMoney(row.amount)}</td>
                <td className="p-2 text-right font-medium">{formatMoney(row.amountThb)}</td>
                <td className="p-2 text-right text-slate-600">{formatMoney(row.usedAmount)}</td>
                <td className="p-2 text-right font-bold text-emerald-700">{formatMoney(row.remainingAmount)}</td>
                <td className="p-2 text-center"><StatusBadge status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, tone, value }: { label: string; tone?: 'emerald'; value: string }) {
  const color = tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${color}`}>{value}</div></div>
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'Open'
    ? 'bg-blue-100 text-blue-700'
    : status === 'Partially Used'
      ? 'bg-amber-100 text-amber-700'
      : status === 'Fully Used'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-slate-200 text-slate-500'
  return <span className={`rounded px-2 py-0.5 text-xs ${color}`}>{status}</span>
}
