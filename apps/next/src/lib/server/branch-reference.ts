import { findActiveBranchReferenceByCodeOrId as findCachedActiveBranchReferenceByCodeOrId, listActiveBranchesByCodes, type BranchReferenceRecord as BranchReference } from '@/lib/server/reference-master-cache'

export async function findActiveBranchReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<BranchReference | null> {
  return findCachedActiveBranchReferenceByCodeOrId(value)
}

export async function findActiveBranchReferencesByCodes(codes: string[]) {
  return listActiveBranchesByCodes(codes)
}

export function outwardBranchReference(
  branch:
    | {
        code?: string | null
        id?: bigint | string | null
        name?: string | null
      }
    | null
    | undefined,
  fallbackBranchId?: bigint | string | null,
) {
  return {
    branchId: branch?.code ?? null,
    branchName: branch?.name ?? null,
  }
}
