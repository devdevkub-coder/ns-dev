'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import type { WeightTicketChangeEvent } from '@/lib/weight-ticket-realtime'

const WEIGHT_TICKET_CHANGE_CHANNEL = 'weight-ticket-updates'

function isWeightTicketChangeEvent(value: unknown): value is WeightTicketChangeEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<WeightTicketChangeEvent>
  return typeof event.documentNo === 'string'
    && typeof event.changeType === 'string'
    && (event.updatedAt === null || typeof event.updatedAt === 'string')
}

export function useWeightTicketRealtime(onChange: (event: WeightTicketChangeEvent) => void, enabled = true) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled) return
    const supabase = getSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel(WEIGHT_TICKET_CHANGE_CHANNEL)
      .on('broadcast', { event: 'changed' }, ({ payload }) => {
        if (isWeightTicketChangeEvent(payload)) onChangeRef.current(payload)
      })

    void channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled])
}
