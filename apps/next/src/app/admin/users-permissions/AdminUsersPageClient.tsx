'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog'
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
    contactLineId: string | null
    contactNote: string | null
    contactPhone: string | null
    displayName: string | null
    email: string | null
    firstName: string | null
    id: string
    lastLoginAt: string | null
    lastName: string | null
    mustChangePassword: boolean
    namePrefix: string | null
    profileImageUrl: string | null
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
    contactLineId: z.string().nullable(),
    contactNote: z.string().nullable(),
    contactPhone: z.string().nullable(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    id: z.string(),
    lastLoginAt: z.string().nullable(),
    lastName: z.string().nullable(),
    mustChangePassword: z.boolean(),
    namePrefix: z.string().nullable(),
    profileImageUrl: z.string().nullable(),
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

type AdminUsersPageClientProps = {
  mode?: TabKey
}

type UserFormState = {
  active: boolean
  branchIds: string[]
  contactLineId: string
  contactNote: string
  contactPhone: string
  displayName: string
  email: string
  firstName: string
  lastName: string
  mustChangePassword: boolean
  namePrefix: string
  profileImageUrl: string
  roleIds: string[]
  username: string
}

const emptyUserForm: UserFormState = {
  active: true,
  branchIds: [],
  contactLineId: '',
  contactNote: '',
  contactPhone: '',
  displayName: '',
  email: '',
  firstName: '',
  lastName: '',
  mustChangePassword: false,
  namePrefix: '',
  profileImageUrl: '',
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

function fullName(user: Pick<AdminUser, 'namePrefix' | 'firstName' | 'lastName' | 'displayName'>) {
  const structuredName = [user.namePrefix, user.firstName, user.lastName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ')
  return structuredName || user.displayName || '-'
}

function userInitials(user: Pick<AdminUser, 'displayName' | 'firstName' | 'username'>) {
  const label = user.firstName || user.displayName || user.username
  return label.trim().slice(0, 2).toUpperCase()
}

export function AdminUsersPageClient({ mode }: AdminUsersPageClientProps) {
  const [data, setData] = useState<AdminUsersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabKey>(mode ?? 'users')
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

  useEffect(() => {
    if (mode) setTab(mode)
  }, [mode])

  const currentTab = mode ?? tab
  const isUsersPage = currentTab === 'users'
  const pageTitle = isUsersPage ? 'รายชื่อพนักงาน / Users' : 'Roles & Permissions'
  const pageDescription = isUsersPage
    ? `ผู้ใช้ ${data?.users.length ?? 0} รายการ · จัดการ profile, contact, role และสาขา`
    : `Roles ${data?.roles.length ?? 0} รายการ · ตรวจชุดสิทธิ์และผู้ใช้ที่ผูกอยู่`

  const filteredUsers = useMemo(() => {
    const rows = data?.users ?? []
    const query = search.trim().toLowerCase()

    if (!query) return rows

    return rows.filter((user) => [
      user.username,
      user.displayName,
      user.email,
      user.firstName,
      user.lastName,
      user.contactPhone,
      user.contactLineId,
      user.contactNote,
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

  const userSummary = useMemo(() => {
    const users = data?.users ?? []
    return {
      active: users.filter((user) => user.active).length,
      branchScoped: users.filter((user) => user.branches.length > 0).length,
      mustChange: users.filter((user) => user.mustChangePassword).length,
    }
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
      contactLineId: user.contactLineId ?? '',
      contactNote: user.contactNote ?? '',
      contactPhone: user.contactPhone ?? '',
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      mustChangePassword: user.mustChangePassword,
      namePrefix: user.namePrefix ?? '',
      profileImageUrl: user.profileImageUrl ?? '',
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
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block rounded-md bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{pageTitle}</h2>
            <p className="text-sm text-slate-500">{pageDescription}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหา..."
              type="search"
              value={search}
            />
            {isUsersPage ? (
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 h-9 flex items-center" disabled={!data} type="button" onClick={openAddUser}>
                + เพิ่มผู้ใช้
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="lg:hidden rounded-md bg-white p-3.5 shadow space-y-2.5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{pageTitle}</h2>
          <p className="text-xs text-slate-500">{pageDescription}</p>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 h-9 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหา..."
            type="search"
            value={search}
          />
          {isUsersPage ? (
            <button className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 h-9 shrink-0 flex items-center" disabled={!data} type="button" onClick={openAddUser}>
              + เพิ่มผู้ใช้
            </button>
          ) : null}
        </div>
      </div>

      {/* AcexPOS Style KPI / Summary Cards */}
      {isUsersPage ? (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 text-sm animate-fade-in">
        {/* 1. ผู้ใช้ Active */}
        <div className="bg-white p-3 sm:p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl shrink-0">
            👥
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">ผู้ใช้ Active</div>
            <div className="text-sm font-bold text-emerald-700 mt-0.5 tabular-nums">{userSummary.active}</div>
          </div>
        </div>
        {/* 2. จำกัดสาขา */}
        <div className="bg-white p-3 sm:p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl shrink-0">
            🏢
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">จำกัดสาขา</div>
            <div className="text-sm font-bold text-blue-700 mt-0.5 tabular-nums">{userSummary.branchScoped}</div>
          </div>
        </div>
        {/* 3. ต้องเปลี่ยน Password */}
        <div className="col-span-2 md:col-span-1 bg-white p-3 sm:p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xl shrink-0">
            🔑
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">ต้องเปลี่ยน Password</div>
            <div className="text-sm font-bold text-purple-700 mt-0.5 tabular-nums">{userSummary.mustChange}</div>
          </div>
        </div>
      </div>
      ) : null}

      {formOpen ? (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-2xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 max-h-[90vh] animate-fade-in" hideClose>
            <form className="flex flex-col h-full overflow-hidden" onSubmit={saveUser}>
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-5 py-4 shrink-0">
                <DialogTitle className="text-lg font-bold text-slate-100">{editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</DialogTitle>
                <div className="flex items-center gap-4">
                  <ActiveToggle checked={form.active} onChange={(checked) => setForm((current) => ({ ...current, active: checked }))} />
                  <button className="text-2xl text-slate-400 hover:text-slate-200 ml-2" type="button" onClick={() => setFormOpen(false)}>&times;</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4">
                <div className="grid gap-4 text-sm md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Username *
                    <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Email *
                    <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                  </label>
                  <label className="md:col-span-2 text-sm font-medium text-slate-700">
                    ชื่อผู้ใช้ *
                    <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
                  </label>
                  <div className="md:col-span-2 rounded-lg border border-slate-100 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูล Profile</div>
                    <div className="grid gap-3 md:grid-cols-[120px_1fr_1fr]">
                      <label className="text-sm font-medium text-slate-700">
                        คำนำหน้า
                        <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.namePrefix} onChange={(event) => setForm((current) => ({ ...current, namePrefix: event.target.value }))} />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        ชื่อจริง
                        <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        นามสกุล
                        <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} />
                      </label>
                    </div>
                    <label className="mt-3 block text-sm font-medium text-slate-700">
                      URL รูป Profile
                      <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" placeholder="https://..." value={form.profileImageUrl} onChange={(event) => setForm((current) => ({ ...current, profileImageUrl: event.target.value }))} />
                    </label>
                  </div>
                  <div className="md:col-span-2 rounded-lg border border-slate-100 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Contact</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">
                        เบอร์ติดต่อ
                        <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        LINE ID
                        <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.contactLineId} onChange={(event) => setForm((current) => ({ ...current, contactLineId: event.target.value }))} />
                      </label>
                    </div>
                    <label className="mt-3 block text-sm font-medium text-slate-700">
                      หมายเหตุ Contact
                      <textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" value={form.contactNote} onChange={(event) => setForm((current) => ({ ...current, contactNote: event.target.value }))} />
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Roles *</div>
                    <div className="grid gap-2">
                      {data?.roles.filter((role) => role.active).map((role) => (
                        <label key={role.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input checked={form.roleIds.includes(role.id)} type="checkbox" className="rounded border-slate-300 text-slate-800 focus:ring-blue-500" onChange={() => toggleFormArray('roleIds', role.id)} />
                          <span>{role.name}</span>
                          <span className="font-mono text-xs text-slate-400">{role.code}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">สาขาที่เข้าถึง</div>
                    <div className="grid gap-2">
                      {data?.branches.map((branch) => (
                        <label key={branch.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input checked={form.branchIds.includes(branch.id)} type="checkbox" className="rounded border-slate-300 text-slate-800 focus:ring-blue-500" onChange={() => toggleFormArray('branchIds', branch.id)} />
                          <span>{branch.name}</span>
                          <span className="font-mono text-xs text-slate-400">{branch.code}</span>
                        </label>
                      ))}
                      {data?.branches.length === 0 ? <span className="text-sm text-slate-500">ยังไม่มีสาขาที่เปิดใช้งาน</span> : null}
                    </div>
                  </div>

                  <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none mt-2">
                    <input checked={form.mustChangePassword} type="checkbox" className="rounded border-slate-300 text-slate-800 focus:ring-blue-500" onChange={(event) => setForm((current) => ({ ...current, mustChangePassword: event.target.checked }))} />
                    บังคับเปลี่ยน password หลังเข้าสู่ระบบ
                  </label>

                  {formError ? <p className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 shrink-0">
                <button className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium" disabled={isSaving} type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
                <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors" disabled={isSaving} type="submit">
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className="rounded-md bg-white shadow overflow-hidden border border-slate-100">
        {!mode ? (
        <div className="flex border-b border-slate-100 bg-slate-50">
          <button
            className={`border-b-2 px-5 py-3 text-sm font-bold transition-all outline-none ${currentTab === 'users' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            type="button"
            onClick={() => setTab('users')}
          >
            Users
          </button>
          <button
            className={`border-b-2 px-5 py-3 text-sm font-bold transition-all outline-none ${currentTab === 'roles' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            type="button"
            onClick={() => setTab('roles')}
          >
            Roles
          </button>
        </div>
        ) : null}

        {error ? <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {notice ? <div className="m-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
        {isLoading ? <div className="p-12 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div> : null}

        {/* Tab 1: Users */}
        {!isLoading && currentTab === 'users' ? (
          <>
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <tr>
                    <th className="p-3 text-left font-semibold">Username</th>
                    <th className="p-3 text-left font-semibold">ชื่อ</th>
                    <th className="p-3 text-left font-semibold">Contact</th>
                    <th className="p-3 text-left font-semibold">Email</th>
                    <th className="p-3 text-left font-semibold">Role</th>
                    <th className="p-3 text-left font-semibold">สาขา</th>
                    <th className="p-3 text-center font-semibold">สถานะ</th>
                    <th className="p-3 text-center font-semibold">ตั้งรหัส</th>
                    <th className="p-3 text-left font-semibold">Login ล่าสุด</th>
                    <th className="p-3 text-center font-semibold">แก้ไข</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs">{user.username}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {user.profileImageUrl ? (
                            <Image alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" height={36} src={user.profileImageUrl} unoptimized width={36} />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{userInitials(user)}</span>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900">{fullName(user)}</div>
                            <div className="text-xs text-slate-500">{user.displayName || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        <div>{user.contactPhone || '-'}</div>
                        {user.contactLineId ? <div className="text-xs text-slate-500">LINE: {user.contactLineId}</div> : null}
                      </td>
                      <td className="p-3 text-slate-600">{user.email || '-'}</td>
                      <td className="p-3 text-slate-700">{user.roles.map((role) => role.name).join(', ') || '-'}</td>
                      <td className="p-3 text-slate-700">{user.branches.length ? user.branches.map((branch) => branch.name).join(', ') : 'ทุกสาขา'}</td>
                      <td className="p-3 text-center">
                        <ActiveToggle checked={user.active} disabled={savingUserId === user.id} label={statusText(user.active)} onChange={(checked) => void updateUserStatus(user.id, checked)} />
                      </td>
                      <td className="p-3 text-center">
                        <button
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
                          disabled={!user.email || !user.active || actionUserId === user.id}
                          type="button"
                          onClick={() => void sendUserInvite(user)}
                        >
                          {actionUserId === user.id ? 'กำลังส่ง...' : user.authUserId ? 'Reset' : 'Invite'}
                        </button>
                      </td>
                      <td className="p-3 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                      <td className="p-3 text-center">
                        <button className="text-blue-700 hover:underline font-bold" type="button" onClick={() => openEditUser(user)}>
                          แก้ไข
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-sm text-slate-500" colSpan={10}>ไม่พบผู้ใช้</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Mobile View: Dense Card List (Hidden on Desktop) */}
            <div className="lg:hidden divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <div key={user.id} className="p-4 bg-white space-y-3 animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm leading-snug">{user.displayName || '-'}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{fullName(user)}</div>
                      <div className="font-mono text-xs text-slate-500 mt-0.5">{user.username}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ActiveToggle checked={user.active} disabled={savingUserId === user.id} onChange={(checked) => void updateUserStatus(user.id, checked)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Email</span>
                      <span className="text-slate-700 break-all">{user.email || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Contact</span>
                      <span className="text-slate-700">{[user.contactPhone, user.contactLineId ? `LINE: ${user.contactLineId}` : null].filter(Boolean).join(' · ') || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">Role</span>
                      <span className="text-slate-700 font-semibold">{user.roles.map((role) => role.name).join(', ') || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">สาขา</span>
                      <span className="text-slate-700 font-semibold">{user.branches.length ? user.branches.map((branch) => branch.name).join(', ') : 'ทุกสาขา'}</span>
                    </div>
                    <div className="col-span-2 border-t border-slate-50 pt-2 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 block text-xs uppercase">Login ล่าสุด</span>
                        <span className="text-slate-600 text-xs">{formatDate(user.lastLoginAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-50"
                          disabled={!user.email || !user.active || actionUserId === user.id}
                          type="button"
                          onClick={() => void sendUserInvite(user)}
                        >
                          {actionUserId === user.id ? 'ส่ง...' : user.authUserId ? 'Reset' : 'Invite'}
                        </button>
                        <button className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-bold hover:bg-blue-700" type="button" onClick={() => openEditUser(user)}>
                          แก้ไข
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">ไม่พบผู้ใช้</div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Tab 2: Roles */}
        {!isLoading && currentTab === 'roles' ? (
          <>
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <tr>
                    <th className="p-3 text-left font-semibold">Role</th>
                    <th className="p-3 text-left font-semibold">รายละเอียด</th>
                    <th className="p-3 text-left font-semibold">ประเภท</th>
                    <th className="p-3 text-left font-semibold">สาขา</th>
                    <th className="p-3 text-right font-semibold">ผู้ใช้</th>
                    <th className="p-3 text-center font-semibold">ต้นทุน</th>
                    <th className="p-3 text-center font-semibold">กำไร</th>
                    <th className="p-3 text-center font-semibold">เงินสด</th>
                    <th className="p-3 text-center font-semibold">งบ</th>
                    <th className="p-3 text-center font-semibold">Opening</th>
                    <th className="p-3 text-center font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoles.map((role) => (
                    <tr key={role.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{role.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">{role.code}</div>
                      </td>
                      <td className="max-w-[280px] p-3 text-slate-600 leading-normal">{role.description || '-'}</td>
                      <td className="p-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${role.isSystem ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>
                          {role.isSystem ? 'SYSTEM' : 'CUSTOM'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700">{branchScopeText(role.branchScope)}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{roleUserCounts.get(role.id) ?? 0}</td>
                      <RoleCheck enabled={role.canSeeCost} />
                      <RoleCheck enabled={role.canSeeProfit} />
                      <RoleCheck enabled={role.canSeeCash} />
                      <RoleCheck enabled={role.canSeeFinancials} />
                      <RoleCheck enabled={role.canEditOpeningBalance} />
                      <td className="p-3 text-center">
                        <span className={`rounded px-2.5 py-0.5 text-xs font-bold ${role.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          {role.active ? 'ใช้งาน' : 'ปิด'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredRoles.length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-sm text-slate-500" colSpan={11}>ไม่พบ role</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Mobile View: Dense Card List (Hidden on Desktop) */}
            <div className="lg:hidden divide-y divide-slate-100">
              {filteredRoles.map((role) => (
                <div key={role.id} className="p-4 bg-white space-y-3 animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm leading-snug">{role.name}</div>
                      <div className="font-mono text-xs text-slate-500 mt-0.5">{role.code}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${role.isSystem ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                        {role.isSystem ? 'SYSTEM' : 'CUSTOM'}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${role.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                        {role.active ? 'ใช้งาน' : 'ปิด'}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 leading-normal">{role.description || '-'}</div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-50 pt-2">
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">สาขา</span>
                      <span className="text-slate-700 font-semibold">{branchScopeText(role.branchScope)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">จำนวนผู้ใช้</span>
                      <span className="text-slate-700 font-bold">{roleUserCounts.get(role.id) ?? 0} คน</span>
                    </div>
                    
                    <div className="col-span-2 pt-1">
                      <span className="text-slate-400 block text-xs uppercase font-semibold mb-1">สิทธิ์การเข้าถึงข้อมูลสำคัญ</span>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge label="ต้นทุน" active={role.canSeeCost} />
                        <Badge label="กำไร" active={role.canSeeProfit} />
                        <Badge label="เงินสด" active={role.canSeeCash} />
                        <Badge label="งบ" active={role.canSeeFinancials} />
                        <Badge label="Opening" active={role.canEditOpeningBalance} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredRoles.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">ไม่พบ role</div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}

function RoleCheck({ enabled }: { enabled: boolean }) {
  return (
    <td className="p-3 text-center">
      <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300'}`}>
        {enabled ? '✓' : '—'}
      </span>
    </td>
  )
}

function Badge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-300 border border-slate-100'}`}>
      {label}
    </span>
  )
}
