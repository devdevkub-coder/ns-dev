'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'

type ProductionReconciliationIssue = {
  actualQty: number
  actualValue: number
  details: Record<string, unknown>
  docNo: string
  expectedQty: number
  expectedValue: number
  issue: string
  orderDocNo: string
  refType: string
}

type ProductionReconciliationPayload = {
  issues: ProductionReconciliationIssue[]
  summary: {
    byIssue: Record<string, number>
    byRefType: Record<string, number>
    hasIssues: boolean
    issueCount: number
    limit: number
  }
}

const issueLabels: Record<string, { label: string; note: string }> = {
  completed_wip_mismatch: {
    label: 'Completed แต่ WIP ไม่เป็นศูนย์',
    note: 'ใบสั่งผลิตที่จบงานแล้วต้องไม่มี WIP คงเหลือ',
  },
  input_ledger_mismatch: {
    label: 'PI ไม่สมดุล',
    note: 'PI ต้องมี source-out และ WIP-in เท่ากันทั้งจำนวนและมูลค่า',
  },
  missing_reversal_ledger: {
    label: 'Reversal ขาด ledger',
    note: 'รายการ reverse ต้องมี ledger ฝั่งกลับครบ',
  },
  output_ledger_mismatch: {
    label: 'PO2 ไม่สมดุล',
    note: 'PO2 ต้องตัด WIP เท่ากับ FG/RM ที่รับรวมกับ loss',
  },
  open_order_movement_mismatch: {
    label: 'Open order movement ไม่ตรง',
    note: 'ยอด active input/output ของใบที่ยังไม่จบต้อง reconcile กับ WIP',
  },
}

const refTypeOrder = ['PI', 'PI-REV', 'PO2', 'PO2-REV']

function issueLabel(issue: string) {
  return issueLabels[issue]?.label ?? issue
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function issueNote(issue: string) {
  return issueLabels[issue]?.note ?? 'ตรวจพบความคลาดเคลื่อนจาก production reconciliation view'
}

function detailsText(details: Record<string, unknown>) {
  const entries = Object.entries(details).filter(([, value]) => value != null && value !== '')
  if (entries.length === 0) return '-'
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
}

const reconciliationColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'issue', defaultWidth: 200 },
  { key: 'refType', defaultWidth: 100 },
  { key: 'orderDocNo', defaultWidth: 120 },
  { key: 'docNo', defaultWidth: 120 },
  { key: 'expectedQty', defaultWidth: 120 },
  { key: 'actualQty', defaultWidth: 120 },
  { key: 'expectedValue', defaultWidth: 120 },
  { key: 'actualValue', defaultWidth: 120 },
  { key: 'details', defaultWidth: 250 },
]

