import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getContext: vi.fn(),
  requirePermission: vi.fn(),
}))

const line = vi.hoisted(() => ({
  fetchBotInfo: vi.fn(),
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

vi.mock('@/lib/server/line-target-sync', () => ({
  fetchLineBotInfo: line.fetchBotInfo,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: { system_settings: { findUnique: settings.findUnique } },
}))

import { POST } from './route'

describe('LINE connection test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getContext.mockResolvedValue({ appUser: { id: 'admin' } })
    settings.findUnique.mockResolvedValue({ value: 'stored-token' })
    line.fetchBotInfo.mockResolvedValue({
      basicId: '@nserp',
      botName: 'NS ERP',
      pictureUrl: 'https://example.com/bot.png',
    })
  })

  it('uses the shared bounded LINE client and returns normalized bot info', async () => {
    const response = await POST(new Request('https://erp.example.com/api/admin/line-settings/test-connection', {
      body: JSON.stringify({ token: '' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(line.fetchBotInfo).toHaveBeenCalledWith('stored-token')
    await expect(response.json()).resolves.toMatchObject({
      basicId: '@nserp',
      botName: 'NS ERP',
      ok: true,
    })
  })
})
