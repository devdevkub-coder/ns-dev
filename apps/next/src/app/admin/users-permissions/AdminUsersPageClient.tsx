'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
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
type AdminRole = AdminUsersPayload['roles'][number]
type UserColumnKey = 'action' | 'active' | 'branches' | 'contact' | 'email' | 'lastLoginAt' | 'name' | 'password' | 'roles' | 'username'
type RoleColumnKey = 'active' | 'branchScope' | 'canEditOpeningBalance' | 'canSeeCash' | 'canSeeCost' | 'canSeeFinancials' | 'canSeeProfit' | 'description' | 'name' | 'type' | 'users'
type SortDirection = 'asc' | 'desc'

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

const userColumns: Array<ResizableColumnDefinition<UserColumnKey>> = [
  { key: 'username', defaultWidth: 145, minWidth: 115 },
  { key: 'name', defaultWidth: 230, minWidth: 170 },
  { key: 'contact', defaultWidth: 180, minWidth: 130 },
  { key: 'email', defaultWidth: 225, minWidth: 160 },
  { key: 'roles', defaultWidth: 190, minWidth: 140 },
  { key: 'branches', defaultWidth: 210, minWidth: 150 },
  { key: 'active', defaultWidth: 130, minWidth: 115 },
  { key: 'password', defaultWidth: 125, minWidth: 105 },
  { key: 'lastLoginAt', defaultWidth: 175, minWidth: 135 },
  { key: 'action', defaultWidth: 110, minWidth: 90 },
]

const roleColumns: Array<ResizableColumnDefinition<RoleColumnKey>> = [
  { key: 'name', defaultWidth: 200, minWidth: 150 },
  { key: 'description', defaultWidth: 320, minWidth: 190 },
  { key: 'type', defaultWidth: 120, minWidth: 95 },
  { key: 'branchScope', defaultWidth: 170, minWidth: 125 },
  { key: 'users', defaultWidth: 115, minWidth: 95 },
  { key: 'canSeeCost', defaultWidth: 105, minWidth: 90 },
  { key: 'canSeeProfit', defaultWidth: 105, minWidth: 90 },
  { key: 'canSeeCash', defaultWidth: 105, minWidth: 90 },
  { key: 'canSeeFinancials', defaultWidth: 105, minWidth: 90 },
  { key: 'canEditOpeningBalance', defaultWidth: 125, minWidth: 100 },
  { key: 'active', defaultWidth: 120, minWidth: 95 },
]

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

function compareSortValue(left: number | string, right: number | string) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getUserSortValue(user: AdminUser, key: UserColumnKey) {
  if (key === 'username') return user.username
  if (key === 'name') return fullName(user)
  if (key === 'contact') return [user.contactPhone, user.contactLineId, user.contactNote].filter(Boolean).join(' ')
  if (key === 'email') return user.email ?? ''
  if (key === 'roles') return user.roles.map((role) => role.name).join(' ')
  if (key === 'branches') return user.branches.length ? user.branches.map((branch) => branch.name).join(' ') : 'ทุกสาขา'
  if (key === 'active') return user.active ? 1 : 0
  if (key === 'password') return (user.authUserId ? 'reset' : 'invite') + ' ' + (user.mustChangePassword ? 'must-change' : '')
  if (key === 'lastLoginAt') return user.lastLoginAt ? Date.parse(user.lastLoginAt) || 0 : 0
  return ''
}

