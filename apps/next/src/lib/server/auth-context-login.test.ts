// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  findUnique: vi.fn(),
  getAll: vi.fn(() => []),
  setAll: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: mocks.getAll, set: mocks.setAll })) }))
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    app_users: {
      findUnique: mocks.findUnique,
    },
  },
}))

import { getCurrentLoginContext } from './auth-context'

const authUser = {
  email: 'user@example.com',
  id: 'auth-user-id',
} as Pick<User, 'email' | 'id'>

const appUser = {
  active: true,
  auth_user_id: 'auth-user-id',
  display_name: 'Test User',
  email: 'user@example.com',
  id: 42n,
  must_change_password: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  mocks.createServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
    },
  })
  mocks.findUnique.mockResolvedValue(appUser)
})

describe('getCurrentLoginContext', () => {
  it('loads only login identity fields and reports auth/database timings', async () => {
    const stages: Array<[string, number]> = []

    const context = await getCurrentLoginContext({
      onStage: (stage, durationMs) => stages.push([stage, durationMs]),
    })

    expect(context).toMatchObject({
      appUser: {
        active: true,
        displayName: 'Test User',
        email: 'user@example.com',
        id: 42n,
        mustChangePassword: false,
        username: 'user@example.com',
      },
      authUser,
    })
    expect(mocks.findUnique).toHaveBeenCalledWith({
      select: {
        active: true,
        auth_user_id: true,
        display_name: true,
        email: true,
        id: true,
        must_change_password: true,
      },
      where: { auth_user_id: 'auth-user-id' },
    })
    expect(stages.map(([stage]) => stage)).toEqual(['auth', 'app_user'])
  })

  it('rejects an inactive app user before login completion can write audit data', async () => {
    mocks.findUnique.mockResolvedValue({ ...appUser, active: false })

    await expect(getCurrentLoginContext()).rejects.toMatchObject({
      message: 'บัญชีนี้ถูกปิดใช้งาน',
      status: 403,
    })
  })
})
