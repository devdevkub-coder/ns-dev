import type { MasterDataRecord } from '@/lib/master-data'
import { listActivePaymentMethods } from '@/lib/server/reference-master-cache'

export type ActivePaymentMethod = Pick<MasterDataRecord, 'name' | 'type'>

export async function getActivePaymentMethods() {
  const rows = await listActivePaymentMethods()
  return rows.map((row) => ({ name: row.name, type: row.type })) as ActivePaymentMethod[]
}
