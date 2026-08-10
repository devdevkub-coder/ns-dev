'use client'

import { getSessionSafely, getSupabaseClient } from '@/lib/supabase'
import { dailyFetchJson } from '@/lib/daily'

const CACHE_TTL_MS = 60 * 60 * 1000

type CacheEntry = {
  expiresAt: number
  value: unknown
}

const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<unknown>>()
const freshReferencePending = new Map<string, Promise<unknown>>()

async function cacheKey(url: string) {
  const supabase = getSupabaseClient()
  const session = supabase ? await getSessionSafely(supabase) : null
  return `${session?.user.id ?? 'anonymous'}:${url}`
}

export async function cachedWeightTicketReferences<T>(url: string) {
  const key = await cacheKey(url)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value as T
  if (cached) cache.delete(key)

  const existing = pending.get(key)
  if (existing) return existing as Promise<T>

  const request = dailyFetchJson<T>(url)
    .then((value) => {
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
      return value
    })
    .finally(() => pending.delete(key))
  pending.set(key, request)
  return request
}

/**
 * Fresh reference payloads are not retained in the browser. Keep only an
 * in-flight request dedupe so a fast render or branch change cannot issue
 * duplicate requests while the server cache still provides the speedup.
 */
export async function fetchFreshWeightTicketReferences<T>(url: string) {
  const key = await cacheKey(url)
  const existing = freshReferencePending.get(key)
  if (existing) return existing as Promise<T>

  const request = dailyFetchJson<T>(url)
    .finally(() => freshReferencePending.delete(key))
  freshReferencePending.set(key, request)
  return request
}

export function invalidateWeightTicketReferenceCache() {
  for (const key of cache.keys()) {
    if (
      key.endsWith('/api/branches')
      || key.endsWith('/api/daily/weight-tickets/options')
      || key.endsWith('/api/daily/weight-tickets/products')
    ) cache.delete(key)
  }
}
