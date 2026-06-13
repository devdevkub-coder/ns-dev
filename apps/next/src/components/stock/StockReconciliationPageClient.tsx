'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

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
}

const groupOrder: ReconciliationGroupKey[] = [
  'missingSourceLedger',
  'orphanLedger',
  'cancelledDocumentNet',
  'cancelledSalesHolds',
  'pendingSaleIntegrity',
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

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const entries = groupOrder.flatMap((key) => (data?.groups[key] ?? []).map((issue) => ({ groupKey: key, issue })))
      .filter((entry) => group === 'all' || entry.groupKey === group)
    if (!normalizedQuery) return entries
    return entries.filter((entry) => Object.values(entry.issue).join(' ').toLowerCase().includes(normalizedQuery))
  }, [data?.groups, group, query])

  const totalIssues = groupOrder.reduce((sum, key) => sum + (data?.totals[key] ?? 0), 0)
  const generatedText = data?.generatedAt
    ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))
    : '-'

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 shadow-sm grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 lg:grid-cols-7 text-sm">
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
          <select className="h-9 rounded-md border border-slate-300 px-3 text-sm" value={group} onChange={(event) => setGroup(event.target.value as ReconciliationGroupKey | 'all')}>
            <option value="all">ทุกกลุ่ม</option>
            {groupOrder.map((key) => <option key={key} value={key}>{groupLabels[key].label}</option>)}
          </select>
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 ml-auto" disabled={isLoading} type="button" onClick={() => void loadData()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {totalIssues === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
          <span>ตรวจล่าสุด {generatedText}</span>
        </div>
      </div>
      {/* Mobile Card list */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังตรวจข้อมูล</div>
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
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            ไม่พบ issue ตามเงื่อนไข
          </div>
        ) : null}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full min-w-[1080px] text-xs">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">กลุ่ม</th>
              <th className="px-3 py-2 font-semibold">ประเภท issue</th>
              <th className="px-3 py-2 font-semibold">Ref Type</th>
              <th className="px-3 py-2 font-semibold">Doc No</th>
              <th className="px-3 py-2 font-semibold">Ref No</th>
              <th className="px-3 py-2 font-semibold">สินค้า</th>
              <th className="px-3 py-2 font-semibold">คลัง</th>
              <th className="px-3 py-2 text-right font-semibold">Net Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Expected</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังตรวจข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row, index) => (
              <tr key={`${row.groupKey}-${row.issue.docNo ?? row.issue.refNo ?? index}`} className="hover:bg-slate-50">
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
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={10}>ไม่พบ issue ตามเงื่อนไข</td></tr> : null}
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
