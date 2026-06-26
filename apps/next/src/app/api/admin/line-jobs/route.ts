import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { processPendingNotificationJobs, executeNotificationJob } from '@/lib/server/line-notification-jobs'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10)

    const where: any = {}
    if (status) {
      where.status = status
    }
    if (search) {
      where.OR = [
        { document_no: { contains: search } },
        { target_id: { contains: search } },
        { last_error_message: { contains: search } }
      ]
    }

    const total = await prisma.line_notification_jobs.count({ where })
    const jobs = await prisma.line_notification_jobs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        line_notification_attempts: {
          orderBy: { attempt_no: 'desc' }
        }
      }
    })

    const serialized = jobs.map(j => ({
      ...j,
      id: String(j.id),
      source_id: String(j.source_id),
      template_id: j.template_id ? String(j.template_id) : null,
      line_notification_attempts: j.line_notification_attempts.map(a => ({
        ...a,
        id: String(a.id),
        job_id: String(a.job_id)
      }))
    }))

    return NextResponse.json({
      jobs: serialized,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการคิวงานส่งไลน์ไม่สำเร็จ', 500)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json().catch(() => ({}))
    const { action } = body

    if (action === 'process') {
      const result = await processPendingNotificationJobs()
      return NextResponse.json(result)
    }

    return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุ action ที่ถูกต้อง' }, { status: 400 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ประมวลผลคิวงานไม่สำเร็จ', 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    const body = await request.json()
    const { id, action } = body

    if (!id) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุ ID คิวงาน' }, { status: 400 })
    }

    const idBigInt = BigInt(id)

    const job = await prisma.line_notification_jobs.findUnique({
      where: { id: idBigInt }
    })

    if (!job) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการคิวงานที่ต้องการปรับปรุง' }, { status: 404 })
    }

    if (action === 'cancel') {
      const updated = await prisma.line_notification_jobs.update({
        where: { id: idBigInt },
        data: {
          status: 'failed',
          last_error_message: 'งานคิวถูกยกเลิกโดยผู้ดูแลระบบ',
          updated_at: new Date()
        }
      })
      return NextResponse.json({
        ...updated,
        id: String(updated.id),
        source_id: String(updated.source_id)
      })
    }

    if (action === 'retry') {
      // Re-trigger execution immediately
      const result = await executeNotificationJob(id, { force: true })
      if (result.status === 'sent') {
        return NextResponse.json({ ok: true, lineRequestId: result.lineRequestId, pdfUrl: result.pdfUrl })
      } else {
        return NextResponse.json({ code: 'FAILED', error: result.error || 'ส่งแจ้งเตือนซ้ำไม่สำเร็จ' }, { status: 502 })
      }
    }

    return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่ระบุ action' }, { status: 400 })

  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'จัดการคิวงานแจ้งเตือนไม่สำเร็จ', 400)
  }
}
