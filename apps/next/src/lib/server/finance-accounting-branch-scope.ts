type FinanceBranchContext = {
  appUser: { branchIds: string[] } | null
  isAdmin: boolean
  roles: Array<{ branchScope: string }>
}

export function getFinanceBranchCodeIntersection(
  context: FinanceBranchContext,
  requestedBranchCode?: string | null,
): string[] | null {
  const requested = requestedBranchCode?.trim().toUpperCase()
  const hasAllBranchScope = context.isAdmin || context.roles.some((role) => role.branchScope === 'all')
  if (hasAllBranchScope) return requested && requested !== 'ALL' ? [requested] : null

  const allowedCodes = [...new Set((context.appUser?.branchIds ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean))]
  if (requested && requested !== 'ALL') return allowedCodes.includes(requested) ? [requested] : []
  return allowedCodes
}
