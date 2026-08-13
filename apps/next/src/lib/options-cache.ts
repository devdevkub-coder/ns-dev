'use client'

import { getSessionSafely, getSupabaseClient } from '@/lib/supabase'
import { dailyFetchJson } from '@/lib/daily'

/**
 * Generic short-TTL cache for "reference options" API payloads fetched on page
 * mount. These are datasets that change rarely (products, warehouses, parties)
 * but are currently re-fetched on every page open. Caching per user+url with a
 * short TTL + in-flight dedup avoids the repeat network cost without risking
 * stale data for long.
 *
 * TTL is intentionally short (60s) so options stay fresh while still skipping
 * the refetch when the user navigates back to the same page.
 */
const CACHE_TTL_MS = 60 * 1000

type CacheEntry = {
  expiresAt: number
  value: unknown
}

const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<unknown>>()

async function cacheKey(url: string) {
  const supabase = getSupabaseClient()
  const session = supabase ? await getSessionSafely(supabase) : null
  return `${session?.user.id ?? 'anonymous'}:${url}`
}

export async function cachedPageOptions<T>(url: string) {
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
