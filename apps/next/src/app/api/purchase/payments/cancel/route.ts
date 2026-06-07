import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseInternalBigIntId, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { appendSupplierAdvanceStatusLog, supplierAdvanceStatusActionForStatus, SUPPLIER_ADVANCE_STATUS_ACTION } from '@/lib/server/advance-payment-history'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toNumber } from '@/lib/server/daily'
import {
  appendPaymentApprovalStatusLog,
  appendPaymentStatusLog,
  PAYMENT_APPROVAL_STATUS_ACTION,
  PAYMENT_STATUS_ACTION,
} from '@/lib/server/payment-history'
import { appendPurchaseBillStatusLog, PURCHASE_BILL_STATUS_ACTION } from '@/lib/server/purchase-bill-history'
import { prisma } from '@/lib/server/prisma'
import { refreshPurchaseBillSettlement } from '@/lib/server/purchase-bill-settlement'

export const runtime = 'nodejs'

type DecimalLike = number | { toNumber: () => number } | null | undefined

const cancelPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'กรุณาระบุเหตุผลการยกเลิกการจ่ายเงิน').max(1000, 'เหตุผลยาวเกินไป'),
  voucherId: z.string().trim().min(1, 'ไม่พบรายการจ่ายเงินที่ต้องการยกเลิก'),
})

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

async function refreshPurchaseBillPaymentStatus(tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer T) => Promise<unknown> ? T : never, billId: bigint, actor: string) {
  const bill = await tx.purchase_bills.findUnique({
    select: { id: true },
    where: { id: billId },
  })
  if (!bill) throw new Error('ไม่พบบิลซื้อที่ต้องการคำนวณสถานะใหม่')
  await refreshPurchaseBillSettlement(tx, billId, actor)
}

