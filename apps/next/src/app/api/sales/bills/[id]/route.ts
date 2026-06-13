import { NextResponse } from 'next/server'
import { salesBillCancelSchema } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { appendSalesBillStatusLog, SALES_BILL_STATUS_ACTION } from '@/lib/server/sales-bill-history'
import { getSalesBillDetail } from '@/lib/server/sales-bill-detail'
import { activeSalesReceiptCount, isSalesBillActiveForCancel } from '@/lib/server/sales-bill-cancel-policy'
import { appendStockIssueStatusLog, STOCK_ISSUE_STATUS_ACTION } from '@/lib/server/stock-issue-history'
import { reopenConsumedWtoStockHoldsForSalesBill, reversePendingSaleStockIssue, WtoStockHoldError } from '@/lib/server/stock-holds'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION } from '@/lib/server/weight-ticket-usage-history'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const detail = await getSalesBillDetail(decodeURIComponent(id))
    if (!detail) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบบิลขายที่ต้องการ' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายละเอียดบิลขายไม่ได้', 500)
  }
}

function itemNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function poSellDocNoFromItem(record: Record<string, unknown>) {
  const value = record.poSellId
  return typeof value === 'string' ? value.trim() : ''
}

function productCodeFromItem(record: Record<string, unknown>) {
  const value = record.productCode ?? record.productId
  return typeof value === 'string' ? value.trim() : ''
}

function salesItemUnitPrice(record: Record<string, unknown>) {
  const explicitPrice = itemNumber(record, 'price')
  if (explicitPrice > 0) return explicitPrice
  return itemNumber(record, 'unitPrice')
}

function poSellStatusAfterReverse(status: string | null | undefined, nextRemainingQty: number) {
  if (nextRemainingQty <= 0.001) return status ?? 'Completed'
  const normalized = (status ?? '').trim().toLowerCase()
  if (['completed', 'closed', 'fully matched', 'received'].includes(normalized)) return 'Open'
  return status ?? 'Open'
}

type PoSellReverseLine = {
  productCode: string
  qty: number
}

function restorePoSellItems(items: unknown, lines: PoSellReverseLine[]) {
  if (!Array.isArray(items)) return null
  const nextItems = items.map((item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? { ...(item as Record<string, unknown>) }
      : item
  ))

  for (const line of lines) {
    if (line.qty <= 0) continue
    let remainingQtyToRestore = line.qty
    const candidates = nextItems.filter((item): item is Record<string, unknown> => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false
      const itemProductCode = productCodeFromItem(item)
      return !itemProductCode || itemProductCode === line.productCode
    })

    for (const candidate of candidates) {
      if (remainingQtyToRestore <= 0.001) break
      const currentRemainingQty = itemNumber(candidate, 'remainingQty')
      const originalQty = itemNumber(candidate, 'qty')
      const capacity = originalQty > 0 ? Math.max(0, originalQty - currentRemainingQty) : remainingQtyToRestore
      const qtyToRestore = Math.min(capacity, remainingQtyToRestore)
      if (qtyToRestore <= 0) continue
      candidate.remainingQty = currentRemainingQty + qtyToRestore
      remainingQtyToRestore -= qtyToRestore
    }
  }

  return nextItems as Prisma.InputJsonValue
}

