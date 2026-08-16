import 'server-only'

import { randomUUID } from 'node:crypto'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { weightTicketRealtimeChannel, type WeightTicketChangeEvent } from '@/lib/weight-ticket-realtime'

/** Broadcast an invalidation signal; clients re-read through the auth API. */
export async function publishWeightTicketChange(event: WeightTicketChangeEvent) {
  const startedAt = performance.now()
  const publishId = randomUUID()
  const channelName = weightTicketRealtimeChannel(event.branchId)
  const context = {
    publishId,
    branchId: event.branchId,
    changeType: event.changeType,
    documentNo: event.documentNo,
    lineIds: event.lineIds ?? [],
    deletedLineIds: event.deletedLineIds ?? [],
    changedHeaderFields: event.changedHeaderFields ?? [],
    lineCount: event.lineIds?.length ?? 0,
    imageChanged: event.imageChanged === true,
    hasUpdatedAt: event.updatedAt !== null,
    channel: channelName,
  }

  console.info('[weight-ticket-realtime] publish.start', context)

  try {
    const supabase = getSupabaseAdminClient()
    if (!supabase) {
      console.warn('[weight-ticket-realtime] publish.skip', { ...context, reason: 'supabase_admin_unavailable' })
      return
    }

    const channel = supabase.channel(channelName, { config: { private: true } })
    await new Promise<void>((resolve) => {
      let settled = false
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const finish = (outcome: 'sent' | 'failed' | 'timed_out') => {
        if (settled) return
        settled = true
        if (timeoutId) clearTimeout(timeoutId)
        console.info('[weight-ticket-realtime] publish.finish', {
          ...context,
          outcome,
          durationMs: Math.round(performance.now() - startedAt),
        })
        resolve()
      }
      timeoutId = setTimeout(() => finish('timed_out'), 5000)

      void channel.subscribe(async (status) => {
        console.info('[weight-ticket-realtime] publish.status', {
          ...context,
          status,
          durationMs: Math.round(performance.now() - startedAt),
        })
        if (status !== 'SUBSCRIBED') {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish('failed')
          return
        }

        try {
          const sendStatus = await channel.send({ type: 'broadcast', event: 'changed', payload: event })
          console.info('[weight-ticket-realtime] publish.send', { ...context, sendStatus })
          if (sendStatus !== 'ok') {
            console.error('[weight-ticket-realtime] publish.send_failed', { ...context, sendStatus })
            finish('failed')
            return
          }
          finish('sent')
        } catch (caught) {
          console.error('[weight-ticket-realtime] publish.send_failed', {
            ...context,
            error: caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
          })
          finish('failed')
        }
      })
    })
    await supabase.removeChannel(channel)
  } catch (caught) {
    console.error('[weight-ticket-realtime] publish.exception', {
      ...context,
      durationMs: Math.round(performance.now() - startedAt),
      error: caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
    })
  }
}
