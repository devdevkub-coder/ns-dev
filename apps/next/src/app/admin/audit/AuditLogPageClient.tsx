'use client'

import { useEffect, useState } from 'react'

type AuditEvent = {
  actor: { displayName: string | null; username: string } | null
  createdAt: string
  eventType: string
  id: string
  metadata: unknown
  target: { displayName: string | null; username: string } | null
  userAgent: string | null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function userLabel(user: AuditEvent['actor']) {
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

export function AuditLogPageClient() {
  const [rows, setRows] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadRows() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/admin/auth-events?limit=100', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(payload?.error ?? 'โหลด Audit Log ไม่สำเร็จ')
        }

        if (mounted) {
          setRows(Array.isArray(payload?.rows) ? payload.rows : [])
        }
      } catch (caught) {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : 'โหลด Audit Log ไม่สำเร็จ')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    void loadRows()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <section className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow">
        <h2 className="text-xl font-bold text-slate-900">Audit & Activity Log</h2>
        <p className="mt-1 text-sm text-slate-500">รวมประวัติ user activity, auth event, user management และ permission-sensitive actions ล่าสุด</p>
      </div>

      <div className="rounded-xl border bg-white shadow">
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
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-slate-50">
                    <td className="whitespace-nowrap p-2 text-slate-600">{formatDate(row.createdAt)}</td>
                    <td className="p-2 text-slate-700">{eventGroup(row.eventType)}</td>
                    <td className="p-2 font-mono text-xs">{row.eventType}</td>
                    <td className="p-2">{userLabel(row.actor)}</td>
                    <td className="p-2">{userLabel(row.target)}</td>
                    <td className="max-w-xl truncate p-2 font-mono text-xs text-slate-500" title={metadataText(row.metadata)}>
                      {metadataText(row.metadata)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-slate-500" colSpan={6}>ยังไม่มี Audit หรือ Activity Log</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}
