import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getContext: vi.fn(),
  requirePermission: vi.fn(),
}))

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))

const jobs = vi.hoisted(() => ({
  execute: vi.fn(),
  process: vi.fn(),
}))

vi.mock('@/lib/server/auth-context', () => ({
  AuthContextError: class extends Error {},
  authContextErrorResponse: vi.fn(),
  getCurrentAuthContext: auth.getContext,
  requirePermission: auth.requirePermission,
}))

vi.mock('@/lib/server/prisma', () => ({
  prisma: { line_notification_jobs: { findUnique: db.findUnique } },
}))

vi.mock('@/lib/server/line-notification-jobs', () => ({
  executeNotificationJob: jobs.execute,
  processPendingNotificationJobs: jobs.process,
}))

import { PATCH } from './route'

describe('LINE job retry response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getContext.mockResolvedValue({ appUser: { id: 'admin' } })
    db.findUnique.mockResolvedValue({ id: 7n })
  })

  it('reports an accepted 409 retry as successful instead of returning 502', async () => {
    jobs.execute.mockResolvedValue({
      lineRequestId: 'accepted-request-id',
      pdfUrl: 'https://example.com/ticket.pdf',
      status: 'skipped',
    })

    const response = await PATCH(new Request('https://erp.example.com/api/admin/line-jobs', {
      body: JSON.stringify({ action: 'retry', id: '7' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      deliveryStatus: 'skipped',
      lineRequestId: 'accepted-request-id',
      ok: true,
    })
  })
})
