import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  findSetting: vi.fn(),
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    system_settings: { findUnique: db.findSetting },
  },
}))

import { syncWeightTicketToGoogleSheets } from './google-sheets-sync'

const ticket = {
  branchName: 'สำนักงานใหญ่',
  createdAt: '2026-08-06T00:00:00.000Z',
  documentDate: '2026-08-06',
  documentNo: 'WTI2608-0001',
  partyName: 'ผู้ขายทดสอบ',
  totals: { deductionWeight: 10, grossWeight: 100, netWeight: 90 },
  type: 'WTI',
} as Parameters<typeof syncWeightTicketToGoogleSheets>[1]

describe('Google Sheets weight-ticket sync settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('treats a blank saved setting as disabled even when an environment fallback exists', async () => {
    db.findSetting.mockResolvedValue({ value: null })
    vi.stubEnv('GOOGLE_SHEETS_WEBHOOK_URL', 'https://env.example.com/webhook')

    await syncWeightTicketToGoogleSheets('create', ticket)

    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the environment fallback only when the database setting has never been saved', async () => {
    db.findSetting.mockResolvedValue(null)
    vi.stubEnv('GOOGLE_SHEETS_WEBHOOK_URL', 'https://env.example.com/webhook')

    await syncWeightTicketToGoogleSheets('create', ticket)

    expect(fetch).toHaveBeenCalledWith(
      'https://env.example.com/webhook',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('prefers the saved database URL over the environment fallback', async () => {
    db.findSetting.mockResolvedValue({ value: 'https://db.example.com/webhook' })
    vi.stubEnv('GOOGLE_SHEETS_WEBHOOK_URL', 'https://env.example.com/webhook')

    await syncWeightTicketToGoogleSheets('update', ticket)

    expect(fetch).toHaveBeenCalledWith(
      'https://db.example.com/webhook',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('keeps ERP processing successful when the webhook request fails', async () => {
    db.findSetting.mockResolvedValue({ value: 'https://db.example.com/webhook' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(syncWeightTicketToGoogleSheets('create', ticket)).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()
  })
})