async function reversePoSellUsage(tx: Prisma.TransactionClient, billItems: unknown, actor: string, cancelledAt: Date) {
  if (!Array.isArray(billItems)) return
  const usageByPoSellDocNo = new Map<string, { amount: number; lines: PoSellReverseLine[]; qty: number }>()
  billItems.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return
    const record = item as Record<string, unknown>
    const poSellDocNo = poSellDocNoFromItem(record)
    if (!poSellDocNo) return
    const qty = itemNumber(record, 'qty')
    const amount = qty * salesItemUnitPrice(record)
    const productCode = productCodeFromItem(record)
    const current = usageByPoSellDocNo.get(poSellDocNo) ?? { amount: 0, lines: [], qty: 0 }
    current.amount += amount
    current.qty += qty
    current.lines.push({ productCode, qty })
    usageByPoSellDocNo.set(poSellDocNo, current)
  })
  if (!usageByPoSellDocNo.size) return

  const poSells = await tx.po_sells.findMany({
    select: { cut_amount: true, doc_no: true, id: true, items: true, remaining_amount: true, remaining_qty: true, status: true },
    where: { doc_no: { in: [...usageByPoSellDocNo.keys()] } },
  })
  await Promise.all(poSells.map((poSell) => {
    const usage = usageByPoSellDocNo.get(poSell.doc_no)
    if (!usage) return Promise.resolve()
    const nextRemainingQty = toNumber(poSell.remaining_qty) + usage.qty
    const nextRemainingAmount = toNumber(poSell.remaining_amount) + usage.amount
    const nextItems = restorePoSellItems(poSell.items, usage.lines)
    return tx.po_sells.update({
      data: {
        cut_amount: Math.max(0, toNumber(poSell.cut_amount) - usage.amount),
        ...(nextItems ? { items: nextItems } : {}),
        remaining_amount: nextRemainingAmount,
        remaining_qty: nextRemainingQty,
        status: poSellStatusAfterReverse(poSell.status, nextRemainingQty),
        updated_at: cancelledAt,
        updated_by: actor,
      },
      where: { id: poSell.id },
    })
  }))
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const payload = await request.json()
    const action = typeof payload?.action === 'string' ? payload.action : 'cancel'
    if (action !== 'cancel') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รองรับเฉพาะ action cancel' }, { status: 400 })
    }
    const values = salesBillCancelSchema.parse(payload)
    const actor = currentActor(auth)
    const cancelledAt = new Date()
    const billRef = decodeURIComponent(id)

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
        },
        where: { doc_no: billRef },
      })
      if (!bill) throw new Error('ไม่พบบิลขายที่ต้องการยกเลิก')
      if (!isSalesBillActiveForCancel(bill.status)) throw new Error('บิลขายนี้ถูกยกเลิกแล้ว')

      const activeReceiptCount = await activeSalesReceiptCount(tx, bill.id)
      if (activeReceiptCount > 0) {
        throw new Error('ยกเลิกบิลขายไม่ได้ เพราะมีรายการรับเงินแล้ว')
      }

      if ((bill.transaction_mode ?? 'STOCK') === 'STOCK') {
        const convertedStockIssue = await tx.stock_issues.findFirst({
          select: { doc_no: true, id: true, status: true },
          where: {
            converted_to_bill_id: bill.id,
            status: 'converted',
          },
        })

        if (convertedStockIssue) {
          const holds = await reversePendingSaleStockIssue(tx, {
            actor,
            cancelDate: normalizeDate(cancelledAt.toISOString().slice(0, 10)),
            note: values.note,
            stockIssueDocNo: convertedStockIssue.doc_no,
          })
          const ticketIds = [...new Set(holds.map((hold) => hold.weight_ticket_id))]
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
              meta: { reason: 'sales_bill_cancel_from_pending_sale', salesBillDocNo: bill.doc_no, stockIssueDocNo: convertedStockIssue.doc_no },
              note: values.note,
              toStatus: 'delivered',
              weightTicketId: ticketId,
            })
          }))
          await tx.stock_issues.update({
            data: {
              notes: values.note,
              status: 'cancelled',
            },
            where: { id: convertedStockIssue.id },
          })
          await appendStockIssueStatusLog(tx, {
            action: STOCK_ISSUE_STATUS_ACTION.CANCELLED,
            actor,
            createdAt: cancelledAt,
            fromStatus: convertedStockIssue.status,
            meta: {
              reason: 'sales_bill_cancel_from_pending_sale',
              reverseRefType: 'PSALE-CANCEL',
              salesBillDocNo: bill.doc_no,
            },
            note: values.note,
            stockIssueId: convertedStockIssue.id,
            toStatus: 'cancelled',
          })
        } else {
          await reopenConsumedWtoStockHoldsForSalesBill(tx, {
            actor,
            cancelDate: normalizeDate(cancelledAt.toISOString().slice(0, 10)),
            note: values.note,
            salesBillDocNo: bill.doc_no,
          })

          const usageLogs = await tx.weight_ticket_usage_logs.findMany({
            where: {
              action: WEIGHT_TICKET_USAGE_ACTION.ALLOCATED_TO_SALES_BILL,
              target_doc_no: bill.doc_no,
              target_type: 'SALES_BILL',
            },
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
