'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

type StockReconColumnKey =
  | 'groupKey'
  | 'issue'
  | 'refType'
  | 'docNo'
  | 'refNo'
  | 'productCode'
  | 'warehouseCode'
  | 'netQty'
  | 'expected'
  | 'status'

const reconColumns: Array<ResizableColumnDefinition<StockReconColumnKey>> = [
  { key: 'groupKey', defaultWidth: 150, minWidth: 120 },
  { key: 'issue', defaultWidth: 140, minWidth: 110 },
  { key: 'refType', defaultWidth: 90, minWidth: 80 },
  { key: 'docNo', defaultWidth: 130, minWidth: 110 },
  { key: 'refNo', defaultWidth: 130, minWidth: 110 },
  { key: 'productCode', defaultWidth: 100, minWidth: 80 },
  { key: 'warehouseCode', defaultWidth: 90, minWidth: 70 },
  { key: 'netQty', defaultWidth: 100, minWidth: 80 },
  { key: 'expected', defaultWidth: 100, minWidth: 80 },
  { key: 'status', defaultWidth: 80, minWidth: 60 },
]

type ReconciliationIssue = {
  docNo?: string
  expected?: number
  issue: string
  netQty?: number
  productCode?: string
  refNo?: string
  refType?: string
  sourceType?: string
  status?: string
  warehouseCode?: string
}

type ReconciliationGroupKey =
  | 'cancelledDocumentNet'
  | 'cancelledSalesHolds'
  | 'missingSourceLedger'
  | 'negativeStockBalance'
  | 'orphanLedger'
  | 'pendingSaleIntegrity'
  | 'statusConvertIntegrity'
  | 'stockAdjustmentIntegrity'

type ReconciliationPayload = {
  generatedAt: string
  groups: Record<ReconciliationGroupKey, ReconciliationIssue[]>
  totals: Record<ReconciliationGroupKey, number>
}

const groupLabels: Record<ReconciliationGroupKey, { label: string; note: string }> = {
  cancelledDocumentNet: {
    label: 'ยกเลิกไม่เป็นศูนย์',
    note: 'เอกสารที่ยกเลิกแล้วต้องมียอดสุทธิเป็นศูนย์',
  },
  cancelledSalesHolds: {
    label: 'SB hold ค้าง',
    note: 'SB ที่ยกเลิกแล้วต้องไม่ค้าง hold consumed',
  },
  missingSourceLedger: {
    label: 'ขาด ledger',
    note: 'source document ที่ต้องมี stock ledger แต่ยังไม่มี',
  },
  negativeStockBalance: {
    label: 'ยอดติดลบ',
    note: 'ยอด ledger รวม active hold แล้วติดลบ',
  },
  orphanLedger: {
    label: 'ledger กำพร้า',
    note: 'ledger ที่หา source document ไม่พบ',
  },
  pendingSaleIntegrity: {
    label: 'ตรวจ PSALE',
    note: 'เบิกออกรอบิลต้องมี reversal/hold/converted state ถูกต้อง',
  },
  statusConvertIntegrity: {
    label: 'ตรวจ SC',
    note: 'Status Convert และ reversal ต้องเป็น paired ledger และ net เป็นศูนย์',
  },
  stockAdjustmentIntegrity: {
    label: 'ตรวจ ADJ',
    note: 'Stock Adjust ต้องมี header/ledger ตรงกัน และ value ใน ledger เป็นศูนย์ตาม note-only policy',
  },
}

const groupOrder: ReconciliationGroupKey[] = [
  'missingSourceLedger',
  'orphanLedger',
  'cancelledDocumentNet',
  'cancelledSalesHolds',
  'pendingSaleIntegrity',
  'statusConvertIntegrity',
  'stockAdjustmentIntegrity',
  'negativeStockBalance',
]

function displayValue(value: string | number | undefined) {
  if (value == null || value === '') return '-'
  if (typeof value === 'number') return formatMoney(value)
  return value
}

