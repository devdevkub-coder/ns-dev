import { NextResponse } from 'next/server'
import { companyProfileSchema } from '@/lib/company-profile'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function companyProfileJson(row: {
  address: string
  bank_info: string | null
  branch_code: string | null
  email: string | null
  fax: string | null
  footer_note: string | null
  logo_url: string | null
  name: string
  name_en: string | null
  phone: string
  tax_id: string | null
  website: string | null
}) {
  return {
    address: row.address,
    bankInfo: row.bank_info,
    branchCode: row.branch_code ?? '00000',
    email: row.email,
    fax: row.fax,
    footerNote: row.footer_note,
    logoUrl: row.logo_url,
    name: row.name,
    nameEn: row.name_en,
    phone: row.phone,
    taxId: row.tax_id,
    website: row.website,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const row = await prisma.company_profiles.findFirst({
      orderBy: { id: 'asc' },
    })

    if (!row) {
      return NextResponse.json({
        profile: {
          address: 'กรุณาแก้ไขที่ Setup → ข้อมูลบริษัท',
          bankInfo: null,
          branchCode: '00000',
          email: null,
          fax: null,
          footerNote: 'ขอขอบคุณที่ใช้บริการ',
          logoUrl: null,
          name: 'บริษัท นิวโซลูชั่นส์ (ไทยแลนด์) จำกัด',
          nameEn: 'New Solutions (Thailand) Co., Ltd.',
          phone: '-',
          taxId: null,
          website: null,
        },
      })
    }

    return NextResponse.json({ profile: companyProfileJson(row) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลบริษัทไม่สำเร็จ', 500)
  }
}

export async function PUT(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const values = companyProfileSchema.parse(await request.json())
    const actor = currentActor(context)
    const existing = await prisma.company_profiles.findFirst({
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    const row = existing
      ? await prisma.company_profiles.update({
          data: {
            address: values.address,
            bank_info: values.bankInfo,
            branch_code: values.branchCode,
            email: values.email,
            fax: values.fax,
            footer_note: values.footerNote,
            logo_url: values.logoUrl,
            name: values.name,
            name_en: values.nameEn,
            phone: values.phone,
            tax_id: values.taxId,
            updated_by: actor,
            website: values.website,
          },
          where: { id: existing.id },
        })
      : await prisma.company_profiles.create({
          data: {
            address: values.address,
            bank_info: values.bankInfo,
            branch_code: values.branchCode,
            email: values.email,
            fax: values.fax,
            footer_note: values.footerNote,
            logo_url: values.logoUrl,
            name: values.name,
            name_en: values.nameEn,
            phone: values.phone,
            tax_id: values.taxId,
            updated_by: actor,
            website: values.website,
          },
        })

    return NextResponse.json({ profile: companyProfileJson(row) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลบริษัทไม่สำเร็จ', 400)
  }
}
