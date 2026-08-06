import 'server-only'

import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { weightTicketRealtimeChannel, type WeightTicketChangeEvent } from '@/lib/weight-ticket-realtime'

/** Broadcast an invalidation signal; clients re-read through the auth API. */
export async function publishWeightTicketChange(event: WeightTicketChangeEvent) {
  try {
    const supabase = getSupabaseAdminClient()
    if (!supabase) return

    const channel = supabase.channel(weightTicketRealtimeChannel(event.branchId), { config: { private: true } })
    await new Promise<void>((resolve) => {
      let settled = false
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const finish = () => {
        if (settled) return
        settled = true
        if (timeoutId) clearTimeout(timeoutId)
        resolve()
      }
      timeoutId = setTimeout(finish, 5000)

      void channel.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish()
          return
        }

        try {
          const status = await channel.send({ type: 'broadcast', event: 'changed', payload: event })
          if (status !== 'ok') console.error('[weight-ticket-realtime] broadcast failed:', status)
        } catch (caught) {
          console.error('[weight-ticket-realtime] broadcast failed:', caught)
        }
        finish()
      })
    })
    await supabase.removeChannel(channel)
  } catch (caught) {
    console.error('[weight-ticket-realtime] unavailable:', caught)
  }
}
