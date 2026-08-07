import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  findTargets: vi.fn(),
  updateTarget: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    line_targets: {
      findMany: db.findTargets,
      update: db.updateTarget,
    },
  },
}))

import { fetchLineBotInfo, syncLineTargetsFromAPI } from './line-target-sync'

describe('LINE target sync transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.findTargets.mockResolvedValue([])
    db.updateTarget.mockResolvedValue({})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('bounds the LINE bot info request with a timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ basicId: '@nserp', displayName: 'NS ERP' }),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchLineBotInfo('token')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/info',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('keeps syncing when one target lookup times out', async () => {
    db.findTargets.mockResolvedValue([{
      created_at: new Date(),
      id: 1n,
      target_id: 'C-LINE',
      target_type: 'group',
    }])
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ basicId: '@nserp', displayName: 'NS ERP' }),
        ok: true,
      })
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError')))

    await expect(syncLineTargetsFromAPI('token')).resolves.toMatchObject({
      failed: 1,
      refreshed: 0,
      total: 1,
    })
    expect(db.updateTarget).not.toHaveBeenCalled()
  })

  it('does not reactivate an inactive room without a real webhook event', async () => {
    db.findTargets.mockResolvedValue([{
      created_at: new Date(),
      id: 2n,
      is_active: false,
      target_id: 'R-OLD-OA',
      target_type: 'room',
    }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ basicId: '@nserp', displayName: 'NS ERP' }),
      ok: true,
    }))

    await expect(syncLineTargetsFromAPI('token')).resolves.toMatchObject({
      refreshed: 0,
      total: 1,
    })
    expect(db.updateTarget).not.toHaveBeenCalled()
  })
})
