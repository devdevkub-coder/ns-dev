import { describe, expect, it } from 'vitest'
import { currentActor } from './daily'

describe('currentActor', () => {
  it('prefers the application user email', () => {
    expect(currentActor({
      appUser: { email: 'app@example.com' },
      authUser: { email: 'auth@example.com', id: 'auth-id' },
    })).toBe('app@example.com')
  })

  it('uses the authenticated user id when email is unavailable', () => {
    expect(currentActor({
      appUser: { email: null },
      authUser: { email: null, id: 'auth-id' },
    })).toBe('auth-id')
  })

  it('rejects an unidentifiable actor instead of writing a placeholder', () => {
    expect(() => currentActor({
      appUser: { email: null },
      authUser: { email: null, id: '' },
    })).toThrow('ไม่พบผู้ใช้งานสำหรับบันทึกรายการ')
  })
})
