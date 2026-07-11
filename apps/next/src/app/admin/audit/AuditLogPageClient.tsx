'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessage, readJsonResponse } from '@/lib/api-client'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { SlidersHorizontal } from 'lucide-react'
import { z } from 'zod'

type AuditUser = { displayName: string | null; email: string } | null

type AuditEvent = {
  actor: AuditUser
  createdAt: string
  eventType: string
  id: string
  metadata?: unknown
  target: AuditUser
  userAgent: string | null
}

type AuditPayload = {
  page: number
  pageSize: number
  rows: AuditEvent[]
  total: number
  totalPages: number
}

const auditUserSchema = z.object({
  displayName: z.string().nullable(),
  email: z.string(),
}).nullable()

const auditPayloadSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  rows: z.array(z.object({
    actor: auditUserSchema,
    createdAt: z.string(),
    eventType: z.string(),
    id: z.string(),
    metadata: z.any().default(null),
    target: auditUserSchema,
    userAgent: z.string().nullable(),
  })),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
})

type EventGroup = 'all' | 'auth' | 'users' | 'permissions' | 'activity'
type AuditColumnKey = 'actor' | 'createdAt' | 'event' | 'group' | 'metadata' | 'target'
type SortDirection = 'asc' | 'desc'

const eventGroups: Array<{ label: string; value: EventGroup }> = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'Auth', value: 'auth' },
  { label: 'Users', value: 'users' },
  { label: 'Permissions', value: 'permissions' },
  { label: 'Activity', value: 'activity' },
]

