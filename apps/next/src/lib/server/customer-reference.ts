import { requireBusinessCode } from '@/lib/business-code'
import { findActiveCustomerReferenceByCodeOrId as findCachedActiveCustomerReferenceByCodeOrId } from '@/lib/server/reference-master-cache'

type CustomerReference = {
  code: string
  credit_term: number | null
  id: bigint
  market_scope: string | null
  name: string
}

export async function findActiveCustomerReferenceByCodeOrId(
  value: string | bigint | null | undefined,
): Promise<CustomerReference | null> {
  const customer = await findCachedActiveCustomerReferenceByCodeOrId(value)
  if (!customer) return null
  return {
    code: customer.code,
    credit_term: customer.creditTerm,
    id: customer.id,
    market_scope: customer.marketScope,
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
