import { z } from 'zod'

export const thaiProvinceSchema = z.object({
  code: z.string(),
  nameTh: z.string(),
  nameEn: z.string().nullable(),
})

export const thaiDistrictSchema = z.object({
  code: z.string(),
  provinceCode: z.string(),
  nameTh: z.string(),
  nameEn: z.string().nullable(),
  postalCode: z.string().nullable(),
})

export const thaiSubdistrictSchema = z.object({
  code: z.string(),
  districtCode: z.string(),
  provinceCode: z.string(),
  nameTh: z.string(),
  nameEn: z.string().nullable(),
  postalCode: z.string(),
})

export const thaiAddressPayloadSchema = z.object({
  provinces: z.array(thaiProvinceSchema),
  districts: z.array(thaiDistrictSchema),
  subdistricts: z.array(thaiSubdistrictSchema),
})

export type ThaiProvince = z.infer<typeof thaiProvinceSchema>
export type ThaiDistrict = z.infer<typeof thaiDistrictSchema>
export type ThaiSubdistrict = z.infer<typeof thaiSubdistrictSchema>

async function listThaiAddress() {
  const response = await fetch('/api/master-data/thai-address', { cache: 'no-store' })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error ?? 'โหลดข้อมูลที่อยู่ไทยไม่ได้')
  }

  return thaiAddressPayloadSchema.parse(payload)
}

export async function listThaiProvinces(): Promise<ThaiProvince[]> {
  return (await listThaiAddress()).provinces
}

export async function listThaiDistricts(): Promise<ThaiDistrict[]> {
  return (await listThaiAddress()).districts
}

export async function listThaiSubdistricts(): Promise<ThaiSubdistrict[]> {
  return (await listThaiAddress()).subdistricts
}
