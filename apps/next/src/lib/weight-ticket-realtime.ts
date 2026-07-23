import { getSupabaseClient } from '@/lib/supabase'

export type WtiDraftRealtimePayload = {
  action: 'add' | 'update' | 'delete'
  actor: string
  changedLineId: string | null
  documentNo: string
  documentVersion: number
  operationId: string
}

export function subscribeToWtiDraft(
  documentNo: string,
  onOperation: (payload: WtiDraftRealtimePayload) => void,
) {
  const client = getSupabaseClient()
  if (!client) return () => undefined
  const channel = client.channel(`wti-draft:${documentNo}`)
  channel.on('broadcast', { event: 'line_operation' }, ({ payload }) => {
    if (!payload || typeof payload !== 'object') return
    onOperation(payload as WtiDraftRealtimePayload)
  }).subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
