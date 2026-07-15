import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '../../../../../generated/prisma/client'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { lineRuleConditionsValidationError, resolveLineTargetsForWeightTicket } from '@/lib/server/line-notification-routing'
import { findScopedWeightTicket, getWeightTicketUsageCounts, mapWeightTicketRow, type WeightTicketRow } from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const lineDocumentTypeSchema = z.enum(['WTI', 'WTO', 'PB', 'SB', 'PMT', 'RCP'])
const lineRuleConditionsSchema = z.object({
  documentTypes: z.array(lineDocumentTypeSchema).min(1, 'เลือกเอกสารอย่างน้อย 1 ประเภท').max(6),
  branchCodes: z.array(z.string().trim().min(1)).max(100).optional(),
  minNetWeight: z.number().finite().nonnegative().nullable().optional(),
  maxNetWeight: z.number().finite().nonnegative().nullable().optional(),
  minImpurityWeight: z.number().finite().nonnegative().nullable().optional(),
  requiresImages: z.boolean().optional(),
  requiresScalePhoto: z.boolean().optional(),
}).passthrough().superRefine((conditions, context) => {
  const error = lineRuleConditionsValidationError(conditions)
  if (error) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['documentTypes'] })
  }
})

const ruleSchema = z.object({
  name: z.string().trim().min(1, 'ระบุชื่อกฎ'),
  description: z.string().trim().nullable().optional(),
  priority: z.number().int().min(0).default(100),
  isActive: z.boolean().default(true),
  targetId: z.string().trim().min(1, 'ระบุ LINE ID ผู้รับ'),
  templateId: z.number().nullable().optional(),
  stopAfterMatch: z.boolean().default(false),
  conditions: lineRuleConditionsSchema,
})

async function validateRuleReferences(values: { targetId?: string; conditions?: z.infer<typeof lineRuleConditionsSchema> }) {
  if (values.targetId) {
    const target = await prisma.line_targets.findFirst({
      where: { target_id: values.targetId, target_type: 'group', is_active: true },
      select: { id: true },
    })
    if (!target) return 'กรุณาเลือกกลุ่ม LINE ที่เปิดใช้งานอยู่'
  }

  const branchCodes = [...new Set(values.conditions?.branchCodes ?? [])]
  if (branchCodes.length > 0) {
    const activeBranchCount = await prisma.branches.count({
      where: { active: true, code: { in: branchCodes } },
    })
    if (activeBranchCount !== branchCodes.length) return 'มีสาขาที่ไม่ถูกต้องหรือปิดใช้งานอยู่'
  }

  return null
}

export async function GET() {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const rules = await prisma.line_notification_rules.findMany({
      orderBy: { priority: 'asc' }
    })

    const serialized = rules.map(r => ({
      ...r,
      id: String(r.id),
      template_id: r.template_id ? String(r.template_id) : null
    }))

    return NextResponse.json(serialized)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการกฎส่งแจ้งเตือนไม่สำเร็จ', 500)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json()
    const values = ruleSchema.parse(body)
    const referenceError = await validateRuleReferences(values)
    if (referenceError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: referenceError }, { status: 400 })
    }

    const created = await prisma.line_notification_rules.create({
      data: {
        name: values.name,
        description: values.description || null,
        priority: values.priority,
        is_active: values.isActive,
        target_id: values.targetId,
        template_id: values.templateId ? BigInt(values.templateId) : null,
        stop_after_match: values.stopAfterMatch,
        conditions: values.conditions as Prisma.InputJsonValue,
        created_by: auth.appUser?.email || 'admin'
      }
    })

    return NextResponse.json({
      ...created,
      id: String(created.id),
      template_id: created.template_id ? String(created.template_id) : null
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'สร้างกฎไม่สำเร็จ', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json()
    const { id, action, ...fields } = body

    if (action === 'simulate') {
      const { documentNo } = body
      if (!documentNo) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุเลขที่เอกสารสำหรับทดสอบ' }, { status: 400 })
      }
      const ticket = await findScopedWeightTicket(documentNo, [])
      if (!ticket) {
        return NextResponse.json({ code: 'NOT_FOUND', error: `ไม่พบเอกสารใบชั่งเลขที่ ${documentNo}` }, { status: 404 })
      }
      const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
      const mapped = mapWeightTicketRow(ticket as WeightTicketRow, usage)
      const decisions = await resolveLineTargetsForWeightTicket(mapped)
      return NextResponse.json(decisions)
    }

    if (!id) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุ ID ของกฎ' }, { status: 400 })
    }

    const idBigInt = BigInt(id)

    if (action === 'delete') {
      await prisma.line_notification_rules.delete({
        where: { id: idBigInt }
      })
      return NextResponse.json({ ok: true })
    }

    // Default: update
    const parsedFields = ruleSchema.partial().parse(fields)
    const referenceError = await validateRuleReferences(parsedFields)
    if (referenceError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: referenceError }, { status: 400 })
    }

    const updated = await prisma.line_notification_rules.update({
      where: { id: idBigInt },
      data: {
        name: parsedFields.name,
        description: parsedFields.description === undefined ? undefined : (parsedFields.description || null),
        priority: parsedFields.priority,
        is_active: parsedFields.isActive,
        target_id: parsedFields.targetId,
        template_id: parsedFields.templateId === undefined ? undefined : (parsedFields.templateId ? BigInt(parsedFields.templateId) : null),
        stop_after_match: parsedFields.stopAfterMatch,
        conditions: parsedFields.conditions as Prisma.InputJsonValue | undefined,
        updated_by: auth.appUser?.email || 'admin',
        updated_at: new Date()
      }
    })

    return NextResponse.json({
      ...updated,
      id: String(updated.id),
      template_id: updated.template_id ? String(updated.template_id) : null
    })

  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ปรับปรุงกฎไม่สำเร็จ', 400)
  }
}
