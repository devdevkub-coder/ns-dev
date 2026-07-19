import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const originalEnv = { ...process.env }

async function loadSubject() {
  vi.resetModules()
  return import('./auth-rate-limit')
}

function configureEnv() {
  process.env.AUTH_RATE_LIMIT_SECRET = 'test-rate-limit-secret'
  process.env.KV_REST_API_URL = 'https://redis.example.test/'
  process.env.KV_REST_API_TOKEN = 'test-token'
}

describe('forgot password rate limiter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    configureEnv()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('normalizes email before generating deterministic fingerprints', async () => {
    const { authRateLimitFingerprint, normalizeForgotPasswordEmail } = await loadSubject()
    const normalized = normalizeForgotPasswordEmail('  USER@Example.COM ')

    expect(normalized).toBe('user@example.com')
    expect(authRateLimitFingerprint(normalized, 'test-rate-limit-secret')).toBe(
      authRateLimitFingerprint('user@example.com', 'test-rate-limit-secret'),
    )
    expect(authRateLimitFingerprint(normalized, 'test-rate-limit-secret')).not.toContain('user@example.com')
  })

  it('allows a request when Redis admits both dimensions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ result: [1, 1, 1] }]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { consumeForgotPasswordRateLimit } = await loadSubject()

    await expect(consumeForgotPasswordRateLimit({ email: 'user@example.com', ip: '203.0.113.7' })).resolves.toEqual({ outcome: 'allowed' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const command = JSON.parse(String(init.body))[0]
    expect(command[0]).toBe('EVAL')
    expect(command[3]).not.toContain('203.0.113.7')
    expect(command[4]).not.toContain('user@example.com')
  })

  it.each([
    ['IP limit', [0, 10, 1]],
    ['email limit', [0, 1, 3]],
  ])('throttles when Redis rejects the %s', async (_label, result) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ result }]), { status: 200 })))
    const { consumeForgotPasswordRateLimit } = await loadSubject()

    await expect(consumeForgotPasswordRateLimit({ email: 'user@example.com', ip: '203.0.113.7' })).resolves.toEqual({ outcome: 'throttled' })
  })

  it.each([
    ['missing secret', () => { delete process.env.AUTH_RATE_LIMIT_SECRET }],
    ['non-success Redis response', () => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))],
    ['malformed Redis response', () => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ result: 'bad' }]), { status: 200 })))],
    ['Redis network failure', () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))],
  ])('fails closed for %s', async (_label, setup) => {
    setup()
    const { consumeForgotPasswordRateLimit } = await loadSubject()

    await expect(consumeForgotPasswordRateLimit({ email: 'user@example.com', ip: '203.0.113.7' })).resolves.toEqual({ outcome: 'unavailable' })
  })
})
