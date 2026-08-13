import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Prisma } from '../../../generated/prisma/client'
import { apiErrorResponse } from '@/lib/server/api-error'
import { effectivePermissionCodes } from '@/lib/server/authorization'
import { prisma } from '@/lib/server/prisma'

export type AppRoleSummary = {
  branchScope: string
  code: string
  defaultLandingPath: string | null
  id: bigint | null
  name: string
}

export type AppAuthContext = {
  appUser: {
    active: boolean
    branchIds: string[]
    displayName: string | null
    email: string | null
    id: bigint
    mustChangePassword: boolean
    username: string
  } | null
  authUser: User
  isAdmin: boolean
  permissionCodes: Set<string>
  roles: AppRoleSummary[]
}

export class AuthContextError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthContextError'
    this.status = status
  }
}

function serializeInternalId(value: bigint | null | undefined) {
  return value == null ? null : value.toString()
}

const appUserAuthSelect = {
  active: true,
  auth_user_id: true,
  display_name: true,
  email: true,
  id: true,
  must_change_password: true,
  app_user_branch_access: {
    select: {
      branches: {
        select: {
          code: true,
        },
      },
    },
  },
  app_user_roles: {
    select: {
      app_roles: {
        select: {
          active: true,
          branch_scope: true,
          code: true,
          default_landing_path: true,
          id: true,
          name: true,
          app_role_permissions: {
            select: {
              app_permissions: {
                select: {
                  active: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
  },
  app_user_permission_overrides: {
    include: {
      app_permissions: true,
    },
  },
} as const

const APP_USER_CONTEXT_CACHE_TTL_MS = 10_000

type AppUserContextRow = NonNullable<Prisma.app_usersGetPayload<{
  select: typeof appUserAuthSelect
}>>

type AppUserContextCacheEntry = {
  expiresAt: number
  value: AppUserContextRow
}

const globalForAuthContextCache = globalThis as unknown as {
  appUserContextCache?: Map<string, AppUserContextCacheEntry>
}

// Caches the five-level Prisma context lookup (roles, permissions, overrides,
// branches) keyed by auth_user_id for a short window. The JWT is still verified
// on every request via supabase.auth.getUser() before this cache is consulted,
// and the proxy re-checks permissions live via current_app_permission_codes()
// (which reads auth.uid() directly), so a stale entry can never grant access.
function getAppUserContextCache() {
  globalForAuthContextCache.appUserContextCache ??= new Map()
  return globalForAuthContextCache.appUserContextCache
}

// Drop cached auth-context rows when an admin edits a user's roles,
// permission overrides, or active status — or when a role definition changes
// (which affects every user holding it). The proxy still re-verifies
// permissions live on every request, so this keeps the short-lived cache from
// ever delaying a revoked permission on routes the proxy does not gate.
export function invalidateAppUserAuthContext(authUserId?: string) {
  const cache = getAppUserContextCache()
  if (authUserId) {
    cache.delete(authUserId)
    return
  }
  cache.clear()
}

async function findAppUserWithAuth(where: Parameters<typeof prisma.app_users.findUnique>[0]['where']) {
  const authUserId = typeof where === 'object' && where !== null
    ? (where as { auth_user_id?: string }).auth_user_id
    : undefined
  if (!authUserId) {
    return prisma.app_users.findUnique({
      select: appUserAuthSelect,
      where,
    })
  }

  const cache = getAppUserContextCache()
  const cached = cache.get(authUserId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  if (cached) {
    cache.delete(authUserId)
  }

  const appUser = await prisma.app_users.findUnique({
    select: appUserAuthSelect,
    where,
  })
  if (appUser) {
    cache.set(authUserId, { expiresAt: Date.now() + APP_USER_CONTEXT_CACHE_TTL_MS, value: appUser })
  }
  return appUser
}

type AppUserWithAuth = NonNullable<Awaited<ReturnType<typeof findAppUserWithAuth>>>

function fallbackUsername(appUser: Pick<AppUserWithAuth, 'display_name' | 'email' | 'id'>, user: User) {
  const email = appUser.email?.trim() || user.email?.trim()
  if (email) return email

  const displayName = appUser.display_name?.trim()
  if (displayName) {
    return displayName.toLowerCase().replace(/\s+/g, '.')
  }

  return String(appUser.id)
}

function buildAppUserContext(appUser: AppUserWithAuth | null, user: User): AppAuthContext {
  if (!appUser) {
    throw new AuthContextError('ไม่พบข้อมูลผู้ใช้งานในระบบ', 403)
  }

  if (!appUser.active) {
    throw new AuthContextError('บัญชีนี้ถูกปิดใช้งาน', 403)
  }

  const roles = appUser.app_user_roles
    .map((userRole) => userRole.app_roles)
    .filter((role) => role.active)
  const rolePermissionCodes = roles.flatMap((role) => role.app_role_permissions
      .map((rolePermission) => rolePermission.app_permissions)
      .filter((permission) => permission.active)
      .map((permission) => permission.code))
  const permissionCodes = effectivePermissionCodes({
    overrides: appUser.app_user_permission_overrides
      .filter((override) => override.app_permissions.active && (override.effect === 'allow' || override.effect === 'deny'))
      .map((override) => ({ code: override.app_permissions.code, effect: override.effect as 'allow' | 'deny' })),
    rolePermissionCodes,
  })
  const roleSummaries = roles
    .map((role) => ({
      branchScope: role.branch_scope,
      code: role.code,
      defaultLandingPath: role.default_landing_path,
      id: role.id,
      name: role.name,
    }))
    .sort((left, right) => left.code.localeCompare(right.code))
  const isAdmin = roleSummaries.some((role) => role.code === 'admin' || role.code === 'owner' || role.code === 'system_admin')
  return {
    appUser: {
      active: appUser.active,
      branchIds: appUser.app_user_branch_access.map((branch) => branch.branches.code),
      displayName: appUser.display_name,
      email: appUser.email,
      id: appUser.id,
      mustChangePassword: appUser.must_change_password,
      username: fallbackUsername(appUser, user),
    },
    authUser: user,
    isAdmin,
    permissionCodes,
    roles: roleSummaries,
  }
}

export async function getSupabaseServerClient() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AuthContextError('Supabase Auth is not configured.', 500)
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Server Components cannot set cookies; route handlers/proxy can.
          }
        })
      },
    },
  })
}

