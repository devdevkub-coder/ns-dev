import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const cancelPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'กรุณาระบุเหตุผลการยกเลิกการจ่ายเงิน').max(1000, 'เหตุผลยาวเกินไป'),
  voucherId: z.string().trim().min(1, 'ไม่พบรายการจ่ายเงินที่ต้องการยกเลิก'),
})

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

async function refreshPurchaseBillPaymentStatus(tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer T) => Promise<unknown> ? T : never, billId: string, actor: string) {
  const bill = await tx.purchase_bills.findUnique({
    select: { id: true, total_amount: true },
    where: { id: billId },
  })
  if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการคำนวณสถานะใหม่')

  const payments = await tx.payments.findMany({
    select: { amount: true, discount: true, status: true, withholding_tax: true },
    where: { bill_id: billId, NOT: { status: 'cancelled' } },
  })
  const paidAmount = payments.reduce((sum, payment) => (
    sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
  ), 0)
  const totalAmount = toNumber(bill.total_amount)
  if (paidAmount - totalAmount > 0.01) throw new Error('ยอดจ่ายรวมเกินยอดค้างของบิลซื้อ')

  const payableBalance = Math.max(0, totalAmount - paidAmount)
  const status = paidAmount <= 0 ? 'unpaid' : payableBalance <= 0.01 ? 'paid' : 'partial'

  await tx.purchase_bills.update({
    data: {
      paid_amount: paidAmount,
      payable_balance: payableBalance,
      status,
      updated_at: new Date(),
      updated_by: actor,
    },
    where: { id: billId },
  })
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const payload = cancelPaymentSchema.parse(await request.json())
    const actor = currentActor(context)

    await prisma.$transaction(async (tx) => {
      const txExt = tx as typeof tx & {
        payment_approvals: {
          findMany: (args: unknown) => Promise<Array<{
            approved_amount: unknown
            id: string
          }>>
          update: (args: unknown) => Promise<unknown>
        }
      }

      const payments = await tx.payments.findMany({
        select: {
          amount: true,
          bill_id: true,
          discount: true,
          id: true,
          payment_approval_id: true,
          status: true,
          withholding_tax: true,
        },
        where: {
          voucher_id: payload.voucherId,
          NOT: { status: 'cancelled' },
        },
      })
      if (payments.length === 0) {
        throw new Error('ไม่พบรายการจ่ายเงินที่ต้องการยกเลิก หรือรายการนี้ถูกยกเลิกไปแล้ว')
      }

      const approvalIds = [...new Set(payments.map((payment) => payment.payment_approval_id).filter(Boolean) as string[])]
      const billIds = [...new Set(payments.map((payment) => payment.bill_id).filter(Boolean) as string[])]

      await tx.payments.updateMany({
        data: {
          status: 'cancelled',
          updated_at: new Date(),
          updated_by: actor,
        },
        where: {
          voucher_id: payload.voucherId,
          NOT: { status: 'cancelled' },
        },
      })

      await tx.bank_statement.deleteMany({
        where: {
          ref_id: payload.voucherId,
          ref_type: 'PMT',
        },
      })

      if (approvalIds.length > 0) {
        const approvals = await txExt.payment_approvals.findMany({
          where: { id: { in: approvalIds } },
        })
        const remainingPayments = await tx.payments.findMany({
          select: { amount: true, created_at: true, discount: true, id: true, payment_approval_id: true, status: true, withholding_tax: true },
          where: {
            payment_approval_id: { in: approvalIds },
            NOT: { status: 'cancelled' },
          },
        })
        const settledByApprovalId = new Map<string, number>()
        const latestPaymentByApprovalId = new Map<string, { createdAt: Date | null; paymentId: string }>()
        remainingPayments.forEach((payment) => {
          const approvalId = payment.payment_approval_id
          if (!approvalId) return
          const settled = toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
          settledByApprovalId.set(approvalId, roundMoney((settledByApprovalId.get(approvalId) ?? 0) + settled))
          const current = latestPaymentByApprovalId.get(approvalId)
          const createdAt = payment.created_at ?? null
          if (!current || (createdAt?.getTime() ?? 0) >= (current.createdAt?.getTime() ?? 0)) {
            latestPaymentByApprovalId.set(approvalId, { createdAt, paymentId: payment.id })
          }
        })

        for (const approval of approvals) {
          const approvedAmount = toNumber(approval.approved_amount)
          const remainingSettled = settledByApprovalId.get(approval.id) ?? 0
          const remainingBalance = Math.max(0, approvedAmount - remainingSettled)
          const latestPayment = latestPaymentByApprovalId.get(approval.id)
          await txExt.payment_approvals.update({
            data: {
              paid_at: remainingBalance <= 0.01 ? new Date() : null,
              payment_id: remainingBalance <= 0.01 ? latestPayment?.paymentId ?? null : null,
              status: remainingBalance <= 0.01 ? 'paid' : 'approved',
              updated_at: new Date(),
              void_reason: null,
              voided_at: null,
              voided_by: null,
            },
            where: { id: approval.id },
          })
        }
      }

      for (const billId of billIds) {
        await refreshPurchaseBillPaymentStatus(tx, billId, actor)
      }
    })

    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกการจ่ายเงินไม่ได้', 400)
  }
}