function issueText(issue: string) {
  return issue
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

export function StockReconciliationPageClient() {
  const [data, setData] = useState<ReconciliationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<ReconciliationGroupKey | 'all'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const columnResize = useResizableColumns('stock.reconciliation.main.v5', reconColumns)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<ReconciliationPayload>('/api/stock/reconciliation'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Stock Reconciliation ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const entries = groupOrder.flatMap((key) => (data?.groups[key] ?? []).map((issue) => ({ groupKey: key, issue })))
      .filter((entry) => group === 'all' || entry.groupKey === group)
    if (!normalizedQuery) return entries
    return entries.filter((entry) => {
      return Object.values(entry.issue).some(val => String(val).toLowerCase().includes(normalizedQuery)) ||
        groupLabels[entry.groupKey].label.toLowerCase().includes(normalizedQuery)
    })
  }, [data?.groups, group, query])

  const sortedRows = useMemo(() => {
    const result = [...filteredRows]
    if (sortKey) {
      result.sort((a, b) => {
        let valA: any
        let valB: any

        if (sortKey === 'groupKey') {
          valA = groupLabels[a.groupKey].label
          valB = groupLabels[b.groupKey].label
        } else if (sortKey === 'issue') {
          valA = a.issue.issue
          valB = b.issue.issue
        } else {
          valA = a.issue[sortKey as keyof ReconciliationIssue]
          valB = b.issue[sortKey as keyof ReconciliationIssue]
        }

        if (valA === undefined || valA === null) return 1
        if (valB === undefined || valB === null) return -1

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA
        }

        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB), 'th', { numeric: true })
          : String(valB).localeCompare(String(valA), 'th', { numeric: true })
      })
    }
    return result
  }, [filteredRows, sortKey, sortDirection])

  const rows = sortedRows

  const totalIssues = groupOrder.reduce((sum, key) => sum + (data?.totals[key] ?? 0), 0)
  const generatedText = data?.generatedAt
    ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))
    : '-'

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 lg:grid-cols-7 text-sm">
        <Metric
          emoji={totalIssues > 0 ? '⚠️' : '✅'}
          iconBg={totalIssues > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}
          label="รวม issue"
          tone={totalIssues > 0 ? 'red' : 'emerald'}
          value={String(totalIssues)}
        />
        {groupOrder.map((key, index) => {
          const count = data?.totals[key] ?? 0
          return (
            <Metric
              key={key}
              emoji={count > 0 ? '⚠️' : '📄'}
              iconBg={count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}
              label={groupLabels[key].label}
              tone={count > 0 ? 'amber' : 'slate'}
              value={String(count)}
              className={index === groupOrder.length - 1 ? 'col-span-2 lg:col-span-1' : ''}
            />
          )
        })}
      </div>
      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="h-9 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" placeholder="ค้นหาเอกสาร/ref/สินค้า/คลัง/status" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none" value={group} onChange={(event) => setGroup(event.target.value as ReconciliationGroupKey | 'all')}>
            <option value="all">ทุกกลุ่ม</option>
            {groupOrder.map((key) => <option key={key} value={key}>{groupLabels[key].label}</option>)}
          </select>
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 ml-auto" disabled={isLoading} type="button" onClick={() => void loadData()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
          {columnResize.hasCustomWidths && (
            <button
              className="rounded-md border border-slate-300 bg-white px-3 h-9 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {totalIssues === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>ตรวจล่าสุด {generatedText}</span>
        </div>
      </div>
      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-100">กำลังตรวจข้อมูล</div>
        ) : null}
        
        {!isLoading && rows.map((row, index) => (
          <div
            key={`${row.groupKey}-${row.issue.docNo ?? row.issue.refNo ?? index}`}
            className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2"
          >
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 text-sm">{groupLabels[row.groupKey].label}</span>
              <span className="text-xs text-slate-500 font-medium">{issueText(row.issue.issue)}</span>
            </div>
            
            <p className="text-xs text-slate-400">{groupLabels[row.groupKey].note}</p>
            
            <div className="text-xs text-slate-600 space-y-1 pt-1.5 border-t border-slate-50/60 mt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">Doc No: </span>
                  <span className="text-slate-800 font-mono">{row.issue.docNo || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Ref No: </span>
                  <span className="text-slate-800 font-mono">{row.issue.refNo || '-'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">สินค้า: </span>
                  <span className="text-slate-800">{row.issue.productCode || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">คลัง: </span>
                  <span className="text-slate-800">{row.issue.warehouseCode || '-'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">Net Qty: </span>
                  <span className="text-slate-800 font-bold">{row.issue.netQty != null ? formatMoney(row.issue.netQty) : '-'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Expected: </span>
                  <span className="text-slate-800 font-bold">{row.issue.expected != null ? formatMoney(row.issue.expected) : '-'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">Ref Type: </span>
                  <span className="text-slate-800">{row.issue.refType || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Status: </span>
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${row.issue.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {row.issue.status || '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && rows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-100">
            ไม่พบ issue ตามเงื่อนไข
          </div>
        ) : null}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-200/60 bg-white shadow-sm">
        <table className="w-full text-xs border-collapse" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {reconColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100/75 text-slate-700 border-b border-slate-200">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="กลุ่ม" resizeProps={columnResize.getResizeHandleProps('groupKey', 'กลุ่ม')} sortKey="groupKey" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="ประเภท issue" resizeProps={columnResize.getResizeHandleProps('issue', 'ประเภท issue')} sortKey="issue" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="Ref Type" resizeProps={columnResize.getResizeHandleProps('refType', 'Ref Type')} sortKey="refType" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="Doc No" resizeProps={columnResize.getResizeHandleProps('docNo', 'Doc No')} sortKey="docNo" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="Ref No" resizeProps={columnResize.getResizeHandleProps('refNo', 'Ref No')} sortKey="refNo" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('productCode', 'สินค้า')} sortKey="productCode" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="คลัง" resizeProps={columnResize.getResizeHandleProps('warehouseCode', 'คลัง')} sortKey="warehouseCode" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="Net Qty" resizeProps={columnResize.getResizeHandleProps('netQty', 'Net Qty')} sortKey="netQty" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="Expected" resizeProps={columnResize.getResizeHandleProps('expected', 'Expected')} sortKey="expected" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey} align="left" direction={sortDirection} label="Status" resizeProps={columnResize.getResizeHandleProps('status', 'Status')} sortKey="status" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังตรวจข้อมูล</td></tr> : null}
            {!isLoading && sortedRows.map((row, index) => (
              <tr key={`${row.groupKey}-${row.issue.docNo ?? row.issue.refNo ?? index}`} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 align-top">
                  <div className="font-semibold text-slate-900">{groupLabels[row.groupKey].label}</div>
                  <div className="mt-0.5 max-w-48 text-[11px] leading-4 text-slate-500">{groupLabels[row.groupKey].note}</div>
                </td>
                <td className="px-3 py-2 align-top font-medium text-slate-800">{issueText(row.issue.issue)}</td>
                <td className="px-3 py-2 align-top">{displayValue(row.issue.refType)}</td>
                <td className="px-3 py-2 align-top font-semibold text-slate-900">{displayValue(row.issue.docNo)}</td>
                <td className="px-3 py-2 align-top">{displayValue(row.issue.refNo)}</td>
                <td className="px-3 py-2 align-top">{displayValue(row.issue.productCode)}</td>
                <td className="px-3 py-2 align-top">{displayValue(row.issue.warehouseCode)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{displayValue(row.issue.netQty)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{displayValue(row.issue.expected)}</td>
                <td className="px-3 py-2 align-top">{displayValue(row.issue.status)}</td>
              </tr>
            ))}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={10}>ไม่พบ issue ตามเงื่อนไข</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({
  emoji,
  iconBg = 'bg-slate-100',
  label,
  sub,
  tone,
  value,
  className,
}: {
  emoji: string
  iconBg?: string
  label: string
  sub?: string
  tone?: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'
  value: string
  className?: string
}) {
  const color = tone === 'blue'
    ? 'text-blue-600'
    : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-600'
          : 'text-slate-900'

  return (
    <div className={`bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3 ${className || ''}`}>
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-500 truncate">{label}</div>
        <div className={`text-sm font-bold ${color} mt-0.5 tabular-nums`}>{value}</div>
        {sub ? <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div> : null}
      </div>
    </div>
  )
}