export async function getCurrentAuthContext(): Promise<AppAuthContext> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new AuthContextError('กรุณาเข้าสู่ระบบ', 401)
  }

  const appUser = await findAppUserWithAuth({ auth_user_id: user.id })
  return buildAppUserContext(appUser, user)
}

export function hasPermission(context: AppAuthContext, permissionCode: string) {
  return context.isAdmin || context.permissionCodes.has(permissionCode)
}

export function requirePermission(context: AppAuthContext, permissionCode: string) {
  if (!hasPermission(context, permissionCode)) {
    throw new AuthContextError('ไม่มีสิทธิ์ใช้งานส่วนนี้', 403)
  }
}

export function requireAnyPermission(context: AppAuthContext, permissionCodes: readonly string[]) {
  if (!context.isAdmin && !permissionCodes.some((permissionCode) => context.permissionCodes.has(permissionCode))) {
    throw new AuthContextError('ไม่มีสิทธิ์ใช้งานส่วนนี้', 403)
  }
}

export function getBranchCodeIntersection(
  context: AppAuthContext,
  requestedBranchCode?: string | null
): string[] | null {
  const allowedCodes = [...new Set((context.appUser?.branchIds ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean))]
  if (allowedCodes.length) {
    if (requestedBranchCode && requestedBranchCode.toUpperCase() !== 'ALL') {
      const requested = requestedBranchCode.trim().toUpperCase()
      return allowedCodes.includes(requested) ? [requested] : []
    }
    return allowedCodes
  }
  if (context.isAdmin) {
    if (requestedBranchCode && requestedBranchCode.toUpperCase() !== 'ALL') {
      return [requestedBranchCode.trim().toUpperCase()]
    }
    return null
  }
  if (context.roles.some((role) => role.branchScope.trim().toLowerCase() === 'all')) {
    if (requestedBranchCode && requestedBranchCode.toUpperCase() !== 'ALL') return [requestedBranchCode.trim().toUpperCase()]
    return null
  }
  if (requestedBranchCode && requestedBranchCode.toUpperCase() !== 'ALL') {
    return []
  }
  return []
}


export function authContextErrorResponse(caught: unknown) {
  if (caught instanceof AuthContextError) {
    return apiErrorResponse(caught, caught.message, caught.status)
  }
  return apiErrorResponse(caught, 'ตรวจสอบสิทธิ์ไม่สำเร็จ', 500)
}

export function serializeAuthContext(context: AppAuthContext) {
  return {
    appUser: context.appUser
      ? {
        ...context.appUser,
        id: serializeInternalId(context.appUser.id),
      }
      : null,
    authUser: {
      email: context.authUser.email,
      id: context.authUser.id,
    },
    email: context.authUser.email,
    isAdmin: context.isAdmin,
    mustChangePassword: context.appUser?.mustChangePassword ?? false,
    permissions: Array.from(context.permissionCodes).sort(),
    roles: context.roles.map((role) => ({
      ...role,
      id: serializeInternalId(role.id),
    })),
    user: context.appUser
      ? {
        displayName: context.appUser.displayName,
        email: context.appUser.email,
        username: context.appUser.username,
      }
      : null,
  }
}
