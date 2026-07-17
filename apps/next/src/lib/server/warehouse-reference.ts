import {
  findActiveWarehouseReferenceByCodeOrId as findCachedActiveWarehouseReferenceByCodeOrId,
  type WarehouseReferenceRecord as WarehouseReference,
} from '@/lib/server/reference-master-cache'

export async function findActiveWarehouseReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<WarehouseReference | null> {
  return findCachedActiveWarehouseReferenceByCodeOrId(value)
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
