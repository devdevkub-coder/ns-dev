import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { sendLinePush } from '@/lib/server/weight-ticket-line-notification'
import { resolveLineAccessToken, syncLineTargetsFromAPI } from '@/lib/server/line-target-sync'

export const runtime = 'nodejs'

const targetSchema = z.object({
  targetId: z.string().trim().min(1, 'ระบุ LINE ID'),
  targetType: z.enum(['group', 'room', 'user']),
  displayName: z.string().trim().min(1, 'ระบุชื่อเป้าหมาย'),
  branchCode: z.string().trim().nullable().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notifyWti: z.boolean().default(true),
  notifyWto: z.boolean().default(true),
})

export async function GET() {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const targets = await prisma.line_targets.findMany({
      orderBy: { created_at: 'desc' }
    })

    // Convert BigInt id to string for JSON serialization
    const serialized = targets.map(t => ({
      ...t,
      id: String(t.id)
    }))

    return NextResponse.json(serialized)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการกลุ่มไลน์ไม่สำเร็จ', 500)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json()
    const values = targetSchema.parse(body)

    // Check unique targetId
    const existing = await prisma.line_targets.findUnique({
      where: { target_id: values.targetId }
    })
    if (existing) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: `รหัสผู้รับ ${values.targetId} ถูกลงทะเบียนไว้แล้ว` }, { status: 400 })
    }

    if (values.isDefault) {
      // Clear previous defaults
      await prisma.line_targets.updateMany({
        where: { is_default: true },
        data: { is_default: false }
      })
    }

    const created = await prisma.line_targets.create({
      data: {
        target_id: values.targetId,
        target_type: values.targetType,
        display_name: values.displayName,
        branch_code: values.branchCode || null,
        is_default: values.isDefault,
        is_active: values.isActive,
        notify_wti: values.notifyWti,
        notify_wto: values.notifyWto,
        registered_by: 'admin_dashboard',
      }
    })

    return NextResponse.json({
      ...created,
      id: String(created.id)
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'เพิ่มกลุ่มไลน์ไม่สำเร็จ', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json()
    const { id, action, token: submittedToken, ...fields } = body

    // action=sync ไม่ต้องการ id — ทำงานกับ target ทั้งหมดในระบบ
    if (action === 'sync') {
      const finalToken = await resolveLineAccessToken(submittedToken)
      const result = await syncLineTargetsFromAPI(finalToken)
      return NextResponse.json({ ok: true, ...result })
    }

    if (!id) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุ ID ของเป้าหมาย' }, { status: 400 })
    }

    const idBigInt = BigInt(id)

    const target = await prisma.line_targets.findUnique({
      where: { id: idBigInt }
    })

    if (!target) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบเป้าหมายผู้รับในระบบ' }, { status: 404 })
    }

    if (action === 'delete') {
      await prisma.line_targets.delete({
        where: { id: idBigInt }
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'set-default') {
      await prisma.$transaction([
        prisma.line_targets.updateMany({
          where: { is_default: true },
          data: { is_default: false }
        }),
        prisma.line_targets.update({
          where: { id: idBigInt },
          data: { is_default: true }
        })
      ])
      return NextResponse.json({ ok: true })
    }

    if (action === 'test') {
      const config = await prisma.system_settings.findUnique({
        where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
      })
      const token = config?.value || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
      if (!token) {
        return NextResponse.json({ code: 'CONFIG_INVALID', error: 'กรุณาตั้งค่า LINE Channel Access Token ก่อนทดสอบส่งข้อความ' }, { status: 400 })
      }

      try {
        const textMessage = {
          type: 'text',
          text: `🔌 NS Scrap ERP: ข้อความทดสอบการเชื่อมต่อ\nเป้าหมาย: ${target.display_name}\nเวลาส่ง: ${new Date().toLocaleString('th-TH')}`
        }
        const pushResult = await sendLinePush(target.target_id, [textMessage], token)
        return NextResponse.json({ ok: true, lineRequestId: pushResult.lineRequestId })
      } catch (err: any) {
        return NextResponse.json({ code: 'LINE_API_ERROR', error: err.message }, { status: 502 })
      }
    }

    // Default: update fields
    const parsedFields = targetSchema.partial().parse(fields)
    
    if (parsedFields.isDefault) {
      // Clear previous defaults
      await prisma.line_targets.updateMany({
        where: { is_default: true },
        data: { is_default: false }
      })
    }

    const updated = await prisma.line_targets.update({
      where: { id: idBigInt },
      data: {
        target_id: parsedFields.targetId,
        target_type: parsedFields.targetType,
        display_name: parsedFields.displayName,
        branch_code: parsedFields.branchCode === undefined ? undefined : (parsedFields.branchCode || null),
        is_default: parsedFields.isDefault,
        is_active: parsedFields.isActive,
        notify_wti: parsedFields.notifyWti,
        notify_wto: parsedFields.notifyWto,
        updated_at: new Date()
      }
    })

    return NextResponse.json({
      ...updated,
      id: String(updated.id)
    })

  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ปรับปรุงข้อมูลผู้รับไม่สำเร็จ', 400)
  }
}
