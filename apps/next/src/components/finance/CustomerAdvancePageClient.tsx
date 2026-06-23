'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

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

const customerAdvanceColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 120 },
  { key: 'date', defaultWidth: 100 },
  { key: 'customerName', defaultWidth: 200 },
  { key: 'currency', defaultWidth: 70 },
  { key: 'fxRate', defaultWidth: 80 },
  { key: 'amount', defaultWidth: 100 },
  { key: 'amountThb', defaultWidth: 100 },
  { key: 'usedAmount', defaultWidth: 100 },
  { key: 'remainingAmount', defaultWidth: 100 },
  { key: 'status', defaultWidth: 110 },
  { key: 'action', defaultWidth: 80 },
]

export function CustomerAdvancePageClient() {
  const [data, setData] = useState<CustomerAdvancePayload | null>(null)
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
  const columnResize = useResizableColumns('finance.customer.advance.v5', customerAdvanceColumns)

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <strong>Customer Advance</strong> = รับเงินล่วงหน้าจากลูกค้าก่อนออกบิลขาย — เป็นหนี้สิน (Liability) ของบริษัท
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-2.5 sm:gap-4 md:grid-cols-3 text-sm">
        <Metric label="Advance คงเหลือรวม (Liability)" value={formatMoney(data?.summary.totalRemainingThb ?? 0)} tone="emerald" />
        <Metric label="จำนวนรายการ Active" value={`${data?.summary.activeCount ?? 0}`} />
        <div className="flex items-center justify-end gap-2">
          <a className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" href={exportHref}>Export XLSX</a>
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white opacity-60" disabled type="button">+ รับล่วงหน้าใหม่</button>
        </div>
      </div>

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
            {customerAdvanceColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <ResizableTableHead label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="Customer" resizeProps={columnResize.getResizeHandleProps('customerName', 'Customer')} />
              <ResizableTableHead label="สกุล" resizeProps={columnResize.getResizeHandleProps('currency', 'สกุล')} />
              <ResizableTableHead align="right" label="Rate" resizeProps={columnResize.getResizeHandleProps('fxRate', 'Rate')} />
              <ResizableTableHead align="right" label="จำนวน" resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวน')} />
              <ResizableTableHead align="right" label="มูลค่า THB" resizeProps={columnResize.getResizeHandleProps('amountThb', 'มูลค่า THB')} />
              <ResizableTableHead align="right" label="ใช้แล้ว" resizeProps={columnResize.getResizeHandleProps('usedAmount', 'ใช้แล้ว')} />
              <ResizableTableHead align="right" label="คงเหลือ" resizeProps={columnResize.getResizeHandleProps('remainingAmount', 'คงเหลือ')} />
              <ResizableTableHead align="center" label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
              <ResizableTableHead label="" resizeProps={columnResize.getResizeHandleProps('action', '')} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows ?? []).length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ยังไม่มี Customer Advance</td></tr> : null}
            {!isLoading && (data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3.5 font-mono text-xs overflow-hidden truncate">{row.docNo}</td>
                <td className="px-4 py-3.5 overflow-hidden truncate">{row.date}</td>
                <td className="px-4 py-3.5 overflow-hidden truncate">{row.customerName}</td>
                <td className="px-4 py-3.5 overflow-hidden truncate">{row.currency}</td>
                <td className="px-4 py-3.5 text-right overflow-hidden truncate">{formatMoney(row.fxRate)}</td>
                <td className="px-4 py-3.5 text-right overflow-hidden truncate">{formatMoney(row.amount)}</td>
                <td className="px-4 py-3.5 text-right font-medium overflow-hidden truncate">{formatMoney(row.amountThb)}</td>
                <td className="px-4 py-3.5 text-right text-slate-600 overflow-hidden truncate">{formatMoney(row.usedAmount)}</td>
                <td className="px-4 py-3.5 text-right font-bold text-emerald-700 overflow-hidden truncate">{formatMoney(row.remainingAmount)}</td>
                <td className="px-4 py-3.5 text-center overflow-hidden truncate"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3.5 text-right overflow-hidden truncate"><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled type="button">ยกเลิก</button></td>
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
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มี Customer Advance</div>
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
                <span className="font-semibold text-slate-500">Customer: </span>
                <span className="text-slate-800 font-medium">{row.customerName}</span>
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
                  <span className="text-emerald-700 font-bold tabular-nums text-sm">{formatMoney(row.remainingAmount)}</span>
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

function Metric({ label, tone, value }: { label: string; tone?: 'emerald'; value: string }) {
  const configs = {
    emerald: { bg: 'bg-emerald-100 text-emerald-600', emoji: '💵', labelColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
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
