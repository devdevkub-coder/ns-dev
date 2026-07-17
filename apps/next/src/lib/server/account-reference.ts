import { findActiveAccountReferenceByCodeOrId, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

export async function findActiveAccountReferenceByCode(
  value: string | null | undefined,
): Promise<AccountReferenceRecord | null> {
  return findActiveAccountReferenceByCodeOrId(value)
}
