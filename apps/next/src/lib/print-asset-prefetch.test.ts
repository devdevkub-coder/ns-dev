import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchCompanyProfileForPrint,
  invalidateCompanyProfileForPrintCache,
  invalidatePrintDocumentDetail,
  peekCachedCompanyProfileForPrint,
  peekPrintDocumentDetail,
  prefetchPrintDocumentDetail,
} from './print-asset-prefetch'

const payload = {
  profile: {
    address: '99 ถนนทดสอบ', logoUrl: null, name: 'บริษัท ทดสอบ จำกัด', nameEn: 'Test Co., Ltd.',
    phone: '021234567', taxId: '0105559999999',
  },
  profileConfigured: true,
  selectedBranchName: null,
}

const profileResponse = JSON.stringify(payload)

function stubFetch() {
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(profileResponse, {
    headers: { 'content-type': 'application/json' },
    status: 200,
  }))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  // Reset the module-level per-branch caches so tests start fresh.
  invalidateCompanyProfileForPrintCache()
})

describe('print document detail prefetch (hover → click)', () => {
  it('caches the prefetched payload so a click does not refetch', async () => {
    const fetcher = vi.fn(async () => ({ docNo: 'SB0001', lines: [1, 2, 3] }))

    const first = await prefetchPrintDocumentDetail('SB0001', fetcher)
    const second = peekPrintDocumentDetail<{ docNo: string; lines: number[] }>('SB0001')

    expect(first?.docNo).toBe('SB0001')
    expect(second?.lines).toEqual([1, 2, 3])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent prefetches for the same key', async () => {
    const fetcher = vi.fn(async () => ({ docNo: 'SB0002' }))

    const [a, b] = await Promise.all([
      prefetchPrintDocumentDetail('SB0002', fetcher),
      prefetchPrintDocumentDetail('SB0002', fetcher),
    ])

    expect(a?.docNo).toBe('SB0002')
    expect(b?.docNo).toBe('SB0002')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('returns null on failure without throwing or caching', async () => {
    const fetcher = vi.fn(async () => { throw new Error('boom') })

    const result = await prefetchPrintDocumentDetail('SB0003', fetcher)

    expect(result).toBeNull()
    expect(peekPrintDocumentDetail('SB0003')).toBeNull()
    // A later successful call must refetch rather than reuse the failure.
    const fetcher2 = vi.fn(async () => ({ docNo: 'SB0003' }))
    await prefetchPrintDocumentDetail('SB0003', fetcher2)
    expect(fetcher2).toHaveBeenCalledTimes(1)
  })

  it('invalidation clears cached entries', async () => {
    const fetcher = vi.fn(async () => ({ docNo: 'SB0004' }))
    await prefetchPrintDocumentDetail('SB0004', fetcher)
    expect(peekPrintDocumentDetail('SB0004')).not.toBeNull()

    invalidatePrintDocumentDetail('SB0004')

    expect(peekPrintDocumentDetail('SB0004')).toBeNull()
  })

  it('does not cache a stale in-flight result after invalidation', async () => {
    const deferred: { resolve?: (value: { docNo: string } | PromiseLike<{ docNo: string }>) => void } = {}
    const fetcher = vi.fn(() => new Promise<{ docNo: string }>((resolve) => { deferred.resolve = resolve }))

    const pending = prefetchPrintDocumentDetail('SB0005', fetcher)
    // The user edits the document while the hover prefetch is in flight.
    invalidatePrintDocumentDetail('SB0005')
    deferred.resolve?.({ docNo: 'SB0005' })
    await pending

    expect(peekPrintDocumentDetail('SB0005')).toBeNull()
  })
})

describe('company profile print cache (in-memory, per branch)', () => {
  it('fetches the profile and serves repeat calls from memory without hitting the network', async () => {
    const fetchMock = stubFetch()

    const first = await fetchCompanyProfileForPrint('01')
    const second = await fetchCompanyProfileForPrint('01')

    expect(first.profile.name).toBe('บริษัท ทดสอบ จำกัด')
    expect(second.profile.name).toBe('บริษัท ทดสอบ จำกัด')
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  it('keeps branch-specific entries separate', async () => {
    const fetchMock = stubFetch()

    await fetchCompanyProfileForPrint('01')
    await fetchCompanyProfileForPrint('02')

    // Each branch key hits the network once and caches independently.
    expect(fetchMock.mock.calls.length).toBe(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/company-profile?branchId=01')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/company-profile?branchId=02')
  })

  it('uses the default (branch-less) key when no branch is given', async () => {
    const fetchMock = stubFetch()

    await fetchCompanyProfileForPrint()
    await fetchCompanyProfileForPrint()

    expect(fetchMock.mock.calls.length).toBe(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/company-profile')
  })

  it('dedupes concurrent in-flight requests for the same branch', async () => {
    const fetchMock = stubFetch()

    const [a, b] = await Promise.all([fetchCompanyProfileForPrint('01'), fetchCompanyProfileForPrint('01')])

    expect(a.profile.name).toBe('บริษัท ทดสอบ จำกัด')
    expect(b.profile.name).toBe('บริษัท ทดสอบ จำกัด')
    expect(fetchMock.mock.calls.length).toBe(1)
  })

  it('peek returns the cached payload without fetching, and null after invalidation', async () => {
    const fetchMock = stubFetch()

    expect(peekCachedCompanyProfileForPrint('01')).toBeNull()

    await fetchCompanyProfileForPrint('01')
    expect(peekCachedCompanyProfileForPrint('01')?.profile.name).toBe('บริษัท ทดสอบ จำกัด')
    expect(fetchMock.mock.calls.length).toBe(1)

    invalidateCompanyProfileForPrintCache()
    expect(peekCachedCompanyProfileForPrint('01')).toBeNull()
  })
})
