import { NextResponse } from 'next/server'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function toIso(value: Date | null) {
  return value ? value.toISOString() : null
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.users.manage')

    const [users, roles, branches] = await Promise.all([
      prisma.app_users.findMany({
        include: {
          app_user_branch_access: {
            include: {
              branches: true,
            },
          },
          app_user_roles: {
            include: {
              app_roles: true,
            },
          },
        },
        orderBy: [{ active: 'desc' }, { username: 'asc' }],
      }),
      prisma.app_roles.findMany({
        orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
      }),
      prisma.branches.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        where: {
          active: true,
        },
      }),
    ])

    return NextResponse.json({
      branches: branches.map((branch) => ({
        code: branch.code,
        id: branch.id,
        name: branch.name,
      })),
      roles: roles.map((role) => ({
        active: role.active,
        branchScope: role.branch_scope,
        code: role.code,
        description: role.description,
        id: role.id,
        isSystem: role.is_system,
        name: role.name,
      })),
      users: users.map((user) => ({
        active: user.active,
        authUserId: user.auth_user_id,
        branchIds: user.app_user_branch_access.map((branch) => branch.branch_id),
        branches: user.app_user_branch_access.map((branch) => ({
          code: branch.branches.code,
          id: branch.branch_id,
          name: branch.branches.name,
        })),
        createdAt: toIso(user.created_at),
        displayName: user.display_name,
        email: user.email,
        id: user.id,
        lastLoginAt: toIso(user.last_login_at),
        mustChangePassword: user.must_change_password,
        roles: user.app_user_roles.map((userRole) => ({
          branchScope: userRole.app_roles.branch_scope,
          code: userRole.app_roles.code,
          id: userRole.role_id,
          name: userRole.app_roles.name,
        })),
        updatedAt: toIso(user.updated_at),
        username: user.username,
      })),
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
