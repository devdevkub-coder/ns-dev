'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessage, readJsonResponse } from '@/lib/api-client'
import { z } from 'zod'

type AuditUser = { displayName: string | null; username: string } | null

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
  username: z.string(),
}).nullable()

const auditPayloadSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  rows: z.array(z.object({
    actor: auditUserSchema,
    createdAt: z.string(),
    eventType: z.string(),
    id: z.string(),
    metadata: z.any().default(null), // Audit metadata is arbitrary JSON from DB.
    target: auditUserSchema,
    userAgent: z.string().nullable(),
  })),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
})

type EventGroup = 'all' | 'auth' | 'users' | 'permissions' | 'activity'

const eventGroups: Array<{ label: string; value: EventGroup }> = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'Auth', value: 'auth' },
  { label: 'Users', value: 'users' },
  { label: 'Permissions', value: 'permissions' },
  { label: 'Activity', value: 'activity' },
]

const pageSizeOptions = [25, 50, 100, 200]

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function userLabel(user: AuditUser) {
  if (!user) return '-'
  return user.displayName ? `${user.displayName} (${user.username})` : user.username
}

function metadataText(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return '-'
  return JSON.stringify(metadata, null, 2)
}

function eventGroup(eventType: string) {
  if (eventType.includes('login') || eventType.includes('invite') || eventType.includes('reset')) return 'Auth'
  if (eventType.startsWith('app_user.')) return 'Users'
  if (eventType.includes('permission') || eventType.includes('role')) return 'Permissions'
  return 'Activity'
}

function groupBadgeClass(group: string) {
  if (group === 'Auth') return 'bg-sky-50 text-sky-700 ring-sky-200'
  if (group === 'Users') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (group === 'Permissions') return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
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

  function resetFilters() {
    setActor('')
    setEventType('')
    setGroup('all')
    setPage(1)
    setQuery('')
    setTarget('')
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Audit & Activity Log</h2>
            <p className="mt-1 text-sm text-slate-500">ตรวจสอบประวัติ user activity, auth event, user management และ permission-sensitive actions</p>
          </div>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={isLoading} type="button" onClick={() => void loadRows()}>
            {isLoading ? 'กำลังโหลด...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {eventGroups.filter((item) => item.value !== 'all').map((item) => (
          <button
            key={item.value}
            className={`rounded-lg border bg-white p-3 text-left shadow-sm ring-1 ring-transparent transition hover:bg-slate-50 ${group === item.value ? 'border-slate-900' : 'border-slate-200'}`}
            type="button"
            onClick={() => {
              setGroup(item.value)
              setPage(1)
            }}
          >
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{summary.get(item.label) ?? 0}</div>
            <div className="mt-1 text-xs text-slate-500">ในหน้าปัจจุบัน</div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow">
        <div className="grid gap-3 lg:grid-cols-5">
          <label className="block text-sm font-medium lg:col-span-2">
            ค้นหา
            <input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" placeholder="event, user, metadata, user agent" value={query} onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }} />
          </label>
          <label className="block text-sm font-medium">
            กลุ่ม
            <select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" value={group} onChange={(event) => {
              setGroup(event.target.value as EventGroup)
              setPage(1)
            }}>
              {eventGroups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Event Type
            <input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" list="audit-event-types" placeholder="app_user.updated" value={eventType} onChange={(event) => {
              setEventType(event.target.value)
              setPage(1)
            }} />
            <datalist id="audit-event-types">
              {eventTypes.map((type) => <option key={type} value={type} />)}
            </datalist>
          </label>
          <label className="block text-sm font-medium">
            ต่อหน้า
            <select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" value={pageSize} onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
            }}>
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size} รายการ</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            ผู้ทำรายการ
            <input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" placeholder="username/display" value={actor} onChange={(event) => {
              setActor(event.target.value)
              setPage(1)
            }} />
          </label>
          <label className="block text-sm font-medium">
            เป้าหมาย
            <input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" placeholder="username/display" value={target} onChange={(event) => {
              setTarget(event.target.value)
              setPage(1)
            }} />
          </label>
          <div className="flex items-end gap-2 lg:col-span-3">
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={resetFilters}>ล้าง filter</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{data.total.toLocaleString('th-TH')}</span> รายการ</div>
          <div className="flex items-center gap-2">
            <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
            <span>หน้า {data.page} / {data.totalPages}</span>
            <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page >= data.totalPages || isLoading} type="button" onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))}>ถัดไป</button>
          </div>
        </div>

        {error ? <div className="m-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {isLoading ? <div className="p-6 text-center text-sm text-slate-500">กำลังโหลดข้อมูล</div> : null}

        {!isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">เวลา</th>
                  <th className="p-2 text-left">กลุ่ม</th>
                  <th className="p-2 text-left">เหตุการณ์</th>
                  <th className="p-2 text-left">ผู้ทำรายการ</th>
                  <th className="p-2 text-left">เป้าหมาย</th>
                  <th className="p-2 text-left">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const groupLabel = eventGroup(row.eventType)
                  return (
                    <tr key={row.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => setSelectedRow(row)}>
                      <td className="whitespace-nowrap p-2 text-slate-600">{formatDate(row.createdAt)}</td>
                      <td className="p-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${groupBadgeClass(groupLabel)}`}>{groupLabel}</span></td>
                      <td className="p-2">
                        <div className="font-medium text-slate-900">{eventTitle(row.eventType)}</div>
                        <div className="font-mono text-xs text-slate-500">{row.eventType}</div>
                      </td>
                      <td className="p-2">{userLabel(row.actor)}</td>
                      <td className="p-2">{userLabel(row.target)}</td>
                      <td className="max-w-xl truncate p-2 font-mono text-xs text-slate-500" title={metadataText(row.metadata)}>
                        {metadataText(row.metadata)}
                      </td>
                    </tr>
                  )
                })}
                {data.rows.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-slate-500" colSpan={6}>ยังไม่มี Audit หรือ Activity Log ตามเงื่อนไขนี้</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {selectedRow ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8" role="dialog" aria-modal="true">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{eventTitle(selectedRow.eventType)}</h3>
                <p className="mt-1 text-sm text-slate-500">{formatDate(selectedRow.createdAt)} · {selectedRow.id}</p>
              </div>
              <button className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-200" type="button" onClick={() => setSelectedRow(null)}>ปิด</button>
            </div>
            <div className="grid gap-4 p-5 text-sm md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">กลุ่ม</div>
                <div className="mt-1">{eventGroup(selectedRow.eventType)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">Event Type</div>
                <div className="mt-1 font-mono text-xs">{selectedRow.eventType}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">ผู้ทำรายการ</div>
                <div className="mt-1">{userLabel(selectedRow.actor)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">เป้าหมาย</div>
                <div className="mt-1">{userLabel(selectedRow.target)}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-semibold uppercase text-slate-500">User Agent</div>
                <div className="mt-1 break-words font-mono text-xs text-slate-600">{selectedRow.userAgent || '-'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-semibold uppercase text-slate-500">Metadata</div>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{metadataText(selectedRow.metadata)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
