import { getBranchCodeIntersection, type AppAuthContext } from '@/lib/server/auth-context'
import { parseInternalBigIntId } from '@/lib/business-code'
import { listActiveBranchesByCodes } from '@/lib/server/reference-master-cache'

export async function getAllowedBranchIds(context: AppAuthContext) {
  const allowedCodes = getBranchCodeIntersection(context)
  if (allowedCodes === null) return null
  if (allowedCodes.length === 0) return [] as bigint[]

  const branches = await listActiveBranchesByCodes(allowedCodes)
  return branches
    .map((branch) => parseInternalBigIntId(branch.id))
    .filter((branchId): branchId is bigint => branchId !== null)
}

export function canAccessBranchId(allowedBranchIds: bigint[] | null, branchId: bigint | null | undefined, options: { allowNull?: boolean } = {}) {
  if (allowedBranchIds === null) return true
  if (branchId == null) return options.allowNull !== false
  return allowedBranchIds.some((allowedBranchId) => allowedBranchId === branchId)
}
