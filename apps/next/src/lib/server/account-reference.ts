import { listActiveAccounts, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

export async function findActiveAccountReferenceByCode(
  value: string | null | undefined,
): Promise<AccountReferenceRecord | null> {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return null
  const accounts = await listActiveAccounts()
  return accounts.find((account) => account.code === normalized) ?? null
}
