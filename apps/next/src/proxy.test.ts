import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { isPublicPath, proxy } from './proxy'

describe('proxy auth boundary', () => {
  it('lets login completion perform its own verified auth-context lookup', () => {
    expect(isPublicPath('/api/auth/login-complete')).toBe(true)
  })

  it('short-circuits login completion before the global auth pass', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/auth/login-complete'))

    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not make protected application APIs public', () => {
    expect(isPublicPath('/api/auth/login-complete/anything')).toBe(false)
    expect(isPublicPath('/api/auth/password-changed')).toBe(false)
    expect(isPublicPath('/api/auth/me')).toBe(false)
    expect(isPublicPath('/api/purchase-bills')).toBe(false)
  })
})
