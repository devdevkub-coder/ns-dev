import { afterEach, describe, expect, it, vi } from 'vitest'

import { cachedPageOptions } from './options-cache'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => null,
  getSessionSafely: async () => null,
}))

vi.mock('@/lib/daily', () => ({
  dailyFetchJson: vi.fn(async (url: string) => ({ url, data: [1, 2, 3] })),
}))

import { dailyFetchJson } from '@/lib/daily'

const mockedDailyFetch = vi.mocked(dailyFetchJson)

afterEach(() => {
  vi.clearAllMocks()
})

describe('cachedPageOptions', () => {
  it('caches the payload so a second call for the same url does not refetch', async () => {
    const first = await cachedPageOptions<{ url: string }>('/api/options-a')
    const second = await cachedPageOptions<{ url: string }>('/api/options-a')

    expect(first.url).toBe('/api/options-a')
    expect(second.url).toBe('/api/options-a')
    expect(mockedDailyFetch).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent calls for the same url (single in-flight request)', async () => {
    const [a, b] = await Promise.all([
      cachedPageOptions<{ url: string }>('/api/options-b'),
      cachedPageOptions<{ url: string }>('/api/options-b'),
    ])

    expect(a.url).toBe('/api/options-b')
    expect(b.url).toBe('/api/options-b')
    expect(mockedDailyFetch).toHaveBeenCalledTimes(1)
  })

  it('refetches after the TTL expires', async () => {
    await cachedPageOptions<{ url: string }>('/api/options-c')
    // Simulate TTL expiry by advancing past the 60s window.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 61 * 1000)
    await cachedPageOptions<{ url: string }>('/api/options-c')
    vi.useRealTimers()

    expect(mockedDailyFetch).toHaveBeenCalledTimes(2)
  })
})
