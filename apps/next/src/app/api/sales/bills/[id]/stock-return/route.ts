import { NextResponse } from 'next/server'
import { salesBillStockReturnSchema } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission, type AppAuthContext } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { appendSalesBillStatusLog, SALES_BILL_STATUS_ACTION } from '@/lib/server/sales-bill-history'
import { closeActiveWtoPendingOutForSalesBillReturn, WtoPendingOutError, type ReturnedWtoPendingOutResult } from '@/lib/server/stock-holds'
import { appendWtoPendingOutEventsForHoldKeys } from '@/lib/server/weight-ticket-pending-out-events'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION, type WeightTicketUsageLogEntry } from '@/lib/server/weight-ticket-usage-history'

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

      const pendingOutKeys = [...new Set((values.pendingOutKeys?.length ? values.pendingOutKeys : [values.pendingOutKey])
        .map((key) => key.trim())
        .filter(Boolean))]
      if (pendingOutKeys.length === 0) {
        throw new WtoPendingOutError('เลือก pending_out ที่ต้องรับคืน')
      }

      const holds = await tx.stock_holds.findMany({
        select: {
          branch_id: true,
          hold_key: true,
          id: true,
          product_id: true,
          qty: true,
          source_doc_no: true,
          source_line_no: true,
          status: true,
          warehouse_id: true,
          weight_ticket_id: true,
        },
        where: {
          hold_key: { in: pendingOutKeys },
          source_type: 'WTO',
          status: 'active',
        },
        orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
      })
      if (holds.length !== pendingOutKeys.length) {
        throw new WtoPendingOutError('ไม่พบ pending_out ที่พร้อมรับคืนครบทุกชุด กรุณาโหลดข้อมูลใหม่')
      }

      const firstHold = holds[0]
      if (!firstHold) throw new WtoPendingOutError('ไม่พบ pending_out ที่พร้อมรับคืน กรุณาโหลดข้อมูลใหม่')
      if (firstHold.branch_id !== bill.branch_id) throw new WtoPendingOutError('pending_out ต้องอยู่สาขาเดียวกับบิลขาย')
      const mixedHold = holds.find((hold) => (
        hold.branch_id !== firstHold.branch_id
        || hold.product_id !== firstHold.product_id
        || hold.warehouse_id !== firstHold.warehouse_id
        || hold.weight_ticket_id !== firstHold.weight_ticket_id
        || hold.source_doc_no !== firstHold.source_doc_no
      ))
      if (mixedHold) {
        throw new WtoPendingOutError('รับคืนได้ครั้งละสินค้า/คลัง/ใบส่งของเดียวกันเท่านั้น')
      }

      const usageFact = await tx.weight_ticket_usage_logs.findFirst({
        select: { id: true },
        where: {
          action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
          product_id: firstHold.product_id,
          target_doc_no: bill.doc_no,
          target_type: 'SALES_BILL',
          weight_ticket_id: firstHold.weight_ticket_id,
        },
      })
      if (!usageFact) {
        throw new WtoPendingOutError('pending_out นี้ไม่ได้ผูกกับบิลขายที่เลือก')
      }

      const pendingQty = Number(holds.reduce((sum, hold) => sum + toNumber(hold.qty), 0).toFixed(2))
      const returnedQty = Number(values.returnedQty.toFixed(2))
      if (returnedQty > pendingQty + 0.0001) {
        throw new WtoPendingOutError(`น้ำหนักรับคืนเกิน pending_out (${pendingQty.toLocaleString('th-TH', { maximumFractionDigits: 2 })} กก.)`)
      }
      const lossQty = Number(Math.max(0, pendingQty - Math.min(pendingQty, Math.max(0, returnedQty))).toFixed(2))
      if (lossQty > 0.0001 && !values.reason?.trim()) {
        throw new WtoPendingOutError('น้ำหนักรับคืนไม่เท่ากับ pending_out ต้องกรอกเหตุผลส่วนต่างก่อนบันทึก', {
          reason: ['กรอกเหตุผลส่วนต่าง'],
        })
      }

      let remainingReturnedQty = Math.max(0, returnedQty)
      const closedRows: ReturnedWtoPendingOutResult[] = []
      for (const hold of holds) {
        const holdQty = toNumber(hold.qty)
        const returnedForHold = Number(Math.min(holdQty, remainingReturnedQty).toFixed(2))
        remainingReturnedQty = Number(Math.max(0, remainingReturnedQty - returnedForHold).toFixed(2))
        closedRows.push(await closeActiveWtoPendingOutForSalesBillReturn(tx, {
          actor,
          pendingOutKey: hold.hold_key,
          note: values.note,
          reason: values.reason,
          returnDate,
          returnedQty: returnedForHold,
          salesBillDocNo: bill.doc_no,
          salesChannelId: bill.channel_id,
        }))
      }
      const closed = closedRows[0]
      if (!closed) throw new WtoPendingOutError('ไม่พบ pending_out ที่พร้อมรับคืน กรุณาโหลดข้อมูลใหม่')
      const totalPendingQty = Number(closedRows.reduce((sum, row) => sum + row.pendingQty, 0).toFixed(2))
      const totalReturnedQty = Number(closedRows.reduce((sum, row) => sum + row.returnedQty, 0).toFixed(2))
      const totalLossQty = Number(closedRows.reduce((sum, row) => sum + row.lossQty, 0).toFixed(2))

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
      if (toNumber(summary.remaining_weight) + 0.0001 < totalPendingQty) {
        throw new WtoPendingOutError('จำนวน pending_out ใน product summary ไม่พอสำหรับปิดรับคืน กรุณาโหลดข้อมูลใหม่')
      }

      const usageEntries: WeightTicketUsageLogEntry[] = []
      for (const closedRow of closedRows) {
        if (closedRow.returnedQty > 0.0001) {
          usageEntries.push({
            action: WEIGHT_TICKET_USAGE_ACTION.RETURNED_FROM_SALES_BILL,
            actor,
            allocatedDeductWeight: 0,
            allocatedGrossWeight: closedRow.returnedQty,
            allocatedNetWeight: closedRow.returnedQty,
            allocatedQty: closedRow.returnedQty,
            createdAt: returnedAt,
            meta: {
              pendingOutKey: closedRow.pendingOutKey,
              pendingOutKeys,
              pendingQty: closedRow.pendingQty,
              reason: 'sales_bill_stock_return',
              salesBillDocNo: bill.doc_no,
            },
            note: values.note,
            productCodeSnapshot: closedRow.productCode,
            productId: closedRow.productId,
            productNameSnapshot: closedRow.productName,
            targetDocNo: bill.doc_no,
            targetId: bill.id,
            targetLineNo: closedRow.sourceLineNo,
            targetType: 'SALES_BILL' as const,
            weightTicketId: closedRow.weightTicketId,
            weightTicketProductSummaryId: summary.id,
          })
        }
        if (closedRow.lossQty > 0.0001) {
          usageEntries.push({
            action: WEIGHT_TICKET_USAGE_ACTION.LOSS_FROM_SALES_BILL,
            actor,
            allocatedDeductWeight: 0,
            allocatedGrossWeight: closedRow.lossQty,
            allocatedNetWeight: closedRow.lossQty,
            allocatedQty: closedRow.lossQty,
            createdAt: returnedAt,
            meta: {
              pendingOutKey: closedRow.pendingOutKey,
              pendingOutKeys,
              lossUnitCost: closedRow.lossUnitCost,
              lossValueOut: closedRow.lossValueOut,
              pendingQty: closedRow.pendingQty,
              reason: 'sales_bill_stock_return_loss',
              salesBillDocNo: bill.doc_no,
            },
            note: values.reason ?? values.note,
            productCodeSnapshot: closedRow.productCode,
            productId: closedRow.productId,
            productNameSnapshot: closedRow.productName,
            targetDocNo: bill.doc_no,
            targetId: bill.id,
            targetLineNo: closedRow.sourceLineNo,
            targetType: 'SALES_BILL' as const,
            weightTicketId: closedRow.weightTicketId,
            weightTicketProductSummaryId: summary.id,
          })
        }
      }
      await appendWeightTicketUsageLogs(tx, usageEntries)
      await appendWtoPendingOutEventsForHoldKeys(tx, {
        actor,
        eventTypeForHold: (hold) => (closedRows.some((row) => row.lossPendingOutKey && hold.hold_key === row.lossPendingOutKey) ? 'sales_bill_return_loss' : 'sales_bill_return'),
        holdKeys: closedRows.flatMap((row) => [row.pendingOutKey, row.lossPendingOutKey]).filter((key): key is string => Boolean(key)),
        occurredAt: returnedAt,
        referenceDocNo: bill.doc_no,
        referenceDocType: 'SB',
      })

      await tx.weight_ticket_product_summaries.update({
        data: {
          remaining_weight: { decrement: totalPendingQty },
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
            pendingOutKeys,
            lossQty: totalLossQty,
            pendingQty: totalPendingQty,
            reason: 'sales_bill_stock_return',
            returnedQty: totalReturnedQty,
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
          pendingOutKeys,
          lossQty: totalLossQty,
          pendingQty: totalPendingQty,
          reason: totalLossQty > 0.0001 ? 'sales_bill_stock_return_loss' : 'sales_bill_stock_return',
          returnedQty: totalReturnedQty,
          wtoDocNo: closed.sourceDocNo,
        },
        note: values.reason ?? values.note ?? 'รับของคืนจาก WTO',
        salesBillId: bill.id,
        toStatus: bill.status ?? 'open',
      })

      return {
        docNo: bill.doc_no,
        lossQty: totalLossQty,
        returnedQty: totalReturnedQty,
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
