'use client'

import { useEffect, useMemo, useState } from 'react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'

type AdminUsersPayload = {
  branches: Array<{
    code: string
    id: string
    name: string
  }>
  roles: Array<{
    active: boolean
    branchScope: string
    canEditOpeningBalance: boolean
    canSeeCash: boolean
    canSeeCost: boolean
    canSeeFinancials: boolean
    canSeeProfit: boolean
    code: string
    description: string | null
    id: string
    isSystem: boolean
    name: string
  }>
  users: Array<{
    active: boolean
    authUserId: string | null
    branchIds: string[]
    branches: Array<{
      code: string
      id: string
      name: string
    }>
    createdAt: string | null
    displayName: string | null
    email: string | null
    id: string
    lastLoginAt: string | null
    mustChangePassword: boolean
    roles: Array<{
      branchScope: string
      code: string
      id: string
      name: string
    }>
    updatedAt: string | null
    username: string
  }>
}

type TabKey = 'users' | 'roles'

function statusText(active: boolean) {
  return active ? 'ใช้งาน' : 'ปิด'
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function roleFlags(role: AdminUsersPayload['roles'][number]) {
  return [
    role.canSeeCost ? 'ต้นทุน' : null,
    role.canSeeProfit ? 'กำไร' : null,
    role.canSeeCash ? 'เงินสด' : null,
    role.canSeeFinancials ? 'งบการเงิน' : null,
    role.canEditOpeningBalance ? 'Opening' : null,
  ].filter(Boolean)
}

export function AdminUsersPageClient() {
  const [data, setData] = useState<AdminUsersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabKey>('users')

  useEffect(() => {
    let mounted = true

    async function loadData() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/admin/users', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(payload?.error ?? 'โหลดข้อมูลผู้ใช้ไม่ได้')
        }

        if (mounted) {
          setData(payload as AdminUsersPayload)
        }
      } catch (caught) {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลผู้ใช้ไม่ได้')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      mounted = false
    }
  }, [])

  const filteredUsers = useMemo(() => {
    const rows = data?.users ?? []
    const query = search.trim().toLowerCase()

    if (!query) return rows

    return rows.filter((user) => [
      user.username,
      user.displayName,
      user.email,
      user.roles.map((role) => role.name).join(' '),
      user.branches.map((branch) => branch.name).join(' '),
    ].some((value) => String(value ?? '').toLowerCase().includes(query)))
  }, [data?.users, search])

  const filteredRoles = useMemo(() => {
    const rows = data?.roles ?? []
    const query = search.trim().toLowerCase()

    if (!query) return rows

    return rows.filter((role) => [
      role.code,
      role.name,
      role.description,
      role.branchScope,
    ].some((value) => String(value ?? '').toLowerCase().includes(query)))
  }, [data?.roles, search])

  async function updateUserStatus(userId: string, active: boolean) {
    setSavingUserId(userId)
    setError(null)

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? 'อัปเดตสถานะผู้ใช้ไม่ได้')
      }

      setData((current) => current
        ? {
            ...current,
            users: current.users.map((user) => user.id === userId ? { ...user, active: payload.active } : user),
          }
        : current)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'อัปเดตสถานะผู้ใช้ไม่ได้')
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Users & Permissions</h2>
            <p className="text-sm text-slate-500">ผู้ใช้ {data?.users.length ?? 0} รายการ · Roles {data?.roles.length ?? 0} รายการ</p>
          </div>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 md:max-w-xs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหา"
            type="search"
            value={search}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow">
        <div className="flex border-b">
          <button
            className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'users' ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-500'}`}
            type="button"
            onClick={() => setTab('users')}
          >
            Users
          </button>
          <button
            className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'roles' ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-500'}`}
            type="button"
            onClick={() => setTab('roles')}
          >
            Roles
          </button>
        </div>

        {error ? <div className="m-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {isLoading ? <div className="p-6 text-center text-sm text-slate-500">กำลังโหลดข้อมูล</div> : null}

        {!isLoading && tab === 'users' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Username</th>
                  <th className="p-2 text-left">ชื่อ</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Role</th>
                  <th className="p-2 text-left">สาขา</th>
                  <th className="p-2 text-center">สถานะ</th>
                  <th className="p-2 text-left">Login ล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-t hover:bg-slate-50">
                    <td className="p-2 font-mono text-xs">{user.username}</td>
                    <td className="p-2 font-medium">{user.displayName || '-'}</td>
                    <td className="p-2 text-slate-600">{user.email || '-'}</td>
                    <td className="p-2">{user.roles.map((role) => role.name).join(', ') || '-'}</td>
                    <td className="p-2">{user.branches.length ? user.branches.map((branch) => branch.name).join(', ') : 'ทุกสาขา'}</td>
                    <td className="p-2 text-center">
                      <span className={savingUserId === user.id ? 'pointer-events-none opacity-60' : ''}>
                        <ActiveToggle checked={user.active} label={statusText(user.active)} onChange={(checked) => void updateUserStatus(user.id, checked)} />
                      </span>
                    </td>
                    <td className="p-2 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                  </tr>
                ))}
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-slate-500" colSpan={7}>ไม่พบผู้ใช้</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!isLoading && tab === 'roles' ? (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRoles.map((role) => (
              <article key={role.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{role.name}</h3>
                    <p className="mt-1 font-mono text-xs text-slate-500">{role.code}</p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs ${role.isSystem ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>
                    {role.isSystem ? 'SYSTEM' : 'CUSTOM'}
                  </span>
                </div>
                <p className="mt-2 min-h-10 text-sm text-slate-600">{role.description || '-'}</p>
                <div className="mt-3 text-xs text-slate-500">Branch Scope: <span className="font-semibold text-slate-700">{role.branchScope}</span></div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {roleFlags(role).map((flag) => (
                    <span key={flag} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{flag}</span>
                  ))}
                  {roleFlags(role).length === 0 ? <span className="text-xs text-slate-400">ไม่มี flag พิเศษ</span> : null}
                </div>
              </article>
            ))}
            {filteredRoles.length === 0 ? <div className="p-4 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">ไม่พบ role</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
