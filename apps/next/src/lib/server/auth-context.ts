import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/prisma'

export type AppRoleSummary = {
  branchScope: string
  code: string
  id: string
  name: string
}

export type AppAuthContext = {
  appUser: {
    active: boolean
    branchIds: string[]
    displayName: string | null
    email: string | null
    id: string
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

function metadataRole(user: User) {
  return String(user.app_metadata?.role ?? user.user_metadata?.role ?? '').toLowerCase() || null
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

  const appUser = await prisma.app_users.findUnique({
    include: {
      app_user_branch_access: true,
      app_user_roles: {
        include: {
          app_roles: {
            include: {
              app_role_permissions: {
                include: {
                  app_permissions: true,
                },
              },
            },
          },
        },
      },
    },
    where: {
      auth_user_id: user.id,
    },
  })

  if (appUser) {
    if (!appUser.active) {
      throw new AuthContextError('บัญชีนี้ถูกปิดใช้งาน', 403)
    }

    const roles = appUser.app_user_roles
      .map((userRole) => userRole.app_roles)
      .filter((role) => role.active)
    const permissionCodes = new Set(
      roles.flatMap((role) => role.app_role_permissions
        .map((rolePermission) => rolePermission.app_permissions)
        .filter((permission) => permission.active)
        .map((permission) => permission.code)),
    )
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
        branchIds: appUser.app_user_branch_access.map((branch) => branch.branch_id),
        displayName: appUser.display_name,
        email: appUser.email,
        id: appUser.id,
        mustChangePassword: appUser.must_change_password,
        username: appUser.username,
      },
      authUser: user,
      fallbackRole: null,
      isAdmin,
      permissionCodes,
      roles: roleSummaries,
    }
  }

  const legacyProfile = await prisma.user_profiles.findUnique({
    where: {
      user_id: user.id,
    },
  })
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
    roles: fallbackRole ? [{ branchScope: 'all', code: fallbackRole, id: fallbackRole, name: fallbackRole }] : [],
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

export function authContextErrorResponse(caught: unknown) {
  if (caught instanceof AuthContextError) {
    return NextResponse.json({ error: caught.message }, { status: caught.status })
  }

  return NextResponse.json({ error: caught instanceof Error ? caught.message : 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }, { status: 500 })
}

export function serializeAuthContext(context: AppAuthContext) {
  return {
    appUser: context.appUser,
    authUser: {
      email: context.authUser.email,
      id: context.authUser.id,
    },
    fallbackRole: context.fallbackRole,
    isAdmin: context.isAdmin,
    permissions: Array.from(context.permissionCodes).sort(),
    roles: context.roles,
  }
}
