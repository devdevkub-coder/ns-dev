import { NextResponse } from 'next/server'
import { salesBillCancelSchema } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission, type AppAuthContext } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { appendSalesBillStatusLog, SALES_BILL_STATUS_ACTION } from '@/lib/server/sales-bill-history'
import { getSalesBillDetail } from '@/lib/server/sales-bill-detail'
import { activeSalesReceiptCount, isSalesBillActiveForCancel } from '@/lib/server/sales-bill-cancel-policy'
import { reversePoSellUsage } from '@/lib/server/sales-bill-po-sell-reversal'
import { reopenConsumedWtoStockHoldsForSalesBill, WtoStockHoldError } from '@/lib/server/stock-holds'
import {
  correctTradingAllocationsSchema as tradingCorrectionSchema,
  correctTradingSalesBillAllocations as runTradingSalesBillAllocationCorrection,
} from '@/lib/server/trading-sales-bill-allocation-correction'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION } from '@/lib/server/weight-ticket-usage-history'

export const runtime = 'nodejs'

async function salesBranchScope(context: AppAuthContext, requestedBranchCode?: string | null) {
  const allowedCodes = getBranchCodeIntersection(context, requestedBranchCode)
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const detail = await getSalesBillDetail(decodeURIComponent(id), {
      allowedBranchCodes: getBranchCodeIntersection(auth),
    })
    if (!detail) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลขายที่ต้องการ' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายละเอียดบิลขายไม่ได้', 500)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const payload = await request.json()
    const action = typeof payload?.action === 'string' ? payload.action : 'cancel'
    if (action === 'correct_trading_allocations') {
      const values = tradingCorrectionSchema.parse(payload)
      const actor = currentActor(auth)
      const correctedAt = new Date()
      const billRef = decodeURIComponent(id)
      const branchScope = await salesBranchScope(auth)
      const scopedBill = await prisma.sales_bills.findFirst({
        select: { id: true },
        where: { doc_no: billRef, ...scopedSalesBillWhere(branchScope.ids) },
      })
      if (!scopedBill) {
        return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลขายที่ต้องการ' }, { status: 404 })
      }
      const result = await prisma.$transaction((tx) => runTradingSalesBillAllocationCorrection(tx, {
        actor,
        allocations: values.allocations,
        billRef,
        correctedAt,
        note: values.note,
      }))

      return NextResponse.json({ docNo: result.docNo, id: result.docNo, totalCost: result.totalCost })
    }

    if (action !== 'cancel') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รองรับเฉพาะ action cancel' }, { status: 400 })
    }
    const values = salesBillCancelSchema.parse(payload)
    const actor = currentActor(auth)
    const cancelledAt = new Date()
    const billRef = decodeURIComponent(id)
    const branchScope = await salesBranchScope(auth)

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.sales_bills.findFirst({
        select: {
          branch_id: true,
          date: true,
          doc_no: true,
          id: true,
          items: true,
          status: true,
          transaction_mode: true,
          vat_amount: true,
        },
        where: { doc_no: billRef, ...scopedSalesBillWhere(branchScope.ids) },
      })
      if (!bill) throw new Error('ไม่พบบิลขายที่ต้องการยกเลิก')
      if (!isSalesBillActiveForCancel(bill.status)) throw new Error('บิลขายนี้ถูกยกเลิกแล้ว')

      const activeReceiptCount = await activeSalesReceiptCount(tx, bill.id)
      if (activeReceiptCount > 0) {
        throw new Error('ยกเลิกบิลขายไม่ได้ เพราะมีรายการรับเงินแล้ว')
      }

      const convertedStockIssue = await tx.stock_issues.findFirst({
        select: { doc_no: true, id: true, status: true },
        where: {
          converted_to_bill_id: bill.id,
          status: 'converted',
        },
      })

      if (convertedStockIssue) {
        throw new Error(`บิลขายนี้อ้างอิง flow เบิกออกรอบิลเดิม (${convertedStockIssue.doc_no}) ซึ่งถูกยกเลิกแล้ว ต้องแก้ข้อมูล legacy ก่อนยกเลิก`)
      } else {
        const usageLogs = await tx.weight_ticket_usage_logs.findMany({
          where: {
            action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
            target_doc_no: bill.doc_no,
            target_type: 'SALES_BILL',
          },
        })
        if (usageLogs.length > 0) {
          await reopenConsumedWtoStockHoldsForSalesBill(tx, {
            actor,
            cancelDate: normalizeDate(cancelledAt.toISOString().slice(0, 10)),
            note: values.note,
            salesBillDocNo: bill.doc_no,
          })

          await appendWeightTicketUsageLogs(tx, usageLogs.map((log) => ({
            action: WEIGHT_TICKET_USAGE_ACTION.RELEASED_FROM_SALES_BILL,
            actor,
            allocatedDeductWeight: toNumber(log.allocated_deduct_weight),
            allocatedGrossWeight: toNumber(log.allocated_gross_weight),
            allocatedNetWeight: toNumber(log.allocated_net_weight),
            allocatedQty: toNumber(log.allocated_qty),
            createdAt: cancelledAt,
            meta: { reason: 'sales_bill_cancel', salesBillDocNo: bill.doc_no },
            note: values.note,
            productCodeSnapshot: log.product_code_snapshot,
            productId: log.product_id,
            productNameSnapshot: log.product_name_snapshot,
            targetDocNo: bill.doc_no,
            targetId: bill.id,
            targetLineNo: log.target_line_no,
            targetType: 'SALES_BILL' as const,
            weightTicketId: log.weight_ticket_id,
            weightTicketProductSummaryId: log.weight_ticket_product_summary_id ?? BigInt(0),
          })).filter((entry) => entry.weightTicketProductSummaryId !== BigInt(0)))

          const usageBySummaryId = new Map<bigint, number>()
          usageLogs.forEach((log) => {
            if (!log.weight_ticket_product_summary_id) return
            usageBySummaryId.set(log.weight_ticket_product_summary_id, (usageBySummaryId.get(log.weight_ticket_product_summary_id) ?? 0) + toNumber(log.allocated_net_weight))
          })
          await Promise.all([...usageBySummaryId.entries()].map(([summaryId, qty]) => tx.weight_ticket_product_summaries.update({
            data: {
              billed_weight: { decrement: qty },
              remaining_weight: { increment: qty },
              updated_at: cancelledAt,
            },
            where: { id: summaryId },
          })))

          const ticketIds = [...new Set(usageLogs.map((log) => log.weight_ticket_id))]
          await Promise.all(ticketIds.map(async (ticketId) => {
            const ticket = await tx.weight_tickets.findUnique({ select: { status: true }, where: { id: ticketId } })
            if (!ticket) return
            await tx.weight_tickets.update({
              data: {
                status: 'delivered',
                updated_at: cancelledAt,
                updated_by: actor,
              },
              where: { id: ticketId },
            })
            await appendWeightTicketStatusLog(tx, {
              action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
              actor,
              createdAt: cancelledAt,
              fromStatus: ticket.status,
              meta: { reason: 'sales_bill_cancel', salesBillDocNo: bill.doc_no },
              note: values.note,
              toStatus: 'delivered',
              weightTicketId: ticketId,
            })
          }))
        }
      }

      await reversePoSellUsage(tx, bill.items, actor, cancelledAt)

      await tx.trading_allocation_facts.updateMany({
        data: {
          notes: `Cancelled from Sales Bill ${bill.doc_no}: ${values.note}`,
          status: 'cancelled',
          updated_at: cancelledAt,
          updated_by: actor,
        },
        where: {
          sales_bill_id: bill.id,
          status: 'active',
        },
      })

      await Promise.all([
        tx.sales_bill_lines.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${values.note}`,
            status: 'cancelled',
            updated_at: cancelledAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
        tx.sales_bill_source_allocations.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${values.note}`,
            status: 'cancelled',
            updated_at: cancelledAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
        tx.sales_bill_po_sell_allocations.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${values.note}`,
            status: 'cancelled',
            updated_at: cancelledAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
        tx.sales_bill_customer_advance_allocations.updateMany({
          data: {
            notes: `Cancelled from Sales Bill ${bill.doc_no}: ${values.note}`,
            status: 'cancelled',
            updated_at: cancelledAt,
            updated_by: actor,
          },
          where: {
            sales_bill_id: bill.id,
            status: 'active',
          },
        }),
      ])

      const updated = await tx.sales_bills.update({
        data: {
          cancel_note: values.note,
          cancelled_at: cancelledAt,
          cancelled_by: actor,
          receivable_balance: 0,
          status: 'cancelled',
          updated_at: cancelledAt,
          updated_by: actor,
        },
        select: { doc_no: true, id: true },
        where: { id: bill.id },
      })
      await appendSalesBillStatusLog(tx, {
        action: SALES_BILL_STATUS_ACTION.CANCELLED,
        actor,
        createdAt: cancelledAt,
        fromStatus: bill.status,
        meta: { reason: 'sales_bill_cancel' },
        note: values.note,
        salesBillId: updated.id,
        toStatus: 'cancelled',
      })

      return updated
    })

    return NextResponse.json({ docNo: result.doc_no, id: result.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoStockHoldError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'ยกเลิกบิลขายไม่ได้', 400)
  }
}
