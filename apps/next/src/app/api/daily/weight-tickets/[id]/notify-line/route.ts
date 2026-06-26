import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { branchScopeIds, enteredByLabel } from '@/lib/server/weight-tickets'
import { enqueueNotificationJob, executeNotificationJob } from '@/lib/server/line-notification-jobs'

export const runtime = 'nodejs'

const notifySchema = z.object({
  customMessage: z.string().trim().max(500).optional().default(''),
  targetId: z.string().trim().max(160).optional().default(''),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const body = notifySchema.parse(await request.json().catch(() => ({})))

    // Manual triggers always force: true
    const enqueueResult = await enqueueNotificationJob(id, {
      customMessage: body.customMessage || undefined,
      requestedBy: enteredByLabel(auth),
      targetId: body.targetId || undefined,
      force: true,
    })

    if (enqueueResult.status === 'no_targets') {
      return NextResponse.json({ code: 'NO_TARGETS_ROUTED', error: enqueueResult.message }, { status: 400 })
    }

    const results = []
    for (const job of enqueueResult.jobs) {
      const result = await executeNotificationJob(job.id, { force: true })
      results.push(result)
    }

    const firstSuccess = results.find(r => r.status === 'sent' || r.status === 'skipped')
    if (firstSuccess) {
      return NextResponse.json({
        status: 200,
        code: firstSuccess.status === 'skipped' ? 'SKIPPED_DUPLICATE' : 'SENT',
        pdfUrl: firstSuccess.pdfUrl,
        lineRequestId: firstSuccess.lineRequestId
      })
    } else {
      const firstFail = results.find(r => r.status === 'failed')
      return NextResponse.json({
        code: 'LINE_PUSH_FAILED',
        error: firstFail?.error || 'ส่ง LINE ไม่สำเร็จ'
      }, { status: 502 })
    }
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ส่ง LINE ใบรับ-ส่งของไม่สำเร็จ', 500)
  }
}
