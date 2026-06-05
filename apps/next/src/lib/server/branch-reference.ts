import { prisma } from '@/lib/server/prisma'

type BranchReference = {
  code: string
  id: bigint
  name: string
}

export async function findActiveBranchReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<BranchReference | null> {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const branch = await prisma.branches.findFirst({
    select: { code: true, id: true, name: true },
    where: {
      active: true,
      OR: [
        { code: normalized.toUpperCase() },
        ...(normalized.match(/^\d+$/) ? [{ id: BigInt(normalized) }] : []),
      ],
    },
  })

  if (!branch) return null

  return {
    code: branch.code,
    id: branch.id,
    name: branch.name,
  }
}

export async function findActiveBranchReferencesByCodes(codes: string[]) {
  const normalizedCodes = [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  if (!normalizedCodes.length) return []

  return prisma.branches.findMany({
    select: { code: true, id: true, name: true },
    where: {
      active: true,
      code: { in: normalizedCodes },
    },
  })
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
