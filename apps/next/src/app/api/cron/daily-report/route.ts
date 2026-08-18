import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { getDailyProductionSummary } from '@/lib/server/daily-report-aggregator'
import { buildDailyReportFlexMessage } from '@/lib/server/daily-report-line-flex'
import { resolveLineTargetsForDocument } from '@/lib/server/line-notification-routing'
import { prisma } from '@/lib/server/prisma'
import { sendLinePush } from '@/lib/server/weight-ticket-line-notification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // ถ้าไม่ได้ตั้งค่า secret ใน env ให้รันได้ (เช่น Local / Dev test)
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

async function lineChannelAccessToken() {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
  })
  return setting?.value || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // ตรวจสอบว่าเปิดใช้งานการส่งรายงานประจำวันอัตโนมัติหรือไม่
    const autoSendSetting = await prisma.system_settings.findUnique({
      where: { key: 'DAILY_REPORT_AUTO_SEND' },
      select: { value: true },
    })
    if (autoSendSetting?.value === 'false') {
      return NextResponse.json({
        ok: true,
        skipped: 'disabled_by_settings',
        message: 'การส่งรายงานประจำวันอัตโนมัติถูกปิดไว้ในหน้าตั้งค่า LINE',
      })
    }

    const today = new Date()
    const summary = await getDailyProductionSummary(today)
    const flexMessage = buildDailyReportFlexMessage(summary)

    // ค้นหากลุ่ม LINE ปลายทางตามกฎ DAILY (fallback ไปกลุ่มดีฟอลต์อัตโนมัติ)
    const decisions = await resolveLineTargetsForDocument({ type: 'DAILY' })
    const targetIds = decisions.map((decision) => decision.targetId)

    if (targetIds.length === 0) {
      return NextResponse.json({
        code: 'NO_TARGETS',
        ok: false,
        message: 'ยังไม่ได้ตั้งค่ากลุ่ม LINE เป้าหมาย หรือไม่มีกลุ่มที่เปิดใช้งาน',
      }, { status: 400 })
    }

    const token = await lineChannelAccessToken()
    if (!token) {
      return NextResponse.json({
        code: 'NO_TOKEN',
        ok: false,
        message: 'LINE_CHANNEL_ACCESS_TOKEN not configured in system_settings or env',
      }, { status: 500 })
    }

    const sentResults = []
    for (const targetId of targetIds) {
      try {
        const result = await sendLinePush(targetId, [flexMessage], token, randomUUID())
        sentResults.push({ status: 'sent', targetId, lineRequestId: result.lineRequestId })
      } catch (caught) {
        sentResults.push({ status: 'failed', targetId, error: caught instanceof Error ? caught.message : 'ส่งไม่สำเร็จ' })
      }
    }

    const sentCount = sentResults.filter((result) => result.status === 'sent').length
    if (sentCount === 0) {
      return NextResponse.json({
        code: 'LINE_PUSH_FAILED',
        ok: false,
        error: 'ส่ง LINE สรุปประจำวันไม่สำเร็จ',
        details: sentResults.map((result) => ({ targetId: result.targetId, error: result.error })),
      }, { status: 502 })
    }

    return NextResponse.json({
      code: 'SENT',
      ok: true,
      message: `ส่งสรุปรายงานการผลิตประจำวัน ${summary.dateDisplay} เข้า LINE เรียบร้อย (${sentCount}/${targetIds.length} กลุ่ม)`,
      reportDate: summary.reportDate,
      sentAt: new Date().toISOString(),
      sentResults,
    })
  } catch (caught) {
    return apiErrorResponse(caught, 'ส่ง LINE สรุปประจำวันอัตโนมัติ (Cron) ไม่สำเร็จ', 500)
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
