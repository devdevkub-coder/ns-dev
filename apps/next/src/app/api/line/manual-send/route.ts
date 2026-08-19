import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getDailyProductionSummary } from '@/lib/server/daily-report-aggregator'
import { buildDailyReportFlexMessage } from '@/lib/server/daily-report-line-flex'
import { getMonthlyProductionSummary } from '@/lib/server/monthly-report-aggregator'
import { buildMonthlyReportFlexMessage } from '@/lib/server/monthly-report-line-flex'
import { notifyBillLine, type BillLineNotificationSourceType } from '@/lib/server/bill-line-notification'
import { notifyCustomerReceiptLine } from '@/lib/server/customer-receipt-line-notification'
import { resolveLineTargetsForDocument } from '@/lib/server/line-notification-routing'
import { notifyPurchasePaymentLine } from '@/lib/server/purchase-payment-line-notification'
import { prisma } from '@/lib/server/prisma'
import { branchScopeIds, enteredByLabel } from '@/lib/server/weight-tickets'
import { notifyWeightTicketLine, sendLinePush } from '@/lib/server/weight-ticket-line-notification'

export const runtime = 'nodejs'

const manualSendSchema = z.object({
  documentType: z.enum(['WTI', 'WTO', 'PB', 'SB', 'PMT', 'RCP', 'DAILY', 'MONTHLY']),
  // เลขที่เอกสาร (บังคับสำหรับทุกประเภท ยกเว้น DAILY/MONTHLY)
  documentNo: z.string().trim().min(1).max(80).optional(),
  // วันที่ของสรุปประจำวัน (ใช้เฉพาะ DAILY, default = วันนี้)
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)').optional(),
  // เดือนของสรุปประจำเดือน (ใช้เฉพาะ MONTHLY, default = เดือนนี้)
  month: z.string().trim().regex(/^\d{4}-\d{2}$/, 'รูปแบบเดือนไม่ถูกต้อง (YYYY-MM)').optional(),
  // ระบุกลุ่มเป้าหมาย (ถ้าไม่ระบุ = ใช้กฎการส่ง/กลุ่มดีฟอลต์)
  targetId: z.string().trim().max(160).optional().default(''),
})

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  WTI: 'ใบรับของ',
  WTO: 'ใบส่งของ',
  PB: 'บิลซื้อ',
  SB: 'บิลขาย',
  PMT: 'การจ่ายเงิน',
  RCP: 'การรับเงิน',
  DAILY: 'สรุปประจำวัน',
  MONTHLY: 'สรุปประจำเดือน',
}

