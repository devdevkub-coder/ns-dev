'use client'

import { getSessionSafely, getSupabaseClient } from '@/lib/supabase'
import { dailyFetchJson } from '@/lib/daily'

const CACHE_TTL_MS = 5 * 60 * 1000

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

export async function cachedSalesBillReferences<T>(url: string) {
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

export function invalidateSalesBillReferencesCache() {
  for (const key of cache.keys()) {
    if (key.endsWith('/api/sales/bills/options?scope=reference')) cache.delete(key)
  }
}
