import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionSafely, getSupabaseClient } = vi.hoisted(() => ({
  getSessionSafely: vi.fn(),
  getSupabaseClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/supabase', () => ({ getSessionSafely, getSupabaseClient }))

import { invalidateClientReferenceRecords, listClientReferenceRecords } from './client-reference-cache'

describe('client-reference-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSessionSafely.mockResolvedValue({ user: { id: 'user-1' } })
    invalidateClientReferenceRecords([
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
  })

  it('memoizes branch records per authenticated user and deduplicates concurrent reads', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'B01', name: 'สาขา 1', active: true }]), { status: 200 }))
    global.fetch = fetchMock as typeof fetch

    const [first, second] = await Promise.all([
      listClientReferenceRecords('/api/master-data/branches'),
      listClientReferenceRecords('/api/master-data/branches'),
    ])
    await listClientReferenceRecords('/api/master-data/branches')

    expect(first).toEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates branch and warehouse entries after a master write', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'W01', name: 'คลัง 1', active: true }]), { status: 200 }))
    global.fetch = fetchMock as typeof fetch

    await listClientReferenceRecords('/api/master-data/warehouses')
    invalidateClientReferenceRecords(['/api/master-data/warehouses'])
    await listClientReferenceRecords('/api/master-data/warehouses')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not memoize non-reference endpoints', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'X01', name: 'ข้อมูล', active: true }]), { status: 200 }))
    global.fetch = fetchMock as typeof fetch

    await listClientReferenceRecords('/api/master-data/accounts')
    await listClientReferenceRecords('/api/master-data/accounts')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
