import 'server-only'

import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import type { WeightTicketChangeEvent } from '@/lib/weight-ticket-realtime'

const WEIGHT_TICKET_CHANGE_CHANNEL = 'weight-ticket-updates'

/** Broadcast an invalidation signal; clients re-read through the auth API. */
export async function publishWeightTicketChange(event: WeightTicketChangeEvent) {
  try {
    const supabase = getSupabaseAdminClient()
    if (!supabase) return

    const channel = supabase.channel(WEIGHT_TICKET_CHANGE_CHANNEL)
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
          const { error } = await channel.send({ type: 'broadcast', event: 'changed', payload: event })
          if (error) console.error('[weight-ticket-realtime] broadcast failed:', error)
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
