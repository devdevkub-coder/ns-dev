import { describe, expect, it, vi } from 'vitest'

import { completeBrowserLoginSession } from './auth-client-contract'

describe('browser login completion contract', () => {
  it('accepts only a successful response with the expected login contract', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ lastLoginAt: '2026-07-19T00:00:00.000Z' }))
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({ fetchImpl, signOut })).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/login-complete', {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    })
    expect(signOut).not.toHaveBeenCalled()
  })

  it.each([
    ['an auth failure', new Response(JSON.stringify({ error: 'provider detail' }), { status: 401 }), 'Session เข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่'],
    ['a forbidden response', new Response(JSON.stringify({ error: 'provider detail' }), { status: 403 }), 'ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่'],
    ['an invalid success payload', Response.json({}), 'ตรวจสอบบัญชีผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่'],
  ])('signs out and hides server text for %s', async (_label, response, message) => {
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({
      fetchImpl: vi.fn().mockResolvedValue(response),
      signOut,
    })).resolves.toEqual({ ok: false, message })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out and shows a network-safe message for transport failure', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)

    await expect(completeBrowserLoginSession({
      fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
      signOut,
    })).resolves.toEqual({ ok: false, message: 'เชื่อมต่อระบบเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่' })
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
