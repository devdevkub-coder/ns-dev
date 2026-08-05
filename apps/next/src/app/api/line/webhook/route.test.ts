import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  findSetting: vi.fn(),
  upsertTarget: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    line_targets: { upsert: db.upsertTarget },
    system_settings: { findUnique: db.findSetting },
  },
}))

vi.mock('@/lib/server/line-notification-jobs', () => ({
  enqueueNotificationJob: vi.fn(),
  executeNotificationJob: vi.fn(),
}))

import { POST } from './route'

describe('LINE webhook transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    db.findSetting.mockImplementation(({ where }: { where: { key: string } }) => Promise.resolve({
      value: where.key === 'LINE_CHANNEL_SECRET' ? 'secret' : 'token',
    }))
    db.upsertTarget.mockResolvedValue({})
  })

  it('bounds target enrichment requests with a timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ groupName: 'NS ERP' }),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)
    const rawBody = JSON.stringify({
      events: [{ source: { groupId: 'C-LINE', type: 'group' }, type: 'join' }],
    })
    const signature = createHmac('sha256', 'secret').update(rawBody).digest('base64')

    const response = await POST(new Request('https://erp.example.com/api/line/webhook', {
      body: rawBody,
      headers: { 'x-line-signature': signature },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/group/C-LINE/summary',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
