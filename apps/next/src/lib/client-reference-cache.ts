'use client'

import { getSessionSafely, getSupabaseClient } from '@/lib/supabase'
import { masterDataRecordListSchema, type MasterDataRecord } from '@/lib/master-data'

const CLIENT_REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000
const CACHEABLE_REFERENCE_PATHS = new Set([
  '/api/master-data/bank-names',
  '/api/master-data/branches',
  '/api/master-data/currencies',
  '/api/master-data/expense-types',
  '/api/master-data/machine-types',
  '/api/master-data/payment-methods',
  '/api/master-data/product-types',
  '/api/master-data/product-units',
  '/api/master-data/warehouses',
])

type CacheEntry = {
  expiresAt: number
  value: MasterDataRecord[]
}

const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<MasterDataRecord[]>>()

async function getUserScope() {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const session = await getSessionSafely(supabase)
  return session?.user.id ?? null
}

function isCacheableReferencePath(apiPath: string) {
  return CACHEABLE_REFERENCE_PATHS.has(apiPath)
}

async function fetchReferenceRecords(apiPath: string) {
  const response = await fetch(apiPath, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? 'โหลดข้อมูลอ้างอิงไม่ได้')
  return masterDataRecordListSchema.parse(payload)
}

export async function listClientReferenceRecords(apiPath: string): Promise<MasterDataRecord[]> {
  if (!isCacheableReferencePath(apiPath)) return fetchReferenceRecords(apiPath)

  const userScope = await getUserScope()
  if (!userScope) return fetchReferenceRecords(apiPath)

  const key = `${userScope}:${apiPath}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  if (cached) cache.delete(key)

  const existingRequest = pending.get(key)
  if (existingRequest) return existingRequest

  const request = fetchReferenceRecords(apiPath)
    .then((value) => {
      cache.set(key, { expiresAt: Date.now() + CLIENT_REFERENCE_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, request)
  return request
}

export function invalidateClientReferenceRecords(apiPaths: string[]) {
  const paths = new Set(apiPaths.filter(isCacheableReferencePath))
  for (const key of cache.keys()) {
    const separatorIndex = key.indexOf(':')
    const apiPath = separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key
    if (paths.has(apiPath)) cache.delete(key)
  }
}
