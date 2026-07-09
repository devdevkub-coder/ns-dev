'use client'

import { useEffect, useMemo, useState } from 'react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type StorageInfo = {
  dbSizeMB: string
  pctUsed: number
  sizeMB: string
  snapshotCount: number
  warningLevel: 'critical' | 'normal' | 'warning'
}

type SnapshotColumnKey = 'date' | 'sizeKb'
type SortDirection = 'asc' | 'desc'

type SnapshotRow = {
  date: string
  id: string
  sizeKb: number
}

const snapshotColumns: Array<ResizableColumnDefinition<SnapshotColumnKey>> = [
  { key: 'date', defaultWidth: 190, minWidth: 150 },
  { key: 'sizeKb', defaultWidth: 140, minWidth: 120 },
]

const snapshotRows: SnapshotRow[] = []

const recordStats = [
  ['บิลซื้อ', 0],
  ['บิลขาย', 0],
  ['จ่ายเงิน', 0],
  ['รับเงิน', 0],
  ['โอน', 0],
  ['ค่าใช้จ่าย', 0],
  ['ผลิต', 0],
  ['PO ซื้อ', 0],
  ['PO ขาย', 0],
  ['Stock Ledger', 0],
  ['ลูกค้า', 0],
  ['Supplier', 0],
] as const

function readStorageInfo(): StorageInfo {
  if (typeof window === 'undefined') {
    return { dbSizeMB: '0.00', pctUsed: 0, sizeMB: '0.00', snapshotCount: 0, warningLevel: 'normal' }
  }

  let totalBytes = 0
  let dbBytes = 0
  let snapshotCount = 0

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) ?? ''
    const value = window.localStorage.getItem(key) ?? ''
    const bytes = new Blob([key, value]).size
    totalBytes += bytes
    if (key === 'ns_scrap_erp' || key === 'ns_erp_db') dbBytes += bytes
    if (key.startsWith('ns_erp_backup_') || key.startsWith('ns_erp_snapshot_') || key.includes('_pre_pull')) snapshotCount += 1
  }

  const limitBytes = 9 * 1024 * 1024
  const pctUsed = Math.min(100, Math.round((totalBytes / limitBytes) * 100))
  return {
    dbSizeMB: (dbBytes / 1024 / 1024).toFixed(2),
    pctUsed,
    sizeMB: (totalBytes / 1024 / 1024).toFixed(2),
    snapshotCount,
    warningLevel: pctUsed >= 85 ? 'critical' : pctUsed >= 65 ? 'warning' : 'normal',
  }
}

