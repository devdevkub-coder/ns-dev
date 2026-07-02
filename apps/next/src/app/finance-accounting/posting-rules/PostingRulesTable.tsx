'use client'

import { useMemo, useState } from 'react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type RuleGroup = {
  concern: string
  group: string
  readiness: string
  source: string
}

type RuleColumnKey = keyof RuleGroup
type SortDirection = 'asc' | 'desc'

const ruleColumns: Array<ResizableColumnDefinition<RuleColumnKey>> = [
  { key: 'group', defaultWidth: 140, minWidth: 120 },
  { key: 'source', defaultWidth: 260, minWidth: 200 },
  { key: 'concern', defaultWidth: 360, minWidth: 260 },
  { key: 'readiness', defaultWidth: 220, minWidth: 170 },
]

export function PostingRulesTable({ rows }: { rows: readonly RuleGroup[] }) {
  const [sortKey, setSortKey] = useState<RuleColumnKey | null>('group')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('finance-accounting.posting-rules.rule-groups.v1', ruleColumns)

  const sortedRows = useMemo(() => {
    const result = [...rows]
    if (!sortKey) return result

    return result.sort((left, right) => {
      const compare = left[sortKey].localeCompare(right[sortKey], 'th', { numeric: true })
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [rows, sortDirection, sortKey])

  function handleSort(key: RuleColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Target rule groups</h3>
            <p className="mt-1 text-xs text-slate-500">รายการนี้เป็น readiness matrix ยังไม่ใช่ account mapping ที่บันทึกลง DB</p>
          </div>
          {columnResize.hasCustomWidths ? (
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าตาราง
            </button>
          ) : null}
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {ruleColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="Group" resizeProps={columnResize.getResizeHandleProps('group', 'Group')} sortKey="group" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="Example source" resizeProps={columnResize.getResizeHandleProps('source', 'Example source')} sortKey="source" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="Target mapping concern" resizeProps={columnResize.getResizeHandleProps('concern', 'Target mapping concern')} sortKey="concern" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="Readiness" resizeProps={columnResize.getResizeHandleProps('readiness', 'Readiness')} sortKey="readiness" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {sortedRows.map((rule) => (
              <tr key={rule.group} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap p-3 align-top font-semibold text-slate-900">{rule.group}</td>
                <td className="min-w-0 p-3 align-top text-slate-700"><span className="break-words">{rule.source}</span></td>
                <td className="min-w-0 p-3 align-top text-slate-700"><span className="break-words">{rule.concern}</span></td>
                <td className="p-3 align-top">
                  <RuleStatusBadge>{rule.readiness}</RuleStatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {sortedRows.map((rule) => (
          <div key={rule.group} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{rule.group}</p>
                <p className="mt-1 text-xs text-slate-500">{rule.source}</p>
              </div>
              <RuleStatusBadge>{rule.readiness}</RuleStatusBadge>
            </div>
            <div className="mt-3 text-xs leading-5 text-slate-700">
              <span className="font-semibold text-slate-500">Target mapping concern: </span>
              {rule.concern}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RuleStatusBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      {children}
    </span>
  )
}
