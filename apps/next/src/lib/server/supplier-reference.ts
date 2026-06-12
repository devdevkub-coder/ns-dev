import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../generated/prisma/client'

type SupplierReference = {
  address: string | null
  code: string
  id: bigint
  name: string
  phone: string | null
  salesId: bigint | null
  salesRep: string | null
  taxId: string | null
}

export async function findActiveSupplierReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<SupplierReference | null> {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const internalId = parseInternalBigIntId(normalized)

  const supplier = await prisma.suppliers.findFirst({
    select: { address: true, code: true, id: true, name: true, phone: true, sales_id: true, sales_rep: true, tax_id: true },
    where: {
      active: true,
      OR: [
        { code: normalized.toUpperCase() },
        ...(internalId != null ? [{ id: internalId }] : []),
      ],
    } as Prisma.suppliersWhereInput,
  })

  if (!supplier) return null

  return {
    address: supplier.address,
    code: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
    id: supplier.id as bigint,
    name: supplier.name,
    phone: supplier.phone,
    salesId: supplier.sales_id as bigint | null,
    salesRep: supplier.sales_rep,
    taxId: supplier.tax_id,
  }
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
