import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import type { Prisma } from '../../../generated/prisma/client'

type CustomerReference = {
  code: string
  id: bigint
  name: string
}

export async function findActiveCustomerReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<CustomerReference | null> {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const internalId = parseInternalBigIntId(normalized)

  const customer = await prisma.customers.findFirst({
    select: { code: true, id: true, name: true },
    where: {
      active: true,
      OR: [
        { code: normalized.toUpperCase() },
        ...(internalId != null ? [{ id: internalId }] : []),
      ],
    } as Prisma.customersWhereInput,
  })

  if (!customer) return null

  return {
    code: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
    id: customer.id as bigint,
    name: customer.name,
  }
}

export function outwardCustomerReference(
  customer:
    | {
        code?: string | null
        id?: bigint | string | null
        name?: string | null
      }
    | null
    | undefined,
  fallbackCustomerId?: bigint | string | null,
) {
  const code = customer ? requireBusinessCode(customer.code, `ลูกค้า ${customer.id ?? fallbackCustomerId ?? 'unknown'}`) : null
  return {
    customerCode: code,
    customerId: code,
    customerName: customer?.name ?? null,
  }
}
