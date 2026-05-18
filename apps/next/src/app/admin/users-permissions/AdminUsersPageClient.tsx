'use client'

import { useEffect, useMemo, useState } from 'react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { getErrorMessage, readJsonResponse } from '@/lib/api-client'
import { z } from 'zod'

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

const adminUsersPayloadSchema = z.object({
  branches: z.array(z.object({
    code: z.string(),
    id: z.string(),
    name: z.string(),
  })),
  roles: z.array(z.object({
    active: z.boolean(),
    branchScope: z.string(),
    canEditOpeningBalance: z.boolean(),
    canSeeCash: z.boolean(),
    canSeeCost: z.boolean(),
    canSeeFinancials: z.boolean(),
    canSeeProfit: z.boolean(),
    code: z.string(),
    description: z.string().nullable(),
    id: z.string(),
    isSystem: z.boolean(),
    name: z.string(),
  })),
  users: z.array(z.object({
    active: z.boolean(),
    authUserId: z.string().nullable(),
    branchIds: z.array(z.string()),
    branches: z.array(z.object({
      code: z.string(),
      id: z.string(),
      name: z.string(),
    })),
    createdAt: z.string().nullable(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    id: z.string(),
    lastLoginAt: z.string().nullable(),
    mustChangePassword: z.boolean(),
    roles: z.array(z.object({
      branchScope: z.string(),
      code: z.string(),
      id: z.string(),
      name: z.string(),
    })),
    updatedAt: z.string().nullable(),
    username: z.string(),
  })),
})

const statusUpdateSchema = z.object({
  active: z.boolean(),
})

const inviteResultSchema = z.object({
  mode: z.enum(['invite', 'reset']),
  sent: z.boolean(),
})

const saveUserResultSchema = z.object({
  id: z.string(),
})

type TabKey = 'users' | 'roles'
type AdminUser = AdminUsersPayload['users'][number]

type UserFormState = {
  active: boolean
  branchIds: string[]
  displayName: string
  email: string
  mustChangePassword: boolean
  roleIds: string[]
  username: string
}

const emptyUserForm: UserFormState = {
  active: true,
  branchIds: [],
  displayName: '',
  email: '',
  mustChangePassword: false,
  roleIds: [],
  username: '',
}

function statusText(active: boolean) {
  return active ? 'ใช้งาน' : 'ปิด'
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function branchScopeText(value: string) {
  if (value === 'all') return 'ทุกสาขา'
  if (value === 'own') return 'เฉพาะสาขาตัวเอง'
  if (value === 'custom') return 'กำหนดเอง'
  return value || '-'
}

export function AdminUsersPageClient() {
  const [data, setData] = useState<AdminUsersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabKey>('users')
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyUserForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function loadData() {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' })
      const payload = await readJsonResponse(response, adminUsersPayloadSchema, 'โหลดข้อมูลผู้ใช้ไม่ได้')

      setData(payload)
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลดข้อมูลผู้ใช้ไม่ได้'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
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

  const roleUserCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const user of data?.users ?? []) {
      for (const role of user.roles) {
        counts.set(role.id, (counts.get(role.id) ?? 0) + 1)
      }
    }
    return counts
  }, [data?.users])

  async function updateUserStatus(userId: string, active: boolean) {
    const previousActive = data?.users.find((user) => user.id === userId)?.active
    setSavingUserId(userId)
    setError(null)
    setNotice(null)
    setData((current) => current
      ? {
          ...current,
          users: current.users.map((user) => user.id === userId ? { ...user, active } : user),
        }
      : current)

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const payload = await readJsonResponse(response, statusUpdateSchema, 'อัปเดตสถานะผู้ใช้ไม่ได้')

      setData((current) => current
        ? {
            ...current,
            users: current.users.map((user) => user.id === userId ? { ...user, active: payload.active } : user),
          }
        : current)
    } catch (caught) {
      if (previousActive !== undefined) {
        setData((current) => current
          ? {
              ...current,
              users: current.users.map((user) => user.id === userId ? { ...user, active: previousActive } : user),
            }
          : current)
      }
      setError(getErrorMessage(caught, 'อัปเดตสถานะผู้ใช้ไม่ได้'))
    } finally {
      setSavingUserId(null)
    }
  }

  async function sendUserInvite(user: AdminUser) {
    setActionUserId(user.id)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectTo: `${window.location.origin}/reset-password` }),
      })
      const payload = await readJsonResponse(response, inviteResultSchema, 'ส่ง invite/reset password ไม่สำเร็จ')

      setNotice(payload?.mode === 'invite' ? `ส่ง invite ไปที่ ${user.email} แล้ว` : `ส่ง reset password ไปที่ ${user.email} แล้ว`)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'ส่ง invite/reset password ไม่สำเร็จ'))
    } finally {
      setActionUserId(null)
    }
  }

  function openAddUser() {
    setEditingUser(null)
    setForm({
      ...emptyUserForm,
      roleIds: data?.roles.find((role) => role.code === 'warehouse')?.id ? [data.roles.find((role) => role.code === 'warehouse')!.id] : [],
    })
    setFormError(null)
    setFormOpen(true)
  }

  function openEditUser(user: AdminUser) {
    setEditingUser(user)
    setForm({
      active: user.active,
      branchIds: user.branchIds,
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      mustChangePassword: user.mustChangePassword,
      roleIds: user.roles.map((role) => role.id),
      username: user.username,
    })
    setFormError(null)
    setFormOpen(true)
  }

  function toggleFormArray(key: 'branchIds' | 'roleIds', value: string) {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }))
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    if (!form.username.trim() || !form.displayName.trim() || !form.email.trim()) {
      setFormError('กรอก Username, ชื่อ และ Email')
      return
    }

    if (!form.email.includes('@')) {
      setFormError('รูปแบบอีเมลไม่ถูกต้อง')
      return
    }

    if (form.roleIds.length === 0) {
      setFormError('เลือก role อย่างน้อย 1 รายการ')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(editingUser ? `/api/admin/users/${encodeURIComponent(editingUser.id)}` : '/api/admin/users', {
        method: editingUser ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      await readJsonResponse(response, saveUserResultSchema, 'บันทึกผู้ใช้ไม่ได้')

      setFormOpen(false)
      setEditingUser(null)
      setForm(emptyUserForm)
      await loadData()
    } catch (caught) {
      setFormError(getErrorMessage(caught, 'บันทึกผู้ใช้ไม่ได้'))
    } finally {
      setIsSaving(false)
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
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 md:w-72"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหา"
              type="search"
              value={search}
            />
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!data} type="button" onClick={openAddUser}>
              เพิ่มผู้ใช้
            </button>
          </div>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <form className="mt-10 w-full max-w-2xl overflow-hidden rounded-lg border bg-white shadow-xl" onSubmit={saveUser}>
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h3>
              <ActiveToggle checked={form.active} onChange={(checked) => setForm((current) => ({ ...current, active: checked }))} />
            </div>

            <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Username *
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Email *
                <input className="mt-1 w-full rounded border px-3 py-2" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="md:col-span-2 text-sm font-medium text-slate-700">
                ชื่อผู้ใช้ *
                <input className="mt-1 w-full rounded border px-3 py-2" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
              </label>

              <fieldset className="rounded border p-3">
                <legend className="px-1 text-sm font-bold text-slate-700">Roles *</legend>
                <div className="mt-2 grid gap-2">
                  {data?.roles.filter((role) => role.active).map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input checked={form.roleIds.includes(role.id)} type="checkbox" onChange={() => toggleFormArray('roleIds', role.id)} />
                      <span>{role.name}</span>
                      <span className="font-mono text-xs text-slate-400">{role.code}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="rounded border p-3">
                <legend className="px-1 text-sm font-bold text-slate-700">สาขาที่เข้าถึง</legend>
                <div className="mt-2 grid gap-2">
                  {data?.branches.map((branch) => (
                    <label key={branch.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input checked={form.branchIds.includes(branch.id)} type="checkbox" onChange={() => toggleFormArray('branchIds', branch.id)} />
                      <span>{branch.name}</span>
                      <span className="font-mono text-xs text-slate-400">{branch.code}</span>
                    </label>
                  ))}
                  {data?.branches.length === 0 ? <span className="text-sm text-slate-500">ยังไม่มีสาขาที่เปิดใช้งาน</span> : null}
                </div>
              </fieldset>

              <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input checked={form.mustChangePassword} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, mustChangePassword: event.target.checked }))} />
                บังคับเปลี่ยน password หลังเข้าสู่ระบบ
              </label>

              {formError ? <p className="md:col-span-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}
            </div>

            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4">
              <button className="rounded px-4 py-2 text-sm text-slate-600" disabled={isSaving} type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
              <button className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={isSaving} type="submit">
                {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

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
        {notice ? <div className="m-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
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
                  <th className="p-2 text-center">ตั้งรหัส</th>
                  <th className="p-2 text-left">Login ล่าสุด</th>
                  <th className="p-2 text-center">แก้ไข</th>
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
                      <ActiveToggle checked={user.active} disabled={savingUserId === user.id} label={statusText(user.active)} onChange={(checked) => void updateUserStatus(user.id, checked)} />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                        disabled={!user.email || !user.active || actionUserId === user.id}
                        type="button"
                        onClick={() => void sendUserInvite(user)}
                      >
                        {actionUserId === user.id ? 'กำลังส่ง...' : user.authUserId ? 'Reset' : 'Invite'}
                      </button>
                    </td>
                    <td className="p-2 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                    <td className="p-2 text-center">
                      <button className="text-blue-700 hover:underline" type="button" onClick={() => openEditUser(user)}>
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-slate-500" colSpan={9}>ไม่พบผู้ใช้</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!isLoading && tab === 'roles' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Role</th>
                  <th className="p-2 text-left">รายละเอียด</th>
                  <th className="p-2 text-left">ประเภท</th>
                  <th className="p-2 text-left">สาขา</th>
                  <th className="p-2 text-right">ผู้ใช้</th>
                  <th className="p-2 text-center">ต้นทุน</th>
                  <th className="p-2 text-center">กำไร</th>
                  <th className="p-2 text-center">เงินสด</th>
                  <th className="p-2 text-center">งบ</th>
                  <th className="p-2 text-center">Opening</th>
                  <th className="p-2 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((role) => (
                  <tr key={role.id} className="border-t align-top hover:bg-slate-50">
                    <td className="p-2">
                      <div className="font-semibold text-slate-900">{role.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">{role.code}</div>
                    </td>
                    <td className="max-w-[320px] p-2 text-slate-600">{role.description || '-'}</td>
                    <td className="p-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${role.isSystem ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>
                        {role.isSystem ? 'SYSTEM' : 'CUSTOM'}
                      </span>
                    </td>
                    <td className="p-2 text-slate-700">{branchScopeText(role.branchScope)}</td>
                    <td className="p-2 text-right font-semibold">{roleUserCounts.get(role.id) ?? 0}</td>
                    <RoleCheck enabled={role.canSeeCost} />
                    <RoleCheck enabled={role.canSeeProfit} />
                    <RoleCheck enabled={role.canSeeCash} />
                    <RoleCheck enabled={role.canSeeFinancials} />
                    <RoleCheck enabled={role.canEditOpeningBalance} />
                    <td className="p-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs ${role.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {role.active ? 'ใช้งาน' : 'ปิด'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredRoles.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-sm text-slate-500" colSpan={11}>ไม่พบ role</td>
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

function RoleCheck({ enabled }: { enabled: boolean }) {
  return (
    <td className="p-2 text-center">
      <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300'}`}>
        {enabled ? '✓' : '—'}
      </span>
    </td>
  )
}
