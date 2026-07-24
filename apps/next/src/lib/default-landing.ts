import { navigationItems, permissionForPath, type NavigationItem } from '@/lib/navigation'

type LandingPermissionContext = {
  isAdmin?: boolean
  permissions?: string[]
  preferredPath?: string | null
}

type RoleLandingPreference = {
  code: string
  defaultLandingPath?: string | null
}

function canUseLandingPath(pathname: string, context: LandingPermissionContext) {
  const requiredPermission = permissionForPath(pathname)
  return !requiredPermission
    || context.isAdmin === true
    || (context.permissions ?? []).includes(requiredPermission)
}

function firstAccessibleItem(items: NavigationItem[], context: LandingPermissionContext): string | null {
  for (const item of items) {
    if (canUseLandingPath(item.href, context)) return item.href
    const childPath = item.children ? firstAccessibleItem(item.children, context) : null
    if (childPath) return childPath
  }
  return null
}

function isKnownNavigationPath(items: NavigationItem[], pathname: string): boolean {
  return items.some((item) => item.href === pathname
    || (item.children ? isKnownNavigationPath(item.children, pathname) : false))
}

export function preferredLandingPathForRoles(roles: RoleLandingPreference[]) {
  return [...roles]
    .filter((role) => role.defaultLandingPath?.trim())
    .sort((left, right) => left.code.localeCompare(right.code))[0]
    ?.defaultLandingPath
    ?.trim() ?? null
}

export function defaultLandingPath(context: LandingPermissionContext) {
  const preferredPath = context.preferredPath?.trim()
  if (
    preferredPath
    && isKnownNavigationPath(navigationItems, preferredPath)
    && canUseLandingPath(preferredPath, context)
  ) {
    return preferredPath
  }

  return firstAccessibleItem(navigationItems, context) ?? '/login'
}
