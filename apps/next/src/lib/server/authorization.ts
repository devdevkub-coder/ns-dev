export type PermissionOverride = {
  code: string
  effect: 'allow' | 'deny'
}

export function effectivePermissionCodes(params: {
  overrides: PermissionOverride[]
  rolePermissionCodes: string[]
}) {
  const permissionCodes = new Set(params.rolePermissionCodes)
  const deniedCodes = new Set<string>()
  const allowedCodes = new Set<string>()

  for (const override of params.overrides) {
    if (override.effect === 'deny') {
      deniedCodes.add(override.code)
    } else {
      allowedCodes.add(override.code)
    }
  }

  for (const code of allowedCodes) {
    permissionCodes.add(code)
  }
  for (const code of deniedCodes) {
    permissionCodes.delete(code)
  }

  return permissionCodes
}
