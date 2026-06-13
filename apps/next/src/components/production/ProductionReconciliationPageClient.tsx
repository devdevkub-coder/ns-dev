'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

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

export function ProductionReconciliationPageClient() {
  const [data, setData] = useState<ProductionReconciliationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [issueFilter, setIssueFilter] = useState('all')
  const [query, setQuery] = useState('')

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Metric label="รวม issue" tone={totalIssues > 0 ? 'red' : 'emerald'} value={String(totalIssues)} />
        {refTypeOrder.map((refType) => (
          <Metric key={refType} label={refType} tone={(byRefType[refType] ?? 0) > 0 ? 'amber' : 'slate'} value={String(byRefType[refType] ?? 0)} />
        ))}
        <Metric label="จำกัดผล" tone="slate" value={String(data?.summary.limit ?? 500)} />
      </div>

      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="h-9 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
              placeholder="ค้นหา order/doc/ref/details"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="h-9 rounded-md border border-slate-300 px-3 text-sm" value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)}>
            <option value="all">ทุกประเภท issue</option>
            {issueKeys.map((issue) => <option key={issue} value={issue}>{issueLabel(issue)}</option>)}
          </select>
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60" disabled={isLoading} type="button" onClick={() => void loadData()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {totalIssues === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>{totalIssues === 0 ? 'ไม่พบ production reconciliation issue' : `พบ ${totalIssues} issue จาก production facts/ledger`}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full min-w-[1120px] text-xs">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">ประเภท issue</th>
              <th className="px-3 py-2 font-semibold">Ref Type</th>
              <th className="px-3 py-2 font-semibold">Order No</th>
              <th className="px-3 py-2 font-semibold">Doc No</th>
              <th className="px-3 py-2 text-right font-semibold">Expected Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Actual Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Expected Value</th>
              <th className="px-3 py-2 text-right font-semibold">Actual Value</th>
              <th className="px-3 py-2 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>กำลังตรวจข้อมูล</td></tr> : null}
            {!isLoading && rows.map((issue, index) => (
              <tr key={`${issue.issue}-${issue.refType}-${issue.docNo}-${index}`} className="hover:bg-slate-50">
                <td className="px-3 py-2 align-top">
                  <div className="font-semibold text-slate-900">{issueLabel(issue.issue)}</div>
                  <div className="mt-0.5 max-w-64 text-[11px] leading-4 text-slate-500">{issueNote(issue.issue)}</div>
                </td>
                <td className="px-3 py-2 align-top font-semibold text-slate-700">{issue.refType || '-'}</td>
                <td className="px-3 py-2 align-top font-semibold text-slate-900">{issue.orderDocNo || '-'}</td>
                <td className="px-3 py-2 align-top font-mono text-slate-700">{issue.docNo || '-'}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{formatMoney(issue.expectedQty)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{formatMoney(issue.actualQty)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{formatMoney(issue.expectedValue)}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{formatMoney(issue.actualValue)}</td>
                <td className="max-w-[360px] px-3 py-2 align-top text-slate-600">{detailsText(issue.details)}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>ไม่พบ issue ตามเงื่อนไข</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, tone, value }: { label: string; tone: 'amber' | 'emerald' | 'red' | 'slate'; value: string }) {
  const className = tone === 'red'
    ? 'border-red-200 bg-red-50 text-red-800'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-white text-slate-800'

  return (
    <div className={`rounded-md border p-3 shadow-sm ${className}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}
