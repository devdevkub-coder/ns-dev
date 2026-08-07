import { beforeEach, describe, expect, it, vi } from 'vitest'

const MASKED_CREDENTIAL = '••••••••••••••••'

const auth = vi.hoisted(() => ({
  getContext: vi.fn(),
  requirePermission: vi.fn(),
}))

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
  targetCount: vi.fn(),
  deactivateTargets: vi.fn(),
  deactivateRules: vi.fn(),
}))

const line = vi.hoisted(() => ({
  fetchBotInfo: vi.fn(),
  isMaskedToken: vi.fn(),
  syncTargets: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: auth.getContext,
  requirePermission: auth.requirePermission,
}))

vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn((error: unknown, fallback: string, status: number) => (
    Response.json({ error: error instanceof Error ? error.message : fallback }, { status })
  )),
}))

vi.mock('@/lib/server/daily', () => ({
  currentActor: vi.fn(() => 'test-admin'),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    $transaction: db.transaction,
    system_settings: {
      findMany: db.findMany,
      upsert: db.upsert,
    },
    line_targets: {
      count: db.targetCount,
      updateMany: db.deactivateTargets,
    },
    line_notification_rules: {
      updateMany: db.deactivateRules,
    },
  },
}))

vi.mock('@/lib/server/line-target-sync', () => ({
  fetchLineBotInfo: line.fetchBotInfo,
  isMaskedToken: line.isMaskedToken,
  syncLineTargetsFromAPI: line.syncTargets,
}))

import { GET, POST } from './route'

function settingsPayload(overrides: Record<string, unknown> = {}) {
  return {
    appUrl: 'https://ns-erp-sit.vercel.app',
    googleSheetsWebhookUrl: '',
    lineAlbumQuality: 90,
    lineAlbumShowBadges: true,
    lineAlbumShowTimestamps: true,
    lineAutoSendWti: false,
    lineAutoSendWto: false,
    lineChannelAccessToken: MASKED_CREDENTIAL,
    lineChannelSecret: MASKED_CREDENTIAL,
    lineDefaultTargetId: '',
    pdfBucket: 'weight-ticket-pdfs',
    ...overrides,
  }
}

function postSettings(overrides: Record<string, unknown> = {}) {
  return POST(new Request('https://ns-erp-sit.vercel.app/api/admin/line-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsPayload(overrides)),
  }))
}

describe('LINE settings credential contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getContext.mockResolvedValue({ appUser: { id: 'admin' } })
    db.findMany.mockResolvedValue([])
    db.upsert.mockResolvedValue({})
    db.transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    db.targetCount.mockResolvedValue(0)
    db.deactivateTargets.mockResolvedValue({ count: 0 })
    db.deactivateRules.mockResolvedValue({ count: 0 })
    line.isMaskedToken.mockImplementation((value: string | null | undefined) => Boolean(value?.includes('••')))
    line.fetchBotInfo.mockResolvedValue({ basicId: '@same', botName: 'Same OA', pictureUrl: null })
    line.syncTargets.mockResolvedValue({ failed: 0, refreshed: 0 })
  })

  it('masks saved LINE credentials, never serializes them, and prevents browser caching', async () => {
    db.findMany.mockResolvedValue([
      { key: 'LINE_CHANNEL_ACCESS_TOKEN', value: 'stored-token' },
      { key: 'LINE_CHANNEL_SECRET', value: 'stored-secret' },
      { key: 'GOOGLE_SHEETS_WEBHOOK_URL', value: 'https://sheets.example.com/webhook' },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body.lineChannelAccessToken).toBe(MASKED_CREDENTIAL)
    expect(body.lineChannelSecret).toBe(MASKED_CREDENTIAL)
    expect(body.googleSheetsWebhookUrl).toBe('https://sheets.example.com/webhook')
    expect(JSON.stringify(body)).not.toContain('stored-token')
    expect(JSON.stringify(body)).not.toContain('stored-secret')
  })

  it('does not overwrite protected credentials when the browser returns their masks', async () => {
    const response = await postSettings()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(db.upsert.mock.calls.map(([call]) => call.where.key)).not.toContain('LINE_CHANNEL_ACCESS_TOKEN')
    expect(db.upsert.mock.calls.map(([call]) => call.where.key)).not.toContain('LINE_CHANNEL_SECRET')
  })

  it('restores the optional Google Sheets webhook setting without changing credential masking', async () => {
    const response = await postSettings({ googleSheetsWebhookUrl: 'https://sheets.example.com/webhook' })

    expect(response.status).toBe(200)
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'GOOGLE_SHEETS_WEBHOOK_URL' },
      create: expect.objectContaining({ value: 'https://sheets.example.com/webhook' }),
    }))
  })

  it('requires explicit confirmation before a different OA can retain prior active targets', async () => {
    db.findMany.mockResolvedValue([
      { key: 'LINE_CHANNEL_ACCESS_TOKEN', value: 'previous-token' },
      { key: 'LINE_BOT_BASIC_ID', value: '@old' },
      { key: 'LINE_BOT_NAME', value: 'Old OA' },
    ])
    db.targetCount.mockResolvedValue(1)
    line.fetchBotInfo.mockResolvedValue({ basicId: '@new', botName: 'New OA', pictureUrl: null })

    const response = await postSettings({ lineChannelAccessToken: 'replacement-token' })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'LINE_BOT_CHANGE_CONFIRMATION_REQUIRED',
      previousBot: { basicId: '@old', name: 'Old OA' },
      nextBot: { basicId: '@new', name: 'New OA' },
    })
    expect(db.upsert).not.toHaveBeenCalled()
    expect(db.deactivateTargets).not.toHaveBeenCalled()
    expect(db.deactivateRules).not.toHaveBeenCalled()
  })

  it('deactivates targets and rules but preserves history after confirmed OA rotation', async () => {
    db.findMany.mockResolvedValue([
      { key: 'LINE_CHANNEL_ACCESS_TOKEN', value: 'previous-token' },
      { key: 'LINE_BOT_BASIC_ID', value: '@old' },
      { key: 'LINE_BOT_NAME', value: 'Old OA' },
    ])
    db.targetCount.mockResolvedValue(2)
    line.fetchBotInfo.mockResolvedValue({ basicId: '@new', botName: 'New OA', pictureUrl: null })

    const response = await postSettings({ confirmBotChange: true, lineChannelAccessToken: 'replacement-token' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      requiresTargetRegistration: true,
    })
    expect(db.deactivateTargets).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ is_active: false, is_default: false, last_event_type: 'oa_changed' }),
    }))
    expect(db.deactivateRules).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ is_active: false }),
    }))
    expect(line.syncTargets).not.toHaveBeenCalled()
  })

  it('keeps targets and rules active when the replacement token belongs to the same OA', async () => {
    db.findMany.mockResolvedValue([
      { key: 'LINE_CHANNEL_ACCESS_TOKEN', value: 'previous-token' },
      { key: 'LINE_BOT_BASIC_ID', value: '@same' },
      { key: 'LINE_BOT_NAME', value: 'Same OA' },
    ])

    const response = await postSettings({ lineChannelAccessToken: 'rotated-token' })

    expect(response.status).toBe(200)
    expect(db.deactivateTargets).not.toHaveBeenCalled()
    expect(db.deactivateRules).not.toHaveBeenCalled()
    expect(line.syncTargets).toHaveBeenCalledWith('rotated-token')
  })
})
