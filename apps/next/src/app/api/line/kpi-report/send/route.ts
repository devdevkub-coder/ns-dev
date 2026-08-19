import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requireAnyPermission } from '@/lib/server/auth-context'
import { resolveLineTargetsForDocument } from '@/lib/server/line-notification-routing'
import { prisma } from '@/lib/server/prisma'
import { sendLinePush } from '@/lib/server/weight-ticket-line-notification'
import { buildKpiEvaluationFlexMessage } from '@/lib/server/kpi-evaluation-line-flex'
import type { KpiReportData } from '@/lib/server/kpi-evaluation-line-flex'

export const runtime = 'nodejs'

const sendSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)').optional(),
})

async function lineChannelAccessToken() {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
  })
  return setting?.value || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requireAnyPermission(auth, [
      'system.manage',
      'system.settings.view',
      'daily.weight_tickets.share',
      'production.manage',
      'daily.weight_tickets.edit',
    ])

    const body = sendSchema.parse(await request.json().catch(() => ({})))
    const targetDateStr = body.date || new Date().toISOString().split('T')[0]
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`)

    const evaluations = await prisma.warehouse_kpi_evaluations.findMany({
      where: { eval_date: targetDate },
    })

    if (evaluations.length === 0) {
      return NextResponse.json({ code: 'NO_DATA', error: 'ไม่พบข้อมูลประเมินของวันที่ระบุ' }, { status: 400 })
    }

    const overallAvg = evaluations.reduce((sum, ev) => sum + Number(ev.avg_score), 0) / evaluations.length

    const kpiData: KpiReportData = {
      dateDisplay: targetDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
      overallAvg: Number(overallAvg.toFixed(1)),
      evaluations: evaluations.map(ev => ({
        warehouseCode: ev.warehouse_code,
        warehouseName: ev.warehouse_name,
        accuracy: ev.accuracy,
        speed: ev.speed,
        targetHit: ev.target_hit,
        avgScore: Number(ev.avg_score),
        problems: ev.problems || '',
        solutions: ev.solutions || '',
        evaluatedBy: ev.evaluated_by || '',
      }))
    }

    const flexMessage = buildKpiEvaluationFlexMessage(kpiData)

    const decisions = await resolveLineTargetsForDocument({ type: 'DAILY' })
    const targetIds = decisions.map((decision) => decision.targetId)
    if (targetIds.length === 0) {
      return NextResponse.json({ code: 'NO_TARGETS', error: 'ยังไม่ได้ตั้งค่ากลุ่ม LINE เป้าหมาย' }, { status: 400 })
    }

    const token = await lineChannelAccessToken()
    const sentResults = await Promise.all(
      targetIds.map(async (targetId) => {
        try {
          const result = await sendLinePush(targetId, [flexMessage], token, randomUUID())
          return { status: 'sent' as const, targetId, lineRequestId: result.lineRequestId }
        } catch (caught) {
          return { status: 'failed' as const, targetId, error: caught instanceof Error ? caught.message : 'ส่งไม่สำเร็จ' }
        }
      })
    )

    const sentCount = sentResults.filter((result) => result.status === 'sent').length
    if (sentCount === 0) {
      return NextResponse.json({
        code: 'LINE_PUSH_FAILED',
        error: 'ส่ง LINE สรุป KPI ประจำวันไม่สำเร็จ',
        details: sentResults.map((result) => ({ targetId: result.targetId, error: result.error })),
      }, { status: 502 })
    }

    return NextResponse.json({
      code: 'SENT',
      message: `ส่งสรุป KPI ประจำวัน ${kpiData.dateDisplay} เข้า LINE เรียบร้อย (${sentCount}/${targetIds.length} กลุ่ม)`,
      sentResults,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ส่ง LINE สรุป KPI ประจำวันไม่สำเร็จ', 500)
  }
}