async function refreshAdvancePaymentPaymentStatus(tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer T) => Promise<unknown> ? T : never, advanceId: bigint, actor: string) {
  const [advance, approvals] = await Promise.all([
    tx.supplier_advance_payments.findUnique({
      select: { id: true, status: true },
      where: { id: advanceId },
    }),
    tx.payment_approvals.findMany({
      select: { approved_amount: true, id: true },
      where: {
        source_id: advanceId.toString(),
        source_type: 'advance_payment',
        status: { in: ['approved', 'paid'] },
      },
    }),
  ])
  if (!advance || advance.status === 'cancelled') return

  let allSettled = approvals.length > 0
  for (const approval of approvals) {
    const activePayments = await tx.payments.findMany({
      select: { amount: true, discount: true, status: true, withholding_tax: true },
      where: {
        payment_approval_id: approval.id,
        NOT: { status: 'cancelled' },
      },
    })
    const settledAmount = activePayments.reduce((sum, payment) => (
      sum + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
    ), 0)
    if (Math.max(0, toNumber(approval.approved_amount) - settledAmount) > 0.01) {
      allSettled = false
      break
    }
  }

  const nextStatus = approvals.length === 0 ? 'pending_approval' : allSettled ? 'paid' : 'approved'
  await tx.supplier_advance_payments.update({
    data: {
      status: nextStatus,
      updated_at: new Date(),
      updated_by: actor,
    },
    where: { id: advanceId },
  })
  if (nextStatus !== advance.status) {
    await appendSupplierAdvanceStatusLog(tx, {
      action: nextStatus === 'approved' || nextStatus === 'pending_approval'
        ? SUPPLIER_ADVANCE_STATUS_ACTION.PAYMENT_REVERSED
        : supplierAdvanceStatusActionForStatus(nextStatus),
      actor,
      advancePaymentId: advanceId,
      fromStatus: advance.status,
      meta: { reason: 'payment_cancel_refresh' },
      toStatus: nextStatus,
    })
  }
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
            approved_amount: DecimalLike
            id: bigint
            source_id: string
            source_type: string
            status: string | null
          }>>
          update: (args: unknown) => Promise<unknown>
        }
      }

      const payments = await tx.payments.findMany({
        select: {
          amount: true,
          bill_id: true,
          discount: true,
          doc_no: true,
          id: true,
          net_amount: true,
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

      const approvalIds = [...new Set(payments.map((payment) => payment.payment_approval_id).filter((value): value is bigint => value != null))]
      const billIds = [...new Set(payments.map((payment) => payment.bill_id).filter((value): value is bigint => value != null))]
      const bills = billIds.length > 0
        ? await tx.purchase_bills.findMany({
          select: { doc_no: true, id: true, status: true },
          where: { id: { in: billIds } },
        })
        : []
      const billById = new Map(bills.map((bill) => [bill.id, bill]))
      const bankStatements = await tx.bank_statement.findMany({
        select: { doc_no: true, id: true },
        where: {
          ref_id: payload.voucherId,
          ref_type: 'PMT',
        },
      })
      const cancelledAt = new Date()
      const canonicalPayment = payments[0]
      const voucherAmount = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
      const voucherNetAmount = payments.reduce((sum, payment) => sum + toNumber(payment.net_amount), 0)
      const cancelledPaymentByApprovalId = new Map<string, typeof payments[number]>()
      const reversedAmountByApprovalId = new Map<string, number>()
      for (const payment of payments) {
        const approvalId = payment.payment_approval_id ? stringifyBusinessValue(payment.payment_approval_id) : ''
        if (!approvalId) continue
        cancelledPaymentByApprovalId.set(approvalId, payment)
        const reversedAmount = toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount)
        reversedAmountByApprovalId.set(approvalId, roundMoney((reversedAmountByApprovalId.get(approvalId) ?? 0) + reversedAmount))
      }

      await tx.payments.updateMany({
        data: {
          status: 'cancelled',
          updated_at: cancelledAt,
          updated_by: actor,
        },
        where: {
          voucher_id: payload.voucherId,
          NOT: { status: 'cancelled' },
        },
      })
      await tx.payment_allocations.updateMany({
        data: {
          status: 'reversed',
          updated_at: cancelledAt,
          updated_by: actor,
        },
        where: {
          payment_voucher_id: payload.voucherId,
          status: 'active',
        },
      })
      await tx.payment_account_splits.updateMany({
        data: {
          status: 'reversed',
          updated_at: cancelledAt,
          updated_by: actor,
        },
        where: {
          payment_voucher_id: payload.voucherId,
          status: 'active',
        },
      })
      if (canonicalPayment) {
        await appendPaymentStatusLog(tx, {
          action: PAYMENT_STATUS_ACTION.CANCELLED,
          actor,
          amountSnapshot: voucherAmount,
          createdAt: cancelledAt,
          fromStatus: 'active',
          meta: {
            reason: payload.reason,
            reversedLineCount: payments.length,
            voucherId: payload.voucherId,
          },
          netAmountSnapshot: voucherNetAmount,
          note: payload.reason,
          paymentDocNo: canonicalPayment.doc_no,
          paymentId: canonicalPayment.id,
          paymentVoucherId: payload.voucherId,
          toStatus: 'cancelled',
        })
        await appendPaymentStatusLog(tx, {
          action: PAYMENT_STATUS_ACTION.BANK_REVERSED,
          actor,
          amountSnapshot: voucherAmount,
          createdAt: cancelledAt,
          fromStatus: 'active',
          meta: {
            bankStatementDocNos: bankStatements.map((statement) => statement.doc_no),
            reason: payload.reason,
            voucherId: payload.voucherId,
          },
          netAmountSnapshot: voucherNetAmount,
          note: payload.reason,
          paymentDocNo: canonicalPayment.doc_no,
          paymentId: canonicalPayment.id,
          paymentVoucherId: payload.voucherId,
          toStatus: 'cancelled',
        })
      }

      await tx.bank_statement.deleteMany({
        where: {
          ref_id: payload.voucherId,
          ref_type: 'PMT',
        },
      })

      if (approvalIds.length > 0) {
        const approvals = await txExt.payment_approvals.findMany({
          select: {
            approved_amount: true,
            id: true,
            source_id: true,
            source_type: true,
            status: true,
          },
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
        const latestPaymentByApprovalId = new Map<string, { createdAt: Date | null; paymentId: bigint }>()
        remainingPayments.forEach((payment) => {
          const approvalId = payment.payment_approval_id ? stringifyBusinessValue(payment.payment_approval_id) : ''
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
          const approvalId = stringifyBusinessValue(approval.id)
          const remainingSettled = settledByApprovalId.get(approvalId) ?? 0
          const remainingBalance = Math.max(0, approvedAmount - remainingSettled)
          const latestPayment = latestPaymentByApprovalId.get(approvalId)
          const staysPaid = remainingBalance <= 0.01 && latestPayment != null
          const cancelledPayment = cancelledPaymentByApprovalId.get(approvalId)
          await txExt.payment_approvals.update({
            data: {
              paid_at: staysPaid ? cancelledAt : null,
              payment_id: staysPaid ? latestPayment?.paymentId ?? null : null,
              status: staysPaid ? 'paid' : 'voided',
              updated_at: cancelledAt,
              void_reason: staysPaid ? null : payload.reason,
              voided_at: staysPaid ? null : cancelledAt,
              voided_by: staysPaid ? null : actor,
            },
            where: { id: approval.id },
          })
          if (!staysPaid) {
            await appendPaymentApprovalStatusLog(tx, {
              action: PAYMENT_APPROVAL_STATUS_ACTION.REVERSED_BY_PAYMENT_CANCEL,
              actor,
              createdAt: cancelledAt,
              fromStatus: approval.status ?? 'paid',
              meta: {
                paymentDocNo: cancelledPayment?.doc_no ?? null,
                reason: payload.reason,
                reversedAmount: reversedAmountByApprovalId.get(approvalId) ?? null,
                voucherId: payload.voucherId,
              },
              note: payload.reason,
              paymentApprovalId: approval.id,
              paymentDocNo: cancelledPayment?.doc_no ?? canonicalPayment?.doc_no ?? null,
              paymentId: cancelledPayment?.id ?? canonicalPayment?.id ?? null,
              toStatus: 'voided',
            })
          }
          if (approval.source_type === 'advance_payment') {
            const advanceId = parseInternalBigIntId(approval.source_id)
            if (advanceId != null) {
              await refreshAdvancePaymentPaymentStatus(tx, advanceId, actor)
            }
          }
        }
      }

      for (const billId of billIds) {
        await refreshPurchaseBillPaymentStatus(tx, billId, actor)
        const currentBill = billById.get(billId)
        const refreshedBill = await tx.purchase_bills.findUnique({
          select: { status: true },
          where: { id: billId },
        })
        if (!currentBill) continue
        await appendPurchaseBillStatusLog(tx, {
          action: PURCHASE_BILL_STATUS_ACTION.PAYMENT_REVERSED,
          actor,
          fromStatus: currentBill.status,
          meta: {
            reversedVoucherId: payload.voucherId,
          },
          note: payload.reason,
          purchaseBillDocNo: currentBill.doc_no,
          purchaseBillId: billId,
          toStatus: refreshedBill?.status ?? currentBill.status ?? 'unpaid',
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกการจ่ายเงินไม่ได้', 400)
  }
}
