'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'

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

type CustomerAdvanceColumnKey = 'action' | 'amount' | 'amountThb' | 'currency' | 'customerName' | 'date' | 'docNo' | 'fxRate' | 'remainingAmount' | 'status' | 'usedAmount'
type CustomerAdvanceSortKey = Exclude<CustomerAdvanceColumnKey, 'action'>
type SortDirection = 'asc' | 'desc'

const customerAdvanceColumns: Array<ResizableColumnDefinition<CustomerAdvanceColumnKey>> = [
  { key: 'docNo', defaultWidth: 120, minWidth: 105 },
  { key: 'date', defaultWidth: 100, minWidth: 90 },
  { key: 'customerName', defaultWidth: 200, minWidth: 160 },
  { key: 'currency', defaultWidth: 70, minWidth: 65 },
  { key: 'fxRate', defaultWidth: 80, minWidth: 75 },
  { key: 'amount', defaultWidth: 100, minWidth: 90 },
  { key: 'amountThb', defaultWidth: 100, minWidth: 95 },
  { key: 'usedAmount', defaultWidth: 100, minWidth: 95 },
  { key: 'remainingAmount', defaultWidth: 100, minWidth: 95 },
  { key: 'status', defaultWidth: 110, minWidth: 95 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''), 'th', { numeric: true, sensitivity: 'base' })
}

function getCustomerAdvanceSortValue(row: CustomerAdvanceRow, key: CustomerAdvanceSortKey) {
  if (key === 'customerName') return `${row.customerCode} ${row.customerName}`
  return row[key]
}

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
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<CustomerAdvanceSortKey | null>(null)

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((left, right) => {
      const result = compareSortValues(getCustomerAdvanceSortValue(left, sortKey), getCustomerAdvanceSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  const changeSort = (key: CustomerAdvanceSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <strong>Customer Advance</strong> = รับเงินล่วงหน้าจากลูกค้าก่อนออกบิลขาย - เป็นหนี้สิน (Liability) ของบริษัท
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-2.5 text-sm sm:gap-4 md:grid-cols-3">
        <Metric label="Advance คงเหลือรวม (Liability)" value={formatMoney(data?.summary.totalRemainingThb ?? 0)} tone="emerald" />
        <Metric label="จำนวนรายการ Active" value={`${data?.summary.activeCount ?? 0}`} />
        <div className="flex items-center justify-end gap-2">
          <a className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" href={exportHref}>Export XLSX</a>
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white opacity-60" disabled type="button">+ รับล่วงหน้าใหม่</button>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-md border border-slate-200/60 bg-white shadow-sm lg:block">
        <div className="flex justify-end border-b border-slate-100 bg-slate-50 p-2">
          {columnResize.hasCustomWidths ? (
            <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <table className="ns-table w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {customerAdvanceColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} sortKey="docNo" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="Customer" resizeProps={columnResize.getResizeHandleProps('customerName', 'Customer')} sortKey="customerName" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="สกุล" resizeProps={columnResize.getResizeHandleProps('currency', 'สกุล')} sortKey="currency" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="Rate" resizeProps={columnResize.getResizeHandleProps('fxRate', 'Rate')} sortKey="fxRate" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="จำนวน" resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวน')} sortKey="amount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="มูลค่า THB" resizeProps={columnResize.getResizeHandleProps('amountThb', 'มูลค่า THB')} sortKey="amountThb" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ใช้แล้ว" resizeProps={columnResize.getResizeHandleProps('usedAmount', 'ใช้แล้ว')} sortKey="usedAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="คงเหลือ" resizeProps={columnResize.getResizeHandleProps('remainingAmount', 'คงเหลือ')} sortKey="remainingAmount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
              <ResizableTableHead label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ยังไม่มี Customer Advance</td></tr> : null}
            {!isLoading && sortedRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/50">
                <td className="truncate px-4 py-3.5 font-mono text-xs">{row.docNo}</td>
                <td className="truncate px-4 py-3.5">{row.date}</td>
                <td className="truncate px-4 py-3.5">{row.customerName}</td>
                <td className="truncate px-4 py-3.5">{row.currency}</td>
                <td className="truncate px-4 py-3.5 text-right">{formatMoney(row.fxRate)}</td>
                <td className="truncate px-4 py-3.5 text-right">{formatMoney(row.amount)}</td>
                <td className="truncate px-4 py-3.5 text-right font-medium">{formatMoney(row.amountThb)}</td>
                <td className="truncate px-4 py-3.5 text-right text-slate-600">{formatMoney(row.usedAmount)}</td>
                <td className="truncate px-4 py-3.5 text-right font-bold text-emerald-700">{formatMoney(row.remainingAmount)}</td>
                <td className="truncate px-4 py-3.5 text-center"><StatusBadge status={row.status} /></td>
                <td className="truncate px-4 py-3.5 text-right">
                  <TableActionButton disabled label="ยกเลิก" menu={<TableActionMenuItem disabled>ยกเลิก</TableActionMenuItem>} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="block space-y-3 lg:hidden">
        {isLoading ? (
          <div className="rounded-md border border-slate-100 bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && sortedRows.length === 0 ? (
          <div className="rounded-md border border-slate-100 bg-white p-8 text-center text-slate-400 shadow">ยังไม่มี Customer Advance</div>
        ) : null}
        {!isLoading && sortedRows.map((row) => (
          <div
            key={row.id}
            className="space-y-2 rounded-md border border-slate-100 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <span className="font-mono text-sm font-bold text-slate-800">{row.docNo}</span>
              <StatusBadge status={row.status} />
            </div>

            <div className="space-y-1.5 text-sm text-slate-600">
              <div>
                <span className="font-semibold text-slate-500">Customer: </span>
                <span className="font-medium text-slate-800">{row.customerName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="block font-semibold text-slate-500">วันที่: </span>
                  <span className="text-slate-800">{row.date}</span>
                </div>
                <div>
                  <span className="block font-semibold text-slate-500">สกุลเงิน/Rate: </span>
                  <span className="text-slate-800">{row.currency} @ {formatMoney(row.fxRate)}</span>
                </div>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2 border-t border-slate-100/60 pt-1.5 text-right text-xs">
                <div>
                  <span className="block text-xs font-semibold text-slate-400">มูลค่า THB:</span>
                  <span className="text-sm tabular-nums text-slate-800">{formatMoney(row.amountThb)}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-slate-400">ใช้แล้ว:</span>
                  <span className="text-sm tabular-nums text-slate-600">{formatMoney(row.usedAmount)}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-slate-500">คงเหลือ THB:</span>
                  <span className="text-sm font-bold tabular-nums text-emerald-700">{formatMoney(row.remainingAmount)}</span>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <TableActionButton
                disabled
                mobileLabel
                menu={<TableActionMenuItem disabled>ยกเลิก</TableActionMenuItem>}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-slate-500">Source: {data?.schemaState.sourceTable ?? 'bank_statement'} / missing: {(data?.schemaState.missingTables ?? []).join(', ') || '-'}</div>
    </section>
  )
}

function Metric({ label, tone = 'slate', value }: { label: string; tone?: 'emerald' | 'slate'; value: string }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-slate-200 bg-white text-slate-900'
  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'Fully Used'
    ? 'bg-slate-100 text-slate-600'
    : status === 'Partially Used'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-emerald-100 text-emerald-700'
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>
}
