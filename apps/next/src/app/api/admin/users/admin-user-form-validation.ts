import { z } from 'zod'

export const contactPhoneErrorMessage = 'รูปแบบเบอร์ติดต่อไม่ถูกต้อง: ใช้ตัวเลข 8-15 หลัก และใช้ได้เฉพาะ + ช่องว่าง ขีด หรือวงเล็บ'
export const emailErrorMessage = 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'

export const adminUserEmailSchema = z.string().trim().email(emailErrorMessage)
  .refine((value) => /^[\x00-\x7F]+$/.test(value), emailErrorMessage)

export function isValidAdminUserEmail(value: string) {
  return adminUserEmailSchema.safeParse(value).success
}

export function sanitizeAdminUserEmail(value: string) {
  return value.replace(/[^\x00-\x7F]/g, '')
}

export function isValidContactPhone(value: string) {
  const normalized = value.trim()
  if (!normalized) return true
  if (!/^\+?[0-9][0-9 ()-]*$/.test(normalized)) return false

  const digitCount = normalized.replace(/\D/g, '').length
  return digitCount >= 8 && digitCount <= 15
}
