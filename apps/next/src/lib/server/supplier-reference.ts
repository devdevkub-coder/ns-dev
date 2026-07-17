import { requireBusinessCode } from '@/lib/business-code'
import {
  findActiveSupplierReferenceByCodeOrId as findCachedActiveSupplierReferenceByCodeOrId,
  type SupplierReferenceRecord as SupplierReference,
} from '@/lib/server/reference-master-cache'

export async function findActiveSupplierReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<SupplierReference | null> {
  return findCachedActiveSupplierReferenceByCodeOrId(value)
}

export function outwardSupplierReference(
  supplier:
    | {
        code?: string | null
        id?: bigint | string | null
        name?: string | null
      }
    | null
    | undefined,
  fallbackSupplierId?: bigint | string | null,
) {
  const code = supplier ? requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id ?? fallbackSupplierId ?? 'unknown'}`) : null
  return {
    supplierCode: code,
    supplierId: code,
    supplierName: supplier?.name ?? null,
  }
}
