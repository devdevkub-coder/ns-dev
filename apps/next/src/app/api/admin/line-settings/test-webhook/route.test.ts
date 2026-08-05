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
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    auth.getContext.mockResolvedValue({ appUser: { id: 'admin' } })
    settings.findUnique.mockImplementation(({ where }: { where: { key: string } }) => Promise.resolve({
      value: where.key === 'LINE_CHANNEL_SECRET' ? 'secret' : 'https://erp.example.com',
    }))
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
      'https://erp.example.com/api/line/webhook',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
