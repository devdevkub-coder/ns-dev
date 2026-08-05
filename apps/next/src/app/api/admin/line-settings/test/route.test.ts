import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  context: { appUser: { displayName: 'LINE Admin' } },
  getContext: vi.fn(),
  requirePermission: vi.fn(),
}))

const settings = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))

const line = vi.hoisted(() => ({
  notify: vi.fn(),
}))

const weightTickets = vi.hoisted(() => ({
  branchScopeIds: vi.fn(),
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

vi.mock('@/lib/server/weight-ticket-line-notification', () => ({
  notifyWeightTicketLine: line.notify,
  sendLinePush: vi.fn(),
}))

vi.mock('@/lib/server/daily', () => ({
  currentActor: vi.fn(() => 'LINE Admin'),
}))

vi.mock('@/lib/server/weight-tickets', () => ({
  branchScopeIds: weightTickets.branchScopeIds,
}))

import { POST } from './route'

describe('LINE settings document test send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getContext.mockResolvedValue(auth.context)
    settings.findUnique.mockResolvedValue({ value: 'stored-token' })
    weightTickets.branchScopeIds.mockReturnValue(['01'])
    line.notify.mockResolvedValue({ status: 200 })
  })

  it('preserves the authenticated branch scope when loading a weight ticket', async () => {
    const response = await POST(new Request('https://erp.example.com/api/admin/line-settings/test', {
      body: JSON.stringify({ documentNo: 'WTI012608-0021', targetId: 'C-LINE' }),
      headers: { 'Content-Type': 'application/json', Origin: 'https://erp.example.com' },
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(weightTickets.branchScopeIds).toHaveBeenCalledWith(auth.context)
    expect(line.notify).toHaveBeenCalledWith('WTI012608-0021', expect.objectContaining({
      scopedBranchIds: ['01'],
      targetId: 'C-LINE',
    }))
  })
})
