'use client'

import Image from 'next/image'
import { Copy, EllipsisVertical, KeyRound, Mail, Pencil, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ActiveToggle } from '@/components/ui/ActiveToggle'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { SegmentedFilterButton } from '@/components/ui/SegmentedFilterButton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { getErrorMessage, readJsonResponse } from '@/lib/api-client'
import { sidebarPermissionSections } from '@/lib/navigation'
import { z } from 'zod'

type AdminUsersPayload = {
  branches: Array<{
    code: string
    id: string
    name: string
  }>
  departments: Array<{
    code: string
    id: string
    name: string
  }>
  permissions: Array<{
    action: string
    code: string
    description: string | null
    id: string
    module: string
    resource: string
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
    isEmployeeRole: boolean
    isSystem: boolean
    name: string
    permissionIds: string[]
  }>
  users: Array<{
    accountStatus: 'active' | 'disabled' | 'pending'
    active: boolean
    activatedAt: string | null
    activationSource: 'admin' | 'existing' | 'invitation' | null
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
    credentialStatus: 'link_sent' | 'not_sent' | 'ready' | 'temporary_password'
    department: {
      code: string
      id: string
      name: string
    } | null
    departmentId: string | null
    displayName: string | null
    email: string | null
    firstName: string | null
    id: string
    lastLoginAt: string | null
    lastName: string | null
    mustChangePassword: boolean
    namePrefix: string | null
    invitationSentAt: string | null
    passwordLinkSentAt: string | null
    passwordSetAt: string | null
    temporaryPasswordIssuedAt: string | null
    permissionOverrides: Array<{
      effect: 'allow' | 'deny'
      permissionId: string
    }>
    profileImageUrl: string | null
    roles: Array<{
      branchScope: string
      code: string
      id: string
      name: string
    }>
    updatedAt: string | null
  }>
}

