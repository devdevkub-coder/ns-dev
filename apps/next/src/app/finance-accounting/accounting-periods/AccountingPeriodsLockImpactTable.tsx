'use client'

import { useMemo, useState } from 'react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type LockImpact = {
  area: string
  impact: string
}

type LockImpactColumnKey = keyof LockImpact
type SortDirection = 'asc' | 'desc'

const lockImpactColumns: Array<ResizableColumnDefinition<LockImpactColumnKey>> = [
  { key: 'area', defaultWidth: 180, minWidth: 140 },
  { key: 'impact', defaultWidth: 680, minWidth: 360 },
]

export function AccountingPeriodsLockImpactTable({ rows }: { rows: readonly (readonly [string, string])[] }) {
  const [sortKey, setSortKey] = useState<LockImpactColumnKey | null>('area')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('finance-accounting.accounting-periods.lock-impact.v1', lockImpactColumns)

  const tableRows = useMemo<LockImpact[]>(() => rows.map(([area, impact]) => ({ area, impact })), [rows])
  const sortedRows = useMemo(() => {
    const result = [...tableRows]
    if (!sortKey) return result

    return result.sort((left, right) => {
      const compare = left[sortKey].localeCompare(right[sortKey], 'th', { numeric: true })
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [sortDirection, sortKey, tableRows])

  function handleSort(key: LockImpactColumnKey) {
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
            <h3 className="text-sm font-bold text-slate-900">ผลกระทบเมื่อปิดงวด</h3>
          </div>
          {columnResize.hasCustomWidths ? (
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-normal text-slate-700 hover:bg-slate-50 focus-visible:outline-none"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {lockImpactColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="หมวดงาน" resizeProps={columnResize.getResizeHandleProps('area', 'หมวดงาน')} sortKey="area" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ผลกระทบที่ต้องล็อก" resizeProps={columnResize.getResizeHandleProps('impact', 'ผลกระทบที่ต้องล็อก')} sortKey="impact" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {sortedRows.map((row) => (
              <tr key={row.area} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap p-3 align-top font-semibold text-slate-900">{row.area}</td>
                <td className="min-w-0 p-3 align-top text-right text-slate-700"><span className="block break-words">{row.impact}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {sortedRows.map((row) => (
          <div key={row.area} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-900">{row.area}</p>
            <p className="mt-2 text-xs leading-5 text-slate-700">{row.impact}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
