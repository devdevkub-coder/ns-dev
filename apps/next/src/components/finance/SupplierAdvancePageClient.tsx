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
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Supplier Advance</strong> = จ่ายเงินล่วงหน้าให้ Supplier ก่อนมีบิลรับซื้อ — ยอดที่เหลือสามารถใช้หักกับบิลในอนาคตได้
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-2.5 sm:gap-4 md:grid-cols-3 text-sm">
        <Metric label="Advance คงเหลือรวม (THB)" value={formatMoney(data?.summary.totalRemainingThb ?? 0)} tone="amber" />
        <Metric label="จำนวนรายการ Active" value={`${data?.summary.activeCount ?? 0}`} />
        <div className="flex items-center justify-end gap-2">
          <a className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" href={exportHref}>Export XLSX</a>
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white opacity-60" disabled type="button">+ จ่ายล่วงหน้าใหม่</button>
        </div>
      </div>

      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">เลขที่</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">วันที่</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">Supplier</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">สกุล</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">Rate</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">จำนวน</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">มูลค่า THB</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">ใช้แล้ว</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">คงเหลือ</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-center">สถานะ</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows ?? []).length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ยังไม่มี Supplier Advance</td></tr> : null}
            {!isLoading && (data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3.5 font-mono text-xs">{row.docNo}</td>
                <td className="px-4 py-3.5">{row.date}</td>
                <td className="px-4 py-3.5">{row.supplierName}</td>
                <td className="px-4 py-3.5">{row.currency}</td>
                <td className="px-4 py-3.5 text-right">{formatMoney(row.fxRate)}</td>
                <td className="px-4 py-3.5 text-right">{formatMoney(row.amount)}</td>
                <td className="px-4 py-3.5 text-right font-medium">{formatMoney(row.amountThb)}</td>
                <td className="px-4 py-3.5 text-right text-slate-600">{formatMoney(row.usedAmount)}</td>
                <td className="px-4 py-3.5 text-right font-bold text-amber-700">{formatMoney(row.remainingAmount)}</td>
                <td className="px-4 py-3.5 text-center"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3.5 text-right"><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled type="button">ยกเลิก</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-100">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && (data?.rows ?? []).length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มี Supplier Advance</div>
        ) : null}
        {!isLoading && (data?.rows ?? []).map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2"
          >
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 text-sm font-mono">{row.docNo}</span>
              <StatusBadge status={row.status} />
            </div>
            
            <div className="text-sm text-slate-600 space-y-1.5">
              <div>
                <span className="font-semibold text-slate-500">Supplier: </span>
                <span className="text-slate-800 font-medium">{row.supplierName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-slate-500 block">วันที่: </span>
                  <span className="text-slate-800">{row.date}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">สกุลเงิน/Rate: </span>
                  <span className="text-slate-800">{row.currency} @ {formatMoney(row.fxRate)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-100/60 mt-1 text-right text-xs">
                <div>
                  <span className="font-semibold text-slate-400 block text-xs">มูลค่า THB:</span>
                  <span className="text-slate-800 tabular-nums text-sm">{formatMoney(row.amountThb)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block text-xs">ใช้แล้ว:</span>
                  <span className="text-slate-600 tabular-nums text-sm">{formatMoney(row.usedAmount)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block text-xs">คงเหลือ THB:</span>
                  <span className="text-amber-700 font-bold tabular-nums text-sm">{formatMoney(row.remainingAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-slate-500">Source: {data?.schemaState.sourceTable ?? 'bank_statement'} / missing: {(data?.schemaState.missingTables ?? []).join(', ') || '-'}</div>
    </section>
  )
}

function Metric({ label, tone, value }: { label: string; tone?: 'amber'; value: string }) {
  const configs = {
    amber: { bg: 'bg-amber-100 text-amber-600', emoji: '💵', labelColor: 'text-amber-600', valueColor: 'text-amber-700' },
    slate: { bg: 'bg-slate-100 text-slate-600', emoji: '📋', labelColor: 'text-slate-500', valueColor: 'text-slate-900' }
  }

  const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''))
  const isZero = isNaN(numericValue) ? false : numericValue === 0

  const config = isZero
    ? { bg: 'bg-slate-100 text-slate-600', emoji: configs[tone || 'slate'].emoji, labelColor: 'text-slate-500', valueColor: 'text-slate-900' }
    : configs[tone || 'slate']

  return (
    <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
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

function StatusBadge({ status }: { status: string }) {
  const color = status === 'Open'
    ? 'bg-blue-100 text-blue-700'
    : status === 'Partially Used'
      ? 'bg-amber-100 text-amber-700'
      : status === 'Fully Used'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-slate-200 text-slate-500'
  return <span className={`rounded-md px-2 py-0.5 text-xs ${color}`}>{status}</span>
}
