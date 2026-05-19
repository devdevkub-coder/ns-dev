'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type SupplierFilter = {
  active: boolean | null
  code: string | null
  id: string
  name: string
}

type SupplierAdvanceRow = {
  accountName: string
  accountNo: string
  amount: number
  amountThb: number
  currency: string
  date: string
  description: string
  docNo: string
  fxRate: number
  id: string
  remainingAmount: number
  status: string
  supplierCode: string
  supplierId: string
  supplierName: string
  usedAmount: number
}

type SupplierAdvancePayload = {
  filters: {
    statuses: string[]
    suppliers: SupplierFilter[]
  }
  pagination: {
    page: number
    pageSize: number
    totalPages: number
    totalRows: number
  }
  rows: SupplierAdvanceRow[]
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

export function SupplierAdvancePageClient() {
  const [data, setData] = useState<SupplierAdvancePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: '100' })
    return params.toString()
  }, [])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<SupplierAdvancePayload>(`/api/finance/supplier-advance?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Supplier Advance ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const exportHref = `/api/finance/supplier-advance?${queryString}&format=xlsx`

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Supplier Advance</strong> = จ่ายเงินล่วงหน้าให้ Supplier ก่อนมีบิลรับซื้อ — ยอดที่เหลือสามารถใช้หักกับบิลในอนาคตได้
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Metric label="Advance คงเหลือรวม (THB)" value={formatMoney(data?.summary.totalRemainingThb ?? 0)} tone="amber" />
        <Metric label="จำนวนรายการ Active" value={`${data?.summary.activeCount ?? 0}`} />
        <div className="flex items-end justify-end gap-2">
          <a className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" href={exportHref}>Export XLSX</a>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white opacity-60" disabled type="button">+ จ่ายล่วงหน้าใหม่</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">Supplier</th>
              <th className="p-2 text-left">สกุล</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">จำนวน</th>
              <th className="p-2 text-right">มูลค่า THB</th>
              <th className="p-2 text-right">ใช้แล้ว</th>
              <th className="p-2 text-right">คงเหลือ</th>
              <th className="p-2 text-center">สถานะ</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows ?? []).length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ยังไม่มี Supplier Advance</td></tr> : null}
            {!isLoading && (data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{row.supplierName}</td>
                <td className="p-2">{row.currency}</td>
                <td className="p-2 text-right">{formatMoney(row.fxRate)}</td>
                <td className="p-2 text-right">{formatMoney(row.amount)}</td>
                <td className="p-2 text-right font-medium">{formatMoney(row.amountThb)}</td>
                <td className="p-2 text-right text-slate-600">{formatMoney(row.usedAmount)}</td>
                <td className="p-2 text-right font-bold text-amber-700">{formatMoney(row.remainingAmount)}</td>
                <td className="p-2 text-center"><StatusBadge status={row.status} /></td>
                <td className="p-2 text-right"><button className="text-xs text-red-600 opacity-50" disabled type="button">ยกเลิก</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">Source: {data?.schemaState.sourceTable ?? 'bank_statement'} / missing: {(data?.schemaState.missingTables ?? []).join(', ') || '-'}</div>
    </section>
  )
}

function Metric({ label, tone, value }: { label: string; tone?: 'amber'; value: string }) {
  const color = tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
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
