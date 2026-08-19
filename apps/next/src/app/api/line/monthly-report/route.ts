import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { getMonthlyProductionSummary } from '@/lib/server/monthly-report-aggregator'
import { buildMonthlyReportFlexMessage } from '@/lib/server/monthly-report-line-flex'
import { resolveLineTargetsForDocument } from '@/lib/server/line-notification-routing'
import { prisma } from '@/lib/server/prisma'
import { sendLinePush } from '@/lib/server/weight-ticket-line-notification'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const targetDate = body.date ? new Date(body.date) : new Date()

    const summary = await getMonthlyProductionSummary(targetDate)
    const flexMessage = buildMonthlyReportFlexMessage(summary)

    let targetIds: string[] = []
    if (body.targetId) {
      targetIds = [body.targetId]
    } else {
      let decisions = await resolveLineTargetsForDocument({ type: 'MONTHLY' })
      if (decisions.length === 0) {
        decisions = await resolveLineTargetsForDocument({ type: 'DAILY' })
      }
      targetIds = [...new Set(decisions.map((d) => d.targetId))]
    }

    if (targetIds.length === 0) {
      return NextResponse.json({
        code: 'NO_TARGETS',
        ok: false,
        message: 'ยังไม่ได้ตั้งค่ากลุ่ม LINE เป้าหมาย หรือไม่มีกลุ่มที่เปิดใช้งาน',
      }, { status: 400 })
    }

    const setting = await prisma.system_settings.findUnique({
      select: { value: true },
      where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
    })
    const token = setting?.value || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    if (!token) {
      return NextResponse.json({
        code: 'NO_TOKEN',
        ok: false,
        message: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token',
      }, { status: 400 })
    }

    const results = []
    for (const targetId of targetIds) {
      const idempotencyKey = randomUUID()
      const pushResult = await sendLinePush(targetId, [flexMessage], token, idempotencyKey)
      results.push({
        lineRequestId: pushResult.lineRequestId,
        targetId,
      })
    }

    return NextResponse.json({
      message: `ส่งสรุปประจำเดือน ${summary.monthDisplay} เข้า LINE เรียบร้อยแล้ว (${results.length} กลุ่ม)`,
      month: summary.reportMonth,
      monthDisplay: summary.monthDisplay,
      ok: true,
      results,
      summary: {
        activeDays: summary.activeDaysCount,
        baleCount: summary.baleTotalCount,
        baleKg: summary.baleTotalKg,
        loadKg: summary.loadTotalKg,
        receiveKg: summary.receiveTotalKg,
        sortKg: summary.sortTotalKg,
      },
    })
  } catch (error) {
    return apiErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งสรุปประจำเดือนเข้า LINE', 500)
  }
}
