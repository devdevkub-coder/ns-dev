import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const [provinces, districts, subdistricts] = await Promise.all([
      prisma.thai_provinces.findMany({
        orderBy: {
          name_th: 'asc',
        },
      }),
      prisma.thai_districts.findMany({
        orderBy: {
          name_th: 'asc',
        },
      }),
      prisma.thai_subdistricts.findMany({
        orderBy: {
          name_th: 'asc',
        },
      }),
    ])

    return NextResponse.json({
      provinces: provinces.map((province) => ({
        code: province.province_code,
        nameTh: province.name_th,
        nameEn: province.name_en,
      })),
      districts: districts.map((district) => ({
        code: district.district_code,
        provinceCode: district.province_code,
        nameTh: district.name_th,
        nameEn: district.name_en,
        postalCode: district.postal_code,
      })),
      subdistricts: subdistricts.map((subdistrict) => ({
        code: subdistrict.subdistrict_code,
        districtCode: subdistrict.district_code,
        provinceCode: subdistrict.province_code,
        nameTh: subdistrict.name_th,
        nameEn: subdistrict.name_en,
        postalCode: subdistrict.postal_code,
      })),
    })
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'โหลดข้อมูลที่อยู่ไทยไม่ได้' }, { status: 500 })
  }
}
