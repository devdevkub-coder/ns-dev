import { describe, expect, it, vi } from 'vitest'

import {
  acknowledgePasswordChanged,
  completeBrowserLoginSession,
  PASSWORD_CHANGE_ACKNOWLEDGEMENT_ERROR,
} from './auth-client-contract'

describe('browser login completion contract', () => {
  it('accepts only a successful response with the expected login contract', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ authUserId: 'auth-user-id', lastLoginAt: '2026-07-19T00:00:00.000Z' }))
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({ expectedAuthUserId: 'auth-user-id', fetchImpl, signOut })).resolves.toEqual({
      lastLoginAt: '2026-07-19T00:00:00.000Z',
      ok: true,
    })
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/login-complete', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('does not rebind the browser fetch receiver during login completion', async () => {
    let receiver: unknown = 'not called'
    const fetchImpl = function (this: unknown) {
      receiver = this
      return Promise.resolve(Response.json({ authUserId: 'auth-user-id', lastLoginAt: '2026-07-19T00:00:00.000Z' }))
    } as typeof fetch

    await expect(completeBrowserLoginSession({
      expectedAuthUserId: 'auth-user-id',
      fetchImpl,
      signOut: vi.fn().mockResolvedValue(undefined),
    })).resolves.toEqual({ lastLoginAt: '2026-07-19T00:00:00.000Z', ok: true })
    expect(receiver).toBeUndefined()
  })

  it.each([
    ['an auth failure', new Response(JSON.stringify({ error: 'provider detail' }), { status: 401 }), 'Session เข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่'],
    ['a forbidden response', new Response(JSON.stringify({ error: 'provider detail' }), { status: 403 }), 'ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่'],
    ['an invalid success payload', Response.json({}), 'ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่'],
  ])('signs out and hides server text for %s', async (_label, response, message) => {
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({
      expectedAuthUserId: 'auth-user-id',
      fetchImpl: vi.fn().mockResolvedValue(response),
      signOut,
    })).resolves.toEqual({ ok: false, message })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('keeps the local session on a transient server failure', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({
      expectedAuthUserId: 'auth-user-id',
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'timeout' }), { status: 503 })),
      signOut,
    })).resolves.toEqual({ ok: false, message: 'ระบบกำลังตอบสนองช้า กรุณากดเข้าสู่ระบบอีกครั้ง' })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('keeps the local session on a transport failure', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({
      expectedAuthUserId: 'auth-user-id',
      fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
      signOut,
    })).resolves.toEqual({ ok: false, message: 'ระบบกำลังตอบสนองช้า กรุณากดเข้าสู่ระบบอีกครั้ง' })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('rejects a successful response bound to a different auth user', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({
      expectedAuthUserId: 'expected-user-id',
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ authUserId: 'different-user-id', lastLoginAt: '2026-07-19T00:00:00.000Z' })),
      signOut,
    })).resolves.toEqual({ ok: false, message: 'Session เข้าสู่ระบบไม่ตรงกับบัญชีที่เลือก กรุณาลองใหม่' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})

describe('password-changed acknowledgement contract', () => {
  it('accepts only a successful cleared acknowledgement', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ cleared: true }))

    await expect(acknowledgePasswordChanged({ fetchImpl })).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/password-changed', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    })
  })

  it('does not rebind the browser fetch receiver during password acknowledgement', async () => {
    let receiver: unknown = 'not called'
    const fetchImpl = function (this: unknown) {
      receiver = this
      return Promise.resolve(Response.json({ cleared: true }))
    } as typeof fetch

    await expect(acknowledgePasswordChanged({ fetchImpl })).resolves.toEqual({ ok: true })
    expect(receiver).toBeUndefined()
  })

  it.each([
    new Response(JSON.stringify({ cleared: false }), { status: 200 }),
    new Response(JSON.stringify({ error: 'provider detail' }), { status: 403 }),
    Response.json({}),
  ])('does not accept an invalid acknowledgement response', async (response) => {
    await expect(acknowledgePasswordChanged({
      fetchImpl: vi.fn().mockResolvedValue(response),
    })).resolves.toEqual({ ok: false, message: PASSWORD_CHANGE_ACKNOWLEDGEMENT_ERROR })
  })

  it('returns stable copy on acknowledgement transport failure', async () => {
    await expect(acknowledgePasswordChanged({
      fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
    })).resolves.toEqual({ ok: false, message: PASSWORD_CHANGE_ACKNOWLEDGEMENT_ERROR })
  })
})