export function ProductionReconciliationPageClient() {
  const [data, setData] = useState<ProductionReconciliationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const columnResize = useResizableColumns('production.reconciliation.main.v5', reconciliationColumns)
  const [isLoading, setIsLoading] = useState(true)
  const [issueFilter, setIssueFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<ProductionReconciliationPayload>('/api/production/reconciliation'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Production Reconciliation ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const issueKeys = useMemo(() => {
    const keys = new Set<string>(Object.keys(issueLabels))
    for (const key of Object.keys(data?.summary.byIssue ?? {})) keys.add(key)
    return Array.from(keys).sort((a, b) => issueLabel(a).localeCompare(issueLabel(b), 'th'))
  }, [data?.summary.byIssue])

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return (data?.issues ?? [])
      .filter((issue) => issueFilter === 'all' || issue.issue === issueFilter)
      .filter((issue) => {
        if (!normalizedQuery) return true
        return [
          issue.issue,
          issue.refType,
          issue.docNo,
          issue.orderDocNo,
          detailsText(issue.details),
        ].join(' ').toLowerCase().includes(normalizedQuery)
      })
  }, [data?.issues, issueFilter, query])

  const totalIssues = data?.summary.issueCount ?? 0
  const byRefType = data?.summary.byRefType ?? {}

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {/* Metrics Header */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-6 text-sm">
        <Metric
          emoji={totalIssues > 0 ? '⚠️' : '✅'}
          iconBg={totalIssues > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}
          label="รวม issue"
          tone={totalIssues > 0 ? 'red' : 'emerald'}
          value={String(totalIssues)}
        />
        {refTypeOrder.map((refType) => {
          const count = byRefType[refType] ?? 0
          return (
            <Metric
              key={refType}
              emoji={count > 0 ? '⚠️' : '📄'}
              iconBg={count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}
              label={refType}
              tone={count > 0 ? 'amber' : 'slate'}
              value={String(count)}
            />
          )
        })}
        <Metric
          emoji="⚙️"
          iconBg="bg-slate-100 text-slate-700"
          label="จำกัดผล"
          tone="slate"
          value={String(data?.summary.limit ?? 500)}
        />
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="h-9 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
              placeholder="ค้นหา order/doc/ref/details..."
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="h-9 rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)}>
            <option value="all">ทุกประเภท issue</option>
            {issueKeys.map((issue) => <option key={issue} value={issue}>{issueLabel(issue)}</option>)}
          </select>
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 ml-auto" disabled={isLoading} type="button" onClick={() => void loadData()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {totalIssues === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>{totalIssues === 0 ? 'ไม่พบ production reconciliation issue' : `พบ ${totalIssues} issue จาก production facts/ledger`}</span>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="lg:hidden rounded-md bg-white p-3 shadow space-y-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              className="h-9 w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm"
              placeholder="ค้นหา..."
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="h-9 rounded-md bg-slate-100 px-2 text-xs text-slate-700 font-medium flex items-center gap-1 shrink-0" type="button" onClick={() => void loadData()}>
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            โหลดใหม่
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shrink-0"
            onClick={() => setShowMobileFilters(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            ตัวกรอง {issueFilter !== 'all' ? '(1)' : ''}
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {totalIssues === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
          <span className="truncate">{totalIssues === 0 ? 'ไม่พบปัญหา' : `พบ ${totalIssues} ปัญหา`}</span>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden animate-fade-in">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรอง Issue</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภท Issue</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)}>
                  <option value="all">ทุกประเภท issue</option>
                  {issueKeys.map((issue) => <option key={issue} value={issue}>{issueLabel(issue)}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setIssueFilter('all')
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Desktop Table View (Hidden on Mobile) */}
      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {reconciliationColumns.map((col) => (
                <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-100 text-left text-slate-500">
              <tr>
                <ResizableTableHead label="ประเภท issue" resizeProps={columnResize.getResizeHandleProps('issue', 'ประเภท issue')} />
                <ResizableTableHead label="Ref Type" resizeProps={columnResize.getResizeHandleProps('refType', 'Ref Type')} />
                <ResizableTableHead label="Order No" resizeProps={columnResize.getResizeHandleProps('orderDocNo', 'Order No')} />
                <ResizableTableHead label="Doc No" resizeProps={columnResize.getResizeHandleProps('docNo', 'Doc No')} />
                <ResizableTableHead align="right" label="Expected Qty" resizeProps={columnResize.getResizeHandleProps('expectedQty', 'Expected Qty')} />
                <ResizableTableHead align="right" label="Actual Qty" resizeProps={columnResize.getResizeHandleProps('actualQty', 'Actual Qty')} />
                <ResizableTableHead align="right" label="Expected Value" resizeProps={columnResize.getResizeHandleProps('expectedValue', 'Expected Value')} />
                <ResizableTableHead align="right" label="Actual Value" resizeProps={columnResize.getResizeHandleProps('actualValue', 'Actual Value')} />
                <ResizableTableHead label="Details" resizeProps={columnResize.getResizeHandleProps('details', 'Details')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>กำลังตรวจข้อมูล</td></tr> : null}
              {!isLoading && rows.map((issue, index) => (
                <tr key={`${issue.issue}-${issue.refType}-${issue.docNo}-${index}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 align-top overflow-hidden truncate">
                    <div className="font-semibold text-slate-900">{issueLabel(issue.issue)}</div>
                    <div className="mt-0.5 text-xs leading-4 text-slate-500">{issueNote(issue.issue)}</div>
                  </td>
                  <td className="px-3 py-2 align-top font-semibold text-slate-700 overflow-hidden truncate">{issue.refType || '-'}</td>
                  <td className="px-3 py-2 align-top font-semibold text-slate-900 overflow-hidden truncate">{issue.orderDocNo || '-'}</td>
                  <td className="px-3 py-2 align-top font-mono text-slate-700 overflow-hidden truncate">{issue.docNo || '-'}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-slate-700 overflow-hidden truncate">{formatMoney(issue.expectedQty)}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-slate-700 overflow-hidden truncate">{formatMoney(issue.actualQty)}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-slate-700 overflow-hidden truncate">{formatMoney(issue.expectedValue)}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-slate-700 overflow-hidden truncate">{formatMoney(issue.actualValue)}</td>
                  <td className="px-3 py-2 align-top text-slate-600 overflow-hidden truncate">{detailsText(issue.details)}</td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>ไม่พบ issue ตามเงื่อนไข</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile View: Dense Card List (Hidden on Desktop) */}
      {!isLoading && rows.length > 0 ? (
        <div className="space-y-3 lg:hidden">
          {rows.map((issue, index) => (
            <div key={`${issue.issue}-${issue.refType}-${issue.docNo}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{issue.refType || '-'}</span>
                  <div className="mt-1 font-bold text-slate-900 text-base leading-snug">{issueLabel(issue.issue)}</div>
                </div>
                {issue.orderDocNo ? (
                  <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shrink-0">{issue.orderDocNo}</span>
                ) : null}
              </div>
              <div className="text-sm text-slate-500 leading-normal">{issueNote(issue.issue)}</div>
              {issue.docNo ? (
                <div className="text-sm font-mono text-slate-500">
                  <span className="text-slate-400">Doc No: </span>{issue.docNo}
                </div>
              ) : null}
              
              <div className="grid grid-cols-2 gap-3 border-t border-b border-slate-100 py-2.5 text-sm">
                <div>
                  <span className="text-slate-400 block text-xs uppercase font-semibold">Qty (Expected / Actual)</span>
                  <span className="font-bold tabular-nums text-slate-700 block mt-0.5">{formatMoney(issue.expectedQty)} / {formatMoney(issue.actualQty)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs uppercase font-semibold">Value (Expected / Actual)</span>
                  <span className="font-bold tabular-nums text-slate-700 block mt-0.5">{formatMoney(issue.expectedValue)} / {formatMoney(issue.actualValue)}</span>
                </div>
              </div>
              
              <div className="text-sm text-slate-600 pt-0.5 break-all">
                <span className="font-semibold text-slate-700">รายละเอียด: </span>
                {detailsText(issue.details)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-slate-400 shadow-sm lg:hidden">
          ไม่พบ issue ตามเงื่อนไข
        </div>
      ) : null}
      
      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-slate-400 shadow-sm lg:hidden">
          กำลังตรวจข้อมูล...
        </div>
      ) : null}
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
        <div className="text-sm font-semibold text-slate-500 truncate">{label}</div>
        <div className={`text-base font-bold ${color} mt-0.5 tabular-nums`}>{value}</div>
        {sub ? <div className="text-xs text-slate-500 font-medium mt-0.5 truncate">{sub}</div> : null}
      </div>
    </div>
  )
}
