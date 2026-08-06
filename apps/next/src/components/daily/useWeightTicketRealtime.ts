'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { isWeightTicketChangeEvent, weightTicketRealtimeChannel, type WeightTicketChangeEvent } from '@/lib/weight-ticket-realtime'

export function useWeightTicketRealtime(onChange: (event: WeightTicketChangeEvent) => void, enabled = true, branchIds: string[] = []) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled || branchIds.length === 0) return
    const supabase = getSupabaseClient()
    if (!supabase) return

    const channels = Array.from(new Set(branchIds.map((branchId) => branchId.trim()).filter(Boolean))).map((branchId) => {
      const channel = supabase
        .channel(weightTicketRealtimeChannel(branchId), { config: { private: true } })
        .on('broadcast', { event: 'changed' }, ({ payload }) => {
          if (isWeightTicketChangeEvent(payload)) onChangeRef.current(payload)
        })
      void channel.subscribe()
      return channel
    })

    return () => {
      for (const channel of channels) {
        void supabase.removeChannel(channel)
      }
    }
  }, [branchIds, enabled])
}
