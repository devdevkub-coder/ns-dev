import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'

const impurityNamePattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%/-]+$/u

export const impuritySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean().default(true),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
})

export const impurityListResultSchema = z.object({
  rows: z.array(impuritySchema),
})

export const impurityFormSchema = z.object({
  id: z.string().trim().optional(),
  name: z
    .string({
      required_error: 'กรอกชื่อสิ่งเจือปน',
      invalid_type_error: 'กรอกชื่อสิ่งเจือปน',
    })
    .trim()
    .min(1, 'กรอกชื่อสิ่งเจือปน')
    .max(180, 'ชื่อสิ่งเจือปนยาวเกินไป')
    .regex(impurityNamePattern, 'ชื่อสิ่งเจือปนมีรูปแบบไม่ถูกต้อง'),
  active: z.boolean().default(true),
})

export type Impurity = z.infer<typeof impuritySchema>
export type ImpurityFormValues = z.infer<typeof impurityFormSchema>

export async function listImpurities(): Promise<Impurity[]> {
  const response = await fetch('/api/master-data/impurities', { cache: 'no-store' })
  const result = await readJsonResponse(response, impurityListResultSchema, 'โหลดข้อมูลสิ่งเจือปนไม่ได้')
  return result.rows
}

export async function saveImpurity(values: ImpurityFormValues): Promise<Impurity> {
  const response = await fetch('/api/master-data/impurities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })

  return readJsonResponse(response, impuritySchema, 'บันทึกข้อมูลสิ่งเจือปนไม่ได้')
}

export async function setImpurityActive(impurityId: string, active: boolean): Promise<Impurity> {
  const response = await fetch(`/api/master-data/impurities/${encodeURIComponent(impurityId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  })

  return readJsonResponse(response, impuritySchema, 'อัปเดตสถานะสิ่งเจือปนไม่ได้')
}
