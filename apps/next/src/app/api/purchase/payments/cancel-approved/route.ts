import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId, requireDocumentNo } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { SUPPLIER_ADVANCE_STATUS_ACTION } from '@/lib/server/advance-payment-history'
import { refreshAdvancePaymentWorkflowStatus } from '@/lib/server/advance-payments'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { currentActor, toNumber } from '@/lib/server/daily'
import { appendPaymentApprovalStatusLog, PAYMENT_APPROVAL_STATUS_ACTION } from '@/lib/server/payment-history'
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

      const allowedBranchCodes = getBranchCodeIntersection(context)
      if (allowedBranchCodes) {
        const matchingBranches = await tx.branches.findMany({
          where: { code: { in: allowedBranchCodes } },
          select: { id: true },
        })
        const allowedBranchIds = matchingBranches.map((b) => b.id)
        let sourceBranchId: bigint | null = null
        const sourceInternalId = parseInternalBigIntId(approval.source_id)
        if (sourceInternalId != null) {
          if (approval.source_type === 'purchase_bill') {
            const pb = await tx.purchase_bills.findUnique({
              select: { branch_id: true },
              where: { id: sourceInternalId }
            })
            sourceBranchId = pb?.branch_id ?? null
          } else if (approval.source_type === 'advance_payment') {
            const adv = await tx.supplier_advance_payments.findUnique({
              select: { branch_id: true },
              where: { id: sourceInternalId }
            })
            sourceBranchId = adv?.branch_id ?? null
          } else if (approval.source_type === 'expense') {
            const exp = await tx.expenses.findUnique({
              select: { branch_id: true },
              where: { id: sourceInternalId }
            })
            sourceBranchId = exp?.branch_id ?? null
          }
        }
        if (sourceBranchId != null && !allowedBranchIds.includes(sourceBranchId)) {
          throw new Error('ไม่มีสิทธิ์ยกเลิกรายการอนุมัตินี้')
        }
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

      const voidedAt = new Date()
      await txExt.payment_approvals.update({
        data: {
          paid_at: null,
          payment_id: null,
          status: 'voided',
          updated_at: voidedAt,
          void_reason: payload.reason,
          voided_at: voidedAt,
          voided_by: actor,
        },
        where: { id: approval.id },
      })
      await appendPaymentApprovalStatusLog(tx, {
        action: PAYMENT_APPROVAL_STATUS_ACTION.VOIDED_BEFORE_PAYMENT,
        actor,
        createdAt: voidedAt,
        fromStatus: approval.status,
        meta: {
          approvalDocNo,
          reason: payload.reason,
        },
        note: payload.reason,
        paymentApprovalId: approval.id,
        toStatus: 'voided',
      })

      const sourceInternalId = parseInternalBigIntId(approval.source_id)
      if (sourceInternalId != null && approval.source_type === 'advance_payment') {
        await refreshAdvancePaymentWorkflowStatus(tx, sourceInternalId, actor, {
          action: SUPPLIER_ADVANCE_STATUS_ACTION.APPROVAL_VOIDED,
          logIfUnchanged: true,
          meta: {
            approvalDocNo,
            reason: payload.reason,
          },
          note: payload.reason,
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