export function MigrationToolsPageClient() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo>(() => ({ dbSizeMB: '0.00', pctUsed: 0, sizeMB: '0.00', snapshotCount: 0, warningLevel: 'normal' }))
  const [snapshotSortKey, setSnapshotSortKey] = useState<SnapshotColumnKey | null>(null)
  const [snapshotSortDirection, setSnapshotSortDirection] = useState<SortDirection>('asc')
  const snapshotColumnResize = useResizableColumns('admin.migration-tools.snapshots.v1', snapshotColumns)

  useEffect(() => {
    setStorageInfo(readStorageInfo())
  }, [])

  const barColor = useMemo(() => {
    if (storageInfo.warningLevel === 'critical') return 'bg-red-500'
    if (storageInfo.warningLevel === 'warning') return 'bg-amber-500'
    return 'bg-emerald-500'
  }, [storageInfo.warningLevel])

  const sortedSnapshotRows = useMemo(() => {
    if (!snapshotSortKey) return snapshotRows

    return [...snapshotRows].sort((left, right) => {
      const leftValue = getSnapshotSortValue(left, snapshotSortKey)
      const rightValue = getSnapshotSortValue(right, snapshotSortKey)
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'th', { numeric: true })

      return snapshotSortDirection === 'asc' ? result : -result
    })
  }, [snapshotSortDirection, snapshotSortKey])

  function handleSnapshotSort(key: SnapshotColumnKey) {
    if (snapshotSortKey === key) {
      setSnapshotSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSnapshotSortKey(key)
    setSnapshotSortDirection('asc')
  }

  return (
    <section className="space-y-4">
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 text-slate-900 shadow-sm lg:block">
        <h1 className="text-xl font-bold">💾 Backup / Restore — สำรองข้อมูล</h1>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-3.5 text-slate-900 shadow-sm animate-fade-in lg:hidden">
        <h1 className="text-lg font-bold">💾 Backup / Restore — สำรองข้อมูล</h1>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-800">📊 สถานะ Storage (browser localStorage)</h2>
        <div className="grid grid-cols-2 gap-3.5 text-sm sm:grid-cols-3 md:grid-cols-5">
          <div className="bg-slate-50 p-2.5 rounded border border-slate-100"><div className="text-xs text-slate-500 font-semibold">ขนาดรวม</div><div className="text-lg font-bold text-emerald-700 mt-0.5">{storageInfo.sizeMB} MB</div></div>
          <div className="bg-slate-50 p-2.5 rounded border border-slate-100"><div className="text-xs text-slate-500 font-semibold">% ใช้งาน (~9MB limit)</div><div className="text-lg font-bold text-emerald-700 mt-0.5">{storageInfo.pctUsed}%</div></div>
          <div className="bg-slate-50 p-2.5 rounded border border-slate-100"><div className="text-xs text-slate-500 font-semibold">Database จริง</div><div className="text-base font-bold text-slate-800 mt-0.5">{storageInfo.dbSizeMB} MB</div></div>
          <div className="bg-slate-50 p-2.5 rounded border border-slate-100"><div className="text-xs text-slate-500 font-semibold">Snapshots/Backups</div><div className="text-base font-bold text-slate-800 mt-0.5">{storageInfo.snapshotCount} รายการ</div></div>
          <div className="bg-slate-50 p-2.5 rounded border border-slate-100 col-span-2 sm:col-span-1 flex flex-col justify-between">
            <div className="text-xs text-slate-500 font-semibold">Auto-backup รายวัน</div>
            <span className="mt-1.5 inline-flex h-6 w-fit items-center rounded bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">ปิด</span>
          </div>
        </div>
        <div className="mt-4 h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${storageInfo.pctUsed}%` }} />
        </div>
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800">
          โหมดปลอดภัย: อ่าน localStorage ได้เท่านั้น ยังไม่ล้าง snapshot, ไม่ restore, ไม่ sync cloud และไม่ reset ข้อมูล
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-800">📋 จำนวน Records ในระบบ</h2>
        <div className="grid grid-cols-3 gap-2.5 text-sm md:grid-cols-6">
          {recordStats.map(([label, value]) => (
            <div className="rounded border border-slate-100 bg-slate-50/80 p-2.5 flex flex-col justify-between" key={label}>
              <div className="text-xs text-slate-500 font-medium">{label}</div>
              <div className="font-bold text-base text-slate-900 mt-1">{value.toLocaleString('th-TH')}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold text-slate-700">🗂 Snapshot อัตโนมัติ (Browser นี้ — เก็บ 7 วันล่าสุด)</h2>
          {snapshotColumnResize.hasCustomWidths ? (
            <button className="h-8 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={snapshotColumnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
          <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: snapshotColumnResize.tableMinWidth }}>
            <colgroup>
              {snapshotColumns.map((column, index) => {
                const style = snapshotColumnResize.getColumnStyle(column.key)
                if (index === snapshotColumns.length - 1) {
                  return <col key={column.key} style={{ minWidth: column.minWidth }} />
                }
                return <col key={column.key} style={style} />
              })}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                <ResizableTableHead label="วันที่ Snapshot" activeSortKey={snapshotSortKey ?? undefined} direction={snapshotSortDirection} sortKey="date" onSort={handleSnapshotSort} resizeProps={snapshotColumnResize.getResizeHandleProps('date', 'วันที่ Snapshot')} />
                <ResizableTableHead align="right" label="ขนาด (KB)" activeSortKey={snapshotSortKey ?? undefined} direction={snapshotSortDirection} sortKey="sizeKb" onSort={handleSnapshotSort} resizeProps={snapshotColumnResize.getResizeHandleProps('sizeKb', 'ขนาด (KB)')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedSnapshotRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-xs text-slate-400" colSpan={snapshotColumns.length}>
                    ยังไม่มี snapshot — เปิด Auto-backup หลังออกแบบ write flow
                  </td>
                </tr>
              ) : sortedSnapshotRows.map((row) => (
                <tr className="hover:bg-slate-50" key={row.id}>
                  <td className="px-3 py-3 font-medium text-slate-800">{row.date}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{row.sizeKb.toLocaleString('th-TH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </section>
  )
}

function getSnapshotSortValue(row: SnapshotRow, key: SnapshotColumnKey): number | string {
  if (key === 'date') {
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? row.date : timestamp
  }
  if (key === 'sizeKb') return row.sizeKb
  return row.date
}
