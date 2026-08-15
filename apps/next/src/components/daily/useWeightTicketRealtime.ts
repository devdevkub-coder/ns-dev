'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { isWeightTicketChangeEvent, mergeWeightTicketChangeEvents, weightTicketRealtimeChannel, type WeightTicketChangeEvent } from '@/lib/weight-ticket-realtime'

export function shouldWarnWeightTicketRealtimeStatus(status: string, disposed = false) {
  // CLOSED is expected only after this hook has explicitly disposed the
  // channel. A live CLOSED status is a real subscription failure.
  return !disposed && status !== 'SUBSCRIBED'
}

export function useWeightTicketRealtime(onChange: (event: WeightTicketChangeEvent) => void, enabled = true, branchIds: string[] = []) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled || branchIds.length === 0) return
    const supabase = getSupabaseClient()
    if (!supabase) return

    let disposed = false
    const channels: ReturnType<typeof supabase.channel>[] = []
    const uniqueBranchIds = Array.from(new Set(branchIds.map((branchId) => branchId.trim()).filter(Boolean)))
    const subscriptionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const startedAt = performance.now()
    const pendingEvents = new Map<string, { event: WeightTicketChangeEvent; timeoutId: ReturnType<typeof setTimeout> }>()

    const debugLogging = process.env.NODE_ENV !== 'production'
    const logDebug = (message: string, details: Record<string, unknown>) => {
      if (debugLogging) console.info(message, details)
    }

    const emitChange = (payload: WeightTicketChangeEvent, branchId: string) => {
      const key = `${branchId}:${payload.documentNo}`
      const pending = pendingEvents.get(key)
      if (pending) {
        pending.event = mergeWeightTicketChangeEvents(pending.event, payload)
        return
      }
      const timeoutId = setTimeout(() => {
        const current = pendingEvents.get(key)
        pendingEvents.delete(key)
        if (!disposed && current) onChangeRef.current(current.event)
      }, 50)
      pendingEvents.set(key, { event: payload, timeoutId })
    }

    logDebug('[weight-ticket-realtime] subscribe.start', {
      subscriptionId,
      branchIds: uniqueBranchIds,
      enabled,
    })

    const subscribe = async () => {
      // Private Realtime channels require the authenticated user's JWT. The
      // browser client normally propagates it automatically, but explicitly
      // setting it here removes the auth/subscription race on a freshly opened
      // tab or after a session refresh.
      const { data: sessionData } = await supabase.auth.getSession()
      if (disposed) return
      logDebug('[weight-ticket-realtime] subscribe.auth', {
        subscriptionId,
        authenticated: Boolean(sessionData.session),
        durationMs: Math.round(performance.now() - startedAt),
      })
      await supabase.realtime.setAuth(sessionData.session?.access_token ?? null)

      for (const branchId of uniqueBranchIds) {
        if (disposed) return
        const channel = supabase
          .channel(weightTicketRealtimeChannel(branchId), { config: { private: true } })
          .on('broadcast', { event: 'changed' }, ({ payload }) => {
            if (!isWeightTicketChangeEvent(payload)) {
              console.warn('[weight-ticket-realtime] receive.invalid_payload', { subscriptionId, branchId })
              return
            }
            logDebug('[weight-ticket-realtime] receive.changed', {
              subscriptionId,
              branchId,
              documentNo: payload.documentNo,
              changeType: payload.changeType,
              lineCount: payload.lineIds?.length ?? 0,
              imageChanged: payload.imageChanged === true,
            })
            emitChange(payload, branchId)
          })
        channels.push(channel)
        void channel.subscribe((status, error) => {
          if (status === 'CLOSED' && disposed) return
          logDebug('[weight-ticket-realtime] subscribe.status', {
            subscriptionId,
            branchId,
            status,
            durationMs: Math.round(performance.now() - startedAt),
            errorName: error?.name,
            errorMessage: error?.message,
          })
          if (shouldWarnWeightTicketRealtimeStatus(status, disposed)) {
            console.warn('[weight-ticket-realtime] subscription failed', {
              branchId,
              subscriptionId,
              status,
              errorName: error?.name,
              errorMessage: error?.message,
            })
          }
        })
      }
    }

    void subscribe().catch((error) => {
      console.warn('[weight-ticket-realtime] subscribe.exception', {
        subscriptionId,
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
    })

    return () => {
      disposed = true
      for (const { timeoutId } of pendingEvents.values()) clearTimeout(timeoutId)
      pendingEvents.clear()
      logDebug('[weight-ticket-realtime] subscribe.cleanup', {
        subscriptionId,
        channelCount: channels.length,
        durationMs: Math.round(performance.now() - startedAt),
      })
      for (const channel of channels) {
        void supabase.removeChannel(channel)
      }
    }
  }, [branchIds, enabled])
}