const pageSizeOptions = [25, 50, 100, 200]
const auditColumns: Array<ResizableColumnDefinition<AuditColumnKey>> = [
  { key: 'createdAt', defaultWidth: 170, minWidth: 140 },
  { key: 'group', defaultWidth: 130, minWidth: 110 },
  { key: 'event', defaultWidth: 230, minWidth: 170 },
  { key: 'actor', defaultWidth: 210, minWidth: 150 },
  { key: 'target', defaultWidth: 210, minWidth: 150 },
  { key: 'metadata', defaultWidth: 360, minWidth: 220 },
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function userLabel(user: AuditUser) {
  if (!user) return '-'
  return user.displayName ? `${user.displayName} (${user.email})` : user.email
}

function metadataText(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return '-'
  return JSON.stringify(metadata, null, 2)
}

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function exportAuditCsv(rows: AuditEvent[]) {
  const header = ['เวลา', 'กลุ่ม', 'เหตุการณ์', 'event_type', 'ผู้ทำรายการ', 'เป้าหมาย', 'user_agent', 'metadata']
  const body = rows.map((row) => [
    row.createdAt,
    eventGroup(row.eventType),
    eventTitle(row.eventType),
    row.eventType,
    userLabel(row.actor),
    userLabel(row.target),
    row.userAgent ?? '',
    metadataText(row.metadata),
  ])
  const csv = [header, ...body].map((line) => line.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit_activity_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function eventGroup(eventType: string) {
  if (eventType.includes('login') || eventType.includes('invite') || eventType.includes('reset')) return 'Auth'
  if (eventType.startsWith('app_user.')) return 'Users'
  if (eventType.includes('permission') || eventType.includes('role')) return 'Permissions'
  return 'Activity'
}

function groupBadgeClass(group: string) {
  if (group === 'Auth') return 'bg-sky-50 text-sky-700 border-sky-100'
  if (group === 'Users') return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (group === 'Permissions') return 'bg-amber-50 text-amber-700 border-amber-100'
  return 'bg-slate-100 text-slate-700 border-slate-100'
}

function eventTitle(eventType: string) {
  const labels: Record<string, string> = {
    'app_user.created': 'สร้างผู้ใช้',
    'app_user.invite_sent': 'ส่งคำเชิญ',
    'app_user.reset_sent': 'ส่ง Reset Password',
    'app_user.status_updated': 'เปลี่ยนสถานะผู้ใช้',
    'app_user.updated': 'แก้ไขผู้ใช้/สิทธิ์',
  }

  return labels[eventType] ?? eventType
}

function buildQuery(filters: {
  actor: string
  eventType: string
  group: EventGroup
  page: number
  pageSize: number
  q: string
  target: string
}) {
  const params = new URLSearchParams()
  params.set('page', String(filters.page))
  params.set('pageSize', String(filters.pageSize))
  if (filters.actor.trim()) params.set('actor', filters.actor.trim())
  if (filters.eventType.trim()) params.set('eventType', filters.eventType.trim())
  if (filters.group !== 'all') params.set('group', filters.group)
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.target.trim()) params.set('target', filters.target.trim())
  return params.toString()
}

export function AuditLogPageClient() {
  const [actor, setActor] = useState('')
  const [eventType, setEventType] = useState('')
  const [group, setGroup] = useState<EventGroup>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState('')
  const [data, setData] = useState<AuditPayload>({ page: 1, pageSize: 50, rows: [], total: 0, totalPages: 1 })
  const [selectedRow, setSelectedRow] = useState<AuditEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortKey, setSortKey] = useState<AuditColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('admin.audit.main.v1', auditColumns)

  const loadRows = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const search = buildQuery({ actor, eventType, group, page, pageSize, q: query, target })
      const response = await fetch(`/api/admin/auth-events?${search}`, { cache: 'no-store' })
      const payload = await readJsonResponse(response, auditPayloadSchema, 'โหลด Audit & Activity Log ไม่สำเร็จ')

      setData({
        page: Number(payload?.page ?? page),
        pageSize: Number(payload?.pageSize ?? pageSize),
        rows: Array.isArray(payload?.rows) ? payload.rows : [],
        total: Number(payload?.total ?? 0),
        totalPages: Math.max(1, Number(payload?.totalPages ?? 1)),
      })
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลด Audit & Activity Log ไม่สำเร็จ'))
    } finally {
      setIsLoading(false)
    }
  }, [actor, eventType, group, page, pageSize, query, target])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const eventTypes = useMemo(() => Array.from(new Set(data.rows.map((row) => row.eventType))).sort(), [data.rows])
  const summary = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of data.rows) {
      const key = eventGroup(row.eventType)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [data.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return data.rows

    return [...data.rows].sort((a, b) => {
      const aValue = getAuditSortValue(a, sortKey)
      const bValue = getAuditSortValue(b, sortKey)
      const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'th', { numeric: true })

      return sortDirection === 'asc' ? result : -result
    })
  }, [data.rows, sortDirection, sortKey])

  function resetFilters() {
    setActor('')
    setEventType('')
    setGroup('all')
    setPage(1)
    setQuery('')
    setTarget('')
  }

  function handleSort(key: AuditColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <section className="space-y-4">
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Audit & Activity Log</h2>
          </div>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 h-9 flex items-center shrink-0" disabled={isLoading} type="button" onClick={() => void loadRows()}>
            {isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Audit & Activity Log</h2>
        </div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-md border px-3 h-9 text-sm border-slate-300 bg-white" placeholder="ค้นหา..." value={query} onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }} />
          <button className="h-9 rounded-md bg-slate-100 px-3 text-xs text-slate-700 font-semibold" disabled={isLoading} type="button" onClick={() => void loadRows()}>
            Refresh
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shrink-0"
            onClick={() => setShowMobileFilters(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            ตัวกรอง {(actor || eventType || group !== 'all' || target) ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          footer={
            <>
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  resetFilters()
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
            </>
          }
          onClose={() => setShowMobileFilters(false)}
          title="ตัวกรองกิจกรรม"
        >
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">กลุ่ม</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={group} onChange={(event) => {
                  setGroup(event.target.value as EventGroup)
                  setPage(1)
                }}>
                  {eventGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Event Type</span>
                <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" list="audit-event-types-mobile" placeholder="เช่น app_user.updated" value={eventType} onChange={(event) => {
                  setEventType(event.target.value)
                  setPage(1)
                }} />
                <datalist id="audit-event-types-mobile">
                  {eventTypes.map((type) => <option key={type} value={type} />)}
                </datalist>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ผู้ทำรายการ</span>
                <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" placeholder="email/ชื่อแสดง" value={actor} onChange={(event) => {
                  setActor(event.target.value)
                  setPage(1)
                }} />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">เป้าหมาย</span>
                <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" placeholder="email/ชื่อแสดง" value={target} onChange={(event) => {
                  setTarget(event.target.value)
                  setPage(1)
                }} />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ต่อหน้า</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={pageSize} onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}>
                  {pageSizeOptions.map((size) => <option key={size} value={size}>{size} รายการ</option>)}
                </select>
              </label>
        </MobileFilterSheet>
      ) : null}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {eventGroups.filter((item) => item.value !== 'all').map((item) => (
          <button
            key={item.value}
            className={`rounded-xl border bg-white p-3 text-left shadow-sm transition hover:bg-slate-50 ${group === item.value ? 'border-slate-500 bg-slate-50' : 'border-slate-100'}`}
            type="button"
            onClick={() => {
              setGroup(item.value)
              setPage(1)
            }}
          >
            <div className="text-xs font-semibold text-slate-500">{item.label}</div>
            <div className="mt-1 text-xl md:text-2xl font-bold text-slate-900">{summary.get(item.label) ?? 0}</div>
            <div className="mt-1 text-xs text-slate-400">ในหน้าปัจจุบัน</div>
          </button>
        ))}
      </div>

      {/* Desktop Filter Panel (Hidden on Mobile) */}
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="grid gap-3 lg:grid-cols-5">
          <label className="block text-sm font-medium lg:col-span-2">
            ค้นหา
            <input className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-slate-700 text-sm" placeholder="event, user, metadata, user agent" value={query} onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }} />
          </label>
          <label className="block text-sm font-medium">
            กลุ่ม
            <select className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-slate-700 text-sm" value={group} onChange={(event) => {
              setGroup(event.target.value as EventGroup)
              setPage(1)
            }}>
              {eventGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Event Type
            <input className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-slate-700 text-sm" list="audit-event-types" placeholder="app_user.updated" value={eventType} onChange={(event) => {
              setEventType(event.target.value)
              setPage(1)
            }} />
            <datalist id="audit-event-types">
              {eventTypes.map((type) => <option key={type} value={type} />)}
            </datalist>
          </label>
          <label className="block text-sm font-medium">
            ต่อหน้า
            <select className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-slate-700 text-sm" value={pageSize} onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
            }}>
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size} รายการ</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            ผู้ทำรายการ
            <input className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-slate-700 text-sm" placeholder="email/ชื่อแสดง" value={actor} onChange={(event) => {
              setActor(event.target.value)
              setPage(1)
            }} />
          </label>
          <label className="block text-sm font-medium">
            เป้าหมาย
            <input className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-slate-700 text-sm" placeholder="email/ชื่อแสดง" value={target} onChange={(event) => {
              setTarget(event.target.value)
              setPage(1)
            }} />
          </label>
          <div className="flex items-end gap-2 lg:col-span-3">
            <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 h-9 flex items-center shrink-0" type="button" onClick={resetFilters}>ล้าง filter</button>
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 h-9 flex items-center shrink-0 ml-auto" disabled={isLoading || data.rows.length === 0} type="button" onClick={() => exportAuditCsv(sortedRows)}>ส่งออก Excel</button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{data.total.toLocaleString('th-TH')}</span> รายการ</div>
          <div className="flex items-center gap-2">
            {columnResize.hasCustomWidths ? (
              <button className="hidden rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 lg:inline-flex" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
            ) : null}
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
            <span className="font-medium text-xs">หน้า {data.page} / {data.totalPages}</span>
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={page >= data.totalPages || isLoading} type="button" onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))}>ถัดไป</button>
          </div>
        </div>

        {error ? <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 animate-fade-in">{error}</div> : null}
        {isLoading ? <div className="p-12 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div> : null}

        {/* Desktop Table View (Hidden on Mobile) */}
        {!isLoading && (
          <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {auditColumns.map((column, index) => {
                  const style = columnResize.getColumnStyle(column.key)
                  if (index === auditColumns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />
                  }
                  return <col key={column.key} style={style} />
                })}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="เวลา" resizeProps={columnResize.getResizeHandleProps('createdAt', 'เวลา')} sortKey="createdAt" onSort={handleSort} />
                  <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="กลุ่ม" resizeProps={columnResize.getResizeHandleProps('group', 'กลุ่ม')} sortKey="group" onSort={handleSort} />
                  <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="เหตุการณ์" resizeProps={columnResize.getResizeHandleProps('event', 'เหตุการณ์')} sortKey="event" onSort={handleSort} />
                  <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="ผู้ทำรายการ" resizeProps={columnResize.getResizeHandleProps('actor', 'ผู้ทำรายการ')} sortKey="actor" onSort={handleSort} />
                  <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="เป้าหมาย" resizeProps={columnResize.getResizeHandleProps('target', 'เป้าหมาย')} sortKey="target" onSort={handleSort} />
                  <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="รายละเอียด" resizeProps={columnResize.getResizeHandleProps('metadata', 'รายละเอียด')} sortKey="metadata" onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((row) => {
                  const groupLabel = eventGroup(row.eventType)
                  return (
                    <tr key={row.id} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => setSelectedRow(row)}>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{formatDate(row.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex rounded border px-2 py-0.5 text-xs font-bold ${groupBadgeClass(groupLabel)}`}>{groupLabel}</span></td>
                      <td className="min-w-0 px-3 py-3">
                        <div className="truncate font-bold text-slate-900" title={eventTitle(row.eventType)}>{eventTitle(row.eventType)}</div>
                        <div className="mt-0.5 truncate font-mono text-xs text-slate-400" title={row.eventType}>{row.eventType}</div>
                      </td>
                      <td className="min-w-0 px-3 py-3 font-semibold text-slate-800"><div className="truncate" title={userLabel(row.actor)}>{userLabel(row.actor)}</div></td>
                      <td className="min-w-0 px-3 py-3 text-slate-700"><div className="truncate" title={userLabel(row.target)}>{userLabel(row.target)}</div></td>
                      <td className="min-w-0 px-3 py-3"><div className="truncate font-mono text-xs text-slate-400" title={metadataText(row.metadata)}>{metadataText(row.metadata)}</div></td>
                    </tr>
                  )
                })}
                {sortedRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-10 text-center text-sm font-medium text-slate-400" colSpan={auditColumns.length}>ยังไม่มี Audit หรือ Activity Log ตามเงื่อนไขนี้</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {/* Mobile View: Dense Card List (Hidden on Desktop) */}
        {!isLoading && sortedRows.length > 0 ? (
          <div className="lg:hidden divide-y divide-slate-100">
            {sortedRows.map((row) => {
              const groupLabel = eventGroup(row.eventType)
              return (
                <div key={row.id} className="p-4 bg-white space-y-3 animate-fade-in hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedRow(row)}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-bold ${groupBadgeClass(groupLabel)}`}>{groupLabel}</span>
                      <span className="ml-1.5 font-mono text-xs text-slate-500 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">{row.eventType}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-500">{formatDate(row.createdAt)}</span>
                  </div>

                  <div className="text-xs">
                    <div className="font-bold text-slate-800 text-sm leading-snug">{eventTitle(row.eventType)}</div>
                    <div className="text-slate-600 mt-2 space-y-1.5">
                      <div><span className="font-semibold text-slate-400 text-xs uppercase block">ผู้ทำรายการ</span> <span className="font-medium text-slate-800">{userLabel(row.actor)}</span></div>
                      {row.target ? (
                        <div><span className="font-semibold text-slate-400 text-xs uppercase block">เป้าหมาย</span> <span className="font-medium text-slate-800">{userLabel(row.target)}</span></div>
                      ) : null}
                    </div>
                  </div>
                  
                  <div className="text-xs text-slate-400 font-mono truncate max-w-full bg-slate-50 p-1.5 rounded border border-slate-100">
                    {metadataText(row.metadata)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {!isLoading && sortedRows.length === 0 ? (
          <div className="lg:hidden p-8 text-center text-sm text-slate-400">
            ยังไม่มี Audit หรือ Activity Log ตามเงื่อนไขนี้
          </div>
        ) : null}
      </div>

      {selectedRow ? (
        <Dialog open={!!selectedRow} onOpenChange={() => setSelectedRow(null)}>
          <DialogContent className="max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 max-h-[90vh] animate-fade-in" hideClose>
            <div className="border-b border-slate-800 px-5 py-4 bg-slate-900 shrink-0 flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-lg font-bold text-slate-100">{eventTitle(selectedRow.eventType)}</DialogTitle>
                <p className="mt-0.5 text-xs text-slate-400">ID: {selectedRow.id}</p>
              </div>
              <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={() => setSelectedRow(null)}>ปิด</button>
            </div>
            
            <div className="space-y-4 p-5 bg-slate-50 flex-1 overflow-y-auto">
              <div className="grid gap-4 md:grid-cols-2">
                {/* ข้อมูลเหตุการณ์ */}
                <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูลเหตุการณ์</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <DetailItem label="กลุ่ม" value={eventGroup(selectedRow.eventType)} />
                    <DetailItem label="เวลา" value={formatDate(selectedRow.createdAt)} />
                    <DetailItem className="col-span-2" label="Event Type" value={selectedRow.eventType} mono />
                  </div>
                </div>

                {/* ผู้ทำและเป้าหมาย */}
                <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ผู้ทำและเป้าหมาย</div>
                  <div className="grid grid-cols-1 gap-3">
                    <DetailItem label="ผู้ทำรายการ" value={userLabel(selectedRow.actor)} />
                    <DetailItem label="เป้าหมาย" value={userLabel(selectedRow.target)} />
                  </div>
                </div>
              </div>

              {/* ข้อมูลระบบและเมทาดาตา */}
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูลระบบและเมทาดาตา</div>
                <div className="space-y-4">
                  <DetailItem label="User Agent" value={selectedRow.userAgent || '-'} />
                  <div>
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Metadata</div>
                    <pre className="max-h-60 overflow-auto rounded bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200">{metadataText(selectedRow.metadata)}</pre>
                  </div>
                </div>
              </div>
            </div>
            
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

function getAuditSortValue(row: AuditEvent, key: AuditColumnKey): number | string {
  if (key === 'createdAt') {
    const timestamp = Date.parse(row.createdAt)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }
  if (key === 'group') return eventGroup(row.eventType)
  if (key === 'event') return eventTitle(row.eventType) + ' ' + row.eventType
  if (key === 'actor') return userLabel(row.actor)
  if (key === 'target') return userLabel(row.target)
  return metadataText(row.metadata)
}

function DetailItem({ className = '', label, value, mono = false }: { className?: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className={`flex flex-col py-1 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className={`mt-0.5 text-xs sm:text-sm font-bold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
