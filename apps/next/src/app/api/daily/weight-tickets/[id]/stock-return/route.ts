import { NextResponse } from 'next/server'
import { wtoStockReturnSchema } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { appendSalesBillStatusLog, SALES_BILL_STATUS_ACTION } from '@/lib/server/sales-bill-history'
import { closeActiveWtoPendingOutForWtoReturn, WtoPendingOutError } from '@/lib/server/stock-holds'
import { appendAggregateWtoPendingOutEvent } from '@/lib/server/weight-ticket-pending-out-events'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import { appendWeightTicketUsageLogs, WEIGHT_TICKET_USAGE_ACTION, type WeightTicketUsageLogEntry } from '@/lib/server/weight-ticket-usage-history'
import { branchScopeIds } from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const ticketRef = decodeURIComponent(id)
    const values = wtoStockReturnSchema.parse(await request.json())
    const actor = currentActor(auth)
    const returnedAt = new Date()
    const returnDate = normalizeDate(returnedAt.toISOString().slice(0, 10))
    const scopedBranchIds = branchScopeIds(auth)

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.weight_tickets.findFirst({
        select: {
          doc_no: true,
          doc_type: true,
          id: true,
          status: true,
        },
        where: {
          doc_no: ticketRef,
          ...(scopedBranchIds.length ? { branches: { code: { in: scopedBranchIds } } } : {}),
        },
      })
      if (!ticket) throw new WtoPendingOutError('ไม่พบใบส่งของที่ต้องการรับคืน')
      if (ticket.doc_type !== 'WTO') {
        throw new WtoPendingOutError('รับของคืนได้เฉพาะเอกสาร WTO')
      }

      const allocations = await tx.sales_bill_source_allocations.findMany({
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        select: {
          product_id: true,
          sales_bills: {
            select: {
              channel_id: true,
              doc_no: true,
              id: true,
              status: true,
            },
          },
        },
        where: {
          source_doc_no: ticket.doc_no,
          source_type: 'WTO',
          status: 'active',
          weight_ticket_id: ticket.id,
        },
      })

      const holds = await tx.stock_holds.findMany({
        include: {
          products: { select: { code: true, id: true, name: true } },
          warehouses: { select: { code: true, name: true } },
        },
        orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
        where: {
          source_type: 'WTO',
          status: 'active',
          weight_ticket_id: ticket.id,
        },
      })

      const selectedGroupHolds = holds.filter((hold) => (
        String(hold.products.code ?? '').trim().toUpperCase() === values.productId.trim().toUpperCase()
        && String(hold.warehouses.code ?? '').trim().toUpperCase() === values.warehouseId.trim().toUpperCase()
      ))
      if (selectedGroupHolds.length === 0) {
        throw new WtoPendingOutError('ไม่พบ pending_out ของสินค้าและคลังที่เลือก กรุณาโหลดข้อมูลใหม่')
      }
      const firstHold = selectedGroupHolds[0]
      if (!firstHold) throw new WtoPendingOutError('ไม่พบ pending_out ของสินค้าและคลังที่เลือก กรุณาโหลดข้อมูลใหม่')

      const relatedBills = allocations
        .filter((allocation) => allocation.product_id === firstHold.product_id)
        .map((allocation) => allocation.sales_bills)
        .filter((bill) => !['cancelled', 'canceled'].includes(String(bill.status ?? '').toLowerCase()))
      const selectedSalesBill = values.salesBillDocNo
        ? relatedBills.find((bill) => bill.doc_no === values.salesBillDocNo)
        : relatedBills[0]
      if (!selectedSalesBill && relatedBills.length > 0) {
        throw new WtoPendingOutError('บิลขายอ้างอิงไม่ตรงกับ pending_out ของ WTO นี้')
      }
      if (relatedBills.length === 0) {
        throw new WtoPendingOutError('pending_out นี้ยังไม่มีบิลขายอ้างอิงที่ใช้งานอยู่')
      }

      const closed = await closeActiveWtoPendingOutForWtoReturn(tx, {
        actor,
        note: values.note,
        productCode: values.productId,
        reason: values.reason,
        returnDate,
        returnedQty: values.returnedQty,
        salesBillDocNo: selectedSalesBill?.doc_no ?? null,
        warehouseCode: values.warehouseId,
        weightTicketId: ticket.id,
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

      const usageEntries: WeightTicketUsageLogEntry[] = []
      if (closed.returnedQty > 0.0001) {
        usageEntries.push({
          action: WEIGHT_TICKET_USAGE_ACTION.RETURNED_FROM_WTO,
          actor,
          allocatedDeductWeight: 0,
          allocatedGrossWeight: closed.returnedQty,
          allocatedNetWeight: closed.returnedQty,
          allocatedQty: closed.returnedQty,
          createdAt: returnedAt,
          meta: {
            pendingOutKeys: closed.holdKeys,
            pendingQty: closed.pendingQty,
            reason: 'wto_stock_return',
            salesBillDocNo: selectedSalesBill?.doc_no ?? null,
            warehouseId: closed.warehouseCode,
          },
          note: values.note,
          productCodeSnapshot: closed.productCode,
          productId: closed.productId,
          productNameSnapshot: closed.productName,
          targetDocNo: selectedSalesBill?.doc_no ?? null,
          targetId: selectedSalesBill?.id ?? null,
          targetLineNo: null,
          targetType: 'SALES_BILL' as const,
          weightTicketId: closed.weightTicketId,
          weightTicketProductSummaryId: summary.id,
        })
      }
      if (closed.lossQty > 0.0001) {
        usageEntries.push({
          action: WEIGHT_TICKET_USAGE_ACTION.LOSS_FROM_WTO_RETURN,
          actor,
          allocatedDeductWeight: 0,
          allocatedGrossWeight: closed.lossQty,
          allocatedNetWeight: closed.lossQty,
          allocatedQty: closed.lossQty,
          createdAt: returnedAt,
          meta: {
            lossUnitCost: closed.lossUnitCost,
            lossValueOut: closed.lossValueOut,
            pendingOutKeys: closed.holdKeys,
            pendingQty: closed.pendingQty,
            reason: 'wto_stock_return_loss',
            salesBillDocNo: selectedSalesBill?.doc_no ?? null,
            warehouseId: closed.warehouseCode,
          },
          note: values.reason ?? values.note,
          productCodeSnapshot: closed.productCode,
          productId: closed.productId,
          productNameSnapshot: closed.productName,
          targetDocNo: selectedSalesBill?.doc_no ?? null,
          targetId: selectedSalesBill?.id ?? null,
          targetLineNo: null,
          targetType: 'SALES_BILL' as const,
          weightTicketId: closed.weightTicketId,
          weightTicketProductSummaryId: summary.id,
        })
      }
      await appendWeightTicketUsageLogs(tx, usageEntries)

      if (closed.returnedQty > 0.0001) {
        await appendAggregateWtoPendingOutEvent(tx, {
          actor,
          costSnapshotNote: values.note,
          costSnapshotSource: 'wto_return',
          eventType: 'wto_return',
          meta: {
            holdKeys: closed.holdKeys,
            pendingQty: closed.pendingQty,
            returnedQty: closed.returnedQty,
            salesBillDocNo: selectedSalesBill?.doc_no ?? null,
          },
          note: values.note,
          occurredAt: returnedAt,
          productCodeSnapshot: closed.productCode,
          productId: closed.productId,
          productNameSnapshot: closed.productName,
          qty: closed.returnedQty,
          qtyAfter: closed.lossQty > 0.0001 ? closed.lossQty : 0,
          qtyBefore: closed.pendingQty,
          referenceDocNo: closed.sourceDocNo,
          referenceDocType: 'WTO',
          statusSnapshot: 'released',
          unitCostSnapshot: closed.lossQty > 0.0001 ? closed.lossUnitCost : null,
          warehouseCodeSnapshot: closed.warehouseCode,
          warehouseId: closed.warehouseId,
          warehouseNameSnapshot: closed.warehouseName,
          weightTicketDocNo: closed.sourceDocNo,
          weightTicketId: closed.weightTicketId,
        })
      }
      if (closed.lossQty > 0.0001) {
        await appendAggregateWtoPendingOutEvent(tx, {
          actor,
          costSnapshotNote: values.reason ?? values.note,
          costSnapshotSource: 'wto_return_loss',
          eventType: 'wto_return_loss',
          meta: {
            holdKeys: closed.holdKeys,
            lossQty: closed.lossQty,
            lossValueOut: closed.lossValueOut,
            salesBillDocNo: selectedSalesBill?.doc_no ?? null,
          },
          note: values.reason ?? values.note,
          occurredAt: returnedAt,
          productCodeSnapshot: closed.productCode,
          productId: closed.productId,
          productNameSnapshot: closed.productName,
          qty: closed.lossQty,
          qtyAfter: 0,
          qtyBefore: closed.lossQty,
          referenceDocNo: closed.sourceDocNo,
          referenceDocType: 'WTO',
          statusSnapshot: 'released',
          unitCostSnapshot: closed.lossUnitCost,
          warehouseCodeSnapshot: closed.warehouseCode,
          warehouseId: closed.warehouseId,
          warehouseNameSnapshot: closed.warehouseName,
          weightTicketDocNo: closed.sourceDocNo,
          weightTicketId: closed.weightTicketId,
        })
      }

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
      if (ticket.status !== nextTicketStatus) {
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
            holdKeys: closed.holdKeys,
            lossQty: closed.lossQty,
            pendingQty: closed.pendingQty,
            reason: closed.lossQty > 0.0001 ? 'wto_stock_return_loss' : 'wto_stock_return',
            returnedQty: closed.returnedQty,
            salesBillDocNo: selectedSalesBill?.doc_no ?? null,
            warehouseId: closed.warehouseCode,
          },
          note: values.reason ?? values.note,
          toStatus: nextTicketStatus,
          weightTicketId: closed.weightTicketId,
        })
      }

      if (selectedSalesBill) {
        await appendSalesBillStatusLog(tx, {
          action: SALES_BILL_STATUS_ACTION.STATUS_SYNCED,
          actor,
          createdAt: returnedAt,
          fromStatus: selectedSalesBill.status,
          meta: {
            holdKeys: closed.holdKeys,
            lossQty: closed.lossQty,
            pendingQty: closed.pendingQty,
            reason: closed.lossQty > 0.0001 ? 'wto_stock_return_loss' : 'wto_stock_return',
            returnedQty: closed.returnedQty,
            wtoDocNo: closed.sourceDocNo,
          },
          note: values.reason ?? values.note ?? 'รับของคืนจาก WTO',
          salesBillId: selectedSalesBill.id,
          toStatus: selectedSalesBill.status ?? 'open',
        })
      }

      return {
        docNo: ticket.doc_no,
        lossQty: closed.lossQty,
        returnedQty: closed.returnedQty,
        salesBillDocNo: selectedSalesBill?.doc_no ?? null,
        wtoDocNo: closed.sourceDocNo,
      }
    })

    return NextResponse.json(result)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'รับของคืนจากใบส่งของไม่ได้', 400)
  }
}
