import { NextResponse } from 'next/server'
import { salesBillStockReturnSchema } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission, type AppAuthContext } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { appendSalesBillStatusLog, SALES_BILL_STATUS_ACTION } from '@/lib/server/sales-bill-history'
import { closeActiveWtoPendingOutForSalesBillReturn, WtoPendingOutError } from '@/lib/server/stock-holds'
import { appendWtoPendingOutEventsForHoldKeys } from '@/lib/server/weight-ticket-pending-out-events'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION } from '@/lib/server/weight-ticket-usage-history'

export const runtime = 'nodejs'

async function salesBranchScope(context: AppAuthContext) {
  const allowedCodes = getBranchCodeIntersection(context)
  if (allowedCodes === null) return { ids: null }
  if (allowedCodes.length === 0) return { ids: [] as bigint[] }
  const branches = await prisma.branches.findMany({
    select: { id: true },
    where: { code: { in: allowedCodes } },
  })
  return { ids: branches.map((branch) => branch.id) }
}

function scopedSalesBillWhere(allowedBranchIds: bigint[] | null) {
  return allowedBranchIds === null ? {} : { branch_id: { in: allowedBranchIds } }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const billRef = decodeURIComponent(id)
    const values = salesBillStockReturnSchema.parse(await request.json())
    const actor = currentActor(auth)
    const returnedAt = new Date()
    const returnDate = normalizeDate(returnedAt.toISOString().slice(0, 10))
    const branchScope = await salesBranchScope(auth)

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.sales_bills.findFirst({
        select: {
          branch_id: true,
          channel_id: true,
          doc_no: true,
          id: true,
          status: true,
        },
        where: { doc_no: billRef, ...scopedSalesBillWhere(branchScope.ids) },
      })
      if (!bill) throw new Error('ไม่พบบิลขายที่ต้องการรับของคืน')
      if (String(bill.status ?? '').toLowerCase() === 'cancelled' || String(bill.status ?? '').toLowerCase() === 'canceled') {
        throw new Error('รับของคืนจากบิลขายที่ยกเลิกแล้วไม่ได้')
      }

      const hold = await tx.stock_holds.findFirst({
        select: {
          branch_id: true,
          hold_key: true,
          product_id: true,
          qty: true,
          source_doc_no: true,
          status: true,
          weight_ticket_id: true,
        },
        where: {
          hold_key: values.pendingOutKey,
          source_type: 'WTO',
          status: 'active',
        },
      })
      if (!hold) throw new WtoPendingOutError('ไม่พบ pending_out ที่พร้อมรับคืน กรุณาโหลดข้อมูลใหม่')
      if (hold.branch_id !== bill.branch_id) throw new WtoPendingOutError('pending_out ต้องอยู่สาขาเดียวกับบิลขาย')

      const usageFact = await tx.weight_ticket_usage_logs.findFirst({
        select: { id: true },
        where: {
          action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
          product_id: hold.product_id,
          target_doc_no: bill.doc_no,
          target_type: 'SALES_BILL',
          weight_ticket_id: hold.weight_ticket_id,
        },
      })
      if (!usageFact) {
        throw new WtoPendingOutError('pending_out นี้ไม่ได้ผูกกับบิลขายที่เลือก')
      }

      const pendingQty = toNumber(hold.qty)
      const returnedQty = Number(values.returnedQty.toFixed(2))
      const lossQty = Number(Math.max(0, pendingQty - Math.min(pendingQty, Math.max(0, returnedQty))).toFixed(2))
      if (lossQty > 0.0001 && !values.reason?.trim()) {
        throw new WtoPendingOutError('น้ำหนักรับคืนไม่เท่ากับ pending_out ต้องกรอกเหตุผลส่วนต่างก่อนบันทึก', {
          reason: ['กรอกเหตุผลส่วนต่าง'],
        })
      }

      const closed = await closeActiveWtoPendingOutForSalesBillReturn(tx, {
        actor,
        pendingOutKey: values.pendingOutKey,
        note: values.note,
        reason: values.reason,
        returnDate,
        returnedQty,
        salesBillDocNo: bill.doc_no,
        salesChannelId: bill.channel_id,
      })

      const summary = await tx.weight_ticket_product_summaries.findFirst({
        select: { id: true, remaining_weight: true },
        where: {
          product_id: closed.productId,
          weight_ticket_id: closed.weightTicketId,
        },
      })
      if (!summary) {
        throw new WtoPendingOutError('ไม่พบ product summary ของ WTO สำหรับบันทึกการรับคืน')
      }
      if (toNumber(summary.remaining_weight) + 0.0001 < closed.pendingQty) {
        throw new WtoPendingOutError('จำนวน pending_out ใน product summary ไม่พอสำหรับปิดรับคืน กรุณาโหลดข้อมูลใหม่')
      }

      const usageEntries = []
      if (closed.returnedQty > 0.0001) {
        usageEntries.push({
          action: WEIGHT_TICKET_USAGE_ACTION.RETURNED_FROM_SALES_BILL,
          actor,
          allocatedDeductWeight: 0,
          allocatedGrossWeight: closed.returnedQty,
          allocatedNetWeight: closed.returnedQty,
          allocatedQty: closed.returnedQty,
          createdAt: returnedAt,
          meta: {
            pendingOutKey: closed.pendingOutKey,
            pendingQty: closed.pendingQty,
            reason: 'sales_bill_stock_return',
            salesBillDocNo: bill.doc_no,
          },
          note: values.note,
          productCodeSnapshot: closed.productCode,
          productId: closed.productId,
          productNameSnapshot: closed.productName,
          targetDocNo: bill.doc_no,
          targetId: bill.id,
          targetLineNo: closed.sourceLineNo,
          targetType: 'SALES_BILL' as const,
          weightTicketId: closed.weightTicketId,
          weightTicketProductSummaryId: summary.id,
        })
      }
      if (closed.lossQty > 0.0001) {
        usageEntries.push({
          action: WEIGHT_TICKET_USAGE_ACTION.LOSS_FROM_SALES_BILL,
          actor,
          allocatedDeductWeight: 0,
          allocatedGrossWeight: closed.lossQty,
          allocatedNetWeight: closed.lossQty,
          allocatedQty: closed.lossQty,
          createdAt: returnedAt,
          meta: {
            pendingOutKey: closed.pendingOutKey,
            lossUnitCost: closed.lossUnitCost,
            lossValueOut: closed.lossValueOut,
            pendingQty: closed.pendingQty,
            reason: 'sales_bill_stock_return_loss',
            salesBillDocNo: bill.doc_no,
          },
          note: values.reason ?? values.note,
          productCodeSnapshot: closed.productCode,
          productId: closed.productId,
          productNameSnapshot: closed.productName,
          targetDocNo: bill.doc_no,
          targetId: bill.id,
          targetLineNo: closed.sourceLineNo,
          targetType: 'SALES_BILL' as const,
          weightTicketId: closed.weightTicketId,
          weightTicketProductSummaryId: summary.id,
        })
      }
      await appendWeightTicketUsageLogs(tx, usageEntries)
      await appendWtoPendingOutEventsForHoldKeys(tx, {
        actor,
        eventTypeForHold: (hold) => (closed.lossPendingOutKey && hold.hold_key === closed.lossPendingOutKey ? 'sales_bill_return_loss' : 'sales_bill_return'),
        holdKeys: [closed.pendingOutKey, closed.lossPendingOutKey].filter((key): key is string => Boolean(key)),
        occurredAt: returnedAt,
        referenceDocNo: bill.doc_no,
        referenceDocType: 'SB',
      })

      await tx.weight_ticket_product_summaries.update({
        data: {
          remaining_weight: { decrement: closed.pendingQty },
          updated_at: returnedAt,
        },
        where: { id: summary.id },
      })

      const remainingAfterReturn = await tx.weight_ticket_product_summaries.aggregate({
        _sum: { remaining_weight: true },
        where: { weight_ticket_id: closed.weightTicketId },
      })
      const activePendingOutCount = await tx.stock_holds.count({
        where: {
          status: 'active',
          weight_ticket_id: closed.weightTicketId,
        },
      })
      const nextTicketStatus = toNumber(remainingAfterReturn._sum.remaining_weight) > 0.0001 || activePendingOutCount > 0
        ? 'partially_billed'
        : 'billed'
      const ticket = await tx.weight_tickets.findUnique({
        select: { status: true },
        where: { id: closed.weightTicketId },
      })
      if (ticket && ticket.status !== nextTicketStatus) {
        await tx.weight_tickets.update({
          data: {
            status: nextTicketStatus,
            updated_at: returnedAt,
            updated_by: actor,
          },
          where: { id: closed.weightTicketId },
        })
        await appendWeightTicketStatusLog(tx, {
          action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
          actor,
          createdAt: returnedAt,
          fromStatus: ticket.status,
          meta: {
            pendingOutKey: closed.pendingOutKey,
            lossQty: closed.lossQty,
            reason: 'sales_bill_stock_return',
            returnedQty: closed.returnedQty,
            salesBillDocNo: bill.doc_no,
          },
          note: values.reason ?? values.note,
          toStatus: nextTicketStatus,
          weightTicketId: closed.weightTicketId,
        })
      }

      await appendSalesBillStatusLog(tx, {
        action: SALES_BILL_STATUS_ACTION.STATUS_SYNCED,
        actor,
        createdAt: returnedAt,
        fromStatus: bill.status,
        meta: {
          pendingOutKey: closed.pendingOutKey,
          lossQty: closed.lossQty,
          pendingQty: closed.pendingQty,
          reason: closed.lossQty > 0.0001 ? 'sales_bill_stock_return_loss' : 'sales_bill_stock_return',
          returnedQty: closed.returnedQty,
          wtoDocNo: closed.sourceDocNo,
        },
        note: values.reason ?? values.note ?? 'รับของคืนจาก WTO',
        salesBillId: bill.id,
        toStatus: bill.status ?? 'open',
      })

      return {
        docNo: bill.doc_no,
        lossQty: closed.lossQty,
        returnedQty: closed.returnedQty,
        wtoDocNo: closed.sourceDocNo,
      }
    })

    return NextResponse.json(result)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'รับของคืนจากบิลขายไม่ได้', 400)
  }
}