const adminUsersPayloadSchema = z.object({
  branches: z.array(z.object({
    code: z.string(),
    id: z.string(),
    name: z.string(),
  })),
  departments: z.array(z.object({
    code: z.string(),
    id: z.string(),
    name: z.string(),
  })),
  permissions: z.array(z.object({
    action: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    id: z.string(),
    module: z.string(),
    resource: z.string(),
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
    isEmployeeRole: z.boolean(),
    isSystem: z.boolean(),
    name: z.string(),
    permissionIds: z.array(z.string()),
  })),
  users: z.array(z.object({
    accountStatus: z.enum(['active', 'disabled', 'pending']),
    active: z.boolean(),
    activatedAt: z.string().nullable(),
    activationSource: z.enum(['admin', 'existing', 'invitation']).nullable(),
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
    credentialStatus: z.enum(['link_sent', 'not_sent', 'ready', 'temporary_password']),
    department: z.object({
      code: z.string(),
      id: z.string(),
      name: z.string(),
    }).nullable(),
    departmentId: z.string().nullable(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    id: z.string(),
    lastLoginAt: z.string().nullable(),
    lastName: z.string().nullable(),
    mustChangePassword: z.boolean(),
    namePrefix: z.string().nullable(),
    invitationSentAt: z.string().nullable(),
    passwordLinkSentAt: z.string().nullable(),
    passwordSetAt: z.string().nullable(),
    temporaryPasswordIssuedAt: z.string().nullable(),
    permissionOverrides: z.array(z.object({
      effect: z.enum(['allow', 'deny']),
      permissionId: z.string(),
    })),
    profileImageUrl: z.string().nullable(),
    roles: z.array(z.object({
      branchScope: z.string(),
      code: z.string(),
      id: z.string(),
      name: z.string(),
    })),
    updatedAt: z.string().nullable(),
  })),
})

const statusUpdateSchema = z.object({
  accountStatus: z.enum(['active', 'disabled']),
  active: z.boolean(),
  activatedAt: z.string().nullable(),
})

const inviteResultSchema = z.object({
  mode: z.enum(['invite', 'reset']),
  sent: z.boolean(),
})

const temporaryPasswordResultSchema = z.object({
  issuedAt: z.string(),
  temporaryPassword: z.string().min(12),
})

const saveUserResultSchema = z.object({
  id: z.string(),
})

type TabKey = 'users' | 'roles'
type RolesViewTab = 'roles' | 'permissions'
type AdminUser = AdminUsersPayload['users'][number]
type AdminRole = AdminUsersPayload['roles'][number]
type UserColumnKey = 'action' | 'active' | 'branches' | 'contact' | 'department' | 'email' | 'lastLoginAt' | 'name' | 'roles'
type RoleColumnKey = 'active' | 'branchScope' | 'description' | 'name' | 'permissionCount' | 'type' | 'users'
type SortDirection = 'asc' | 'desc'
type UserStatusFilter = 'all' | 'active' | 'disabled' | 'pending'

type AdminUsersPageClientProps = {
  mode?: TabKey
}

type UserFormState = {
  active: boolean
  branchIds: string[]
  contactLineId: string
  contactNote: string
  contactPhone: string
  departmentId: string
  email: string
  firstName: string
  lastName: string
  mustChangePassword: boolean
  namePrefix: string
  profileImageUrl: string
  permissionOverrides: Array<{ effect: 'allow' | 'deny'; permissionId: string }>
  roleIds: string[]
}

type RoleFormState = {
  active: boolean
  branchScope: 'all' | 'own' | 'custom'
  description: string
  name: string
  permissionIds: string[]
}

const userColumns: Array<ResizableColumnDefinition<UserColumnKey>> = [
  { key: 'name', defaultWidth: 190, minWidth: 160 },
  { key: 'contact', defaultWidth: 150, minWidth: 125 },
  { key: 'email', defaultWidth: 210, minWidth: 170 },
  { key: 'department', defaultWidth: 130, minWidth: 110 },
  { key: 'roles', defaultWidth: 145, minWidth: 120 },
  { key: 'branches', defaultWidth: 155, minWidth: 130 },
  { key: 'active', defaultWidth: 115, minWidth: 105 },
  { key: 'lastLoginAt', defaultWidth: 145, minWidth: 125 },
  { key: 'action', defaultWidth: 72, minWidth: 64 },
]

const roleColumns: Array<ResizableColumnDefinition<RoleColumnKey>> = [
  { key: 'name', defaultWidth: 200, minWidth: 150 },
  { key: 'description', defaultWidth: 320, minWidth: 190 },
  { key: 'type', defaultWidth: 120, minWidth: 95 },
  { key: 'branchScope', defaultWidth: 170, minWidth: 125 },
  { key: 'permissionCount', defaultWidth: 125, minWidth: 105 },
  { key: 'users', defaultWidth: 115, minWidth: 95 },
  { key: 'active', defaultWidth: 120, minWidth: 95 },
]

const emptyUserForm: UserFormState = {
  active: false,
  branchIds: [],
  contactLineId: '',
  contactNote: '',
  contactPhone: '',
  departmentId: '',
  email: '',
  firstName: '',
  lastName: '',
  mustChangePassword: false,
  namePrefix: 'คุณ',
  profileImageUrl: '',
  permissionOverrides: [],
  roleIds: [],
}

const emptyRoleForm: RoleFormState = {
  active: true,
  branchScope: 'all',
  description: '',
  name: '',
  permissionIds: [],
}

function statusText(accountStatus: AdminUser['accountStatus']) {
  if (accountStatus === 'pending') return 'รอเปิดใช้งาน'
  if (accountStatus === 'active') return 'ใช้งาน'
  return 'ปิดใช้งาน'
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

function userInitials(user: Pick<AdminUser, 'displayName' | 'email' | 'firstName'>) {
  const label = user.firstName || user.displayName || user.email || '-'
  return label.trim().slice(0, 2).toUpperCase()
}

function compareSortValue(left: number | string, right: number | string) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getUserSortValue(user: AdminUser, key: UserColumnKey) {
  if (key === 'name') return fullName(user)
  if (key === 'contact') return [user.contactPhone, user.contactLineId, user.contactNote].filter(Boolean).join(' ')
  if (key === 'email') return user.email ?? ''
  if (key === 'department') return user.department?.name ?? ''
  if (key === 'roles') return user.roles.map((role) => role.name).join(' ')
  if (key === 'branches') return user.branches.length ? user.branches.map((branch) => branch.name).join(' ') : 'ทุกสาขา'
  if (key === 'active') return user.active ? 1 : 0
  if (key === 'lastLoginAt') return user.lastLoginAt ? Date.parse(user.lastLoginAt) || 0 : 0
  return ''
}

function getRoleSortValue(role: AdminRole, key: RoleColumnKey, roleUserCounts: Map<string, number>) {
  if (key === 'name') return role.name
  if (key === 'description') return role.description ?? ''
  if (key === 'type') return role.isSystem ? 'SYSTEM' : 'CUSTOM'
  if (key === 'branchScope') return branchScopeText(role.branchScope)
  if (key === 'permissionCount') return role.permissionIds.length
  if (key === 'users') return roleUserCounts.get(role.id) ?? 0
  return role.active ? 1 : 0
}

export function AdminUsersPageClient({ mode }: AdminUsersPageClientProps) {
  const [data, setData] = useState<AdminUsersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [activationUser, setActivationUser] = useState<AdminUser | null>(null)
  const [temporaryPasswordResult, setTemporaryPasswordResult] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('active')
  const [tab, setTab] = useState<TabKey>(mode ?? 'users')
  const [rolesViewTab, setRolesViewTab] = useState<RolesViewTab>('roles')
  const [permissionSubjectType, setPermissionSubjectType] = useState<'role' | 'user'>('role')
  const [permissionSubjectId, setPermissionSubjectId] = useState('')
  const [matrixPermissionIds, setMatrixPermissionIds] = useState<string[]>([])
  const [matrixDeniedPermissionIds, setMatrixDeniedPermissionIds] = useState<string[]>([])
  const [isSavingMatrix, setIsSavingMatrix] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyUserForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingRole, setIsSavingRole] = useState(false)
  const [roleForm, setRoleForm] = useState<RoleFormState>(emptyRoleForm)
  const [roleFormError, setRoleFormError] = useState<string | null>(null)
  const [roleFormOpen, setRoleFormOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null)
  const [expandedPermissionSection, setExpandedPermissionSection] = useState<string | null>(null)
  const [selectedPermissionPageHref, setSelectedPermissionPageHref] = useState<string | null>(null)
  const [roleSortDirection, setRoleSortDirection] = useState<SortDirection>('asc')
  const [roleSortKey, setRoleSortKey] = useState<RoleColumnKey | null>(null)
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>('asc')
  const [userSortKey, setUserSortKey] = useState<UserColumnKey | null>(null)
  const roleColumnResize = useResizableColumns('admin.users-permissions.roles.v1', roleColumns)
  const userColumnResize = useResizableColumns('admin.users-permissions.users.v5', userColumns)

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
  const pageTitle = isUsersPage ? 'รายชื่อพนักงาน / Users' : 'หน้าที่งานและสิทธิ์'
  const hasUserFilters = Boolean(search.trim() || roleFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'active')

  const filteredUsers = useMemo(() => {
    const rows = data?.users ?? []
    const query = search.trim().toLowerCase()

    return rows.filter((user) => (
      [
        user.displayName,
        user.email,
        user.firstName,
        user.lastName,
        user.contactPhone,
        user.contactLineId,
        user.contactNote,
        user.department?.name,
        user.department?.code,
        user.roles.map((role) => role.name).join(' '),
        user.branches.map((branch) => branch.name).join(' '),
      ].some((value) => String(value ?? '').toLowerCase().includes(query))
      && (roleFilter === 'all' || user.roles.some((role) => role.id === roleFilter))
      && (branchFilter === 'all' || user.branchIds.length === 0 || user.branchIds.includes(branchFilter))
      && (departmentFilter === 'all' || user.departmentId === departmentFilter)
      && (statusFilter === 'all' || user.accountStatus === statusFilter)
    ))
  }, [branchFilter, data?.users, departmentFilter, roleFilter, search, statusFilter])

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

  const departmentRoles = useMemo(() => {
    if (departmentFilter === 'all') return sortedRoles
    const roleIds = new Set((data?.users ?? [])
      .filter((user) => user.departmentId === departmentFilter)
      .flatMap((user) => user.roles.map((role) => role.id)))
    return sortedRoles.filter((role) => roleIds.has(role.id))
  }, [data?.users, departmentFilter, sortedRoles])

  const userSummary = useMemo(() => {
    const users = data?.users ?? []
    return {
      active: users.filter((user) => user.active).length,
      mustChange: users.filter((user) => user.mustChangePassword).length,
    }
  }, [data?.users])

  const rolePermissionIds = useMemo(() => new Set(
    (data?.roles ?? [])
      .filter((role) => form.roleIds.includes(role.id))
      .flatMap((role) => role.permissionIds),
  ), [data?.roles, form.roleIds])

  const employeeRoles = useMemo(() => (
    (data?.roles ?? []).filter((role) => role.active && role.isEmployeeRole)
  ), [data?.roles])
  const roleFilterOptions = useMemo(() => [
    { id: 'all', label: 'ทุกหน้าที่งาน' },
    ...(data?.roles ?? []).map((role) => ({
      id: role.id,
      label: role.name,
      searchText: [role.code, role.name, role.description].filter(Boolean).join(' '),
    })),
  ], [data?.roles])
  const departmentFilterOptions = useMemo(() => [
    { id: 'all', label: 'ทุกฝ่าย' },
    ...(data?.departments ?? []).map((department) => ({
      id: department.id,
      label: department.name,
      searchText: `${department.code} ${department.name}`,
    })),
  ], [data?.departments])
  const departmentOptions = useMemo(() => (data?.departments ?? []).map((department) => ({
    id: department.id,
    label: department.name,
    searchText: `${department.code} ${department.name}`,
  })), [data?.departments])
  const employeeRoleOptions = useMemo(() => employeeRoles.map((role) => ({
    id: role.id,
    label: role.name,
    searchText: [role.code, role.name, role.description].filter(Boolean).join(' '),
  })), [employeeRoles])
  const permissionSubjectOptions = useMemo(() => permissionSubjectType === 'role'
    ? (data?.roles ?? []).map((role) => ({
        id: role.id,
        label: role.name,
        searchText: [role.code, role.name, role.description].filter(Boolean).join(' '),
      }))
    : (data?.users ?? [])
        .filter((user) => user.active)
        .map((user) => ({
          id: user.id,
          label: user.displayName || user.email || user.id,
          searchText: [user.displayName, user.email, user.firstName, user.lastName, user.department?.name].filter(Boolean).join(' '),
        })), [data?.roles, data?.users, permissionSubjectType])

  const permissionsByModule = useMemo(() => {
    const groups = new Map<string, AdminUsersPayload['permissions']>()
    for (const permission of data?.permissions ?? []) {
      const current = groups.get(permission.module) ?? []
      current.push(permission)
      groups.set(permission.module, current)
    }
    return Array.from(groups.entries())
  }, [data?.permissions])

  const permissionsBySidebar = useMemo(() => sidebarPermissionSections(data?.permissions ?? []), [data?.permissions])
  const sidebarPermissionIds = useMemo(() => new Set(
    permissionsBySidebar.flatMap((section) => section.pages.flatMap((page) => page.actions.map((permission) => permission.id))),
  ), [permissionsBySidebar])
  const ungroupedPermissionsByModule = useMemo(() => {
    const groups = new Map<string, AdminUsersPayload['permissions']>()
    for (const permission of data?.permissions ?? []) {
      if (sidebarPermissionIds.has(permission.id)) continue
      const current = groups.get(permission.module) ?? []
      current.push(permission)
      groups.set(permission.module, current)
    }
    return Array.from(groups.entries())
  }, [data?.permissions, sidebarPermissionIds])
  const selectedPermissionPage = useMemo(() => {
    const pages = permissionsBySidebar.flatMap((section) => section.pages)
    return pages.find((page) => page.href === selectedPermissionPageHref) ?? pages[0] ?? null
  }, [permissionsBySidebar, selectedPermissionPageHref])
  const matrixActions = useMemo(() => Array.from(new Set((data?.permissions ?? []).map((permission) => permission.action))).sort(), [data?.permissions])
  const matrixPages = useMemo(() => permissionsBySidebar.flatMap((section) => section.pages.map((page) => ({ ...page, sectionLabel: section.label }))), [permissionsBySidebar])
  const selectedMatrixRole = useMemo(() => data?.roles.find((role) => role.id === permissionSubjectId) ?? null, [data?.roles, permissionSubjectId])
  const selectedMatrixUser = useMemo(() => data?.users.find((user) => user.id === permissionSubjectId) ?? null, [data?.users, permissionSubjectId])

  async function updateUserStatus(userId: string, active: boolean) {
    const previousUser = data?.users.find((user) => user.id === userId)
    const previousActive = previousUser?.active
    setSavingUserId(userId)
    setError(null)
    setNotice(null)
    setData((current) => current
      ? {
          ...current,
          users: current.users.map((user) => user.id === userId ? { ...user, accountStatus: active ? 'active' : 'disabled', active } : user),
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
            users: current.users.map((user) => user.id === userId ? {
              ...user,
              accountStatus: payload.accountStatus,
              activatedAt: payload.activatedAt,
              activationSource: payload.active ? 'admin' : user.activationSource,
              active: payload.active,
              credentialStatus: payload.active && !user.passwordSetAt ? 'not_sent' : user.credentialStatus,
            } : user),
          }
        : current)
      if (active && previousUser?.accountStatus === 'pending') {
        setTemporaryPasswordResult(null)
        setActivationUser({
          ...previousUser,
          accountStatus: 'active',
          activatedAt: payload.activatedAt,
          activationSource: 'admin',
          active: true,
          authUserId: null,
          credentialStatus: 'not_sent',
        })
      }
    } catch (caught) {
      if (previousActive !== undefined) {
        setData((current) => current
          ? {
              ...current,
              users: current.users.map((user) => user.id === userId ? {
                ...user,
                accountStatus: previousUser?.accountStatus ?? user.accountStatus,
                active: previousActive,
              } : user),
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
      return true
    } catch (caught) {
      setError(getErrorMessage(caught, 'ส่ง invite/reset password ไม่สำเร็จ'))
      return false
    } finally {
      setActionUserId(null)
    }
  }

  async function sendActivationPasswordLink() {
    if (!activationUser) return
    const sent = await sendUserInvite(activationUser)
    if (sent) setActivationUser(null)
  }

  async function createTemporaryPassword() {
    if (!activationUser) return
    setActionUserId(activationUser.id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(activationUser.id)}/temporary-password`, {
        method: 'POST',
      })
      const payload = await readJsonResponse(response, temporaryPasswordResultSchema, 'สร้างรหัสผ่านชั่วคราวไม่สำเร็จ')
      setTemporaryPasswordResult(payload.temporaryPassword)
      setNotice(`สร้างรหัสผ่านชั่วคราวสำหรับ ${activationUser.email} แล้ว`)
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'สร้างรหัสผ่านชั่วคราวไม่สำเร็จ'))
    } finally {
      setActionUserId(null)
    }
  }

  function userPasswordActionLabel(user: AdminUser) {
    if (user.accountStatus === 'pending') return user.invitationSentAt ? 'ส่งคำเชิญอีกครั้ง' : 'ส่งคำเชิญ'
    if (user.credentialStatus === 'temporary_password') return 'ส่งลิงก์รีเซ็ตรหัสผ่าน'
    if (user.credentialStatus !== 'ready') return user.credentialStatus === 'link_sent' ? 'ส่งลิงก์ตั้งรหัสผ่านอีกครั้ง' : 'ส่งลิงก์ตั้งรหัสผ่าน'
    return 'ส่งลิงก์รีเซ็ตรหัสผ่าน'
  }

  function renderUserActions(user: AdminUser) {
    const passwordActionDisabled = !user.email || user.accountStatus === 'disabled' || actionUserId === user.id

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`จัดการ ${fullName(user)}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white dark:focus-visible:ring-slate-400"
            disabled={actionUserId === user.id}
            title="จัดการ"
            type="button"
          >
            <EllipsisVertical aria-hidden="true" className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
          <DropdownMenuItem className="cursor-pointer gap-2 text-slate-700 focus:text-slate-950 dark:text-slate-100 dark:focus:text-white" onSelect={() => openEditUser(user)}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
            แก้ไข
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-slate-700 focus:text-slate-950 dark:text-slate-100 dark:focus:text-white"
            disabled={passwordActionDisabled}
            onSelect={() => void sendUserInvite(user)}
          >
            {user.authUserId ? <KeyRound aria-hidden="true" className="h-4 w-4" /> : <Send aria-hidden="true" className="h-4 w-4" />}
            {actionUserId === user.id ? 'กำลังส่ง...' : userPasswordActionLabel(user)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function openAddUser() {
    setEditingUser(null)
    setForm(emptyUserForm)
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
      departmentId: user.departmentId ?? '',
      email: user.email ?? '',
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      mustChangePassword: user.mustChangePassword,
      namePrefix: user.namePrefix ?? '',
      permissionOverrides: user.permissionOverrides,
      profileImageUrl: user.profileImageUrl ?? '',
      roleIds: user.roles.slice(0, 1).map((role) => role.id),
    })
    setFormError(null)
    setFormOpen(true)
  }

  function toggleFormArray(key: 'branchIds', value: string) {
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

    if (!form.email.trim() || !form.departmentId) {
      setFormError('กรอก Email และเลือกฝ่าย')
      return
    }

    if (!form.email.includes('@')) {
      setFormError('รูปแบบอีเมลไม่ถูกต้อง')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(editingUser ? `/api/admin/users/${encodeURIComponent(editingUser.id)}` : '/api/admin/users', {
        method: editingUser ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const savedUser = await readJsonResponse(response, saveUserResultSchema, 'บันทึกผู้ใช้ไม่ได้')

      setFormOpen(false)
      setEditingUser(null)
      setForm(emptyUserForm)
      let inviteErrorMessage: string | null = null

      if (!editingUser) {
        setStatusFilter('pending')
        try {
          const inviteResponse = await fetch(`/api/admin/users/${encodeURIComponent(savedUser.id)}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ redirectTo: `${window.location.origin}/reset-password` }),
          })
          await readJsonResponse(inviteResponse, inviteResultSchema, 'สร้างผู้ใช้แล้ว แต่ส่งคำเชิญไม่สำเร็จ')
          setNotice(`สร้างผู้ใช้และส่งคำเชิญไปที่ ${form.email.trim()} แล้ว`)
        } catch (caught) {
          inviteErrorMessage = getErrorMessage(caught, 'สร้างผู้ใช้แล้ว แต่ส่งคำเชิญไม่สำเร็จ สามารถส่งอีกครั้งจากเมนูจัดการ')
        }
      }

      await loadData()
      if (inviteErrorMessage) setError(inviteErrorMessage)
    } catch (caught) {
      setFormError(getErrorMessage(caught, 'บันทึกผู้ใช้ไม่ได้'))
    } finally {
      setIsSaving(false)
    }
  }

  function setPermissionOverride(permissionId: string, effect: '' | 'allow' | 'deny') {
    setForm((current) => ({
      ...current,
      permissionOverrides: effect
        ? [...current.permissionOverrides.filter((override) => override.permissionId !== permissionId), { effect, permissionId }]
        : current.permissionOverrides.filter((override) => override.permissionId !== permissionId),
    }))
  }

  function openAddRole() {
    setEditingRole(null)
    setRoleForm(emptyRoleForm)
    setRoleFormError(null)
    setExpandedPermissionSection(null)
    setSelectedPermissionPageHref(null)
    setRoleFormOpen(true)
  }

  function openEditRole(role: AdminRole) {
    setEditingRole(role)
    setRoleForm({
      active: role.active,
      branchScope: role.branchScope === 'own' || role.branchScope === 'custom' ? role.branchScope : 'all',
      description: role.description ?? '',
      name: role.name,
      permissionIds: role.permissionIds,
    })
    setRoleFormError(null)
    setExpandedPermissionSection(null)
    setSelectedPermissionPageHref(null)
    setRoleFormOpen(true)
  }

  function toggleRolePermission(permissionId: string) {
    setRoleForm((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter((id) => id !== permissionId)
        : [...current.permissionIds, permissionId],
    }))
  }

  async function saveRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRoleFormError(null)
    if (!roleForm.name.trim()) {
      setRoleFormError('กรอกชื่อหน้าที่งาน')
      return
    }

    setIsSavingRole(true)
    try {
      const response = await fetch(editingRole ? `/api/admin/roles/${encodeURIComponent(editingRole.id)}` : '/api/admin/roles', {
        body: JSON.stringify(roleForm),
        headers: { 'Content-Type': 'application/json' },
        method: editingRole ? 'PATCH' : 'POST',
      })
      await readJsonResponse(response, saveUserResultSchema, 'บันทึกหน้าที่งานไม่ได้')
      setRoleFormOpen(false)
      setEditingRole(null)
      setRoleForm(emptyRoleForm)
      await loadData()
    } catch (caught) {
      setRoleFormError(getErrorMessage(caught, 'บันทึกหน้าที่งานไม่ได้'))
    } finally {
      setIsSavingRole(false)
    }
  }

  function selectPermissionSubject(type: 'role' | 'user', id: string) {
    setPermissionSubjectType(type)
    setPermissionSubjectId(id)
    const role = type === 'role' ? data?.roles.find((item) => item.id === id) : null
    const user = type === 'user' ? data?.users.find((item) => item.id === id) : null
    setMatrixPermissionIds(role?.permissionIds ?? user?.permissionOverrides.filter((item) => item.effect === 'allow').map((item) => item.permissionId) ?? [])
    setMatrixDeniedPermissionIds(user?.permissionOverrides.filter((item) => item.effect === 'deny').map((item) => item.permissionId) ?? [])
  }

  function toggleMatrixPermission(permissionId: string) {
    setMatrixPermissionIds((current) => current.includes(permissionId) ? current.filter((id) => id !== permissionId) : [...current, permissionId])
    setMatrixDeniedPermissionIds((current) => current.filter((id) => id !== permissionId))
  }

  async function savePermissionMatrix() {
    if (!permissionSubjectId) return
    setIsSavingMatrix(true)
    try {
      if (permissionSubjectType === 'role') {
        if (!selectedMatrixRole) return
        const response = await fetch(`/api/admin/roles/${selectedMatrixRole.id}`, {
          body: JSON.stringify({ active: selectedMatrixRole.active, branchScope: selectedMatrixRole.branchScope, description: selectedMatrixRole.description ?? '', name: selectedMatrixRole.name, permissionIds: matrixPermissionIds }),
          headers: { 'Content-Type': 'application/json' }, method: 'PATCH',
        })
        await readJsonResponse(response, saveUserResultSchema, 'บันทึกสิทธิ์ Role ไม่ได้')
      } else {
        const response = await fetch(`/api/admin/users/${permissionSubjectId}/permission-overrides`, {
          body: JSON.stringify({ permissionOverrides: [
            ...matrixPermissionIds.map((permissionId) => ({ effect: 'allow', permissionId })),
            ...matrixDeniedPermissionIds.map((permissionId) => ({ effect: 'deny', permissionId })),
          ] }),
          headers: { 'Content-Type': 'application/json' }, method: 'PUT',
        })
        await readJsonResponse(response, saveUserResultSchema, 'บันทึกสิทธิ์ผู้ใช้ไม่ได้')
      }
      await loadData()
    } catch (caught) {
      setError(getErrorMessage(caught, 'บันทึกสิทธิ์ไม่ได้'))
    } finally {
      setIsSavingMatrix(false)
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

  function resetUserFilters() {
    setSearch('')
    setRoleFilter('all')
    setBranchFilter('all')
    setDepartmentFilter('all')
    setStatusFilter('active')
  }

  return (
    <section className="space-y-4">
      {/* AcexPOS Style KPI / Summary Cards */}
      {isUsersPage ? (
      <div className="grid grid-cols-2 gap-2.5 text-sm animate-fade-in sm:gap-4">
        <div className="bg-white p-3 sm:p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl shrink-0">
            👥
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-500 truncate">ผู้ใช้ Active</div>
            <div className="text-sm font-bold text-emerald-700 mt-0.5 tabular-nums">{userSummary.active}</div>
          </div>
        </div>
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

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isUsersPage ? 'ค้นหาชื่อ Email ฝ่าย หน้าที่งาน สาขา...' : 'ค้นหาหน้าที่งาน...'}
            type="search"
            value={search}
          />
          {isUsersPage ? (
            <>
              <SearchCombobox
                hideLabel
                inputClassName="h-9 w-[10rem]"
                inputId="admin-users-role-filter-desktop"
                label="หน้าที่งาน"
                options={roleFilterOptions}
                placeholder="ทุกหน้าที่งาน"
                value={roleFilter}
                onChange={setRoleFilter}
              />
              <SearchCombobox
                hideLabel
                inputClassName="h-9 w-[10rem]"
                inputId="admin-users-department-filter-desktop"
                label="ฝ่าย"
                options={departmentFilterOptions}
                placeholder="ทุกฝ่าย"
                value={departmentFilter}
                onChange={setDepartmentFilter}
              />
              <BranchSelectCombobox
                branches={data?.branches ?? []}
                className="w-[10rem]"
                controlSize="filter"
                includeAllOption
                inputId="admin-users-branch-filter-desktop"
                label=""
                placeholder="ทุกสาขา"
                value={branchFilter === 'all' ? null : branchFilter}
                onChange={(branchId) => setBranchFilter(branchId ?? 'all')}
              />
              {hasUserFilters ? (
                <button className="h-9 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={resetUserFilters}>
                  ล้างตัวกรอง
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isUsersPage ? (
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">{pageTitle}</h2>
            <SearchCombobox
              hideLabel
              inputClassName="h-9 w-[10rem]"
              inputId="admin-roles-department-filter-desktop"
              label="ฝ่าย"
              options={departmentFilterOptions}
              placeholder="ทุกฝ่าย"
              value={departmentFilter}
              onChange={setDepartmentFilter}
            />
          </div>
          ) : null}
          {isUsersPage ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-300">สถานะ:</span>
              {[
                { label: 'ทุกสถานะ', value: 'all' },
                { label: 'ใช้งาน', value: 'active' },
                { label: 'รอเปิดใช้งาน', value: 'pending' },
                { label: 'ปิดใช้งาน', value: 'disabled' },
              ].map((option) => (
                <SegmentedFilterButton
                  active={statusFilter === option.value}
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value as UserStatusFilter)}
                >
                  {option.label}
                </SegmentedFilterButton>
              ))}
            </div>
          ) : null}
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
            ) : (
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 h-9 flex items-center" disabled={!data} type="button" onClick={openAddRole}>
                + เพิ่มหน้าที่งาน
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="space-y-2.5 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        {!isUsersPage ? (
        <div>
          <h2 className="text-lg font-bold text-slate-900">{pageTitle}</h2>
        </div>
        ) : null}
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
          ) : (
            <button className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 h-9 shrink-0 flex items-center" disabled={!data} type="button" onClick={openAddRole}>
              + เพิ่มหน้าที่งาน
            </button>
          )}
        </div>
          {isUsersPage ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 w-full"
                inputId="admin-users-role-filter-mobile"
                label="หน้าที่งาน"
                options={roleFilterOptions}
                placeholder="ทุกหน้าที่งาน"
                value={roleFilter}
                onChange={setRoleFilter}
              />
              <SearchCombobox
                hideLabel
                inputClassName="h-9 w-full"
                inputId="admin-users-department-filter-mobile"
                label="ฝ่าย"
                options={departmentFilterOptions}
                placeholder="ทุกฝ่าย"
                value={departmentFilter}
                onChange={setDepartmentFilter}
              />
              <BranchSelectCombobox
                branches={data?.branches ?? []}
                className="w-full"
                controlSize="filter"
                includeAllOption
                inputId="admin-users-branch-filter-mobile"
                label=""
                placeholder="ทุกสาขา"
                value={branchFilter === 'all' ? null : branchFilter}
                onChange={(branchId) => setBranchFilter(branchId ?? 'all')}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-300">สถานะ:</span>
              {[
                { label: 'ทุกสถานะ', value: 'all' },
                { label: 'ใช้งาน', value: 'active' },
                { label: 'รอเปิดใช้งาน', value: 'pending' },
                { label: 'ปิดใช้งาน', value: 'disabled' },
              ].map((option) => (
                <SegmentedFilterButton
                  active={statusFilter === option.value}
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value as UserStatusFilter)}
                >
                  {option.label}
                </SegmentedFilterButton>
              ))}
              {hasUserFilters ? (
                <button className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700" type="button" onClick={resetUserFilters}>
                  ล้าง
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {activationUser ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setActivationUser(null)
              setTemporaryPasswordResult(null)
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>กำหนดวิธีเข้าสู่ระบบ</DialogTitle>
              <DialogDescription>{fullName(activationUser)} · {activationUser.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 bg-white p-5 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
              {temporaryPasswordResult ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">รหัสผ่านชั่วคราว</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">แสดงครั้งเดียว ผู้ใช้ต้องเปลี่ยนรหัสผ่านหลัง Login ครั้งแรก</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-950">
                    <code className="min-w-0 flex-1 select-all break-all px-2 font-mono text-sm font-semibold">{temporaryPasswordResult}</code>
                    <button
                      aria-label="คัดลอกรหัสผ่านชั่วคราว"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      title="คัดลอก"
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(temporaryPasswordResult)}
                    >
                      <Copy aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    ระบบไม่เก็บรหัสนี้ไว้ หลังปิดหน้าต่างจะไม่สามารถเปิดดูซ้ำได้
                  </div>
                  <button
                    className="h-9 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    type="button"
                    onClick={() => {
                      setActivationUser(null)
                      setTemporaryPasswordResult(null)
                    }}
                  >
                    เสร็จสิ้น
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">บัญชีเปิดใช้งานแล้ว เลือกวิธีให้ผู้ใช้ตั้งรหัสผ่าน</p>
                  <button
                    className="flex w-full items-start gap-3 rounded-md border border-blue-300 bg-blue-50 p-4 text-left hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-950/70"
                    disabled={actionUserId === activationUser.id}
                    type="button"
                    onClick={() => void sendActivationPasswordLink()}
                  >
                    <Mail aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
                    <span>
                      <span className="block text-sm font-semibold text-blue-950 dark:text-blue-100">ส่งลิงก์ตั้งรหัสผ่าน</span>
                      <span className="mt-1 block text-xs text-blue-700 dark:text-blue-300">แนะนำ · ผู้ใช้ตั้งรหัสผ่านเองจากอีเมล</span>
                    </span>
                  </button>
                  <button
                    className="flex w-full items-start gap-3 rounded-md border border-slate-300 bg-white p-4 text-left hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                    disabled={actionUserId === activationUser.id}
                    type="button"
                    onClick={() => void createTemporaryPassword()}
                  >
                    <KeyRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-700 dark:text-slate-200" />
                    <span>
                      <span className="block text-sm font-semibold">สร้างรหัสผ่านชั่วคราว</span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">แสดงให้ Admin ครั้งเดียว และบังคับเปลี่ยนหลัง Login</span>
                    </span>
                  </button>
                  <button
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    type="button"
                    onClick={() => setActivationUser(null)}
                  >
                    ไว้ภายหลัง
                  </button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {formOpen ? (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-2xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 max-h-[90vh] animate-fade-in" hideClose>
            <form className="flex flex-col h-full overflow-hidden" onSubmit={saveUser}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-5 py-4 text-white shrink-0 dark:border-slate-700 dark:bg-slate-950">
                <DialogTitle className="text-lg font-bold text-white">{editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</DialogTitle>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700 disabled:opacity-50" disabled={isSaving} type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
                  <button className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50" disabled={isSaving} type="submit">
                    {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4 dark:bg-slate-900 dark:text-slate-100">
                <div className="grid gap-4 text-sm md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Email *
                    <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                  </label>
                  <div className="md:col-span-2">
                    <SearchCombobox
                      inputId="admin-user-form-department"
                      label="ฝ่าย *"
                      options={departmentOptions}
                      placeholder="เลือกฝ่าย"
                      value={form.departmentId}
                      onChange={(departmentId) => setForm((current) => ({ ...current, departmentId }))}
                    />
                  </div>
                  <div className="md:col-span-2 rounded-xl border border-slate-100 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูล Profile</div>
                    <div className="grid gap-3 md:grid-cols-[120px_1fr_1fr]">
                      <label className="text-sm font-medium text-slate-700">
                        คำนำหน้า
                        <Select className="mt-1 h-10 w-full" value={form.namePrefix} onChange={(event) => setForm((current) => ({ ...current, namePrefix: event.target.value }))}>
                          <option value="">ไม่ระบุ</option>
                          <option value="นาย">นาย</option>
                          <option value="นาง">นาง</option>
                          <option value="นางสาว">นางสาว</option>
                          <option value="คุณ">คุณ</option>
                        </Select>
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
                    <SearchCombobox
                      inputId="admin-user-form-role"
                      label="หน้าที่งาน *"
                      options={employeeRoleOptions}
                      placeholder="เลือกหน้าที่งาน"
                      value={form.roleIds[0] ?? ''}
                      onChange={(roleId) => setForm((current) => ({ ...current, roleIds: roleId ? [roleId] : [] }))}
                    />
                  </div>

                  {!isUsersPage ? <div className="md:col-span-2 rounded-xl border border-slate-100 bg-white p-4">
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">สิทธิ์รายหน้า</div>
                      <div className="text-xs text-slate-500">ตามหน้าที่งาน / อนุญาตเพิ่ม / ปิดสิทธิ์</div>
                    </div>
                    <div className="mt-3 space-y-4">
                      {permissionsByModule.map(([module, permissions]) => (
                        <div key={module}>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{module}</div>
                          <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                            {permissions.map((permission) => {
                              const override = form.permissionOverrides.find((item) => item.permissionId === permission.id)
                              const inherited = rolePermissionIds.has(permission.id)
                              return (
                                <div key={permission.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-800">{permission.description || permission.code}</div>
                                    <div className="truncate font-mono text-xs text-slate-400">{permission.code}</div>
                                  </div>
                                  <Select
                                    className="h-10 w-full"
                                    value={override?.effect ?? ''}
                                    onChange={(event) => setPermissionOverride(permission.id, event.target.value as '' | 'allow' | 'deny')}
                                  >
                                    <option value="">ตามหน้าที่งาน ({inherited ? 'อนุญาต' : 'ไม่อนุญาต'})</option>
                                    <option value="allow">อนุญาตเพิ่ม</option>
                                    <option value="deny">ปิดสิทธิ์</option>
                                  </Select>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div> : null}

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

      {roleFormOpen ? (
        <Dialog open={roleFormOpen} onOpenChange={setRoleFormOpen}>
          <DialogContent className="max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 max-h-[90vh] animate-fade-in" hideClose>
            <form className="flex flex-col h-full overflow-hidden" onSubmit={saveRole}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-5 py-4 shrink-0">
                <DialogTitle className="text-lg font-bold text-slate-100">{editingRole ? 'แก้ไขหน้าที่งาน' : 'เพิ่มหน้าที่งาน'}</DialogTitle>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <ActiveToggle checked={roleForm.active} onChange={(active) => setRoleForm((current) => ({ ...current, active }))} />
                  <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm text-white hover:bg-rose-700 disabled:opacity-50" disabled={isSavingRole} type="button" onClick={() => setRoleFormOpen(false)}>ยกเลิก</button>
                  <button className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={isSavingRole} type="submit">{isSavingRole ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4">
                <div className="grid gap-4 text-sm md:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="text-sm font-medium text-slate-700">
                    ชื่อหน้าที่งาน *
                    <input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500" value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    ขอบเขตสาขา
                    <Select className="mt-1 h-10 w-full" value={roleForm.branchScope} onChange={(event) => setRoleForm((current) => ({ ...current, branchScope: event.target.value as RoleFormState['branchScope'] }))}>
                      <option value="all">ทุกสาขา</option>
                      <option value="own">เฉพาะสาขาตัวเอง</option>
                      <option value="custom">กำหนดตามผู้ใช้</option>
                    </Select>
                  </label>
                  <label className="md:col-span-2 text-sm font-medium text-slate-700">
                    คำอธิบาย
                    <textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500" value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} />
                  </label>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-700">หน้าที่งานเข้าถึง Side menu และทำอะไรได้</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
                    <aside className="rounded-md border border-slate-200 bg-slate-50 p-2" aria-label="หมวด Side menu">
                      {permissionsBySidebar.map((section) => {
                        const expanded = expandedPermissionSection === section.key
                        return (
                          <div key={section.key} className="border-b border-slate-200 last:border-b-0">
                            <button className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100" type="button" onClick={() => setExpandedPermissionSection((current) => current === section.key ? null : section.key)}>
                              <span className="truncate">{section.label}</span><span className="text-xs text-slate-500">{expanded ? '▾' : '▸'}</span>
                            </button>
                            {expanded ? <div className="space-y-1 pb-2 pl-2">
                              {section.pages.map((page) => (
                                <button key={page.href} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${selectedPermissionPage?.href === page.href ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'}`} type="button" onClick={() => setSelectedPermissionPageHref(page.href)}>
                                  <span>{page.icon}</span><span className="truncate">{page.label}</span>
                                </button>
                              ))}
                            </div> : null}
                          </div>
                        )
                      })}
                    </aside>
                    <section className="min-w-0 rounded-md border border-slate-200 p-4">
                      {selectedPermissionPage ? <>
                        <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold text-slate-800"><span>{selectedPermissionPage.icon}</span><span>{selectedPermissionPage.label}</span></div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {selectedPermissionPage.actions.map((permission) => (
                            <label key={permission.id} className="flex items-start gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                              <input checked={roleForm.permissionIds.includes(permission.id)} className="mt-0.5 rounded border-slate-300" type="checkbox" onChange={() => toggleRolePermission(permission.id)} />
                              <span className="min-w-0"><span className="block font-medium">{permission.description || permission.action}</span><span className="block truncate font-mono text-xs text-slate-400">{permission.code}</span></span>
                            </label>
                          ))}
                        </div>
                      </> : <p className="text-sm text-slate-500">ยังไม่มีหน้าที่ผูกกับ permission catalog</p>}
                    </section>
                    {ungroupedPermissionsByModule.length ? (
                      <section className="lg:col-span-2 rounded-md border border-slate-200">
                        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">สิทธิ์ระบบที่ยังไม่มีหน้าใน Side menu</div>
                        <div className="space-y-3 p-3">
                          {ungroupedPermissionsByModule.map(([module, permissions]) => (
                            <div key={module} className="grid gap-2 md:grid-cols-2">
                              {permissions.map((permission) => (
                                <label key={permission.id} className="flex items-start gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                                  <input checked={roleForm.permissionIds.includes(permission.id)} className="mt-0.5 rounded border-slate-300" type="checkbox" onChange={() => toggleRolePermission(permission.id)} />
                                  <span className="min-w-0"><span className="block font-medium">{permission.description || permission.action}</span><span className="block truncate font-mono text-xs text-slate-400">{permission.code}</span></span>
                                </label>
                              ))}
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
                {roleFormError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{roleFormError}</p> : null}
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        {!mode ? (
          <Tabs className="gap-0" value={currentTab} onValueChange={(value) => setTab(value as TabKey)}>
            <TabsList className="w-full" variant="line">
              <TabsTrigger value="users" variant="line">ผู้ใช้</TabsTrigger>
              <TabsTrigger value="roles" variant="line">หน้าที่งานและสิทธิ์</TabsTrigger>
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
                  {userColumns.map((column) => (
                    <col key={column.key} style={userColumnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-100">
                  <tr>
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="ชื่อ" resizeProps={userColumnResize.getResizeHandleProps('name', 'ชื่อ')} sortKey="name" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Contact" resizeProps={userColumnResize.getResizeHandleProps('contact', 'Contact')} sortKey="contact" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Email" resizeProps={userColumnResize.getResizeHandleProps('email', 'Email')} sortKey="email" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="ฝ่าย" resizeProps={userColumnResize.getResizeHandleProps('department', 'ฝ่าย')} sortKey="department" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="หน้าที่งาน" resizeProps={userColumnResize.getResizeHandleProps('roles', 'หน้าที่งาน')} sortKey="roles" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="สาขา" resizeProps={userColumnResize.getResizeHandleProps('branches', 'สาขา')} sortKey="branches" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} align="center" direction={userSortDirection} label="สถานะ" resizeProps={userColumnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={handleUserSort} />
                    <ResizableTableHead activeSortKey={userSortKey ?? undefined} direction={userSortDirection} label="Login ล่าสุด" resizeProps={userColumnResize.getResizeHandleProps('lastLoginAt', 'Login ล่าสุด')} sortKey="lastLoginAt" onSort={handleUserSort} />
                    <ResizableTableHead align="center" label="จัดการ" resizeProps={userColumnResize.getResizeHandleProps('action', 'จัดการ')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {user.profileImageUrl ? (
                            <Image alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" height={36} src={user.profileImageUrl} unoptimized width={36} />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{userInitials(user)}</span>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{fullName(user)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        <div>{user.contactPhone || '-'}</div>
                        {user.contactLineId ? <div className="text-xs text-slate-500">LINE: {user.contactLineId}</div> : null}
                      </td>
                      <td className="p-3 text-slate-600">{user.email || '-'}</td>
                      <td className="p-3 text-slate-700">{user.department?.name || '-'}</td>
                      <td className="p-3 text-slate-700">{user.roles.map((role) => role.name).join(', ') || '-'}</td>
                      <td className="p-3 text-slate-700">{user.branches.length ? user.branches.map((branch) => branch.name).join(', ') : 'ทุกสาขา'}</td>
                      <td className="p-3 text-center">
                        <ActiveToggle checked={user.accountStatus === 'active'} disabled={savingUserId === user.id} label={statusText(user.accountStatus)} onChange={(checked) => void updateUserStatus(user.id, checked)} />
                      </td>
                      <td className="p-3 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                      <td className="p-3 text-center">
                        {renderUserActions(user)}
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
                      <div className="font-bold text-slate-900 text-sm leading-snug">{fullName(user)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ActiveToggle checked={user.accountStatus === 'active'} disabled={savingUserId === user.id} label={statusText(user.accountStatus)} onChange={(checked) => void updateUserStatus(user.id, checked)} />
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
                      <span className="text-slate-400 block text-xs uppercase font-semibold">ฝ่าย</span>
                      <span className="text-slate-700 font-semibold">{user.department?.name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">หน้าที่งาน</span>
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
                        {renderUserActions(user)}
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
        {!isLoading && currentTab === 'roles' ? <div className="border-b border-slate-200 px-4 pt-3">
          <Tabs value={rolesViewTab} onValueChange={(value) => setRolesViewTab(value as RolesViewTab)}><TabsList variant="line"><TabsTrigger value="roles" variant="line">Role ตามฝ่าย</TabsTrigger><TabsTrigger value="permissions" variant="line">สิทธิ์รายหน้า</TabsTrigger></TabsList></Tabs>
        </div> : null}
        {!isLoading && currentTab === 'roles' && rolesViewTab === 'permissions' ? (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <span className="text-sm font-semibold text-slate-700">กำหนดสิทธิ์ให้</span>
              <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
                <button className={`rounded px-3 py-1.5 text-sm ${permissionSubjectType === 'role' ? 'bg-slate-800 text-white' : 'text-slate-600'}`} type="button" onClick={() => selectPermissionSubject('role', '')}>Role</button>
                <button className={`rounded px-3 py-1.5 text-sm ${permissionSubjectType === 'user' ? 'bg-slate-800 text-white' : 'text-slate-600'}`} type="button" onClick={() => selectPermissionSubject('user', '')}>ผู้ใช้รายบุคคล</button>
              </div>
              <SearchCombobox
                hideLabel
                inputClassName="h-9 w-[15rem]"
                inputId="admin-permission-subject"
                label={permissionSubjectType === 'role' ? 'Role' : 'ผู้ใช้'}
                options={permissionSubjectOptions}
                placeholder={`เลือก${permissionSubjectType === 'role' ? ' Role' : 'ผู้ใช้'}`}
                value={permissionSubjectId}
                onChange={(subjectId) => selectPermissionSubject(permissionSubjectType, subjectId)}
              />
              {selectedMatrixUser?.department ? <span className="text-xs text-slate-500">ฝ่าย: {selectedMatrixUser.department.name}</span> : null}
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200"><table className="ns-table min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">หมวด / หน้า</th>{matrixActions.map((action) => <th key={action} className="p-3 text-center whitespace-nowrap">{action}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
              {matrixPages.map((page) => <tr key={page.href}><td className="p-3"><div className="text-xs text-slate-500">{page.sectionLabel}</div><div className="font-medium text-slate-800">{page.icon} {page.label}</div></td>{matrixActions.map((action) => { const permission = page.actions.find((item) => item.action === action); return <td key={action} className="p-3 text-center">{permission ? <input aria-label={`${page.label} ${action}`} checked={matrixPermissionIds.includes(permission.id)} disabled={!permissionSubjectId} type="checkbox" onChange={() => toggleMatrixPermission(permission.id)} /> : '-'}</td> })}</tr>)}
            </tbody></table></div>
            <div className="flex justify-end gap-2"><button className="h-9 rounded-md border border-slate-300 px-4 text-sm" type="button" onClick={() => selectPermissionSubject(permissionSubjectType, permissionSubjectId)}>ยกเลิก</button><button className="h-9 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!permissionSubjectId || isSavingMatrix} type="button" onClick={() => void savePermissionMatrix()}>{isSavingMatrix ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}</button></div>
          </div>
        ) : null}
        {!isLoading && currentTab === 'roles' && rolesViewTab === 'roles' ? (
          <>
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
              <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: roleColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {roleColumns.map((column) => (
                    <col key={column.key} style={roleColumnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-100">
                  <tr>
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="หน้าที่งาน" resizeProps={roleColumnResize.getResizeHandleProps('name', 'หน้าที่งาน')} sortKey="name" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="รายละเอียด" resizeProps={roleColumnResize.getResizeHandleProps('description', 'รายละเอียด')} sortKey="description" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="ประเภท" resizeProps={roleColumnResize.getResizeHandleProps('type', 'ประเภท')} sortKey="type" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} direction={roleSortDirection} label="สาขา" resizeProps={roleColumnResize.getResizeHandleProps('branchScope', 'สาขา')} sortKey="branchScope" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="right" direction={roleSortDirection} label="จำนวนสิทธิ์" resizeProps={roleColumnResize.getResizeHandleProps('permissionCount', 'จำนวนสิทธิ์')} sortKey="permissionCount" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="right" direction={roleSortDirection} label="ผู้ใช้" resizeProps={roleColumnResize.getResizeHandleProps('users', 'ผู้ใช้')} sortKey="users" onSort={handleRoleSort} />
                    <ResizableTableHead activeSortKey={roleSortKey ?? undefined} align="center" direction={roleSortDirection} label="สถานะ" resizeProps={roleColumnResize.getResizeHandleProps('active', 'สถานะ')} sortKey="active" onSort={handleRoleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departmentRoles.map((role) => (
                    <tr key={role.id} className="align-top hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-slate-900">{role.name}</div>
                          <button className="text-xs font-semibold text-blue-700 hover:underline" type="button" onClick={() => openEditRole(role)}>แก้ไข</button>
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">{role.code}</div>
                      </td>
                      <td className="max-w-[280px] p-3 text-slate-600 leading-normal">{role.description || '-'}</td>
                      <td className="p-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${role.isSystem ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>
                          {role.isSystem ? 'SYSTEM' : 'CUSTOM'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700">{branchScopeText(role.branchScope)}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{role.permissionIds.length}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{roleUserCounts.get(role.id) ?? 0}</td>
                      <td className="p-3 text-center">
                        <span className={`rounded px-2.5 py-0.5 text-xs font-bold ${role.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                          {role.active ? 'ใช้งาน' : 'ปิด'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {departmentRoles.length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-sm text-slate-500" colSpan={roleColumns.length}>ไม่พบหน้าที่งาน</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Mobile View: Dense Card List (Hidden on Desktop) */}
            <div className="lg:hidden divide-y divide-slate-100">
              {departmentRoles.map((role) => (
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
                      <button className="ml-1 text-xs font-semibold text-blue-700 hover:underline" type="button" onClick={() => openEditRole(role)}>แก้ไข</button>
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
                    <div>
                      <span className="text-slate-400 block text-xs uppercase font-semibold">จำนวนสิทธิ์</span>
                      <span className="text-slate-700 font-bold">{role.permissionIds.length} รายการ</span>
                    </div>
                  </div>
                </div>
              ))}
              {departmentRoles.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">ไม่พบหน้าที่งาน</div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
