import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getContext: vi.fn(),
  requirePermission: vi.fn(),
}))

const db = vi.hoisted(() => ({
  findTarget: vi.fn(),
  findSetting: vi.fn(),
}))

const line = vi.hoisted(() => ({
  sendPush: vi.fn(),
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

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    line_targets: { findUnique: db.findTarget },
    system_settings: { findUnique: db.findSetting },
  },
}))

vi.mock('@/lib/server/weight-ticket-line-notification', () => ({
  sendLinePush: line.sendPush,
}))

vi.mock('@/lib/server/line-target-sync', () => ({
  resolveLineAccessToken: vi.fn(),
  syncLineTargetsFromAPI: vi.fn(),
}))

import { PATCH } from './route'

function patchTarget(body: Record<string, unknown>) {
  return PATCH(new Request('https://ns-erp-sit.vercel.app/api/admin/line-targets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('LINE target real test-send contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getContext.mockResolvedValue({ appUser: { id: 'admin' } })
    db.findTarget.mockResolvedValue({
      id: 7n,
      target_id: 'C-SELECTED-TARGET',
      target_type: 'group',
      display_name: 'Selected target',
      is_active: true,
    })
    db.findSetting.mockResolvedValue({ value: 'stored-token' })
    line.sendPush.mockResolvedValue({ lineRequestId: 'line-request-id' })
  })

  it('sends only the selected active database target and returns LINE request ID', async () => {
    const response = await patchTarget({ id: '7', action: 'test' })

    expect(response.status).toBe(200)
    expect(line.sendPush).toHaveBeenCalledWith(
      'C-SELECTED-TARGET',
      expect.any(Array),
      'stored-token',
    )
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      lineRequestId: 'line-request-id',
    })
  })

  it('rejects an inactive target before calling LINE', async () => {
    db.findTarget.mockResolvedValue({
      id: 7n,
      target_id: 'C-INACTIVE-TARGET',
      target_type: 'group',
      display_name: 'Inactive target',
      is_active: false,
    })

    const response = await patchTarget({ id: '7', action: 'test' })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'TARGET_INACTIVE' })
    expect(line.sendPush).not.toHaveBeenCalled()
  })
})
