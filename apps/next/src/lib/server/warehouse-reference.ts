import { prisma } from '@/lib/server/prisma'

type WarehouseReference = {
  branchCode: string | null
  code: string
  id: bigint
  name: string
}

export async function findActiveWarehouseReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<WarehouseReference | null> {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const warehouse = await prisma.warehouses.findFirst({
    select: {
      branches: { select: { code: true } },
      code: true,
      id: true,
      name: true,
    },
    where: {
      active: true,
      OR: [
        { code: normalized.toUpperCase() },
        ...(normalized.match(/^\d+$/) ? [{ id: BigInt(normalized) }] : []),
      ],
    },
  })

  if (!warehouse) return null

  return {
    branchCode: warehouse.branches?.code ?? null,
    code: warehouse.code,
    id: warehouse.id,
    name: warehouse.name,
  }
}

export function outwardWarehouseReference(
  warehouse:
    | {
        branches?: { code?: string | null } | null
        code?: string | null
        id?: bigint | string | null
        name?: string | null
      }
    | null
    | undefined,
  fallbackWarehouseId?: bigint | string | null,
) {
  return {
    warehouseBranchId: warehouse?.branches?.code ?? null,
    warehouseCode: warehouse?.code ?? null,
    warehouseId: warehouse?.code ?? null,
    warehouseName: warehouse?.name ?? null,
  }
}
