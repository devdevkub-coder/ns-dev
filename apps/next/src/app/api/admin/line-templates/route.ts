import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { buildFlexMessageFromTemplate } from '@/lib/server/line-notification-routing'
import { findScopedWeightTicket, getWeightTicketUsageCounts, mapWeightTicketRow, type WeightTicketRow } from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const templateSchema = z.object({
  name: z.string().trim().min(1, 'ระบุชื่อเทมเพลต'),
  templateType: z.string().default('weight_ticket'),
  isDefaultWti: z.boolean().default(false),
  isDefaultWto: z.boolean().default(false),
  isActive: z.boolean().default(true),
  config: z.record(z.any()), // JSON config for layout, fields, themes
})

export async function GET() {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const templates = await prisma.line_message_templates.findMany({
      orderBy: { created_at: 'desc' }
    })

    const serialized = templates.map(t => ({
      ...t,
      id: String(t.id)
    }))

    return NextResponse.json(serialized)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการเทมเพลตไม่สำเร็จ', 500)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json()
    const values = templateSchema.parse(body)

    if (values.isDefaultWti) {
      await prisma.line_message_templates.updateMany({
        where: { is_default_wti: true },
        data: { is_default_wti: false }
      })
    }
    if (values.isDefaultWto) {
      await prisma.line_message_templates.updateMany({
        where: { is_default_wto: true },
        data: { is_default_wto: false }
      })
    }

    const created = await prisma.line_message_templates.create({
      data: {
        name: values.name,
        template_type: values.templateType,
        is_default_wti: values.isDefaultWti,
        is_default_wto: values.isDefaultWto,
        is_active: values.isActive,
        config: values.config,
        created_by: auth.appUser?.email || 'admin'
      }
    })

    return NextResponse.json({
      ...created,
      id: String(created.id)
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'สร้างเทมเพลตไม่สำเร็จ', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json()
    const { id, action, ...fields } = body

    if (action === 'validate') {
      const { config } = body
      if (!config || typeof config !== 'object') {
        return NextResponse.json({ isValid: false, error: 'JSON config ไม่ถูกต้อง' })
      }
      // Simple format check
      const hasLayout = 'layout' in config
      const hasFields = 'fields' in config && Array.isArray(config.fields)
      if (!hasLayout || !hasFields) {
        return NextResponse.json({ isValid: false, error: 'โครงสร้างเทมเพลตต้องประกอบด้วย layout และ fields' })
      }
      return NextResponse.json({ isValid: true })
    }

    if (action === 'preview') {
      const { config, documentNo } = body
      if (!documentNo) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุเลขที่เอกสาร' }, { status: 400 })
      }
      const ticket = await findScopedWeightTicket(documentNo, [])
      if (!ticket) {
        return NextResponse.json({ code: 'NOT_FOUND', error: `ไม่พบเอกสารใบชั่งเลขที่ ${documentNo}` }, { status: 404 })
      }
      const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
      const mapped = mapWeightTicketRow(ticket as WeightTicketRow, usage)
      
      const dummyPdfUrl = 'https://nserp-dummy-pdf.s3.amazonaws.com/ticket.pdf'
      const dummyDetailUrl = 'http://localhost:3000/daily/weight-ticket-list/' + documentNo
      const flexMsg = buildFlexMessageFromTemplate(mapped, config || {}, dummyPdfUrl, dummyDetailUrl)

      return NextResponse.json({ flexMsg })
    }

    if (!id) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุ ID ของเทมเพลต' }, { status: 400 })
    }

    const idBigInt = BigInt(id)

    if (action === 'delete') {
      await prisma.line_message_templates.delete({
        where: { id: idBigInt }
      })
      return NextResponse.json({ ok: true })
    }

    // Default: update fields
    const parsedFields = templateSchema.partial().parse(fields)

    if (parsedFields.isDefaultWti) {
      await prisma.line_message_templates.updateMany({
        where: { is_default_wti: true },
        data: { is_default_wti: false }
      })
    }
    if (parsedFields.isDefaultWto) {
      await prisma.line_message_templates.updateMany({
        where: { is_default_wto: true },
        data: { is_default_wto: false }
      })
    }

    const updated = await prisma.line_message_templates.update({
      where: { id: idBigInt },
      data: {
        name: parsedFields.name,
        template_type: parsedFields.templateType,
        is_default_wti: parsedFields.isDefaultWti,
        is_default_wto: parsedFields.isDefaultWto,
        is_active: parsedFields.isActive,
        config: parsedFields.config,
        updated_by: auth.appUser?.email || 'admin',
        updated_at: new Date()
      }
    })

    return NextResponse.json({
      ...updated,
      id: String(updated.id)
    })

  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ปรับปรุงเทมเพลตไม่สำเร็จ', 400)
  }
}
