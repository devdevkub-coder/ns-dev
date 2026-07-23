import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'

export type WtiDraftRealtimePayload = {
  action: 'add' | 'update' | 'delete'
  actor: string
  changedLineId: string | null
  documentNo: string
  documentVersion: number
  operationId: string
}

export async function broadcastWtiDraftOperation(payload: WtiDraftRealtimePayload) {
  const client = getSupabaseAdminClient()
  if (!client) return
  const channel = client.channel(`wti-draft:${payload.documentNo}`)
  try {
    await channel.send({ type: 'broadcast', event: 'line_operation', payload })
  } finally {
    await client.removeChannel(channel)
  }
}
