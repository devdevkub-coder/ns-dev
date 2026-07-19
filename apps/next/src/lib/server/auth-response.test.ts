import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { authJson, authNoStoreHeaders, withAuthNoStore } from './auth-response'

describe('auth response cache policy', () => {
  it('forces private no-store even when a caller supplies another cache policy', () => {
    const response = authJson({ ok: true }, {
      headers: { 'Cache-Control': 'public, max-age=3600', 'X-Test': 'present' },
    })

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Test')).toBe('present')
    expect(authNoStoreHeaders['Cache-Control']).toBe('private, no-store')
  })

  it('adds the policy to an existing error response without changing its status or body', async () => {
    const response = withAuthNoStore(Response.json({ error: 'denied' }, {
      headers: { 'X-Trace': 'trace-id' },
      status: 403,
    }))

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Trace')).toBe('trace-id')
    await expect(response.json()).resolves.toEqual({ error: 'denied' })
  })
})
