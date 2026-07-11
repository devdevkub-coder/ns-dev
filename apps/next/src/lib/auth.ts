import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอก password'),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง'),
})

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

const passwordSyntaxSchema = z.string()
  .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
  .regex(/[A-Z]/, 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว')
  .regex(/[a-z]/, 'รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว')
  .regex(/[0-9]/, 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว')

export const resetPasswordSchema = z.object({
  password: passwordSyntaxSchema,
  confirmPassword: z.string().min(1, 'กรุณายืนยันรหัสผ่าน'),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน',
  path: ['confirmPassword'],
})

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'กรุณากรอก password เดิม'),
  password: passwordSyntaxSchema,
  confirmPassword: z.string().min(1, 'กรุณายืนยันรหัสผ่าน'),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน',
  path: ['confirmPassword'],
}).refine((values) => values.password !== values.currentPassword, {
  message: 'Password ใหม่ต้องไม่เหมือนเดิม',
  path: ['password'],
})

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>

export const userProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'กรุณากรอกชื่อแสดงผล (Display Name)'),
})

export type UserProfileFormData = z.infer<typeof userProfileSchema>
