export type AdminUserBranchAccessMode = 'all' | 'selected' | 'unset'

export function isUnrestrictedBranchScope(scope: string | null | undefined) {
  return scope?.trim().toLowerCase() === 'all'
}

export function hasUnrestrictedBranchScope(scopes: Array<string | null | undefined>) {
  return scopes.some(isUnrestrictedBranchScope)
}

export function branchAccessModeForRoleScopes(scopes: Array<string | null | undefined>): AdminUserBranchAccessMode {
  if (!scopes.length) return 'unset'
  return hasUnrestrictedBranchScope(scopes) ? 'all' : 'selected'
}
