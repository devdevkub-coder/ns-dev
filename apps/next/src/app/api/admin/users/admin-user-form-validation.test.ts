import { describe, expect, it } from 'vitest'
import { isValidAdminUserEmail, isValidContactPhone, sanitizeAdminUserEmail } from './admin-user-form-validation'

describe('admin user contact phone validation', () => {
  it('accepts Thai and international phone formatting', () => {
    expect(isValidContactPhone('081-234-5678')).toBe(true)
    expect(isValidContactPhone('+66 (81) 234 5678')).toBe(true)
  })

  it('rejects letters and invalid digit counts', () => {
    expect(isValidContactPhone('081-ABC-5678')).toBe(false)
    expect(isValidContactPhone('1234567')).toBe(false)
    expect(isValidContactPhone('0812345678901234')).toBe(false)
  })

  it('allows an empty optional phone number', () => {
    expect(isValidContactPhone('   ')).toBe(true)
  })

})

describe('admin user email validation', () => {
  it('accepts a valid email and rejects incomplete addresses', () => {
    expect(isValidAdminUserEmail('person@example.com')).toBe(true)
    expect(isValidAdminUserEmail('person@')).toBe(false)
    expect(isValidAdminUserEmail('person.example.com')).toBe(false)
    expect(isValidAdminUserEmail('ทดสอบ@example.com')).toBe(false)
  })

  it('removes non-ASCII characters while typing or pasting', () => {
    expect(sanitizeAdminUserEmail('testทดสอบ@example.com')).toBe('test@example.com')
  })
})