function getRoleSortValue(role: AdminRole, key: RoleColumnKey, roleUserCounts: Map<string, number>) {
  if (key === 'name') return role.name
  if (key === 'description') return role.description ?? ''
  if (key === 'type') return role.isSystem ? 'SYSTEM' : 'CUSTOM'
  if (key === 'branchScope') return branchScopeText(role.branchScope)
  if (key === 'users') return roleUserCounts.get(role.id) ?? 0
  if (key === 'canSeeCost') return role.canSeeCost ? 1 : 0
  if (key === 'canSeeProfit') return role.canSeeProfit ? 1 : 0
  if (key === 'canSeeCash') return role.canSeeCash ? 1 : 0
  if (key === 'canSeeFinancials') return role.canSeeFinancials ? 1 : 0
  if (key === 'canEditOpeningBalance') return role.canEditOpeningBalance ? 1 : 0
  return role.active ? 1 : 0
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
  const [roleSortDirection, setRoleSortDirection] = useState<SortDirection>('asc')
  const [roleSortKey, setRoleSortKey] = useState<RoleColumnKey | null>(null)
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>('asc')
  const [userSortKey, setUserSortKey] = useState<UserColumnKey | null>(null)
  const roleColumnResize = useResizableColumns('admin.users-permissions.roles.v1', roleColumns)
  const userColumnResize = useResizableColumns('admin.users-permissions.users.v1', userColumns)

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

  const sortedUsers = useMemo(() => {
    if (!userSortKey) return filteredUsers

    return [...filteredUsers].sort((left, right) => {
      const result = compareSortValue(getUserSortValue(left, userSortKey), getUserSortValue(right, userSortKey))
      return userSortDirection === 'asc' ? result : -result
    })
  }, [filteredUsers, userSortDirection, userSortKey])

  const sortedRoles = useMemo(() => {
    if (!roleSortKey) return filteredRoles

    return [...filteredRoles].sort((left, right) => {
      const result = compareSortValue(getRoleSortValue(left, roleSortKey, roleUserCounts), getRoleSortValue(right, roleSortKey, roleUserCounts))
      return roleSortDirection === 'asc' ? result : -result
    })
  }, [filteredRoles, roleSortDirection, roleSortKey, roleUserCounts])

  const userSummary = useMemo(() => {
    const users = data?.users ?? []
    return {
      active: users.filter((user) => user.active).length,
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

  function handleUserSort(key: UserColumnKey) {
    if (userSortKey === key) {
      setUserSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setUserSortKey(key)
    setUserSortDirection('asc')
  }

  function handleRoleSort(key: RoleColumnKey) {
    if (roleSortKey === key) {
      setRoleSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setRoleSortKey(key)
    setRoleSortDirection('asc')
  }

  return (
    <section className="space-y-4">
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <input
          className="h-9 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหา..."
          type="search"
          value={search}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{pageTitle}</h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="hidden h-9 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 xl:inline-flex xl:items-center"
              type="button"
              onClick={currentTab === 'users' ? userColumnResize.resetColumnWidths : roleColumnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
            {isUsersPage ? (
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 h-9 flex items-center" disabled={!data} type="button" onClick={openAddUser}>
                + เพิ่มผู้ใช้
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="space-y-2.5 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{pageTitle}</h2>
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
      <div className="grid grid-cols-2 gap-2.5 text-sm animate-fade-in sm:gap-4">
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
        {/* 2. ต้องเปลี่ยน Password */}
        <div className="bg-white p-3 sm:p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
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
          <DialogContent className="max-w-2xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 max-h-[90vh] animate-fade-in" hideClose>
            <form className="flex flex-col h-full overflow-hidden" onSubmit={saveUser}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-5 py-4 shrink-0">
                <DialogTitle className="text-lg font-bold text-slate-100">{editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</DialogTitle>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <ActiveToggle checked={form.active} onChange={(checked) => setForm((current) => ({ ...current, active: checked }))} />
                  <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700 disabled:opacity-50" disabled={isSaving} type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
                  <button className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50" disabled={isSaving} type="submit">
                    {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
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
                  <div className="md:col-span-2 rounded-xl border border-slate-100 bg-white p-4">
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
                  <div className="md:col-span-2 rounded-xl border border-slate-100 bg-white p-4">
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

                  <div className="rounded-xl border border-slate-100 bg-white p-4">
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

                  <div className="rounded-xl border border-slate-100 bg-white p-4">
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

            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        {!mode ? (
          <Tabs className="gap-0" value={currentTab} onValueChange={(value) => setTab(value as TabKey)}>
            <TabsList className="w-full" variant="line">
              <TabsTrigger value="users" variant="line">Users</TabsTrigger>
              <TabsTrigger value="roles" variant="line">Roles</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        {error ? <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {notice ? <div className="m-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
        {isLoading ? <div className="p-12 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div> : null}

        {/* Tab 1: Users */}
        {!isLoading && currentTab === 'users' ? (
          <>
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
              <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: userColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {userColumns.map((column, index) => {
                    const style = userColumnResize.getColumnStyle(column.key)
                    if (index === userColumns.length - 1) {
                      return <col key={column.key} style={{ minWidth: column.minWidth }} />
                    }
                    return <col key={column.key} style={style} />
                  })}
                </colgroup>
                <thead className="bg-slate-100">
                  <tr>
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Username" resizeProps={userColumnResize.getResizeHandleProps('username', 'Username')} sortKey="username" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="ชื่อ" resizeProps={userColumnResize.getResizeHandleProps('name', 'ชื่อ')} sortKey="name" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Contact" resizeProps={userColumnResize.getResizeHandleProps('contact', 'Contact')} sortKey="contact" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Email" resizeProps={userColumnResize.getResizeHandleProps('email', 'Email')} sortKey="email" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Role" resizeProps={userColumnResize.getResizeHandleProps('roles', 'Role')} sortKey="roles" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="สาขา" resizeProps={userColumnResize.getResizeHandleProps('branches', 'สาขา')} sortKey="branches" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} align="center" direction={userSortDirection} label="สถานะ" resizeProps={userColumnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} align="center" direction={userSortDirection} label="ตั้งรหัส" resizeProps={userColumnResize.getResizeHandleProps('password', 'ตั้งรหัส')} sortKey="password" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Login ล่าสุด" resizeProps={userColumnResize.getResizeHandleProps('lastLoginAt', 'Login ล่าสุด')} sortKey="lastLoginAt" onSort={handleUserSort} />
                    <ResizableTableHead align="center" label="แก้ไข" resizeProps={userColumnResize.getResizeHandleProps('action', 'แก้ไข')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
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
                  {sortedUsers.length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-sm text-slate-500" colSpan={userColumns.length}>ไม่พบผู้ใช้</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Mobile View: Dense Card List (Hidden on Desktop) */}
            <div className="lg:hidden divide-y divide-slate-100">
              {sortedUsers.map((user) => (
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
              {sortedUsers.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">ไม่พบผู้ใช้</div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Tab 2: Roles */}
        {!isLoading && currentTab === 'roles' ? (
          <>
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
              <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: roleColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {roleColumns.map((column, index) => {
                    const style = roleColumnResize.getColumnStyle(column.key)
                    if (index === roleColumns.length - 1) {
                      return <col key={column.key} style={{ minWidth: column.minWidth }} />
                    }
                    return <col key={column.key} style={style} />
                  })}
                </colgroup>
                <thead className="bg-slate-100">
                  <tr>
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="Role" resizeProps={roleColumnResize.getResizeHandleProps('name', 'Role')} sortKey="name" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="รายละเอียด" resizeProps={roleColumnResize.getResizeHandleProps('description', 'รายละเอียด')} sortKey="description" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="ประเภท" resizeProps={roleColumnResize.getResizeHandleProps('type', 'ประเภท')} sortKey="type" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="สาขา" resizeProps={roleColumnResize.getResizeHandleProps('branchScope', 'สาขา')} sortKey="branchScope" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="right" direction={roleSortDirection} label="ผู้ใช้" resizeProps={roleColumnResize.getResizeHandleProps('users', 'ผู้ใช้')} sortKey="users" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="center" direction={roleSortDirection} label="ต้นทุน" resizeProps={roleColumnResize.getResizeHandleProps('canSeeCost', 'ต้นทุน')} sortKey="canSeeCost" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="center" direction={roleSortDirection} label="กำไร" resizeProps={roleColumnResize.getResizeHandleProps('canSeeProfit', 'กำไร')} sortKey="canSeeProfit" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="center" direction={roleSortDirection} label="เงินสด" resizeProps={roleColumnResize.getResizeHandleProps('canSeeCash', 'เงินสด')} sortKey="canSeeCash" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="center" direction={roleSortDirection} label="งบ" resizeProps={roleColumnResize.getResizeHandleProps('canSeeFinancials', 'งบ')} sortKey="canSeeFinancials" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="center" direction={roleSortDirection} label="Opening" resizeProps={roleColumnResize.getResizeHandleProps('canEditOpeningBalance', 'Opening')} sortKey="canEditOpeningBalance" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="center" direction={roleSortDirection} label="สถานะ" resizeProps={roleColumnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={handleRoleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRoles.map((role) => (
                    <tr key={role.id} className="align-top hover:bg-slate-50">
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
                  {sortedRoles.length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-sm text-slate-500" colSpan={roleColumns.length}>ไม่พบ role</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Mobile View: Dense Card List (Hidden on Desktop) */}
            <div className="lg:hidden divide-y divide-slate-100">
              {sortedRoles.map((role) => (
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
              {sortedRoles.length === 0 ? (
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