async function lineChannelAccessToken() {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
  })
  return setting?.value || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '') || 'http://localhost:3000'
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.share')

    const body = manualSendSchema.parse(await request.json().catch(() => ({})))
    const targetOverride = body.targetId || undefined
    const origin = appBaseUrl()

    if (body.documentType === 'DAILY') {
      // สรุปประจำวัน: สร้าง flex แล้ว push ตรงๆ (ตามกฎ หรือ target ที่ระบุ)
      const targetDate = body.date ? new Date(`${body.date}T00:00:00`) : new Date()
      const summary = await getDailyProductionSummary(targetDate)
      const flexMessage = buildDailyReportFlexMessage(summary)

      const decisions = targetOverride
        ? [{ targetId: targetOverride }]
        : await resolveLineTargetsForDocument({ type: 'DAILY' })
      const targetIds = decisions.map((d) => d.targetId)
      if (targetIds.length === 0) {
        return NextResponse.json({ code: 'NO_TARGETS', error: 'ยังไม่ได้ตั้งค่ากลุ่ม LINE เป้าหมาย' }, { status: 400 })
      }

      const token = await lineChannelAccessToken()
      const sentResults = []
      for (const targetId of targetIds) {
        try {
          const result = await sendLinePush(targetId, [flexMessage], token, randomUUID())
          sentResults.push({ status: 'sent', targetId, lineRequestId: result.lineRequestId })
        } catch (caught) {
          sentResults.push({ status: 'failed', targetId, error: caught instanceof Error ? caught.message : 'ส่งไม่สำเร็จ' })
        }
      }
      const sentCount = sentResults.filter((r) => r.status === 'sent').length
      if (sentCount === 0) {
        return NextResponse.json({
          code: 'LINE_PUSH_FAILED',
          error: 'ส่ง LINE สรุปประจำวันไม่สำเร็จ',
          details: sentResults.map((r) => ({ targetId: r.targetId, error: r.error })),
        }, { status: 502 })
      }
      return NextResponse.json({
        code: 'SENT',
        message: `ส่งสรุปประจำวัน ${summary.dateDisplay} เข้า LINE เรียบร้อย (${sentCount}/${targetIds.length} กลุ่ม)`,
        reportDate: summary.reportDate,
        sentResults,
      })
    }

    if (body.documentType === 'MONTHLY') {
      // สรุปประจำเดือน: สร้าง flex แล้ว push ตรงๆ
      const targetDate = body.month ? new Date(`${body.month}-01T00:00:00`) : body.date ? new Date(`${body.date}T00:00:00`) : new Date()
      const summary = await getMonthlyProductionSummary(targetDate)
      const flexMessage = buildMonthlyReportFlexMessage(summary)

      let decisions = targetOverride
        ? [{ targetId: targetOverride }]
        : await resolveLineTargetsForDocument({ type: 'MONTHLY' })
      if (decisions.length === 0) {
        decisions = await resolveLineTargetsForDocument({ type: 'DAILY' })
      }
      const targetIds = [...new Set(decisions.map((d) => d.targetId))]
      if (targetIds.length === 0) {
        return NextResponse.json({ code: 'NO_TARGETS', error: 'ยังไม่ได้ตั้งค่ากลุ่ม LINE เป้าหมาย' }, { status: 400 })
      }

      const token = await lineChannelAccessToken()
      const sentResults = []
      for (const targetId of targetIds) {
        try {
          const result = await sendLinePush(targetId, [flexMessage], token, randomUUID())
          sentResults.push({ status: 'sent', targetId, lineRequestId: result.lineRequestId })
        } catch (caught) {
          sentResults.push({ status: 'failed', targetId, error: caught instanceof Error ? caught.message : 'ส่งไม่สำเร็จ' })
        }
      }
      const sentCount = sentResults.filter((r) => r.status === 'sent').length
      if (sentCount === 0) {
        return NextResponse.json({
          code: 'LINE_PUSH_FAILED',
          error: 'ส่ง LINE สรุปประจำเดือนไม่สำเร็จ',
          details: sentResults.map((r) => ({ targetId: r.targetId, error: r.error })),
        }, { status: 502 })
      }
      return NextResponse.json({
        code: 'SENT',
        message: `ส่งสรุปประจำเดือน ${summary.monthDisplay} เข้า LINE เรียบร้อย (${sentCount}/${targetIds.length} กลุ่ม)`,
        reportMonth: summary.reportMonth,
        sentResults,
      })
    }

    if (!body.documentNo) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ระบุเลขที่เอกสาร' }, { status: 400 })
    }

    // เอกสารอื่น: ใช้ notify function เฉพาะประเภท (ส่งไป target ที่ระบุ หรือกฎ/ดีฟอลต์)
    let result: { status: number; error?: string; code?: string }
    if (body.documentType === 'WTI' || body.documentType === 'WTO') {
      result = await notifyWeightTicketLine(body.documentNo, {
        force: true,
        origin,
        requestedBy: enteredByLabel(auth),
        scopedBranchIds: branchScopeIds(auth),
        targetId: targetOverride,
      })
    } else if (body.documentType === 'PB' || body.documentType === 'SB') {
      result = await notifyBillLine(body.documentType as BillLineNotificationSourceType, body.documentNo, {
        origin,
        targetId: targetOverride || '',
      })
    } else if (body.documentType === 'PMT') {
      result = await notifyPurchasePaymentLine(body.documentNo, {
        origin,
        targetId: targetOverride || '',
      })
    } else if (body.documentType === 'RCP') {
      result = await notifyCustomerReceiptLine(body.documentNo, {
        origin,
        targetId: targetOverride || '',
      })
    } else {
      return NextResponse.json({ code: 'UNSUPPORTED_TYPE', error: 'ประเภทเอกสารไม่รองรับ' }, { status: 400 })
    }

    if (result.status >= 400) {
      return NextResponse.json({ code: result.code || 'SEND_FAILED', error: result.error || 'ส่งแจ้งเตือนไม่สำเร็จ' }, { status: result.status })
    }

    return NextResponse.json({
      code: 'SENT',
      message: `ส่งแจ้งเตือน ${DOCUMENT_TYPE_LABELS[body.documentType] || body.documentType} ${body.documentNo} เข้า LINE สำเร็จ`,
    })
  } catch (error) {
    if (error instanceof AuthContextError) {
      return authContextErrorResponse(error)
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }
    return apiErrorResponse(error, 'เกิดข้อผิดพลาดในการส่งแจ้งเตือน LINE')
  }
}
