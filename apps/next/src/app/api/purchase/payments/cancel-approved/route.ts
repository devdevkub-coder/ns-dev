import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId, requireDocumentNo } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { appendSupplierAdvanceStatusLog, SUPPLIER_ADVANCE_STATUS_ACTION } from '@/lib/server/advance-payment-history'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const cancelApprovedSchema = z.object({
  approvalId: z.string().trim().min(1, 'ไม่พบรายการอนุมัติที่ต้องการยกเลิก'),
  reason: z.string().trim().min(1, 'กรุณาระบุเหตุผลการยกเลิก').max(1000, 'เหตุผลยาวเกินไป'),
})

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const payload = cancelApprovedSchema.parse(await request.json())
    const actor = currentActor(context)
    const approvalDocNo = requireDocumentNo(payload.approvalId, 'รายการอนุมัติจ่าย')

    await prisma.$transaction(async (tx) => {
      const txExt = tx as typeof tx & {
        payment_approvals: {
          findFirst: (args: unknown) => Promise<{
            id: bigint
            source_id: string
            source_type: string
            status: string | null
          } | null>
          update: (args: unknown) => Promise<unknown>
        }
      }

      const approval = await txExt.payment_approvals.findFirst({
        where: { doc_no: approvalDocNo },
      })
      if (!approval || approval.status !== 'approved') {
        throw new Error('ไม่พบรายการรอจ่ายที่ต้องการยกเลิก หรือรายการนี้ไม่อยู่ในสถานะรอจ่ายแล้ว')
      }

      const activePayments = await tx.payments.findMany({
        select: { amount: true, discount: true, withholding_tax: true },
        where: {
          payment_approval_id: approval.id,
          NOT: { status: 'cancelled' },
        },
      })
      const settledAmount = activePayments.reduce((sum, payment) => (
        sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
      ), 0)
      if (settledAmount > 0.01) {
        throw new Error('ยกเลิกรายการรอจ่ายไม่ได้ เพราะมีการจ่ายเงินแล้ว')
      }

      await txExt.payment_approvals.update({
        data: {
          paid_at: null,
          payment_id: null,
          status: 'voided',
          updated_at: new Date(),
          void_reason: payload.reason,
          voided_at: new Date(),
          voided_by: actor,
        },
        where: { id: approval.id },
      })

      const sourceInternalId = parseInternalBigIntId(approval.source_id)
      if (sourceInternalId != null && approval.source_type === 'advance_payment') {
        const advance = await tx.supplier_advance_payments.findUnique({
          select: { status: true },
          where: { id: sourceInternalId },
        })
        await tx.supplier_advance_payments.update({
          data: {
            status: 'pending_approval',
            updated_at: new Date(),
            updated_by: actor,
          },
          where: { id: sourceInternalId },
        })
        await appendSupplierAdvanceStatusLog(tx, {
          action: SUPPLIER_ADVANCE_STATUS_ACTION.APPROVAL_VOIDED,
          actor,
          advancePaymentId: sourceInternalId,
          fromStatus: advance?.status ?? null,
          meta: {
            approvalDocNo,
            reason: payload.reason,
          },
          note: payload.reason,
          toStatus: 'pending_approval',
        })
      }
      if (sourceInternalId != null && approval.source_type === 'expense') {
        await tx.expenses.update({
          data: {
            status: 'pending_approval',
            updated_at: new Date(),
            updated_by: actor,
          },
          where: { id: sourceInternalId },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรายการรอจ่ายไม่ได้', 400)
  }
}
