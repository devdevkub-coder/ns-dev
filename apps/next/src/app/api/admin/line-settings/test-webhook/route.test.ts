import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getContext: vi.fn(),
  requirePermission: vi.fn(),
}))

const settings = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: auth.getContext,
  requirePermission: auth.requirePermission,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: { system_settings: { findUnique: settings.findUnique } },
}))

import { POST } from './route'

describe('LINE webhook self-test transport', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    auth.getContext.mockResolvedValue({ appUser: { id: 'admin' } })
    settings.findUnique.mockImplementation(({ where }: { where: { key: string } }) => Promise.resolve({
      value: where.key === 'LINE_CHANNEL_SECRET' ? 'secret' : 'https://ns-erp.vercel.app',
    }))
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fhglqymcdmrgbsbadnwr.supabase.co')
  })

  it('bounds the webhook request with a timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(new Request('https://erp.example.com/api/admin/line-settings/test-webhook', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ns-erp.vercel.app/api/line/webhook',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('sends a signed empty-events payload and returns a structured success result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(new Request('https://ns-erp.vercel.app/api/admin/line-settings/test-webhook', {
      method: 'POST',
    }))

    const [, requestInit] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(requestInit.body))).toEqual({ events: [] })
    expect(requestInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-line-signature': expect.any(String),
    })
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      code: 'LINE_WEBHOOK_OK',
      stage: 'complete',
    })
  })

  it('blocks a known cross-profile webhook URL before transport', async () => {
    settings.findUnique.mockImplementation(({ where }: { where: { key: string } }) => Promise.resolve({
      value: where.key === 'LINE_CHANNEL_SECRET' ? 'secret' : 'https://ns-erp-sit.vercel.app',
    }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(new Request('https://ns-erp.vercel.app/api/admin/line-settings/test-webhook', {
      method: 'POST',
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'LINE_ENVIRONMENT_MISMATCH',
      stage: 'environment',
      sourceProfile: 'OA B · Production',
      targetProfile: 'OA A · SIT',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a destination signature rejection to an actionable admin error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const response = await POST(new Request('https://ns-erp.vercel.app/api/admin/line-settings/test-webhook', {
      method: 'POST',
    }))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'LINE_WEBHOOK_SIGNATURE_REJECTED',
      stage: 'signature',
      upstreamStatus: 401,
    })
  })
})
