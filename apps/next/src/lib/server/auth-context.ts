import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { apiErrorResponse } from '@/lib/server/api-error'
import { prisma } from '@/lib/server/prisma'

export type AppRoleSummary = {
  branchScope: string
  code: string
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
  fallbackRole: string | null
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

function metadataRole(user: User) {
  return String(user.app_metadata?.role ?? user.user_metadata?.role ?? '').toLowerCase() || null
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
  display_name: true,
  email: true,
  id: true,
  must_change_password: true,
  app_user_roles: {
    select: {
      app_roles: {
        select: {
          active: true,
          branch_scope: true,
          code: true,
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

async function findAppUserWithAuth(where: Parameters<typeof prisma.app_users.findUnique>[0]['where']) {
  return prisma.app_users.findUnique({
    select: appUserAuthSelect,
    where,
  })
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
  const permissionCodes = new Set<string>(
    roles.flatMap((role) => role.app_role_permissions
      .map((rolePermission) => rolePermission.app_permissions)
      .filter((permission) => permission.active)
      .map((permission) => permission.code)),
  )
  for (const override of appUser.app_user_permission_overrides) {
    if (!override.app_permissions.active) continue
    if (override.effect === 'deny') {
      permissionCodes.delete(override.app_permissions.code)
    } else if (override.effect === 'allow') {
      permissionCodes.add(override.app_permissions.code)
    }
  }
  const roleSummaries = roles.map((role) => ({
    branchScope: role.branch_scope,
    code: role.code,
    id: role.id,
    name: role.name,
  }))
  const isAdmin = roleSummaries.some((role) => role.code === 'admin' || role.code === 'owner')
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
    fallbackRole: null,
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
  } = await supabase.auth.getUser()

  if (!user) {
    throw new AuthContextError('กรุณาเข้าสู่ระบบ', 401)
  }

  let appUser: AppUserWithAuth | null = null
  try {
    appUser = await findAppUserWithAuth({
      auth_user_id: user.id,
    })
  } catch {
    appUser = null
  }

  if (appUser) {
    return buildAppUserContext(appUser, user)
  }

  const email = user.email?.trim()
  if (email) {
    let emailMatches: AppUserWithAuth[] = []
    try {
      emailMatches = await prisma.app_users.findMany({
        select: appUserAuthSelect,
        orderBy: [{ created_at: 'desc' }],
        take: 2,
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      })
    } catch {
      emailMatches = []
    }

    if (emailMatches.length === 1) {
      return buildAppUserContext(emailMatches[0], user)
    }
  }

  let legacyProfile: { active: boolean | null; role: string | null } | null = null
  try {
    legacyProfile = await prisma.user_profiles.findUnique({
      where: {
        user_id: user.id,
      },
    })
  } catch {
    legacyProfile = null
  }
  const fallbackRole = String(legacyProfile?.role ?? metadataRole(user) ?? '').toLowerCase() || null
  const isActive = legacyProfile?.active !== false

  if (!isActive) {
    throw new AuthContextError('บัญชีนี้ถูกปิดใช้งาน', 403)
  }

  return {
    appUser: null,
    authUser: user,
    fallbackRole,
    isAdmin: fallbackRole === 'admin' || fallbackRole === 'owner',
    permissionCodes: new Set(),
    roles: fallbackRole ? [{ branchScope: 'all', code: fallbackRole, id: null, name: fallbackRole }] : [],
  }
}

export function hasPermission(context: AppAuthContext, permissionCode: string) {
  return context.isAdmin || context.permissionCodes.has(permissionCode)
}

export function requirePermission(context: AppAuthContext, permissionCode: string) {
  if (!hasPermission(context, permissionCode)) {
    throw new AuthContextError('ไม่มีสิทธิ์ใช้งานส่วนนี้', 403)
  }
}

export function getBranchCodeIntersection(
  context: AppAuthContext,
  requestedBranchCode?: string | null
): string[] | null {
  if (context.isAdmin) {
    if (requestedBranchCode && requestedBranchCode !== 'all') {
      return [requestedBranchCode]
    }
    return null
  }
  const allowedCodes = context.appUser?.branchIds ?? []
  if (!allowedCodes.length) {
    return requestedBranchCode && requestedBranchCode !== 'all' ? [requestedBranchCode] : null
  }
  if (requestedBranchCode && requestedBranchCode !== 'all') {
    if (allowedCodes.includes(requestedBranchCode)) {
      return [requestedBranchCode]
    }
    return []
  }

  return allowedCodes
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
    fallbackRole: context.fallbackRole,
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
