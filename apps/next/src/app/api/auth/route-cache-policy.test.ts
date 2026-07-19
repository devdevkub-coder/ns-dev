import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  authContextErrorResponse: vi.fn((error: unknown) => Response.json({ error: error instanceof Error ? error.message : 'failed' }, { status: 500 })),
  findUnique: vi.fn(),
  getCurrentAuthContext: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  recordAuthAuditEvent: vi.fn(),
  serializeAuthContext: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/server/auth-audit', () => ({ recordAuthAuditEvent: mocks.recordAuthAuditEvent }))
vi.mock('@/lib/server/auth-context', () => ({
  authContextErrorResponse: mocks.authContextErrorResponse,
  getCurrentAuthContext: mocks.getCurrentAuthContext,
  getSupabaseServerClient: mocks.getSupabaseServerClient,
  serializeAuthContext: mocks.serializeAuthContext,
}))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    app_users: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}))

import { GET as getMe } from './me/route'
import { POST as postLoginComplete } from './login-complete/route'
import { POST as postPasswordChanged } from './password-changed/route'

const context = {
  appUser: { id: 42n },
  authUser: { email: 'user@example.com', id: 'auth-user-id' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentAuthContext.mockResolvedValue(context)
  mocks.serializeAuthContext.mockReturnValue({ id: '42' })
  mocks.update.mockResolvedValue({})
  mocks.recordAuthAuditEvent.mockResolvedValue(undefined)
  mocks.findUnique.mockResolvedValue({
    account_status: 'active',
    email: 'user@example.com',
    id: 42n,
    must_change_password: true,
  })
  mocks.getSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'user@example.com', id: 'auth-user-id' } }, error: null }) },
  })
})

describe('auth route cache policy', () => {
  it('marks GET /api/auth/me as private no-store on success', async () => {
    const response = await getMe()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('marks POST /api/auth/login-complete as private no-store on success', async () => {
    const response = await postLoginComplete(new Request('http://localhost/api/auth/login-complete', { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('marks POST /api/auth/password-changed as private no-store without changing its payload contract', async () => {
    const response = await postPasswordChanged(new Request('http://localhost/api/auth/password-changed', { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({ activated: false, cleared: true })
  })
})
